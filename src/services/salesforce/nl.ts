// Plain English -> one statement in the editor's dialect.
// Only the user's request and object/field names (schema) are given to the AI, never record data.

import { askAI } from '../ai'
import { describeFull, repairSoql, type FieldInfo } from './data'
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
  if (f.type === 'reference' && f.referenceTo?.length) {
    line += ` -> lookup to ${f.referenceTo.join('/')}${f.relationshipName ? `, use ${f.relationshipName}.Name for its name` : ''}`
  }
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
  const matchedNames = new Set(matched.map(o => o.name))
  const schemas: string[] = []
  const relations: string[] = []
  for (const o of matched) {
    const { fields, childRelationships } = await describeFull(instanceUrl, token, o.name)
    // Lookups first, then the rest, so relationships survive the field cap.
    const sorted = [...fields.filter(f => f.type === 'reference'), ...fields.filter(f => f.type !== 'reference')]
    schemas.push(`Object ${o.name} ("${o.label}") fields:\n` + sorted.slice(0, 120).map(f => '- ' + fieldLine(f)).join('\n'))
    for (const c of childRelationships) {
      if (matchedNames.has(c.childSObject) && c.childSObject !== o.name) {
        relations.push(`- ${c.childSObject}.${c.field} points to ${o.name}. ${o.name} records that have ${c.childSObject} records: WHERE Id IN (SELECT ${c.field} FROM ${c.childSObject})${c.relationshipName ? `. Child subquery name: ${c.relationshipName}` : ''}`)
      }
    }
  }
  const today = new Date().toISOString().slice(0, 10)
  const prompt = `You convert a Salesforce user's request into exactly ONE statement. Today is ${today}.

Allowed statement forms:
1. Standard SOQL: SELECT fields FROM Object WHERE ... ORDER BY ... LIMIT n
2. UPDATE Object SET Field = value, Field2 = value WHERE <SOQL condition> [LIMIT n]
3. DELETE FROM Object WHERE <SOQL condition> [LIMIT n]
4. INSERT INTO Object (Field1, Field2) VALUES ('text', 123), ('text2', 456)
5. UPSERT INTO Object (ExternalIdField, Field2) VALUES ('id1', 'x') ON ExternalIdField

SOQL rules (SOQL is not SQL):
- Text search uses LIKE with % wildcards: Name LIKE '%Acc%'. There is no CONTAINS, ILIKE, SELECT * or JOIN.
- "records that have related X" uses a semi-join: WHERE Id IN (SELECT ParentLookupField FROM X). "that have no X" uses NOT IN.
- Parent fields use dot notation: Account.Name. Child records use a subquery in SELECT: (SELECT Id, Name FROM Contacts).
- Text values in single quotes. Numbers, true, false and null without quotes.
- Date literals: TODAY, LAST_N_DAYS:365, THIS_MONTH, THIS_YEAR.
- Counting: SELECT COUNT() FROM Case, or SELECT Status, COUNT(Id) FROM Case GROUP BY Status.
- UPDATE and DELETE must have a WHERE clause.
- For "show", "list", "find" requests write a SELECT with Id, Name (if the object has Name) and a few useful fields, and LIMIT 200 unless a count or number is asked for.
- Use only the objects and API field names listed below. Never invent fields.

Examples (syntax only; they may use other objects):
Request: accounts whose name has "Acme" and that have contacts
Statement: SELECT Id, Name FROM Account WHERE Name LIKE '%Acme%' AND Id IN (SELECT AccountId FROM Contact) LIMIT 200
Request: accounts with no opportunities
Statement: SELECT Id, Name FROM Account WHERE Id NOT IN (SELECT AccountId FROM Opportunity) LIMIT 200
Request: contacts with their account name created this year
Statement: SELECT Id, Name, Account.Name FROM Contact WHERE CreatedDate = THIS_YEAR LIMIT 200
Request: accounts with their contacts
Statement: SELECT Id, Name, (SELECT Id, Name FROM Contacts) FROM Account LIMIT 200
Request: how many open cases by priority
Statement: SELECT Priority, COUNT(Id) FROM Case WHERE IsClosed = false GROUP BY Priority

${schemas.join('\n\n')}
${relations.length ? '\nRelationships between these objects:\n' + relations.join('\n') + '\n' : ''}
Output only the statement. No explanation, no markdown, no code fences.

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
  return repairSoql(cleanStatement(await askAI(prompt, apiKey)))
}

// Second try: give the AI the statement Salesforce rejected and the error message.
export async function fixStatement(
  instanceUrl: string, token: string, request: string, objects: SFObject[], apiKey: string,
  badStatement: string, error: string, fallbackObject?: string
): Promise<string> {
  const { prompt } = await buildNlPrompt(instanceUrl, token, request, objects, fallbackObject)
  const retry = prompt.replace(/Statement:$/, '') +
    `\nA previous attempt was:\n${badStatement}\nSalesforce rejected it with this error:\n${error.slice(0, 500)}\nWrite a corrected statement that follows the SOQL rules above.\nStatement:`
  return repairSoql(cleanStatement(await askAI(retry, apiKey)))
}
