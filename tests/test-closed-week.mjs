// Chốt sổ: tuần đã chốt thì cờ đỏ không nhập lại được (khóa + dòng báo rõ);
// Ban thi đua mở lại sổ + hủy duyệt phiếu thì nhập lại được (local mode).
import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';

const EXE = process.env.CHROMIUM_EXE || process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell';
const fails = [];
function ok(c, label) { console.log((c ? 'OK   ' : 'FAIL ') + label); if (!c) fails.push(label); }
const seed5 = JSON.parse(readFileSync('./seed5.json', 'utf-8'));
// Tuần 05 đã chốt sổ; cờ đỏ Nguyễn Văn A trực lớp 10B1 (phiếu đã duyệt 128đ).
const closedSeed = JSON.parse(JSON.stringify(seed5));
closedSeed.weeks[4].submittedAt = '25/11/2026 10:00';
closedSeed.weeks[4].submittedBy = 'Ban thi đua';
closedSeed.roster = [{ id: 'r1', name: 'Nguyễn Văn A', classId: 'c0', weekId: 'w5', active: true }];

const browser = await chromium.launch({ executablePath: EXE });
function seedCtx(page, session) {
  return page.addInitScript(({ seed, session }) => {
    localStorage.setItem('tong-thi-dua-v1', JSON.stringify(seed));
    localStorage.setItem('tong-thi-dua-session-v1', JSON.stringify(session));
  }, { seed: closedSeed, session });
}

// ---- 1: cờ đỏ ở tuần đã chốt sổ -> bị khóa, có dòng báo rõ ----
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  await seedCtx(page, { role: 'codo', name: 'Nguyễn Văn A' });
  await page.goto('http://localhost:4177/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  let t = await page.locator('main').innerText();
  ok(t.includes('đã chốt sổ'), 'closed: cờ đỏ thấy dòng báo tuần đã chốt sổ');
  ok(t.includes('không nhập lại được'), 'closed: dòng báo ghi rõ không nhập lại được');
  ok(await page.getByRole('button', { name: 'Lưu & nộp phiếu từng lớp' }).isDisabled(), 'closed: nút Lưu & nộp bị khóa');
  ok(await page.getByRole('button', { name: 'Lưu nháp' }).isDisabled(), 'closed: nút Lưu nháp bị khóa');
  ok(await page.getByRole('button', { name: 'Chép số liệu tuần trước' }).isDisabled(), 'closed: nút Chép số liệu tuần trước bị khóa');
  ok(await page.locator('main input[type=number]').first().isDisabled(), 'closed: ô nhập số bị khóa');
  await ctx.close();
}

// ---- 2: Ban thi đua mở lại sổ + hủy duyệt phiếu -> nhập lại được ----
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  await seedCtx(page, { role: 'admin', name: 'Ban thi đua' });
  await page.goto('http://localhost:4177/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Xếp hạng', exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Mở lại tuần', exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByTestId('confirm-ok').click();
  await page.waitForTimeout(500);
  let t = await page.locator('main').innerText();
  ok(t.includes('Chưa chốt tuần'), 'reopen: mở lại sổ -> tuần về Chưa chốt');
  await page.getByRole('button', { name: 'Nhập điểm', exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: '10B1', exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Sửa lại phiếu', exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByTestId('confirm-ok').click();
  await page.waitForTimeout(600);
  t = await page.locator('main').innerText();
  ok(!t.includes('đã chốt sổ'), 'reopen: mở lại sổ xong không còn dòng báo chốt sổ');
  ok(!(await page.getByRole('button', { name: 'Lưu nháp' }).isDisabled()), 'reopen: hủy duyệt xong nút Lưu nháp mở lại');
  await ctx.close();
}

await browser.close();
if (fails.length) { console.log('CLOSED-WEEK FAILURES: ' + fails.join(' | ')); process.exit(1); }
console.log('CLOSED-WEEK ALL PASS');
