export interface SFObject {
  name: string
  label: string
  custom: boolean
  keyPrefix: string | null
  labelPlural: string
}
export interface SFField {
  name: string
  label: string
  type: string
  custom: boolean
  referenceTo: string[]
  relationshipName: string | null
}
export interface DependencySummary {
  flows: {name:string,id:string}[]
  apexClasses: {name:string,id:string}[]
  apexTriggers: {name:string,id:string}[]
  validationRules: {name:string,id:string}[]
  workflowRules: {name:string,id:string}[]
  layouts: {name:string,id:string}[]
  reports: {name:string,id:string}[]
  emailTemplates: {name:string,id:string}[]
  other: {name:string,id:string}[]
  total: number
}

function sfFetch(instanceUrl: string, accessToken: string, path: string) {
  return fetch(`${instanceUrl}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
}

function toolingQueryViaBackground(instanceUrl: string, accessToken: string, soql: string): Promise<any[]> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'TOOLING_QUERY', instanceUrl, accessToken, soql },
      (response) => {
        if (chrome.runtime.lastError) { resolve([]); return }
        resolve(response?.records || [])
      }
    )
  })
}

export async function fetchObjects(instanceUrl: string, accessToken: string): Promise<SFObject[]> {
  const r = await sfFetch(instanceUrl, accessToken, '/services/data/v62.0/sobjects/')
  if (!r.ok) throw new Error(`${r.status}`)
  const d = await r.json()
  return d.sobjects
}

export async function fetchObjectDetail(instanceUrl: string, accessToken: string, objectName: string): Promise<{fields: SFField[]}> {
  const r = await sfFetch(instanceUrl, accessToken, `/services/data/v62.0/sobjects/${objectName}/describe/`)
  if (!r.ok) throw new Error(`${r.status}`)
  const d = await r.json()
  return { fields: d.fields }
}

export async function fetchFieldDependenciesSummary(
  instanceUrl: string, accessToken: string,
  objectName: string, fieldName: string
): Promise<DependencySummary> {
  const devName = fieldName.replace(/__c$/,'').replace(/__r$/,'')

  let fieldId: string | null = null

  // Try custom object first
  const objRecords = await toolingQueryViaBackground(instanceUrl, accessToken,
    `SELECT Id FROM CustomObject WHERE DeveloperName='${objectName.replace(/__c$/,'')}' LIMIT 1`)

  if (objRecords.length > 0) {
    const tableId = objRecords[0].Id
    const fieldRecords = await toolingQueryViaBackground(instanceUrl, accessToken,
      `SELECT Id FROM CustomField WHERE TableEnumOrId='${tableId}' AND DeveloperName='${devName}' LIMIT 1`)
    if (fieldRecords.length > 0) fieldId = fieldRecords[0].Id
  }

  // Fallback for standard objects (Account, Contact, etc.)
  if (!fieldId) {
    console.log('Standard object fallback for:', objectName, devName)
    const fieldRecords = await toolingQueryViaBackground(instanceUrl, accessToken,
      `SELECT Id FROM CustomField WHERE TableEnumOrId='${objectName}' AND DeveloperName='${devName}' LIMIT 1`)
    if (fieldRecords.length > 0) fieldId = fieldRecords[0].Id
  }

  let deps: any[] = []
  if (fieldId) {
    deps = await toolingQueryViaBackground(instanceUrl, accessToken,
      `SELECT MetadataComponentId,MetadataComponentName,MetadataComponentType FROM MetadataComponentDependency WHERE RefMetadataComponentId='${fieldId}' LIMIT 200`)
  }
  if (deps.length === 0) {
    deps = await toolingQueryViaBackground(instanceUrl, accessToken,
      `SELECT MetadataComponentId,MetadataComponentName,MetadataComponentType FROM MetadataComponentDependency WHERE RefMetadataComponentName='${objectName}.${fieldName}' LIMIT 200`)
  }

  const all = deps.map((r:any) => ({
    id: r.MetadataComponentId,
    name: r.MetadataComponentName,
    type: r.MetadataComponentType
  }))

  const by = (t: string) => all.filter(d => d.type === t)

  const r = {
    flows: by('Flow'),
    apexClasses: by('ApexClass'),
    apexTriggers: by('ApexTrigger'),
    validationRules: by('ValidationRule'),
    workflowRules: by('WorkflowRule'),
    layouts: by('Layout'),
    reports: by('Report'),
    emailTemplates: by('EmailTemplate'),
    other: [],
    total: 0
  }
  r.total = r.flows.length + r.apexClasses.length + r.apexTriggers.length + r.validationRules.length + r.workflowRules.length + r.layouts.length + r.reports.length + r.emailTemplates.length + r.other.length
  return r
}


export interface ObjectSummary {
  flows: {name:string, id:string}[]
  apexClasses: {name:string, id:string}[]
  apexTriggers: {name:string, id:string}[]
  validationRules: {name:string, id:string}[]
  workflowRules: {name:string, id:string}[]
  layouts: {name:string, id:string}[]
  reports: {name:string, id:string}[]
  emailTemplates: {name:string, id:string}[]
  other: {name:string, id:string}[]
  total: number
}

export async function fetchObjectSummary(
  instanceUrl: string,
  accessToken: string,
  objectName: string
): Promise<ObjectSummary> {

  // Get object ID - try custom object first
  let tableId: string | null = null
  const objRecords = await toolingQueryViaBackground(instanceUrl, accessToken,
    `SELECT Id FROM CustomObject WHERE DeveloperName='${objectName.replace(/__c$/,'')}' LIMIT 1`)
  if (objRecords.length > 0) tableId = objRecords[0].Id

  let deps: any[] = []

  if (tableId) {
    deps = await toolingQueryViaBackground(instanceUrl, accessToken,
      `SELECT MetadataComponentId,MetadataComponentName,MetadataComponentType FROM MetadataComponentDependency WHERE RefMetadataComponentId='${tableId}' LIMIT 200`)
  }

  // Fallback for standard objects - query by name
  if (deps.length === 0) {
    deps = await toolingQueryViaBackground(instanceUrl, accessToken,
      `SELECT MetadataComponentId,MetadataComponentName,MetadataComponentType FROM MetadataComponentDependency WHERE RefMetadataComponentName='${objectName}' LIMIT 200`)
  }
  
  // Another fallback - query by entity definition
  if (deps.length === 0) {
    const entityRecords = await toolingQueryViaBackground(instanceUrl, accessToken,
      `SELECT DurableId FROM EntityDefinition WHERE QualifiedApiName='${objectName}' LIMIT 1`)
    if (entityRecords.length > 0) {
      const durableId = entityRecords[0].DurableId
      deps = await toolingQueryViaBackground(instanceUrl, accessToken,
        `SELECT MetadataComponentId,MetadataComponentName,MetadataComponentType FROM MetadataComponentDependency WHERE RefMetadataComponentId='${durableId}' LIMIT 200`)
    }
  }

  // Fetch active Flows that reference this object via REST API
  const flowApiRecords = await toolingQueryViaBackground(instanceUrl, accessToken,
    `SELECT Id, MasterLabel, ProcessType FROM Flow WHERE Status='Active' AND (ProcessType='Flow' OR ProcessType='AutoLaunchedFlow' OR ProcessType='RecordTriggeredFlow') LIMIT 200`)
  
  console.log('Active flows in org:', flowApiRecords.length)
  
  const existingIds = new Set(deps.map((d:any) => d.MetadataComponentId))

  // Also get dependencies from custom fields on this object
  // This catches Flows/Apex that reference fields (not the object directly)
  let fieldIds: string[] = []
  if (tableId) {
    const fieldRecs = await toolingQueryViaBackground(instanceUrl, accessToken,
      `SELECT Id FROM CustomField WHERE TableEnumOrId='${tableId}' LIMIT 200`)
    fieldIds = fieldRecs.map((f:any) => f.Id)
  } else {
    // Standard object - get entity DurableId for fields
    const entityRecs = await toolingQueryViaBackground(instanceUrl, accessToken,
      `SELECT DurableId FROM EntityDefinition WHERE QualifiedApiName='${objectName}' LIMIT 1`)
    if (entityRecs.length > 0) {
      const fieldRecs = await toolingQueryViaBackground(instanceUrl, accessToken,
        `SELECT Id FROM CustomField WHERE TableEnumOrId='${entityRecs[0].DurableId}' LIMIT 200`)
      fieldIds = fieldRecs.map((f:any) => f.Id)
    }
  }

  console.log('Field IDs found for object:', fieldIds.length)

  // Query dependencies for all fields in batches of 10
  for (let i = 0; i < Math.min(fieldIds.length, 50); i += 10) {
    const batch = fieldIds.slice(i, i + 10)
    const inClause = batch.map(id => `'${id}'`).join(',')
    const fieldDeps = await toolingQueryViaBackground(instanceUrl, accessToken,
      `SELECT MetadataComponentId,MetadataComponentName,MetadataComponentType FROM MetadataComponentDependency WHERE RefMetadataComponentId IN (${inClause}) LIMIT 200`)
    fieldDeps.forEach((d:any) => {
      if (!existingIds.has(d.MetadataComponentId)) {
        deps.push(d)
        existingIds.add(d.MetadataComponentId)
      }
    })
  }

  console.log('Total deps after field scan:', deps.length)

  // Try FlowStart table (record-triggered flows)
  const flowStartRecords = await toolingQueryViaBackground(instanceUrl, accessToken,
    `SELECT FlowVersionId FROM FlowStart WHERE ObjectApiName='${objectName}' LIMIT 50`)
  console.log('FlowStart records:', flowStartRecords.length)

  // Try FlowRecordLookup table
  const flowLookupRecords = await toolingQueryViaBackground(instanceUrl, accessToken,
    `SELECT FlowVersionId FROM FlowRecordLookup WHERE ObjectApiName='${objectName}' LIMIT 50`)
  console.log('FlowRecordLookup records:', flowLookupRecords.length)

  // Try FlowRecordCreate table  
  const flowCreateRecords = await toolingQueryViaBackground(instanceUrl, accessToken,
    `SELECT FlowVersionId FROM FlowRecordCreate WHERE ObjectApiName='${objectName}' LIMIT 50`)
  console.log('FlowRecordCreate records:', flowCreateRecords.length)

  const allFlowVersionIds = new Set([
    ...flowStartRecords.map((f:any) => f.FlowVersionId),
    ...flowLookupRecords.map((f:any) => f.FlowVersionId),
    ...flowCreateRecords.map((f:any) => f.FlowVersionId)
  ])

  console.log('Unique flow version IDs:', allFlowVersionIds.size)

  flowApiRecords.forEach((flow:any) => {
    if (allFlowVersionIds.has(flow.Id) && !existingIds.has(flow.Id)) {
      deps.push({ MetadataComponentId: flow.Id, MetadataComponentName: flow.MasterLabel, MetadataComponentType: 'Flow' })
      existingIds.add(flow.Id)
    }
  })

  const all = deps.map((r:any) => ({
    id: r.MetadataComponentId,
    name: r.MetadataComponentName,
    type: r.MetadataComponentType
  }))

  const by = (t: string) => all.filter(d => d.type === t)

  const r = {
    flows: by('Flow'),
    apexClasses: by('ApexClass'),
    apexTriggers: by('ApexTrigger'),
    validationRules: by('ValidationRule'),
    workflowRules: by('WorkflowRule'),
    layouts: by('Layout'),
    reports: by('Report'),
    emailTemplates: by('EmailTemplate'),
    other: [],
    total: 0
  }
  r.total = r.flows.length + r.apexClasses.length + r.apexTriggers.length + r.validationRules.length + r.workflowRules.length + r.layouts.length + r.reports.length + r.emailTemplates.length + r.other.length
  return r
}


export async function fetchApexClassBody(
  instanceUrl: string,
  accessToken: string,
  className: string
): Promise<string> {
  const records = await toolingQueryViaBackground(instanceUrl, accessToken,
    `SELECT Id, Body, LengthWithoutComments FROM ApexClass WHERE Name='${className}' LIMIT 1`)
  if (records.length === 0) return ''
  return records[0].Body || ''
}

export async function fetchApexTriggerBody(
  instanceUrl: string,
  accessToken: string,
  triggerName: string
): Promise<string> {
  const records = await toolingQueryViaBackground(instanceUrl, accessToken,
    `SELECT Id, Body FROM ApexTrigger WHERE Name='${triggerName}' LIMIT 1`)
  if (records.length === 0) return ''
  return records[0].Body || ''
}

export async function fetchFlowDetails(
  instanceUrl: string,
  accessToken: string,
  flowName: string
): Promise<string> {
  // Get flow version ID
  const records = await toolingQueryViaBackground(instanceUrl, accessToken,
    `SELECT Id, MasterLabel, Description, ProcessType, TriggerType FROM Flow WHERE MasterLabel='${flowName}' AND Status='Active' LIMIT 1`)
  
  let flow = records[0]
  if (!flow) {
    const allRecords = await toolingQueryViaBackground(instanceUrl, accessToken,
      `SELECT Id, MasterLabel, Description, ProcessType, Status FROM Flow WHERE MasterLabel='${flowName}' LIMIT 1`)
    if (allRecords.length === 0) return flowName
    flow = allRecords[0]
  }
  const flowId = flow.Id
  
  if (!flowId) return flowName

  // Fetch flow metadata via REST API
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { 
        type: 'FETCH_FLOW_METADATA', 
        instanceUrl, 
        accessToken, 
        flowId,
        flowInfo: JSON.stringify(flow)
      },
      (response) => {
        if (chrome.runtime.lastError || !response?.metadata) {
          resolve(JSON.stringify(flow))
          return
        }
        resolve(response.metadata)
      }
    )
  })
}

export async function explainApexClass(
  className: string,
  body: string,
  apiKey: string
): Promise<string> {
  
  const prompt = `You are a Salesforce expert. Analyze this Apex class and provide detailed documentation.

Class Name: ${className}

Apex Code:
\`\`\`apex
${body}
Answer in this exact format. Be brief but specific. Reference actual names from code.

**PURPOSE:** [2 sentences. What it does and when it runs.]

**METHODS:**
[Each method: name(params) - what it does in 1-2 sentences]

**DATA FLOW:**
- Reads: [object.field list]
- Writes: [object.field list]
- SOQL: [what queries run]
- DML: [insert/update/delete on which objects]

**BUSINESS LOGIC:** [Key rules. Bullet points.]

**DEPENDENCIES:** [Other classes, objects, fields required]

**RISKS:** [3 bullets max]

**DEV TIPS:** [3 bullets max]

Be specific and technical. Reference actual method names and field names from the code.`

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'AI_EXPLAIN', prompt, apiKey },
      (response) => {
        if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return }
        if (response?.error) { reject(new Error(response.error)); return }
        resolve(response?.text || 'No response')
      }
    )
  })
}

