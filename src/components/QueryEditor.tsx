import { useEffect, useMemo, useState } from 'react'
import {
  parseStatement, runQuery, queryMore, getOrgInfo, previewDml, executeDml, flattenRecord, toCsv,
  SessionExpiredError, MAX_DML_RECORDS, type OrgInfo, type DmlPreview, type DmlResult, type QueryPage,
} from '../services/salesforce/data'
import { naturalLanguageToStatement } from '../services/salesforce/nl'
import { aiErrorText } from '../services/ai'
import type { SFObject } from '../services/salesforce/metadata'
import AIText from './AIText'

interface Props {
  instanceUrl: string
  accessToken: string
  apiKey: string
  objects: SFObject[]
  contextObject?: string
  onBack: () => void
  onExpired: () => void
}

const EXAMPLES = [
  'SELECT Id, Name, Industry FROM Account ORDER BY CreatedDate DESC LIMIT 20',
  "UPDATE Case SET Priority = 'High' WHERE Status = 'New' AND CreatedDate < LAST_N_DAYS:7",
  "INSERT INTO Contact (FirstName, LastName, Email) VALUES ('Ada', 'Lovelace', 'ada@example.com')",
  "DELETE FROM Task WHERE Status = 'Completed' AND ActivityDate < LAST_N_DAYS:365",
]

const VERB: Record<string, string> = { update: 'update', delete: 'delete', insert: 'insert', upsert: 'upsert' }

const box = { background: '#161b22', border: '1px solid #21262d', borderRadius: '8px', padding: '10px 12px', marginBottom: '10px', textAlign: 'left' as const }
const btn = (bg: string, disabled = false) => ({
  padding: '8px 12px', borderRadius: '6px', border: 'none', fontSize: '12px', fontWeight: 600,
  color: '#fff', background: disabled ? '#21262d' : bg, cursor: disabled ? 'not-allowed' : 'pointer',
})

function columnsOf(rows: Record<string, any>[]): string[] {
  const cols: string[] = []
  for (const r of rows.slice(0, 100)) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k)
  // An empty lookup (Owner: null) shouldn't add a column next to Owner.Name.
  return cols.filter(c => !cols.some(o => o.startsWith(c + '.')))
}

