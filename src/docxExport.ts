// Xuất .docx đúng mẫu TỔNG HỢP THI ĐUA TUẦN 04 (THPT Hùng Vương-Quảng Phú)
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, HeadingLevel, BorderStyle } from 'docx';
import type { AppState, Score, Week } from './lib';
import { calcScore, hocTapLines, neNepLines } from './lib';

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
function cell(text: string, opts: { bold?: boolean; align?: Align } = {}) {
  return new TableCell({
    borders, width: { size: 0, type: WidthType.AUTO },
    children: [p(text, { bold: opts.bold, align: opts.align ?? AlignmentType.LEFT, size: 12 })],
  });
}
function headerRows(s: AppState, week: Week) {
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
    new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, children: [new TextRun({ text: `TỔNG HỢP THI ĐUA ${week.label.toUpperCase()}`, bold: true, font: FONT, size: 32 })] }),
    ...(week.dateRange ? [p(week.dateRange, { align: AlignmentType.CENTER, italic: true })] : []),
    p('1. Tổng kết tuần', { bold: true, size: 14 }),
  ];
}
export async function exportWeekDocx(s: AppState, week: Week, approvedOnly: boolean): Promise<Blob> {
  const rows: Score[] = s.scores
    .filter(x => x.weekId === week.id && (!approvedOnly || x.status === 'approved'))
    .sort((a, b) => calcScore(b.details).final - calcScore(a.details).final);
  const clsOf = (id: string) => s.classes.find(c => c.id === id)?.name ?? id;
  const tableRows = [
    new TableRow({ children: [cell('TT', { bold: true, align: AlignmentType.CENTER }), cell('LỚP', { bold: true, align: AlignmentType.CENTER }), cell('HỌC TẬP', { bold: true, align: AlignmentType.CENTER }), cell('NỀ NẾP', { bold: true, align: AlignmentType.CENTER }), cell('TỔNG ĐIỂM – XẾP LOẠI', { bold: true, align: AlignmentType.CENTER }), cell('GHI CHÚ', { bold: true, align: AlignmentType.CENTER })] }),
    ...rows.map((sc, i) => {
      const c = calcScore(sc.details);
      return new TableRow({ children: [
        cell(String(i + 1), { align: AlignmentType.CENTER }),
        cell(clsOf(sc.classId), { bold: true }),
        cell(hocTapLines(sc.details).map(x => '- ' + x).join('\n')),
        cell(neNepLines(sc.details).map(x => '- ' + x).join('\n')),
        cell(`${c.final}đ-${c.cls}`, { bold: true, align: AlignmentType.CENTER }),
        cell(sc.status === 'approved' ? 'Đã duyệt' : sc.status === 'submitted' ? 'Chờ duyệt' : sc.status === 'returned' ? 'Trả lại' : 'Nháp'),
      ]});
    }),
  ];
  const pros = s.settings.generalPros || `Các lớp đạt 100% giờ học tốt: ${rows.filter(r => calcScore(r.details).is100Tot).map(r => clsOf(r.classId)).join(', ') || '—'}.`;
  const cons = s.settings.generalCons || 'Vẫn còn một số học sinh vi phạm nội quy đi muộn, mang đồ ăn vào lớp.';
  const doc = new Document({
    sections: [{ children: [
      ...headerRows(s, week),
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: tableRows }),
      p('2. Nhận xét chung', { bold: true, size: 14 }),
      p(`- Ưu điểm: ${pros}`),
      p(`- Nhược điểm: ${cons}`),
      new Paragraph({ children: [new TextRun({ text: '', font: FONT })] }),
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: [
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
      ]})] }),
    ] }],
  });
  return Packer.toBlob(doc);
}
export async function exportClassDocx(s: AppState, sc: Score): Promise<Blob> {
  const week = s.weeks.find(w => w.id === sc.weekId);
  const clsName = s.classes.find(c => c.id === sc.classId)?.name ?? sc.classId;
  const c = calcScore(sc.details);
  const doc = new Document({
    sections: [{ children: [
      ...headerRows(s, week ?? { id: '', label: 'Tuần', dateRange: '' }),
      p(`Tổng kết tuần — Lớp ${clsName}`, { bold: true, size: 14, align: AlignmentType.CENTER }),
      p(`(1) Tổng điểm cộng: ${c.plus}đ`, {}),
      p(`(2) Tổng điểm trừ: ${c.minus}đ`, {}),
      p(`3. Điểm thi đua của lớp [Lấy 100 + (1) - (2)] = ${c.final}đ — Xếp loại: ${c.cls}`, { bold: true }),
      p('Về học tập:', { bold: true }),
      ...hocTapLines(sc.details).map(x => p('- ' + x)),
      p('Về nề nếp:', { bold: true }),
      ...neNepLines(sc.details).map(x => p('- ' + x)),
      ...(sc.details.opinionClass ? [p(`Ý kiến của lớp: ${sc.details.opinionClass}`)] : []),
      ...(sc.details.opinionCodo ? [p(`Ý kiến của cờ đỏ: ${sc.details.opinionCodo}`)] : []),
      new Paragraph({ children: [new TextRun({ text: '', font: FONT })] }),
      p('BAN THI ĐUA', { bold: true, align: AlignmentType.CENTER }),
      p(s.settings.signer, { bold: true, align: AlignmentType.CENTER }),
    ] }],
  });
  return Packer.toBlob(doc);
}
