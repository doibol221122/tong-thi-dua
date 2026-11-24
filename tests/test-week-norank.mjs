// Xuất .docx tuần không xếp hạng: đủ lớp 10->12 theo thứ tự lớp
// (không xếp theo điểm), kèm trạng thái từng phiếu, lớp chưa nộp hiện
// "Chưa nộp". Kiểm tra bằng cách tải file thật rồi giải nén document.xml.
import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const EXE = process.env.CHROMIUM_EXE || process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell';
const fails = [];
function ok(c, label) { console.log((c ? 'OK   ' : 'FAIL ') + label); if (!c) fails.push(label); }
const seed5 = JSON.parse(readFileSync('./seed5.json', 'utf-8'));

const browser = await chromium.launch({ executablePath: EXE });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
page.on('dialog', d => d.accept());
await page.addInitScript(({ seed }) => {
  localStorage.setItem('tong-thi-dua-v1', JSON.stringify(seed));
  localStorage.setItem('tong-thi-dua-session-v1', JSON.stringify({ role: 'admin', name: 'Ban thi đua' }));
}, { seed: seed5 });
await page.goto('http://localhost:4177/', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.getByRole('button', { name: 'Xếp hạng', exact: true }).click();
await page.waitForTimeout(500);
const dlPromise = page.waitForEvent('download');
await page.getByRole('button', { name: 'Xuất .docx (không xếp hạng)' }).click();
const dl = await dlPromise;
await dl.saveAs('./dl-norank.docx');
const xml = execSync(`python3 -c "import zipfile; print(zipfile.ZipFile('dl-norank.docx').read('word/document.xml').decode())"`, { encoding: 'utf-8' });
// Lớp theo thứ tự 10->12, không xếp theo điểm: 10B3 (96đ) đứng trước
// 10B4 (98đ) và 10B5 (99đ) — xếp theo điểm thì ngược lại.
const names = ['10B1', '10B2', '10B3', '10B4', '10B5', '11A1', '11A2', '11A3', '11A4', '12C1', '12C2', '12C3', '12C4', '12C5'];
let prev = -1, ordered = true;
for (const n of names) { const i = xml.indexOf(n); if (i === -1 || i < prev) { ordered = false; break; } prev = i; }
ok(ordered, 'docx không xếp hạng: đủ 14 lớp 10->12 theo thứ tự lớp');
ok(xml.includes('KHÔNG XẾP HẠNG'), 'docx không xếp hạng: tiêu đề ghi rõ không xếp hạng');
ok(xml.includes('Chưa nộp'), 'docx không xếp hạng: lớp chưa có phiếu hiện Chưa nộp');
ok(xml.includes('Chờ duyệt'), 'docx không xếp hạng: phiếu chờ duyệt hiện Chờ duyệt');
ok(xml.includes('Đã duyệt'), 'docx không xếp hạng: phiếu đã duyệt hiện Đã duyệt');
ok(xml.includes('Bị trả lại'), 'docx không xếp hạng: phiếu bị trả lại hiện Bị trả lại');
// Điểm từng lớp vẫn có trong bảng (không xếp hạng không có nghĩa là giấu điểm).
ok(xml.includes('128đ-A'), 'docx không xếp hạng: vẫn hiện điểm và loại của lớp đã duyệt');
// Dòng vi phạm theo mẫu của trường: không ghi tên thì giữ số lượt.
ok(xml.includes('Đi muộn: 2 lượt (-4)'), 'docx: vi phạm không ghi tên giữ số lượt');
ok(xml.includes('Điểm dưới 5: 2 (-2)'), 'docx: điểm dưới 5 hiện điểm trừ');
// Mỗi lỗi một dòng: dòng kết thúc đúng ở cuối đoạn văn, không dính chung một <w:t>.
ok(xml.includes('- Giờ tốt: 100% tốt (+20đ)</w:t>'), 'docx: mỗi dòng HỌC TẬP là một đoạn riêng');
ok(xml.includes('- Nhuộm tóc: 2 lượt (-2)</w:t>'), 'docx: mỗi dòng NỀ NẾP là một đoạn riêng');

// ---- .docx xếp hạng chỉ gồm phiếu đã duyệt (P0-06) ----
{
  const dlPromise2 = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Xuất Word (.docx)', exact: true }).click();
  const dl2 = await dlPromise2;
  ok(/_\d{8}-\d{4}\.docx$/.test(dl2.suggestedFilename()), 'docx: tên file có dấu ngày giờ YYYYMMDD-HHmm');
  await dl2.saveAs('./dl-rank.docx');
  const xml2 = execSync(`python3 -c "import zipfile; print(zipfile.ZipFile('dl-rank.docx').read('word/document.xml').decode())"`, { encoding: 'utf-8' });
  ok(xml2.includes('128đ-A'), 'docx xếp hạng: có lớp đã duyệt 10B1');
  ok(!xml2.includes('Chờ duyệt'), 'docx xếp hạng: không có phiếu chờ duyệt');
  ok(!xml2.includes('10B3'), 'docx xếp hạng: lớp chưa duyệt (10B3) không có trong bảng');
  ok(!xml2.includes('Bị trả lại'), 'docx xếp hạng: phiếu bị trả lại không có trong bảng');
}

// ---- .docx tháng: lớp chưa có phiếu duyệt thì không có số TT, hiện độ phủ nộp ----
await page.getByRole('button', { name: 'Tổng hợp', exact: true }).click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: 'Theo tháng', exact: true }).click();
await page.waitForTimeout(400);
{
  const dlPromise3 = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Xuất Word (.docx)' }).click();
  const dl3 = await dlPromise3;
  await dl3.saveAs('./dl-month.docx');
  const xml3 = execSync(`python3 -c "import zipfile; print(zipfile.ZipFile('dl-month.docx').read('word/document.xml').decode())"`, { encoding: 'utf-8' });
  ok(xml3.includes('1/1'), 'docx tháng: lớp đã duyệt hiện độ phủ nộp 1/1 tuần');
  ok(xml3.includes('0/1'), 'docx tháng: lớp chưa nộp hiện độ phủ nộp 0/1 tuần');
  ok(xml3.includes('NỘP'), 'docx tháng: có cột NỘP');
}

// ---- Tuần không có phiếu: .docx in câu "Chưa có phiếu nào được nộp trong tuần này" ----
await page.getByRole('button', { name: 'Nhập điểm', exact: true }).click();
await page.waitForTimeout(400);
await page.locator('select').first().selectOption('w2');
await page.waitForTimeout(400);
await page.getByRole('button', { name: 'Xếp hạng', exact: true }).click();
await page.waitForTimeout(400);
{
  const dlPromise4 = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Xuất Word (.docx)', exact: true }).click();
  const dl4 = await dlPromise4;
  await dl4.saveAs('./dl-empty.docx');
  const xml4 = execSync(`python3 -c "import zipfile; print(zipfile.ZipFile('dl-empty.docx').read('word/document.xml').decode())"`, { encoding: 'utf-8' });
  ok(xml4.includes('Chưa có phiếu nào được nộp trong tuần này'), 'docx tuần trống: in câu tuần chưa có phiếu thay cho câu mặc định');
}
await browser.close();
if (fails.length) { console.log('NORANK FAILURES: ' + fails.join(' | ')); process.exit(1); }
console.log('NORANK ALL PASS');
