// SF Doc Studio - report page
// Shows the most recently exported report, which the side panel saved to local storage.
chrome.storage.local.get('sfdsReport', ({ sfdsReport }) => {
  if (!sfdsReport) {
    document.body.textContent = 'No report found. Open SF Doc Studio, pick an object, and click Export.';
    return;
  }
  // DOMParser builds an inert document: nothing in it runs.
  const doc = new DOMParser().parseFromString(sfdsReport, 'text/html');
  document.title = doc.title || 'SF Doc Report';
  doc.querySelectorAll('style').forEach(s => document.head.appendChild(document.importNode(s, true)));
  document.body.replaceChildren(...[...doc.body.childNodes].map(n => document.importNode(n, true)));
  document.querySelector('.print-btn')?.addEventListener('click', () => window.print());
});
