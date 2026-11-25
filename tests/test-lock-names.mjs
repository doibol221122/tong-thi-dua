// Tên HS theo mục vi phạm + vắng tự tính + khóa phiếu đã duyệt (local mode).
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'fs';

const EXE = process.env.CHROMIUM_EXE || process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell';
const fails = [];
function ok(c, label) { console.log((c ? 'OK   ' : 'FAIL ') + label); if (!c) fails.push(label); }
const seed5 = JSON.parse(readFileSync('./seed5.json', 'utf-8'));
const seedDuty = JSON.parse(readFileSync('./seed-duty.json', 'utf-8'));
const seedLock = JSON.parse(JSON.stringify(seed5));
seedLock.roster = [{ id: 'r1', name: 'Nguyễn Văn A', classId: 'c0', weekId: 'w5', active: true }];
writeFileSync('./seed-lock.json', JSON.stringify(seedLock));
const seedPick = JSON.parse(JSON.stringify(seed5));
seedPick.roster = [{ id: 'r9', name: 'Trần Thị B', classId: 'c2', weekId: 'w5', active: true }];
writeFileSync('./seed-pick.json', JSON.stringify(seedPick));

const browser = await chromium.launch({ executablePath: EXE });
async function newPage(seed, session) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
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

// ---- A: tên HS theo mục + vắng tự tính (cờ đỏ, phiếu bị trả lại 10B5) ----
{
  const { ctx, page } = await newPage(seedDuty, { role: 'codo', name: 'Nguyễn Văn A' });
  let t = await page.locator('main').innerText();
  ok(t.includes('Bị trả lại'), 'A: cờ đỏ mở phiếu bị trả lại của 10B5');
  // Ô tên HS chỉ hiện khi mục có lượt vi phạm (Nhuộm tóc = 1).
  const nameInput = page.getByLabel('HS vi phạm Nhuộm tóc');
  ok(await nameInput.count() === 1, 'A: mục Nhuộm tóc có ô ghi tên HS');
  // Ô tên hiện ở MỌI mục vi phạm, kể cả mục đang 0 lượt và mục điểm dưới 5.
  ok(await page.getByLabel('HS vi phạm Đi muộn').count() === 1, 'A: mục Đi muộn (0 lượt) vẫn có ô ghi tên HS');
  ok(await page.getByLabel('HS vi phạm Tổng điểm tốt (<5)').count() === 1, 'A: mục điểm dưới 5 có ô ghi tên HS');
  ok(await page.getByLabel('HS vi phạm Rác trong hộc bàn').count() === 1, 'A: mục Rác trong hộc bàn (-2đ/lượt) có ô ghi tên HS');
  ok(await page.getByLabel('HS vi phạm Không tắt điện ra về').count() === 1, 'A: mục Không tắt điện ra về (-5đ/lượt) có ô ghi tên HS');
  ok(await page.getByLabel('HS vi phạm Không lặn thùng').count() === 1, 'A: mục Không lặn thùng (-1đ/lượt) có ô ghi tên HS');
  await nameInput.fill('Lan Anh');
  // Vắng: không còn ô nhập tổng tay; chỉ nhập có phép + không phép.
  ok((await page.getByLabel('Vắng học (tổng)', { exact: true }).count()) === 0, 'A: không còn ô nhập tổng vắng tay');
  await page.getByLabel('Trong đó: có phép', { exact: true }).fill('2');
  await page.getByLabel('Trong đó: không phép', { exact: true }).fill('1');
  await page.waitForTimeout(300);
  t = await page.locator('main').innerText();
  ok(t.includes('Vắng học (tổng): 3 buổi'), 'A: tổng vắng tự tính 2 + 1 = 3 buổi');
  // Ô tên HS của vắng không phép cũng hiện.
  ok(await page.getByLabel('HS vi phạm Trong đó: không phép').count() === 1, 'A: mục vắng không phép có ô ghi tên HS');
  await page.getByLabel('HS vi phạm Trong đó: không phép').fill('Minh, Quân');
  await page.getByRole('button', { name: 'Lưu nháp' }).click();
  await page.waitForTimeout(500);
  let st = JSON.parse(await page.evaluate(() => localStorage.getItem('tong-thi-dua-v1')));
  let sc = st.scores.find(x => x.weekId === 'w5' && x.classId === 'c4');
  ok(sc.details.violNames?.dressHair === 'Lan Anh', 'A: tên HS Nhuộm tóc đã lưu');
  ok(sc.details.violNames?.absentNoPermit === 'Minh, Quân', 'A: tên HS vắng không phép đã lưu');
  ok(sc.details.absentPermit === 2 && sc.details.absentNoPermit === 1, 'A: vắng có phép/không phép đã lưu');
  // Xem phiếu: tên HS hiện đúng dòng.
  await page.getByRole('button', { name: 'Xem phiếu tổng kết' }).click();
  await page.waitForTimeout(400);
  t = await page.locator('main').innerText();
  ok(t.includes('Nhuộm tóc: Lan Anh (-1)'), 'A: phiếu hiện tên HS Nhuộm tóc đúng dòng');
  ok(t.includes('Vắng: 3 (2p, 1Kp) — Minh, Quân (-5)'), 'A: phiếu hiện Vắng tổng 3 + tên HS');
  // Tên HS không bắt buộc: xóa hết tên vẫn nộp được.
  await page.getByLabel('HS vi phạm Nhuộm tóc').fill('');
  await page.getByLabel('HS vi phạm Trong đó: không phép').fill('');
  await page.getByPlaceholder('Vd: Lan Anh, Sang, Ngân…').fill('');
  await page.getByRole('button', { name: 'Lưu & nộp phiếu từng lớp' }).click();
  await page.waitForTimeout(500);
  st = JSON.parse(await page.evaluate(() => localStorage.getItem('tong-thi-dua-v1')));
  sc = st.scores.find(x => x.weekId === 'w5' && x.classId === 'c4');
  ok(sc.status === 'submitted', 'A: vi phạm không ghi tên HS vẫn nộp được');
  await ctx.close();
}

