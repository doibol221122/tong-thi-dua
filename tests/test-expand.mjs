// Mở rộng: xu hướng toàn trường, ảnh xếp hạng, in bảng xếp hạng,
// lọc lịch sử theo việc làm, tìm tài khoản trong Quản lý.
import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';

const EXE = process.env.CHROMIUM_EXE || process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell';
const fails = [];
function ok(c, label) { console.log((c ? 'OK   ' : 'FAIL ') + label); if (!c) fails.push(label); }
const seed5 = JSON.parse(readFileSync('./seed5.json', 'utf-8'));
const seed = JSON.parse(JSON.stringify(seed5));
seed.logs = [
  { id: 'l1', time: '25/11/2026 08:00', actor: 'Ban thi đua', role: 'admin', action: 'Duyệt phiếu', detail: '10B1 — Tuần 05' },
  { id: 'l2', time: '25/11/2026 09:00', actor: 'Ban thi đua', role: 'admin', action: 'Xuất file .docx', detail: 'Tuần 01' },
];

const browser = await chromium.launch({ executablePath: EXE });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
await page.addInitScript(({ seed, session }) => {
  localStorage.setItem('tong-thi-dua-v1', JSON.stringify(seed));
  localStorage.setItem('tong-thi-dua-session-v1', JSON.stringify(session));
}, { seed, session: { role: 'admin', name: 'Ban thi đua' } });
await page.goto('http://localhost:4177/', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const bodyText = await page.locator('body').innerText();
ok(bodyText.includes('Xu hướng điểm toàn trường') && bodyText.includes('129.0đ') && bodyText.includes('128.0đ'), 'expand: xu hướng toàn trường đúng điểm trung bình');

await page.getByRole('button', { name: 'Xếp hạng', exact: true }).click();
await page.waitForTimeout(300);
ok(await page.getByRole('button', { name: 'Tải ảnh xếp hạng' }).count() === 1, 'expand: có nút tải ảnh xếp hạng');
ok(await page.getByRole('button', { name: 'In bảng xếp hạng' }).count() === 1, 'expand: có nút in bảng xếp hạng');
const downloadPromise = page.waitForEvent('download', { timeout: 8000 });
await page.getByRole('button', { name: 'Tải ảnh xếp hạng' }).click();
const download = await downloadPromise;
ok(download.suggestedFilename().includes('XEP_HANG') && download.suggestedFilename().endsWith('.png'), 'expand: ảnh xếp hạng tải đúng file PNG (' + download.suggestedFilename() + ')');

await page.getByRole('button', { name: 'Lịch sử', exact: true }).click();
await page.waitForTimeout(300);
await page.getByLabel('Lọc theo việc làm').selectOption('Xuất file .docx');
await page.waitForTimeout(200);
const logText = await page.locator('.log-table-wrap, .log-list').first().innerText();
ok(logText.includes('Xuất file .docx') && !logText.includes('Duyệt phiếu'), 'expand: lọc lịch sử theo việc làm đúng');

await page.getByRole('button', { name: 'Quản lý', exact: true }).click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Tài khoản cờ đỏ' }).click();
await page.waitForTimeout(200);
await page.getByLabel('Tìm tài khoản').fill('khong-co');
await page.waitForTimeout(200);
ok((await page.locator('body').innerText()).includes('Không tìm thấy tài khoản phù hợp.'), 'expand: tìm tài khoản trong Quản lý hoạt động');

await ctx.close();
await browser.close();
console.log(fails.length ? `EXPAND FAIL (${fails.length})` : 'EXPAND ALL PASS');
process.exit(fails.length ? 1 : 0);
