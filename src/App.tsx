import { useState, useEffect } from 'react'
import { startSalesforceOAuth } from './services/auth/salesforce'
import { 
  fetchObjects, fetchObjectDetail, fetchFieldDependenciesSummary, 
  fetchObjectSummary, explainImpact, fetchApexClassBody, fetchApexTriggerBody,
  fetchFlowDetails, explainApexClass, explainFlow,
  fetchValidationRule, fetchSaveSequence, explainValidationRule, explainSaveSequence,
  type SFObject, type SFField, type DependencySummary, type ObjectSummary
} from './services/salesforce/metadata'

type View = 'objects' | 'object-doc' | 'fields' | 'impact'

function App() {
  const [connecting, setConnecting] = useState(false)
  const [connected, setConnected] = useState(false)
  const [instanceUrl, setInstanceUrl] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [objects, setObjects] = useState<SFObject[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [view, setView] = useState<View>('objects')
  const [selectedObject, setSelectedObject] = useState<SFObject | null>(null)
  const [fields, setFields] = useState<SFField[]>([])
  const [loadingFields, setLoadingFields] = useState(false)
  const [fieldSearch, setFieldSearch] = useState('')
  const [selectedField, setSelectedField] = useState<SFField | null>(null)
  const [depSummary, setDepSummary] = useState<DependencySummary | null>(null)
  const [loadingDeps, setLoadingDeps] = useState(false)
  const [objSummary, setObjSummary] = useState<ObjectSummary | null>(null)
  const [loadingObjSummary, setLoadingObjSummary] = useState(false)
  const [aiExplanation, setAiExplanation] = useState('')
  const [loadingAi, setLoadingAi] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [pendingComponent, setPendingComponent] = useState<{name:string, type:string} | null>(null)
  const [activeTab, setActiveTab] = useState<'overview'|'fields'|'save-sequence'>('overview')
  const [selectedComponent, setSelectedComponent] = useState<{name:string, type:string} | null>(null)
  const [saveSequence, setSaveSequence] = useState('')
  const [loadingSaveSequence, setLoadingSaveSequence] = useState(false)
  const [componentExplanation, setComponentExplanation] = useState('')
  const [loadingComponent, setLoadingComponent] = useState(false)

  useEffect(() => {
    chrome.storage.local.get(['accessToken', 'instanceUrl', 'anthropicKey'], (result) => {
      if (result.accessToken && result.instanceUrl) {
        setConnected(true)
        setInstanceUrl(result.instanceUrl as string)
        setAccessToken(result.accessToken as string)
      }
      if (result.anthropicKey) setApiKey(result.anthropicKey as string)
    })
  }, [])

  useEffect(() => {
    if (connected && instanceUrl && accessToken) {
      setLoading(true)
      fetchObjects(instanceUrl, accessToken)
        .then(setObjects).catch(console.error).finally(() => setLoading(false))
    }
  }, [connected, instanceUrl, accessToken])

  const handleConnect = () => {
    setConnecting(true)
    startSalesforceOAuth(
      (token, url) => { setConnected(true); setInstanceUrl(url); setAccessToken(token); setConnecting(false) },
      (_error) => setConnecting(false)
    )
  }

  const handleSelectObject = (obj: SFObject) => {
    setSelectedObject(obj)
    setFields([])
    setFieldSearch('')
    setObjSummary(null)
    setAiExplanation('')
    setActiveTab('overview')
    setSaveSequence('')
    setLoadingSaveSequence(false)
    setSelectedComponent(null)
    setComponentExplanation('')
    setView('object-doc')
    
    // Load fields and object summary in parallel
    setLoadingFields(true)
    setLoadingObjSummary(true)
    
    fetchObjectDetail(instanceUrl, accessToken, obj.name)
      .then(d => setFields(d.fields)).catch(console.error).finally(() => setLoadingFields(false))
    
    fetchObjectSummary(instanceUrl, accessToken, obj.name)
      .then(setObjSummary).catch(console.error).finally(() => setLoadingObjSummary(false))
  }

  const handleSelectField = (field: SFField) => {
    setSelectedField(field)
    setDepSummary(null)
    setAiExplanation('')
    setView('impact')
    setLoadingDeps(true)
    fetchFieldDependenciesSummary(instanceUrl, accessToken, selectedObject!.name, field.name)
      .then(setDepSummary).catch(console.error).finally(() => setLoadingDeps(false))
  }

  const handleComponentClick = async (name: string, type: string) => {
    if (!apiKey) { setPendingComponent({name, type}); setShowApiKey(true); return }
    setSelectedComponent({ name, type })
    setComponentExplanation('')
    setLoadingComponent(true)
    try {
      if (type === 'ApexClass') {
        const body = await fetchApexClassBody(instanceUrl, accessToken, name)
        if (body) {
          const explanation = await explainApexClass(name, body, apiKey)
          setComponentExplanation(explanation)
        } else {
          setComponentExplanation('Could not fetch class body.')
        }
      } else if (type === 'ApexTrigger') {
        const body = await fetchApexTriggerBody(instanceUrl, accessToken, name)
        if (body) {
          const explanation = await explainApexClass(name, body, apiKey)
          setComponentExplanation(explanation)
        } else {
          setComponentExplanation('Could not fetch trigger body.')
        }
      } else if (type === 'Flow') {
        const details = await fetchFlowDetails(instanceUrl, accessToken, name)
        const explanation = await explainFlow(name, details || name, apiKey)
        setComponentExplanation(explanation)
      } else if (type === 'ValidationRule') {
        const ruleData = await fetchValidationRule(instanceUrl, accessToken, name, selectedObject!.name)
        const explanation = await explainValidationRule(name, ruleData || name, apiKey)
        setComponentExplanation(explanation)
      }
    } catch (e) {
      setComponentExplanation('Failed: ' + (e as Error).message)
    }
    setLoadingComponent(false)
  }

  const handleAiExplain = async (promptType?: string) => {
    if (!apiKey) { setShowApiKey(true); return }
    setLoadingAi(true)
    setAiExplanation('')
    chrome.storage.local.set({ anthropicKey: apiKey })
    try {
      let explanation = ''
      if (promptType === 'object' && selectedObject) {
        const p = `You are a Salesforce expert. Write a concise 3-4 sentence documentation summary for the "${selectedObject.label}" (${selectedObject.name}) Salesforce object. Explain its business purpose, who uses it, and its role in the org. Then list key automations in bullet points. Keep it practical for a new developer joining the team.
        
Object stats:
- ${fields.length} fields
- ${objSummary?.flows.length || 0} Flows: ${objSummary?.flows.slice(0,3).map(f=>f.name).join(', ')}
- ${objSummary?.apexClasses.length || 0} Apex Classes: ${objSummary?.apexClasses.slice(0,3).map(f=>f.name).join(', ')}
- ${objSummary?.validationRules.length || 0} Validation Rules
- ${objSummary?.layouts.length || 0} Page Layouts
- ${objSummary?.reports.length || 0} Reports`
        explanation = await explainImpact('', '', '', depSummary!, apiKey, p)
      } else if (selectedField && selectedObject) {
        explanation = await explainImpact(selectedObject.name, selectedField.name, selectedField.type, depSummary!, apiKey)
      }
      setAiExplanation(explanation)
    } catch (e) {
      setAiExplanation('Failed: ' + (e as Error).message)
    }
    setLoadingAi(false)
  }

  const typeColor = (type: string) => {
    const c: Record<string, string> = {
      string: '#238636', textarea: '#238636', reference: '#1f6feb',
      picklist: '#9e6a03', boolean: '#8957e5', currency: '#cf222e',
      date: '#0550ae', datetime: '#0550ae', double: '#cf222e',
      int: '#cf222e', email: '#238636', phone: '#238636', id: '#484f58'
    }
    return c[type.toLowerCase()] || '#484f58'
  }

  const riskScore = (s: DependencySummary) => {
    let score = 0
    score += s.apexClasses.length * 15
    score += s.apexTriggers.length * 15
    score += s.flows.length * 10
    score += s.validationRules.length * 8
    score += s.workflowRules.length * 8
    score += s.layouts.length * 3
    score += s.reports.length * 3
    score += s.other.length * 5
    score = Math.min(100, score)
    if (score >= 60) return { score, color: '#cf222e', label: 'High Risk', emoji: '🔴' }
    if (score >= 25) return { score, color: '#e3b341', label: 'Medium Risk', emoji: '🟡' }
    return { score, color: '#238636', label: 'Low Risk', emoji: '🟢' }
  }

  const filteredObjects = objects.filter(o =>
    o.label.toLowerCase().includes(search.toLowerCase()) ||
    o.name.toLowerCase().includes(search.toLowerCase())
  )
  const filteredFields = fields.filter(f =>
    f.label.toLowerCase().includes(fieldSearch.toLowerCase()) ||
    f.name.toLowerCase().includes(fieldSearch.toLowerCase())
  )

  const containerStyle = {
    width: '380px', height: '580px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    background: '#0f1117', color: '#ffffff',
    display: 'flex', flexDirection: 'column' as const,
    boxSizing: 'border-box' as const
  }

  const SummaryRow = ({ icon, label, items, color, type }: { icon: string, label: string, items: {name:string,id:string}[], color: string, type: string }) => {
    const [expanded, setExpanded] = useState(false)
    if (items.length === 0) return null
    const isClickable = ['ApexClass', 'ApexTrigger', 'Flow', 'ValidationRule'].includes(type)
    return (
      <div style={{ marginBottom: '6px' }}>
        <div onClick={() => setExpanded(!expanded)} style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '8px 12px', background: '#161b22',
          border: `1px solid ${color}33`, borderRadius: '8px',
          cursor: 'pointer'
        }}>
          <span style={{ fontSize: '14px' }}>{icon}</span>
          <span style={{ fontSize: '12px', fontWeight: '600', flex: 1 }}>{label}</span>
          <span style={{ fontSize: '11px', background: color + '22', color, padding: '2px 8px', borderRadius: '10px' }}>{items.length}</span>
          <span style={{ fontSize: '10px', color: '#8b949e' }}>{expanded ? '▲' : '▼'}</span>
        </div>
        {expanded && (
          <div style={{ padding: '4px 8px', background: '#0d1117', borderRadius: '0 0 8px 8px', border: `1px solid ${color}22`, borderTop: 'none' }}>
            {items.map(item => (
              <div key={item.id} 
                onClick={isClickable ? () => handleComponentClick(item.name, type) : undefined}
                style={{ 
                  padding: '7px 8px', fontSize: '11px', color: isClickable ? color : '#8b949e',
                  borderBottom: '1px solid #21262d', cursor: isClickable ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}>
                <span>{item.name}</span>
                {isClickable && <span style={{ fontSize: '10px', color: '#8b949e' }}>✨ explain</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (!connected) {
    return (
      <div style={{ ...containerStyle, alignItems: 'center', justifyContent: 'center', padding: '40px 32px' }}>
        <div style={{ width: '64px', height: '64px', background: 'linear-gradient(135deg, #00a1e0, #032d60)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', marginBottom: '24px' }}>⚡</div>
        <h1 style={{ fontSize: '22px', fontWeight: '700', margin: '0 0 8px 0', textAlign: 'center' }}>SF Doc Studio</h1>
        <p style={{ fontSize: '13px', color: '#8b949e', textAlign: 'center', margin: '0 0 40px 0', lineHeight: '1.5' }}>AI-powered Impact Analyzer &<br />Documentation for Salesforce orgs</p>
        <button onClick={handleConnect} disabled={connecting} style={{ width: '100%', padding: '14px', background: connecting ? '#1a3a5c' : 'linear-gradient(135deg, #00a1e0, #032d60)', color: '#ffffff', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: '600', cursor: connecting ? 'not-allowed' : 'pointer' }}>
          {connecting ? 'Connecting...' : '🔗 Connect to Salesforce'}
        </button>
      </div>
    )
  }

  // Impact View
  if (view === 'impact' && selectedField && selectedObject) {
    const risk = depSummary ? riskScore(depSummary) : null
    const DepSection = ({ title, icon, items, color }: { title: string, icon: string, items: {name:string,id:string}[], color: string }) => {
      if (items.length === 0) return null
      return (
        <div style={{ marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px' }}>
            <span>{icon}</span>
            <span style={{ fontSize: '12px', fontWeight: '600', color }}>{title}</span>
            <span style={{ fontSize: '10px', background: color + '22', color, padding: '1px 6px', borderRadius: '10px', marginLeft: 'auto' }}>{items.length}</span>
          </div>
          {items.map(item => (
            <div key={item.id} style={{ padding: '6px 10px', background: '#161b22', border: `1px solid ${color}33`, borderRadius: '6px', marginBottom: '3px', fontSize: '12px' }}>{item.name}</div>
          ))}
        </div>
      )
    }
    return (
      <div style={containerStyle}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #21262d', display: 'flex', alignItems: 'center', gap: '10px', background: '#0d1117' }}>
          <button onClick={() => { setView('object-doc'); setActiveTab('fields') }} style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: '18px', padding: '0' }}>←</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: '700' }}>Impact Analysis</div>
            <div style={{ fontSize: '11px', color: '#8b949e' }}>{selectedObject.name}.{selectedField.name}</div>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
          <div style={{ background: '#161b22', border: `1px solid ${risk ? risk.color + '44' : '#21262d'}`, borderRadius: '10px', padding: '14px', marginBottom: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '13px', fontWeight: '700' }}>Risk Score</span>
              {risk && <span style={{ fontSize: '13px', color: risk.color, fontWeight: '700' }}>{risk.emoji} {risk.label}</span>}
            </div>
            {risk && (
              <>
                <div style={{ background: '#21262d', borderRadius: '4px', height: '6px', overflow: 'hidden', marginBottom: '8px' }}>
                  <div style={{ width: `${risk.score}%`, height: '100%', background: risk.color, borderRadius: '4px' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#8b949e' }}>
                  <span>{depSummary!.total} total dependencies</span>
                  <span>{risk.score}/100</span>
                </div>
              </>
            )}
            {loadingDeps && <div style={{ fontSize: '12px', color: '#8b949e', textAlign: 'center', padding: '8px' }}>🔍 Scanning org...</div>}
          </div>
          {depSummary && !loadingDeps && (
            <div style={{ marginBottom: '10px' }}>
              {!aiExplanation && !loadingAi && !showApiKey && (
                <button onClick={() => handleAiExplain()} style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'linear-gradient(135deg, #6e40c9, #1f6feb)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
                  ✨ Explain with AI
                </button>
              )}
              {showApiKey && !aiExplanation && (
                <div style={{ background: '#161b22', borderRadius: '8px', padding: '12px', border: '1px solid #6e40c944' }}>
                  <div style={{ fontSize: '11px', color: '#8b949e', marginBottom: '6px' }}>Enter your Anthropic API key</div>
                  <input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-ant-..." type="password"
                    style={{ width: '100%', padding: '7px 10px', background: '#0d1117', border: '1px solid #30363d', borderRadius: '6px', color: '#fff', fontSize: '12px', boxSizing: 'border-box', outline: 'none', marginBottom: '8px' }} />
                  <button onClick={() => { if (pendingComponent) { setShowApiKey(false); handleComponentClick(pendingComponent.name, pendingComponent.type); setPendingComponent(null) } else { handleAiExplain() } }} disabled={!apiKey} style={{ width: '100%', padding: '8px', borderRadius: '6px', background: apiKey ? 'linear-gradient(135deg, #6e40c9, #1f6feb)' : '#21262d', color: '#fff', border: 'none', cursor: apiKey ? 'pointer' : 'not-allowed', fontSize: '12px', fontWeight: '600' }}>
                    ✨ Analyze
                  </button>
                </div>
              )}
              {loadingAi && <div style={{ padding: '12px', background: '#161b22', borderRadius: '8px', border: '1px solid #6e40c944', textAlign: 'center', fontSize: '12px', color: '#8b949e' }}>✨ Claude is analyzing...</div>}
              {aiExplanation && (
                <div style={{ padding: '12px', background: '#161b22', borderRadius: '8px', border: '1px solid #6e40c944' }}>
                  <div style={{ fontSize: '11px', color: '#6e40c9', fontWeight: '700', marginBottom: '6px' }}>✨ AI ANALYSIS</div>
                  <div style={{ fontSize: '12px', lineHeight: '1.6', color: '#e6edf3' }}>{aiExplanation}</div>
                </div>
              )}
            </div>
          )}
          <div style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: '8px', padding: '10px 12px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '11px', color: '#8b949e' }}>Analyzing field</div>
              <div style={{ fontSize: '13px', fontWeight: '600' }}>{selectedField.label}</div>
            </div>
            <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', background: typeColor(selectedField.type) + '22', color: typeColor(selectedField.type), fontFamily: 'monospace' }}>{selectedField.type}</span>
          </div>
          {depSummary && depSummary.total === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', background: '#161b22', borderRadius: '10px', border: '1px solid #238636' }}>
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>✅</div>
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#238636' }}>No dependencies found</div>
              <div style={{ fontSize: '12px', color: '#8b949e', marginTop: '4px' }}>Safe to modify or delete</div>
            </div>
          ) : depSummary ? (
            <div>
              <div style={{ fontSize: '11px', color: '#8b949e', marginBottom: '8px', fontWeight: '600' }}>DEPENDENCIES</div>
              <DepSection title="Flows" icon="🔀" items={depSummary.flows} color="#1f6feb" />
              <DepSection title="Apex Classes" icon="{ }" items={depSummary.apexClasses} color="#8957e5" />
              <DepSection title="Apex Triggers" icon="⚡" items={depSummary.apexTriggers} color="#e3b341" />
              <DepSection title="Validation Rules" icon="✔️" items={depSummary.validationRules} color="#238636" />
              <DepSection title="Workflow Rules" icon="⚙️" items={depSummary.workflowRules} color="#9e6a03" />
              <DepSection title="Page Layouts" icon="📄" items={depSummary.layouts} color="#0550ae" />
              <DepSection title="Reports" icon="📊" items={depSummary.reports} color="#cf222e" />
              <DepSection title="Email Templates" icon="✉️" items={depSummary.emailTemplates} color="#0550ae" />
              <DepSection title="Other" icon="📦" items={depSummary.other} color="#484f58" />
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  // Component Detail View (Apex Class / Flow deep explanation)
  if (selectedComponent && view === 'object-doc' && activeTab === 'overview') {
    const typeColor = selectedComponent.type === 'ApexClass' ? '#8957e5' 
      : selectedComponent.type === 'ApexTrigger' ? '#e3b341'
      : selectedComponent.type === 'Flow' ? '#1f6feb' : '#484f58'
    const typeIcon = selectedComponent.type === 'ApexClass' ? '{ }'
      : selectedComponent.type === 'ApexTrigger' ? '⚡'
      : selectedComponent.type === 'Flow' ? '🔀' : '📦'

    return (
      <div style={containerStyle}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #21262d', display: 'flex', alignItems: 'center', gap: '10px', background: '#0d1117' }}>
          <button onClick={() => setSelectedComponent(null)} style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: '18px', padding: '0' }}>←</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: '700' }}>{typeIcon} {selectedComponent.name}</div>
            <div style={{ fontSize: '11px', color: typeColor }}>{selectedComponent.type}</div>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '12px' }}>
          {loadingComponent ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <div style={{ fontSize: '24px', marginBottom: '12px' }}>✨</div>
              <div style={{ fontSize: '13px', color: '#8b949e' }}>Claude is reading the code...</div>
              <div style={{ fontSize: '11px', color: '#484f58', marginTop: '4px' }}>This may take 10-15 seconds</div>
            </div>
          ) : componentExplanation ? (
            <div style={{ padding: '12px', background: '#161b22', borderRadius: '8px', border: `1px solid ${typeColor}44` }}>
              <div style={{ fontSize: '11px', color: typeColor, fontWeight: '700', marginBottom: '8px' }}>✨ AI CODE ANALYSIS</div>
              <div style={{ fontSize: '12px', lineHeight: '1.7', color: '#e6edf3', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{componentExplanation}</div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px', color: '#8b949e', fontSize: '12px' }}>
              Loading...
            </div>
          )}
        </div>
      </div>
    )
  }

  // Object Documentation View
  if (view === 'object-doc' && selectedObject) {
    return (
      <div style={containerStyle}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #21262d', display: 'flex', alignItems: 'center', gap: '10px', background: '#0d1117' }}>
          <button onClick={() => setView('objects')} style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: '18px', padding: '0' }}>←</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '14px', fontWeight: '700' }}>{selectedObject.label}</div>
            <div style={{ fontSize: '11px', color: '#8b949e' }}>{selectedObject.name}</div>
          </div>
          {selectedObject.custom && <span style={{ fontSize: '10px', background: '#032d60', color: '#00a1e0', padding: '2px 6px', borderRadius: '4px' }}>Custom</span>}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #21262d' }}>
          {(['overview', 'fields', 'save-sequence'] as const).map(tab => (
            <button key={tab} onClick={() => { setActiveTab(tab); setSelectedComponent(null); setComponentExplanation('') }} style={{
              flex: 1, padding: '10px', background: 'none', border: 'none',
              borderBottom: activeTab === tab ? '2px solid #00a1e0' : '2px solid transparent',
              color: activeTab === tab ? '#00a1e0' : '#8b949e',
              cursor: 'pointer', fontSize: '12px', fontWeight: '600',
              textTransform: 'capitalize'
            }}>{tab === 'save-sequence' ? '⚡ Save Sequence' : tab}</button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
          {activeTab === 'overview' && (
            <>
              {/* Stats Row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                {[
                  { label: 'Fields', value: loadingFields ? '...' : fields.length, color: '#00a1e0' },
                  { label: 'Automations', value: loadingObjSummary ? '...' : (objSummary ? objSummary.flows.length + objSummary.apexClasses.length + objSummary.apexTriggers.length + objSummary.validationRules.length + objSummary.workflowRules.length + objSummary.layouts.length + objSummary.reports.length + objSummary.emailTemplates.length + objSummary.other.length : 0), color: '#8957e5' },
                  { label: 'Layouts', value: loadingObjSummary ? '...' : (objSummary?.layouts.length || 0), color: '#238636' }
                ].map(stat => (
                  <div key={stat.label} style={{ background: '#161b22', borderRadius: '8px', padding: '10px', textAlign: 'center', border: `1px solid ${stat.color}33` }}>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: stat.color }}>{stat.value}</div>
                    <div style={{ fontSize: '10px', color: '#8b949e' }}>{stat.label}</div>
                  </div>
                ))}
              </div>

              {/* AI Explain Object */}
              {!aiExplanation && !loadingAi && !showApiKey && (
                <button onClick={() => handleAiExplain('object')} style={{
                  width: '100%', padding: '10px', borderRadius: '8px',
                  background: 'linear-gradient(135deg, #6e40c9, #1f6feb)',
                  color: '#fff', border: 'none', cursor: 'pointer',
                  fontSize: '13px', fontWeight: '600', marginBottom: '12px'
                }}>
                  ✨ Explain this object with AI
                </button>
              )}
              {showApiKey && !aiExplanation && (
                <div style={{ background: '#161b22', borderRadius: '8px', padding: '12px', border: '1px solid #6e40c944', marginBottom: '12px' }}>
                  <div style={{ fontSize: '11px', color: '#8b949e', marginBottom: '6px' }}>Enter your Anthropic API key</div>
                  <input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-ant-..." type="password"
                    style={{ width: '100%', padding: '7px 10px', background: '#0d1117', border: '1px solid #30363d', borderRadius: '6px', color: '#fff', fontSize: '12px', boxSizing: 'border-box', outline: 'none', marginBottom: '8px' }} />
                  <button onClick={() => { if (pendingComponent) { setShowApiKey(false); handleComponentClick(pendingComponent.name, pendingComponent.type); setPendingComponent(null) } else { handleAiExplain('object') } }} disabled={!apiKey} style={{ width: '100%', padding: '8px', borderRadius: '6px', background: apiKey ? 'linear-gradient(135deg, #6e40c9, #1f6feb)' : '#21262d', color: '#fff', border: 'none', cursor: apiKey ? 'pointer' : 'not-allowed', fontSize: '12px', fontWeight: '600' }}>
                    ✨ Analyze
                  </button>
                </div>
              )}
              {loadingAi && (
                <div style={{ padding: '12px', background: '#161b22', borderRadius: '8px', border: '1px solid #6e40c944', textAlign: 'center', fontSize: '12px', color: '#8b949e', marginBottom: '12px' }}>
                  ✨ Claude is analyzing...
                </div>
              )}
              {aiExplanation && (
                <div style={{ padding: '12px', background: '#161b22', borderRadius: '8px', border: '1px solid #6e40c944', marginBottom: '12px' }}>
                  <div style={{ fontSize: '11px', color: '#6e40c9', fontWeight: '700', marginBottom: '6px' }}>✨ AI DOCUMENTATION</div>
                  <div style={{ fontSize: '12px', lineHeight: '1.6', color: '#e6edf3', whiteSpace: 'pre-wrap' }}>{aiExplanation}</div>
                </div>
              )}

              {/* Automations */}
              {loadingObjSummary ? (
                <div style={{ textAlign: 'center', padding: '20px', color: '#8b949e', fontSize: '12px' }}>🔍 Scanning automations...</div>
              ) : objSummary ? (
                <>
                  <div style={{ fontSize: '11px', color: '#8b949e', marginBottom: '8px', fontWeight: '600' }}>AUTOMATIONS & REFERENCES</div>
                  <SummaryRow icon="🔀" label="Flows" items={objSummary.flows} color="#1f6feb" type="Flow" />
                  <SummaryRow icon="{ }" label="Apex Classes" items={objSummary.apexClasses} color="#8957e5" type="ApexClass" />
                  <SummaryRow icon="⚡" label="Apex Triggers" items={objSummary.apexTriggers} color="#e3b341" type="ApexTrigger" />
                  <SummaryRow icon="✔️" label="Validation Rules" items={objSummary.validationRules} color="#238636" type="ValidationRule" />
                  <SummaryRow icon="⚙️" label="Workflow Rules" items={objSummary.workflowRules} color="#9e6a03" type="WorkflowRule" />
                  <SummaryRow icon="📄" label="Page Layouts" items={objSummary.layouts} color="#0550ae" type="Layout" />
                  <SummaryRow icon="📊" label="Reports" items={objSummary.reports} color="#cf222e" type="Report" />
                  <SummaryRow icon="✉️" label="Email Templates" items={objSummary.emailTemplates} color="#0550ae" type="EmailTemplate" />
                  {objSummary.total === 0 && (
                    <div style={{ textAlign: 'center', padding: '20px', color: '#8b949e', fontSize: '12px' }}>No automations found</div>
                  )}
                </>
              ) : null}
            </>
          )}

          {activeTab === 'save-sequence' && (
            <div>
              {!saveSequence && !loadingSaveSequence && (
                <button onClick={async () => {
                  if (!apiKey) { setShowApiKey(true); return }
                  setLoadingSaveSequence(true)
                  try {
                    const data = await fetchSaveSequence(instanceUrl, accessToken, selectedObject!.name)
                    const explanation = await explainSaveSequence(selectedObject!.name, data, apiKey)
                    setSaveSequence(explanation)
                  } catch(e) {
                    setSaveSequence('Failed: ' + (e as Error).message)
                  }
                  setLoadingSaveSequence(false)
                }} style={{
                  width: '100%', padding: '12px', borderRadius: '8px',
                  background: 'linear-gradient(135deg, #e3b341, #9e6a03)',
                  color: '#fff', border: 'none', cursor: 'pointer',
                  fontSize: '13px', fontWeight: '600', marginBottom: '12px'
                }}>
                  ⚡ Generate Save Sequence
                </button>
              )}
              {loadingSaveSequence && (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <div style={{ fontSize: '24px', marginBottom: '12px' }}>⚡</div>
                  <div style={{ fontSize: '13px', color: '#8b949e' }}>Analyzing save sequence...</div>
                </div>
              )}
              {saveSequence && (
                <div style={{ padding: '12px', background: '#161b22', borderRadius: '8px', border: '1px solid #e3b34144' }}>
                  <div style={{ fontSize: '11px', color: '#e3b341', fontWeight: '700', marginBottom: '8px' }}>⚡ SAVE SEQUENCE ANALYSIS</div>
                  <div style={{ fontSize: '12px', lineHeight: '1.7', color: '#e6edf3', whiteSpace: 'pre-wrap' }}>{saveSequence}</div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'fields' && (
            <>
              <div style={{ marginBottom: '8px' }}>
                <input value={fieldSearch} onChange={e => setFieldSearch(e.target.value)} placeholder="Search fields... click any to analyze impact"
                  style={{ width: '100%', padding: '7px 10px', background: '#1a2332', border: '1px solid #30363d', borderRadius: '8px', color: '#ffffff', fontSize: '12px', boxSizing: 'border-box', outline: 'none' }} />
              </div>
              {loadingFields ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#8b949e' }}>Loading fields...</div>
              ) : (
                filteredFields.map(field => (
                  <div key={field.name} onClick={() => handleSelectField(field)} style={{ padding: '8px 12px', borderRadius: '6px', marginBottom: '3px', background: '#161b22', border: '1px solid #21262d', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: '600' }}>{field.label}</div>
                      <div style={{ fontSize: '11px', color: '#8b949e' }}>{field.name}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      {field.custom && <span style={{ fontSize: '9px', background: '#032d60', color: '#00a1e0', padding: '1px 5px', borderRadius: '3px' }}>Custom</span>}
                      <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: typeColor(field.type) + '22', color: typeColor(field.type), fontFamily: 'monospace' }}>{field.type}</span>
                    </div>
                  </div>
                ))
              )}
              <div style={{ padding: '8px', fontSize: '11px', color: '#484f58', textAlign: 'center' }}>
                {filteredFields.length} fields · click any to analyze impact
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  // Objects List View
  return (
    <div style={containerStyle}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #21262d', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontSize: '20px' }}>⚡</span>
        <div>
          <div style={{ fontSize: '13px', fontWeight: '700' }}>SF Doc Studio</div>
          <div style={{ fontSize: '11px', color: '#00c851' }}>● Connected</div>
        </div>
      </div>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #21262d' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search objects..."
          style={{ width: '100%', padding: '8px 12px', background: '#1a2332', border: '1px solid #30363d', borderRadius: '8px', color: '#ffffff', fontSize: '13px', boxSizing: 'border-box', outline: 'none' }} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#8b949e' }}>Loading objects...</div>
        ) : (
          filteredObjects.map(obj => (
            <div key={obj.name} onClick={() => handleSelectObject(obj)} style={{ padding: '10px 12px', borderRadius: '8px', marginBottom: '4px', cursor: 'pointer', background: '#161b22', border: '1px solid #21262d', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '600' }}>{obj.label}</div>
                <div style={{ fontSize: '11px', color: '#8b949e' }}>{obj.name}</div>
              </div>
              {obj.custom && <span style={{ fontSize: '10px', background: '#032d60', color: '#00a1e0', padding: '2px 6px', borderRadius: '4px' }}>Custom</span>}
            </div>
          ))
        )}
      </div>
      <div style={{ padding: '10px 16px', borderTop: '1px solid #21262d', fontSize: '11px', color: '#484f58', textAlign: 'center' }}>
        {objects.length} objects · {filteredObjects.length} shown
      </div>
    </div>
  )
}

export default App
