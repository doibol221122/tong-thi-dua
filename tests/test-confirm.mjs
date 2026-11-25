// Hộp thoại xác nhận trong app (P2-05): xóa tuần hiện đúng số phiếu sẽ mất;
// Hủy thì không đổi, Xác nhận thì xóa thật (local mode).
import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';

const EXE = process.env.CHROMIUM_EXE || process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell';
const fails = [];
function ok(c, label) { console.log((c ? 'OK   ' : 'FAIL ') + label); if (!c) fails.push(label); }
const seed5 = JSON.parse(readFileSync('./seed5.json', 'utf-8'));

const browser = await chromium.launch({ executablePath: EXE });
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  await page.addInitScript(({ seed }) => {
    localStorage.setItem('tong-thi-dua-v1', JSON.stringify(seed));
    localStorage.setItem('tong-thi-dua-session-v1', JSON.stringify({ role: 'admin', name: 'Ban thi đua' }));
  }, { seed: seed5 });
  await page.goto('http://localhost:4177/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Quản lý', exact: true }).click();
  await page.waitForTimeout(500);
  const weekRow = page.locator('main .card p', { hasText: /^Tuần 05 / });
  ok((await weekRow.count()) === 1, 'confirm: Quản lý liệt kê Tuần 05');
  ok((await weekRow.getByRole('button', { name: 'Xóa', exact: true }).count()) === 0, 'confirm: dòng tuần không còn nút Xóa trực tiếp');
  // Muốn xóa tuần phải mở toàn bộ sổ tuần trước.
  await weekRow.getByRole('button', { name: 'Mở sổ', exact: true }).click();
  await page.waitForTimeout(400);
  let t = await page.locator('main').innerText();
  ok(t.includes('Sổ tuần — Tuần 05'), 'confirm: Mở sổ hiện sổ tuần Tuần 05');
  ok(t.includes('128đ'), 'confirm: sổ tuần hiện điểm 128đ của lớp đã duyệt (10B1)');
  ok(t.includes('4 phiếu đã nhập'), 'confirm: sổ tuần nêu đúng 4 phiếu đã nhập');
  const soRows = await page.locator('main table tbody tr').count();
  ok(soRows === 14, 'confirm: sổ tuần liệt kê đủ 14 lớp (có ' + soRows + ')');
  // Đóng sổ -> tuần vẫn còn.
  await page.getByRole('button', { name: 'Đóng sổ', exact: true }).click();
  await page.waitForTimeout(300);
  ok((await page.locator('main .card p', { hasText: /^Tuần 05 / }).count()) === 1, 'confirm: đóng sổ thì Tuần 05 vẫn còn');
  // Mở sổ lại -> Xóa tuần này -> hộp thoại trong app (không phải dialog trình duyệt).
  await page.locator('main .card p', { hasText: /^Tuần 05 / }).getByRole('button', { name: 'Mở sổ', exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Xóa tuần này', exact: true }).click();
  await page.waitForTimeout(400);
  const dlg = page.getByRole('dialog');
  ok((await dlg.count()) === 1, 'confirm: bấm Xóa tuần mở hộp thoại trong app');
  let dt = await dlg.innerText();
  ok(dt.includes('Xóa Tuần 05?'), 'confirm: hộp thoại có tiêu đề "Xóa Tuần 05?" (thấy: ' + dt.split('\n')[0] + ')');
  ok(dt.includes('4 phiếu sẽ bị xóa.'), 'confirm: hộp thoại nêu đúng 4 phiếu sẽ mất (tuần 5 có 4 phiếu)');
  ok(dt.includes('không khôi phục được'), 'confirm: hộp thoại cảnh báo không khôi phục được');
  ok((await page.getByTestId('confirm-ok').getAttribute('class') ?? '').includes('danger'), 'confirm: nút Xác nhận màu đỏ cho thao tác phá hủy');
  // Chống bấm nhầm 2 lần: nút xóa chưa bấm được ngay khi hộp vừa mở.
  ok(await page.getByTestId('confirm-ok').isDisabled(), 'confirm: nút Xóa tuần chưa bấm được ngay khi hộp vừa mở (chống bấm nhầm)');
  ok(dt.includes('tránh bấm nhầm 2 lần'), 'confirm: hộp thoại ghi rõ nút xóa chờ 1 giây');
  await page.waitForTimeout(1000);
  ok(!(await page.getByTestId('confirm-ok').isDisabled()), 'confirm: nút Xóa tuần bấm được sau 1 giây');
  // Bấm Hủy -> không đổi, sổ vẫn mở.
  await page.getByTestId('confirm-cancel').click();
  await page.waitForTimeout(400);
  ok((await page.getByRole('dialog').count()) === 0, 'confirm: bấm Hủy đóng hộp thoại');
  ok((await page.locator('main .card p', { hasText: /^Tuần 05 / }).count()) === 1, 'confirm: bấm Hủy thì Tuần 05 vẫn còn');
  // Xóa lại -> chờ nút xóa "mở khóa" -> Xác nhận -> tuần mất thật, sổ đóng.
  await page.getByRole('button', { name: 'Xóa tuần này', exact: true }).click();
  await page.waitForTimeout(1300);
  await page.getByTestId('confirm-ok').click();
  await page.waitForTimeout(500);
  ok((await page.locator('main .card p', { hasText: /^Tuần 05 / }).count()) === 0, 'confirm: Xác nhận xong Tuần 05 biến mất khỏi Quản lý');
  t = await page.locator('main').innerText();
  ok(!t.includes('Sổ tuần'), 'confirm: xóa xong sổ tuần tự đóng');
  const body = await page.locator('body').innerText();
  ok(body.includes('Tuần 04') && !body.includes('Tuần 05'), 'confirm: tuần hiện tại lùi về Tuần 04 sau khi xóa Tuần 05');
  await ctx.close();
}

await browser.close();
if (fails.length) { console.log('CONFIRM FAILURES: ' + fails.join(' | ')); process.exit(1); }
console.log('CONFIRM ALL PASS');
