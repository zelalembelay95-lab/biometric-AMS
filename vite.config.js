import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // Tells Vite to ignore face-api.js during compilation since it's loaded via CDN
      external: ['face-api.js'],
    },
  },
})
