// App Tổng Thi Đua — Trường THPT Hùng Vương-Quảng Phú
// Logic tính điểm đúng phiếu giấy gốc. Điểm thi đua = 100 + cộng - trừ.
export type Role = 'admin' | 'codo' | 'viewer';
export type ScoreStatus = 'draft' | 'submitted' | 'approved' | 'returned';

export interface Settings {
  school: string; dept: string; docNo: string;
  signer: string; signerTitle: string;
  generalPros: string; generalCons: string;
}
export interface Week { id: string; label: string; dateRange: string; month?: string; submittedAt?: string | null; submittedBy?: string | null; }
export interface ClassItem { id: string; name: string; }
export interface Roster { id: string; name: string; classId: string; weekId: string; active: boolean; }
export interface Details {
  hoursTot: number; hoursKha: number; hoursTb: number; hoursYeu: number;
  allGood?: boolean; // Tích tay: 100% giờ Tốt (+20đ)
  goodHigh: number; goodLow: number; studyViol: number; cheating: number;
  absentTotal: number; absentPermit: number; absentNoPermit: number;
  late: number; noisy: number; privateWork: number; lateDuty: number; dirty: number;
  food: number; dress: number; skip: number; dishonest: number; parking: number;
  phone: number; traffic: number; fight: number;
  bonusYouth: number; bonusSweep: number; bonusNtvt: number;
  names: string; opinionClass: string; opinionCodo: string;
}
export interface Score {
  id: string; weekId: string; classId: string; details: Details;
  status: ScoreStatus; returnReason?: string;
  submittedBy?: string; submittedAt?: string; approvedBy?: string; approvedAt?: string;
  updatedBy?: string; updatedAt?: string;
}
export interface LogEntry { id: string; time: string; actor: string; role: string; action: string; detail: string; }
export interface AppState {
  settings: Settings; weeks: Week[]; classes: ClassItem[]; roster: Roster[];
  scores: Score[]; logs: LogEntry[];
}
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
export const nowStr = () => new Date().toLocaleString('vi-VN');

// --- Phân khối lớp ---
export type ClassGroup = 'tu-nhien' | 'xa-hoi';
const TU_NHIEN = new Set(['10B1', '10B2', '11A1', '11A2', '12C1', '12C2']);
const XA_HOI = new Set(['10B3', '10B4', '10B5', '11A3', '11A4', '12C3', '12C4', '12C5']);
export function classGroup(name: string): ClassGroup | null {
  const n = name.trim().toUpperCase().replace(/\s+/g, '');
  if (TU_NHIEN.has(n)) return 'tu-nhien';
  if (XA_HOI.has(n)) return 'xa-hoi';
  return null;
}
export function groupLabel(g: ClassGroup): string { return g === 'tu-nhien' ? 'Khối tự nhiên' : 'Khối xã hội'; }

