// Unit: tên HS theo từng mục vi phạm + vắng tự tính + khóa phiếu.
import { calcScore, sectionSums, validateDetails, validateImportedState, hocTapLines, neNepLines, absentTotalOf, isNoAbsentLate, emptyDetails, emptyState, violLine, compareAvg, classAvg, classCoverage, legacyMixedClusters, dropLegacyWhenSplit, safeFilename } from './lib.mjs';

const fails = [];
function ok(c, label) { console.log((c ? 'OK   ' : 'FAIL ') + label); if (!c) fails.push(label); }

// Vắng tự tính.
let d = emptyDetails();
d.absentPermit = 2; d.absentNoPermit = 1;
ok(absentTotalOf(d) === 3, 'vắng tự tính: 2 phép + 1 không phép = 3');
ok(!isNoAbsentLate(d), 'có vắng -> không được +10đ không vắng');
d.absentPermit = 0; d.absentNoPermit = 0; d.noAbsLate = undefined; // phiếu cũ thiếu trường -> tự phát hiện
ok(isNoAbsentLate(d), 'không vắng, không đi muộn -> +10đ (tự phát hiện ở phiếu cũ)');
ok(neNepLines(d).includes('Không vắng, không đi muộn: +10đ'), 'dòng +10đ khi không vắng');
d.absentPermit = 2; d.absentNoPermit = 1; d.violNames = { absentNoPermit: 'Lan, Sang' };
ok(neNepLines(d).some(x => x === 'Vắng: 3 (2p, 1Kp) — Lan, Sang (-5)'), 'dòng Vắng: tổng 3 + tên HS vắng không phép');
d.absentPermit = 0; d.absentNoPermit = 0; d.violNames = {};

// Tên HS theo từng mục vi phạm.
d = emptyDetails();
d.hoursTot = 25; d.allGood = true;
d.lateLate = 2; d.violNames = { lateLate: 'Thanh, Hòa' };
d.dressHair = 1; d.violNames.dressHair = 'Ngân';
ok(neNepLines(d).some(x => x === 'Đi muộn: Thanh, Hòa (-4)'), 'dòng Đi muộn gắn tên HS đúng mẫu (tên rồi điểm trừ)');
ok(neNepLines(d).some(x => x === 'Nhuộm tóc: Ngân (-1)'), 'dòng Nhuộm tóc gắn tên HS');
d.violNames.lateLate = 'Thanh'; // 1 HS vi phạm 2 lượt
ok(neNepLines(d).some(x => x === 'Đi muộn: Thanh (2 lượt) (-4)'), '1 HS vi phạm 2 lượt -> tên kèm số lượt');
d.violNames.lateLate = 'Thanh, Hòa';
d.studyNoLearn = 1; d.violNames.studyNoLearn = 'Tuấn';
ok(hocTapLines(d).some(x => x === 'Không học bài: Tuấn (-1)'), 'dòng Không học bài gắn tên HS');
d.goodLow = 2; d.violNames.goodLow = 'Huy, Phúc';
ok(hocTapLines(d).some(x => x === 'Điểm dưới 5: Huy, Phúc (-2)'), 'dòng Điểm dưới 5 gắn tên HS');
d.lateLate = 0; d.violNames.lateLate = ''; // về 0 thì xóa luôn tên đã ghi
ok(!neNepLines(d).some(x => x.startsWith('Đi muộn:')), 'lượt về 0 thì dòng vi phạm biến mất');

// Rác trong hộc bàn (-2đ/lượt).
d = emptyDetails(); d.hoursTot = 25; d.allGood = true;
d.trashDesk = 3;
ok(sectionSums(d).neNepMinus === 6, 'rác trong hộc bàn: 3 lượt -> trừ 6đ');
ok(neNepLines(d).some(x => x === 'Rác trong hộc bàn: 3 lượt (-6)'), 'dòng Rác trong hộc bàn đúng mẫu');
d.trashDesk = 1; d.violNames = { trashDesk: 'Lan' };
ok(neNepLines(d).some(x => x === 'Rác trong hộc bàn: Lan (-2)'), 'dòng Rác trong hộc bàn gắn tên HS');
d.trashDesk = 101;
ok(validateDetails(d).some(e => e.includes('Rác trong hộc bàn') && e.includes('100')), 'rác trong hộc bàn > 100 lượt -> báo lỗi validation');
d.trashDesk = 0;

