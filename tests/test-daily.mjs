// Nhập theo ngày Thứ 2–6: thêm dòng ngày, cộng vào phiếu tuần, lưu nháp.
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
await page.getByRole('button', { name: 'Nhập điểm', exact: true }).click();
await page.waitForTimeout(300);
await page.locator('.class-btns button', { hasText: '10B5' }).click();
await page.waitForTimeout(300);
ok((await page.locator('body').innerText()).includes('Theo dõi từng ngày (Thứ 2–6)'), 'daily: có mục theo dõi từng ngày');
await page.getByRole('button', { name: 'Thêm dòng ngày' }).click();
await page.waitForTimeout(150);
await page.getByLabel('Số lượt dòng 1').fill('2');
await page.getByLabel('Tên HS dòng 1').fill('Minh, Quân');
await page.getByRole('button', { name: 'Thêm dòng ngày' }).click();
await page.waitForTimeout(150);
await page.getByLabel('Ngày dòng 2').selectOption('3');
await page.getByLabel('Số lượt dòng 2').fill('1');
await page.getByLabel('Tên HS dòng 2').fill('Lan');
ok((await page.locator('body').innerText()).includes('Tổng theo ngày: Đi muộn 3'), 'daily: tổng theo ngày cộng đúng 3 lượt đi muộn');
await page.getByRole('button', { name: 'Cộng vào phiếu tuần' }).click();
await page.waitForTimeout(200);
await page.getByRole('button', { name: 'Lưu nháp' }).click();
await page.waitForTimeout(400);
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('tong-thi-dua-v1') || '{}'));
const score = saved.scores.find(s => s.weekId === 'w5' && s.classId === 'c4');
ok(score?.details?.lateLate === 3, 'daily: phiếu tuần nhận 3 lượt đi muộn (thấy ' + score?.details?.lateLate + ')');
ok((score?.details?.violNames?.lateLate ?? '').includes('Minh') && (score?.details?.violNames?.lateLate ?? '').includes('Lan'), 'daily: tên HS được cộng vào phiếu tuần');
ok(score?.details?.daily?.length === 2, 'daily: dòng theo ngày được lưu cùng phiếu');
await ctx.close();
await browser.close();
console.log(fails.length ? `DAILY FAIL (${fails.length})` : 'DAILY ALL PASS');
process.exit(fails.length ? 1 : 0);
