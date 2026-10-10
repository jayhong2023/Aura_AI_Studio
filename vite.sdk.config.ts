import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  publicDir: false,
  build: {
    emptyOutDir: false,
    lib: {
      entry: fileURLToPath(new URL('./sdk/aura-embed.ts', import.meta.url)),
      name: 'AuraStudio',
      formats: ['iife', 'es'],
      fileName: (format) =>
        format === 'es' ? 'aura-embed.esm.js' : 'aura-embed.js',
    },
    outDir: 'dist/sdk',
    minify: true,
  },
})