// Không tắt điện ra về (-5đ/lượt).
d = emptyDetails(); d.hoursTot = 25; d.allGood = true;
d.lightsLeftOn = 2;
ok(sectionSums(d).neNepMinus === 10, 'không tắt điện ra về: 2 lượt -> trừ 10đ');
ok(neNepLines(d).some(x => x === 'Không tắt điện ra về: 2 lượt (-10)'), 'dòng Không tắt điện ra về đúng mẫu');
d.lightsLeftOn = 1; d.violNames = { lightsLeftOn: 'Hòa' };
ok(neNepLines(d).some(x => x === 'Không tắt điện ra về: Hòa (-5)'), 'dòng Không tắt điện ra về gắn tên HS');
d.lightsLeftOn = 101;
ok(validateDetails(d).some(e => e.includes('Không tắt điện ra về') && e.includes('100')), 'không tắt điện > 100 lượt -> báo lỗi validation');
d.lightsLeftOn = 0;

// Vi phạm không ghi tên: giữ số lượt.
d = emptyDetails(); d.hoursTot = 25; d.allGood = true;
d.lateLate = 2;
ok(neNepLines(d).some(x => x === 'Đi muộn: 2 lượt (-4)'), 'vi phạm không ghi tên -> giữ số lượt');
d.goodLow = 2;
ok(hocTapLines(d).some(x => x === 'Điểm dưới 5: 2 (-2)'), 'điểm dưới 5 không ghi tên -> số điểm + điểm trừ');

// Kiểm tra tên HS: chấp nhận tên theo mục hoặc tên chung.
let errs = validateDetails(d);
ok(!errs.some(e => e.includes('tên HS')), 'vi phạm có tên theo mục -> không báo thiếu tên');
d.violNames = {}; d.names = 'Lan, Sang, Ngân, Tuấn';
errs = validateDetails(d);
ok(!errs.some(e => e.includes('tên HS')), 'vi phạm có tên chung -> không báo thiếu tên');
d.names = '';
errs = validateDetails(d);
ok(!errs.some(e => e.includes('tên HS')), 'vi phạm không ghi tên HS vẫn nộp được (tên không bắt buộc)');
d.names = ''; d.dressHair = 1; d.violNames = { dressHair: 'Ngân' }; // Nhuộm tóc có tên, còn Đi muộn/điểm dưới 5 chưa có tên
errs = validateDetails(d);
ok(!errs.some(e => e.includes('tên HS')), 'còn mục vi phạm chưa ghi tên cũng không bị chặn');

// 100% giờ Tốt: không cần nhập tổng giờ.
d = emptyDetails(); d.allGood = true;
ok(validateDetails(d).length === 0, 'tích 100% giờ Tốt + 0 giờ -> không báo thiếu giờ');
ok(hocTapLines(d).some(x => x === 'Giờ tốt: 100% tốt (+20đ)'), 'phiếu ghi 100% giờ Tốt dù chưa nhập số giờ');
d.allGood = false;
ok(validateDetails(d).some(e => e.includes('tổng số giờ')), 'không tích 100% + 0 giờ -> vẫn báo thiếu giờ');

