// Standalone Bible App version of agentTools.ts
// Only includes cleanNarration and the helpers it depends on.
// Browser-store-dependent functions (executeAction, etc.) are omitted.

export interface ToolAction {
  tool: string
  [key: string]: any
}

export interface ToolResult {
  [key: string]: any
  error?: string
}

export interface ParsedResponse {
  narration: string
  actions: ToolAction[] | null
}

// The documented ###ACTIONS### marker, plus the spacing/casing variants models
// produce ("### ACTION ###", "##actions##").
const ACTIONS_MARKER_RE = /#{2,}\s*ACTIONS?\s*#{2,}/i

// Tags models wrap tool calls (or their private reasoning) in. Small local
// models emit whatever their fine-tune used rather than the documented marker,
// so all of these have to be recognised as protocol — never shown as text.
const PROTOCOL_TAGS = [
  'action', 'actions', 'tool', 'tools', 'tool_call', 'tool_calls', 'toolcall',
  'dots_function_call', 'dots_function_calls',
  'tool_code', 'function_call', 'functioncall', 'invoke', 'antml:invoke',
  'think', 'thinking', 'thought', 'reasoning', 'scratchpad', 'internal',
].join('|')
const TAG_PAIR     = new RegExp(`<(${PROTOCOL_TAGS})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`, 'gi')
// An opener the model never closed: everything after it is machine output.
const TAG_UNCLOSED = new RegExp(`<(?:${PROTOCOL_TAGS})\\b[^>]*>[\\s\\S]*$`, 'i')
const TAG_STRAY    = new RegExp(`<\\/?(?:${PROTOCOL_TAGS})\\b[^>]*>`, 'gi')
// Chat-template control tokens: <|im_start|>, <|channel|>, <|eot_id|>,
// [TOOL_CALLS], [INST], <s>, <end_of_turn> …
const CONTROL_TOKENS = /<\|[^|>]*\|>|\[\/?(?:TOOL_CALLS?|INST|OUT|AVAILABLE_TOOLS)\]|<\/?s>|<\/?(?:end|start)_of_turn>|<\/?(?:eos|bos|pad)>/gi

// Every tool name recognized in the protocol.
const KNOWN_TOOLS = new Set([
  'list_tabs', 'open_tab', 'close_tab', 'navigate_tab', 'switch_tab',
  'list_bookmarks', 'add_bookmark', 'remove_bookmark',
  'read_page', 'web_search', 'read_chart', 'recall_pages', 'fetch_url', 'remember',
  'read_tab', 'scan_page', 'fill_field', 'click_element', 'wait',
  'list_dir', 'read_file', 'write_file', 'find_files', 'move_file',
  'save_file', 'save_zip', 'pick_directory', 'exec_command',
])

const HASH_CALL_RE = new RegExp(
  `^[ \\t]*#{2,}[ \\t]*(${[...KNOWN_TOOLS].join('|')})[ \\t]*#{2,}[ \\t]*(.*?)[ \\t]*(?:\\r?\\n|$)`,
  'gim',
)

const isHashCall = (name: string): boolean =>
  name.includes('_') || name === name.toUpperCase()

const POSITIONAL_ARGS: Record<string, string[]> = {
  open_tab: ['url'], close_tab: ['tabId'], switch_tab: ['tabId'], navigate_tab: ['tabId', 'url'],
  add_bookmark: ['url', 'title'], remove_bookmark: ['id'],
  web_search: ['query'], recall_pages: ['query'], find_files: ['query'], fetch_url: ['url'],
  remember: ['text'], wait: ['ms'],
  fill_field: ['elementId', 'value'], click_element: ['elementId'],
  list_dir: ['path'], read_file: ['path'],
}

const NAME_KEYS = ['tool', 'action', 'name', 'tool_name', 'function', 'function_name', 'recipient_name']
const ARG_KEYS  = ['arguments', 'parameters', 'params', 'args', 'input', 'tool_input', 'action_input']
const LIST_KEYS = ['actions', 'tool_calls', 'toolcalls', 'tools', 'calls', 'steps']
const ACTION_KEY_RE = new RegExp(`"(?:${[...NAME_KEYS, ...LIST_KEYS].join('|')})"\\s*:`, 'i')

