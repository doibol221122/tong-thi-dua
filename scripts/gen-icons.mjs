// Tạo các icon PWA (PNG) từ logo trường đã nhúng trong src/logoData.ts.
// Chạy tự động trước mỗi lần build (xem "prebuild" trong package.json),
// vì công cụ đẩy code lên GitHub không gửi được file ảnh nhị phân,
// còn Vercel thì build lại từ code nên icon luôn được tạo mới ở đó.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Jimp } from 'jimp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public');
mkdirSync(outDir, { recursive: true });

const src = readFileSync(join(root, 'src', 'logoData.ts'), 'utf-8');
const m = src.match(/data:image\/jpeg;base64,([A-Za-z0-9+/=]+)/);
if (!m) throw new Error('Không tìm thấy base64 logo trong src/logoData.ts');
const logo = await Jimp.read(Buffer.from(m[1], 'base64'));

async function png(image, name) {
  const path = join(outDir, name);
  await image.write(path);
  console.log('icon:', name);
}

// Icon thường: logo lấp đầy khung vuông.
await png(logo.clone().cover({ w: 192, h: 192 }), 'logo-192.png');
await png(logo.clone().cover({ w: 512, h: 512 }), 'logo-512.png');
// Icon cho iOS (màn hình chính iPhone/iPad).
await png(logo.clone().cover({ w: 180, h: 180 }), 'apple-touch-icon.png');
// Icon maskable (Android cắt tròn/vuông): logo thu nhỏ còn 80% ở giữa nền trắng.
const maskable = new Jimp({ width: 512, height: 512, color: 0xffffffff });
maskable.composite(logo.clone().cover({ w: 410, h: 410 }), 51, 51);
await png(maskable, 'logo-512-maskable.png');

// Giữ lại file jpg gốc để trình duyệt cũ dùng làm favicon nếu cần.
writeFileSync(join(outDir, 'logo.jpg'), Buffer.from(m[1], 'base64'));
console.log('icon: logo.jpg');
console.log('Xong: đã tạo icon PWA từ logo trường.');