// Tích 100% thì điểm trừ lỡ nhập ở mục đó không tính.
d = emptyDetails(); d.hoursTot = 25; d.allGood = true; d.hoursKha = 3; d.hoursTb = 1;
ok(sectionSums(d).hoursMinus === 0, 'tích 100% giờ Tốt -> giờ Khá/TB lỡ nhập không trừ');
ok(calcScore(d).final === 120, 'tích 100% giờ Tốt + giờ Khá/TB lỡ nhập -> vẫn 120đ');
d.allGood = false;
ok(sectionSums(d).hoursMinus === 6, 'không tích 100% -> giờ Khá/TB vẫn trừ');
d = emptyDetails(); d.hoursTot = 25; d.allGood = true; d.noAbsLate = true; d.absentNoPermit = 1; d.lateLate = 2; d.lateOut = 1;
ok(sectionSums(d).neNepMinus === 2, 'tích 100% không vắng -> vắng/muộn lỡ nhập không trừ, chỉ còn tự ý ra ngoài');
ok(calcScore(d).final === 128, 'tích 100% không vắng + vắng/muộn lỡ nhập -> vẫn 128đ');
ok(neNepLines(d).some(x => x === 'Đi muộn: 2 lượt (đã miễn vì tích 100% không vắng)'), 'tích 100% không vắng -> dòng Đi muộn hiện dạng đã miễn');
ok(!neNepLines(d).some(x => x.includes('(-4)')), 'tích 100% không vắng -> không còn dòng trừ điểm đi muộn');
ok(neNepLines(d).includes('Không vắng, không đi muộn: +10đ'), 'tích 100% không vắng -> vẫn hiện dòng +10đ');
ok(neNepLines(d).some(x => x === 'Tự ý ra ngoài trong sinh hoạt 15p: 1 lượt (-2)'), 'tự ý ra ngoài vẫn trừ và vẫn hiện dòng');
d.noAbsLate = false;
ok(sectionSums(d).neNepMinus === 11, 'không tích 100% không vắng -> vắng/muộn vẫn trừ');

// Phiếu cũ: absentTotal nhập tay lệch (5) nhưng phép+không phép = 0 -> không còn lỗi vắng, điểm không đổi.
d = emptyDetails();
d.hoursTot = 25; d.allGood = true; d.goodHigh = 12; d.goodLow = 2;
d.absentTotal = 5; d.absentPermit = 0; d.absentNoPermit = 0; d.dressHair = 2;
ok(validateDetails(d).length === 0 || !validateDetails(d).some(e => e.includes('vắng')), 'phiếu cũ tổng vắng lệch: không còn lỗi kiểm tra vắng');
ok(calcScore(d).final === 128, 'điểm phiếu cũ không đổi (128đ)');

// Dòng trong phiếu ghi đủ điểm, cộng lại ra (1)/(2).
d = emptyDetails(); d.hoursTot = 25; d.allGood = true; d.goodHigh = 12;
ok(hocTapLines(d).includes('Giờ tốt: 100% tốt (+20đ)'), 'dòng 100% giờ Tốt ghi đủ +20đ');
ok(hocTapLines(d).includes('Điểm tốt (≥5): 12 (+12đ)'), 'dòng điểm tốt ghi đủ +12đ');
d.hoursKha = 3;
ok(hocTapLines(d).some(x => x === 'Giờ Khá/Trung bình/Yếu: 3 khá (đã miễn vì tích 100% giờ Tốt)'), 'giờ Khá lỡ nhập hiện dòng đã miễn');
d = emptyDetails(); d.hoursTot = 25; d.allGood = true; d.noAbsLate = true; d.absentPermit = 3; d.absentNoPermit = 0;
ok(neNepLines(d).some(x => x === 'Vắng: 3 (3p, 0Kp)'), 'tích 100% + vắng có phép thật -> vẫn giữ dòng Vắng');
d.absentNoPermit = 1; d.violNames = { absentNoPermit: 'Minh' };
ok(neNepLines(d).some(x => x === 'Vắng: 4 (3p, 1Kp) — Minh (đã miễn vì tích 100% không vắng)'), 'vắng không phép lỡ nhập -> dòng Vắng dạng đã miễn');

// violLine: tên và số lượt không khớp thì vẫn hiện số lượt; hậu tố vắng chỉ in khi có vắng không phép.
d = emptyDetails(); d.lateLate = 2; d.violNames = { lateLate: 'Thanh, Hòa, Lan' };
ok(violLine(d, 'lateLate', 'Đi muộn', 2, -4) === 'Đi muộn: Thanh, Hòa, Lan (2 lượt) (-4)', 'tên nhiều hơn lượt -> vẫn hiện số lượt');
d = emptyDetails(); d.absentPermit = 3; d.absentNoPermit = 0; d.violNames = { absentNoPermit: 'Minh' };
ok(neNepLines(d).some(x => x === 'Vắng: 3 (3p, 0Kp)'), 'chỉ vắng có phép + sót tên -> không in (-0)');