// ---- B: phiếu đã duyệt bị khóa với cờ đỏ ----
{
  const { ctx, page } = await newPage(seedLock, { role: 'codo', name: 'Nguyễn Văn A' });
  let t = await page.locator('main').innerText();
  ok(t.includes('Phiếu này bạn không được sửa'), 'B: phiếu đã duyệt hiện cảnh báo không được sửa');
  ok(await page.getByRole('button', { name: 'Lưu nháp' }).isDisabled(), 'B: nút Lưu nháp bị khóa');
  ok(await page.getByRole('button', { name: 'Lưu & nộp phiếu từng lớp' }).isDisabled(), 'B: nút Lưu & nộp bị khóa');
  ok(await page.getByRole('button', { name: 'Chép số liệu tuần trước' }).isDisabled(), 'B: nút Chép số liệu tuần trước bị khóa');
  ok(await page.getByLabel('Đi muộn', { exact: true }).isDisabled(), 'B: ô nhập vi phạm bị khóa');
  await ctx.close();
}

// ---- C: ô chọn lớp trực chặn nhập thay ----
// Cờ đỏ chưa có phân công thì Nhập điểm mở thẳng DutyPicker (không còn qua
// Tổng quan — cờ đỏ chỉ thấy 2 tab Nhập điểm + Xếp hạng).
{
  const { ctx, page } = await newPage(seedPick, { role: 'codo', name: 'Nguyễn Văn A' });
  await page.waitForTimeout(400);
  const sel = page.locator('main select').first();
  const confirm = page.getByRole('button', { name: 'Bắt đầu nhập điểm lớp này' });
  await sel.selectOption({ label: '10B3' });
  await page.waitForTimeout(300);
  let t = await page.locator('main').innerText();
  ok(t.includes('đã có cờ đỏ Trần Thị B trực tuần này'), 'C: chọn lớp đã có cờ đỏ khác -> báo đã có người trực');
  ok(await confirm.isDisabled(), 'C: chọn lớp đã có cờ đỏ khác -> nút xác nhận bị khóa');
  await sel.selectOption({ label: '10B4' });
  await page.waitForTimeout(300);
  t = await page.locator('main').innerText();
  ok(t.includes('đã có phiếu Chờ duyệt — phiếu đã khóa'), 'C: chọn lớp đã nộp phiếu -> báo phiếu đã khóa');
  ok(await confirm.isDisabled(), 'C: chọn lớp đã nộp phiếu -> nút xác nhận bị khóa');
  await sel.selectOption({ label: '10B5' });
  await page.waitForTimeout(300);
  t = await page.locator('main').innerText();
  ok(t.includes('đã có phiếu Bị trả lại — bấm vào để nhập tiếp'), 'C: chọn lớp có phiếu bị trả lại -> được nhập tiếp');
  ok(await confirm.isEnabled(), 'C: chọn lớp chỉ có bản nháp -> nút xác nhận mở');
  await ctx.close();
}

