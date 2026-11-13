// SF Doc Studio - page button
// Adds a small tab on the right edge of Salesforce pages that opens the side panel.
// It does not read or change anything on the page.
(() => {
  if (window.top !== window || document.getElementById('sf-doc-studio-launcher')) return;

  const host = document.createElement('div');
  host.id = 'sf-doc-studio-launcher';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>
      button {
        all: initial;
        position: fixed; right: 0; top: 45%; z-index: 2147483000;
        width: 30px; height: 40px;
        display: flex; align-items: center; justify-content: center;
        background: #032d60; border-radius: 10px 0 0 10px;
        box-shadow: 0 2px 8px rgba(0,0,0,.3);
        cursor: pointer; opacity: .85;
        transition: width .15s ease, opacity .15s ease;
      }
      button:hover, button:focus-visible { width: 38px; opacity: 1; }
      button:focus-visible { outline: 2px solid #00a1e0; }
      svg { width: 18px; height: 18px; }
    </style>
    <button type="button" title="Open SF Doc Studio" aria-label="Open SF Doc Studio">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#1ab0f5" d="M13.5 2 4.5 13.5h6L9 22l10-12.5h-6.5z"/></svg>
    </button>`;

  shadow.querySelector('button').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_PANEL' }, () => void chrome.runtime.lastError);
  });

  const apply = (show) => {
    if (show === false) host.remove();
    else if (!host.isConnected) document.documentElement.appendChild(host);
  };
  chrome.storage.local.get('showPageButton', (r) => apply(r.showPageButton));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && 'showPageButton' in changes) apply(changes.showPageButton.newValue);
  });
})();
