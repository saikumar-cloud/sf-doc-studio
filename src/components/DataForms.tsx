import { useEffect, useState } from 'react'
import {
  describeObject, parseCsv, coerce, idsToWhere, SessionExpiredError, MAX_DML_RECORDS,
  type FieldInfo, type Statement, type Value,
} from '../services/salesforce/data'
import type { SFObject } from '../services/salesforce/metadata'

export type DataTab = 'insert' | 'update' | 'delete' | 'upsert'

interface Props {
  tab: DataTab
  instanceUrl: string
  accessToken: string
  objects: SFObject[]
  busy: boolean
  onPreview: (st: Statement) => void
  onReset: () => void
  onExpired: () => void
}

const card = { background: '#161b22', border: '1px solid #21262d', borderRadius: '8px', padding: '10px 12px', marginBottom: '10px', textAlign: 'left' as const }
const label = { fontSize: '11px', fontWeight: 700, color: '#8b949e', marginBottom: '6px' } as const
const input = { width: '100%', boxSizing: 'border-box' as const, background: '#0d1117', border: '1px solid #30363d', borderRadius: '6px', color: '#fff', fontSize: '12px', padding: '7px 8px', outline: 'none', fontFamily: 'inherit' }
const mono = { ...input, fontFamily: 'ui-monospace, Menlo, monospace', color: '#79c0ff' }
const pill = (on: boolean) => ({ flex: 1, padding: '6px', borderRadius: '6px', border: 'none', fontSize: '11px', cursor: 'pointer', background: on ? '#1f6feb' : '#21262d', color: on ? '#fff' : '#8b949e', fontWeight: on ? 600 : 400 })

const fieldCache = new Map<string, FieldInfo[]>()

const INTRO: Record<DataTab, string> = {
  insert: 'Create new records.',
  update: 'Change field values on existing records.',
  delete: 'Delete records. They go to the Recycle Bin.',
  upsert: 'Update records that match an external Id, and create the ones that don\'t exist yet.',
}

function ObjectPicker({ objects, value, onChange }: { objects: SFObject[], value: string, onChange: (name: string) => void }) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  const resolve = (t: string) => {
    const q = t.trim().toLowerCase()
    const hit = objects.find(o => o.name.toLowerCase() === q) || objects.find(o => o.label.toLowerCase() === q)
    onChange(hit ? hit.name : '')
  }
  return (
    <>
      <input
        list="sfds-objects"
        value={text}
        onChange={e => { setText(e.target.value); resolve(e.target.value) }}
        placeholder="Type an object, e.g. Account or Batch_Job_Log__c"
        style={input}
      />
      <datalist id="sfds-objects">
        {objects.map(o => <option key={o.name} value={o.name}>{o.label}</option>)}
      </datalist>
    </>
  )
}

function ValueInput({ field, value, onChange }: { field?: FieldInfo, value: string, onChange: (v: string) => void }) {
  if (field?.type === 'boolean') {
    return (
      <select value={value} onChange={e => onChange(e.target.value)} style={input}>
        <option value="">(empty)</option><option value="true">true</option><option value="false">false</option>
      </select>
    )
  }
  if (field?.type === 'picklist' && field.picklistValues?.length) {
    return (
      <select value={value} onChange={e => onChange(e.target.value)} style={input}>
        <option value="">(empty)</option>
        {field.picklistValues.filter(p => p.active).map(p => <option key={p.value} value={p.value}>{p.value}</option>)}
      </select>
    )
  }
  const type = field?.type === 'date' ? 'date' : 'text'
  return <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={field?.type === 'datetime' ? '2026-01-31T09:00:00Z' : ''} style={input} />
}

function FieldRows({ fields, rows, setRows, hint }: { fields: FieldInfo[], rows: { field: string, value: string }[], setRows: (r: { field: string, value: string }[]) => void, hint: string }) {
  const byName = new Map(fields.map(f => [f.name, f]))
  return (
    <div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: '4px', marginBottom: '4px', alignItems: 'center' }}>
          <select value={r.field} onChange={e => setRows(rows.map((x, j) => j === i ? { field: e.target.value, value: '' } : x))} style={{ ...input, flex: '0 0 45%' }}>
            <option value="">Choose field</option>
            {fields.map(f => <option key={f.name} value={f.name}>{f.label} ({f.name})</option>)}
          </select>
          <div style={{ flex: 1 }}>
            <ValueInput field={byName.get(r.field)} value={r.value} onChange={v => setRows(rows.map((x, j) => j === i ? { ...x, value: v } : x))} />
          </div>
          <button onClick={() => setRows(rows.filter((_, j) => j !== i))} title="Remove" style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: '14px' }}>×</button>
        </div>
      ))}
      <button onClick={() => setRows([...rows, { field: '', value: '' }])} style={{ background: 'none', border: '1px dashed #30363d', borderRadius: '6px', color: '#58a6ff', cursor: 'pointer', fontSize: '11px', padding: '5px 8px', width: '100%' }}>+ Add field</button>
      <div style={{ fontSize: '10px', color: '#484f58', marginTop: '4px' }}>{hint}</div>
    </div>
  )
}

