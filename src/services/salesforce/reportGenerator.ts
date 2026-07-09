export function generateHtmlReport(
  obj: { name: string, label: string, custom: boolean },
  fields: any[],
  objSummary: any,
  aiSummary: string,
  instanceUrl: string
): string {
  const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  
  const automationCount = objSummary.flows.length + objSummary.apexClasses.length + 
    objSummary.apexTriggers.length + objSummary.validationRules.length

  const fieldsRows = fields.slice(0, 100).map((f: any) => {
    const custom = f.custom ? '<span style="color:#00a1e0">✓</span>' : ''
    return '<tr><td>' + f.label + '</td><td><code>' + f.name + '</code></td><td>' + f.type + '</td><td>' + custom + '</td></tr>'
  }).join('')

  const automationGroup = (title: string, items: any[], icon: string) => {
    if (!items || items.length === 0) return ''
    const lis = items.map((i: any) => '<li>' + i.name + '</li>').join('')
    return '<div class="agroup"><h4>' + icon + ' ' + title + ' (' + items.length + ')</h4><ul>' + lis + '</ul></div>'
  }

  const automationsHtml = [
    automationGroup('Flows', objSummary.flows, '🔀'),
    automationGroup('Apex Classes', objSummary.apexClasses, '{}'),
    automationGroup('Apex Triggers', objSummary.apexTriggers, '⚡'),
    automationGroup('Validation Rules', objSummary.validationRules, '✔️'),
    automationGroup('Page Layouts', objSummary.layouts, '📄'),
    automationGroup('Reports', objSummary.reports, '📊'),
    automationGroup('Email Templates', objSummary.emailTemplates, '✉️'),
  ].join('')

  const css = `
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color:#1a1a2e; }
    .header { background: linear-gradient(135deg,#032d60,#00a1e0); color:white; padding:40px; }
    .header h1 { font-size:28px; margin-bottom:6px; }
    .header .meta { font-size:13px; opacity:0.8; }
    .stats { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; padding:24px 40px; background:#f8f9fa; border-bottom:1px solid #e0e0e0; }
    .stat { text-align:center; }
    .stat-val { font-size:28px; font-weight:700; color:#032d60; }
    .stat-lbl { font-size:11px; color:#666; margin-top:4px; }
    .content { padding:40px; max-width:1000px; margin:0 auto; }
    .section { margin-bottom:36px; }
    .section h2 { font-size:18px; color:#032d60; border-bottom:2px solid #00a1e0; padding-bottom:8px; margin-bottom:16px; }
    .ai-box { background:#f0f7ff; border-left:4px solid #00a1e0; padding:20px; border-radius:4px; line-height:1.7; white-space:pre-wrap; font-size:14px; }
    table { width:100%; border-collapse:collapse; font-size:13px; }
    th { background:#032d60; color:white; padding:10px 12px; text-align:left; }
    td { padding:8px 12px; border-bottom:1px solid #e0e0e0; }
    tr:nth-child(even) { background:#f8f9fa; }
    code { background:#e8e8e8; padding:1px 5px; border-radius:3px; font-size:12px; }
    .agroup { margin-bottom:12px; padding:14px; background:#f8f9fa; border-radius:8px; }
    .agroup h4 { font-size:13px; margin-bottom:8px; color:#032d60; }
    .agroup ul { list-style:none; }
    .agroup ul li { padding:3px 0; font-size:12px; color:#444; border-bottom:1px solid #e8e8e8; }
    .agroup ul li:last-child { border:none; }
    .footer { text-align:center; padding:20px; color:#999; font-size:11px; border-top:1px solid #e0e0e0; margin-top:32px; }
    .print-btn { position:fixed; top:16px; right:16px; padding:10px 20px; background:#00a1e0; color:white; border:none; border-radius:8px; cursor:pointer; font-size:13px; font-weight:600; box-shadow:0 2px 8px rgba(0,0,0,0.2); }
    @media print { .print-btn { display:none; } body { print-color-adjust:exact; -webkit-print-color-adjust:exact; } }
  `

  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + obj.label + ' - SF Doc Report</title><style>' + css + '</style></head><body>' +
    '<button class="print-btn" onclick="setTimeout(()=>window.print(),500)">🖨️ Print / Save PDF</button><script>setTimeout(()=>{document.title="' + obj.label + ' - SF Doc Report"},100)</script>' +
    '<div class="header"><h1>' + obj.label + '</h1><div class="meta">' + obj.name + ' · ' + (obj.custom ? 'Custom Object' : 'Standard Object') + ' · Generated ' + now + ' by SF Doc Studio</div></div>' +
    '<div class="stats">' +
      '<div class="stat"><div class="stat-val">' + fields.length + '</div><div class="stat-lbl">Fields</div></div>' +
      '<div class="stat"><div class="stat-val">' + automationCount + '</div><div class="stat-lbl">Automations</div></div>' +
      '<div class="stat"><div class="stat-val">' + objSummary.validationRules.length + '</div><div class="stat-lbl">Validation Rules</div></div>' +
      '<div class="stat"><div class="stat-val">' + objSummary.layouts.length + '</div><div class="stat-lbl">Layouts</div></div>' +
    '</div>' +
    '<div class="content">' +
      '<div class="section"><h2>📋 AI Documentation</h2><div class="ai-box">' + aiSummary + '</div></div>' +
      '<div class="section"><h2>⚡ Automations & References</h2>' + automationsHtml + '</div>' +
      '<div class="section"><h2>🗂️ Fields (' + fields.length + ')</h2><table><thead><tr><th>Label</th><th>API Name</th><th>Type</th><th>Custom</th></tr></thead><tbody>' + fieldsRows + '</tbody></table>' +
      (fields.length > 100 ? '<p style="color:#999;font-size:11px;margin-top:8px;">Showing 100 of ' + fields.length + ' fields</p>' : '') +
      '</div>' +
    '</div>' +
    '<div class="footer">Generated by SF Doc Studio · ' + now + ' · ' + instanceUrl + '</div>' +
    '</body></html>'
}
