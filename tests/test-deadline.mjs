// Hạn nộp theo tuần (local mode): quá hạn ở Tổng quan + Nhập điểm,
// đặt/xóa hạn trong Sổ tuần ở Quản lý.
// Seed: Tuần 05 hạn 2020 (đã quá hạn); phiếu: 10B1 duyệt, 10B3+10B4 chờ
// duyệt, 10B5 bị trả lại, 10 lớp chưa có phiếu -> chưa nộp = 11 lớp.
import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';

const EXE = process.env.CHROMIUM_EXE || process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell';
const fails = [];
function ok(c, label) { console.log((c ? 'OK   ' : 'FAIL ') + label); if (!c) fails.push(label); }
const seed = JSON.parse(readFileSync('./seed5.json', 'utf-8'));
seed.settings = { ...seed.settings, deadlines: { w5: '2020-01-01T17:00' } };

const browser = await chromium.launch({ executablePath: EXE });
async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(({ seed, session }) => {
    localStorage.setItem('tong-thi-dua-v1', JSON.stringify(seed));
    localStorage.setItem('tong-thi-dua-session-v1', JSON.stringify(session));
  }, { seed, session: { role: 'admin', name: 'Ban thi đua' } });
  await page.goto('http://localhost:4177/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  return { ctx, page };
}

{
  const { ctx, page } = await newPage();
  let main = await page.locator('main').innerText();
  ok(main.includes('Hạn nộp:') && main.includes('Đã quá hạn'), 'deadline: dòng tuần hiện hạn nộp đã quá hạn');
  ok(main.includes('Quá hạn nộp (11)'), 'deadline: Cần xử lý ngay có mục Quá hạn nộp (11)');
  ok(main.includes('10B5') && main.includes('11A1'), 'deadline: danh sách quá hạn gồm lớp bị trả lại và lớp chưa có phiếu');
  await page.getByRole('button', { name: 'Nhập điểm', exact: true }).click();
  await page.waitForTimeout(500);
  await page.locator('.class-btns button', { hasText: '10B1' }).first().click();
  await page.waitForTimeout(500);
  main = await page.locator('main').innerText();
  ok(main.includes('Đã quá hạn nộp'), 'deadline: Nhập điểm hiện cảnh báo quá hạn nộp');
  await ctx.close();
}

{
  const { ctx, page } = await newPage();
  await page.getByRole('button', { name: 'Quản lý', exact: true }).click();
  await page.waitForTimeout(500);
  await page.locator('button', { hasText: 'Mở sổ' }).last().click();
  await page.waitForTimeout(400);
  const input = page.locator('input[type="datetime-local"]');
  ok(await input.count() === 1 && (await input.inputValue()) === '2020-01-01T17:00', 'deadline: Sổ tuần hiện hạn nộp đã đặt');
  await input.fill('2999-01-01T17:00');
  await page.getByRole('button', { name: 'Lưu hạn nộp', exact: true }).click();
  await page.waitForTimeout(400);
  ok((await page.locator('main').innerText()).includes('Đã lưu hạn nộp.'), 'deadline: lưu hạn nộp mới có thông báo');
  await page.getByRole('button', { name: 'Tổng quan', exact: true }).click();
  await page.waitForTimeout(500);
  const main = await page.locator('main').innerText();
  ok(main.includes('Còn hạn') && !main.includes('Quá hạn nộp ('), 'deadline: hạn tương lai thì Tổng quan báo còn hạn, hết mục quá hạn');
  await page.getByRole('button', { name: 'Quản lý', exact: true }).click();
  await page.waitForTimeout(400);
  await page.locator('button', { hasText: 'Mở sổ' }).last().click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Xóa hạn', exact: true }).click();
  await page.waitForTimeout(400);
  ok((await page.locator('main').innerText()).includes('Đã xóa hạn nộp.'), 'deadline: xóa hạn nộp có thông báo');
  await ctx.close();
}

await browser.close();
if (fails.length) { console.log('DEADLINE FAIL ' + fails.length); process.exit(1); }
console.log('DEADLINE ALL PASS');
