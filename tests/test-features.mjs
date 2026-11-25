// Tính năng bổ sung: thống kê HS vi phạm nhiều lần + tìm nhanh, cảnh báo
// lớp tụt điểm, tìm nhanh trong Lịch sử, gợi ý tên HS, nút in phiếu.
import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';

const EXE = process.env.CHROMIUM_EXE || process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell';
const fails = [];
function ok(c, label) { console.log((c ? 'OK   ' : 'FAIL ') + label); if (!c) fails.push(label); }
const seed5 = JSON.parse(readFileSync('./seed5.json', 'utf-8'));
const seed = JSON.parse(JSON.stringify(seed5));
const w1c0 = seed.scores.find(s => s.weekId === 'w1' && s.classId === 'c0');
const w5c0 = seed.scores.find(s => s.weekId === 'w5' && s.classId === 'c0');
w1c0.details.violNames = { lateLate: 'Minh' };
w5c0.details.violNames = { lateLate: 'Minh, Quân', foodEat: 'Minh' };
const w1c1 = seed.scores.find(s => s.weekId === 'w1' && s.classId === 'c1');
const dropScore = JSON.parse(JSON.stringify(w1c1));
dropScore.id = 'drop-c1-w5'; dropScore.weekId = 'w5'; dropScore.details.dirty = 4;
seed.scores.push(dropScore);
seed.logs = [
  { id: 'l1', time: '25/11/2026 08:00', actor: 'Ban thi đua', role: 'admin', action: 'Duyệt phiếu', detail: '10B1 — Tuần 05' },
  { id: 'l2', time: '25/11/2026 09:00', actor: 'Ban thi đua', role: 'admin', action: 'Xuất file .docx', detail: 'Tuần 01' },
];

const browser = await chromium.launch({ executablePath: EXE });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(({ seed, session }) => {
  localStorage.setItem('tong-thi-dua-v1', JSON.stringify(seed));
  localStorage.setItem('tong-thi-dua-session-v1', JSON.stringify(session));
}, { seed, session: { role: 'admin', name: 'Ban thi đua' } });
await page.goto('http://localhost:4177/', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

const bodyText = await page.locator('body').innerText();
ok(bodyText.includes('Học sinh vi phạm nhiều lần'), 'features: Tổng quan có thống kê HS vi phạm nhiều lần');
ok(bodyText.includes('Minh') && bodyText.includes('3 lần (2 tuần)'), 'features: Minh được đếm 3 lần trong 2 tuần');
ok(bodyText.includes('Cảnh báo lớp tụt điểm') && bodyText.includes('10B2') && bodyText.includes('130đ') && bodyText.includes('110đ'), 'features: cảnh báo 10B2 tụt 130đ xuống 110đ');
const search = page.getByLabel('Tìm nhanh học sinh vi phạm');
await search.fill('Quân');
await page.waitForTimeout(200);
const afterSearch = await page.locator('body').innerText();
ok(afterSearch.includes('Quân') && afterSearch.includes('1 lần (1 tuần)'), 'features: tìm nhanh HS lọc đúng Quân');

await page.getByRole('button', { name: 'Lịch sử', exact: true }).click();
await page.waitForTimeout(300);
await page.getByLabel('Tìm nhanh trong lịch sử').fill('Xuất file');
await page.waitForTimeout(200);
const logText = await page.locator('body').innerText();
ok(logText.includes('Xuất file .docx') && !logText.includes('Duyệt phiếu'), 'features: tìm nhanh trong Lịch sử lọc đúng hoạt động');

await page.getByRole('button', { name: 'Nhập điểm', exact: true }).click();
await page.waitForTimeout(300);
await page.locator('.class-btns button', { hasText: '10B5' }).click();
await page.waitForTimeout(300);
ok(await page.locator('#student-name-suggestions option[value="Minh"]').count() === 1, 'features: gợi ý tên HS có Minh');
ok(await page.locator('input[list="student-name-suggestions"]').count() > 0, 'features: ô tên HS gắn gợi ý');
ok(await page.getByRole('button', { name: 'In phiếu', exact: true }).count() === 1, 'features: có nút In phiếu');
await page.getByRole('button', { name: 'Xem phiếu tổng kết' }).click();
await page.waitForTimeout(200);
ok(await page.locator('.print-phieu').count() === 1, 'features: phiếu tổng kết có vùng in riêng');
ok(await page.getByRole('button', { name: 'In phiếu này' }).count() === 1, 'features: có nút In phiếu này');

await ctx.close();
await browser.close();
console.log(fails.length ? `FEATURES FAIL (${fails.length})` : 'FEATURES ALL PASS');
process.exit(fails.length ? 1 : 0);
