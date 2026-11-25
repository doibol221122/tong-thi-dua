// Nhận xét chung tự động (local mode): thẻ ở Xếp hạng tự soạn từ phiếu
// đã duyệt, tạo lại được, sửa + lưu thì giữ sau khi tải lại trang.
import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';

const EXE = process.env.CHROMIUM_EXE || process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell';
const fails = [];
function ok(c, label) { console.log((c ? 'OK   ' : 'FAIL ') + label); if (!c) fails.push(label); }
const seed5 = JSON.parse(readFileSync('./seed5.json', 'utf-8'));

const browser = await chromium.launch({ executablePath: EXE });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(({ seed, session }) => {
  localStorage.setItem('tong-thi-dua-v1', JSON.stringify(seed));
  localStorage.setItem('tong-thi-dua-session-v1', JSON.stringify(session));
}, { seed: seed5, session: { role: 'admin', name: 'Ban thi đua' } });
await page.goto('http://localhost:4177/', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.getByRole('button', { name: 'Xếp hạng', exact: true }).click();
await page.waitForTimeout(600);

const card = page.locator('.general-comment');
ok(await card.count() === 1, 'comment: Xếp hạng có thẻ Nhận xét chung');
const pros0 = await card.locator('textarea[aria-label="Nhận xét chung — Ưu điểm"]').inputValue();
ok(pros0.includes('Các lớp dẫn đầu tuần: 10B1 (128đ)'), 'comment: ưu điểm tự soạn nêu lớp dẫn đầu (thấy: ' + pros0.slice(0, 120) + ')');
const cons0 = await card.locator('textarea[aria-label="Nhận xét chung — Nhược điểm"]').inputValue();
ok(cons0.includes('chưa có phiếu đã duyệt'), 'comment: nhược điểm tự soạn nêu lớp chưa có phiếu duyệt (thấy: ' + cons0.slice(0, 160) + ')');

await card.getByRole('button', { name: 'Tạo nhận xét tự động' }).click();
await page.waitForTimeout(400);
ok((await card.innerText()).includes('Đã tạo nhận xét tự động'), 'comment: bấm Tạo nhận xét tự động có báo đã tạo');

await card.locator('textarea[aria-label="Nhận xét chung — Ưu điểm"]').fill('Ưu điểm do Ban thi đua sửa tay.');
await card.getByRole('button', { name: 'Lưu nhận xét chung' }).click();
await page.waitForTimeout(600);
ok((await page.locator('body').innerText()).includes('Đã lưu nhận xét chung'), 'comment: lưu nhận xét có báo đã lưu');

const savedPros = await page.evaluate(() => JSON.parse(localStorage.getItem('tong-thi-dua-v1')).settings.generalPros);
ok(savedPros === 'Ưu điểm do Ban thi đua sửa tay.', 'comment: nhận xét đã lưu vào dữ liệu dùng chung');

await ctx.close();
await browser.close();
if (fails.length) { console.log('COMMENT FAIL ' + fails.length); process.exit(1); }
console.log('COMMENT ALL PASS');
