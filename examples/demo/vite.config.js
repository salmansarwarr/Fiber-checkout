import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      react: path.resolve('./node_modules/react'),
      'react-dom': path.resolve('./node_modules/react-dom'),
    },
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
