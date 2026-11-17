import { useState } from 'react'
import { parseMarkdown, type Inline } from '../services/markdown'
import { parseFallback, openInClaude, enableChromeAI, type FallbackReason } from '../services/ai'

const REASONS: Record<FallbackReason, string> = {
  unsupported: "Free on-device AI isn't available on this device or Chrome version.",
  not_ready: 'Free on-device AI needs a one-time setup on this computer.',
  too_long: 'This one is too long for the free on-device AI.',
  error: "The free on-device AI couldn't answer this one.",
}

function renderInline(parts: Inline[]) {
  return parts.map((p, i) =>
    p.kind === 'bold' ? <strong key={i} style={{ color: '#ffffff' }}>{p.value}</strong>
      : p.kind === 'code' ? <code key={i} style={{ background: '#21262d', padding: '1px 5px', borderRadius: '4px', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '11px', color: '#79c0ff' }}>{p.value}</code>
      : <span key={i}>{p.value}</span>
  )
}

function Markdown({ text }: { text: string }) {
  return (
    <div style={{ textAlign: 'left', fontSize: '12px', lineHeight: '1.6', color: '#e6edf3', wordBreak: 'break-word' }}>
      {parseMarkdown(text).map((b, i) => {
        switch (b.kind) {
          case 'heading':
            return <div key={i} style={{ fontSize: b.level <= 1 ? '14px' : b.level === 2 ? '13px' : '12px', fontWeight: 700, color: '#ffffff', margin: i === 0 ? '0 0 6px' : '12px 0 6px' }}>{renderInline(b.inline)}</div>
          case 'item':
            return (
              <div key={i} style={{ display: 'flex', gap: '6px', paddingLeft: `${b.indent * 14}px`, margin: '2px 0' }}>
                <span style={{ color: '#8b949e', flexShrink: 0, minWidth: b.ordered ? '16px' : '8px' }}>{b.marker}</span>
                <span>{renderInline(b.inline)}</span>
              </div>
            )
          case 'paragraph':
            return <p key={i} style={{ margin: '0 0 8px' }}>{renderInline(b.inline)}</p>
          case 'code':
            return <pre key={i} style={{ background: '#0d1117', border: '1px solid #21262d', borderRadius: '6px', padding: '8px', margin: '6px 0', overflowX: 'auto', fontSize: '11px', fontFamily: 'ui-monospace, Menlo, monospace', whiteSpace: 'pre' }}>{b.value}</pre>
          case 'rule':
            return <hr key={i} style={{ border: 'none', borderTop: '1px solid #30363d', margin: '10px 0' }} />
        }
      })}
    </div>
  )
}

function OpenInClaudeCard({ prompt, reason, purpose }: { prompt: string, reason: FallbackReason, purpose: 'explain' | 'query' }) {
  const [copied, setCopied] = useState<boolean | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [setupDone, setSetupDone] = useState(false)
  const [setupFailed, setSetupFailed] = useState(false)

  const btn = { width: '100%', padding: '9px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: '#fff' } as const

  return (
    <div style={{ textAlign: 'left', fontSize: '12px', lineHeight: '1.6', color: '#e6edf3' }}>
      <div style={{ color: '#8b949e', marginBottom: '10px' }}>{REASONS[reason]}</div>

      {reason === 'not_ready' && !setupDone && (
        <div style={{ marginBottom: '12px' }}>
          <button
            disabled={progress !== null}
            onClick={async () => {
              setProgress(0)
              const ok = await enableChromeAI(f => setProgress(f))
              setProgress(null)
              setSetupDone(ok)
              setSetupFailed(!ok)
            }}
            style={{ ...btn, background: progress !== null ? '#21262d' : 'linear-gradient(135deg, #238636, #1a7f37)', cursor: progress !== null ? 'default' : 'pointer' }}>
            {progress !== null ? `Setting up free AI... ${Math.round(progress * 100)}%` : '⬇️ Set up free on-device AI'}
          </button>
          <div style={{ fontSize: '11px', color: setupFailed ? '#e3b341' : '#484f58', marginTop: '4px' }}>{setupFailed ? "Chrome couldn't set up on-device AI here (it needs about 22 GB free disk space). Use Claude below instead." : 'One-time download by Chrome. After that, explanations run free on this computer.'}</div>
        </div>
      )}
      {setupDone && (
        <div style={{ color: '#3fb950', marginBottom: '12px' }}>✅ Free AI is ready. Try again.</div>
      )}

      <div style={{ marginBottom: '8px' }}>
        {purpose === 'query'
          ? <>{reason === 'not_ready' ? 'Or get' : 'Get'} the statement free from Claude: we copy the request and open Claude. Paste it with <strong>Ctrl+V</strong> (<strong>⌘V</strong> on Mac), then copy Claude's statement back into the editor here.</>
          : <>{reason === 'not_ready' ? 'Or get' : 'Get'} the full explanation free in Claude: we copy the prompt and open Claude, then you paste it with <strong>Ctrl+V</strong> (<strong>⌘V</strong> on Mac).</>}
      </div>
      <button
        onClick={async () => setCopied(await openInClaude(prompt))}
        style={{ ...btn, background: 'linear-gradient(135deg, #d97757, #b55a3c)' }}>
        📋 Copy prompt & open Claude
      </button>
      {copied === true && <div style={{ color: '#3fb950', marginTop: '6px', fontSize: '11px' }}>Copied. Paste it into the Claude tab that just opened.</div>}
      {copied === false && <div style={{ color: '#e3b341', marginTop: '6px', fontSize: '11px' }}>Couldn't copy automatically. Claude is open; use "Explain" again and try once more.</div>}
    </div>
  )
}

// Renders an AI answer, an "Open in Claude" fallback, or an error message.
export default function AIText({ text, purpose = 'explain' }: { text: string, purpose?: 'explain' | 'query' }) {
  const fb = parseFallback(text)
  if (fb) return <OpenInClaudeCard prompt={fb.prompt} reason={fb.reason} purpose={purpose} />
  if (text.startsWith('Failed:')) return <div style={{ textAlign: 'left', fontSize: '12px', color: '#ff7b72', wordBreak: 'break-word' }}>{text}</div>
  return <Markdown text={text} />
}