// ---- D: tích 100% giờ Tốt thì không cần nhập tổng giờ (admin, lớp chưa có phiếu) ----
{
  const { ctx, page } = await newPage(seed5, { role: 'admin', name: 'Ban thi đua' });
  await page.getByRole('button', { name: 'Nhập điểm' }).click();
  await page.waitForTimeout(400);
  await page.locator('.class-select-wrap select').selectOption({ label: '10B2' });
  await page.waitForTimeout(400);
  // Chưa nhập giờ nào: nộp thì báo thiếu giờ.
  await page.getByRole('button', { name: 'Lưu & nộp phiếu từng lớp' }).click();
  await page.waitForTimeout(500);
  let t = await page.locator('main').innerText();
  ok(t.includes('tổng số giờ'), 'D: chưa tích 100% + 0 giờ -> báo thiếu giờ');
  // Tích 100% giờ Tốt: ô nhập giờ bị khóa, không cần nhập tổng.
  await page.getByLabel('100% giờ Tốt (+20đ)').click();
  await page.waitForTimeout(300);
  t = await page.locator('main').innerText();
  ok(t.includes('không cần nhập tổng số giờ'), 'D: tích 100% -> hiện không cần nhập tổng số giờ');
  ok(await page.getByLabel('Giờ Tốt', { exact: true }).isDisabled(), 'D: tích 100% -> ô Giờ Tốt bị khóa');
  ok(await page.getByLabel('Giờ Khá', { exact: true }).isDisabled(), 'D: tích 100% -> ô Giờ Khá bị khóa');
  await page.getByRole('button', { name: 'Lưu & nộp phiếu từng lớp' }).click();
  await page.waitForTimeout(500);
  const st = JSON.parse(await page.evaluate(() => localStorage.getItem('tong-thi-dua-v1')));
  const sc = st.scores.find(x => x.weekId === 'w5' && x.classId === 'c1');
  ok(sc?.status === 'submitted', 'D: tích 100% + 0 giờ -> nộp được');
  ok(sc?.details.allGood === true, 'D: phiếu đã lưu có tích 100% giờ Tốt');
  await ctx.close();
}

// ---- E: Ban thi đua lỡ duyệt thì hủy duyệt được (admin) ----
// E1: phiếu đã duyệt (10B1, tuần 5) -> hiện nút Hủy duyệt, không còn nút Duyệt.
{
  const { ctx, page } = await newPage(seed5, { role: 'admin', name: 'Ban thi đua' });
  await page.getByRole('button', { name: 'Nhập điểm' }).click();
  await page.waitForTimeout(400);
  await page.locator('.class-select-wrap select').selectOption({ label: '10B1' });
  await page.waitForTimeout(400);
  ok((await page.getByRole('button', { name: 'Hủy duyệt (lỡ duyệt nhầm)' }).count()) === 1, 'E: phiếu đã duyệt hiện nút Hủy duyệt');
  ok((await page.getByRole('button', { name: 'Duyệt phiếu', exact: true }).count()) === 0, 'E: phiếu đã duyệt không còn nút Duyệt phiếu');
  await page.getByRole('button', { name: 'Hủy duyệt (lỡ duyệt nhầm)' }).click();
  await page.waitForTimeout(300);
  await page.getByTestId('confirm-ok').click();
  await page.waitForTimeout(500);
  let st = JSON.parse(await page.evaluate(() => localStorage.getItem('tong-thi-dua-v1')));
  let sc = st.scores.find(x => x.weekId === 'w5' && x.classId === 'c0');
  ok(sc.status === 'draft', 'E: hủy duyệt -> phiếu trở về nháp');
  ok(sc.approvedBy === undefined && sc.approvedAt === undefined, 'E: hủy duyệt -> xóa người/giờ duyệt cũ');
  ok(await page.getByRole('button', { name: 'Lưu & nộp phiếu từng lớp' }).isEnabled(), 'E: hủy duyệt xong sửa lại được');
  await ctx.close();
}
// E2: tuần đã chốt mà lỡ duyệt -> hủy duyệt mở lại luôn tuần.
{
  const seedClosed = JSON.parse(JSON.stringify(seed5));
  const w5 = seedClosed.weeks.find(w => w.id === 'w5');
  w5.submittedAt = '24/11/2026 18:00'; w5.submittedBy = 'Ban thi đua';
  const { ctx, page } = await newPage(seedClosed, { role: 'admin', name: 'Ban thi đua' });
  await page.getByRole('button', { name: 'Nhập điểm' }).click();
  await page.waitForTimeout(400);
  await page.locator('.class-select-wrap select').selectOption({ label: '10B1' });
  await page.waitForTimeout(400);
  ok(await page.getByRole('button', { name: 'Lưu & nộp phiếu từng lớp' }).isDisabled(), 'E2: tuần đã chốt -> phiếu chưa sửa được');
  await page.getByRole('button', { name: 'Hủy duyệt (lỡ duyệt nhầm)' }).click();
  await page.waitForTimeout(300);
  await page.getByTestId('confirm-ok').click();
  await page.waitForTimeout(500);
  const st = JSON.parse(await page.evaluate(() => localStorage.getItem('tong-thi-dua-v1')));
  const sc = st.scores.find(x => x.weekId === 'w5' && x.classId === 'c0');
  ok(sc.status === 'draft', 'E2: hủy duyệt -> phiếu trở về nháp');
  ok(st.weeks.find(w => w.id === 'w5').submittedAt === null, 'E2: hủy duyệt -> mở lại luôn tuần đã chốt');
  ok(await page.getByRole('button', { name: 'Lưu & nộp phiếu từng lớp' }).isEnabled(), 'E2: hủy duyệt xong sửa lại được');
  await ctx.close();
}

