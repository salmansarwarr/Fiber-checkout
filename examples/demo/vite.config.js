import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'fiber-checkout': path.resolve(__dirname, '../../dist/index.js'),
    },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    proxy: {
      '/api/fiber-rpc': {
        target: 'http://127.0.0.1:8227',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/fiber-rpc/, ''),
      },
    },
  },
})
