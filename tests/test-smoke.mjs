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
  // Đồng hồ ngày/giờ hiện tại ở header, tự chạy từng giây.
  ok((await page.locator('.top .clock').count()) === 1, 'header: có đồng hồ ngày/giờ');
  const clockRe = /^Thứ (Hai|Ba|Tư|Năm|Sáu|Bảy|Chủ nhật), \d{2}\/\d{2}\/\d{4} • \d{2}:\d{2}:\d{2}$/;
  const clock1 = (await page.locator('.top .clock').innerText()).trim();
  ok(clockRe.test(clock1), 'header: đồng hồ đúng dạng "Thứ Tư, 25/11/2026 • 08:25:33" (thấy: ' + clock1 + ')');
  const today = await page.evaluate(() => new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }));
  ok(clock1.includes(today), 'header: đồng hồ hiện đúng ngày hôm nay (' + today + ')');
  await page.waitForTimeout(2500);
  const clock2 = (await page.locator('.top .clock').innerText()).trim();
  ok(clock2 !== clock1, 'header: đồng hồ tự chạy (giây thay đổi sau 2,5s)');
  let t = await page.locator('main').innerText();
  ok(t.includes('Cần xử lý ngay'), 'admin: có thẻ Cần xử lý ngay');
  ok(t.includes('Chờ duyệt (2)'), 'admin: Chờ duyệt (2)');
  ok(t.includes('Bị trả lại (1)'), 'admin: Bị trả lại (1)');
  ok(!t.includes('Lớp cần nhắc'), 'admin: không còn thẻ Lớp cần nhắc riêng (đã gộp vào Cần xử lý ngay)');
  ok(t.includes('Chép tin nhắc Zalo'), 'admin: nút Chép tin nhắc Zalo nằm trong Cần xử lý ngay');
  ok(!t.includes('Cảnh báo lớp vi phạm') && !t.includes('Quy trình làm việc'), 'admin: Tổng quan không còn thẻ Cảnh báo lớp vi phạm và Quy trình làm việc');
  await page.getByRole('button', { name: 'Nhập điểm' }).click();
  await page.waitForTimeout(400);
  ok(await page.getByRole('button', { name: /Duyệt tất cả/ }).count() === 0, 'admin: không còn nút Duyệt tất cả');
  t = await page.locator('main').innerText();
  ok(t.includes('Sửa lại phiếu') && t.includes('Xóa phiếu'), 'admin: phiếu đã gửi có nút sửa/xóa');
  // Quản lý chia mục: mặc định mở "Tuần & lớp" (đổi tên lớp ở đây).
  await page.getByRole('button', { name: 'Quản lý' }).click();
  await page.waitForTimeout(400);
  t = await page.locator('main').innerText();
  ok(t.includes('Tuần 05'), 'admin: mục Tuần & lớp liệt kê Tuần 05');
  // Sửa tên lớp.
  await page.getByRole('button', { name: 'Sửa tên' }).first().click();
  await page.waitForTimeout(300);
  const rename = page.locator('main input[value="10B1"]');
  await rename.fill('10B1X');
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await page.waitForTimeout(300);
  await page.getByTestId('confirm-ok').click();
  await page.waitForTimeout(400);
  t = await page.locator('main').innerText();
  ok(t.includes('10B1X'), 'admin: sửa tên lớp 10B1 -> 10B1X');
  // Lịch trực ở mục Tài khoản cờ đỏ.
  await page.getByRole('button', { name: 'Tài khoản cờ đỏ', exact: true }).click();
  await page.waitForTimeout(400);
  t = await page.locator('main').innerText();
  ok(t.includes('Lịch trực cờ đỏ'), 'admin: mục cờ đỏ có thẻ Lịch trực cờ đỏ');
  const rows = await page.locator('main table tbody tr').count();
  ok(rows >= 17, 'admin: bảng lịch trực có 17 hàng tuần (có ' + rows + ')');
  // Mời GVCN ở mục Tài khoản GVCN.
  await page.getByRole('button', { name: 'Tài khoản GVCN', exact: true }).click();
  await page.waitForTimeout(400);
  t = await page.locator('main').innerText();
  ok(t.includes('Mời giáo viên chủ nhiệm'), 'admin: mục GVCN có thẻ Mời giáo viên chủ nhiệm');
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
  // Phiếu w5 c4 (10B5) trong seed-duty đang Bị trả lại — cờ đỏ phải thấy ngay.
  ok(t.includes('Phiếu bị trả lại'), 'codo: Nhập điểm hiện banner "Phiếu bị trả lại"');
  ok(t.includes('Thiếu số liệu giờ Khá'), 'codo: banner hiện đúng lý do trả lại');
  ok(await page.getByRole('button', { name: 'Đổi lớp trực' }).count() === 1, 'codo: có nút Đổi lớp trực');
  // Cờ đỏ không còn tab Tổng quan (chỉ Nhập điểm + Xếp hạng) — thông tin trả
  // phiếu và lớp trực đã kiểm ở trên (banner Nhập điểm + chip header).
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(overflow <= 0, 'codo: không tràn ngang 390px');
  await ctx.close();
}

