// Banner xung đột đồng bộ qua Supabase stub (test-supabase-conflict.mjs).
// - Máy khác lưu mới hơn (remote version tăng) rồi máy này sửa + lưu:
//   lưu có điều kiện thất bại -> banner "Có máy khác vừa lưu mới hơn."
//   hiện, dữ liệu local KHÔNG mất (tên lớp vừa sửa vẫn còn trên màn hình),
//   remote không bị ghi đè.
// - "Xem bản mới": tải bản remote, banner hết, local quay về bản remote.
// - "Giữ bản của tôi": ghi đè có xác nhận, remote nhận bản local, version tăng.
import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';
import { EXE, SbStub, newSbPage, waitText } from './sb-stub.mjs';

const fails = [];
function ok(c, label) { console.log((c ? 'OK   ' : 'FAIL ') + label); if (!c) fails.push(label); }
const seed5 = JSON.parse(readFileSync('./seed5.json', 'utf-8'));
const browser = await chromium.launch({ executablePath: EXE });

const stub = new SbStub(seed5);
const admin = stub.seedUser({ email: 'admin@example.com', password: 'matkhau1', full_name: 'Trần Thị Hương', requested_role: 'viewer', requested_class: '' });
stub.seedProfile({ user: admin, role: 'admin', status: 'active' });

const { ctx, page } = await newSbPage(browser, stub, { seedSession: admin });
await waitText(page, 'Tổng quan');
const v0 = stub.appState.version;

// Đổi tên lớp: thao tác local sẽ kích hoạt lưu có điều kiện (debounce ~1s).
async function renameClass(oldName, newName) {
  await page.getByRole('button', { name: 'Quản lý', exact: true }).click();
  await page.waitForTimeout(500);
  // Hàng của lớp cần sửa: <div class="row"><b>10B1</b><button>Sửa tên</button>…
  const row = page.locator('main .row', { has: page.locator(`b:text-is("${oldName}")`) });
  await row.getByRole('button', { name: 'Sửa tên' }).click();
  await page.waitForTimeout(300);
  await page.locator(`main input[value="${oldName}"]`).fill(newName);
  // Sau fill, value của ô thành tên mới — tìm nút "Lưu" kề sau ô theo tên mới.
  await page.locator(`main input[value="${newName}"] + button`).click();
  await page.waitForTimeout(300);
  // Đổi tên lớp hỏi xác nhận trong app (P2-05) — bấm Xác nhận mới đổi.
  await page.getByTestId('confirm-ok').click();
  await page.waitForTimeout(400);
}

// ---- A. Xung đột: máy khác lưu trước, máy này sửa sau ----
stub.bumpRemote(d => { d.settings.signer = 'Người Khác Lưu Trước'; });
ok(stub.appState.version === v0 + 1, 'conflict-A: giả lập máy khác lưu (remote version ' + v0 + ' -> ' + stub.appState.version + ')');
await renameClass('10B1', '10B1X');
await waitText(page, 'Có máy khác vừa lưu mới hơn.', 15000);
let t = await page.locator('body').innerText();
ok(t.includes('Bản của bạn chưa bị ghi đè — chọn một trong hai cách xử lý:'), 'conflict-A: banner xung đột hiện đủ nội dung');
ok(t.includes('Có bản mới hơn — xem banner bên dưới'), 'conflict-A: chip header báo "Có bản mới hơn — xem banner bên dưới"');
ok(t.includes('10B1X'), 'conflict-A: dữ liệu local KHÔNG mất — tên lớp vừa sửa (10B1X) vẫn hiện trên màn hình');
ok(stub.sawPatchAppStateVersion(v0), 'conflict-A: app đã thử lưu có điều kiện với version cũ (PATCH version=eq.' + v0 + ')');
ok(!stub.appState.data.classes.some(c => c.name === '10B1X'), 'conflict-A: remote KHÔNG bị ghi đè (remote vẫn giữ tên cũ)');
ok(stub.appState.data.settings.signer === 'Người Khác Lưu Trước', 'conflict-A: remote vẫn là bản máy khác đã lưu');

// ---- B. "Xem bản mới": lấy bản remote, banner hết ----
await page.getByRole('button', { name: 'Xem bản mới' }).click();
await waitText(page, 'Đã tải bản mới nhất từ máy chủ.');
t = await page.locator('body').innerText();
ok(!t.includes('Có máy khác vừa lưu mới hơn.'), 'conflict-B: bấm "Xem bản mới" -> banner xung đột hết');
ok((await page.locator('main .row b:text-is("10B1X")').count()) === 0, 'conflict-B: bản local được thay bằng bản remote (không còn lớp 10B1X trong danh sách lớp — ghi chú "Đã đổi tên…" cũ vẫn còn, đó chỉ là nhật ký thao tác)');
ok(t.includes('10B1'), 'conflict-B: bản remote hiện lại tên 10B1');
ok(stub.appState.version === v0 + 1, 'conflict-B: "Xem bản mới" không ghi gì lên remote (version vẫn ' + (v0 + 1) + ')');

// ---- C. "Giữ bản của tôi": ghi đè có xác nhận ----
stub.bumpRemote(d => { d.settings.signer = 'Người Khác Lưu Sau'; });
const vBefore = stub.appState.version;
await renameClass('10B2', '10B2Y');
await waitText(page, 'Có máy khác vừa lưu mới hơn.', 15000);
t = await page.locator('body').innerText();
ok(t.includes('10B2Y'), 'conflict-C: trước khi giữ bản, tên vừa sửa (10B2Y) vẫn còn trên màn hình');
await page.getByRole('button', { name: 'Giữ bản của tôi (ghi đè, có xác nhận)' }).click();
await page.waitForTimeout(300);
await page.getByTestId('confirm-ok').click();
await waitText(page, 'Đã ghi đè dữ liệu trên máy chủ bằng bản của bạn.');
t = await page.locator('body').innerText();
ok(!t.includes('Có máy khác vừa lưu mới hơn.'), 'conflict-C: ghi đè xong banner xung đột hết');
ok(stub.appState.data.classes.some(c => c.name === '10B2Y'), 'conflict-C: remote đã nhận bản local (10B2Y)');
ok(stub.appState.version === vBefore + 1, 'conflict-C: remote version tăng sau ghi đè (' + vBefore + ' -> ' + stub.appState.version + ')');
ok(t.includes('10B2Y'), 'conflict-C: sau ghi đè, tên 10B2Y vẫn hiện trên màn hình');

await ctx.close();
await browser.close();
if (stub.unhandled.length) { console.log('UNHANDLED SUPABASE REQUESTS: ' + JSON.stringify(stub.unhandled)); fails.push('có request supabase không được stub'); }
if (fails.length) { console.log('CONFLICT FAILURES: ' + fails.join(' | ')); process.exit(1); }
console.log('CONFLICT ALL PASS');