export async function explainFlow(
  flowName: string,
  flowDetails: string,
  apiKey: string
): Promise<string> {
  let parsedDetails: any = {}
  try { parsedDetails = JSON.parse(flowDetails) } catch(e) { parsedDetails = { name: flowName } }

  const info = parsedDetails.info || {}
  const actions = parsedDetails.actions || []
  const decisions = parsedDetails.decisions || []
  const loops = parsedDetails.loops || []
  const assignments = parsedDetails.assignments || []
  const subflows = parsedDetails.subflows || []

  const variables = parsedDetails.variables || []
  const start = parsedDetails.start || {}

  const prompt = `You are a Salesforce expert. Analyze this Salesforce Flow metadata and provide detailed technical documentation.

Flow Name: ${flowName}
Status: ${info.Status || 'Unknown'}
Process Type: ${info.ProcessType || 'Unknown'}
Description: ${info.Description || 'None provided'}

Trigger/Start:
- Trigger Type: ${start.triggerType || 'Unknown'}
- Object: ${start.object || 'Unknown'}
- Record Trigger Type: ${start.recordTriggerType || 'N/A'}

Flow Elements:
- Actions (${actions.length}): ${actions.map((a:any) => `"${a.label}" [${a.actionType}:${a.actionName}]`).join(' | ') || 'None'}
- Decisions (${decisions.length}): ${decisions.map((d:any) => `"${d.label}"`).join(', ') || 'None'}
- Assignments (${assignments.length}): ${assignments.map((a:any) => `"${a.label}"`).join(', ') || 'None'}
- Loops (${loops.length}): ${loops.map((l:any) => `"${l.label}"`).join(', ') || 'None'}
- Subflows (${subflows.length}): ${subflows.map((s:any) => `"${s.label}" calls ${s.flowName}`).join(', ') || 'None'}
- Variables (${variables.length}): ${variables.slice(0,10).map((v:any) => `${v.name}(${v.dataType}${v.isInput?',input':''}${v.isOutput?',output':''})`).join(', ') || 'None'}

Write these sections. Be specific, use actual names from metadata above. Skip generic advice.

**1. Purpose** - 2 sentences max. Include active/inactive status.

**2. Trigger** - 1 sentence. Exactly what fires it.

**3. Complete Execution Path** - Number every single step:
1. [element]: what it does exactly
2. [decision]: IF [actual condition] THEN [branch A] ELSE [branch B]  
3. [action]: what it does, inputs used
Show ALL branches. Show path to END.

**4. Variables** - Each variable: name, type, what it holds, where set, where used

**5. Dependencies** - Objects, fields, templates required

**6. Risk** - 3 bullet points: what breaks if deactivated

**7. Dev Tips** - 3 bullet points max`

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'AI_EXPLAIN', prompt, apiKey },
      (response) => {
        if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return }
        if (response?.error) { reject(new Error(response.error)); return }
        resolve(response?.text || 'No response')
      }
    )
  })
}


