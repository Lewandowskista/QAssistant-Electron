import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    main: {
        plugins: [externalizeDepsPlugin()],
        build: {
            lib: {
                entry: resolve(__dirname, 'electron/main.ts'),
                formats: ['es']
            },
            rollupOptions: {
                output: {
                    format: 'es'
                }
            }
        }
    },
    preload: {
        plugins: [externalizeDepsPlugin()],
        build: {
            lib: {
                entry: resolve(__dirname, 'electron/preload.ts'),
                formats: ['es']
            },
            rollupOptions: {
                output: {
                    format: 'es'
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
                }
            }
        },
        resolve: {
            alias: {
                '@': resolve(__dirname, 'src')
            }
        },
        plugins: [react()]
    }
})