// ---- Xếp hạng gọn: danh sách 1 dòng/lớp, lọc khối viên thuốc, xuất file lưới 2x2 ----
{
  const seedApproved = JSON.parse(JSON.stringify(seed5));
  seedApproved.scores.forEach(x => { if (x.status === 'submitted') x.status = 'approved'; });
  const { ctx, page } = await newPage(seedApproved, { role: 'admin', name: 'Ban thi đua' });
  await page.getByRole('button', { name: 'Xếp hạng', exact: true }).click();
  await page.waitForTimeout(400);
  ok((await page.locator('.podium').count()) === 0, 'xep-hang: không còn 3 thẻ podium to');
  ok((await page.locator('.ranklist li').count()) === 3, 'xep-hang: tuần 5 có 3 lớp đã gửi');
  ok((await page.getByRole('button', { name: 'Tất cả', exact: true }).count()) === 1, 'xep-hang: lọc khối là viên thuốc Tất cả');
  ok((await page.locator('.exportgrid .btn').count()) === 6, 'xep-hang: 6 nút xuất file/in/ảnh trong lưới');
  ok((await page.locator('.exportgrid button', { hasText: 'Nộp & chốt' }).count()) === 0, 'xep-hang: nút chốt tuần tách khỏi nhóm xuất file');
  ok((await page.locator('.ranklist li').count()) === 3, 'xep-hang: phiếu gửi tính ngay -> 3 lớp trong danh sách');
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
  // Chip "Chỉ lưu trên máy này" ẩn ở màn hẹp (header phải hiện đủ tuần + vai trò + tên) — thông tin đã có ở banner trên.
  ok((await page.locator('.userbox .chip', { hasText: 'Chỉ lưu trên máy này' }).isVisible()) === false, 'local: chip "Chỉ lưu trên máy này" ẩn ở màn hẹp');
  await page.getByRole('button', { name: 'Nhập điểm' }).click();
  await page.waitForTimeout(400);
  // P2-06: ở 390px hàng nút chọn lớp bị ẩn, chọn lớp bằng dropdown.
  await page.locator('.class-select-wrap select').selectOption({ label: '10B2' });
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
  // Gõ Giờ Tốt làm dirty -> chuyển tab mở hộp thoại xác nhận (P2-05).
  await page.getByTestId('confirm-ok').click();
  await page.waitForTimeout(300);
  const cols = await page.evaluate(() => getComputedStyle(document.querySelector('.exportgrid')).gridTemplateColumns.split(' ').length);
  ok(cols === 1, 'mobile: lưới xuất file 1 cột ở 390px');
  await ctx.close();
}

await browser.close();
if (fails.length) { console.log('SMOKE FAILURES: ' + fails.join(' | ')); process.exit(1); }
console.log('SMOKE ALL PASS');
