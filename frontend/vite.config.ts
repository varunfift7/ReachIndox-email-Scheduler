import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    proxy: {
      '/auth': 'http://localhost:4000',
      '/api': 'http://localhost:4000',
      '/admin': 'http://localhost:4000',
    },
  },
})
