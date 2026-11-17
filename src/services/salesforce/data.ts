// Record queries and data changes (DML) against the user's own Salesforce org.
// Statements use a small SQL-like dialect on top of SOQL:
//   SELECT ...                                   (standard SOQL, run as-is)
//   UPDATE Obj SET A = 1, B = 'x' WHERE <soql> [LIMIT n]
//   DELETE FROM Obj WHERE <soql> [LIMIT n]
//   INSERT INTO Obj (A, B) VALUES (1, 'x'), (2, 'y')
//   UPSERT INTO Obj (ExtId__c, B) VALUES ('e1', 'x') ON ExtId__c

const API = '/services/data/v62.0'
export const MAX_DML_RECORDS = 2000
const BATCH = 200

export type Value = string | number | boolean | null
export type Statement =
  | { kind: 'select', soql: string }
  | { kind: 'update', object: string, set: Record<string, Value>, where: string, limit?: number }
  | { kind: 'delete', object: string, where: string, limit?: number }
  | { kind: 'insert', object: string, columns: string[], rows: Value[][] }
  | { kind: 'upsert', object: string, columns: string[], rows: Value[][], externalId: string }

export class SessionExpiredError extends Error {
  constructor() { super('TOKEN_EXPIRED') }
}

// ---------- Parsing ----------

const IDENT = /^[A-Za-z][A-Za-z0-9_]*$/

function ident(name: string, what: string): string {
  const n = name.trim()
  if (!IDENT.test(n)) throw new Error(`Invalid ${what} name: "${n}"`)
  return n
}

// Split on commas that are not inside quotes or parentheses.
function splitTop(s: string): string[] {
  const out: string[] = []
  let depth = 0, quote = '', cur = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quote) {
      cur += c
      if (c === '\\' && i + 1 < s.length) { cur += s[++i]; continue }
      if (c === quote) quote = ''
      continue
    }
    if (c === "'" || c === '"') { quote = c; cur += c; continue }
    if (c === '(') depth++
    if (c === ')') depth--
    if (c === ',' && depth === 0) { out.push(cur); cur = ''; continue }
    cur += c
  }
  if (quote) throw new Error('A quoted value is missing its closing quote.')
  if (cur.trim() || out.length) out.push(cur)
  return out.map(x => x.trim())
}

export function parseValue(raw: string): Value {
  const v = raw.trim()
  if (!v) throw new Error('A value is empty.')
  const q = v[0]
  if ((q === "'" || q === '"') && v.endsWith(q) && v.length >= 2) {
    let body = v.slice(1, -1).replace(/\\(.)/g, (_, ch) => (ch === 'n' ? '\n' : ch === q ? '\uE000' : ch))
    if (q === "'") body = body.replace(/''/g, "'")
    return body.replace(/\uE000/g, q)
  }
  if (/^null$/i.test(v)) return null
  if (/^true$/i.test(v)) return true
  if (/^false$/i.test(v)) return false
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v)
  // Dates and datetimes may be written without quotes.
  if (/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(v)) return v
  throw new Error(`Can't read the value ${v}. Put text in single quotes, for example 'Closed'.`)
}

function parseTuples(s: string): string[][] {
  const tuples = splitTop(s)
  return tuples.map(t => {
    const m = /^\(([\s\S]*)\)$/.exec(t.trim())
    if (!m) throw new Error('Each row in VALUES must be in parentheses, for example (\'Acme\', 10).')
    return splitTop(m[1])
  })
}

