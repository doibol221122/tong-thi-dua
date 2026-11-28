// Cờ đỏ 2 tab + xếp hạng theo tháng (local mode).
// Seed: w1 c0 duyệt 128đ, w1 c1 duyệt 130đ, w5 c0 duyệt 128đ; w1–w4 = Tháng 9,
// w5 = Tháng 10 (mặc định tháng mới nhất).
import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';

const EXE = process.env.CHROMIUM_EXE || process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell';
const fails = [];
function ok(c, label) { console.log((c ? 'OK   ' : 'FAIL ') + label); if (!c) fails.push(label); }
const seed5 = JSON.parse(readFileSync('./seed5.json', 'utf-8'));
const seedDuty = JSON.parse(readFileSync('./seed-duty.json', 'utf-8'));

const browser = await chromium.launch({ executablePath: EXE });
async function newPage(seed, session, dialogValue) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept(dialogValue ?? ''));
  await page.addInitScript(({ seed, session }) => {
    localStorage.setItem('tong-thi-dua-v1', JSON.stringify(seed));
    localStorage.setItem('tong-thi-dua-session-v1', JSON.stringify(session));
  }, { seed, session });
  await page.goto('http://localhost:4177/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  return { ctx, page };
}
async function tabNames(page) {
  return (await page.locator('main .tabs button').allInnerTexts()).map(s => s.trim());
}
async function rankTexts(page) {
  return page.locator('.ranklist li .rank').allInnerTexts();
}

