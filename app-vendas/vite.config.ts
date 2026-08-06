/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// SINGLE_FILE=1 gera um único index.html com todo JS/CSS embutido — abre por
// duplo clique (file://) sem servidor. Nesse modo desativamos o code-splitting.
const singleFile = process.env.SINGLE_FILE === '1'

export default defineConfig({
  plugins: [react(), ...(singleFile ? [viteSingleFile()] : [])],
  server: { port: 5173 },
  build: {
    rollupOptions: singleFile
      ? {}
      : {
          output: {
            manualChunks: {
              react: ['react', 'react-dom', 'react-router-dom'],
              charts: ['recharts'],
              supabase: ['@supabase/supabase-js'],
            },
          },
        },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
})