export async function fetchValidationRule(
  instanceUrl: string,
  accessToken: string,
  ruleName: string,
  objectName: string
): Promise<string> {
  const records = await toolingQueryViaBackground(instanceUrl, accessToken,
    `SELECT Id, ValidationName, Description, ErrorMessage, ErrorDisplayField, Active FROM ValidationRule WHERE EntityDefinition.QualifiedApiName='${objectName}' AND ValidationName='${ruleName}' LIMIT 1`)
  if (records.length === 0) return ''
  
  // Get the formula
  const rule = records[0]
  const metaResp = await new Promise<any>((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'FETCH_REST', instanceUrl, accessToken, path: `/services/data/v62.0/tooling/sobjects/ValidationRule/${rule.Id}` },
      (response) => resolve(response?.data || {})
    )
  })
  
  return JSON.stringify({ ...rule, formula: metaResp?.Metadata?.errorConditionFormula || '' })
}

export async function fetchSaveSequence(
  instanceUrl: string,
  accessToken: string,
  objectName: string
): Promise<string> {
  // For custom objects, get the object ID first
  let triggerId = objectName
  const objRecords = await toolingQueryViaBackground(instanceUrl, accessToken,
    `SELECT Id FROM CustomObject WHERE DeveloperName='${objectName.replace(/__c$/,'')}' LIMIT 1`)
  if (objRecords.length > 0) triggerId = objRecords[0].Id

  // Fetch all components in parallel
  // Fetch ALL triggers and filter in code (Tooling API has issues with WHERE on TableEnumOrId for custom objects)
  const [allOrgTriggers, flows, validationRules, workflowRules] = await Promise.all([
    toolingQueryViaBackground(instanceUrl, accessToken,
      `SELECT Id, Name, TableEnumOrId FROM ApexTrigger LIMIT 200`),
    toolingQueryViaBackground(instanceUrl, accessToken,
      `SELECT Id, MasterLabel, ProcessType, Status FROM Flow WHERE (ProcessType='AutoLaunchedFlow' OR ProcessType='RecordTriggeredFlow') AND Status='Active' LIMIT 50`),
    toolingQueryViaBackground(instanceUrl, accessToken,
      `SELECT Id, ValidationName, Active FROM ValidationRule WHERE EntityDefinition.QualifiedApiName='${objectName}' AND Active=true LIMIT 20`),
    toolingQueryViaBackground(instanceUrl, accessToken,
      `SELECT Id, Name FROM WorkflowRule WHERE SobjectType='${objectName}' LIMIT 20`)
  ])

  // Filter triggers for this object by API name or object ID
  const allTriggers = allOrgTriggers.filter((t:any) => 
    t.TableEnumOrId === objectName || t.TableEnumOrId === triggerId
  )

  return JSON.stringify({
    objectName,
    triggers: allTriggers.map((t:any) => ({ name: t.Name, status: 'Active', beforeSave: true, afterSave: true })),
    flows: flows.map((f:any) => ({ name: f.MasterLabel, processType: f.ProcessType, status: f.Status })),
    validationRules: validationRules.map((v:any) => ({ name: v.ValidationName, active: v.Active })),
    workflowRules: workflowRules.map((w:any) => ({ name: w.Name }))
  })
}