// ---- F: hai ô tích 100% ở đầu phiếu, lỡ nhập giờ Khá/đi muộn cũng không trừ ----
{
  const { ctx, page } = await newPage(seed5, { role: 'admin', name: 'Ban thi đua' });
  await page.getByRole('button', { name: 'Nhập điểm' }).click();
  await page.waitForTimeout(400);
  await page.locator('.class-select-wrap select').selectOption({ label: '10B2' });
  await page.waitForTimeout(400);
  ok((await page.locator('.top100').count()) === 2, 'F: hai hộp 100%, mỗi hộp một ô ngay trước mục của nó');
  ok((await page.getByLabel('100% giờ Tốt (+20đ)').count()) === 1, 'F: chỉ còn một ô 100% giờ Tốt (đã dời khỏi cuối mục)');
  ok((await page.getByLabel('100% không vắng, không đi muộn (+10đ)').count()) === 1, 'F: chỉ còn một ô 100% không vắng (đã dời khỏi cuối mục)');
  ok(await page.evaluate(() => {
    const tops = [...document.querySelectorAll('.top100')];
    const heads = [...document.querySelectorAll('.sec-head')];
    const hoursHead = heads.find(h => h.textContent.includes('Giờ học'));
    const neHead = heads.find(h => h.textContent.includes('Về nề nếp'));
    return tops.length === 2
      && tops[0].textContent.includes('100% giờ Tốt')
      && tops[1].textContent.includes('100% không vắng')
      && !!(tops[0].compareDocumentPosition(hoursHead) & Node.DOCUMENT_POSITION_FOLLOWING)
      && !!(tops[1].compareDocumentPosition(neHead) & Node.DOCUMENT_POSITION_FOLLOWING);
  }), 'F: 100% giờ Tốt nằm ngay trước mục Giờ học, 100% không vắng nằm ngay trước mục Nề nếp');
  // Lỡ nhập giờ Khá 3 và đi muộn 2 trước khi tích.
  await page.getByLabel('Giờ Khá', { exact: true }).fill('3');
  await page.getByLabel('Đi muộn', { exact: true }).fill('2');
  await page.waitForTimeout(300);
  await page.getByLabel('100% giờ Tốt (+20đ)').click();
  await page.getByLabel('100% không vắng, không đi muộn (+10đ)').click();
  await page.waitForTimeout(300);
  let t = await page.locator('main').innerText();
  ok(t.includes('Điểm thi đua: 130đ'), 'F: tích cả hai 100% + lỡ nhập -> vẫn 130đ');
  ok(t.includes('Trừ: -0đ'), 'F: tích cả hai 100% + lỡ nhập -> không còn điểm trừ');
  ok(t.includes('không bị trừ điểm'), 'F: hiện ghi chú điểm trừ lỡ nhập không tính');
  await page.getByRole('button', { name: 'Xem phiếu tổng kết' }).click();
  await page.waitForTimeout(300);
  t = await page.locator('main').innerText();
  ok(t.includes('Giờ tốt: 100% tốt'), 'F: phiếu hiện dòng 100% giờ Tốt');
  ok(t.includes('Không vắng, không đi muộn: +10đ'), 'F: phiếu hiện dòng +10đ không vắng');
  ok(t.includes('Đi muộn: 2 lượt (đã miễn vì tích 100% không vắng)'), 'F: phiếu hiện dòng Đi muộn dạng đã miễn');
  ok(t.includes('Giờ Khá/Trung bình/Yếu: 3 khá (đã miễn vì tích 100% giờ Tốt)'), 'F: phiếu hiện dòng giờ Khá dạng đã miễn');
  ok(!t.includes('(-4)'), 'F: phiếu không còn dòng trừ điểm đi muộn');
  await page.getByRole('button', { name: 'Lưu & nộp phiếu từng lớp' }).click();
  await page.waitForTimeout(500);
  const st = JSON.parse(await page.evaluate(() => localStorage.getItem('tong-thi-dua-v1')));
  const sc = st.scores.find(x => x.weekId === 'w5' && x.classId === 'c1');
  ok(sc?.status === 'submitted', 'F: nộp được phiếu có tích 100%');
  ok(sc?.details.allGood === true && sc?.details.noAbsLate === true, 'F: phiếu đã lưu giữ cả hai ô tích');
  ok(sc?.details.hoursKha === 3 && sc?.details.lateLate === 2, 'F: giá trị lỡ nhập vẫn lưu (chỉ không tính điểm)');
  await ctx.close();
}