export function parseStatement(input: string): Statement {
  const text = input.trim().replace(/;\s*$/, '').trim()
  if (!text) throw new Error('Type a query or statement first.')
  const word = text.split(/\s+/)[0].toUpperCase()

  if (word === 'SELECT') return { kind: 'select', soql: text }

  if (word === 'UPDATE') {
    const m = /^UPDATE\s+(\S+)\s+SET\s+([\s\S]+?)\s+WHERE\s+([\s\S]+?)(?:\s+LIMIT\s+(\d+))?$/i.exec(text)
    if (!m) throw new Error('UPDATE needs a WHERE clause: UPDATE Object SET Field = value WHERE condition. To update every record, write WHERE Id != null.')
    const set: Record<string, Value> = {}
    for (const part of splitTop(m[2])) {
      const eq = part.indexOf('=')
      if (eq < 1) throw new Error(`Can't read "${part}". Use Field = value.`)
      const field = ident(part.slice(0, eq), 'field')
      if (field.toLowerCase() === 'id') throw new Error('The Id field cannot be changed.')
      set[field] = parseValue(part.slice(eq + 1))
    }
    return { kind: 'update', object: ident(m[1], 'object'), set, where: m[3], limit: m[4] ? Number(m[4]) : undefined }
  }

  if (word === 'DELETE') {
    const m = /^DELETE\s+FROM\s+(\S+)\s+WHERE\s+([\s\S]+?)(?:\s+LIMIT\s+(\d+))?$/i.exec(text)
    if (!m) throw new Error('DELETE needs a WHERE clause: DELETE FROM Object WHERE condition. To delete every record, write WHERE Id != null.')
    return { kind: 'delete', object: ident(m[1], 'object'), where: m[2], limit: m[3] ? Number(m[3]) : undefined }
  }

  if (word === 'INSERT' || word === 'UPSERT') {
    const re = word === 'INSERT'
      ? /^INSERT\s+INTO\s+(\S+)\s*\(([^)]*)\)\s*VALUES\s*([\s\S]+)$/i
      : /^UPSERT\s+INTO\s+(\S+)\s*\(([^)]*)\)\s*VALUES\s*([\s\S]+?)\s+ON\s+(\S+)$/i
    const m = re.exec(text)
    if (!m) {
      throw new Error(word === 'INSERT'
        ? "Use: INSERT INTO Object (Field1, Field2) VALUES ('a', 1), ('b', 2)"
        : "Use: UPSERT INTO Object (ExternalId__c, Field2) VALUES ('e1', 1) ON ExternalId__c")
    }
    const columns = splitTop(m[2]).map(c => ident(c, 'field'))
    if (!columns.length) throw new Error('List at least one field.')
    const rows = parseTuples(m[3]).map((t, i) => {
      if (t.length !== columns.length) throw new Error(`Row ${i + 1} has ${t.length} values but ${columns.length} fields are listed.`)
      return t.map(parseValue)
    })
    if (word === 'INSERT') return { kind: 'insert', object: ident(m[1], 'object'), columns, rows }
    const externalId = ident(m[4], 'field')
    if (!columns.some(c => c.toLowerCase() === externalId.toLowerCase())) {
      throw new Error(`The ON field ${externalId} must be one of the listed fields.`)
    }
    return { kind: 'upsert', object: ident(m[1], 'object'), columns, rows, externalId }
  }

  throw new Error('Start with SELECT, UPDATE, DELETE, INSERT or UPSERT.')
}

// ---------- Salesforce calls ----------

async function sf(instanceUrl: string, token: string, path: string, init: RequestInit = {}): Promise<any> {
  const r = await fetch(instanceUrl + API + path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  })
  if (r.status === 401) throw new SessionExpiredError()
  const text = await r.text()
  const data = text ? JSON.parse(text) : null
  if (!r.ok) {
    const err = Array.isArray(data) ? data[0] : data
    throw new Error(err?.message || `Salesforce error ${r.status}`)
  }
  return data
}

export interface QueryPage { records: any[], totalSize: number, done: boolean, nextRecordsUrl?: string }

export async function runQuery(instanceUrl: string, token: string, soql: string): Promise<QueryPage> {
  return sf(instanceUrl, token, '/query?q=' + encodeURIComponent(soql))
}

export async function queryMore(instanceUrl: string, token: string, nextRecordsUrl: string): Promise<QueryPage> {
  const path = nextRecordsUrl.replace(/^\/services\/data\/v[\d.]+/, '')
  if (!path.startsWith('/query/')) throw new Error('Unexpected next page address.')
  return sf(instanceUrl, token, path)
}

export interface OrgInfo { name: string, type: string, isSandbox: boolean, isProduction: boolean }

export async function getOrgInfo(instanceUrl: string, token: string): Promise<OrgInfo> {
  const r = await runQuery(instanceUrl, token, 'SELECT Name, OrganizationType, IsSandbox FROM Organization LIMIT 1')
  const o = r.records[0] || {}
  const isSandbox = !!o.IsSandbox
  const type = o.OrganizationType || 'Unknown'
  return { name: o.Name || '', type, isSandbox, isProduction: !isSandbox && type !== 'Developer Edition' }
}

