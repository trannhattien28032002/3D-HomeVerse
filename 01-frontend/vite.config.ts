import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "src": path.resolve(__dirname, "src")
    }
  },
  server: {
    allowedHosts: [
      'presystematic-alonso-reedy.ngrok-free.dev'
    ]
  },
  // server: {
  //   host: '0.0.0.0',
  //   port: 5173
  // },
  build: {
    rollupOptions: {
      output: {
        // CR-02: tách vendor 3D/2D nặng ra khỏi entry chunk. Kết hợp với lazy
        // route ở Routes.tsx, các chunk này chỉ tải khi mở EditorPage.
        // Vite 8 (rolldown) yêu cầu manualChunks dạng function.
        manualChunks(id: string) {
          if (id.includes("node_modules")) {
            if (id.includes("three")) return "three"; // gồm cả three/addons + three-bvh-csg
            if (id.includes("konva")) return "konva";  // konva + react-konva
            if (id.includes("cannon-es")) return "cannon";
          }
          // MD-01: tách catalog JSON (objects.json ~118KB + materials.json ~36KB) ra
          // chunk riêng. Đã nằm trong lazy editor chunk nhờ CR-02 (engine/AI chỉ load
          // qua EditorPage), nên không chạm landing bundle; tách thêm để dữ liệu catalog
          // cache độc lập với code và không phình chunk JS của editor.
          if (id.includes("data/catalog/") && id.endsWith(".json")) return "catalog";
        },
      },
    },
  },
})
