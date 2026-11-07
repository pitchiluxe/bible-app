import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Cache the complete build so every bundled translation remains readable offline.
function offlineApp(): Plugin {
  return {
    name: 'bible-offline-web',
    generateBundle(_options, bundle) {
      const files = ['index.html', ...Object.keys(bundle)].filter(f => !f.endsWith('.map'))
      const version = Object.keys(bundle).filter(f => f.endsWith('.js')).join('|')
      let hash = 0
      for (const char of version) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: `
const CACHE = 'bible-web-${hash >>> 0}';
const FILES = ${JSON.stringify(files)};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('bible-web-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(event.request);
    if (hit) return hit;
    try { return await fetch(event.request); }
    catch (error) {
      if (event.request.mode === 'navigate') return cache.match('index.html');
      throw error;
    }
  }));
});
` })
    },
  }
}

export default defineConfig({
  root: resolve('web'),
  base: './',
  publicDir: resolve('web/public'),
  plugins: [react(), offlineApp()],
  resolve: { alias: {
    '@renderer': resolve('src/renderer/src'),
    '@components': resolve('src/renderer/src/components'),
    '@services': resolve('src/renderer/src/services'),
  } },
  server: { host: '127.0.0.1', fs: { allow: [resolve('.')] } },
  css: { postcss: resolve('postcss.config.js') },
  build: { outDir: resolve('dist-web'), emptyOutDir: true },
})