export async function explainValidationRule(
  ruleName: string,
  ruleData: string,
  apiKey: string
): Promise<string> {
  let parsed: any = {}
  try { parsed = JSON.parse(ruleData) } catch(e) { parsed = { ValidationName: ruleName } }

  const prompt = `You are a Salesforce expert. Analyze this Validation Rule and explain it clearly.

Rule Name: ${ruleName}
Object: (from context)
Active: ${parsed.Active || parsed.active || 'Unknown'}
Error Message: ${parsed.ErrorMessage || 'Not provided'}
Error Display Field: ${parsed.ErrorDisplayField || 'Not provided'}
Description: ${parsed.Description || 'None'}
Formula: 
\`\`\`
${parsed.formula || 'Formula not available'}
\`\`\`

Please provide:
1. **Purpose** - What business rule does this enforce in plain English?
2. **When it fires** - Under what conditions does this validation trigger?
3. **Formula Explanation** - Break down the formula line by line
4. **Error shown to user** - What message does the user see and on which field?
5. **Impact** - What records does this affect? Who does it impact?
6. **Risk** - What happens if this rule is deactivated?
7. **Testing** - How to test this validation rule?

Use plain English. Avoid Salesforce jargon where possible.`

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'AI_EXPLAIN', prompt, apiKey },
      (response) => {
        if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return }
        if (response?.error) { reject(new Error(response.error)); return }
        resolve(response?.text || 'No response')
      }
    )
  })
}

