// kokoro-js only publishes its types through package.json "exports", which
// this project's "node" module resolution does not read. Point at them directly.
declare module 'kokoro-js' {
  export * from 'kokoro-js/types/kokoro'
}