// Siết validation (P1-05).
d = emptyDetails(); d.hoursTot = 25; d.allGood = true; d.hoursKha = -1;
ok(validateDetails(d).some(e => e.includes('Giờ Khá')), 'số âm bị chặn');
d.hoursKha = 1.5;
ok(validateDetails(d).some(e => e.includes('Giờ Khá')), 'phân số bị chặn');
d.hoursKha = NaN;
ok(validateDetails(d).some(e => e.includes('Giờ Khá')), 'NaN bị chặn');
d.hoursKha = 61;
ok(validateDetails(d).some(e => e.includes('60 giờ')), 'giờ Khá > 60 bị chặn');
d.hoursTot = 40; d.hoursKha = 30;
ok(validateDetails(d).some(e => e.includes('Tổng số giờ')), 'tổng giờ > 60 bị chặn');
d = emptyDetails(); d.hoursTot = 25; d.allGood = true; d.lateLate = 101;
ok(validateDetails(d).some(e => e.includes('Đi muộn')), 'vi phạm > 100 lượt bị chặn');
d = emptyDetails(); d.hoursTot = 25; d.allGood = true;
d.extraPlus = [{ points: 5, note: '' }];
ok(validateDetails(d).some(e => e.includes('Cộng khác') && e.includes('nội dung')), 'cộng khác có điểm mà không ghi chú bị chặn');
d.extraPlus = [{ points: 5, note: 'Ủng hộ' }];
ok(validateDetails(d).length === 0, 'cộng khác có ghi chú thì nộp được (không giới hạn cứng điểm)');
d.violNames = { lateLate: 'An, Bình' }; d.lateLate = 1;
ok(validateDetails(d).some(e => e.includes('2 tên') && e.includes('1 lượt')), 'ghi 2 tên nhưng chỉ 1 lượt bị chặn');
d.lateLate = 2;
ok(!validateDetails(d).some(e => e.includes('tên HS')), '2 tên / 2 lượt thì nộp được');
d.lateLate = 0; d.violNames = { lateLate: 'An' };
ok(validateDetails(d).some(e => e.includes('số lượt đang là 0')), 'ghi tên nhưng 0 lượt bị chặn');

// Phiếu trộn cũ+mới: chỉ cảnh báo; chép phiếu thì bỏ trường gộp.
d = emptyDetails(); d.late = 2; d.lateLate = 2;
ok(legacyMixedClusters(d).includes('Đi muộn / ra ngoài 15p'), 'phiếu trộn cũ+mới -> cảnh báo cụm đi muộn');
ok(dropLegacyWhenSplit(d).late === 0 && dropLegacyWhenSplit(d).lateLate === 2, 'chép phiếu: bỏ trường gộp khi đã có trường tách');
d = emptyDetails(); d.late = 2;
ok(legacyMixedClusters(d).length === 0, 'chỉ có trường gộp -> không cảnh báo');
ok(dropLegacyWhenSplit(d).late === 2, 'chỉ có trường gộp -> giữ nguyên khi chép');

// Điểm trung bình tháng: null khi chưa có phiếu duyệt, null xếp sau điểm thật, độ phủ nộp.
{
  const st2 = emptyState();
  st2.weeks = [{ id: 'w1', label: 'Tuần 01', dateRange: '' }, { id: 'w2', label: 'Tuần 02', dateRange: '' }];
  st2.classes = [{ id: 'c0', name: '10B1' }, { id: 'c1', name: '10B2' }];
  const mk = (id, w, gh) => ({ id, weekId: w, classId: 'c0', details: { ...emptyDetails(), hoursTot: 25, allGood: true, goodHigh: gh }, status: 'approved' });
  st2.scores = [mk('s1', 'w1', 20), mk('s2', 'w2', 10)];
  ok(classAvg(st2, 'c0', ['w1', 'w2']) === 135, 'trung bình 2 tuần đã duyệt (140+130)/2');
  ok(classAvg(st2, 'c1', ['w1', 'w2']) === null, 'lớp chưa có phiếu duyệt -> null');
  ok(compareAvg(null, 100) === 1 && compareAvg(100, null) === -1 && compareAvg(90, 100) === 10, 'null xếp sau điểm thật khi sắp xếp');
  const cov = classCoverage(st2, 'c0', ['w1', 'w2']);
  ok(cov.approved === 2 && cov.total === 2, 'lớp nộp đủ: 2/2 tuần');
  const cov1 = classCoverage(st2, 'c1', ['w1', 'w2']);
  ok(cov1.approved === 0 && cov1.total === 2, 'lớp chưa nộp: 0/2 tuần');
}