export interface FieldInfo {
  name: string, label: string, type: string,
  picklistValues?: { value: string, active: boolean }[],
  updateable?: boolean, createable?: boolean, nillable?: boolean, defaultedOnCreate?: boolean,
  externalId?: boolean, idLookup?: boolean, calculated?: boolean,
}

export async function describeObject(instanceUrl: string, token: string, object: string): Promise<FieldInfo[]> {
  const d = await sf(instanceUrl, token, `/sobjects/${encodeURIComponent(object)}/describe/`)
  return d.fields || []
}

// Turns nested query results (Account.Owner.Name, child subqueries) into flat rows.
export function flattenRecord(rec: any, prefix = '', out: Record<string, any> = {}): Record<string, any> {
  for (const [k, v] of Object.entries(rec || {})) {
    if (k === 'attributes') continue
    const key = prefix + k
    if (v && typeof v === 'object' && Array.isArray((v as any).records)) out[key] = `[${(v as any).totalSize ?? (v as any).records.length} records]`
    else if (v && typeof v === 'object' && !Array.isArray(v)) flattenRecord(v, key + '.', out)
    else out[key] = v
  }
  return out
}

export function toCsv(rows: Record<string, any>[], columns: string[]): string {
  const cell = (v: any) => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  return [columns.map(cell).join(','), ...rows.map(r => columns.map(c => cell(r[c])).join(','))].join('\r\n')
}

// ---------- Preview and execution ----------

export interface DmlPreview {
  statement: Statement
  count: number
  overLimit: boolean
  columns: string[]
  rows: Record<string, any>[]   // what the user sees before confirming
  targetIds: string[]           // UPDATE/DELETE: records that will change
}

export async function previewDml(instanceUrl: string, token: string, st: Statement): Promise<DmlPreview> {
  if (st.kind === 'select') throw new Error('Not a data change.')
  if (st.kind === 'insert' || st.kind === 'upsert') {
    const rows = st.rows.map(r => Object.fromEntries(st.columns.map((c, i) => [c, r[i]])))
    return { statement: st, count: rows.length, overLimit: rows.length > MAX_DML_RECORDS, columns: st.columns, rows, targetIds: [] }
  }
  const setFields = st.kind === 'update' ? Object.keys(st.set) : []
  const extra = ['Name'].filter(n => !setFields.some(f => f.toLowerCase() === n.toLowerCase()))
  const limit = Math.min(st.limit ?? MAX_DML_RECORDS + 1, MAX_DML_RECORDS + 1)
  const pick = async (fields: string[]) => {
    const soql = `SELECT ${['Id', ...fields].join(', ')} FROM ${st.object} WHERE ${st.where} LIMIT ${limit}`
    const all: any[] = []
    let page = await runQuery(instanceUrl, token, soql)
    all.push(...page.records)
    while (!page.done && page.nextRecordsUrl && all.length < limit) {
      page = await queryMore(instanceUrl, token, page.nextRecordsUrl)
      all.push(...page.records)
    }
    return all
  }
  let records: any[]
  try {
    records = await pick([...extra, ...setFields])
  } catch (e) {
    // Some objects have no Name field; retry without it.
    if (!/Name/.test((e as Error).message) || !extra.length) throw e
    records = await pick(setFields)
  }
  const overLimit = records.length > MAX_DML_RECORDS
  records = records.slice(0, MAX_DML_RECORDS)
  const rows = records.map(r => {
    const flat = flattenRecord(r)
    if (st.kind === 'update') {
      for (const [f, v] of Object.entries(st.set)) {
        const cur = Object.keys(flat).find(k => k.toLowerCase() === f.toLowerCase()) || f
        flat[cur] = `${flat[cur] ?? '(empty)'} → ${v ?? '(empty)'}`
      }
    }
    return flat
  })
  const columns = rows.length ? Object.keys(rows[0]) : ['Id', ...extra, ...setFields]
  return { statement: st, count: records.length, overLimit, columns, rows, targetIds: records.map(r => r.Id) }
}

export interface DmlResult { succeeded: number, failed: number, created: number, errors: { row: string, message: string }[] }

function chunk<T>(arr: T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += BATCH) out.push(arr.slice(i, i + BATCH))
  return out
}

