// AI nhận xét chung (Supabase stub): nút "Nhờ AI viết nhận xét" gọi
// /api/ai-comment kèm mã phiên; AI trả về thì điền vào hai ô; máy chủ
// báo chưa đặt khóa thì app giữ nguyên bản tự soạn từ số liệu.
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
for (let i = 0; i < 100 && !stub.saw('GET', '/rest/v1/app_state'); i++) await page.waitForTimeout(200);
await page.waitForTimeout(800);

let aiMode = 'ok';
let lastAuth = '';
let lastBody = null;
await page.route('**/api/ai-comment', async route => {
  lastAuth = route.request().headers()['authorization'] || '';
  lastBody = route.request().postDataJSON();
  if (aiMode === 'ok') {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pros: 'AI: các lớp dẫn đầu giữ phong độ tốt.', cons: 'AI: vẫn còn lớp chưa hoàn thành phiếu.', model: 'gemini-3.5-flash-lite' }) });
  } else {
    await route.fulfill({ status: 501, contentType: 'application/json', body: JSON.stringify({ error: 'Chưa đặt khóa AI trên máy chủ (GEMINI_API_KEY).' }) });
  }
});

await page.getByRole('button', { name: 'Xếp hạng', exact: true }).click();
await page.waitForTimeout(600);
const card = page.locator('.general-comment');
ok(await card.getByRole('button', { name: 'Nhờ AI viết nhận xét' }).count() === 1, 'ai: thẻ Nhận xét chung có nút Nhờ AI viết nhận xét');

await card.getByRole('button', { name: 'Nhờ AI viết nhận xét' }).click();
await page.waitForTimeout(800);
const pros = await card.locator('textarea[aria-label="Nhận xét chung — Ưu điểm"]').inputValue();
const cons = await card.locator('textarea[aria-label="Nhận xét chung — Nhược điểm"]').inputValue();
ok(pros.includes('AI: các lớp dẫn đầu') && cons.includes('AI: vẫn còn lớp'), 'ai: AI trả về thì điền vào hai ô Ưu điểm/Nhược điểm');
ok(lastAuth.startsWith('Bearer '), 'ai: app gửi mã phiên đăng nhập cho máy chủ kiểm tra vai trò');
ok(!!lastBody && String(lastBody.facts || '').includes('Bảng điểm:'), 'ai: app gửi số liệu tổng hợp của tuần (không gửi tên học sinh)');
ok((await card.innerText()).includes('AI đã soạn nhận xét') && (await card.innerText()).includes('gemini-3.5-flash-lite'), 'ai: có báo AI đã soạn xong kèm tên model đã trả lời');

aiMode = 'nokey';
await card.getByRole('button', { name: 'Nhờ AI viết nhận xét' }).click();
await page.waitForTimeout(800);
const pros2 = await card.locator('textarea[aria-label="Nhận xét chung — Ưu điểm"]').inputValue();
ok(pros2.includes('AI: các lớp dẫn đầu'), 'ai: máy chủ chưa đặt khóa thì giữ nguyên nội dung đang có');
ok((await card.innerText()).includes('Chưa đặt khóa AI'), 'ai: báo rõ chưa đặt khóa AI trên máy chủ');

await ctx.close();
await browser.close();
if (fails.length) { console.log('AI FAIL ' + fails.length); process.exit(1); }
console.log('AI ALL PASS');