// ---- G: duyệt/trả chỉ với phiếu Chờ duyệt + đủ điều kiện; mở lại phiếu đã nộp ----
{
  // G1: phiếu Nháp -> không có nút Duyệt/Trả lại, chỉ ghi chú.
  const seedDraft = JSON.parse(JSON.stringify(seed5));
  seedDraft.scores.push({ id: 'sd1', weekId: 'w5', classId: 'c1', details: JSON.parse(JSON.stringify(seed5.scores[0].details)), status: 'draft' });
  const { ctx, page } = await newPage(seedDraft, { role: 'admin', name: 'Ban thi đua' });
  await page.getByRole('button', { name: 'Nhập điểm' }).click();
  await page.waitForTimeout(400);
  await page.locator('.class-select-wrap select').selectOption({ label: '10B2' });
  await page.waitForTimeout(400);
  ok((await page.getByRole('button', { name: 'Duyệt phiếu', exact: true }).count()) === 0, 'G1: phiếu Nháp -> không có nút Duyệt phiếu');
  ok((await page.locator('main').innerText()).includes('Phiếu đang ở trạng thái Nháp'), 'G1: phiếu Nháp -> ghi chú chờ nộp rồi mới duyệt');
  await ctx.close();
}
{
  // G2: phiếu Chờ duyệt nhưng 0 giờ -> bấm Duyệt vẫn ở Chờ duyệt + hiện lỗi.
  const seedInvalid = JSON.parse(JSON.stringify(seed5));
  const bad = seedInvalid.scores.find(x => x.weekId === 'w5' && x.classId === 'c2');
  bad.details.hoursTot = 0; bad.details.allGood = false;
  const { ctx, page } = await newPage(seedInvalid, { role: 'admin', name: 'Ban thi đua' });
  await page.getByRole('button', { name: 'Nhập điểm' }).click();
  await page.waitForTimeout(400);
  await page.locator('.class-select-wrap select').selectOption({ label: '10B3' });
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Duyệt phiếu', exact: true }).click();
  await page.waitForTimeout(500);
  let t = await page.locator('main').innerText();
  ok(t.includes('Phiếu chưa đủ điều kiện duyệt'), 'G2: phiếu 0 giờ -> báo chưa đủ điều kiện duyệt');
  let st = JSON.parse(await page.evaluate(() => localStorage.getItem('tong-thi-dua-v1')));
  ok(st.scores.find(x => x.weekId === 'w5' && x.classId === 'c2')?.status === 'submitted', 'G2: phiếu 0 giờ -> vẫn ở Chờ duyệt');
  // G4: duyệt tất cả -> bỏ qua phiếu chưa đủ điều kiện, báo rõ từng phiếu.
  await page.getByRole('button', { name: 'Duyệt tất cả 2 phiếu đã nộp' }).click();
  await page.waitForTimeout(300);
  await page.getByTestId('confirm-ok').click();
  await page.waitForTimeout(500);
  t = await page.locator('main').innerText();
  ok(t.includes('Đã duyệt 1 phiếu của Tuần 05'), 'G4: duyệt tất cả -> chỉ duyệt 1 phiếu đủ điều kiện');
  ok(t.includes('Bỏ qua 1 phiếu chưa đủ điều kiện: 10B3'), 'G4: duyệt tất cả -> báo rõ phiếu bị bỏ qua');
  st = JSON.parse(await page.evaluate(() => localStorage.getItem('tong-thi-dua-v1')));
  ok(st.scores.find(x => x.weekId === 'w5' && x.classId === 'c3')?.status === 'approved', 'G4: phiếu đủ điều kiện được duyệt');
  ok(st.scores.find(x => x.weekId === 'w5' && x.classId === 'c2')?.status === 'submitted', 'G4: phiếu chưa đủ điều kiện vẫn Chờ duyệt');
  await ctx.close();
}
{
  // G3: phiếu Chờ duyệt đủ điều kiện -> duyệt được; G5: mở lại phiếu đã nộp về nháp.
  const { ctx, page } = await newPage(seed5, { role: 'admin', name: 'Ban thi đua' });
  await page.getByRole('button', { name: 'Nhập điểm' }).click();
  await page.waitForTimeout(400);
  await page.locator('.class-select-wrap select').selectOption({ label: '10B4' });
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Duyệt phiếu', exact: true }).click();
  await page.waitForTimeout(300);
  await page.getByTestId('confirm-ok').click();
  await page.waitForTimeout(500);
  let st = JSON.parse(await page.evaluate(() => localStorage.getItem('tong-thi-dua-v1')));
  ok(st.scores.find(x => x.weekId === 'w5' && x.classId === 'c3')?.status === 'approved', 'G3: phiếu Chờ duyệt đủ điều kiện -> duyệt được');
  await page.locator('.class-select-wrap select').selectOption({ label: '10B3' });
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Mở lại để sửa', exact: true }).click();
  await page.waitForTimeout(300);
  await page.getByTestId('confirm-ok').click();
  await page.waitForTimeout(500);
  st = JSON.parse(await page.evaluate(() => localStorage.getItem('tong-thi-dua-v1')));
  ok(st.scores.find(x => x.weekId === 'w5' && x.classId === 'c2')?.status === 'draft', 'G5: mở lại phiếu đã nộp -> về Nháp');
  // G6: phiếu Bị trả lại -> không có nút Duyệt/Trả lại.
  await page.locator('.class-select-wrap select').selectOption({ label: '10B5' });
  await page.waitForTimeout(400);
  ok((await page.getByRole('button', { name: 'Duyệt phiếu', exact: true }).count()) === 0, 'G6: phiếu Bị trả lại -> không có nút Duyệt phiếu');
  ok((await page.getByRole('button', { name: 'Trả lại phiếu', exact: true }).count()) === 0, 'G6: phiếu Bị trả lại -> không có nút Trả lại phiếu');
  ok((await page.locator('main').innerText()).includes('Phiếu bị trả lại — cờ đỏ sửa lại rồi nộp lại'), 'G6: phiếu Bị trả lại -> ghi chú đúng');
  await ctx.close();
}

