import { resolve } from 'path'
import { copyFileSync, mkdirSync } from 'fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { NATURAL_VOICES } from './src/main/tts/voiceModel'

// kokoro-js reads its voice files from `../voices/` next to its own code. Once
// bundled into out/main/ttsWorker.js that is out/voices/, so the voices the
// app offers are copied there after each main build.
function copyNaturalVoices(): Plugin {
  return {
    name: 'bible-copy-natural-voices',
    apply: 'build',
    closeBundle() {
      const src = resolve('node_modules/kokoro-js/voices')
      const dest = resolve('out/voices')
      mkdirSync(dest, { recursive: true })
      for (const v of NATURAL_VOICES) copyFileSync(resolve(src, `${v.id}.bin`), resolve(dest, `${v.id}.bin`))
    },
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), copyNaturalVoices()],
    resolve: {
      alias: {
        // The natural voice worker bundles transformers.js, which imports
        // sharp for images it never handles here. See src/main/tts/sharpStub.ts.
        sharp: resolve('src/main/tts/sharpStub.ts'),
      }
    },
    build: {
      rollupOptions: {
        // The main process, plus the natural voice's utility process — a
        // separate entry so main never loads the model's code at all.
        input: {
          index:     resolve('src/main/index.ts'),
          ttsWorker: resolve('src/main/tts/worker.ts'),
        },
        output: { format: 'cjs', entryFileNames: '[name].js' }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: { format: 'cjs', entryFileNames: '[name].js' }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@components': resolve('src/renderer/src/components'),
        '@services': resolve('src/renderer/src/services'),
      }
    },
    plugins: [react()],
    css: {
      postcss: resolve('postcss.config.js')
    },
    build: {
      sourcemap: false,
      rollupOptions: {
        input: { index: resolve('src/renderer/index.html') },
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined
            if (id.includes('framer-motion')) return 'vendor-motion'
            if (id.includes('react-markdown') || id.includes('remark-')) return 'vendor-markdown'
            if (id.includes('lucide-react')) return 'vendor-icons'
            if (id.includes('react') || id.includes('scheduler')) return 'vendor-react'
            if (id.includes('zustand') || id.includes('use-sync-external-store')) return 'vendor-state'
            if (id.includes('d3-') || id.includes('/d3/')) return 'vendor-d3'
          }
        }
      }
    }
  }
})
