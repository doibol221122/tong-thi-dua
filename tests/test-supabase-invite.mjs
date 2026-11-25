// Link mời GVCN qua Supabase stub (test-supabase-invite.mjs).
// - Ban thi đua chép link mời (?lop=...&vai-tro=chi-xem&dang-ky=1) ở tab Quản lý.
// - Mở link: form đăng ký mở thẳng, vai trò Chỉ xem + lớp điền sẵn.
// - Đăng ký qua link -> hồ sơ viewer + pending, lớp chủ nhiệm gán sẵn.
import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';
import { EXE, BASE, SbStub, newSbPage, waitText } from './sb-stub.mjs';

const fails = [];
function ok(c, label) { console.log((c ? 'OK   ' : 'FAIL ') + label); if (!c) fails.push(label); }
const seed5 = JSON.parse(readFileSync('./seed5.json', 'utf-8'));
const browser = await chromium.launch({ executablePath: EXE });

// ---- A. Ban thi đua chép link mời ở tab Quản lý ----
const stub = new SbStub(seed5);
const admin = stub.seedUser({ email: 'admin@example.com', password: 'matkhau1', full_name: 'Trần Thị Hương', requested_role: 'viewer', requested_class: '' });
stub.seedProfile({ user: admin, role: 'admin', status: 'active' });
{
  const { ctx, page } = await newSbPage(browser, stub, { seedSession: admin, clipboard: true });
  await waitText(page, 'Tổng quan');
  await page.getByRole('button', { name: 'Quản lý', exact: true }).click();
  await page.waitForTimeout(500);
  let t = await page.locator('main').innerText();
  ok(t.includes('Mời giáo viên chủ nhiệm'), 'invite-A: tab Quản lý có thẻ "Mời giáo viên chủ nhiệm"');
  // Chưa chọn lớp thì nút chép bị khóa.
  ok(await page.getByRole('button', { name: 'Chép link mời GVCN' }).isDisabled(), 'invite-A: chưa chọn lớp thì nút chép link bị khóa');
  // Chọn lớp 10B1 (id c0) rồi chép.
  const inviteCard = page.locator('.card', { hasText: 'Mời giáo viên chủ nhiệm' });
  await inviteCard.locator('select').selectOption('c0');
  await page.getByRole('button', { name: 'Chép link mời GVCN' }).click();
  await page.waitForTimeout(500);
  const copied = await page.evaluate(() => window.__copied);
  const expected = `${BASE}/?lop=10B1&vai-tro=chi-xem&dang-ky=1`;
  t = await page.locator('main').innerText();
  ok(copied === expected || t.includes(expected), 'invite-A: link mời đúng dạng ' + expected + ' (clipboard: ' + copied + ')');
  ok(t.includes('Đã chép link mời GVCN lớp 10B1.'), 'invite-A: hiện ghi chú "Đã chép link mời GVCN lớp 10B1"');
  // Bảng "Giáo viên chủ nhiệm từng lớp" liệt kê đủ 14 lớp.
  ok(t.includes('Chưa có GVCN'), 'invite-A: bảng GVCN từng lớp hiện trạng thái "Chưa có GVCN"');
  await ctx.close();
}

// ---- B. Mở link mời: đăng ký Chỉ xem, lớp 10B1 điền sẵn ----
{
  const { ctx, page } = await newSbPage(browser, stub, { url: `${BASE}/?lop=10B1&vai-tro=chi-xem&dang-ky=1` });
  await page.waitForTimeout(800);
  let t = await page.locator('main').innerText();
  ok(t.includes('Đăng ký tài khoản'), 'invite-B: mở link mời thì thẳng form "Đăng ký tài khoản" (không qua đăng nhập)');
  const roleVal = await page.locator('select').first().inputValue();
  ok(roleVal === 'viewer', 'invite-B: vai trò mặc định là Chỉ xem (viewer), thấy: ' + roleVal);
  const classVal = await page.locator('select').nth(1).inputValue();
  ok(classVal === '10B1', 'invite-B: lớp mặc định điền sẵn 10B1, thấy: ' + classVal);
  ok(t.includes('Lớp chủ nhiệm'), 'invite-B: nhãn lớp là "Lớp chủ nhiệm" (GVCN)');
  // Đăng ký qua link.
  await page.locator('input[type="text"]').first().fill('Cô Lan');
  await page.locator('input[type="email"]').fill('gvcn@example.com');
  await page.locator('input[type="password"]').fill('matkhau1');
  await page.getByRole('button', { name: 'Đăng ký', exact: true }).click();
  await waitText(page, 'Tài khoản đang chờ Ban thi đua duyệt');
  t = await page.locator('main').innerText();
  ok(t.includes('Xin chào Cô Lan (gvcn@example.com)'), 'invite-B: đăng ký xong vào màn hình chờ duyệt đúng tên + email');
  const p = stub.profileByEmail('gvcn@example.com');
  ok(!!p && p.role === 'viewer' && p.status === 'pending', 'invite-B: hồ sơ GVCN role=viewer status=pending (thấy: ' + JSON.stringify(p && { role: p.role, status: p.status }) + ')');
  ok(p?.assigned_class_id === 'c0', 'invite-B: lớp chủ nhiệm 10B1 gán sẵn vào hồ sơ (assigned_class_id=c0)');
  const signup = stub.requests.filter(r => r.url.includes('/auth/v1/signup')).map(r => JSON.parse(r.body)).find(b => b.email === 'gvcn@example.com');
  ok(signup?.data?.requested_role === 'viewer' && signup?.data?.requested_class === '10B1', 'invite-B: request signup gửi requested_role=viewer, requested_class=10B1');
  // Màn hình chờ duyệt chưa tải dữ liệu chung nên không tra được tên lớp
  // từ assigned_class_id — app báo rõ "Đã gán lớp cho bạn rồi (đang chờ
  // tải danh sách lớp để hiện tên)." (lớp vẫn lưu đúng c0 trong hồ sơ).
  t = await page.locator('main').innerText();
  ok(t.includes('Đã gán lớp cho bạn rồi (đang chờ tải danh sách lớp để hiện tên).'), 'invite-B: màn hình chờ duyệt báo lớp đã gán, đang chờ tải danh sách để hiện tên');
  await ctx.close();
}

// ---- C. Link mời với lớp không có trong hệ thống: lớp để trống ----
{
  const { ctx, page } = await newSbPage(browser, stub, { url: `${BASE}/?lop=XX&vai-tro=chi-xem&dang-ky=1` });
  await page.waitForTimeout(800);
  const classVal = await page.locator('select').nth(1).inputValue();
  ok(classVal === '', 'invite-C: ?lop=XX (lớp lạ) thì ô lớp để trống, thấy: "' + classVal + '"');
  const roleVal = await page.locator('select').first().inputValue();
  ok(roleVal === 'viewer', 'invite-C: vai trò vẫn là Chỉ xem theo link');
  await ctx.close();
}

await browser.close();
if (stub.unhandled.length) { console.log('UNHANDLED SUPABASE REQUESTS: ' + JSON.stringify(stub.unhandled)); fails.push('có request supabase không được stub'); }
if (fails.length) { console.log('INVITE FAILURES: ' + fails.join(' | ')); process.exit(1); }
console.log('INVITE ALL PASS');
