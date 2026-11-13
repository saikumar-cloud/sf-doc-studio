// SF Doc Studio - background service worker
// Reads the user's existing Salesforce session and makes all network calls to Salesforce and Anthropic.

const API_VERSION = 'v62.0';
const DEFAULT_MODEL = 'claude-sonnet-4-6';

// Only ever send a Salesforce access token to a Salesforce-owned HTTPS host.
function assertSalesforceUrl(instanceUrl) {
  let u;
  try { u = new URL(instanceUrl); } catch { throw new Error('Invalid Salesforce URL'); }
  if (u.protocol !== 'https:' || !u.hostname.endsWith('.salesforce.com')) {
    throw new Error('Invalid Salesforce URL');
  }
  return u.origin;
}

async function sfGet(instanceUrl, accessToken, path) {
  const origin = assertSalesforceUrl(instanceUrl);
  if (!path.startsWith('/services/data/')) throw new Error('Invalid API path');
  return fetch(origin + path, { headers: { Authorization: `Bearer ${accessToken}` } });
}

async function toolingQuery(instanceUrl, accessToken, soql) {
  const r = await sfGet(instanceUrl, accessToken,
    `/services/data/${API_VERSION}/tooling/query?q=${encodeURIComponent(soql)}`);
  if (r.status === 401) return { records: [], expired: true };
  const data = await r.json().catch(() => ({}));
  return { records: data.records || [] };
}

async function handleFlowMetadata(instanceUrl, accessToken, flowId, flowInfo) {
  try {
    if (!/^[a-zA-Z0-9]{15,18}$/.test(flowId)) throw new Error('Invalid flow id');
    const info = JSON.parse(flowInfo);

    const { records } = await toolingQuery(instanceUrl, accessToken,
      `SELECT Id, MasterLabel, Description, ProcessType, Status, ApiVersion FROM Flow WHERE Id='${flowId}' LIMIT 1`);
    const flow = records[0] || {};

    // The Flow sobject's Metadata field holds the full flow definition.
    const metaResp = await sfGet(instanceUrl, accessToken,
      `/services/data/${API_VERSION}/tooling/sobjects/Flow/${flowId}`);
    const metaData = await metaResp.json();
    const m = metaData.Metadata || {};

    return {
      metadata: JSON.stringify({
        info: { ...info, ...flow },
        actions: (m.actionCalls || []).map(a => ({ name: a.name, label: a.label, actionType: a.actionType, actionName: a.actionName })),
        decisions: (m.decisions || []).map(d => ({ name: d.name, label: d.label })),
        assignments: (m.assignments || []).map(a => ({ name: a.name, label: a.label })),
        loops: (m.loops || []).map(l => ({ name: l.name, label: l.label })),
        subflows: (m.subflows || []).map(s => ({ name: s.name, label: s.label, flowName: s.flowName })),
        start: m.start || {},
        variables: (m.variables || []).map(v => ({ name: v.name, dataType: v.dataType, isInput: v.isInput, isOutput: v.isOutput }))
      })
    };
  } catch {
    return { metadata: flowInfo };
  }
}

// --- Sign-in: reuse the Salesforce session the user already has in this browser ---
// Salesforce stores the session id in the "sid" cookie on the org's My Domain host
// (for example acme.my.salesforce.com). That value works as an API bearer token.

function cookieHost(cookie) {
  return cookie.domain.replace(/^\./, '').toLowerCase();
}

async function validateSession(host, sid) {
  try {
    const r = await sfGet(`https://${host}`, sid, `/services/data/${API_VERSION}/limits/`);
    return r.ok;
  } catch {
    return false;
  }
}

// Find every org the user is currently logged in to.
async function listSessions() {
  const cookies = await chrome.cookies.getAll({ name: 'sid', domain: 'salesforce.com', secure: true });
  const byHost = new Map();
  for (const c of cookies) {
    const host = cookieHost(c);
    if (host.endsWith('.my.salesforce.com') && c.value) byHost.set(host, c.value);
  }
  const checked = await Promise.all([...byHost].map(async ([host, sid]) =>
    (await validateSession(host, sid)) ? { instanceUrl: `https://${host}`, accessToken: sid } : null));
  return { sessions: checked.filter(Boolean) };
}

// Get the current session for one org (used when the popup re-opens).
async function getSession(instanceUrl) {
  const origin = assertSalesforceUrl(instanceUrl);
  const cookie = await chrome.cookies.get({ url: origin + '/', name: 'sid' });
  if (!cookie?.value) return { error: 'NO_SESSION' };
  if (!(await validateSession(new URL(origin).hostname, cookie.value))) return { error: 'NO_SESSION' };
  return { instanceUrl: origin, accessToken: cookie.value };
}

async function handleMessage(message) {
  switch (message.type) {
    case 'LIST_SESSIONS':
      return listSessions();

    case 'GET_SESSION':
      return getSession(message.instanceUrl);

    case 'TOOLING_QUERY':
      return toolingQuery(message.instanceUrl, message.accessToken, message.soql);

    case 'FETCH_FLOW_METADATA':
      return handleFlowMetadata(message.instanceUrl, message.accessToken, message.flowId, message.flowInfo);

    case 'FETCH_REST': {
      const r = await sfGet(message.instanceUrl, message.accessToken, message.path);
      return { data: await r.json() };
    }

    case 'AI_EXPLAIN': {
      if (!message.apiKey) return { error: 'No Anthropic API key set. Add one in Settings.' };
      const stored = await chrome.storage.local.get('anthropicModel');
      const model = (stored.anthropicModel || '').trim() || DEFAULT_MODEL;
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': message.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model,
          max_tokens: 6000,
          messages: [{ role: 'user', content: message.prompt }]
        })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        const detail = data?.error?.message || `HTTP ${r.status}`;
        if (r.status === 401) return { error: 'Anthropic rejected the API key. Check it in Settings.' };
        if (r.status === 404) return { error: `Model "${model}" is not available. Change it in Settings.` };
        return { error: `Anthropic API error: ${detail}` };
      }
      return { text: data.content?.[0]?.text || 'No response' };
    }

    default:
      return { error: 'Unknown message type' };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only accept messages from this extension's own pages.
  if (sender.id !== chrome.runtime.id) return false;
  handleMessage(message)
    .then(sendResponse)
    .catch(err => sendResponse({ error: err.message }));
  return true;
});
