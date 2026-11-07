const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const output = path.resolve(root, 'landing/public')
// Only this generated website directory is ever replaced.
if (path.relative(root, output) !== path.join('landing', 'public')) throw new Error('Unexpected website output path')
execFileSync(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build', '--config', 'vite.web.config.ts'], { cwd: root, stdio: 'inherit' })
fs.rmSync(output, { recursive: true, force: true })
fs.mkdirSync(output, { recursive: true })
fs.copyFileSync(path.join(root, 'landing/index.html'), path.join(output, 'index.html'))
fs.cpSync(path.join(root, 'dist-web'), path.join(output, 'read'), { recursive: true })
console.log('Website ready: landing/public/ (homepage) and landing/public/read/ (Bible reader)')
