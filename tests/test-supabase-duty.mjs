// Gán trực qua Supabase stub (test-supabase-duty.mjs).
// - Cờ đỏ đăng nhập: phân công roster của tuần hiện tại được ưu tiên
//   (chip "Trực lớp ...", banner "(lớp bạn trực)", tự mở đúng lớp/tuần).
// - Cờ đỏ tự chọn lớp trực (DutyPicker): gợi ý theo lịch trực, chọn lớp
//   khác được, ghi thành 1 dòng roster (không nhân đôi), đồng bộ lên remote.
// - Lớp đã có phiếu nộp/duyệt thì khóa: không chọn được.
// - Chưa có roster thì dùng lớp/tuần gán trong hồ sơ (chip "Lớp ...").
import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';
import { EXE, SbStub, newSbPage, waitText } from './sb-stub.mjs';

const fails = [];
function ok(c, label) { console.log((c ? 'OK   ' : 'FAIL ') + label); if (!c) fails.push(label); }
const seed5 = JSON.parse(readFileSync('./seed5.json', 'utf-8'));
const seedDuty = JSON.parse(readFileSync('./seed-duty.json', 'utf-8'));
const browser = await chromium.launch({ executablePath: EXE });

async function loginAs(page, email, password) {
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
}

// ---- A. Roster tuần hiện tại: Nguyễn Văn A trực 10B5 (tuần 05) ----
{
  const stub = new SbStub(seedDuty);
  const codo = stub.seedUser({ email: 'codo@example.com', password: 'matkhau1', full_name: 'Nguyễn Văn A', requested_role: 'codo', requested_class: '10B1' });
  stub.seedProfile({ user: codo, role: 'codo', status: 'active', assigned_class_id: 'c0', assigned_week_id: null });
  const { ctx, page } = await newSbPage(browser, stub);
  await loginAs(page, 'codo@example.com', 'matkhau1');
  await waitText(page, 'Trực lớp 10B5');
  let t = await page.locator('body').innerText();
  ok(t.includes('Trực lớp 10B5'), 'duty-A: chip header "Trực lớp 10B5" (phân công roster tuần 05)');
  ok(t.includes('Bạn đang nhập cho lớp 10B5 (lớp bạn trực) — Tuần 05.'), 'duty-A: banner "Bạn đang nhập cho lớp 10B5 (lớp bạn trực) — Tuần 05"');
  // Cờ đỏ chỉ thấy 2 tab Nhập điểm + Xếp hạng (không có Tổng quan/Quản lý/
  // Lịch sử) và vào thẳng Nhập điểm của lớp trực.
  const tabs = await page.locator('.tabs button').allInnerTexts();
  ok(JSON.stringify(tabs) === JSON.stringify(['Nhập điểm', 'Xếp hạng']), 'duty-A: cờ đỏ chỉ thấy 2 tab Nhập điểm + Xếp hạng (thấy: ' + tabs.join(' / ') + ')');
  // Banner trả lại chỉ hiện khi đã chọn đúng lớp (classId) — effect tự mở
  // lớp trực chạy lúc session mới đặt, khi đó dữ liệu chung chưa tải xong
  // nên assignment còn rỗng và effect không chạy lại; cờ đỏ phải chọn lớp
  // trong ô "Tìm lớp" (chỉ liệt kê đúng lớp mình trực).
  // (Ô <select> chọn lớp bị ẩn bằng CSS — người dùng chọn lớp bằng nút
  // "10B5" trong hàng nút lớp.)
  await page.locator('.class-btns button', { hasText: '10B5' }).click();
  await waitText(page, 'Phiếu bị trả lại — lý do: Thiếu số liệu giờ Khá.');
  ok(true, 'duty-A: Nhập điểm hiện banner "Phiếu bị trả lại" đúng lý do');
  ok((await page.getByRole('button', { name: 'Đổi lớp trực' }).count()) === 1, 'duty-A: có nút "Đổi lớp trực"');
  ok(stub.saw('POST', '/auth/v1/token'), 'duty-A: đăng nhập gọi POST /auth/v1/token (grant password)');

  // Mở DutyPicker: gợi ý đúng lịch trực.
  await page.getByRole('button', { name: 'Đổi lớp trực' }).click();
  await page.waitForTimeout(500);
  t = await page.locator('main').innerText();
  ok(t.includes('Theo lịch trực, cờ đỏ lớp 10B1 trực lớp 10B5 tuần này.'), 'duty-A: DutyPicker gợi ý theo lịch trực (10B1 -> 10B5)');
  ok(t.includes('Chọn lớp trực — Tuần 05'), 'duty-A: DutyPicker mở đúng tuần 05');

  // Chọn lớp khác (10B2, chưa có phiếu): ghi thành 1 dòng roster, đồng bộ remote.
  const before = stub.appState.version;
  await page.locator('main select').selectOption('c1'); // 10B2
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Bắt đầu nhập điểm lớp này' }).click();
  await waitText(page, 'Trực lớp 10B2');
  t = await page.locator('body').innerText();
  ok(t.includes('Trực lớp 10B2'), 'duty-A: chọn 10B2 -> chip đổi thành "Trực lớp 10B2"');
  // Lưu lên máy chủ chạy sau debounce ~1s: chờ remote tăng version (tối đa 10s).
  for (let i = 0; i < 20 && stub.appState.version <= before; i++) await new Promise(r => setTimeout(r, 500));
  const mine = stub.appState.data.roster.filter(r => r.name === 'Nguyễn Văn A' && r.weekId === 'w5');
  ok(mine.length === 1 && mine[0].classId === 'c1', 'duty-A: remote chỉ có 1 dòng roster Nguyễn Văn A tuần 05, đã đổi sang 10B2 (không nhân đôi)');
  ok(stub.appState.version > before, 'duty-A: đổi lớp trực đồng bộ lên remote (version ' + before + ' -> ' + stub.appState.version + ')');
  ok(stub.sawPatchAppStateVersion(before), 'duty-A: lưu có điều kiện PATCH app_state version=eq.' + before);

  // Lớp đã khóa: 10B1 (phiếu đã duyệt) và 10B3 (phiếu đã nộp) không chọn được.
  await page.getByRole('button', { name: 'Đổi lớp trực' }).click();
  await page.waitForTimeout(500);
  await page.locator('main select').selectOption('c0'); // 10B1 đã duyệt
  await page.waitForTimeout(300);
  t = await page.locator('main').innerText();
  ok(t.includes('đã có phiếu Đã duyệt — phiếu đã khóa, không nhập lại được.'), 'duty-A: chọn 10B1 (đã duyệt) báo phiếu đã khóa');
  ok(await page.getByRole('button', { name: 'Bắt đầu nhập điểm lớp này' }).isDisabled(), 'duty-A: nút bắt đầu nhập bị khóa khi chọn lớp đã duyệt');
  await page.locator('main select').selectOption('c2'); // 10B3 đã nộp
  await page.waitForTimeout(300);
  t = await page.locator('main').innerText();
  ok(t.includes('đã có phiếu Chờ duyệt — phiếu đã khóa, không nhập lại được.'), 'duty-A: chọn 10B3 (đã nộp) báo phiếu đã khóa');
  ok(await page.getByRole('button', { name: 'Bắt đầu nhập điểm lớp này' }).isDisabled(), 'duty-A: nút bắt đầu nhập bị khóa khi chọn lớp đã nộp');
  await page.getByRole('button', { name: 'Hủy' }).click();
  await page.waitForTimeout(400);
  t = await page.locator('body').innerText();
  ok(t.includes('Trực lớp 10B2'), 'duty-A: bấm Hủy -> vẫn trực lớp 10B2 đã chọn trước đó');
  if (stub.unhandled.length) { console.log('UNHANDLED: ' + JSON.stringify(stub.unhandled)); fails.push('duty-A: có request supabase không được stub'); }
  await ctx.close();
}