// ---- H: chép tuần trước theo số tuần (không theo vị trí mảng) + độ phủ nộp tháng ----
{
  const seedOrder = JSON.parse(JSON.stringify(seed5));
  seedOrder.weeks = [seed5.weeks[0], seed5.weeks[1], seed5.weeks[2], seed5.weeks[4], seed5.weeks[3]]; // w1,w2,w3,w5,w4
  const w3score = JSON.parse(JSON.stringify(seed5.scores.find(x => x.weekId === 'w1' && x.classId === 'c1')));
  w3score.id = 'sw3'; w3score.weekId = 'w3'; w3score.status = 'approved';
  seedOrder.scores.push(w3score);
  const { ctx, page } = await newPage(seedOrder, { role: 'admin', name: 'Ban thi đua' });
  await page.getByRole('button', { name: 'Nhập điểm' }).click();
  await page.waitForTimeout(400);
  // Tuần hiện tại là tuần cuối mảng (Tuần 04); tuần trước theo số tuần là Tuần 03, không phải Tuần 05.
  await page.locator('.class-select-wrap select').selectOption({ label: '10B2' });
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Chép số liệu tuần trước' }).click();
  await page.waitForTimeout(400);
  let t = await page.locator('main').innerText();
  ok(t.includes('Đã chép số liệu từ Tuần 03'), 'H: chép tuần trước theo số tuần -> lấy Tuần 03 (không lấy Tuần 05 kề mảng)');
  // Tổng hợp tháng: độ phủ nộp + lớp chưa có phiếu duyệt không có số hạng.
  await page.getByRole('button', { name: 'Tổng hợp', exact: true }).click();
  await page.waitForTimeout(400);
  // Chép số liệu làm dirty -> chuyển tab mở hộp thoại xác nhận (P2-05).
  await page.getByTestId('confirm-ok').click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Theo tháng', exact: true }).click();
  await page.waitForTimeout(400);
  t = await page.locator('main').innerText();
  ok(t.includes('nộp 1/1 tuần'), 'H: tháng 10 -> lớp đã duyệt hiện nộp 1/1 tuần');
  ok(t.includes('nộp 0/1 tuần'), 'H: tháng 10 -> lớp chưa nộp hiện nộp 0/1 tuần');
  const row10B3 = page.locator('table tbody tr', { hasText: '10B3' }).first();
  ok((await row10B3.locator('td').first().innerText()) === '—', 'H: lớp chưa có phiếu duyệt -> không có số hạng');
  await page.locator('select').first().selectOption({ label: 'Tháng 9' });
  await page.waitForTimeout(400);
  t = await page.locator('main').innerText();
  ok(t.includes('nộp 1/4 tuần'), 'H: tháng 9 -> lớp đã duyệt hiện nộp 1/4 tuần');
  ok(t.includes('nộp 0/4 tuần'), 'H: tháng 9 -> lớp chưa nộp hiện nộp 0/4 tuần');
  await ctx.close();
}

