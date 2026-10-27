// Turn every scripture reference in a model's answer into a markdown link the
// renderer can make clickable.
//
// The prompt asks for [John 3:16], but small local models drift: they write
// (John 3:16), "John 3:16-18", "Jean 3.16", or cite the verse bare mid-sentence.
// Matching only the exact bracket form left most references as dead text, so
// this recognises any "Book C:V" whose book name is real — in English or
// French, whichever version is open — and rewrites it as [label](#verse-REF).
// Link targets carry the ref key, so the click handler needs no lookup table.

import { getBooks, refKey } from './bibleService'
import { parseTypedRef } from '../components/bible/VerseSearch'

export const VERSE_HREF_PREFIX = '#verse-'

// Names readers and models use that aren't the canonical book name.
const ALIASES: Record<string, string> = {
  psalm: 'PSA', 'song of songs': 'SNG', 'song of solomon': 'SNG', psaume: 'PSA',
  revelations: 'REV', apocalypse: 'REV', 'cantique des cantiques': 'SNG',
}

let cache: { names: Map<string, string>; re: RegExp } | null = null

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Built once: both versions' book names are fixed at build time, and a French
// reader's answer may still cite an English name (or the reverse).
function matcher() {
  if (cache) return cache
  const names = new Map<string, string>()
  for (const t of ['WEB', 'LSG'] as const) {
    for (const b of getBooks(t)) {
      names.set(b.name.toLowerCase(), b.id)
      if (b.enName) names.set(b.enName.toLowerCase(), b.id)
    }
  }
  for (const [k, v] of Object.entries(ALIASES)) names.set(k, v)
  // Longest first so "1 John" wins over "John", "Song of Songs" over "Song".
  const alt = [...names.keys()].sort((a, b) => b.length - a.length).map(escape).join('|')
  // book  chapter : verse  (-verse)?   — "." accepted as the separator too (French style)
  const re = new RegExp(
    `(?<![\\p{L}\\d])(${alt})\\.?\\s+(\\d{1,3})\\s*[:.]\\s*(\\d{1,3})(?:\\s*[-–]\\s*(\\d{1,3}))?(?![\\p{L}\\d])`,
    'giu',
  )
  cache = { names, re }
  return cache
}

/** Resolve a reference label ("John 3:16", "Jn 3", "1 Cor 13:4-7") to a ref key. */
export function resolveRefLabel(label: string): string | null {
  const { names, re } = matcher()
  const one = new RegExp(`^\\s*${re.source}\\s*$`, 'iu')
  const m = label.match(one)
  if (m) {
    const id = names.get(m[1].toLowerCase())
    if (id) return refKey(id, Number(m[2]), Number(m[3]))
  }
  const parsed = parseTypedRef(label)
  return parsed ? refKey(parsed.bookId, parsed.chapter, parsed.verse ?? 1) : null
}

/**
 * Rewrite references in markdown as links to `#verse-<ref>`. Existing links,
 * inline code and fenced code are left untouched.
 */
export function linkifyVerses(md: string): string {
  const { names, re } = matcher()
  // One pass, alternatives in priority order: protected spans first so a
  // reference inside a code block or an existing link is never rewritten.
  const protectedSrc = '```[\\s\\S]*?```|`[^`\\n]*`|\\[[^\\]\\n]*\\]\\([^)\\n]*\\)'
  const bracketSrc = '\\[([^\\]\\n]{2,80}?)\\](?!\\()'
  const all = new RegExp(`(${protectedSrc})|${bracketSrc}|${re.source}`, 'giu')

  const bare = (book: string, ch: string, v: string, vEnd?: string) => {
    const id = names.get(book.toLowerCase())
    if (!id) return null
    const label = `${book} ${ch}:${v}${vEnd ? `–${vEnd}` : ''}`
    return `[${label}](${VERSE_HREF_PREFIX}${refKey(id, Number(ch), Number(v))})`
  }
  const bareOnly = (text: string) =>
    text.replace(new RegExp(re.source, 'giu'), (w, b, c, v, e) => bare(b, c, v, e) ?? w)

  return md.replace(all, (whole, prot, inner, book, ch, v, vEnd) => {
    if (prot) return whole
    if (inner !== undefined) {
      // "[John 3:16; Romans 8:28]" — several refs in one bracket. Link each.
      const parts: string[] = inner.split(/\s*[;,]\s*(?=\D)/)
      const linked = parts.map(p => {
        const ref = resolveRefLabel(p)
        return ref ? `[${p.trim()}](${VERSE_HREF_PREFIX}${ref})` : null
      })
      // Not a reference list ("[see John 3:16]", "[note]") — keep the brackets,
      // but still link any reference written inside.
      if (linked.every(l => l === null)) {
        const swapped = bareOnly(inner)
        return swapped === inner ? whole : swapped
      }
      return linked.map((l, i) => l ?? parts[i]).join(' · ')
    }
    return bare(book, ch, v, vEnd) ?? whole
  })
}
