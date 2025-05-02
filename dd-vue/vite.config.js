import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [
    vue()
  ],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    chunkSizeWarningLimit: 0,
    cssCodeSplit: false,
    rollupOptions: {
      external: ['electron'],
      output: {
        manualChunks: undefined, // 一个空的manualChunks函数，理论上这会阻止自动拆分，但实际上Vite可能不会完全按照预期工作，因为Vite有自己的内部处理逻辑。更好的做法是明确指定哪些包应该被拆分。
        format: 'iife',
        inlineDynamicImports: true
      }
    }
  },
  server: {
    proxy: {
      // 配置跨域代理，将以 /api 开头的请求代理到 http://localhost:3000
      '/api': {
        target: 'http://localhost:3000/api',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
})
