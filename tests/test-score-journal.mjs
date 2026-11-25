// Nhật ký thay đổi từng phiếu (local mode): sửa số liệu -> nhật ký ghi
// mục thay đổi trước/sau; duyệt phiếu -> nhật ký của đúng phiếu đó;
// trang Lịch sử không lộ mã gắn phiếu.
import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';

const EXE = process.env.CHROMIUM_EXE || process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell';
const fails = [];
function ok(c, label) { console.log((c ? 'OK   ' : 'FAIL ') + label); if (!c) fails.push(label); }
const seed5 = JSON.parse(readFileSync('./seed5.json', 'utf-8'));

const browser = await chromium.launch({ executablePath: EXE });
async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(({ seed, session }) => {
    localStorage.setItem('tong-thi-dua-v1', JSON.stringify(seed));
    localStorage.setItem('tong-thi-dua-session-v1', JSON.stringify(session));
  }, { seed: seed5, session: { role: 'admin', name: 'Ban thi đua' } });
  await page.goto('http://localhost:4177/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  return { ctx, page };
}
async function pickClass(page, name) {
  await page.locator('.class-btns button', { hasText: name }).first().click();
  await page.waitForTimeout(500);
}

{
  const { ctx, page } = await newPage();
  await page.getByRole('button', { name: 'Nhập điểm', exact: true }).click();
  await page.waitForTimeout(500);
  // 10B5: phiếu bị trả lại, sửa được. Tăng Tổng điểm tốt (≥5) 12 -> 13
  // rồi lưu nháp (giờ học đang khóa vì phiếu tích 100% giờ Tốt).
  await pickClass(page, '10B5');
  ok(await page.locator('.score-journal').count() === 1, 'journal: mở phiếu thấy thẻ Nhật ký thay đổi của phiếu này');
  await page.locator('.field', { hasText: 'Tổng điểm tốt (≥5)' }).locator('button', { hasText: '+' }).first().click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Lưu nháp', exact: true }).click();
  await page.waitForTimeout(600);
  let j = await page.locator('.score-journal').innerText();
  ok(j.includes('Lưu nháp') && j.includes('Tổng điểm tốt (≥5): 12 → 13'), 'journal: lưu nháp ghi thay đổi Tổng điểm tốt (≥5) 12 → 13 (thấy: ' + j.replace(/\n/g, ' ').slice(0, 220) + ')');
  ok(j.includes('Ban thi đua'), 'journal: nhật ký ghi người thực hiện');
  // 10B3: phiếu chờ duyệt -> duyệt -> nhật ký của phiếu 10B3 có dòng duyệt.
  await pickClass(page, '10B3');
  await page.getByRole('button', { name: 'Duyệt phiếu', exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByTestId('confirm-ok').click();
  await page.waitForTimeout(600);
  j = await page.locator('.score-journal').innerText();
  ok(j.includes('Duyệt phiếu') && j.includes('10B3'), 'journal: duyệt phiếu ghi vào nhật ký của đúng phiếu 10B3');
  ok(!j.includes('Tổng điểm tốt (≥5): 12 → 13'), 'journal: nhật ký 10B3 không lẫn thay đổi của 10B5');
  // Lịch sử chung: không lộ mã gắn phiếu.
  await page.getByRole('button', { name: 'Lịch sử', exact: true }).click();
  await page.waitForTimeout(500);
  const main = await page.locator('main').innerText();
  ok(main.includes('Tổng điểm tốt (≥5): 12 → 13') && !main.includes('[score:'), 'journal: Lịch sử hiện thay đổi và không lộ mã gắn phiếu');
  await ctx.close();
}

await browser.close();
if (fails.length) { console.log('JOURNAL FAIL ' + fails.length); process.exit(1); }
console.log('JOURNAL ALL PASS');
