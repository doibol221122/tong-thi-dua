// P1-08: hai cờ đỏ cùng một lớp/tuần — người thứ hai thấy bị khóa + tên
// người giữ (qua roster hoặc qua hồ sơ), DutyPicker chặn + nêu tên.
// Lưu ý: cờ đỏ có phân công chỉ thấy lớp mình trong hàng nút chọn lớp
// (visibleClasses), nên đường chạm khóa ở chế độ local là "Đổi lớp trực"
// (DutyPicker); dòng cảnh báo khóa trong phiếu (lockHolder) hiện khi cờ đỏ
// chưa có phân công mở lớp đã có người giữ — chỉ xảy ra ở chế độ Supabase.
// Lưu đồng thời trên 2 máy chỉ xảy ra ở chế độ Supabase (đồng bộ 45 giây
// mới đưa trạng thái mới về) — saveScore kiểm tra lại bằng stateRef ngay
// trước khi lưu; phần đó kiểm bằng unit test findDutyHolder + code review.
import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';

const EXE = process.env.CHROMIUM_EXE || process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell';
const fails = [];
function ok(c, label) { console.log((c ? 'OK   ' : 'FAIL ') + label); if (!c) fails.push(label); }
const seed = JSON.parse(readFileSync('./seed-duty2.json', 'utf-8'));

const browser = await chromium.launch({ executablePath: EXE });

async function loginAs(name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  await page.addInitScript(({ s, n }) => {
    localStorage.setItem('tong-thi-dua-v1', JSON.stringify(s));
    localStorage.setItem('tong-thi-dua-session-v1', JSON.stringify({ role: 'codo', name: n }));
  }, { s: seed, n: name });
  await page.goto('http://localhost:4177/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  return { ctx, page };
}

// --- Cờ đỏ B (trực 10B2, tuần 5) ---
const b = await loginAs('Trần Thị B');
ok((await b.page.locator('body').innerText()).includes('Trực lớp 10B2'), 'B: tự mở đúng lớp trực 10B2 (chip Trực lớp 10B2)');
ok(await b.page.getByRole('button', { name: 'Lưu nháp' }).isEnabled(), 'B: phiếu lớp mình trực thì Lưu nháp bấm được');
ok(!(await b.page.getByText('đang có cờ đỏ').count()), 'B: phiếu lớp mình trực thì không có cảnh báo khóa');

// B bấm "Đổi lớp trực" -> chọn 10B5 (cờ đỏ A đang trực tuần 5) -> chặn + nêu tên A.
await b.page.getByRole('button', { name: 'Đổi lớp trực' }).click();
await b.page.waitForTimeout(400);
await b.page.locator('.card', { hasText: 'Chọn lớp trực' }).locator('select').selectOption('c4');
await b.page.waitForTimeout(300);
ok(await b.page.getByText('đã có cờ đỏ Nguyễn Văn A trực tuần này').count() === 1, 'DutyPicker: chọn 10B5 đã có người trực -> nêu tên Nguyễn Văn A');
ok(await b.page.getByRole('button', { name: 'Bắt đầu nhập điểm lớp này' }).isDisabled(), 'DutyPicker: chọn lớp đã có người trực -> nút xác nhận bị khóa');
// Chọn 10B3 (đã có phiếu Chờ duyệt) -> khóa phiếu.
await b.page.locator('.card', { hasText: 'Chọn lớp trực' }).locator('select').selectOption('c2');
await b.page.waitForTimeout(300);
ok(await b.page.getByText('đã có phiếu Chờ duyệt — phiếu đã khóa').count() === 1, 'DutyPicker: chọn lớp đã có phiếu Chờ duyệt -> báo phiếu đã khóa');
ok(await b.page.getByRole('button', { name: 'Bắt đầu nhập điểm lớp này' }).isDisabled(), 'DutyPicker: chọn lớp đã có phiếu Chờ duyệt -> nút xác nhận bị khóa');
// Chọn lại lớp mình trực (10B2) -> mở lại, xác nhận được, về lại phiếu của mình.
await b.page.locator('.card', { hasText: 'Chọn lớp trực' }).locator('select').selectOption('c1');
await b.page.waitForTimeout(300);
ok(await b.page.getByRole('button', { name: 'Bắt đầu nhập điểm lớp này' }).isEnabled(), 'DutyPicker: chọn lại lớp mình trực (10B2) -> nút xác nhận mở lại');
await b.page.getByRole('button', { name: 'Bắt đầu nhập điểm lớp này' }).click();
await b.page.waitForTimeout(500);
ok(await b.page.getByRole('button', { name: 'Lưu nháp' }).isEnabled(), 'B: xác nhận lại lớp mình trực -> về phiếu 10B2, Lưu nháp bấm được');
await b.ctx.close();

// --- Cờ đỏ A (trực 10B5, tuần 5): chính mình giữ thì không bị khóa ---
const a = await loginAs('Nguyễn Văn A');
ok((await a.page.locator('body').innerText()).includes('Trực lớp 10B5'), 'A: tự mở đúng lớp trực 10B5');
ok(!(await a.page.getByText('đang có cờ đỏ').count()), 'A: phiếu lớp mình giữ thì không có cảnh báo khóa');
ok(await a.page.getByRole('button', { name: 'Lưu nháp' }).isEnabled(), 'A: phiếu lớp mình giữ thì Lưu nháp bấm được');
await a.ctx.close();

await browser.close();
console.log(fails.length ? `FAIL ${fails.length} lock-duty` : 'PASS lock-duty (11 kiểm tra)');
process.exit(fails.length ? 1 : 0);
