console.log('SF Doc Studio background started');

async function handleFlowMetadata(instanceUrl, accessToken, flowId, flowInfo) {
  try {
    const flowInfo2 = JSON.parse(flowInfo)
    const flowApiName = flowInfo2.MasterLabel?.replace(/\s+/g, '_') || ''
    
    // Get basic flow info
    const flowResp = await fetch(
      `${instanceUrl}/services/data/v62.0/tooling/query?q=${encodeURIComponent(`SELECT Id, MasterLabel, Description, ProcessType, Status, ApiVersion FROM Flow WHERE Id='${flowId}' LIMIT 1`)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const flowData = await flowResp.json()
    const flow = flowData.records?.[0] || {}
    console.log('Flow info:', flow.MasterLabel, flow.ProcessType, flow.Status)

    // Get flow definition for API name
    const defResp = await fetch(
      `${instanceUrl}/services/data/v62.0/tooling/query?q=${encodeURIComponent(`SELECT Id, ApiName, ActiveVersionId FROM FlowDefinition WHERE ActiveVersionId='${flowId}' LIMIT 1`)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const defData = await defResp.json()
    const apiName = defData.records?.[0]?.ApiName || flowApiName
    console.log('Flow API name:', apiName)

    // Fetch full flow metadata via REST - includes Metadata field with full definition
    const metaResp = await fetch(
      `${instanceUrl}/services/data/v62.0/tooling/sobjects/Flow/${flowId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const metaData = await metaResp.json()
    console.log('Flow sobject keys:', Object.keys(metaData).join(', '))
    
    // Extract useful metadata
    const flowMeta = metaData.Metadata || {}
    const actions = (flowMeta.actionCalls || []).map(a => ({ name: a.name, label: a.label, actionType: a.actionType, actionName: a.actionName }))
    const decisions = (flowMeta.decisions || []).map(d => ({ name: d.name, label: d.label }))
    const assignments = (flowMeta.assignments || []).map(a => ({ name: a.name, label: a.label }))
    const loops = (flowMeta.loops || []).map(l => ({ name: l.name, label: l.label }))
    const subflows = (flowMeta.subflows || []).map(s => ({ name: s.name, label: s.label, flowName: s.flowName }))
    const start = flowMeta.start || {}
    const variables = (flowMeta.variables || []).map(v => ({ name: v.name, dataType: v.dataType, isInput: v.isInput, isOutput: v.isOutput }))
    
    console.log('Extracted - actions:', actions.length, 'decisions:', decisions.length, 'assignments:', assignments.length)
    
    const metadata = JSON.stringify({
      info: { ...flowInfo2, ...flow },
      actions,
      decisions,
      assignments,
      loops,
      subflows,
      start,
      variables
    })
    return { metadata }
  } catch(err) {
    console.error('Flow metadata error:', err)
    return { metadata: flowInfo }
  }
}

async function handleMessage(message) {
  if (message.type === 'START_OAUTH') {
    return new Promise((resolve) => {
      const redirectUri = `https://${chrome.runtime.id}.chromiumapp.org/`;
      const authUrl =
        `https://login.salesforce.com/services/oauth2/authorize` +
        `?response_type=token` +
        `&client_id=${message.clientId}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=api%20id`;
      chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, (redirectUrl) => {
        if (chrome.runtime.lastError || !redirectUrl) {
          resolve({ error: chrome.runtime.lastError?.message || 'No redirect' });
          return;
        }
        const hash = new URL(redirectUrl).hash.substring(1);
        const params = new URLSearchParams(hash);
        resolve({ accessToken: params.get('access_token'), instanceUrl: params.get('instance_url') });
      });
    });
  }

  if (message.type === 'TOOLING_QUERY') {
    const { instanceUrl, accessToken, soql } = message;
    const r = await fetch(`${instanceUrl}/services/data/v62.0/tooling/query?q=${encodeURIComponent(soql)}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const data = await r.json();
    console.log('Query:', soql.substring(0, 60), '→', data.totalSize ?? 0);
    return { records: data.records || [] };
  }

  if (message.type === 'FETCH_FLOW_METADATA') {
    const { instanceUrl, accessToken, flowId, flowInfo } = message;
    return handleFlowMetadata(instanceUrl, accessToken, flowId, flowInfo);
  }

  if (message.type === 'VALIDATE_TOKEN') {
    const { instanceUrl, accessToken } = message;
    try {
      const r = await fetch(instanceUrl + '/services/data/v62.0/sobjects/', {
        headers: { Authorization: 'Bearer ' + accessToken }
      });
      sendResponse({ valid: r.ok });
    } catch(e) {
      sendResponse({ valid: false });
    }
    return true;
  }

  if (message.type === 'FETCH_REST') {
    const { instanceUrl, accessToken, path } = message;
    const r = await fetch(`${instanceUrl}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const data = await r.json();
    return { data };
  }

  if (message.type === 'AI_EXPLAIN') {
    const effectiveKey = message.apiKey || '';
    console.log('Key length:', effectiveKey.length, 'preview:', effectiveKey.substring(0,20));
    console.log('AI_EXPLAIN received, apiKey length:', message.apiKey?.length, 'first 15 chars:', message.apiKey?.substring(0,15));
    const { prompt, apiKey } = message;
    console.log('API key received, length:', apiKey?.length, 'starts with:', apiKey?.substring(0,10));
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': message.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 6000,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await r.json();
    console.log('AI response status:', r.status);
    if (!r.ok) return { error: `API error: ${r.status} ${JSON.stringify(data)}` };
    return { text: data.content?.[0]?.text || 'No response' };
  }

  return { error: 'Unknown message type' };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch(err => sendResponse({ error: err.message }));
  return true;
});