// Kiểm tra file JSON sao lưu trước khi nhập (P0-08).
{
  const good = emptyState();
  good.weeks = [{ id: 'w1', label: 'Tuần 01', dateRange: '' }];
  good.classes = [{ id: 'c0', name: '10B1' }];
  good.scores = [{ id: 's1', weekId: 'w1', classId: 'c0', details: { ...emptyDetails(), hoursTot: 25, allGood: true }, status: 'approved', updatedAt: '24/11/2026 06:00' }];
  let r = validateImportedState(JSON.parse(JSON.stringify(good)));
  ok(r.ok === true && r.state.scores.length === 1, 'file đúng định dạng -> nhập được');
  const noScores = JSON.parse(JSON.stringify(good)); delete noScores.scores;
  ok(validateImportedState(noScores).ok === false, 'thiếu mục scores -> từ chối');
  const neg = JSON.parse(JSON.stringify(good)); neg.scores[0].details.hoursKha = -1;
  ok(validateImportedState(neg).ok === false, 'số âm trong phiếu -> từ chối');
  const nan = JSON.parse(JSON.stringify(good)); nan.scores[0].details.hoursKha = NaN;
  ok(validateImportedState(nan).ok === false, 'NaN trong phiếu -> từ chối');
  const frac = JSON.parse(JSON.stringify(good)); frac.scores[0].details.goodHigh = 1.5;
  ok(validateImportedState(frac).ok === false, 'phân số trong phiếu -> từ chối');
  const dupId = JSON.parse(JSON.stringify(good)); dupId.classes.push({ id: 'c0', name: '10B2' });
  ok(validateImportedState(dupId).ok === false, 'trùng id lớp -> từ chối');
  const badRef = JSON.parse(JSON.stringify(good)); badRef.scores[0].classId = 'cx';
  ok(validateImportedState(badRef).ok === false, 'phiếu trỏ tới lớp không tồn tại -> từ chối');
  const dupScore = JSON.parse(JSON.stringify(good));
  dupScore.scores.push({ id: 's2', weekId: 'w1', classId: 'c0', details: { ...emptyDetails(), hoursTot: 30, allGood: true }, status: 'submitted', updatedAt: '24/11/2026 07:00' });
  r = validateImportedState(dupScore);
  ok(r.ok === true && r.state.scores.length === 1 && r.state.scores[0].details.hoursTot === 30, 'trùng (lớp, tuần) -> giữ bản mới nhất theo updatedAt');
}

// Tên file xuất: bỏ dấu tiếng Việt để trình duyệt giữ đúng tên khi tải.
ok(safeFilename('TONG_HOP_THI_DUA_Tuần 05_20261124-1635.docx') === 'TONG_HOP_THI_DUA_Tuan_05_20261124-1635.docx', 'tên file bỏ dấu: Tuần -> Tuan');
ok(safeFilename('Tháng 9') === 'Thang_9', 'tên file bỏ dấu: Tháng 9 -> Thang_9');
ok(safeFilename('PHIEU_10B1_Tuần 05') === 'PHIEU_10B1_Tuan_05', 'tên file phiếu lớp bỏ dấu');

// Điểm không đổi khi vắng thay đổi cách tính (seed w5 c0).
import { readFileSync } from 'fs';
const seed = JSON.parse(readFileSync('./seed5.json', 'utf-8'));
const c0 = seed.scores.find(x => x.weekId === 'w5' && x.classId === 'c0');
ok(calcScore(c0.details).final === 128, 'seed w5 10B1 vẫn 128đ sau khi đổi cách tính vắng');

if (fails.length) { console.log('VIOLNAMES FAILURES: ' + fails.join(' | ')); process.exit(1); }
console.log('VIOLNAMES UNIT ALL PASS');
