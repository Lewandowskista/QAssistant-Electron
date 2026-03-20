import { defineConfig } from 'vite'
import { resolve } from 'path'

// Minimal vite config used only by vitest.
// The main build uses electron.vite.config.ts via electron-vite.
export default defineConfig({
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src'),
            '@renderer': resolve(__dirname, 'src'),
        },
    },
    test: {
        environment: 'node',
        globals: false,
    },
})