// --- Tháng của tuần (dạng MM/YYYY) ---
export function currentMonth(): string {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
const MONTH_RE = /^(0[1-9]|1[0-2])\/\d{4}$/;
// Tuần mới có trường month thì dùng luôn. Tuần cũ chưa có thì suy ra từ
// khoảng ngày: lấy ngày cuối trong khoảng (vd "17/11 – 22/11" -> 11/2026);
// năm lấy trong khoảng ngày nếu có, không có thì lấy năm hiện tại.
export function monthOfWeek(w: Week): string | null {
  const m = w.month?.trim();
  if (m && MONTH_RE.test(m)) return m;
  const dates = [...w.dateRange.matchAll(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/g)];
  if (!dates.length) return null;
  const last = dates[dates.length - 1];
  const mm = String(Number(last[2])).padStart(2, '0');
  const yyyy = last[3] ?? String(new Date().getFullYear());
  return `${mm}/${yyyy}`;
}
export function monthLabel(m: string): string { return `Tháng ${m}`; }

// Xếp loại từ điểm trung bình (cùng ngưỡng với điểm thi đua tuần).
export function clsOf(avg: number): string { return avg >= 80 ? 'A' : avg >= 65 ? 'B' : avg >= 50 ? 'C' : 'D'; }
// Điểm trung bình của một lớp qua các tuần cho trước, chỉ tính phiếu đã duyệt.
export function classAvg(state: AppState, classId: string, weekIds: string[]): number | null {
  const list = state.scores.filter(s => s.classId === classId && s.status === 'approved' && weekIds.includes(s.weekId));
  if (!list.length) return null;
  return list.reduce((a, s) => a + calcScore(s.details).final, 0) / list.length;
}

export function emptyDetails(): Details {
  return {
    hoursTot: 0, hoursKha: 0, hoursTb: 0, hoursYeu: 0, allGood: false,
    goodHigh: 0, goodLow: 0, studyViol: 0, cheating: 0,
    absentTotal: 0, absentPermit: 0, absentNoPermit: 0,
    late: 0, noisy: 0, privateWork: 0, lateDuty: 0, dirty: 0,
    food: 0, dress: 0, skip: 0, dishonest: 0, parking: 0,
    phone: 0, traffic: 0, fight: 0,
    bonusYouth: 0, bonusSweep: 0, bonusNtvt: 0,
    names: '', opinionClass: '', opinionCodo: '',
  };
}
export function defaultSettings(): Settings {
  return {
    school: 'TRƯỜNG THPT HÙNG VƯƠNG - QUẢNG PHÚ', dept: 'BAN THI ĐUA',
    docNo: '04/TĐ-HV', signer: 'Trần Thị Hương', signerTitle: 'PHỤ TRÁCH THI ĐUA',
    generalPros: '', generalCons: '',
  };
}
export function emptyState(): AppState {
  return { settings: defaultSettings(), weeks: [], classes: [], roster: [], scores: [], logs: [] };
}
export interface Calc { plus: number; minus: number; final: number; cls: string; totalHours: number; is100Tot: boolean; noAbsentLate: boolean; }
export function calcScore(d: Details): Calc {
  const totalHours = d.hoursTot + d.hoursKha + d.hoursTb + d.hoursYeu;
  const autoGood = totalHours > 0 && d.hoursKha === 0 && d.hoursTb === 0 && d.hoursYeu === 0;
  const is100Tot = d.allGood === true || (d.allGood === undefined && autoGood);
  const noAbsentLate = d.absentTotal === 0 && d.late === 0;
  const plus = (is100Tot ? 20 : 0) + d.goodHigh * 1 + d.bonusYouth * 20 + d.bonusSweep * 10 + d.bonusNtvt * 10 + (noAbsentLate ? 10 : 0);
  const minus = d.hoursKha * 1 + d.hoursTb * 3 + d.hoursYeu * 5
    + d.goodLow * 1 + d.studyViol * 1 + d.cheating * 10
    + d.absentNoPermit * 5 + d.late * 2 + d.noisy * 5 + d.privateWork * 2
    + d.lateDuty * 2 + d.dirty * 5 + d.food * 2 + d.dress * 1 + d.skip * 5
    + d.dishonest * 5 + d.parking * 5 + d.phone * 10 + d.traffic * 10 + d.fight * 20;
  const final = 100 + plus - minus;
  const cls = final >= 80 ? 'A' : final >= 65 ? 'B' : final >= 50 ? 'C' : 'D';
  return { plus, minus, final, cls, totalHours, is100Tot, noAbsentLate };
}
export function validateDetails(d: Details): string[] {
  const errs: string[] = [];
  const total = d.hoursTot + d.hoursKha + d.hoursTb + d.hoursYeu;
  if (total === 0) errs.push('Chưa nhập giờ học: tổng số giờ đang bằng 0.');
  if (d.absentNoPermit > d.absentTotal) errs.push('Số vắng không phép không được lớn hơn tổng số vắng.');
  if (d.absentPermit + d.absentNoPermit > d.absentTotal)
    errs.push('Số vắng có phép + không phép đang lớn hơn tổng số vắng.');
  const conductViol = d.late + d.noisy + d.privateWork + d.lateDuty + d.dirty + d.food + d.dress + d.skip + d.dishonest + d.parking + d.phone + d.traffic + d.fight;
  if (conductViol > 0 && d.names.trim() === '')
    errs.push('Có vi phạm nề nếp nhưng chưa ghi tên học sinh vi phạm (ô "Tên HS vi phạm").');
  if (d.studyViol > 0 && d.names.trim() === '' && conductViol === 0)
    errs.push('Có vi phạm học tập nhưng chưa ghi tên học sinh vi phạm.');
  return errs;
}
export function hocTapLines(d: Details): string[] {
  const out: string[] = [];
  const total = d.hoursTot + d.hoursKha + d.hoursTb + d.hoursYeu;
  if (total > 0) {
    if (d.hoursKha === 0 && d.hoursTb === 0 && d.hoursYeu === 0) out.push(`Giờ tốt: 100% tốt`);
    else out.push(`Giờ tốt: ${d.hoursTot} tốt, ${d.hoursKha} khá${d.hoursTb ? `, ${d.hoursTb} trung bình` : ''}${d.hoursYeu ? `, ${d.hoursYeu} yếu` : ''}`);
  }
  if (d.goodHigh) out.push(`Điểm tốt (≥5): ${d.goodHigh}`);
  if (d.goodLow) out.push(`Điểm dưới 5: ${d.goodLow}`);
  if (d.studyViol) out.push(`Vi phạm học tập: ${d.studyViol} lượt (-${d.studyViol})`);
  if (d.cheating) out.push(`Gian lận trong thi: ${d.cheating} lượt (-${d.cheating * 10})`);
  if (d.bonusYouth) out.push(`Công trình thanh niên: +${d.bonusYouth * 20}đ`);
  if (d.bonusSweep) out.push(`Quét sân: +${d.bonusSweep * 10}đ`);
  if (d.bonusNtvt) out.push(`NTVT: +${d.bonusNtvt * 10}đ`);
  return out.length ? out : ['—'];
}
export function neNepLines(d: Details): string[] {
  const out: string[] = [];
  if (d.absentTotal === 0 && d.late === 0) out.push('Không vắng, không đi muộn: +10đ');
  else {
    if (d.absentTotal) out.push(`Vắng: ${d.absentTotal} (${d.absentPermit}p, ${d.absentNoPermit}Kp)`);
    if (d.late) out.push(`Đi muộn: ${d.late} lượt (-${d.late * 2})`);
  }
  if (d.noisy) out.push(`Lớp ồn trong sinh hoạt 15p: ${d.noisy} lượt (-${d.noisy * 5})`);
  if (d.privateWork) out.push(`Làm việc riêng, ngủ gục: ${d.privateWork} lượt (-${d.privateWork * 2})`);
  if (d.lateDuty) out.push(`Trực nhật muộn: ${d.lateDuty} lần (-${d.lateDuty * 2})`);
  if (d.dirty) out.push(`Lớp bẩn: ${d.dirty} lượt (-${d.dirty * 5})`);
  if (d.food) out.push(`Ăn/mang đồ ăn vào lớp: ${d.food} lượt (-${d.food * 2})`);
  if (d.dress) out.push(`Mang dép lê, không đeo thẻ: ${d.dress} lượt (-${d.dress})`);
  if (d.skip) out.push(`Bỏ tiết: ${d.skip} lượt (-${d.skip * 5})`);
  if (d.dishonest) out.push(`Không trung thực, nói tục: ${d.dishonest} lượt (-${d.dishonest * 5})`);
  if (d.parking) out.push(`Để xe sai quy định, nẹt bô: ${d.parking} lượt (-${d.parking * 5})`);
  if (d.phone) out.push(`Dùng điện thoại trong giờ học: ${d.phone} lượt (-${d.phone * 10})`);
  if (d.traffic) out.push(`Vi phạm ATGT: ${d.traffic} lượt (-${d.traffic * 10})`);
  if (d.fight) out.push(`Đánh nhau, vô lễ với GV: ${d.fight} lượt (-${d.fight * 20})`);
  if (d.names.trim()) out.push(`HS vi phạm: ${d.names.trim()}`);
  return out.length ? out : ['—'];
}
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function toCsv(rows: string[][]): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return '\uFEFF' + rows.map(r => r.map(esc).join(',')).join('\r\n');
}
