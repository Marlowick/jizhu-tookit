import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Tauri 需要固定端口；127.0.0.1 避免局域网暴露
export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: '127.0.0.1',
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: 'safari15',
    sourcemap: false,
    // Mermaid is a single optional lazy-rendering engine (~4.9 MB raw,
    // ~1.38 MB gzip) and is never part of the initial UI chunk.
    chunkSizeWarningLimit: 5200,
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('mermaid') || id.includes('dagre') || id.includes('d3')) return 'mermaid'
          if (id.includes('@codemirror') || id.includes('@lezer')) return 'codemirror'
          if (id.includes('/yaml/') || id.includes('smol-toml')) return 'data-formats'
          if (id.includes('qrcode')) return 'qrcode'
          if (id.includes('lucide-react')) return 'icons'
          if (id.includes('react') || id.includes('scheduler') || id.includes('zustand')) return 'react-vendor'
          return 'vendor'
        },
      },
    },
  },
})