export async function explainSaveSequence(
  objectName: string,
  sequenceData: string,
  apiKey: string
): Promise<string> {
  let parsed: any = {}
  try { parsed = JSON.parse(sequenceData) } catch(e) { parsed = {} }

  const prompt = `You are a Salesforce expert. Explain what happens when a ${objectName} record is saved.

Object: ${objectName}

Components found:
- Apex Triggers (${parsed.triggers?.length || 0}): ${parsed.triggers?.map((t:any) => `${t.name} [before:${t.beforeSave}, after:${t.afterSave}]`).join(', ') || 'None'}
- Active Flows (${parsed.flows?.length || 0}): ${parsed.flows?.map((f:any) => `${f.name} [${f.processType}]`).join(', ') || 'None'}
- Validation Rules (${parsed.validationRules?.length || 0}): ${parsed.validationRules?.map((v:any) => v.name).join(', ') || 'None'}
- Workflow Rules (${parsed.workflowRules?.length || 0}): ${parsed.workflowRules?.map((w:any) => w.name).join(', ') || 'None'}

Please provide:
1. **Save Sequence** - Show the exact order of execution when a record is saved using a diagram like:
\`\`\`
User clicks Save
↓
Validation Rules run
↓
Before-Save Flows
↓
Before Triggers
↓
Record saved to database
↓
After Triggers
↓
After-Save Flows
↓
Workflow Rules
↓
Platform Events
\`\`\`
Fill in the actual component names at each step.

2. **Key Risks** - What could cause a save to fail?
3. **Debugging Guide** - If a save fails, where to look first?
4. **Performance Notes** - Any governor limit concerns?

Be specific with actual component names.`

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'AI_EXPLAIN', prompt, apiKey },
      (response) => {
        if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return }
        if (response?.error) { reject(new Error(response.error)); return }
        resolve(response?.text || 'No response')
      }
    )
  })
}

