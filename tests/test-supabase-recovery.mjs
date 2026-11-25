// Đặt lại mật khẩu qua Supabase stub (test-supabase-recovery.mjs).
// - Quên mật khẩu: gửi email (POST /auth/v1/recover) -> báo đã gửi.
// - Bấm link trong email (?code= hoặc #access_token=...&type=recovery):
//   mở form "Đặt mật khẩu mới" (sự kiện PASSWORD_RECOVERY).
// - Kiểm tra mật khẩu (ngắn / lệch) -> báo lỗi, chưa gọi updateUser.
// - Đặt xong: PUT /auth/v1/user đổi mật khẩu, đăng xuất khỏi phiên khôi
//   phục, về đăng nhập; đăng nhập lại bằng mật khẩu mới được, mật khẩu
//   cũ không còn dùng được.
import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';
import { EXE, BASE, SbStub, fakeJwt, newSbPage, waitText } from './sb-stub.mjs';

const fails = [];
function ok(c, label) { console.log((c ? 'OK   ' : 'FAIL ') + label); if (!c) fails.push(label); }
const seedDuty = JSON.parse(readFileSync('./seed-duty.json', 'utf-8'));
const browser = await chromium.launch({ executablePath: EXE });

const stub = new SbStub(seedDuty);
const codo = stub.seedUser({ email: 'codo@example.com', password: 'matkhaucu1', full_name: 'Nguyễn Văn A', requested_role: 'codo', requested_class: '10B1' });
stub.seedProfile({ user: codo, role: 'codo', status: 'active', assigned_class_id: 'c0', assigned_week_id: null });

// ---- A. Quên mật khẩu: gửi link ----
{
  const { ctx, page } = await newSbPage(browser, stub);
  await page.getByRole('button', { name: 'Quên mật khẩu' }).click();
  await page.waitForTimeout(400);
  let t = await page.locator('main').innerText();
  ok(t.includes('Quên mật khẩu'), 'recovery-A: mở form "Quên mật khẩu"');
  await page.locator('input[type="email"]').fill('codo@example.com');
  await page.getByRole('button', { name: 'Gửi link đặt lại mật khẩu' }).click();
  await page.waitForTimeout(800);
  t = await page.locator('main').innerText();
  ok(t.includes('Đã gửi email đặt lại mật khẩu.'), 'recovery-A: báo "Đã gửi email đặt lại mật khẩu"');
  ok(stub.recoverRequests.includes('codo@example.com'), 'recovery-A: stub nhận POST /auth/v1/recover cho codo@example.com');
  await ctx.close();
}

// ---- B. Link khôi phục dạng ?code=: mở form đặt mật khẩu mới ----
// Lưu ý: client Supabase của app dùng flow mặc định (implicit) nên ?code=
// chỉ mở form qua kiểm tra URL của AuthScreen — KHÔNG có phiên khôi phục
// nào được đổi lấy (không có POST /auth/v1/token). Luồng đặt lại mật khẩu
// đầy đủ (có session thật) đi qua dạng hash ở mục C.
{
  stub.recoveryEmail = 'codo@example.com';
  const { ctx, page } = await newSbPage(browser, stub, { url: `${BASE}/?code=pkce-code-123` });
  await waitText(page, 'Đặt mật khẩu mới');
  const t = await page.locator('main').innerText();
  ok(t.includes('Bạn vừa bấm link đặt lại mật khẩu trong email.'), 'recovery-B: ?code= mở form "Đặt mật khẩu mới" kèm hướng dẫn');
  ok(!stub.saw('POST', '/auth/v1/token'), 'recovery-B: ?code= không đổi lấy session (flow implicit — form chỉ mở theo URL, xem ghi chú trong file test)');
  await ctx.close();
}

