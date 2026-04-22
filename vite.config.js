import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  server: {
    proxy: {
      '/ocr-api': {
        target: 'http://192.168.4.68:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ocr-api/, '')
      }
    }
  }
})
