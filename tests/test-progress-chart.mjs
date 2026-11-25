// Biểu đồ tiến bộ từng lớp ở Tổng quan (local mode).
// Seed: 10B1 duyệt Tuần 01 128đ + Tuần 05 128đ; 10B2 duyệt Tuần 01 130đ;
// 10B3 chỉ có phiếu chờ duyệt nên chưa có dữ liệu biểu đồ.
import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';

const EXE = process.env.CHROMIUM_EXE || process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell';
const fails = [];
function ok(c, label) { console.log((c ? 'OK   ' : 'FAIL ') + label); if (!c) fails.push(label); }
const seed5 = JSON.parse(readFileSync('./seed5.json', 'utf-8'));

const browser = await chromium.launch({ executablePath: EXE });
async function newPage(viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await page.addInitScript(({ seed, session }) => {
    localStorage.setItem('tong-thi-dua-v1', JSON.stringify(seed));
    localStorage.setItem('tong-thi-dua-session-v1', JSON.stringify(session));
  }, { seed: seed5, session: { role: 'admin', name: 'Ban thi đua' } });
  await page.goto('http://localhost:4177/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  return { ctx, page };
}

{
  const { ctx, page } = await newPage();
  const card = page.locator('.progress-card');
  ok(await card.count() === 1, 'progress-chart: Tổng quan có thẻ biểu đồ tiến bộ');
  ok((await card.locator('h2').innerText()) === 'Biểu đồ tiến bộ từng lớp', 'progress-chart: tiêu đề đúng');
  const sel = card.locator('select');
  ok((await sel.inputValue()) === 'c0', 'progress-chart: mặc định chọn lớp đầu tiên có phiếu duyệt (10B1)');
  ok(await card.locator('svg.progress-svg').count() === 1, 'progress-chart: có SVG biểu đồ');
  ok(await card.locator('svg .pc-point').count() === 2, 'progress-chart: 10B1 có 2 điểm đã duyệt');
  ok(await card.locator('svg .pc-line').count() === 1, 'progress-chart: 10B1 có đường nối các tuần đã duyệt');
  const text = await card.innerText();
  ok(text.includes('Mới nhất: Tuần 05 — 128đ (A), hạng 1'), 'progress-chart: thống kê mới nhất đúng (thấy: ' + text.replace(/\n/g, ' ').slice(0, 180) + ')');
  ok(text.includes('So với tuần duyệt trước: +0đ'), 'progress-chart: thay đổi so với tuần duyệt trước +0đ');
  ok(text.includes('Tuần 01: 128đ-A (#2)') && text.includes('Tuần 05: 128đ-A (#1)'), 'progress-chart: danh sách điểm từng tuần đúng hạng');
  ok(text.includes('Tuần 02: —'), 'progress-chart: tuần chưa duyệt hiện dấu —');

  await sel.selectOption('c1');
  await page.waitForTimeout(400);
  ok(await card.locator('svg .pc-point').count() === 1, 'progress-chart: 10B2 có 1 điểm đã duyệt');
  ok((await card.innerText()).includes('mới có 1 tuần đã duyệt'), 'progress-chart: lớp 1 tuần có ghi chú xu hướng');

  await sel.selectOption('c2');
  await page.waitForTimeout(400);
  ok((await card.innerText()).includes('chưa có phiếu đã duyệt'), 'progress-chart: lớp chưa duyệt báo chưa có dữ liệu');
  ok(await card.locator('svg.progress-svg').count() === 0, 'progress-chart: lớp chưa duyệt không vẽ SVG rỗng');
  await ctx.close();
}

{
  const { ctx, page } = await newPage({ width: 390, height: 844 });
  const card = page.locator('.progress-card');
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const box = await card.locator('svg.progress-svg').boundingBox();
  ok(!!box && box.x >= 0 && box.x + box.width <= 390, 'progress-chart: SVG vừa màn 390px (box: ' + JSON.stringify(box) + ')');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(overflow <= 0, 'progress-chart: không tràn ngang ở 390px (overflow: ' + overflow + ')');
  await ctx.close();
}

await browser.close();
if (fails.length) { console.log('PROGRESS-CHART FAIL ' + fails.length); process.exit(1); }
console.log('PROGRESS-CHART ALL PASS');
