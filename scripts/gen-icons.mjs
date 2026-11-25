// Tạo các icon PWA (PNG) từ logo trường đã nhúng trong src/logoData.ts.
// Chạy tự động trước mỗi lần build (xem "prebuild" trong package.json),
// vì công cụ đẩy code lên GitHub không gửi được file ảnh nhị phân,
// còn Vercel thì build lại từ code nên icon luôn được tạo mới ở đó.
//
// Khả năng chịu lỗi (P2-07): icon là file sinh ra, không nằm trong git
// (xem .gitignore), nhưng nếu bước tạo icon lỗi mà bộ icon cũ vẫn còn đủ
// trong public/ thì build được tiếp tục dùng lại bộ cũ thay vì fail cả
// build — chỉ fail khi icon thật sự còn thiếu. Vì vậy bước này vẫn nằm
// trong đường build bắt buộc (không tách ra, không `|| true` bừa):
// tách ra hoặc nuốt lỗi mù sẽ làm checkout mới / Vercel build ra app
// thiếu icon PWA mà không ai hay.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public');

// Toàn bộ file icon mà build cần có trong public/.
const ICON_FILES = [
  'logo-192.png',
  'logo-512.png',
  'apple-touch-icon.png',
  'logo-512-maskable.png',
  'logo.jpg',
];

const iconsExist = () => ICON_FILES.every((f) => existsSync(join(outDir, f)));

try {
  // Import động trong try để cả lỗi nạp jimp (vd. cài đặt hỏng)
  // cũng rơi vào nhánh dùng lại icon cũ, thay vì crash ngoài try.
  const { Jimp } = await import('jimp');

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
} catch (err) {
  if (iconsExist()) {
    console.warn(
      'CẢNH BÁO: tạo icon PWA lỗi (%s) — dùng lại bộ icon đã có trong public/, build tiếp tục.',
      err?.message ?? err,
    );
  } else {
    console.error('LỖI: tạo icon PWA thất bại và bộ icon trong public/ còn thiếu — build dừng lại.');
    throw err;
  }
}
