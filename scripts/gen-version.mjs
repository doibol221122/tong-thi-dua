// Ghi số hiệu bản build vào public/version.json để app đang chạy
// đối chiếu và tự báo khi có bản mới (xem App.tsx).
// Chạy tự động trước mỗi lần build (xem "prebuild" trong package.json).
// vite.config.ts đọc lại chính file này để nhúng cùng số hiệu vào bundle,
// nên hai bên luôn khớp nhau.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public');
mkdirSync(outDir, { recursive: true });

const v = Date.now();
writeFileSync(join(outDir, 'version.json'), JSON.stringify({ v, build: new Date(v).toISOString() }) + '\n');
console.log('version:', v);
