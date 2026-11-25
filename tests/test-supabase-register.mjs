// Đăng ký tài khoản qua Supabase stub (test-supabase-register.mjs).
// - Tài khoản đầu tiên -> Ban thi đua (admin) + active, vào thẳng app.
// - Tài khoản sau -> chờ duyệt (pending) với đúng vai trò đã chọn.
// - Không leo thang: UI không có lựa chọn Ban thi đua; ensureProfile cũng
//   ép requested_role lạ (vd 'admin') về 'viewer' + pending.
// - Lớp bắt buộc khi đăng ký cho cả Cờ đỏ lẫn Chỉ xem; tài khoản cũ chưa
//   có lớp thì Ban thi đua chưa duyệt được cho đến khi gán lớp.
import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';
import { EXE, BASE, SbStub, sessionFor, newSbPage, waitText } from './sb-stub.mjs';

const fails = [];
function ok(c, label) { console.log((c ? 'OK   ' : 'FAIL ') + label); if (!c) fails.push(label); }
const seed5 = JSON.parse(readFileSync('./seed5.json', 'utf-8'));
const stub = new SbStub(seed5);
const browser = await chromium.launch({ executablePath: EXE });

// Mở form đăng ký (đã ở màn hình đăng nhập, bấm sang đăng ký).
async function openRegister(page) {
  await page.getByRole('button', { name: 'Chưa có tài khoản — Đăng ký' }).click();
  await page.waitForTimeout(400);
}
async function fillRegister(page, { name, role, className, email, password }) {
  await page.locator('input[type="text"]').first().fill(name);
  if (role) await page.locator('select').first().selectOption(role);
  if (className) await page.locator('select').nth(1).selectOption(className);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Đăng ký', exact: true }).click();
}

// ---- A. Tài khoản đầu tiên -> admin/active ----
{
  const { ctx, page } = await newSbPage(browser, stub);
  let t = await page.locator('main').innerText();
  ok(t.includes('Đăng nhập'), 'register-A: chưa đăng nhập thì hiện màn hình đăng nhập');
  await openRegister(page);
  t = await page.locator('main').innerText();
  ok(t.includes('Tài khoản đầu tiên đăng ký sẽ là Ban thi đua'), 'register-A: form đăng ký nhắc tài khoản đầu thành Ban thi đua');
  ok(t.includes('Không tự đăng ký được vai trò Ban thi đua.'), 'register-A: form ghi rõ không tự đăng ký được Ban thi đua');
  ok(t.includes('Họ và tên') && t.includes('Gmail') && t.includes('Mật khẩu'), 'register-A: form đăng ký có Họ và tên, Gmail, Mật khẩu');
  const roleOpts = await page.locator('select').first().locator('option').allInnerTexts();
  ok(roleOpts.length === 2 && !roleOpts.join(' ').includes('Ban thi đua'), 'register-A: ô vai trò chỉ có 2 lựa chọn, không có Ban thi đua (có: ' + roleOpts.join(' / ') + ')');
  await fillRegister(page, { name: 'Người Đầu Tiên', role: 'codo', className: '10B1', email: 'dau@example.com', password: 'matkhau1' });
  // "Tổng quan" hiện ngay khi có session, nhưng dữ liệu chung (seed) tải
  // sau đó mới xong — chờ chip tuần "Tuần 05" rồi mới khẳng định dữ liệu về.
  await waitText(page, 'Tuần 05');
  t = await page.locator('body').innerText();
  ok(t.includes('Ban thi đua'), 'register-A: tài khoản đầu vào app với vai trò Ban thi đua');
  ok(t.includes('Tuần 05'), 'register-A: dữ liệu chung (seed) đã tải — thấy Tuần 05');
  const p = stub.profileByEmail('dau@example.com');
  ok(!!p && p.role === 'admin' && p.status === 'active', 'register-A: stub ghi hồ sơ đầu role=admin status=active (thấy: ' + JSON.stringify(p && { role: p.role, status: p.status, assigned_class_id: p.assigned_class_id }) + ')');
  ok(p?.assigned_class_id === 'c0', 'register-A: lớp đăng ký 10B1 được gán sẵn vào hồ sơ (assigned_class_id=c0)');
  const signup = stub.requests.find(r => r.url.includes('/auth/v1/signup'));
  const signupBody = signup ? JSON.parse(signup.body) : {};
  ok(signupBody.data?.requested_role === 'codo' && signupBody.data?.requested_class === '10B1', 'register-A: request signup gửi đúng requested_role=codo, requested_class=10B1');
  ok(stub.saw('POST', '/rest/v1/profiles'), 'register-A: có request tạo hồ sơ (POST /rest/v1/profiles)');
  await ctx.close();
}

