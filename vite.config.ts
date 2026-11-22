import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

// Số hiệu bản build: scripts/gen-version.mjs ghi vào public/version.json
// trước khi build; nhúng cùng số hiệu vào bundle để app đang chạy đối
// chiếu với version.json trên máy chủ và tự báo khi có bản mới.
let buildV = 0;
try {
  buildV = JSON.parse(readFileSync('public/version.json', 'utf-8')).v ?? 0;
} catch {
  buildV = 0;
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_V__: JSON.stringify(buildV),
  },
})
