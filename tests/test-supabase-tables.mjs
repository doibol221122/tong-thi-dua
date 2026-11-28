// Suite Supabase: bảng riêng (migration-split.sql) — app đọc dữ liệu từ
// weeks/classes/roster/scores/logs/settings, ghi phiếu bằng PATCH
// /rest/v1/scores (không ghi đè gói app_state làm đường chính), và báo
// xung đột khi máy khác đã sửa cùng 1 phiếu (version lệch).
import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';
import { EXE, SbStub, newSbPage, waitText } from './sb-stub.mjs';

const seed = JSON.parse(readFileSync(new URL('./seed-duty.json', import.meta.url), 'utf-8'));
let failures = 0;
function check(name, cond) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name);
  if (!cond) failures++;
}

const stub = new SbStub(seed, { tables: true });
const admin = stub.seedUser({ email: 'admin@test.vn', password: 'matkhau1', full_name: 'Quản Trị', requested_role: 'admin' });
stub.seedProfile({ user: admin, role: 'admin', status: 'active' });
const codo = stub.seedUser({ email: 'codo@test.vn', password: 'matkhau1', full_name: 'Nguyễn Văn A', requested_role: 'codo', requested_class: '10B1' });
stub.seedProfile({ user: codo, role: 'codo', status: 'active', assigned_class_id: 'c0' });

const browser = await chromium.launch({ executablePath: EXE, headless: true });

// --- Admin: tải từ bảng riêng + duyệt phiếu bằng PATCH scores ---
const { ctx: ctxA, page: pageA } = await newSbPage(browser, stub, { seedSession: admin });
await waitText(pageA, 'Chờ duyệt (2)');
check('admin tải dữ liệu từ bảng riêng (GET scores)', stub.sawTable('GET', 'scores'));
check('admin tải settings từ bảng riêng', stub.sawTable('GET', 'settings'));
await pageA.click('text=Nhập điểm');
await pageA.waitForTimeout(500);
await pageA.click('.class-btns button:has-text("10B3")');
await pageA.waitForTimeout(500);
await pageA.click('button:has-text("Sửa lại phiếu")');
await pageA.waitForTimeout(400);
await pageA.click('[data-testid="confirm-ok"]');
await pageA.waitForTimeout(2000);
const c2 = stub.tables.scores.find(s => s.class_id === 'c2');
check('sửa lại phiếu ghi PATCH /rest/v1/scores', stub.sawTable('PATCH', 'scores'));
check('phiếu 10B3 về draft trong bảng scores', c2?.status === 'draft');
check('version phiếu tăng sau khi sửa lại', (c2?.version ?? 1) > 1);
await ctxA.close();

// --- Cờ đỏ: lưu nháp phiếu trực bằng PATCH scores ---
const { ctx: ctxB, page: pageB } = await newSbPage(browser, stub, { seedSession: codo });
await waitText(pageB, 'Trực lớp 10B5');
await pageB.waitForTimeout(500);
const c4before = stub.tables.scores.find(s => s.class_id === 'c4');
const vBefore = c4before?.version ?? 1;
// Máy khác sửa cùng phiếu 10B5 trước khi cờ đỏ lưu -> phải báo xung đột.
stub.bumpTable('scores', c4before.id, (r) => { r.details = { ...r.details, dressHair: 3 }; });
await pageB.click('.scorebar button:has-text("Lưu nháp")');
await pageB.waitForTimeout(2500);
const bodyB = await pageB.evaluate(() => document.body.innerText);
check('máy khác sửa cùng phiếu -> báo xung đột, không ghi đè', bodyB.includes('Có máy khác vừa lưu mới hơn'));
check('phiếu trên máy chủ giữ nguyên bản máy khác (dressHair=3)', stub.tables.scores.find(s => s.class_id === 'c4')?.details?.dressHair === 3);
check('version phiếu chỉ tăng 1 lần (của máy khác)', stub.tables.scores.find(s => s.class_id === 'c4')?.version === vBefore + 1);
await ctxB.close();

await browser.close();
console.log(failures === 0 ? 'TABLES ALL PASS' : `TABLES ${failures} FAIL`);
process.exit(failures ? 1 : 0);