// ---- B. Tài khoản sau -> pending, đúng vai trò đã chọn ----
{
  const { ctx, page } = await newSbPage(browser, stub);
  await openRegister(page);
  await fillRegister(page, { name: 'Nguyễn Văn A', role: 'codo', className: '10B1', email: 'codo@example.com', password: 'matkhau1' });
  await waitText(page, 'Tài khoản đang chờ Ban thi đua duyệt');
  const t = await page.locator('main').innerText();
  ok(t.includes('Xin chào Nguyễn Văn A (codo@example.com)'), 'register-B: màn hình chờ duyệt chào đúng tên + email');
  ok(t.includes('Lưu lớp của tôi'), 'register-B: màn hình chờ duyệt có ô hoàn thiện lớp');
  const p = stub.profileByEmail('codo@example.com');
  ok(!!p && p.role === 'codo' && p.status === 'pending', 'register-B: stub ghi hồ sơ sau role=codo status=pending (thấy: ' + JSON.stringify(p && { role: p.role, status: p.status }) + ')');
  ok(p?.assigned_class_id === 'c0', 'register-B: hồ sơ chờ duyệt cũng gán sẵn lớp 10B1 (c0)');
  await ctx.close();
}

// ---- C. Đăng ký sai vai trò không leo thang ----
// Gieo session có user_metadata.requested_role='admin' (giả lập client bị
// sửa / request tay): ensureProfile phải ép về viewer + pending.
{
  const evil = stub.seedUser({ email: 'leo@example.com', password: 'matkhau1', full_name: 'Kẻ Leo Thang', requested_role: 'admin', requested_class: '' });
  const { ctx, page } = await newSbPage(browser, stub, { seedSession: evil });
  await waitText(page, 'Tài khoản đang chờ Ban thi đua duyệt');
  const p = stub.profileByEmail('leo@example.com');
  ok(!!p && p.role === 'viewer' && p.status === 'pending', 'register-C: requested_role=admin bị ép về viewer + pending (thấy: ' + JSON.stringify(p && { role: p.role, status: p.status }) + ')');
  const t = await page.locator('body').innerText();
  ok(t.includes('Tài khoản đang chờ Ban thi đua duyệt'), 'register-C: tài khoản leo thang vẫn ở màn hình chờ duyệt');
  ok((await page.getByRole('button', { name: 'Quản lý', exact: true }).count()) === 0, 'register-C: tài khoản leo thang không có tab Quản lý');
  await ctx.close();
}

// ---- D. Đăng ký trùng email -> báo đã có tài khoản ----
{
  const { ctx, page } = await newSbPage(browser, stub);
  await openRegister(page);
  await fillRegister(page, { name: 'Người Trùng', role: 'viewer', className: '10B1', email: 'dau@example.com', password: 'matkhau1' });
  await page.waitForTimeout(800);
  const t = await page.locator('main').innerText();
  ok(t.includes('Email này đã có tài khoản rồi'), 'register-D: đăng ký trùng email báo "Email này đã có tài khoản rồi"');
  ok(!stub.profileByEmail('leo@example.com') || stub.profiles.filter(p => p.email === 'dau@example.com').length === 1, 'register-D: không tạo thêm hồ sơ cho email trùng');
  await ctx.close();
}

