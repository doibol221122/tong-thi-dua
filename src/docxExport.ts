// Xuất .docx đúng mẫu TỔNG HỢP THI ĐUA TUẦN 04 (THPT Hùng Vương-Quảng Phú)
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, HeadingLevel, BorderStyle } from 'docx';
import type { AppState, Score, Week } from './lib';
import { autoGeneralComment, calcScore, classAvg, classCoverage, clsOf, compareAvg, hocTapLines, neNepLines } from './lib';

const FONT = 'Times New Roman';
type Align = (typeof AlignmentType)[keyof typeof AlignmentType];
const thin = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
const borders = { top: thin, left: thin, bottom: thin, right: thin };
function p(text: string, opts: { bold?: boolean; size?: number; align?: Align; italic?: boolean } = {}) {
  return new Paragraph({
    alignment: opts.align ?? AlignmentType.LEFT,
    children: [new TextRun({ text, bold: opts.bold, italics: opts.italic, font: FONT, size: (opts.size ?? 13) * 2 })],
  });
}
function cell(text: string, opts: { bold?: boolean; align?: Align; w?: number } = {}) {
  return new TableCell({
    borders, width: opts.w ? { size: opts.w, type: WidthType.DXA } : { size: 0, type: WidthType.AUTO },
    children: [p(text, { bold: opts.bold, align: opts.align ?? AlignmentType.LEFT, size: 12 })],
  });
}
// Ô bảng có nhiều dòng (HỌC TẬP / NỀ NẾP): mỗi dòng một đoạn văn riêng để
// Word xuống dòng thật. Nối bằng '\n' trong một TextRun thì thư viện docx
// giữ nguyên ký tự xuống dòng trong một <w:t> duy nhất và Word hiển thị
// thành một dòng dài (đã kiểm tra trên file tải về: 0 thẻ <w:br/>).
function cellLines(lines: string[], w?: number) {
  return new TableCell({
    borders, width: w ? { size: w, type: WidthType.DXA } : { size: 0, type: WidthType.AUTO },
    children: lines.map(x => p('- ' + x, { size: 12 })),
  });
}
// Độ rộng cột (DXA, tổng ~9360 = khổ A4 trừ lề): TT/LỚP hẹp, HỌC TẬP/NỀ NẾP rộng, điểm + ghi chú vừa.
const WEEK_COLS = [450, 900, 2900, 2900, 1000, 1210];
function weekHeaderRow() {
  return new TableRow({ tableHeader: true, children: [
    cell('TT', { bold: true, align: AlignmentType.CENTER, w: WEEK_COLS[0] }),
    cell('LỚP', { bold: true, align: AlignmentType.CENTER, w: WEEK_COLS[1] }),
    cell('HỌC TẬP', { bold: true, align: AlignmentType.CENTER, w: WEEK_COLS[2] }),
    cell('NỀ NẾP', { bold: true, align: AlignmentType.CENTER, w: WEEK_COLS[3] }),
    cell('TỔNG ĐIỂM – XẾP LOẠI', { bold: true, align: AlignmentType.CENTER, w: WEEK_COLS[4] }),
    cell('GHI CHÚ', { bold: true, align: AlignmentType.CENTER, w: WEEK_COLS[5] }),
  ] });
}
function headerRows(s: AppState, title: string, sectionTitle: string, dateRange?: string) {
  return [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [new TableRow({ children: [
        new TableCell({ borders: { top: thin, left: thin, bottom: thin, right: thin }, children: [
          p(s.settings.school, { bold: true, align: AlignmentType.CENTER }),
          p(s.settings.dept, { bold: true, align: AlignmentType.CENTER }),
          p(`Số: ${s.settings.docNo}`, { align: AlignmentType.CENTER }),
        ]}),
        new TableCell({ borders, children: [
          p('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', { bold: true, align: AlignmentType.CENTER }),
          p('Độc lập – Tự do – Hạnh phúc', { bold: true, align: AlignmentType.CENTER }),
        ]}),
      ]})],
    }),
    new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, children: [new TextRun({ text: title, bold: true, font: FONT, size: 32 })] }),
    ...(dateRange ? [p(dateRange, { align: AlignmentType.CENTER, italic: true })] : []),
    p(sectionTitle, { bold: true, size: 14 }),
  ];
}
// Khối ký tên cuối văn bản (dùng chung cho tổng hợp tuần / tháng).
function signRows(s: AppState) {
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: [
    new TableCell({ borders: { top: thin, left: thin, bottom: thin, right: thin }, children: [
      p('Nơi nhận:', { bold: true, italic: true }),
      p('- Hiệu trưởng (để b/c).', { italic: true }),
      p('- Phó hiệu trưởng (để b/c).', { italic: true }),
      p('- GVCN (để phối hợp).', { italic: true }),
      p('- Lưu VP.', { italic: true }),
    ]}),
    new TableCell({ borders, children: [
      p('TL. HIỆU TRƯỞNG', { bold: true, align: AlignmentType.CENTER }),
      p(s.settings.signerTitle, { bold: true, align: AlignmentType.CENTER }),
      new Paragraph({ children: [new TextRun({ text: '', font: FONT })] }),
      new Paragraph({ children: [new TextRun({ text: '', font: FONT })] }),
      p(s.settings.signer, { bold: true, align: AlignmentType.CENTER }),
    ]}),
  ]})] });
}
export async function exportWeekDocx(s: AppState, week: Week, approvedOnly: boolean): Promise<Blob> {
  const rows: Score[] = s.scores
    .filter(x => x.weekId === week.id && (!approvedOnly || x.status === 'approved'))
    .sort((a, b) => calcScore(b.details).final - calcScore(a.details).final);
  const clsOf = (id: string) => s.classes.find(c => c.id === id)?.name ?? id;
  const tableRows = [
    weekHeaderRow(),
    ...rows.map((sc, i) => {
      const c = calcScore(sc.details);
      return new TableRow({ children: [
        cell(String(i + 1), { align: AlignmentType.CENTER, w: WEEK_COLS[0] }),
        cell(clsOf(sc.classId), { bold: true, w: WEEK_COLS[1] }),
        cellLines(hocTapLines(sc.details), WEEK_COLS[2]),
        cellLines(neNepLines(sc.details), WEEK_COLS[3]),
        cell(`${c.final}đ-${c.cls}`, { bold: true, align: AlignmentType.CENTER, w: WEEK_COLS[4] }),
        cell(sc.status === 'approved' ? 'Đã duyệt' : sc.status === 'submitted' ? 'Chờ duyệt' : sc.status === 'returned' ? 'Bị trả lại' : 'Nháp', { w: WEEK_COLS[5] }),
      ]});
    }),
  ];
  // Nhận xét chung: ưu tiên bản Ban thi đua đã lưu; để trống thì app tự
  // soạn từ số liệu phiếu đã duyệt của tuần.
  const auto1 = autoGeneralComment(s, week.id);
  const pros = s.settings.generalPros || auto1.pros;
  const cons = rows.length === 0 ? 'Chưa có phiếu nào được nộp trong tuần này.' : (s.settings.generalCons || auto1.cons);
  const doc = new Document({
    sections: [{ children: [
      ...headerRows(s, `TỔNG HỢP THI ĐUA ${week.label.toUpperCase()}`, '1. Tổng kết tuần', week.dateRange),
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, columnWidths: WEEK_COLS, rows: tableRows }),
      p('2. Nhận xét chung', { bold: true, size: 14 }),
      p(`- Ưu điểm: ${pros}`),
      p(`- Nhược điểm: ${cons}`),
      new Paragraph({ children: [new TextRun({ text: '', font: FONT })] }),
      signRows(s),
    ] }],
  });
  return Packer.toBlob(doc);
}
// Tổng hợp tuần KHÔNG xếp hạng: để Ban thi đua rà soát số liệu trước khi
// duyệt — liệt kê đủ các lớp từ khối 10 đến khối 12 theo thứ tự lớp,
// kèm trạng thái từng phiếu (kể cả lớp chưa nộp), không sắp theo điểm.
export async function exportWeekDocxNoRank(s: AppState, week: Week): Promise<Blob> {
  const statusLabel = (st: Score['status']) => st === 'approved' ? 'Đã duyệt' : st === 'submitted' ? 'Chờ duyệt' : st === 'returned' ? 'Bị trả lại' : 'Nháp';
  const tableRows = [
    weekHeaderRow(),
    ...s.classes.map((c, i) => {
      const sc = s.scores.find(x => x.weekId === week.id && x.classId === c.id);
      if (!sc) return new TableRow({ children: [
        cell(String(i + 1), { align: AlignmentType.CENTER, w: WEEK_COLS[0] }),
        cell(c.name, { bold: true, w: WEEK_COLS[1] }),
        cell('—', { w: WEEK_COLS[2] }),
        cell('—', { w: WEEK_COLS[3] }),
        cell('—', { align: AlignmentType.CENTER, w: WEEK_COLS[4] }),
        cell('Chưa nộp', { w: WEEK_COLS[5] }),
      ]});
      const cc = calcScore(sc.details);
      return new TableRow({ children: [
        cell(String(i + 1), { align: AlignmentType.CENTER, w: WEEK_COLS[0] }),
        cell(c.name, { bold: true, w: WEEK_COLS[1] }),
        cellLines(hocTapLines(sc.details), WEEK_COLS[2]),
        cellLines(neNepLines(sc.details), WEEK_COLS[3]),
        cell(`${cc.final}đ-${cc.cls}`, { bold: true, align: AlignmentType.CENTER, w: WEEK_COLS[4] }),
        cell(statusLabel(sc.status), { w: WEEK_COLS[5] }),
      ]});
    }),
  ];
  const weekScores = s.scores.filter(x => x.weekId === week.id && x.status === 'approved');
  const auto2 = autoGeneralComment(s, week.id);
  const pros = s.settings.generalPros || auto2.pros;
  const cons = weekScores.length === 0 ? 'Chưa có phiếu nào được nộp trong tuần này.' : (s.settings.generalCons || auto2.cons);
  const doc = new Document({
    sections: [{ children: [
      ...headerRows(s, `TỔNG HỢP THI ĐUA ${week.label.toUpperCase()} (KHÔNG XẾP HẠNG)`, '1. Tổng kết tuần', week.dateRange),
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, columnWidths: WEEK_COLS, rows: tableRows }),
      p('2. Nhận xét chung', { bold: true, size: 14 }),
      p(`- Ưu điểm: ${pros}`),
      p(`- Nhược điểm: ${cons}`),
      new Paragraph({ children: [new TextRun({ text: '', font: FONT })] }),
      signRows(s),
    ] }],
  });
  return Packer.toBlob(doc);
}
// Tổng hợp tháng: điểm trung bình của từng lớp qua các tuần trong tháng
// (cứ 4 tuần là 1 tháng), kèm điểm từng tuần. Chỉ tính phiếu đã duyệt.
// Lớp chưa có phiếu duyệt thì không có số TT (hiện "—") và hiện độ phủ
// nộp "n/m tuần"; điểm trung bình vẫn chia cho số phiếu đã duyệt (D3).
export async function exportMonthDocx(s: AppState, weeks: Week[], monthName: string): Promise<Blob> {
  const weekIds = weeks.map(w => w.id);
  const nameOf = (id: string) => s.classes.find(c => c.id === id)?.name ?? id;
  const rows = s.classes
    .map(c => ({ c, a: classAvg(s, c.id, weekIds), cov: classCoverage(s, c.id, weekIds) }))
    .sort((x, y) => compareAvg(x.a, y.a));
  // Số TT chỉ đếm lớp có điểm trung bình (lớp chưa có phiếu duyệt: "—").
  let rank = 0;
  const ranked = rows.map(r => ({ ...r, rank: r.a === null ? null : ++rank }));
  const weekW = weeks.length ? Math.floor((9360 - 450 - 900 - 800 - 650 - 650) / weeks.length) : 0;
  const monthCols = [450, 900, 800, 650, 650, ...weeks.map(() => weekW)];
  const tableRows = [
    new TableRow({ tableHeader: true, children: [
      cell('TT', { bold: true, align: AlignmentType.CENTER, w: monthCols[0] }),
      cell('LỚP', { bold: true, align: AlignmentType.CENTER, w: monthCols[1] }),
      cell('ĐIỂM TB', { bold: true, align: AlignmentType.CENTER, w: monthCols[2] }),
      cell('LOẠI', { bold: true, align: AlignmentType.CENTER, w: monthCols[3] }),
      cell('NỘP', { bold: true, align: AlignmentType.CENTER, w: monthCols[4] }),
      ...weeks.map((w, i) => cell(w.label, { bold: true, align: AlignmentType.CENTER, w: monthCols[5 + i] })),
    ] }),
    ...ranked.map((r) => new TableRow({ children: [
      cell(r.rank === null ? '—' : String(r.rank), { align: AlignmentType.CENTER, w: monthCols[0] }),
      cell(nameOf(r.c.id), { bold: true, w: monthCols[1] }),
      cell(r.a === null ? '—' : `${r.a.toFixed(1)}đ`, { align: AlignmentType.CENTER, w: monthCols[2] }),
      cell(r.a === null ? '—' : clsOf(r.a), { bold: true, align: AlignmentType.CENTER, w: monthCols[3] }),
      cell(`${r.cov.approved}/${r.cov.total}`, { align: AlignmentType.CENTER, w: monthCols[4] }),
      ...weeks.map((w, i) => { const sc = s.scores.find(x => x.weekId === w.id && x.classId === r.c.id && x.status === 'approved'); return cell(sc ? `${calcScore(sc.details).final}đ-${calcScore(sc.details).cls}` : '—', { align: AlignmentType.CENTER, w: monthCols[5 + i] }); }),
    ] })),
  ];
  const pros = s.settings.generalPros || `Các lớp đạt loại A trong tháng: ${rows.filter(r => r.a !== null && clsOf(r.a) === 'A').map(r => nameOf(r.c.id)).join(', ') || '—'}.`;
  const cons = rows.every(r => r.a === null) ? 'Chưa có phiếu nào được duyệt trong tháng này.' : (s.settings.generalCons || 'Vẫn còn một số học sinh vi phạm nội quy đi muộn, mang đồ ăn vào lớp.');
  const doc = new Document({
    sections: [{ children: [
      ...headerRows(s, `TỔNG HỢP THI ĐUA ${monthName.toUpperCase()}`, '1. Tổng kết tháng', weeks.map(w => w.label).join(', ')),
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, columnWidths: monthCols, rows: tableRows }),
      p('2. Nhận xét chung', { bold: true, size: 14 }),
      p(`- Ưu điểm: ${pros}`),
      p(`- Nhược điểm: ${cons}`),
      new Paragraph({ children: [new TextRun({ text: '', font: FONT })] }),
      signRows(s),
    ] }],
  });
  return Packer.toBlob(doc);
}
export async function exportClassDocx(s: AppState, sc: Score): Promise<Blob> {
  const week = s.weeks.find(w => w.id === sc.weekId);
  const clsName = s.classes.find(c => c.id === sc.classId)?.name ?? sc.classId;
  const c = calcScore(sc.details);
  const statusLabel = sc.status === 'approved' ? 'Đã duyệt' : sc.status === 'submitted' ? 'Chờ duyệt' : sc.status === 'returned' ? 'Bị trả lại' : 'Nháp';
  const doc = new Document({
    sections: [{ children: [
      ...headerRows(s, `TỔNG HỢP THI ĐUA ${(week ?? { label: 'Tuần' }).label.toUpperCase()}`, '1. Tổng kết tuần', week?.dateRange),
      p(`Tổng kết tuần — Lớp ${clsName}`, { bold: true, size: 14, align: AlignmentType.CENTER }),
      p(`Trạng thái: ${statusLabel}${sc.status === 'returned' && sc.returnReason ? ` — Lý do trả lại: ${sc.returnReason}` : ''}`),
      p(`1. Tổng điểm cộng: ${c.plus}đ`, {}),
      p(`2. Tổng điểm trừ: ${c.minus}đ`, {}),
      p(`3. Điểm thi đua của lớp [Lấy 100 + (1) - (2)] = ${c.final}đ — Xếp loại: ${c.cls}`, { bold: true }),
      p('Về học tập:', { bold: true }),
      ...hocTapLines(sc.details).map(x => p('- ' + x)),
      p('Về nề nếp:', { bold: true }),
      ...neNepLines(sc.details).map(x => p('- ' + x)),
      ...(sc.details.opinionClass ? [p(`Ý kiến của lớp: ${sc.details.opinionClass}`)] : []),
      ...(sc.details.opinionCodo ? [p(`Ý kiến của cờ đỏ: ${sc.details.opinionCodo}`)] : []),
      new Paragraph({ children: [new TextRun({ text: '', font: FONT })] }),
      signRows(s),
    ] }],
  });
  return Packer.toBlob(doc);
}