export async function explainImpact(
  objectName: string,
  fieldName: string,
  fieldType: string,
  summary: DependencySummary | null,
  apiKey: string,
  customPrompt?: string
): Promise<string> {
  if (customPrompt) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'AI_EXPLAIN', prompt: customPrompt, apiKey },
        (response) => {
          if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return }
          if (response?.error) { reject(new Error(response.error)); return }
          resolve(response?.text || 'No response')
        }
      )
    })
  }

  const s = summary!
  const prompt = `You are a Salesforce expert. Analyze this field dependency data and explain the impact of modifying or deleting this field in 2-3 sentences. Be specific and practical.

Field: ${objectName}.${fieldName} (type: ${fieldType})

Dependencies found:
- Flows: ${s.flows.length} (${s.flows.slice(0,3).map(f=>f.name).join(', ')}${s.flows.length > 3 ? '...' : ''})
- Apex Classes: ${s.apexClasses.length} (${s.apexClasses.slice(0,3).map(f=>f.name).join(', ')}${s.apexClasses.length > 3 ? '...' : ''})
- Apex Triggers: ${s.apexTriggers.length}
- Validation Rules: ${s.validationRules.length}
- Layouts: ${s.layouts.length}
- Reports: ${s.reports.length}
- Total: ${s.total}

Give a concise, practical risk assessment.`

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'AI_EXPLAIN', prompt, apiKey },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message)); return
        }
        if (response?.text) { resolve(response.text); return }
        if (response?.error && !response?.resultKey) { reject(new Error(response.error)); return }
        
        // Poll storage for result
        const key = response?.resultKey
        if (!key) { reject(new Error('No result key')); return }
        
        let attempts = 0
        const poll = setInterval(() => {
          attempts++
          chrome.storage.local.get(key, (result) => {
            const data = result[key] as {done?: boolean, text?: string, error?: string} | undefined as {done?: boolean, text?: string, error?: string} | undefined as {done?: boolean, text?: string, error?: string} | undefined
            if (data?.done) {
              clearInterval(poll)
              chrome.storage.local.remove(key)
              if (data.error) reject(new Error(data.error))
              else resolve(data.text || 'No response')
            }
            if (attempts > 30) { clearInterval(poll); reject(new Error('Timeout')) }
          })
        }, 500)
      }
    )
  })
}