// ---- A. Cờ đỏ: đúng 2 tab, banner trả phiếu vẫn thấy ngay khi đăng nhập ----
{
  const { ctx, page } = await newPage(seedDuty, { role: 'codo', name: 'Nguyễn Văn A' });
  ok(JSON.stringify(await tabNames(page)) === JSON.stringify(['Nhập điểm', 'Xếp hạng']), 'codo-tabs: cờ đỏ chỉ thấy 2 tab Nhập điểm + Xếp hạng (thấy: ' + (await tabNames(page)).join(' / ') + ')');
  let body = await page.locator('body').innerText();
  ok(body.includes('Phiếu bị trả lại') && body.includes('Thiếu số liệu giờ Khá'), 'codo-tabs: đăng nhập vẫn thấy banner trả phiếu ở Nhập điểm');
  ok(body.includes('Trực lớp 10B5'), 'codo-tabs: chip header Trực lớp 10B5');
  ok(body.includes('Bạn đang nhập cho lớp 10B5 (lớp bạn trực)'), 'codo-tabs: banner nhập lớp trực có "(lớp bạn trực)"');
  // Xếp hạng tuần (mặc định): tuần 5 chỉ 10B1 duyệt.
  await page.getByRole('button', { name: 'Xếp hạng', exact: true }).click();
  await page.waitForTimeout(500);
  ok((await page.locator('.ranklist li').count()) === 1, 'codo-tabs: xếp hạng tuần 5 có 1 lớp duyệt');
  let t = await page.locator('.ranklist').innerText();
  ok(t.includes('10B1') && t.includes('128đ'), 'codo-tabs: xếp hạng tuần hiện 10B1 128đ');
  ok((await page.locator('main').innerText()).includes('Nộp & chốt tuần này') === false, 'codo-tabs: cờ đỏ không thấy nút chốt/mở tuần của admin');
  // Chuyển sang tháng: mặc định tháng mới nhất (Tháng 10, chỉ tuần 5).
  await page.getByRole('button', { name: 'Theo tháng', exact: true }).click();
  await page.waitForTimeout(500);
  const selText = await page.evaluate(() => { const s = document.querySelector('main .card select'); return s ? s.options[s.selectedIndex].text : ''; });
  ok(selText === 'Tháng 10', 'codo-tabs: tháng mặc định là Tháng 10 (mới nhất, thấy: ' + selText + ')');
  let ranks = await rankTexts(page);
  ok(ranks[0] === '1' && ranks.slice(1).every(r => r === '—'), 'codo-tabs: tháng 10 chỉ 10B1 có hạng 1, còn lại "—" (hạng: ' + ranks.join(',') + ')');
  t = await page.locator('.ranklist li').first().innerText();
  ok(t.includes('10B1') && t.includes('128.0đ') && t.includes('nộp 1/1 tuần'), 'codo-tabs: dòng 10B1 tháng 10: 128.0đ, nộp 1/1 tuần (thấy: ' + t.replace(/\n/g, ' ') + ')');
  // Lọc khối ở chế độ tháng.
  await page.getByRole('button', { name: 'Khối xã hội', exact: true }).click();
  await page.waitForTimeout(400);
  ranks = await rankTexts(page);
  ok(ranks.length === 8 && ranks.every(r => r === '—'), 'codo-tabs: tháng 10 + khối xã hội: 8 lớp, không lớp nào có hạng');
  await page.getByRole('button', { name: 'Khối tự nhiên', exact: true }).click();
  await page.waitForTimeout(400);
  ranks = await rankTexts(page);
  ok(ranks.length === 6 && ranks[0] === '1' && ranks.slice(1).every(r => r === '—'), 'codo-tabs: tháng 10 + khối tự nhiên: 6 lớp, chỉ 10B1 hạng 1');
  // Tháng 9: 10B2 130đ hạng 1, 10B1 128đ hạng 2 (chỉ tính phiếu duyệt).
  await page.getByRole('button', { name: 'Tất cả', exact: true }).click();
  await page.waitForTimeout(300);
  await page.locator('main .card select').selectOption({ label: 'Tháng 9' });
  await page.waitForTimeout(400);
  const rows = await page.locator('.ranklist li').allInnerTexts();
  ok(rows[0].includes('10B2') && rows[0].includes('130.0đ'), 'codo-tabs: tháng 9 hạng 1 là 10B2 130.0đ (thấy: ' + rows[0].replace(/\n/g, ' ') + ')');
  ok(rows[1].includes('10B1') && rows[1].includes('128.0đ'), 'codo-tabs: tháng 9 hạng 2 là 10B1 128.0đ');
  ranks = await rankTexts(page);
  ok(ranks[0] === '1' && ranks[1] === '2' && ranks.slice(2).every(r => r === '—'), 'codo-tabs: tháng 9 chỉ 2 lớp có hạng 1, 2');
  // Quay về tuần + lọc khối xã hội: không có lớp duyệt.
  await page.getByRole('button', { name: 'Theo tuần', exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Khối xã hội', exact: true }).click();
  await page.waitForTimeout(400);
  ok((await page.locator('main').innerText()).includes('Chưa có lớp nào được duyệt trong tuần này ở Khối xã hội.'), 'codo-tabs: tuần 5 + khối xã hội báo chưa có lớp duyệt');
  await ctx.close();
}

// ---- B. Admin đủ 7 tab, Chỉ xem đủ 4 tab ----
{
  const { ctx, page } = await newPage(seed5, { role: 'admin', name: 'Ban thi đua' });
  ok(JSON.stringify(await tabNames(page)) === JSON.stringify(['Tổng quan', 'Nhập điểm', 'Phiếu cờ đỏ', 'Xếp hạng', 'Tổng hợp', 'Quản lý', 'Lịch sử']), 'codo-tabs: admin đủ 7 tab (thấy: ' + (await tabNames(page)).join(' / ') + ')');
  await ctx.close();
}
{
  const { ctx, page } = await newPage(seed5, { role: 'viewer', name: 'Khách xem' });
  ok(JSON.stringify(await tabNames(page)) === JSON.stringify(['Tổng quan', 'Nhập điểm', 'Xếp hạng', 'Tổng hợp']), 'codo-tabs: chỉ xem vẫn 4 tab (thấy: ' + (await tabNames(page)).join(' / ') + ')');
  await ctx.close();
}

// ---- C. Guard: admin đang ở Tổng quan -> Đổi vai trò sang cờ đỏ -> không trang trắng ----
{
  const { ctx, page } = await newPage(seedDuty, { role: 'admin', name: 'Ban thi đua' }, 'Nguyễn Văn A');
  ok((await tabNames(page)).includes('Tổng quan'), 'codo-tabs-guard: admin đang ở Tổng quan');
  await page.getByRole('button', { name: 'Đổi vai trò', exact: true }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Cờ đỏ trực' }).click();
  await page.waitForTimeout(800);
  ok(JSON.stringify(await tabNames(page)) === JSON.stringify(['Nhập điểm', 'Xếp hạng']), 'codo-tabs-guard: đổi sang cờ đỏ chỉ còn 2 tab');
  const body = await page.locator('body').innerText();
  ok(body.includes('Phiếu bị trả lại'), 'codo-tabs-guard: sau khi đổi vai trò, Nhập điểm mở ngay với banner trả phiếu (không trang trắng)');
  await ctx.close();
}

// ---- D. Cờ đỏ chưa có roster: vào thẳng DutyPicker, không bị khóa vào lớp nào ----
{
  const { ctx, page } = await newPage(seedDuty, { role: 'codo', name: 'Đỗ Thuỳ Dương' });
  const t = await page.locator('main').innerText();
  ok(t.includes('Chọn lớp trực — Tuần 05'), 'codo-tabs: cờ đỏ chưa có roster thì vào thẳng DutyPicker (không tự khóa vào lớp nào)');
  ok(t.includes('Tuần này bạn trực lớp nào?'), 'codo-tabs: DutyPicker hỏi lớp trực');
  await ctx.close();
}

await browser.close();
if (fails.length) { console.log('CODO-TABS FAILURES: ' + fails.join(' | ')); process.exit(1); }
console.log('CODO-TABS ALL PASS');
