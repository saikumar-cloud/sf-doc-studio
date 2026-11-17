// Plain English -> one statement in the editor's dialect.
// Only the user's request and object/field names (schema) are given to the AI, never record data.

import { askAI } from '../ai'
import { describeObject, type FieldInfo } from './data'
import type { SFObject } from './metadata'

const NOISE = /(History|Share|Feed|ChangeEvent|__Tag|__mdt|__e|__x)$/

function norm(s: string): string {
  return s.toLowerCase().replace(/__c$/, '').replace(/[_\s]+/g, ' ').trim()
}

// Finds the objects the request talks about, best match first.
export function matchObjects(request: string, objects: SFObject[], max = 2): SFObject[] {
  const q = ' ' + request.toLowerCase().replace(/[^a-z0-9_ ]+/g, ' ').replace(/\s+/g, ' ') + ' '
  const scored: { o: SFObject, score: number }[] = []
  for (const o of objects) {
    if (NOISE.test(o.name)) continue
    let best = 0
    for (const cand of [o.labelPlural, o.label, o.name, norm(o.name)]) {
      if (!cand) continue
      const c = cand.toLowerCase()
      if (c.length >= 3 && q.includes(' ' + c + ' ')) best = Math.max(best, c.length + (o.custom ? 0.5 : 0))
    }
    if (best) scored.push({ o, score: best })
  }
  scored.sort((a, b) => b.score - a.score)
  // Drop matches that are just part of a longer matched name ("Job" inside "Batch Job Log").
  const picked: SFObject[] = []
  for (const s of scored) {
    const lbl = s.o.label.toLowerCase()
    if (picked.some(p => p.label.toLowerCase().includes(lbl) || (p.labelPlural || '').toLowerCase().includes(lbl))) continue
    picked.push(s.o)
    if (picked.length >= max) break
  }
  return picked
}

function fieldLine(f: FieldInfo): string {
  let line = `${f.name} (${f.type}${f.label && f.label !== f.name ? ', "' + f.label + '"' : ''})`
  if (f.type === 'picklist' && f.picklistValues?.length) {
    const vals = f.picklistValues.filter(v => v.active).slice(0, 10).map(v => `'${v.value}'`)
    if (vals.length) line += ` values: ${vals.join(', ')}`
  }
  return line
}

export async function buildNlPrompt(
  instanceUrl: string, token: string, request: string, objects: SFObject[], fallbackObject?: string
): Promise<{ prompt: string, objectNames: string[] }> {
  let matched = matchObjects(request, objects)
  if (!matched.length && fallbackObject) matched = objects.filter(o => o.name === fallbackObject)
  if (!matched.length) {
    throw new Error('Mention which object you mean, for example "accounts", "open cases" or "Batch Job Log records".')
  }
  const schemas: string[] = []
  for (const o of matched) {
    const fields = await describeObject(instanceUrl, token, o.name)
    schemas.push(`Object ${o.name} ("${o.label}") fields:\n` + fields.slice(0, 120).map(f => '- ' + fieldLine(f)).join('\n'))
  }
  const today = new Date().toISOString().slice(0, 10)
  const prompt = `You convert a Salesforce user's request into exactly ONE statement. Today is ${today}.

Allowed statement forms:
1. Standard SOQL: SELECT fields FROM Object WHERE ... ORDER BY ... LIMIT n
2. UPDATE Object SET Field = value, Field2 = value WHERE <SOQL condition> [LIMIT n]
3. DELETE FROM Object WHERE <SOQL condition> [LIMIT n]
4. INSERT INTO Object (Field1, Field2) VALUES ('text', 123), ('text2', 456)
5. UPSERT INTO Object (ExternalIdField, Field2) VALUES ('id1', 'x') ON ExternalIdField

Rules:
- Use only the objects and API field names listed below. Never invent fields.
- Text values in single quotes. Numbers, true, false and null without quotes.
- In WHERE clauses use SOQL syntax, including date literals like LAST_N_DAYS:365, THIS_MONTH, TODAY.
- UPDATE and DELETE must have a WHERE clause.
- For "show", "list", "find", "how many" requests, write a SELECT. Include Id and a few useful fields. Add LIMIT 200 unless the user asks for a count or a specific number.
- Output only the statement. No explanation, no markdown, no code fences.

${schemas.join('\n\n')}

Request: ${request}
Statement:`
  return { prompt, objectNames: matched.map(o => o.name) }
}

export function cleanStatement(text: string): string {
  let s = text.trim()
  const fence = /```[a-zA-Z]*\s*([\s\S]*?)```/.exec(s)
  if (fence) s = fence[1].trim()
  s = s.replace(/^(statement|sql|soql)\s*:\s*/i, '').trim()
  // Keep the first statement only.
  const start = s.search(/\b(SELECT|UPDATE|DELETE|INSERT|UPSERT)\b/i)
  if (start > 0) s = s.slice(start)
  return s.split(/;\s*\n/)[0].replace(/;\s*$/, '').trim()
}

export async function naturalLanguageToStatement(
  instanceUrl: string, token: string, request: string, objects: SFObject[], apiKey: string, fallbackObject?: string
): Promise<string> {
  const { prompt } = await buildNlPrompt(instanceUrl, token, request, objects, fallbackObject)
  return cleanStatement(await askAI(prompt, apiKey))
}