export async function executeDml(instanceUrl: string, token: string, p: DmlPreview, onProgress?: (done: number) => void): Promise<DmlResult> {
  const st = p.statement
  const res: DmlResult = { succeeded: 0, failed: 0, created: 0, errors: [] }
  if (p.overLimit) throw new Error(`More than ${MAX_DML_RECORDS} records. Narrow the WHERE clause or add a LIMIT.`)
  let done = 0
  const collect = (results: any[], labels: string[]) => {
    results.forEach((r, i) => {
      if (r.success) { res.succeeded++; if (r.created) res.created++ }
      else { res.failed++; res.errors.push({ row: labels[i], message: (r.errors || []).map((e: any) => e.message).join('; ') || 'Failed' }) }
    })
    done += results.length
    onProgress?.(done)
  }

  if (st.kind === 'delete') {
    for (const ids of chunk(p.targetIds)) {
      const r = await sf(instanceUrl, token, `/composite/sobjects?allOrNone=false&ids=${ids.join(',')}`, { method: 'DELETE' })
      collect(r, ids)
    }
  } else if (st.kind === 'update') {
    for (const ids of chunk(p.targetIds)) {
      const records = ids.map(id => ({ attributes: { type: st.object }, id, ...st.set }))
      const r = await sf(instanceUrl, token, '/composite/sobjects', { method: 'PATCH', body: JSON.stringify({ allOrNone: false, records }) })
      collect(r, ids)
    }
  } else if (st.kind === 'insert' || st.kind === 'upsert') {
    const records = st.rows.map(row => ({ attributes: { type: st.object }, ...Object.fromEntries(st.columns.map((c, i) => [c, row[i]])) }))
    const labels = st.rows.map((_, i) => `Row ${i + 1}`)
    const path = st.kind === 'insert'
      ? '/composite/sobjects'
      : `/composite/sobjects/${encodeURIComponent(st.object)}/${encodeURIComponent(st.externalId)}`
    let offset = 0
    for (const batch of chunk(records)) {
      const r = await sf(instanceUrl, token, path, { method: st.kind === 'insert' ? 'POST' : 'PATCH', body: JSON.stringify({ allOrNone: false, records: batch }) })
      collect(r, labels.slice(offset, offset + batch.length))
      offset += batch.length
    }
    if (st.kind === 'insert') res.created = res.succeeded
  }
  return res
}

// ---------- Helpers for the Insert / Update / Delete / Upsert forms ----------

// Parses CSV text (header row first). Handles quoted values, commas and line breaks inside quotes.
export function parseCsv(text: string): { header: string[], rows: string[][] } {
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  const src = text.replace(/\r\n?/g, '\n')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"' && cell === '') quoted = true
    else if (c === ',' || c === '\t') { row.push(cell); cell = '' }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else cell += c
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  const clean = rows.filter(r => r.some(v => v.trim() !== ''))
  if (!clean.length) throw new Error('Paste CSV with a header row of field API names, for example: FirstName,LastName')
  return { header: clean[0].map(h => h.trim()), rows: clean.slice(1) }
}

// Converts form or CSV text into the right type for the field.
export function coerce(raw: string, field?: FieldInfo): Value {
  const v = raw.trim()
  if (v === '') return null
  const t = field?.type
  if (t === 'boolean') {
    if (/^(true|yes|1)$/i.test(v)) return true
    if (/^(false|no|0)$/i.test(v)) return false
    throw new Error(`${field!.name} needs true or false, not "${v}".`)
  }
  if (t === 'int' || t === 'double' || t === 'currency' || t === 'percent') {
    const n = Number(v.replace(/,/g, ''))
    if (Number.isNaN(n)) throw new Error(`${field!.name} needs a number, not "${v}".`)
    return n
  }
  return v
}

export function idsToWhere(text: string): string {
  const ids = text.split(/[\s,;]+/).map(x => x.trim()).filter(Boolean)
  if (!ids.length) throw new Error('Paste at least one record Id.')
  const bad = ids.find(id => !/^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/.test(id))
  if (bad) throw new Error(`"${bad}" is not a Salesforce record Id.`)
  if (ids.length > MAX_DML_RECORDS) throw new Error(`Up to ${MAX_DML_RECORDS} Ids at a time.`)
  return `Id IN (${ids.map(id => `'${id}'`).join(', ')})`
}