// Placeholder-protect fenced blocks and inline code so a user's own HTML,
// template tags or JSON survive the strippers below untouched.
const protectCode = (text: string): { text: string; blocks: string[] } => {
  const blocks: string[] = []
  const out = text.replace(/```[\s\S]*?```|`[^`\n]*`/g, block => {
    blocks.push(block)
    return `%%__CODE${blocks.length - 1}__%%`
  })
  return { text: out, blocks }
}
const restoreCode = (text: string, blocks: string[]): string =>
  text.replace(/%%__CODE(\d+)__%%/g, (_m, i) => blocks[Number(i)] ?? '')

// Best-effort repair of the almost-JSON models sometimes emit.
function tryParseLoose(src: string): any {
  const attempts: string[] = [src]
  const noTrailingComma = src.replace(/,\s*([}\]])/g, '$1')
  if (noTrailingComma !== src) attempts.push(noTrailingComma)
  for (const base of [src, noTrailingComma]) {
    const stack: string[] = []
    let inStr = false, esc = false
    for (const ch of base) {
      if (esc) { esc = false; continue }
      if (ch === '\\') { esc = true; continue }
      if (ch === '"') { inStr = !inStr; continue }
      if (inStr) continue
      if (ch === '{' || ch === '[') stack.push(ch)
      else if (ch === '}' || ch === ']') stack.pop()
    }
    if (stack.length) {
      let repaired = base
      if (inStr) repaired += '"'
      for (let i = stack.length - 1; i >= 0; i--) repaired += stack[i] === '{' ? '}' : ']'
      attempts.push(repaired)
    }
  }
  for (const a of attempts) {
    try { return JSON.parse(a) } catch { /* try next */ }
  }
  return null
}

function normalizeCall(raw: any, depth = 0): ToolAction | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || depth > 2) return null

  const lower: Record<string, any> = {}
  for (const [k, v] of Object.entries(raw)) lower[k.toLowerCase()] = v

  for (const k of NAME_KEYS) {
    const nested = lower[k] && typeof lower[k] === 'object' ? normalizeCall(lower[k], depth + 1) : null
    if (nested) return nested
  }

  let tool: string | null = null
  let aliased = false
  for (const k of NAME_KEYS) {
    if (typeof lower[k] === 'string' && lower[k].trim()) {
      tool = lower[k].trim()
      aliased = k !== 'tool'
      break
    }
  }
  if (!tool) return null
  if (aliased && !KNOWN_TOOLS.has(tool)) return null

  const args: Record<string, any> = {}
  for (const [k, v] of Object.entries(raw)) {
    const key = k.toLowerCase()
    if (NAME_KEYS.includes(key) || ARG_KEYS.includes(key)) continue
    args[k] = v
  }
  for (const k of ARG_KEYS) {
    let v = lower[k]
    if (typeof v === 'string') { try { v = JSON.parse(v) } catch { continue } }
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(args, v)
  }
  return { ...args, tool }
}

function toActions(parsed: any): ToolAction[] | null {
  if (!parsed) return null
  if (Array.isArray(parsed)) {
    const calls = parsed.map(x => normalizeCall(x))
    return calls.length && calls.every(Boolean) ? calls as ToolAction[] : null
  }
  if (typeof parsed !== 'object') return null
  for (const k of Object.keys(parsed)) {
    if (!LIST_KEYS.includes(k.toLowerCase()) || !Array.isArray(parsed[k])) continue
    const calls = toActions(parsed[k])
    if (calls) return calls
  }
  const single = normalizeCall(parsed)
  return single ? [single] : null
}

function balancedSlice(text: string, from: number): string {
  let depth = 0, inStr = false, esc = false
  for (let i = from; i < text.length; i++) {
    const ch = text[i]
    if (esc) { esc = false; continue }
    if (ch === '\\') { esc = true; continue }
    if (ch === '"') { inStr = !inStr; continue }
    if (inStr) continue
    if (ch === '{' || ch === '[') depth++
    else if (ch === '}' || ch === ']') {
      depth--
      if (depth === 0) return text.slice(from, i + 1)
    }
  }
  return text.slice(from)
}

const MAX_JSON_CANDIDATES = 20

function stripActionJson(text: string): string {
  if (!ACTION_KEY_RE.test(text)) return text
  let out = '', i = 0, tried = 0
  while (i < text.length) {
    const ch = text[i]
    if ((ch === '{' || ch === '[') && tried < MAX_JSON_CANDIDATES) {
      tried++
      const slice = balancedSlice(text, i)
      const actions = toActions(tryParseLoose(slice))
      if (actions && actions.length) { i += slice.length; continue }
    }
    out += ch
    i++
  }
  return out
}

const stripFences = (s: string): string =>
  s.trim().replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim()

/**
 * Strip every trace of the machine protocol from user-facing text: the marker,
 * XML-style tool tags and their contents, chat-template control tokens, and
 * bare action JSON. Code the user asked for is protected and comes back
 * verbatim. The chat should only ever show prose.
 */
export function cleanNarration(text: string): string {
  // Everything from the marker onward is machine protocol — drop it.
  const marker = text.match(ACTIONS_MARKER_RE)
  let out = marker ? text.slice(0, text.indexOf(marker[0])) : text

  // A fenced block that carries an action call is protocol, not an example.
  out = out.replace(/```(?:json)?\s*([\s\S]*?)```/gi, (block, body) =>
    toActions(tryParseLoose(stripFences(body))) ? '' : block)

  const { text: masked, blocks } = protectCode(out)
  out = masked

  out = out.replace(CONTROL_TOKENS, ' ')
  out = out.replace(TAG_PAIR, '')
  out = out.replace(TAG_UNCLOSED, '')
  out = out.replace(TAG_STRAY, '')
  out = out.replace(HASH_CALL_RE, (line, name) => isHashCall(name) ? '' : line)

  out = stripActionJson(out)
  out = out.replace(/\{\s*"tool"\s*:\s*"[^"]*"[^{}]*$/, '')

  out = restoreCode(out, blocks)
  out = out.replace(/(?<=\S) {2,}/g, ' ').replace(/\n{3,}/g, '\n\n')
  return out.trim()
}

function findActionJson(text: string): ToolAction[] | null {
  if (!ACTION_KEY_RE.test(text)) return null
  let tried = 0
  for (let i = 0; i < text.length && tried < MAX_JSON_CANDIDATES; i++) {
    const ch = text[i]
    if (ch !== '{' && ch !== '[') continue
    tried++
    const actions = toActions(tryParseLoose(balancedSlice(text, i)))
    if (actions && actions.length) return actions
  }
  return null
}

function parseHashArgs(tool: string, tail: string): Record<string, any> {
  const rest = tail.trim()
  if (!rest) return {}

  if (rest.startsWith('{')) {
    const parsed = tryParseLoose(balancedSlice(rest, 0))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
  }

  const KV_TAIL_RE = /^(?:[a-zA-Z_][\w-]*\s*=\s*(?:"[^"]*"|'[^']*'|\S+)\s*)+$/
  const KV_PAIR_RE = /([a-zA-Z_][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g

  if (KV_TAIL_RE.test(rest)) {
    const args: Record<string, any> = {}
    for (const m of rest.matchAll(KV_PAIR_RE)) args[m[1]] = m[2] ?? m[3] ?? m[4]
    return args
  }

  const slots = POSITIONAL_ARGS[tool]
  if (!slots || !slots.length) return {}
  const args: Record<string, any> = {}
  let remaining = rest
  for (let i = 0; i < slots.length; i++) {
    if (!remaining) break
    if (i === slots.length - 1) { args[slots[i]] = remaining; break }
    const sp = remaining.search(/\s/)
    if (sp === -1) { args[slots[i]] = remaining; remaining = ''; break }
    args[slots[i]] = remaining.slice(0, sp)
    remaining = remaining.slice(sp + 1).trim()
  }
  return args
}

function parseHashCalls(raw: string): ToolAction[] | null {
  const actions: ToolAction[] = []
  for (const m of raw.matchAll(HASH_CALL_RE)) {
    if (!isHashCall(m[1])) continue
    const tool = m[1].toLowerCase()
    actions.push({ ...parseHashArgs(tool, m[2] || ''), tool })
  }
  return actions.length ? actions : null
}

// parseActionsBlock is included for completeness.
export function parseActionsBlock(raw: string): ParsedResponse {
  const narration = cleanNarration(raw)

  const marker = raw.match(ACTIONS_MARKER_RE)
  if (marker) {
    const start = raw.indexOf(marker[0]) + marker[0].length
    const jsonPart = stripFences(raw.slice(start))
    const actions = findActionJson(jsonPart)
    if (actions) return { narration, actions }
    return { narration, actions: parseHashCalls(raw) }
  }

  const tagged = raw.match(new RegExp(`<(?:${PROTOCOL_TAGS})\\b[^>]*>([\\s\\S]*)`, 'i'))
  if (tagged) {
    const actions = findActionJson(stripFences(tagged[1]))
    if (actions) return { narration, actions }
  }

  const actions = findActionJson(raw)
  if (actions) return { narration, actions }

  return { narration, actions: parseHashCalls(raw) }
}