// ---- E. P2-09: không xóa được tài khoản của chính mình ----
// Admin mở Quản lý: dòng của mình có badge "Tài khoản của bạn" và KHÔNG có
// nút Xóa tài khoản; dòng tài khoản khác vẫn có nút Xóa.
{
  const adminUser = stub.users.get('dau@example.com');
  const { ctx, page } = await newSbPage(browser, stub, { seedSession: adminUser });
  await waitText(page, 'Tuần 05');
  await page.getByRole('button', { name: 'Quản lý', exact: true }).click();
  // Quản lý chia mục theo vai trò: tài khoản admin ở mục "Tài khoản BTĐ".
  await page.getByRole('button', { name: 'Tài khoản BTĐ', exact: true }).click();
  await waitText(page, 'Người Đầu Tiên');
  // Mỗi hồ sơ là 1 .card lồng trong .card mục tài khoản — phải chọn đúng
  // .card của từng hồ sơ (chọn .card ngoài sẽ đếm nút của mọi hồ sơ).
  const ownCard = page.locator('main .card .card', { hasText: 'Người Đầu Tiên' });
  ok((await ownCard.getByText('Tài khoản của bạn').count()) === 1, 'register-E: dòng tài khoản của mình có badge "Tài khoản của bạn"');
  ok((await ownCard.getByRole('button', { name: 'Xóa tài khoản' }).count()) === 0, 'register-E: dòng tài khoản của mình KHÔNG có nút Xóa tài khoản (P2-09)');
  ok((await page.locator('.prof-grid').count()) >= 1, 'register-E: hàng hồ sơ dùng lưới co được (.prof-grid, P2-04)');
  // Tài khoản cờ đỏ ở mục riêng.
  await page.getByRole('button', { name: 'Tài khoản cờ đỏ', exact: true }).click();
  await waitText(page, 'Nguyễn Văn A');
  const otherCard = page.locator('main .card .card', { hasText: 'Nguyễn Văn A' });
  ok((await otherCard.getByRole('button', { name: 'Xóa tài khoản' }).count()) === 1, 'register-E: dòng tài khoản khác vẫn có nút Xóa tài khoản');
  await ctx.close();
}

// ---- F. Không chọn lớp thì không đăng ký được (cả Chỉ xem lẫn Cờ đỏ) ----
{
  const { ctx, page } = await newSbPage(browser, stub);
  await openRegister(page);
  await fillRegister(page, { name: 'GVCN Thiếu Lớp', role: 'viewer', className: '', email: 'thieulop@example.com', password: 'matkhau1' });
  await page.waitForTimeout(600);
  let t = await page.locator('main').innerText();
  ok(t.includes('Bạn chọn lớp chủ nhiệm nhé.'), 'register-F: Chỉ xem chưa chọn lớp thì báo chọn lớp chủ nhiệm');
  ok(!stub.requests.some(r => r.url.includes('/auth/v1/signup') && r.body.includes('thieulop@example.com')), 'register-F: Chỉ xem thiếu lớp không gửi request signup');
  ok(!stub.profileByEmail('thieulop@example.com'), 'register-F: Chỉ xem thiếu lớp không tạo hồ sơ');
  await fillRegister(page, { name: 'Cờ Đỏ Thiếu Lớp', role: 'codo', className: '', email: 'thieulop2@example.com', password: 'matkhau1' });
  await page.waitForTimeout(600);
  t = await page.locator('main').innerText();
  ok(t.includes('Bạn chọn lớp của mình nhé.'), 'register-F: Cờ đỏ chưa chọn lớp thì báo chọn lớp của mình');
  ok(!stub.profileByEmail('thieulop2@example.com'), 'register-F: Cờ đỏ thiếu lớp không tạo hồ sơ');
  await ctx.close();
}

