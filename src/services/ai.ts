// One entry point for every AI feature, so the extension works free for everyone:
//   1. If the user saved an Anthropic API key  -> Claude via the Anthropic API (in the background worker)
//   2. Else, if Chrome's built-in AI is ready   -> Gemini Nano, on the user's own device (free, no key)
//   3. Otherwise                                 -> AIUnavailableError, and the UI offers "Open in Claude"

export type ChromeAIStatus = 'available' | 'downloadable' | 'downloading' | 'unavailable'
export type FallbackReason = 'unsupported' | 'not_ready' | 'too_long' | 'error'

export class AIUnavailableError extends Error {
  prompt: string
  reason: FallbackReason
  constructor(prompt: string, reason: FallbackReason, detail?: string) {
    super(detail || 'AI_UNAVAILABLE')
    this.prompt = prompt
    this.reason = reason
  }
}

const LANG_OPTIONS = {
  expectedInputs: [{ type: 'text', languages: ['en'] }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
}

function languageModel(): any {
  return (globalThis as any).LanguageModel
}

export async function chromeAIStatus(): Promise<ChromeAIStatus> {
  const LM = languageModel()
  if (!LM?.availability) return 'unavailable'
  try {
    return await LM.availability(LANG_OPTIONS)
  } catch {
    try { return await LM.availability() } catch { return 'unavailable' }
  }
}

async function createSession(onProgress?: (fraction: number) => void): Promise<any> {
  const LM = languageModel()
  const monitor = (m: any) => m.addEventListener('downloadprogress', (e: any) => onProgress?.(e.loaded ?? 0))
  try {
    return await LM.create({ ...LANG_OPTIONS, monitor })
  } catch {
    return await LM.create({ monitor })
  }
}

// Starts the one-time model download. Must be called directly from a click,
// because Chrome only allows the download after a user gesture.
export async function enableChromeAI(onProgress?: (fraction: number) => void): Promise<boolean> {
  if (!languageModel()) return false
  try {
    const session = await createSession(onProgress)
    session.destroy?.()
    return true
  } catch {
    return false
  }
}

async function askChromeAI(prompt: string): Promise<string> {
  const status = await chromeAIStatus()
  if (status === 'unavailable') throw new AIUnavailableError(prompt, 'unsupported')
  if (status !== 'available') throw new AIUnavailableError(prompt, 'not_ready')

  let session: any
  try {
    session = await createSession()
  } catch {
    throw new AIUnavailableError(prompt, 'error')
  }
  try {
    if (typeof session.measureInputUsage === 'function' && typeof session.inputQuota === 'number') {
      const usage = await session.measureInputUsage(prompt)
      if (usage > session.inputQuota) throw new AIUnavailableError(prompt, 'too_long')
    }
    const text: string = await session.prompt(prompt)
    if (!text?.trim()) throw new AIUnavailableError(prompt, 'error')
    return text
  } catch (e) {
    if (e instanceof AIUnavailableError) throw e
    const name = (e as any)?.name || ''
    throw new AIUnavailableError(prompt, name === 'QuotaExceededError' ? 'too_long' : 'error')
  } finally {
    session.destroy?.()
  }
}

function askClaudeAPI(prompt: string, apiKey: string): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'AI_EXPLAIN', prompt, apiKey }, (response) => {
      if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return }
      if (response?.error) { reject(new Error(response.error)); return }
      resolve(response?.text || 'No response')
    })
  })
}

export function askAI(prompt: string, apiKey?: string): Promise<string> {
  return apiKey ? askClaudeAPI(prompt, apiKey) : askChromeAI(prompt)
}

// Which engine will answer, for display in Settings.
export async function activeEngine(apiKey: string): Promise<'claude-key' | ChromeAIStatus> {
  return apiKey ? 'claude-key' : chromeAIStatus()
}

// Copies the prompt and opens a new Claude chat, where the user pastes it.
export async function openInClaude(prompt: string): Promise<boolean> {
  let copied = false
  try {
    await navigator.clipboard.writeText(prompt)
    copied = true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = prompt
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try { copied = document.execCommand('copy') } catch { copied = false }
    ta.remove()
  }
  await chrome.tabs.create({ url: 'https://claude.ai/new' })
  return copied
}

// --- Passing fallbacks through the existing string-based UI state ---

const FALLBACK_PREFIX = '\u0000SFDS_FALLBACK:'
const fallbacks = new Map<string, { prompt: string, reason: FallbackReason }>()

// Turns any error from askAI into text the UI can store: either a
// fallback marker (rendered as an "Open in Claude" card) or "Failed: ...".
export function aiErrorText(e: unknown): string {
  if (e instanceof AIUnavailableError) {
    const id = String(fallbacks.size + 1)
    fallbacks.set(id, { prompt: e.prompt, reason: e.reason })
    return FALLBACK_PREFIX + id
  }
  return 'Failed: ' + ((e as Error)?.message || String(e))
}

export function parseFallback(text: string): { prompt: string, reason: FallbackReason } | null {
  if (!text.startsWith(FALLBACK_PREFIX)) return null
  return fallbacks.get(text.slice(FALLBACK_PREFIX.length)) || null
}