function TargetPicker({ mode, setMode, where, setWhere, ids, setIds, verb }: {
  mode: 'where' | 'ids', setMode: (m: 'where' | 'ids') => void,
  where: string, setWhere: (s: string) => void, ids: string, setIds: (s: string) => void, verb: string,
}) {
  return (
    <div>
      <div style={label}>WHICH RECORDS TO {verb.toUpperCase()}</div>
      <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
        <button onClick={() => setMode('where')} style={pill(mode === 'where')}>Matching a condition</button>
        <button onClick={() => setMode('ids')} style={pill(mode === 'ids')}>These record Ids</button>
      </div>
      {mode === 'where'
        ? <textarea value={where} onChange={e => setWhere(e.target.value)} rows={2} spellCheck={false} placeholder="SOQL condition, e.g. Status = 'New' AND CreatedDate < LAST_N_DAYS:30" style={mono} />
        : <textarea value={ids} onChange={e => setIds(e.target.value)} rows={3} spellCheck={false} placeholder="Paste record Ids, one per line or separated by commas" style={mono} />}
    </div>
  )
}

export default function DataForms({ tab, instanceUrl, accessToken, objects, busy, onPreview, onReset, onExpired }: Props) {
  const [object, setObject] = useState('')
  const [fields, setFields] = useState<FieldInfo[]>([])
  const [loadingFields, setLoadingFields] = useState(false)
  const [error, setError] = useState('')

  const [insertMode, setInsertMode] = useState<'single' | 'csv'>('single')
  const [rows, setRows] = useState<{ field: string, value: string }[]>([])
  const [csv, setCsv] = useState('')
  const [targetMode, setTargetMode] = useState<'where' | 'ids'>('where')
  const [where, setWhere] = useState('')
  const [ids, setIds] = useState('')
  const [extId, setExtId] = useState('')

  useEffect(() => { setError(''); setRows([]) }, [tab])

  useEffect(() => {
    setFields([]); setExtId(''); setError('')
    if (!object) return
    const cached = fieldCache.get(object)
    const apply = (f: FieldInfo[]) => {
      setFields(f)
      if (tab === 'insert') {
        // Start with the fields Salesforce requires on create.
        setRows(f.filter(x => x.createable && !x.nillable && !x.defaultedOnCreate && x.type !== 'boolean').map(x => ({ field: x.name, value: '' })))
      } else setRows([{ field: '', value: '' }])
    }
    if (cached) { apply(cached); return }
    setLoadingFields(true)
    describeObject(instanceUrl, accessToken, object)
      .then(f => { fieldCache.set(object, f); apply(f) })
      .catch(e => { if (e instanceof SessionExpiredError) onExpired(); else setError(e.message) })
      .finally(() => setLoadingFields(false))
  }, [object, tab])

  const byName = new Map(fields.map(f => [f.name.toLowerCase(), f]))
  const writable = fields.filter(f => (tab === 'update' ? f.updateable : f.createable) && !f.calculated)
  const extIdFields = fields.filter(f => f.externalId || f.name === 'Id')

  const fromCsv = (requireCol?: string): { columns: string[], rows: Value[][] } => {
    const { header, rows: raw } = parseCsv(csv)
    const unknown = header.filter(h => !byName.has(h.toLowerCase()))
    if (unknown.length) throw new Error(`Unknown field${unknown.length > 1 ? 's' : ''} for ${object}: ${unknown.join(', ')}. Use API names in the header row.`)
    const cols = header.map(h => byName.get(h.toLowerCase())!)
    if (requireCol && !cols.some(c => c.name === requireCol)) throw new Error(`The CSV must include the ${requireCol} column.`)
    if (!raw.length) throw new Error('The CSV has a header but no data rows.')
    if (raw.length > MAX_DML_RECORDS) throw new Error(`Up to ${MAX_DML_RECORDS} rows at a time.`)
    return {
      columns: cols.map(c => c.name),
      rows: raw.map((r, i) => {
        if (r.length !== cols.length) throw new Error(`CSV row ${i + 1} has ${r.length} values but the header has ${cols.length}.`)
        return r.map((v, j) => coerce(v, cols[j]))
      }),
    }
  }

  const submit = () => {
    setError('')
    onReset() // never leave an older preview on screen next to a new attempt
    try {
      if (!object) throw new Error('Choose an object first.')
      let st: Statement
      if (tab === 'insert') {
        if (insertMode === 'csv') {
          const { columns, rows: data } = fromCsv()
          st = { kind: 'insert', object, columns, rows: data }
        } else {
          const filled = rows.filter(r => r.field && r.value.trim() !== '')
          if (!filled.length) throw new Error('Fill in at least one field.')
          st = { kind: 'insert', object, columns: filled.map(r => r.field), rows: [filled.map(r => coerce(r.value, byName.get(r.field.toLowerCase())))] }
        }
      } else if (tab === 'upsert') {
        if (!extId) throw new Error('Choose the external Id field used to match records.')
        const { columns, rows: data } = fromCsv(extId)
        st = { kind: 'upsert', object, columns, rows: data, externalId: extId }
      } else {
        const cond = targetMode === 'ids' ? idsToWhere(ids) : where.trim()
        if (!cond) throw new Error('Enter a condition, or switch to record Ids. To include every record, use: Id != null')
        if (tab === 'delete') st = { kind: 'delete', object, where: cond }
        else {
          const set: Record<string, Value> = {}
          for (const r of rows.filter(r => r.field)) set[r.field] = coerce(r.value, byName.get(r.field.toLowerCase()))
          if (!Object.keys(set).length) throw new Error('Choose at least one field to change.')
          st = { kind: 'update', object, set, where: cond }
        }
      }
      onPreview(st)
    } catch (e) { setError((e as Error).message) }
  }

  const csvPlaceholder = tab === 'upsert'
    ? `${extId || 'External_Id__c'},Name\nA-001,Acme\nA-002,Globex`
    : 'FirstName,LastName,Email\nAda,Lovelace,ada@example.com\nAlan,Turing,alan@example.com'

  return (
    <div>
      <div style={card}>
        <div style={{ fontSize: '12px', color: '#8b949e', marginBottom: '8px' }}>{INTRO[tab]}</div>
        <div style={label}>OBJECT</div>
        <ObjectPicker objects={objects} value={object} onChange={setObject} />
        {loadingFields && <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '6px' }}>Loading fields...</div>}
      </div>

      {object && fields.length > 0 && (
        <div style={card}>
          {tab === 'insert' && (
            <>
              <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                <button onClick={() => setInsertMode('single')} style={pill(insertMode === 'single')}>One record</button>
                <button onClick={() => setInsertMode('csv')} style={pill(insertMode === 'csv')}>Many records (CSV)</button>
              </div>
              {insertMode === 'single'
                ? <FieldRows fields={writable} rows={rows} setRows={setRows} hint="Required fields are added for you. Empty fields are left out." />
                : <textarea value={csv} onChange={e => setCsv(e.target.value)} rows={6} spellCheck={false} placeholder={csvPlaceholder} style={mono} />}
            </>
          )}

          {tab === 'update' && (
            <>
              <div style={label}>NEW VALUES</div>
              <FieldRows fields={writable} rows={rows} setRows={setRows} hint="Leave a value empty to clear that field." />
              <div style={{ height: '10px' }} />
              <TargetPicker mode={targetMode} setMode={setTargetMode} where={where} setWhere={setWhere} ids={ids} setIds={setIds} verb="update" />
            </>
          )}

          {tab === 'delete' && (
            <TargetPicker mode={targetMode} setMode={setTargetMode} where={where} setWhere={setWhere} ids={ids} setIds={setIds} verb="delete" />
          )}

          {tab === 'upsert' && (
            <>
              <div style={label}>MATCH RECORDS ON</div>
              <select value={extId} onChange={e => setExtId(e.target.value)} style={{ ...input, marginBottom: '8px' }}>
                <option value="">Choose external Id field</option>
                {extIdFields.map(f => <option key={f.name} value={f.name}>{f.label} ({f.name})</option>)}
              </select>
              {extIdFields.length <= 1 && <div style={{ fontSize: '10px', color: '#e3b341', marginBottom: '6px' }}>This object has no external Id fields, so only the record Id can be used to match.</div>}
              <div style={label}>RECORDS (CSV WITH HEADER ROW)</div>
              <textarea value={csv} onChange={e => setCsv(e.target.value)} rows={6} spellCheck={false} placeholder={csvPlaceholder} style={mono} />
            </>
          )}

          <button onClick={submit} disabled={busy} style={{ width: '100%', marginTop: '10px', padding: '9px', borderRadius: '6px', border: 'none', fontSize: '12px', fontWeight: 600, color: '#fff', cursor: busy ? 'not-allowed' : 'pointer', background: busy ? '#21262d' : 'linear-gradient(135deg, #e3b341, #9e6a03)' }}>
            {busy ? 'Checking...' : 'Preview changes'}
          </button>
          <div style={{ fontSize: '10px', color: '#484f58', marginTop: '4px' }}>Nothing changes until you review the preview and confirm.</div>
        </div>
      )}

      {error && <div style={{ ...card, borderColor: '#cf222e66', color: '#ff7b72', fontSize: '12px' }}>⚠️ {error}</div>}
    </div>
  )
}
