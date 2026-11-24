// Hồi quy gọn: 5 mục dùng được + lịch trực + cờ đỏ tự chọn (local mode).
import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';

const EXE = process.env.CHROMIUM_EXE || process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell';
const fails = [];
function ok(c, label) { console.log((c ? 'OK   ' : 'FAIL ') + label); if (!c) fails.push(label); }
const seed5 = JSON.parse(readFileSync('./seed5.json', 'utf-8'));
const seedDuty = JSON.parse(readFileSync('./seed-duty.json', 'utf-8'));

const browser = await chromium.launch({ executablePath: EXE });
async function newPage(seed, session) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  await page.addInitScript(({ seed, session }) => {
    localStorage.setItem('tong-thi-dua-v1', JSON.stringify(seed));
    localStorage.setItem('tong-thi-dua-session-v1', JSON.stringify(session));
  }, { seed, session });
  await page.goto('http://localhost:4177/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  return { ctx, page };
}

// ---- Admin: 5 mục + lịch trực + mời GVCN ----
{
  const { ctx, page } = await newPage(seed5, { role: 'admin', name: 'Ban thi đua' });
  let t = await page.locator('main').innerText();
  ok(t.includes('Cần xử lý ngay'), 'admin: có thẻ Cần xử lý ngay');
  ok(t.includes('Chờ duyệt (2)'), 'admin: Chờ duyệt (2)');
  ok(t.includes('Bị trả lại (1)'), 'admin: Bị trả lại (1)');
  await page.getByRole('button', { name: 'Nhập điểm' }).click();
  await page.waitForTimeout(400);
  ok(await page.getByRole('button', { name: 'Duyệt tất cả 2 phiếu đã nộp' }).count() === 1, 'admin: có nút Duyệt tất cả 2 phiếu');
  await page.getByRole('button', { name: 'Duyệt tất cả 2 phiếu đã nộp' }).click();
  await page.waitForTimeout(500);
  t = await page.locator('main').innerText();
  ok(t.includes('Đã duyệt 2 phiếu của Tuần 05'), 'admin: duyệt tất cả -> báo đã duyệt 2 phiếu');
  // Lịch trực + mời GVCN.
  await page.getByRole('button', { name: 'Quản lý' }).click();
  await page.waitForTimeout(400);
  t = await page.locator('main').innerText();
  ok(t.includes('Lịch trực cờ đỏ'), 'admin: có thẻ Lịch trực cờ đỏ');
  ok(t.includes('Mời giáo viên chủ nhiệm'), 'admin: có thẻ Mời giáo viên chủ nhiệm');
  const rows = await page.locator('main table tbody tr').count();
  ok(rows >= 17, 'admin: bảng lịch trực có 17 hàng tuần (có ' + rows + ')');
  // Sửa tên lớp.
  await page.getByRole('button', { name: 'Sửa tên' }).first().click();
  await page.waitForTimeout(300);
  const rename = page.locator('main input[value="10B1"]');
  await rename.fill('10B1X');
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await page.waitForTimeout(400);
  t = await page.locator('main').innerText();
  ok(t.includes('10B1X'), 'admin: sửa tên lớp 10B1 -> 10B1X');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(overflow <= 0, 'admin: không tràn ngang 390px (Quản lý)');
  await ctx.close();
}

// ---- Cờ đỏ tự chọn (seed-duty: đã gán 10B5) ----
{
  const { ctx, page } = await newPage(seedDuty, { role: 'codo', name: 'Nguyễn Văn A' });
  let t = await page.locator('body').innerText();
  ok(t.includes('Trực lớp 10B5'), 'codo: chip Trực lớp 10B5');
  ok(t.includes('lớp bạn trực'), 'codo: banner lớp bạn trực');
  ok(await page.getByRole('button', { name: 'Đổi lớp trực' }).count() === 1, 'codo: có nút Đổi lớp trực');
  await page.getByRole('button', { name: 'Tổng quan' }).click();
  await page.waitForTimeout(400);
  t = await page.locator('main').innerText();
  ok(t.includes('Tuần này bạn trực lớp 10B5'), 'codo: thẻ Lớp của bạn hiện trực lớp 10B5');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(overflow <= 0, 'codo: không tràn ngang 390px');
  await ctx.close();
}

