import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { resolve } from 'path'
import { readFileSync } from 'fs'

// Load .env manually so env vars are available at build time for the main process
function loadEnv(): Record<string, string> {
  try {
    const envFile = readFileSync(resolve(__dirname, '.env'), 'utf8')
    const result: Record<string, string> = {}
    for (const line of envFile.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      const value = trimmed.slice(eq + 1).trim()
      result[key] = value
    }
    return result
  } catch {
    return {}
  }
}

const env = loadEnv()

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({ exclude: ['better-sqlite3'] })
    ],
    define: {
      'process.env.GITHUB_CLIENT_ID': JSON.stringify(env['GITHUB_CLIENT_ID'] || ''),
      'process.env.GITHUB_CLIENT_SECRET': JSON.stringify(env['GITHUB_CLIENT_SECRET'] || ''),
      'process.env.LINEAR_CLIENT_ID': JSON.stringify(env['LINEAR_CLIENT_ID'] || ''),
      'process.env.LINEAR_CLIENT_SECRET': JSON.stringify(env['LINEAR_CLIENT_SECRET'] || ''),
    },
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
