import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin()
    ],
    build: {
      lib: {
        entry: resolve(__dirname, 'electron/main.ts'),
        formats: ['cjs']
      },
      rollupOptions: {
        external: ['electron'],
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: '[name]-[hash].js'
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve(__dirname, 'electron/preload.ts'),
        formats: ['cjs']
      },
      rollupOptions: {
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: '[name]-[hash].js'
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src'),
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/index.html')
        },
        onwarn(warning, warn) {
          if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return
          if (warning.message.includes("Can't resolve original location of error")) return
          warn(warning)
        }
      }
    },
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src'),
        '@': resolve(__dirname, 'src')
      }
    }
  }
})
