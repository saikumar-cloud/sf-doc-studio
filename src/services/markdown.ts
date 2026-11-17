// A tiny Markdown subset parser for AI answers: headings, bullet and numbered
// lists, code blocks, horizontal rules, paragraphs, **bold** and `code`.
// It returns plain data, so callers render it safely (React elements or escaped HTML).

export type Inline = { kind: 'text' | 'bold' | 'code', value: string }
export type Block =
  | { kind: 'heading', level: number, inline: Inline[] }
  | { kind: 'item', ordered: boolean, marker: string, indent: number, inline: Inline[] }
  | { kind: 'paragraph', inline: Inline[] }
  | { kind: 'code', value: string }
  | { kind: 'rule' }

export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  const re = /\*\*([^*]+)\*\*|`([^`]+)`/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ kind: 'text', value: text.slice(last, m.index) })
    if (m[1] !== undefined) out.push({ kind: 'bold', value: m[1] })
    else out.push({ kind: 'code', value: m[2] })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ kind: 'text', value: text.slice(last) })
  return out
}

export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = []
  const lines = src.replace(/\r\n/g, '\n').split('\n')
  let para: string[] = []
  const flush = () => {
    if (para.length) blocks.push({ kind: 'paragraph', inline: parseInline(para.join(' ')) })
    para = []
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const line = raw.trim()

    if (line.startsWith('```')) {
      flush()
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) code.push(lines[i++])
      blocks.push({ kind: 'code', value: code.join('\n') })
      continue
    }
    if (!line) { flush(); continue }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) { flush(); blocks.push({ kind: 'rule' }); continue }

    const h = /^(#{1,6})\s+(.*)$/.exec(line)
    if (h) { flush(); blocks.push({ kind: 'heading', level: h[1].length, inline: parseInline(h[2].replace(/#+$/, '').trim()) }); continue }

    const indent = Math.min(3, Math.floor((raw.length - raw.trimStart().length) / 2))
    const bullet = /^[-*•]\s+(.*)$/.exec(line)
    if (bullet) { flush(); blocks.push({ kind: 'item', ordered: false, marker: '•', indent, inline: parseInline(bullet[1]) }); continue }
    const num = /^(\d+)[.)]\s+(.*)$/.exec(line)
    if (num) { flush(); blocks.push({ kind: 'item', ordered: true, marker: num[1] + '.', indent, inline: parseInline(num[2]) }); continue }

    para.push(line)
  }
  flush()
  return blocks
}

const esc = (s: string) => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

function inlineToHtml(inline: Inline[]): string {
  return inline.map(p =>
    p.kind === 'bold' ? '<strong>' + esc(p.value) + '</strong>'
      : p.kind === 'code' ? '<code>' + esc(p.value) + '</code>'
      : esc(p.value)
  ).join('')
}

// Escaped HTML for the exported report.
export function markdownToHtml(src: string): string {
  return parseMarkdown(src).map(b => {
    switch (b.kind) {
      case 'heading': return `<h${Math.min(6, b.level + 2)}>` + inlineToHtml(b.inline) + `</h${Math.min(6, b.level + 2)}>`
      case 'item': return `<div class="md-li" style="padding-left:${18 + b.indent * 14}px"><span class="md-mark" style="left:${b.indent * 14}px">${esc(b.marker)}</span>` + inlineToHtml(b.inline) + '</div>'
      case 'paragraph': return '<p>' + inlineToHtml(b.inline) + '</p>'
      case 'code': return '<pre>' + esc(b.value) + '</pre>'
      case 'rule': return '<hr>'
    }
  }).join('')
}