// ---- G. Tài khoản cũ chưa có lớp: chưa duyệt được cho đến khi gán lớp ----
{
  const gvcn = stub.seedUser({ email: 'gvcn-thieulop@example.com', password: 'matkhau1', full_name: 'GVCN Chưa Lớp', requested_role: 'viewer', requested_class: '' });
  stub.seedProfile({ user: gvcn, role: 'viewer', status: 'pending', assigned_class_id: null });
  const adminUser = stub.users.get('dau@example.com');
  const { ctx, page } = await newSbPage(browser, stub, { seedSession: adminUser });
  await waitText(page, 'Tuần 05');
  await page.getByRole('button', { name: 'Quản lý', exact: true }).click();
  await page.getByRole('button', { name: 'Tài khoản GVCN', exact: true }).click();
  await waitText(page, 'GVCN Chưa Lớp');
  const card = page.locator('main .card .card', { hasText: 'GVCN Chưa Lớp' });
  ok((await card.getByText('Chưa gán lớp').count()) >= 1, 'register-G: tài khoản GVCN chưa lớp hiện “Chưa gán lớp”');
  await card.getByRole('button', { name: 'Duyệt', exact: true }).click();
  await page.waitForTimeout(800);
  const t = await page.locator('body').innerText();
  ok(t.includes('chưa có lớp'), 'register-G: bấm Duyệt khi chưa có lớp thì báo chưa có lớp');
  ok(stub.profileByEmail('gvcn-thieulop@example.com')?.status === 'pending', 'register-G: chưa có lớp thì hồ sơ vẫn pending, không bị duyệt');
  await card.locator('select').nth(1).selectOption('c0');
  await page.waitForTimeout(800);
  ok(stub.profileByEmail('gvcn-thieulop@example.com')?.assigned_class_id === 'c0', 'register-G: gán lớp 10B1 (c0) cho tài khoản cũ');
  await card.getByRole('button', { name: 'Duyệt', exact: true }).click();
  await page.waitForTimeout(1000);
  ok(stub.profileByEmail('gvcn-thieulop@example.com')?.status === 'active', 'register-G: gán lớp xong thì duyệt được (active)');
  await ctx.close();
}

// ---- H. Lớp đăng ký dạng tên tự đổi thành id thật, không gán tay ----
// Tài khoản mới chưa đọc được danh sách lớp thật nên hồ sơ tạm lưu
// assigned_class_id="name:10B2"; Ban thi đua mở app là app tự đổi thành
// c1 và duyệt được ngay, không phải chọn lớp thủ công.
{
  const codo = stub.seedUser({ email: 'codo-tenlop@example.com', password: 'matkhau1', full_name: 'Cờ Đỏ Tên Lớp', requested_role: 'codo', requested_class: '10B2' });
  stub.seedProfile({ user: codo, role: 'codo', status: 'pending', assigned_class_id: 'name:10B2' });
  const adminUser = stub.users.get('dau@example.com');
  const { ctx, page } = await newSbPage(browser, stub, { seedSession: adminUser });
  await waitText(page, 'Tuần 05');
  await page.getByRole('button', { name: 'Quản lý', exact: true }).click();
  await page.getByRole('button', { name: 'Tài khoản cờ đỏ', exact: true }).click();
  await waitText(page, 'Cờ Đỏ Tên Lớp');
  await page.waitForTimeout(1000);
  ok(stub.profileByEmail('codo-tenlop@example.com')?.assigned_class_id === 'c1', 'register-H: lớp dạng tên name:10B2 tự đổi thành id thật c1');
  const card = page.locator('main .card .card', { hasText: 'Cờ Đỏ Tên Lớp' });
  ok((await card.getByText('Cờ đỏ lớp 10B2').count()) >= 1, 'register-H: thẻ tài khoản hiện “Cờ đỏ lớp 10B2”');
  await card.getByRole('button', { name: 'Duyệt', exact: true }).click();
  await page.waitForTimeout(1000);
  ok(stub.profileByEmail('codo-tenlop@example.com')?.status === 'active', 'register-H: duyệt được ngay, không phải gán lớp tay');
  await ctx.close();
}

await browser.close();
if (stub.unhandled.length) { console.log('UNHANDLED SUPABASE REQUESTS: ' + JSON.stringify(stub.unhandled)); fails.push('có request supabase không được stub'); }
if (fails.length) { console.log('REGISTER FAILURES: ' + fails.join(' | ')); process.exit(1); }
console.log('REGISTER ALL PASS');
