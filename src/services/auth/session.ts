export interface SFSession {
  instanceUrl: string
  accessToken: string
}

function send<T>(message: object): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
      else resolve(response as T)
    })
  })
}

// Every Salesforce org the user is logged in to in this browser.
export async function listSalesforceSessions(): Promise<SFSession[]> {
  const r = await send<{ sessions?: SFSession[], error?: string }>({ type: 'LIST_SESSIONS' })
  if (r?.error) throw new Error(r.error)
  return r?.sessions || []
}

// The live session for one org, or null if the user is no longer logged in there.
export async function getSalesforceSession(instanceUrl: string): Promise<SFSession | null> {
  const r = await send<Partial<SFSession> & { error?: string }>({ type: 'GET_SESSION', instanceUrl })
  return r?.accessToken && r.instanceUrl ? { instanceUrl: r.instanceUrl, accessToken: r.accessToken } : null
}
