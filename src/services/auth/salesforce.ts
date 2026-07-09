const CLIENT_ID = import.meta.env.VITE_SF_CLIENT_ID || ''

export function startSalesforceOAuth(
  onSuccess: (accessToken: string, instanceUrl: string) => void,
  onError: (error: string) => void
) {
  chrome.runtime.sendMessage(
    { type: 'START_OAUTH', clientId: CLIENT_ID },
    (response) => {
      if (response?.error) {
        onError(response.error)
      } else if (response?.accessToken) {
        chrome.storage.local.set({
          accessToken: response.accessToken,
          instanceUrl: response.instanceUrl
        })
        onSuccess(response.accessToken, response.instanceUrl)
      }
    }
  )
}