// ---- Xếp hạng gọn: danh sách 1 dòng/lớp, lọc khối viên thuốc, xuất file lưới 2x2 ----
{
  const { ctx, page } = await newPage(seed5, { role: 'admin', name: 'Ban thi đua' });
  await page.getByRole('button', { name: 'Xếp hạng', exact: true }).click();
  await page.waitForTimeout(400);
  ok((await page.locator('.podium').count()) === 0, 'xep-hang: không còn 3 thẻ podium to');
  ok((await page.locator('.ranklist li').count()) === 1, 'xep-hang: tuần 5 có 1 lớp đã duyệt');
  ok((await page.getByRole('button', { name: 'Tất cả', exact: true }).count()) === 1, 'xep-hang: lọc khối là viên thuốc Tất cả');
  ok((await page.locator('.exportgrid .btn').count()) === 4, 'xep-hang: 4 nút xuất file trong lưới 2x2');
  ok((await page.locator('.exportgrid button', { hasText: 'Nộp & chốt' }).count()) === 0, 'xep-hang: nút chốt tuần tách khỏi nhóm xuất file');
  // Duyệt hết phiếu chờ rồi kiểm tra thứ tự + lọc khối.
  await page.getByRole('button', { name: 'Nhập điểm' }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Duyệt tất cả 2 phiếu đã nộp' }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Xếp hạng', exact: true }).click();
  await page.waitForTimeout(400);
  ok((await page.locator('.ranklist li').count()) === 3, 'xep-hang: duyệt hết -> 3 lớp trong danh sách');
  const first = await page.locator('.ranklist li').first().innerText();
  ok(first.includes('10B1') && first.includes('128đ'), 'xep-hang: hạng 1 là 10B1 128đ');
  ok((await page.locator('.ranklist li.top1').count()) === 1, 'xep-hang: hạng 1 có huy hiệu top1');
  await page.getByRole('button', { name: 'Khối xã hội' }).click();
  await page.waitForTimeout(400);
  ok((await page.locator('.ranklist li').count()) === 2, 'xep-hang: lọc Khối xã hội -> 2 lớp');
  await page.getByRole('button', { name: 'Khối tự nhiên' }).click();
  await page.waitForTimeout(400);
  ok((await page.locator('.ranklist li').count()) === 1, 'xep-hang: lọc Khối tự nhiên -> 1 lớp');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(overflow <= 0, 'xep-hang: không tràn ngang 390px');
  await ctx.close();
}

// ---- Chế độ local: banner cảnh báo + chip đồng bộ; mobile: scorebar không che ô cuối, tap target 44px ----
{
  const { ctx, page } = await newPage(seed5, { role: 'admin', name: 'Ban thi đua' });
  let t = await page.locator('body').innerText();
  ok(t.includes('CHƯA CẤU HÌNH SUPABASE — dữ liệu chỉ lưu trên máy này, không đồng bộ'), 'local: banner cố định cảnh báo chế độ máy này');
  ok(t.includes('Chỉ lưu trên máy này'), 'local: chip đồng bộ hiện "Chỉ lưu trên máy này"');
  await page.getByRole('button', { name: 'Nhập điểm' }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: '10B2', exact: true }).click();
  await page.waitForTimeout(400);
  // Cuộn xuống cuối trang: ô cuối (Ý kiến của cờ đỏ) không bị thanh điểm cố định che.
  const clear = await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    const ta = [...document.querySelectorAll('textarea')].pop();
    if (!ta) return false;
    const r = ta.getBoundingClientRect();
    const sb = document.querySelector('.scorebar');
    if (!sb) return false;
    const s = sb.getBoundingClientRect();
    return r.bottom <= s.top;
  });
  ok(clear, 'mobile: cuộn cuối phiếu -> ô Ý kiến cờ đỏ không bị thanh điểm che');
  // Tap target 44px: hộp 100% và nút lưu trong thanh điểm.
  const targets = await page.evaluate(() => {
    const label = document.querySelector('.top100 label');
    const btn = document.querySelector('.scorebar-btns .btn');
    return {
      label: label ? Math.round(label.getBoundingClientRect().height) : 0,
      btn: btn ? Math.round(btn.getBoundingClientRect().height) : 0,
    };
  });
  ok(targets.label >= 44, 'mobile: hộp 100% cao ' + targets.label + 'px (>= 44px)');
  ok(targets.btn >= 44, 'mobile: nút trong thanh điểm cao ' + targets.btn + 'px (>= 44px)');
  // Stepper gõ rỗng -> hiện "nhập số", không lặng lẽ thành 0.
  const hoursTot = page.getByLabel('Giờ Tốt', { exact: true });
  await hoursTot.fill('');
  await page.waitForTimeout(300);
  ok((await page.locator('.num-hint').count()) >= 1, 'stepper: gõ rỗng -> hiện "nhập số"');
  ok((await page.locator('.num-hint').first().innerText()) === 'nhập số', 'stepper: gợi ý đúng chữ "nhập số"');
  await hoursTot.fill('5');
  await page.waitForTimeout(300);
  ok((await page.locator('.num-hint').count()) === 0, 'stepper: gõ số hợp lệ -> hết gợi ý');
  // Export grid 1 cột ở 390px.
  await page.getByRole('button', { name: 'Xếp hạng', exact: true }).click();
  await page.waitForTimeout(400);
  const cols = await page.evaluate(() => getComputedStyle(document.querySelector('.exportgrid')).gridTemplateColumns.split(' ').length);
  ok(cols === 1, 'mobile: lưới xuất file 1 cột ở 390px');
  await ctx.close();
}

await browser.close();
if (fails.length) { console.log('SMOKE FAILURES: ' + fails.join(' | ')); process.exit(1); }
console.log('SMOKE ALL PASS');