// ---- B. Chưa có roster: dùng lớp/tuần gán trong hồ sơ ----
{
  const stub = new SbStub(seed5);
  const codo = stub.seedUser({ email: 'codo2@example.com', password: 'matkhau1', full_name: 'Trần Thị B', requested_role: 'codo', requested_class: '10B3' });
  stub.seedProfile({ user: codo, role: 'codo', status: 'active', assigned_class_id: 'c2', assigned_week_id: 'w5' });
  const { ctx, page } = await newSbPage(browser, stub);
  await loginAs(page, 'codo2@example.com', 'matkhau1');
  await waitText(page, 'Lớp 10B3');
  const t = await page.locator('body').innerText();
  ok(t.includes('Lớp 10B3'), 'duty-B: chưa có roster -> chip "Lớp 10B3" từ hồ sơ (không phải "Trực lớp")');
  ok(t.includes('Bạn đang nhập cho lớp 10B3 — Tuần 05.'), 'duty-B: banner nhập lớp 10B3 tuần 05 theo hồ sơ (không có "(lớp bạn trực)")');
  if (stub.unhandled.length) { console.log('UNHANDLED: ' + JSON.stringify(stub.unhandled)); fails.push('duty-B: có request supabase không được stub'); }
  await ctx.close();
}

// ---- C. Cờ đỏ chưa được gán gì: hiện DutyPicker để tự chọn ----
{
  const stub = new SbStub(seed5);
  const codo = stub.seedUser({ email: 'codo3@example.com', password: 'matkhau1', full_name: 'Lê Văn C', requested_role: 'codo', requested_class: '10B2' });
  stub.seedProfile({ user: codo, role: 'codo', status: 'active', assigned_class_id: 'c1', assigned_week_id: null });
  const { ctx, page } = await newSbPage(browser, stub);
  await loginAs(page, 'codo3@example.com', 'matkhau1');
  await waitText(page, 'Chọn lớp trực — Tuần 05');
  let t = await page.locator('main').innerText();
  ok(t.includes('Tuần này bạn trực lớp nào?'), 'duty-C: cờ đỏ chưa gán gì thì vào thẳng DutyPicker chọn lớp trực');
  ok(t.includes('Theo lịch trực, cờ đỏ lớp 10B2 trực lớp 10B1 tuần này.'), 'duty-C: DutyPicker gợi ý theo lịch trực từ lớp của mình (10B2 -> 10B1)');
  // Chưa chọn lớp thì nút bắt đầu nhập bị khóa.
  ok(await page.getByRole('button', { name: 'Bắt đầu nhập điểm lớp này' }).isDisabled(), 'duty-C: chưa chọn lớp thì nút bắt đầu nhập bị khóa');
  if (stub.unhandled.length) { console.log('UNHANDLED: ' + JSON.stringify(stub.unhandled)); fails.push('duty-C: có request supabase không được stub'); }
  await ctx.close();
}

await browser.close();
if (fails.length) { console.log('DUTY FAILURES: ' + fails.join(' | ')); process.exit(1); }
console.log('DUTY ALL PASS');
