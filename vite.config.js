import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  server: {
    proxy: {
      '/ocr-api': {
        target: 'https://ark.cn-beijing.volces.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ocr-api/, '/api/v3/responses')
      },
      '/api/ocr': {
        target: 'https://ark.cn-beijing.volces.com',
        changeOrigin: true,
        rewrite: () => '/api/v3/responses',
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Authorization', 'Bearer ark-96fd4580-272f-4406-b112-0aae21641272-f9546')
          })
        }
      }
    }
  }
})