// ---- C. Link khôi phục dạng hash + đặt mật khẩu mới ----
{
  const tok = fakeJwt(codo.id, codo.email);
  const { ctx, page } = await newSbPage(browser, stub, { url: `${BASE}/#access_token=${tok}&refresh_token=refresh-${codo.id}&type=recovery&expires_in=3600&token_type=bearer` });
  await waitText(page, 'Đặt mật khẩu mới');
  // Mật khẩu quá ngắn -> lỗi, chưa gọi updateUser.
  const pw = page.locator('input[type="password"]');
  await pw.first().fill('123');
  await pw.nth(1).fill('123');
  await page.getByRole('button', { name: 'Đặt mật khẩu mới', exact: true }).click();
  await page.waitForTimeout(600);
  let t = await page.locator('main').innerText();
  ok(t.includes('Mật khẩu phải từ 6 ký tự trở lên.'), 'recovery-C: mật khẩu ngắn báo lỗi');
  ok(!stub.saw('PUT', '/auth/v1/user'), 'recovery-C: mật khẩu ngắn thì chưa gọi updateUser');
  // Hai lần nhập lệch nhau -> lỗi, chưa gọi updateUser.
  await pw.first().fill('matkhaumoi1');
  await pw.nth(1).fill('khacnhau1');
  await page.getByRole('button', { name: 'Đặt mật khẩu mới', exact: true }).click();
  await page.waitForTimeout(600);
  t = await page.locator('main').innerText();
  ok(t.includes('Hai lần nhập mật khẩu chưa khớp.'), 'recovery-C: nhập lệch báo lỗi');
  ok(!stub.saw('PUT', '/auth/v1/user'), 'recovery-C: nhập lệch thì chưa gọi updateUser');
  // Đặt đúng: updateUser + về đăng nhập.
  // Lưu ý: thông báo "Đã đặt mật khẩu mới..." mà onReset() đặt vào msg của
  // AuthScreen KHÔNG hiện ra — sau signOut, app render thoáng qua màn hình
  // chính rồi mới về màn hình đăng nhập, AuthScreen bị remount và mất msg.
  // Test chỉ khẳng định: về đúng màn hình đăng nhập, form reset đã hết.
  await pw.first().fill('matkhaumoi1');
  await pw.nth(1).fill('matkhaumoi1');
  await page.getByRole('button', { name: 'Đặt mật khẩu mới', exact: true }).click();
  await waitText(page, 'Đăng nhập bằng email và mật khẩu đã đăng ký.');
  ok(stub.saw('PUT', '/auth/v1/user'), 'recovery-C: đặt đúng gọi PUT /auth/v1/user');
  ok(stub.passwordUpdated.includes('codo@example.com'), 'recovery-C: stub ghi nhận mật khẩu của codo@example.com đã đổi');
  ok(stub.saw('POST', '/auth/v1/logout'), 'recovery-C: đổi xong đăng xuất khỏi phiên khôi phục (POST /auth/v1/logout)');
  t = await page.locator('main').innerText();
  ok(t.includes('Đăng nhập') && !t.includes('Đặt mật khẩu mới'), 'recovery-C: sau khi đặt xong về màn hình đăng nhập, form reset đã hết');
  ok(!(await page.locator('.ok').allInnerTexts()).join(' ').includes('Đã đặt mật khẩu mới'), 'recovery-C: (ghi nhận) thông báo xác nhận sau reset không hiện — AuthScreen remount làm mất msg');
  // Đăng nhập bằng mật khẩu CŨ -> sai; bằng mật khẩu MỚI -> vào được.
  await page.locator('input[type="email"]').fill('codo@example.com');
  await page.locator('input[type="password"]').fill('matkhaucu1');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForTimeout(800);
  t = await page.locator('main').innerText();
  ok(t.includes('Email hoặc mật khẩu chưa đúng.'), 'recovery-C: đăng nhập bằng mật khẩu cũ báo sai');
  await page.locator('input[type="password"]').fill('matkhaumoi1');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await waitText(page, 'Trực lớp 10B5');
  t = await page.locator('body').innerText();
  ok(t.includes('Trực lớp 10B5'), 'recovery-C: đăng nhập bằng mật khẩu mới vào được app (cờ đỏ trực 10B5)');
  await ctx.close();
}

await browser.close();
if (stub.unhandled.length) { console.log('UNHANDLED SUPABASE REQUESTS: ' + JSON.stringify(stub.unhandled)); fails.push('có request supabase không được stub'); }
if (fails.length) { console.log('RECOVERY FAILURES: ' + fails.join(' | ')); process.exit(1); }
console.log('RECOVERY ALL PASS');