function Table({ columns, rows, instanceUrl }: { columns: string[], rows: Record<string, any>[], instanceUrl: string }) {
  return (
    <div style={{ overflow: 'auto', maxHeight: '320px', border: '1px solid #21262d', borderRadius: '6px' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: '11px', width: 'max-content', minWidth: '100%', textAlign: 'left' }}>
        <thead>
          <tr>
            {columns.map(c => (
              <th key={c} style={{ position: 'sticky', top: 0, background: '#0d1117', color: '#8b949e', padding: '6px 8px', borderBottom: '1px solid #30363d', fontWeight: 600, whiteSpace: 'nowrap' }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ background: i % 2 ? '#0f1117' : '#161b22' }}>
              {columns.map(c => {
                const v = r[c]
                const text = v === null || v === undefined ? '' : String(v)
                const isId = c === 'Id' && /^[a-zA-Z0-9]{15,18}$/.test(text)
                return (
                  <td key={c} title={text} style={{ padding: '5px 8px', borderBottom: '1px solid #21262d', color: '#e6edf3', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {isId
                      ? <a href="#" onClick={e => { e.preventDefault(); chrome.tabs.create({ url: `${instanceUrl}/${text}` }) }} style={{ color: '#58a6ff' }}>{text}</a>
                      : text}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function QueryEditor({ instanceUrl, accessToken, apiKey, objects, contextObject, onBack, onExpired }: Props) {
  const [org, setOrg] = useState<OrgInfo | null>(null)
  const [request, setRequest] = useState('')
  const [generating, setGenerating] = useState(false)
  const [nlNote, setNlNote] = useState('')
  const [statement, setStatement] = useState(contextObject ? `SELECT Id, Name FROM ${contextObject} LIMIT 50` : '')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [page, setPage] = useState<QueryPage | null>(null)
  const [rows, setRows] = useState<Record<string, any>[]>([])
  const [preview, setPreview] = useState<DmlPreview | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const [result, setResult] = useState<DmlResult | null>(null)

  // Unknown org type is treated as production, the safer choice.
  const isProduction = org ? org.isProduction : true

  useEffect(() => {
    getOrgInfo(instanceUrl, accessToken).then(setOrg).catch(e => { if (e instanceof SessionExpiredError) onExpired() })
  }, [instanceUrl, accessToken])

  const columns = useMemo(() => columnsOf(rows), [rows])

  const fail = (e: unknown) => {
    if (e instanceof SessionExpiredError) { onExpired(); return }
    setError((e as Error).message)
  }

  const reset = () => { setError(''); setPage(null); setRows([]); setPreview(null); setResult(null); setConfirmText('') }

  const generate = async () => {
    if (!request.trim()) return
    setGenerating(true); setNlNote(''); reset()
    try {
      const fromEditor = /\bFROM\s+(\w+)/i.exec(statement)?.[1] || /\bINTO\s+(\w+)/i.exec(statement)?.[1]
      const s = await naturalLanguageToStatement(instanceUrl, accessToken, request, objects, apiKey, fromEditor || contextObject)
      setStatement(s)
      setNlNote('Draft ready. Check it, then click Run. Nothing has been run yet.')
    } catch (e) {
      if (e instanceof SessionExpiredError) onExpired()
      else setNlNote(aiErrorText(e))
    }
    setGenerating(false)
  }

  const run = async () => {
    reset()
    let st
    try { st = parseStatement(statement) } catch (e) { setError((e as Error).message); return }
    setRunning(true)
    try {
      if (st.kind === 'select') {
        const p = await runQuery(instanceUrl, accessToken, st.soql)
        setPage(p); setRows(p.records.map(r => flattenRecord(r)))
      } else {
        setPreview(await previewDml(instanceUrl, accessToken, st))
      }
    } catch (e) { fail(e) }
    setRunning(false)
  }

  const loadMore = async () => {
    if (!page?.nextRecordsUrl) return
    setRunning(true)
    try {
      const p = await queryMore(instanceUrl, accessToken, page.nextRecordsUrl)
      setPage(p); setRows(prev => [...prev, ...p.records.map(r => flattenRecord(r))])
    } catch (e) { fail(e) }
    setRunning(false)
  }

  const confirm = async () => {
    if (!preview) return
    setProgress(0); setError('')
    try {
      setResult(await executeDml(instanceUrl, accessToken, preview, setProgress))
      setPreview(null); setConfirmText('')
    } catch (e) { fail(e) }
    setProgress(null)
  }

  const downloadCsv = () => {
    const blob = new Blob([toCsv(rows, columns)], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${/\bFROM\s+(\w+)/i.exec(statement)?.[1] || 'query'}-results.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const canConfirm = preview && !preview.overLimit && preview.count > 0 && progress === null &&
    (!isProduction || confirmText.trim() === String(preview.count))

  return (
    <div style={{ width: '100%', height: '100vh', minWidth: '320px', display: 'flex', flexDirection: 'column', background: '#0f1117', color: '#fff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', boxSizing: 'border-box' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #21262d', display: 'flex', alignItems: 'center', gap: '10px', background: '#0d1117' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: '18px', padding: 0 }}>←</button>
        <div style={{ flex: 1, textAlign: 'left' }}>
          <div style={{ fontSize: '14px', fontWeight: 700 }}>Query Editor</div>
          <div style={{ fontSize: '11px', color: org ? (isProduction ? '#ff7b72' : '#3fb950') : '#8b949e' }}>
            {org ? `${isProduction ? '● PRODUCTION' : org.isSandbox ? '● Sandbox' : '● ' + org.type} ${org.name ? '· ' + org.name : ''}` : 'Checking org type...'}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
        {/* Plain English */}
        <div style={box}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#8b949e', marginBottom: '6px' }}>✨ ASK IN PLAIN ENGLISH</div>
          <textarea
            value={request}
            onChange={e => setRequest(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate() }}
            placeholder={'e.g. show accounts in technology created this year\nor: set priority to High for new cases older than a week'}
            rows={2}
            style={{ width: '100%', boxSizing: 'border-box', background: '#0d1117', border: '1px solid #30363d', borderRadius: '6px', color: '#fff', fontSize: '12px', padding: '8px', resize: 'vertical', outline: 'none', fontFamily: 'inherit' }}
          />
          <button onClick={generate} disabled={generating || !request.trim()} style={{ ...btn('linear-gradient(135deg, #6e40c9, #1f6feb)', generating || !request.trim()), width: '100%', marginTop: '6px' }}>
            {generating ? '✨ Writing the statement...' : '✨ Write statement'}
          </button>
          {nlNote && (
            <div style={{ marginTop: '8px', fontSize: '11px', color: nlNote.startsWith('Draft') ? '#3fb950' : '#e6edf3' }}>
              {nlNote.startsWith('Draft') ? nlNote : <AIText text={nlNote} purpose="query" />}
            </div>
          )}
          <div style={{ fontSize: '10px', color: '#484f58', marginTop: '6px' }}>Only your request and field names are given to the AI, never record data. Drafts never run on their own.</div>
        </div>

        {/* Editor */}
        <div style={box}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#8b949e', marginBottom: '6px' }}>SOQL OR DATA CHANGE</div>
          <textarea
            value={statement}
            onChange={e => setStatement(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run() }}
            placeholder="SELECT Id, Name FROM Account LIMIT 10"
            rows={5}
            spellCheck={false}
            style={{ width: '100%', boxSizing: 'border-box', background: '#0d1117', border: '1px solid #30363d', borderRadius: '6px', color: '#79c0ff', fontSize: '12px', padding: '8px', resize: 'vertical', outline: 'none', fontFamily: 'ui-monospace, Menlo, monospace' }}
          />
          <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
            <button onClick={run} disabled={running || !statement.trim()} style={{ ...btn('linear-gradient(135deg, #00a1e0, #032d60)', running || !statement.trim()), flex: 1 }}>
              {running ? 'Running...' : '▶ Run'}
            </button>
            <button onClick={() => { setStatement(''); reset() }} style={{ ...btn('#21262d'), color: '#8b949e' }}>Clear</button>
          </div>
          <details style={{ marginTop: '8px', fontSize: '11px', color: '#8b949e' }}>
            <summary style={{ cursor: 'pointer' }}>Syntax and examples</summary>
            <div style={{ marginTop: '6px', lineHeight: 1.6 }}>
              SELECT is standard SOQL. Data changes use:<br />
              <code>UPDATE Obj SET F = 'v' WHERE ...</code><br />
              <code>DELETE FROM Obj WHERE ...</code><br />
              <code>INSERT INTO Obj (F1, F2) VALUES ('a', 1)</code><br />
              <code>UPSERT INTO Obj (ExtId__c, F) VALUES ('x', 1) ON ExtId__c</code><br />
              Up to {MAX_DML_RECORDS.toLocaleString()} records per change. Click an example to use it:
              {EXAMPLES.map(ex => (
                <div key={ex} onClick={() => { setStatement(ex); reset() }} style={{ cursor: 'pointer', color: '#58a6ff', fontFamily: 'ui-monospace, Menlo, monospace', marginTop: '4px', wordBreak: 'break-word' }}>{ex}</div>
              ))}
            </div>
          </details>
        </div>

        {error && <div style={{ ...box, borderColor: '#cf222e66', color: '#ff7b72', fontSize: '12px', wordBreak: 'break-word' }}>⚠️ {error}</div>}

        {/* Query results */}
        {page && (
          <div style={box}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', gap: '6px' }}>
              <div style={{ flex: 1, fontSize: '12px', color: '#8b949e' }}>
                {page.totalSize.toLocaleString()} record{page.totalSize === 1 ? '' : 's'}{rows.length < page.totalSize ? ` · showing ${rows.length.toLocaleString()}` : ''}
              </div>
              {rows.length > 0 && <button onClick={downloadCsv} style={{ ...btn('#21262d'), color: '#e6edf3', padding: '4px 8px' }}>⬇ CSV</button>}
            </div>
            {rows.length > 0 ? <Table columns={columns} rows={rows} instanceUrl={instanceUrl} /> : <div style={{ fontSize: '12px', color: '#8b949e' }}>No records found.</div>}
            {!page.done && page.nextRecordsUrl && (
              <button onClick={loadMore} disabled={running} style={{ ...btn('#21262d', running), color: '#e6edf3', width: '100%', marginTop: '8px' }}>Load more</button>
            )}
          </div>
        )}

        {/* Data change preview */}
        {preview && (
          <div style={{ ...box, borderColor: isProduction ? '#cf222e' : '#e3b34166' }}>
            {isProduction && (
              <div style={{ background: '#cf222e', color: '#fff', fontWeight: 700, fontSize: '12px', padding: '6px 8px', borderRadius: '4px', marginBottom: '8px' }}>
                ⚠️ This is a PRODUCTION org. Changes affect real data.
              </div>
            )}
            <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>
              Preview: {VERB[preview.statement.kind]} {preview.overLimit ? `more than ${MAX_DML_RECORDS.toLocaleString()}` : preview.count.toLocaleString()} {(preview.statement as any).object} record{preview.count === 1 ? '' : 's'}
            </div>
            {preview.overLimit && <div style={{ fontSize: '12px', color: '#ff7b72', marginBottom: '8px' }}>That's more than {MAX_DML_RECORDS.toLocaleString()} records. Narrow the WHERE clause or add a LIMIT, then run again.</div>}
            {preview.count === 0 && !preview.overLimit && <div style={{ fontSize: '12px', color: '#8b949e' }}>No records match, so nothing would change.</div>}
            {preview.count > 0 && <Table columns={preview.columns} rows={preview.rows.slice(0, 50)} instanceUrl={instanceUrl} />}
            {preview.count > 50 && <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '4px' }}>Showing the first 50.</div>}
            {preview.statement.kind === 'delete' && preview.count > 0 && <div style={{ fontSize: '11px', color: '#e3b341', marginTop: '8px' }}>Deleted records go to the Salesforce Recycle Bin, where they can usually be restored for 15 days.</div>}
            {preview.statement.kind === 'update' && preview.count > 0 && <div style={{ fontSize: '11px', color: '#e3b341', marginTop: '8px' }}>Updates can't be undone from here. Export the records first if you may need the old values.</div>}

            {preview.count > 0 && !preview.overLimit && (
              <div style={{ marginTop: '10px' }}>
                {isProduction && (
                  <input
                    value={confirmText}
                    onChange={e => setConfirmText(e.target.value)}
                    placeholder={`Type ${preview.count} to confirm`}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '8px', background: '#0d1117', border: '1px solid #cf222e', borderRadius: '6px', color: '#fff', fontSize: '12px', outline: 'none', marginBottom: '6px' }}
                  />
                )}
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={confirm} disabled={!canConfirm} style={{ ...btn(isProduction ? '#cf222e' : '#9e6a03', !canConfirm), flex: 1 }}>
                    {progress !== null ? `Working... ${progress}/${preview.count}` : `Confirm: ${VERB[preview.statement.kind]} ${preview.count} record${preview.count === 1 ? '' : 's'}`}
                  </button>
                  <button onClick={() => { setPreview(null); setConfirmText('') }} disabled={progress !== null} style={{ ...btn('#21262d'), color: '#8b949e' }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Data change result */}
        {result && (
          <div style={{ ...box, borderColor: result.failed ? '#e3b34166' : '#23863666' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: result.failed ? '#e3b341' : '#3fb950' }}>
              {result.failed ? '⚠️' : '✅'} {result.succeeded} succeeded{result.created && result.created !== result.succeeded ? ` (${result.created} created)` : ''}, {result.failed} failed
            </div>
            {result.errors.slice(0, 50).map((er, i) => (
              <div key={i} style={{ fontSize: '11px', color: '#ff7b72', marginTop: '4px', wordBreak: 'break-word' }}>{er.row}: {er.message}</div>
            ))}
            {result.errors.length > 50 && <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '4px' }}>…and {result.errors.length - 50} more errors.</div>}
          </div>
        )}
      </div>
    </div>
  )
}