// ---- I: nhập JSON sao lưu — file lỗi bị từ chối, dữ liệu giữ nguyên; file đúng thì nhập + tải sao lưu trước ----
{
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const page = await ctx2.newPage();
  page.on('dialog', d => d.accept());
  await page.addInitScript(({ seed, session }) => {
    localStorage.setItem('tong-thi-dua-v1', JSON.stringify(seed));
    localStorage.setItem('tong-thi-dua-session-v1', JSON.stringify(session));
  }, { seed: seed5, session: { role: 'admin', name: 'Ban thi đua' } });
  await page.goto('http://localhost:4177/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Quản lý' }).click();
  await page.waitForTimeout(400);
  const bad = Buffer.from(JSON.stringify({ settings: seed5.settings, weeks: [], classes: [], roster: [], logs: [] }));
  await page.locator('input[type=file]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: bad });
  await page.waitForTimeout(300);
  await page.getByTestId('confirm-ok').click();
  await page.waitForTimeout(800);
  let t = await page.locator('main').innerText();
  ok(t.includes('Không nhập được file sao lưu'), 'I1: file thiếu mục scores -> báo không nhập được');
  let st = JSON.parse(await page.evaluate(() => localStorage.getItem('tong-thi-dua-v1')));
  ok(st.weeks.length === 5, 'I1: file lỗi -> dữ liệu hiện tại giữ nguyên (5 tuần)');
  const good = Buffer.from(JSON.stringify(seed5));
  const dlPromise = page.waitForEvent('download');
  await page.locator('input[type=file]').setInputFiles({ name: 'good.json', mimeType: 'application/json', buffer: good });
  await page.waitForTimeout(300);
  await page.getByTestId('confirm-ok').click();
  const dl = await dlPromise;
  ok(/tong-thi-dua-sao-luu_\d{8}-\d{4}\.json$/.test(dl.suggestedFilename()), 'I2: nhập JSON -> tải bản sao lưu hiện tại trước, tên có dấu ngày giờ');
  await page.waitForTimeout(800);
  t = await page.locator('main').innerText();
  ok(t.includes('Đã nhập dữ liệu sao lưu thành công'), 'I2: file hợp lệ -> nhập thành công');
  await ctx2.close();
}

await browser.close();
if (fails.length) { console.log('LOCKNAMES FAILURES: ' + fails.join(' | ')); process.exit(1); }
console.log('LOCKNAMES ALL PASS');
