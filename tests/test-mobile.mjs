// Mobile 390px: P2-04 (chữ phụ 13px, dấu "còn nữa", một bản log) + P2-06
// (dropdown chọn lớp, header gọn ≤150px, chip lẻ tuần + vai trò + tên, menu đăng xuất/cài app).
import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';

const EXE = process.env.CHROMIUM_EXE || process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell';
const fails = [];
function ok(c, label) { console.log((c ? 'OK   ' : 'FAIL ') + label); if (!c) fails.push(label); }
const seed5 = JSON.parse(readFileSync('./seed5.json', 'utf-8'));

const browser = await chromium.launch({ executablePath: EXE });
async function newPage(seed, session, viewport) {
  const ctx = await browser.newContext({ viewport });
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
const noOverflow = async (page, label) => {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  ok(w <= 390, label + ': không tràn ngang (scrollWidth=' + w + ')');
};

// ---- 390px: admin ----
{
  const { ctx, page } = await newPage(seed5, { role: 'admin', name: 'Y Đôi Bol' }, { width: 390, height: 844 });
  // Header mobile: chip lẻ như ban đầu, không còn dòng tóm tắt có dấu •.
  const hb = await page.locator('header.top').boundingBox();
  ok(!!hb && hb.height <= 150, 'mobile-390: header gọn ≤150px (thấy: ' + (hb ? Math.round(hb.height) : '?') + 'px)');
  ok(await page.locator('.header-chips').isVisible(), 'mobile-390: có hàng chip header');
  const chipCount = await page.locator('.header-chips .chip').count();
  ok(chipCount >= 3, 'mobile-390: chip header tách riêng tuần + vai trò + tên (thấy ' + chipCount + ' chip)');
  const chipsText = await page.locator('.header-chips').innerText();
  ok(chipsText.includes('Tuần 05') && chipsText.includes('Ban thi đua') && chipsText.includes('Y Đôi Bol') && !chipsText.includes('•'), 'mobile-390: chip header đủ tuần + vai trò + tên, không có dấu • (thấy: ' + chipsText.trim().replace(/\n/g, ' / ') + ')');
  const mb0 = await page.locator('.menu-btn').boundingBox();
  ok(!!mb0 && mb0.x + mb0.width <= 390, 'mobile-390: nút ⋮ nằm trong màn hình (x=' + (mb0 ? Math.round(mb0.x) : '?') + ')');
  ok((await page.locator('.userbox .chip.hide-m').first().isVisible()) === false, 'mobile-390: chip bản desktop bị ẩn ở màn hẹp');
  // P2-06: menu đăng xuất.
  ok(await page.locator('.menu-btn').isVisible(), 'mobile-390: có nút menu ⋮');
  ok((await page.locator('.header-menu').count()) === 0, 'mobile-390: menu chưa mở thì không hiện');
  await page.locator('.menu-btn').click();
  await page.waitForTimeout(300);
  ok((await page.locator('.header-menu').count()) === 1, 'mobile-390: bấm ⋮ mở menu');
  const menuText = await page.locator('.header-menu').innerText();
  ok(menuText.includes('Y Đôi Bol'), 'mobile-390: menu hiện đầy đủ tên Y Đôi Bol (không bị cắt)');
  const whoColor = await page.evaluate(() => { const b = document.querySelector('.menu-who b'); return b ? getComputedStyle(b).color : 'none'; });
  ok(whoColor !== 'rgb(255, 255, 255)' && whoColor !== 'none', 'mobile-390: tên trong menu có màu chữ tối, không bị chìm trên nền trắng (thấy: ' + whoColor + ')');
  ok(menuText.includes('Đổi vai trò'), 'mobile-390: menu có mục Đổi vai trò (chế độ local; ở chế độ Supabase là Đăng xuất)');
  await page.locator('.menu-backdrop').click({ position: { x: 195, y: 700 } });
  await page.waitForTimeout(300);
  ok((await page.locator('.header-menu').count()) === 0, 'mobile-390: bấm nền ngoài đóng menu');
  // Footer bản quyền cố định ở đáy màn hình, cuộn trang vẫn thấy.
  const footer1 = await page.evaluate(() => { const f = document.querySelector('.app-footer'); if (!f) return null; const r = f.getBoundingClientRect(); return { pos: getComputedStyle(f).position, bottom: r.bottom, vh: window.innerHeight, text: f.innerText }; });
  ok(!!footer1 && footer1.pos === 'fixed' && Math.abs(footer1.bottom - footer1.vh) <= 1, 'mobile-390: footer cố định ở đáy màn hình');
  ok(!!footer1 && footer1.text.includes('© 2026 Bản quyền thuộc về'), 'mobile-390: footer hiện dòng bản quyền © 2026');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(200);
  const footer2 = await page.evaluate(() => { const f = document.querySelector('.app-footer'); if (!f) return null; const r = f.getBoundingClientRect(); return { bottom: r.bottom, vh: window.innerHeight }; });
  ok(!!footer2 && Math.abs(footer2.bottom - footer2.vh) <= 1, 'mobile-390: cuộn xuống cuối trang footer vẫn cố định ở đáy');
  await page.evaluate(() => window.scrollTo(0, 0));
  // P2-04: dấu "còn nữa" ở mép phải tab cuộn ngang.
  const mask = await page.evaluate(() => getComputedStyle(document.querySelector('.tabs')).maskImage);
  ok(mask.includes('linear-gradient'), 'mobile-390: tab cuộn ngang có dấu mờ "còn nữa" ở mép phải (maskImage=' + mask.slice(0, 40) + '…)');
  // P2-06: dropdown chọn lớp.
  await page.getByRole('button', { name: 'Nhập điểm', exact: true }).click();
  await page.waitForTimeout(500);
  ok(await page.locator('.class-select-wrap').isVisible(), 'mobile-390: Nhập điểm có dropdown chọn lớp');
  ok((await page.locator('.class-btns').isVisible()) === false, 'mobile-390: hàng nút chọn lớp bị ẩn ở màn hẹp');
  await page.locator('.class-select-wrap select').selectOption('c2');
  await page.waitForTimeout(500);
  let t = await page.locator('main').innerText();
  ok(t.includes('Phiếu tổng kết — Lớp 10B3'), 'mobile-390: chọn 10B3 bằng dropdown thì phiếu đổi sang 10B3');
  // P2-04: chữ phụ 13px.
  const ptsSize = await page.evaluate(() => { const el = document.querySelector('.field .pts'); return el ? getComputedStyle(el).fontSize : 'none'; });
  ok(ptsSize === '13px', 'mobile-390: chữ điểm mục (.field .pts) là 13px (thấy: ' + ptsSize + ')');
  await noOverflow(page, 'mobile-390 Nhập điểm');
  // P2-04: Lịch sử chỉ render một bản log ở màn hẹp.
  await page.getByRole('button', { name: 'Lịch sử', exact: true }).click();
  await page.waitForTimeout(500);
  ok((await page.locator('.log-list').count()) === 1, 'mobile-390: Lịch sử render đúng 1 bản log dạng danh sách');
  ok((await page.locator('.log-table-wrap').count()) === 0, 'mobile-390: Lịch sử KHÔNG render bảng log ở màn hẹp');
  await noOverflow(page, 'mobile-390 Lịch sử');
  // Tràn ngang ở các tab còn lại.
  for (const tab of ['Tổng quan', 'Xếp hạng', 'Tổng hợp', 'Quản lý']) {
    await page.getByRole('button', { name: tab, exact: true }).click();
    await page.waitForTimeout(400);
    await noOverflow(page, 'mobile-390 ' + tab);
  }
  await ctx.close();
}

// ---- 1280px: màn rộng giữ nguyên (nút lớp + cả hai chip) + log dạng bảng ----
{
  const { ctx, page } = await newPage(seed5, { role: 'admin', name: 'Ban thi đua' }, { width: 1280, height: 900 });
  ok((await page.locator('.header-chips').isVisible()) === false, 'desktop: hàng chip header mobile bị ẩn ở màn rộng');
  ok((await page.locator('.menu-btn').isVisible()) === false, 'desktop: nút menu ⋮ bị ẩn ở màn rộng');
  ok(await page.locator('.userbox .chip.hide-m').first().isVisible(), 'desktop: chip lẻ trong header vẫn hiện ở màn rộng');
  await page.getByRole('button', { name: 'Nhập điểm', exact: true }).click();
  await page.waitForTimeout(500);
  ok((await page.locator('.class-select-wrap').isVisible()) === false, 'desktop: dropdown chọn lớp bị ẩn ở màn rộng');
  ok(await page.locator('.class-btns').isVisible(), 'desktop: hàng nút chọn lớp vẫn hiện ở màn rộng');
  await page.getByRole('button', { name: 'Lịch sử', exact: true }).click();
  await page.waitForTimeout(500);
  ok((await page.locator('.log-table-wrap').count()) === 1, 'desktop: Lịch sử render bảng log ở màn rộng');
  ok((await page.locator('.log-list').count()) === 0, 'desktop: Lịch sử KHÔNG render danh sách log ở màn rộng');
  await ctx.close();
}

await browser.close();
if (fails.length) { console.log('MOBILE FAILURES: ' + fails.join(' | ')); process.exit(1); }
console.log('MOBILE ALL PASS');
