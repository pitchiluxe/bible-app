const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const moduleObject = { exports: {} }
const source = ts.transpileModule(fs.readFileSync('web/platform.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
vm.runInNewContext(source, { exports: moduleObject.exports, URL, AbortSignal, fetch, window: {}, console })
const { createWebApi, emptyMarks, emptyStudy } = moduleObject.exports
function memory() {
  const data = new Map()
  return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) }
}

test('saved verse, highlight, note, reading position and study survive a fresh session', async () => {
  const storage = memory(), api = createWebApi(storage)
  const marks = { ...emptyMarks(), highlights: { 'JHN.3.16': '#ffff00' }, notes: { 'JHN.3.16': 'Grace' }, saved: [{ ref: 'JHN.3.16', ts: 123 }], lastRead: { book: 'JHN', chapter: 3 } }
  const study = { ...emptyStudy(), verses: { 'JHN.3.16': { box: 2, dueAt: 1000, reviews: 1 } }, plans: { john: { day: 2, startedAt: 1 } }, lessons: { lesson: { score: 1 } }, badges: ['first'] }
  await api.bible.setMarks(marks); await api.bible.setStudy(study)
  const reopened = createWebApi(storage)
  assert.equal(JSON.stringify(await reopened.bible.getMarks()), JSON.stringify(marks))
  assert.equal(JSON.stringify(await reopened.bible.getStudy()), JSON.stringify(study))
})
test('corrupt data is reported instead of replaced with an empty study', async () => {
  const storage = memory()
  storage.setItem('bible-web:study', '{broken')
  await assert.rejects(createWebApi(storage).bible.getStudy())
  assert.equal(storage.getItem('bible-web:study'), '{broken')
  storage.setItem('bible-web:marks', '{}')
  await assert.rejects(createWebApi(storage).bible.getMarks(), /Unreadable marks/)
})
test('invalid writes and storage quota errors are rejected', async () => {
  await assert.rejects(createWebApi(memory()).bible.setMarks({}), /Invalid marks/)
  const storage = { getItem: () => null, setItem: () => { throw new Error('Quota exceeded') } }
  await assert.rejects(createWebApi(storage).bible.setStudy(emptyStudy()), /Quota exceeded/)
})
test('AI stays off until enabled and never sends requests to a remote host', async () => {
  let calls = 0
  const api = createWebApi(memory(), async () => { calls++; throw new Error('unexpected network') })
  await assert.rejects(api.ai.chat([]), /Enable/)
  assert.equal(calls, 0)
  await api.settings.set({ aiEnabled: true, ollamaBase: 'https://example.com' })
  await assert.rejects(api.ai.models(), /localhost/)
  assert.equal(calls, 0)
})
test('AI discovers a model and returns an answer with selected scripture context', async () => {
  const requests = []
  const api = createWebApi(memory(), async (url, options) => {
    requests.push({ url, options })
    return { ok: true, json: async () => url.endsWith('/api/tags') ? { models: [{ name: 'llama3.2' }] } : { message: { content: 'Explanation [John 3:16]' } } }
  })
  await api.settings.set({ aiEnabled: true })
  const result = await api.ai.chat([{ role: 'user', content: 'Explain John 3:16: For God so loved…' }])
  assert.equal(result.content, 'Explanation [John 3:16]')
  const body = JSON.parse(requests[1].options.body)
  assert.equal(body.model, 'llama3.2')
  assert.match(body.messages[0].content, /For God so loved/)
})
test('failed or empty AI responses are reported', async () => {
  const api = createWebApi(memory(), async url => ({ ok: !url.endsWith('/api/chat'), status: 503, json: async () => ({ models: [{ name: 'llama3.2' }] }) }))
  await api.settings.set({ aiEnabled: true })
  await assert.rejects(api.ai.chat([]), /503/)
})

function browser(storage, backup) {
  const window = { dispatchEvent() {} }
  const browserModule = { exports: {} }
  const document = { createElement: () => {
    const input = { files: [{ size: 200, text: async () => JSON.stringify(backup) }] }
    input.click = () => input.onchange()
    return input
  } }
  vm.runInNewContext(source, { exports: browserModule.exports, URL, AbortSignal, fetch, window, document,
    localStorage: storage, CustomEvent: class {}, console })
  browserModule.exports.installBrowserPlatform()
  return window.electronAPI
}
test('backup imports merge saved references and progress without losing local notes', async () => {
  const storage = memory(), initial = createWebApi(storage)
  await initial.bible.setMarks({ ...emptyMarks(), notes: { 'JHN.3.16': 'Local note' }, saved: [{ ref: 'JHN.3.16', ts: 2 }] })
  await initial.bible.setStudy({ ...emptyStudy(), badges: ['local'], verses: { 'JHN.3.16': { box: 3 } } })
  const backup = { format: 'bible-web', version: 1, local: {},
    marks: { ...emptyMarks(), notes: { 'JHN.3.16': 'Older note' }, saved: [{ ref: 'PSA.23.1', ts: 1 }] },
    study: { ...emptyStudy(), badges: ['imported'], verses: { 'PSA.23.1': { box: 1 } } } }
  const api = browser(storage, backup)
  assert.equal((await api.backup.preview()).ok, true)
  assert.equal((await api.backup.apply()).ok, true)
  const marks = await initial.bible.getMarks(), study = await initial.bible.getStudy()
  assert.equal(marks.notes['JHN.3.16'], 'Local note')
  assert.equal(marks.saved.length, 2)
  assert.equal(study.verses['JHN.3.16'].box, 3)
  assert.equal(study.verses['PSA.23.1'].box, 1)
  assert.equal(study.badges.length, 2)
})
test('malformed backup and unexpected preference keys cannot change storage', async () => {
  const storage = memory()
  const api = browser(storage, { format: 'bible-web', version: 1, marks: emptyMarks(), study: emptyStudy(), local: { 'unrelated-key': '{}' } })
  assert.equal((await api.backup.preview()).ok, false)
  assert.equal((await api.backup.apply()).ok, false)
  assert.equal(storage.getItem('bible-web:marks'), null)
})
test('interrupted backup import rolls back writes already applied', async () => {
  const storage = memory()
  const initial = createWebApi(storage)
  const before = { ...emptyMarks(), notes: { 'JHN.3.16': 'Keep me' } }
  await initial.bible.setMarks(before)
  const originalSet = storage.setItem
  storage.setItem = (key, value) => {
    if (key === 'bible-web:study') throw new Error('Quota exceeded')
    originalSet(key, value)
  }
  const api = browser(storage, { format: 'bible-web', version: 1, marks: { ...emptyMarks(), saved: [{ ref: 'PSA.23.1', ts: 1 }] }, study: emptyStudy(), local: {} })
  await api.backup.preview()
  assert.equal((await api.backup.apply()).ok, false)
  assert.equal(JSON.stringify(await initial.bible.getMarks()), JSON.stringify(before))
})
