const CLIENT_ID = '3MVG9XgkMlifdwVAd_Iq0rT000LJK1w9dcQaWN9QcQWl2eMgqigkP.WXUxWvKNUYf5A50cKnacVPv38YgmoON'

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