// Nút cộng/trừ: chạm cảm ứng 1 lần chỉ tăng/giảm 1 (trước đây nhảy 2 vì
// mousedown + touchstart bắn chồng nhau); bấm chuột cũng chỉ +1/-1.
import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';

const EXE = process.env.CHROMIUM_EXE || process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell';
const fails = [];
function ok(c, label) { console.log((c ? 'OK   ' : 'FAIL ') + label); if (!c) fails.push(label); }
const seedDuty = JSON.parse(readFileSync('./seed-duty.json', 'utf-8'));

const browser = await chromium.launch({ executablePath: EXE });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const page = await ctx.newPage();
page.on('dialog', d => d.accept());
await page.addInitScript(({ seed }) => {
  localStorage.setItem('tong-thi-dua-v1', JSON.stringify(seed));
  localStorage.setItem('tong-thi-dua-session-v1', JSON.stringify({ role: 'codo', name: 'Nguyễn Văn A' }));
}, { seed: seedDuty });
await page.goto('http://localhost:4177/', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

// Hàng "Đi muộn" đang 0 lượt (phiếu bị trả lại của 10B5 chỉ có Nhuộm tóc = 1).
const row = page.locator('.field', { hasText: 'Đi muộn' }).first();
const plus = row.getByRole('button', { name: 'Tăng' });
const minus = row.getByRole('button', { name: 'Giảm' });
const input = row.locator('input');
ok((await input.inputValue()) === '0', 'stepper: Đi muộn bắt đầu từ 0');
await plus.tap();
await page.waitForTimeout(300);
ok((await input.inputValue()) === '1', 'stepper: chạm + 1 lần (cảm ứng) -> 1, không nhảy 2');
await plus.tap();
await page.waitForTimeout(300);
ok((await input.inputValue()) === '2', 'stepper: chạm + lần 2 -> 2');
await minus.tap();
await page.waitForTimeout(300);
ok((await input.inputValue()) === '1', 'stepper: chạm - 1 lần -> 1');
await plus.click();
await page.waitForTimeout(300);
ok((await input.inputValue()) === '2', 'stepper: bấm chuột + 1 lần -> 2');
await minus.click();
await page.waitForTimeout(300);
ok((await input.inputValue()) === '1', 'stepper: bấm chuột - 1 lần -> 1');
// Nhập số trực tiếp vẫn đúng.
await input.fill('5');
await page.waitForTimeout(300);
ok((await input.inputValue()) === '5', 'stepper: gõ số trực tiếp -> 5');

await browser.close();
if (fails.length) { console.log('STEPPER FAILURES: ' + fails.join(' | ')); process.exit(1); }
console.log('STEPPER ALL PASS');
