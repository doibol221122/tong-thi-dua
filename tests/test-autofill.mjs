// Hồi quy lỗi "đang nhập mà tự động điền lỗi khác" (25/11/2026).
// Nguyên nhân gốc (H3): setD dùng closure cũ ({...draft}) + interval giữ
// nút + đóng kín onChange cũ — tick sau ghi đè toàn bộ bản nháp cũ lên,
// xóa mất lần sửa khác (bấm nút khác, gõ tên HS). Đã sửa: setD dùng
// functional update, interval đọc onChange mới nhất qua ref, ô gõ tay
// bỏ chữ cũ khi giá trị đổi từ bên ngoài, interval dừng khi ô bị gỡ.
// Dùng sự kiện con trỏ tổng hợp để giữ nút + mà không di chuyển chuột
// thật (tránh pointerleave dừng interval).
import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';

const EXE = process.env.CHROMIUM_EXE || process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell';
const fails = [];
function ok(c, label) { console.log((c ? 'OK   ' : 'FAIL ') + label); if (!c) fails.push(label); }
const seed5 = JSON.parse(readFileSync('./seed5.json', 'utf-8'));

const browser = await chromium.launch({ executablePath: EXE });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const page = await ctx.newPage();
page.on('dialog', d => d.accept());
await page.addInitScript(({ seed }) => {
  localStorage.setItem('tong-thi-dua-v1', JSON.stringify(seed));
  localStorage.setItem('tong-thi-dua-session-v1', JSON.stringify({ role: 'admin', name: 'Ban thi đua' }));
}, { seed: seed5 });
await page.goto('http://localhost:4177/', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.getByRole('button', { name: 'Nhập điểm' }).click();
await page.waitForTimeout(400);
// P2-06: ở 390px hàng nút chọn lớp bị ẩn, chọn lớp bằng dropdown.
await page.locator('.class-select-wrap select').selectOption({ label: '10B2' });
await page.waitForTimeout(400);

const fieldPlus = (label) => page.locator('.field', { has: page.getByLabel(label, { exact: true }) }).getByRole('button', { name: 'Tăng' });
const fieldValue = (label) => page.getByLabel(label, { exact: true }).inputValue();
const pdown = (loc) => loc.evaluate(el => el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
const pup = (loc) => loc.evaluate(el => el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })));

// H1: gõ chữ không hợp lệ rồi đổi lớp (click tổng hợp, không blur) -> ô
// phải hiện đúng giá trị của phiếu mới, không còn chữ cũ.
await page.getByLabel('Đi muộn', { exact: true }).click();
await page.keyboard.type('e');
await page.waitForTimeout(200);
await page.getByRole('button', { name: '10B3', exact: true }).evaluate(el => el.click());
await page.waitForTimeout(400);
ok((await fieldValue('Đi muộn')) === '2', 'autofill H1: gõ "e" rồi đổi lớp -> ô Đi muộn hiện 2 của phiếu 10B3, không còn chữ cũ');
await page.getByRole('button', { name: '10B2', exact: true }).evaluate(el => el.click());
await page.waitForTimeout(400);

// H3a: giữ nút + Đi muộn, bấm 1 lần + Nhuộm tóc -> cả hai đều giữ đúng số.
await pdown(fieldPlus('Đi muộn'));
await page.waitForTimeout(250);
await fieldPlus('Nhuộm tóc').evaluate(el => { el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); });
await page.waitForTimeout(300);
ok((await fieldValue('Nhuộm tóc')) === '1', 'autofill H3a: giữ + Đi muộn + bấm + Nhuộm tóc 1 lần -> Nhuộm tóc = 1, không bị ghi đè về 0');
ok(Number(await fieldValue('Đi muộn')) >= 2, 'autofill H3a: giữ + Đi muộn vẫn tăng liên tục');
await pup(fieldPlus('Đi muộn'));
await page.waitForTimeout(200);

// H3b: giữ nút + Đi muộn, gõ tên HS vi phạm -> tên không bị xóa.
await pdown(fieldPlus('Đi muộn'));
await page.getByLabel('HS vi phạm Đi muộn').evaluate(el => el.focus());
await page.keyboard.type('Lan');
await page.waitForTimeout(350);
ok((await page.getByLabel('HS vi phạm Đi muộn').inputValue()) === 'Lan', 'autofill H3b: giữ + Đi muộn + gõ tên "Lan" -> tên vẫn còn, không bị interval xóa');
await pup(fieldPlus('Đi muộn'));

await browser.close();
console.log(fails.length ? `FAIL ${fails.length} autofill` : 'PASS autofill (4 kiểm tra)');
process.exit(fails.length ? 1 : 0);
