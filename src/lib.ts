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
// (month cũ dạng MM/YYYY nhập tay — giờ tháng tính theo tuần nên không dùng nữa.)
export interface ClassItem { id: string; name: string; }
export interface Roster { id: string; name: string; classId: string; weekId: string; active: boolean; }
export interface ExtraLine { points: number; note: string; }

export interface Details {
  hoursTot: number; hoursKha: number; hoursTb: number; hoursYeu: number;
  allGood?: boolean; // Tích tay: 100% giờ Tốt (+20đ)
  goodHigh: number; goodLow: number; cheating: number;
  absentTotal?: number; // Legacy: tổng vắng nhập tay — giờ tự tính từ có phép + không phép, không dùng nữa.
  absentPermit: number; absentNoPermit: number;
  noAbsLate?: boolean; // Tích tay: 100% không vắng, không đi muộn (+10đ)
  noisy: number; lateDuty: number; dirty: number; skip: number; phone: number;
  // Lỗi vi phạm tách nhỏ theo đúng phiếu giấy (mỗi lỗi một dòng riêng để
  // khi xuất phiếu chỉ hiện đúng lỗi đã xảy ra, không bê nguyên cụm):
  // Học tập (-1đ/lượt mỗi lỗi)
  studyNoLearn?: number; // Không học bài
  studyNoPrepare?: number; // Không soạn bài
  studyNoMaterial?: number; // Không mang tài liệu, đồ dùng học tập
  // Đi muộn / ra ngoài (-2đ/lượt mỗi lỗi)
  lateLate?: number; // Đi muộn
  lateOut?: number; // Tự ý ra ngoài trong sinh hoạt 15p
  // Trong lớp (-2đ/lượt mỗi lỗi)
  workPrivate?: number; // Làm việc riêng
  workNotSerious?: number; // Không nghiêm túc
  workSleep?: number; // Ngủ gục
  // Ăn uống / điện thoại (-2đ/lượt mỗi lỗi)
  foodEat?: number; // Ăn/mang đồ ăn vào lớp
  foodPhone?: number; // Không bỏ điện thoại vào tủ
  // Trang phục (-1đ/lượt mỗi lỗi)
  dressSlipper?: number; // Mang dép lê
  dressNoCard?: number; // Không đeo thẻ HS
  dressNoBadge?: number; // Không đeo huy hiệu đoàn
  dressHair?: number; // Nhuộm tóc
  dressEarring?: number; // Đeo bông tai (Nam)
  // Thái độ (-5đ/lượt mỗi lỗi)
  dishonestLie?: number; // Không trung thực
  dishonestSwear?: number; // Nói tục, chửi thề
  // Xe cộ (-5đ/lượt mỗi lỗi)
  parkingWrong?: number; // Để xe sai quy định
  parkingRev?: number; // Nẹt bô
  // ATGT (-10đ/lượt mỗi lỗi)
  trafficHelmet?: number; // Không đội mũ bảo hiểm
  trafficMirror?: number; // Xe không có gương chiếu hậu
  trafficThree?: number; // Chở ba
  // Nghiêm trọng (-20đ/lượt mỗi lỗi)
  fightHit?: number; // Đánh nhau
  fightRude?: number; // Vô lễ với GV
  fightExplosive?: number; // Tàng trữ, sử dụng chất gây nổ
  fightDrug?: number; // Sử dụng thuốc lá, chất gây nghiện
  // --- Trường cũ (gộp nhiều lỗi vào một mục) ---
  // Chỉ giữ lại để phiếu cũ không mất điểm và vẫn xuất đúng như trước;
  // phiếu mới nhập bằng các trường tách nhỏ ở trên, form không hiện các
  // trường cũ này nữa.
  studyViol?: number; late?: number; privateWork?: number; food?: number;
  dress?: number; dishonest?: number; parking?: number; traffic?: number; fight?: number;
  bonusYouth: number; bonusSweep: number; bonusNtvt: number;
  extraPlus?: ExtraLine[]; // Cộng đột xuất: tối đa 5 dòng, mỗi dòng điểm + nội dung
  extraMinus?: ExtraLine[]; // Trừ đột xuất: tối đa 5 dòng, mỗi dòng điểm + nội dung
  names: string; opinionClass: string; opinionCodo: string;
  // Tên HS vi phạm theo từng mục lỗi (key = tên trường vi phạm, vd
  // lateLate -> "Lan, Sang"). Ghi dưới từng mục vi phạm trong phiếu.
  violNames?: Partial<Record<string, string>>;
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

// --- Tháng của tuần: chỉ tính theo tuần, không tính theo ngày ---
// Năm học bắt đầu từ tháng 9; cứ 4 tuần là 1 tháng — tuần 1–4 là Tháng 9,
// tuần 5–8 là Tháng 10, ..., tuần 17–20 là Tháng 1, ...
// Số tuần lấy từ tên tuần (vd "Tuần 04" -> 4); tên không có số thì dùng vị
// trí của tuần trong danh sách (tuần đầu tiên là tuần 1).
export function weekNumberOf(w: Week, fallback: number): number {
  const m = w.label.match(/(\d+)/);
  const n = m ? Number(m[1]) : fallback;
  return n > 0 ? n : fallback;
}
// Khối 4 tuần thứ mấy của năm học (0-based): tuần 1–4 -> 0, tuần 5–8 -> 1...
export function monthBlockOf(w: Week, fallback: number): number {
  return Math.floor((weekNumberOf(w, fallback) - 1) / 4);
}
// Tháng dương lịch của một khối 4 tuần: khối 0 -> 9, khối 1 -> 10, ..., khối 4 -> 1.
export function monthOfBlock(b: number): number {
  return ((8 + b) % 12) + 1;
}
export function monthLabel(b: number): string { return `Tháng ${monthOfBlock(b)}`; }

// Lịch trực cờ đỏ — Học kì 1, năm học 2026–2027 (ảnh "LỊCH TRỰC THI ĐUA").
// Cách đọc bảng: cột là lớp được trực, ô là lớp cờ đỏ đi trực lớp đó.
// Quy luật xoay (đã đối chiếu ảnh và được GV xác nhận "B3 trực B5" ở tuần 3):
// - Nhóm A (10B1–10B5): cờ đỏ lớp C trực lớp C lùi s bước, s = ((tuần−1) % 4) + 1.
// - Nhóm B (11A1–12C5): cờ đỏ lớp C trực lớp C lùi s bước, s = ((tuần−1) % 8) + 1.
// - Trực cổng: SÁNG = nhóm B theo thứ tự tuần, CHIỀU = nhóm A theo thứ tự tuần (chu kì 4).
export const DUTY_GROUP_A = ['10B1', '10B2', '10B3', '10B4', '10B5'];
export const DUTY_GROUP_B = ['11A1', '11A2', '11A3', '11A4', '12C1', '12C2', '12C3', '12C4', '12C5'];
export const DUTY_CLASSES = [...DUTY_GROUP_A, ...DUTY_GROUP_B];
export const DUTY_WEEKS = 17;

// Lớp mà cờ đỏ của lớp homeClass trực trong tuần weekNo (số tuần 1–17).
// Trả về null nếu tên lớp không thuộc 2 nhóm trong lịch.
export function dutyMonitored(homeClass: string, weekNo: number): string | null {
  const name = homeClass.trim().toUpperCase();
  for (const [group, cycle] of [[DUTY_GROUP_A, 4], [DUTY_GROUP_B, 8]] as const) {
    const i = group.indexOf(name);
    if (i >= 0) {
      const shift = ((weekNo - 1) % cycle) + 1;
      return group[(i - shift + group.length) % group.length];
    }
  }
  return null;
}

// Lớp trực cổng chào cờ của tuần weekNo.
export function gateDuty(weekNo: number): { sang: string; chieu: string } {
  return {
    sang: DUTY_GROUP_B[(weekNo - 1) % DUTY_GROUP_B.length],
    chieu: DUTY_GROUP_A[(weekNo - 1) % 4],
  };
}

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
    goodHigh: 0, goodLow: 0, cheating: 0,
    absentPermit: 0, absentNoPermit: 0, noAbsLate: false,
    noisy: 0, lateDuty: 0, dirty: 0, skip: 0, phone: 0,
    studyNoLearn: 0, studyNoPrepare: 0, studyNoMaterial: 0,
    lateLate: 0, lateOut: 0,
    workPrivate: 0, workNotSerious: 0, workSleep: 0,
    foodEat: 0, foodPhone: 0,
    dressSlipper: 0, dressNoCard: 0, dressNoBadge: 0, dressHair: 0, dressEarring: 0,
    dishonestLie: 0, dishonestSwear: 0,
    parkingWrong: 0, parkingRev: 0,
    trafficHelmet: 0, trafficMirror: 0, trafficThree: 0,
    fightHit: 0, fightRude: 0, fightExplosive: 0, fightDrug: 0,
    studyViol: 0, late: 0, privateWork: 0, food: 0, dress: 0,
    dishonest: 0, parking: 0, traffic: 0, fight: 0,
    bonusYouth: 0, bonusSweep: 0, bonusNtvt: 0,
    extraPlus: [], extraMinus: [],
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
// Tổng vắng tự tính: có phép + không phép (không nhập tay nữa).
export function absentTotalOf(d: Details): number { return num(d.absentPermit) + num(d.absentNoPermit); }
// Tên HS vi phạm của một mục lỗi, để gắn vào dòng phiếu (" — HS: ...").
export function violNamesOf(d: Details, key: string): string {
  const s = (d.violNames?.[key] ?? '').trim();
  return s ? ` — HS: ${s}` : '';
}
export function isNoAbsentLate(d: Details): boolean {
  return d.noAbsLate === true || (d.noAbsLate === undefined && absentTotalOf(d) === 0 && (d.late ?? 0) === 0 && (d.lateLate ?? 0) === 0);
}
export function is100Tot(d: Details): boolean {
  return d.allGood === true || (d.allGood === undefined && d.hoursTot > 0 && d.hoursKha === 0 && d.hoursTb === 0 && d.hoursYeu === 0);
}

const extraSum = (list?: ExtraLine[]) => (list ?? []).reduce((a, x) => a + Math.max(0, x.points || 0), 0);

export interface SectionSums { hoursPlus: number; hoursMinus: number; hocTapPlus: number; hocTapMinus: number; neNepPlus: number; neNepMinus: number; extraPlus: number; extraMinus: number; }

// Điểm cộng/trừ theo từng mục, dùng cùng quy tắc với calcScore
// (để tiêu đề mục thu gọn hiển thị đúng số điểm của mục đó).
// Mỗi lỗi tách nhỏ tính đúng mức điểm của cụm cũ; phiếu cũ (trường gộp)
// vẫn được cộng vào để không mất điểm.
const num = (v?: number) => v ?? 0;
export function sectionSums(d: Details): SectionSums {
  return {
    hoursPlus: is100Tot(d) ? 20 : 0,
    hoursMinus: d.hoursKha * 1 + d.hoursTb * 3 + d.hoursYeu * 5,
    hocTapPlus: d.goodHigh * 1 + d.bonusYouth * 20 + d.bonusSweep * 10 + d.bonusNtvt * 10,
    hocTapMinus: d.goodLow * 1 + num(d.studyViol) * 1 + num(d.studyNoLearn) * 1 + num(d.studyNoPrepare) * 1 + num(d.studyNoMaterial) * 1 + d.cheating * 10,
    neNepPlus: isNoAbsentLate(d) ? 10 : 0,
    neNepMinus: d.absentNoPermit * 5
      + num(d.late) * 2 + num(d.lateLate) * 2 + num(d.lateOut) * 2
      + d.noisy * 5
      + num(d.privateWork) * 2 + num(d.workPrivate) * 2 + num(d.workNotSerious) * 2 + num(d.workSleep) * 2
      + d.lateDuty * 2 + d.dirty * 5
      + num(d.food) * 2 + num(d.foodEat) * 2 + num(d.foodPhone) * 2
      + num(d.dress) * 1 + num(d.dressSlipper) * 1 + num(d.dressNoCard) * 1 + num(d.dressNoBadge) * 1 + num(d.dressHair) * 1 + num(d.dressEarring) * 1
      + d.skip * 5
      + num(d.dishonest) * 5 + num(d.dishonestLie) * 5 + num(d.dishonestSwear) * 5
      + num(d.parking) * 5 + num(d.parkingWrong) * 5 + num(d.parkingRev) * 5
      + d.phone * 10
      + num(d.traffic) * 10 + num(d.trafficHelmet) * 10 + num(d.trafficMirror) * 10 + num(d.trafficThree) * 10
      + num(d.fight) * 20 + num(d.fightHit) * 20 + num(d.fightRude) * 20 + num(d.fightExplosive) * 20 + num(d.fightDrug) * 20,
    extraPlus: extraSum(d.extraPlus),
    extraMinus: extraSum(d.extraMinus),
  };
}

export function calcScore(d: Details): Calc {
  const sec = sectionSums(d);
  const totalHours = d.hoursTot + d.hoursKha + d.hoursTb + d.hoursYeu;
  const tot100 = is100Tot(d);
  const noAbsentLate = isNoAbsentLate(d);
  const plus = sec.hoursPlus + sec.hocTapPlus + sec.neNepPlus + sec.extraPlus;
  const minus = sec.hoursMinus + sec.hocTapMinus + sec.neNepMinus + sec.extraMinus;
  const final = 100 + plus - minus;
  const cls = final >= 80 ? 'A' : final >= 65 ? 'B' : final >= 50 ? 'C' : 'D';
  return { plus, minus, final, cls, totalHours, is100Tot: tot100, noAbsentLate };
}
export function validateDetails(d: Details): string[] {
  const errs: string[] = [];
  const total = d.hoursTot + d.hoursKha + d.hoursTb + d.hoursYeu;
  // Tích 100% giờ Tốt thì không cần nhập tổng số giờ nữa.
  if (total === 0 && !is100Tot(d)) errs.push('Chưa nhập giờ học: tổng số giờ đang bằng 0.');
  return errs;
}
export function hocTapLines(d: Details): string[] {
  const out: string[] = [];
  const total = d.hoursTot + d.hoursKha + d.hoursTb + d.hoursYeu;
  // Tích 100% giờ Tốt thì phiếu ghi 100% tốt ngay cả khi chưa nhập số giờ.
  if (is100Tot(d)) out.push(`Giờ tốt: 100% tốt`);
  else if (total > 0) out.push(`Giờ tốt: ${d.hoursTot} tốt, ${d.hoursKha} khá${d.hoursTb ? `, ${d.hoursTb} trung bình` : ''}${d.hoursYeu ? `, ${d.hoursYeu} yếu` : ''}`);
  if (d.goodHigh) out.push(`Điểm tốt (≥5): ${d.goodHigh}`);
  if (d.goodLow) out.push(`Điểm dưới 5: ${d.goodLow}${violNamesOf(d, 'goodLow')}`);
  if (num(d.studyNoLearn)) out.push(`Không học bài: ${num(d.studyNoLearn)} lượt (-${num(d.studyNoLearn)})${violNamesOf(d, 'studyNoLearn')}`);
  if (num(d.studyNoPrepare)) out.push(`Không soạn bài: ${num(d.studyNoPrepare)} lượt (-${num(d.studyNoPrepare)})${violNamesOf(d, 'studyNoPrepare')}`);
  if (num(d.studyNoMaterial)) out.push(`Không mang tài liệu, đồ dùng học tập: ${num(d.studyNoMaterial)} lượt (-${num(d.studyNoMaterial)})${violNamesOf(d, 'studyNoMaterial')}`);
  if (num(d.studyViol)) out.push(`Vi phạm học tập: ${num(d.studyViol)} lượt (-${num(d.studyViol)})${violNamesOf(d, 'studyViol')}`);
  if (d.cheating) out.push(`Gian lận trong thi: ${d.cheating} lượt (-${d.cheating * 10})${violNamesOf(d, 'cheating')}`);
  if (d.bonusYouth) out.push(`Công trình thanh niên: +${d.bonusYouth * 20}đ`);
  if (d.bonusSweep) out.push(`Quét sân: +${d.bonusSweep * 10}đ`);
  if (d.bonusNtvt) out.push(`NTVT: +${d.bonusNtvt * 10}đ`);
  (d.extraPlus ?? []).filter(x => x.points > 0 || x.note.trim()).forEach(x => out.push(`${x.note.trim() || 'Cộng khác'}: +${Math.max(0, x.points || 0)}đ`));
  return out.length ? out : ['—'];
}
export function neNepLines(d: Details): string[] {
  const out: string[] = [];
  if (isNoAbsentLate(d)) out.push('Không vắng, không đi muộn: +10đ');
  else if (absentTotalOf(d)) out.push(`Vắng: ${absentTotalOf(d)} (${d.absentPermit}p, ${d.absentNoPermit}Kp)${violNamesOf(d, 'absentNoPermit')}`);
  if (num(d.lateLate)) out.push(`Đi muộn: ${num(d.lateLate)} lượt (-${num(d.lateLate) * 2})${violNamesOf(d, 'lateLate')}`);
  if (num(d.lateOut)) out.push(`Tự ý ra ngoài trong sinh hoạt 15p: ${num(d.lateOut)} lượt (-${num(d.lateOut) * 2})${violNamesOf(d, 'lateOut')}`);
  if (num(d.late)) out.push(`Đi muộn, sinh hoạt 15p tự ý ra ngoài: ${num(d.late)} lượt (-${num(d.late) * 2})${violNamesOf(d, 'late')}`);
  if (d.noisy) out.push(`Lớp ồn trong sinh hoạt 15p: ${d.noisy} lượt (-${d.noisy * 5})${violNamesOf(d, 'noisy')}`);
  if (num(d.workPrivate)) out.push(`Làm việc riêng: ${num(d.workPrivate)} lượt (-${num(d.workPrivate) * 2})${violNamesOf(d, 'workPrivate')}`);
  if (num(d.workNotSerious)) out.push(`Không nghiêm túc: ${num(d.workNotSerious)} lượt (-${num(d.workNotSerious) * 2})${violNamesOf(d, 'workNotSerious')}`);
  if (num(d.workSleep)) out.push(`Ngủ gục: ${num(d.workSleep)} lượt (-${num(d.workSleep) * 2})${violNamesOf(d, 'workSleep')}`);
  if (num(d.privateWork)) out.push(`Làm việc riêng, không nghiêm túc, ngủ gục: ${num(d.privateWork)} lượt (-${num(d.privateWork) * 2})${violNamesOf(d, 'privateWork')}`);
  if (d.lateDuty) out.push(`Trực nhật muộn: ${d.lateDuty} lần (-${d.lateDuty * 2})${violNamesOf(d, 'lateDuty')}`);
  if (d.dirty) out.push(`Lớp bẩn: ${d.dirty} lượt (-${d.dirty * 5})${violNamesOf(d, 'dirty')}`);
  if (num(d.foodEat)) out.push(`Ăn/mang đồ ăn vào lớp: ${num(d.foodEat)} lượt (-${num(d.foodEat) * 2})${violNamesOf(d, 'foodEat')}`);
  if (num(d.foodPhone)) out.push(`Không bỏ điện thoại vào tủ: ${num(d.foodPhone)} lượt (-${num(d.foodPhone) * 2})${violNamesOf(d, 'foodPhone')}`);
  if (num(d.food)) out.push(`Ăn/mang đồ ăn vào lớp: ${num(d.food)} lượt (-${num(d.food) * 2})${violNamesOf(d, 'food')}`);
  if (num(d.dressSlipper)) out.push(`Mang dép lê: ${num(d.dressSlipper)} lượt (-${num(d.dressSlipper)})${violNamesOf(d, 'dressSlipper')}`);
  if (num(d.dressNoCard)) out.push(`Không đeo thẻ HS: ${num(d.dressNoCard)} lượt (-${num(d.dressNoCard)})${violNamesOf(d, 'dressNoCard')}`);
  if (num(d.dressNoBadge)) out.push(`Không đeo huy hiệu đoàn: ${num(d.dressNoBadge)} lượt (-${num(d.dressNoBadge)})${violNamesOf(d, 'dressNoBadge')}`);
  if (num(d.dressHair)) out.push(`Nhuộm tóc: ${num(d.dressHair)} lượt (-${num(d.dressHair)})${violNamesOf(d, 'dressHair')}`);
  if (num(d.dressEarring)) out.push(`Đeo bông tai (Nam): ${num(d.dressEarring)} lượt (-${num(d.dressEarring)})${violNamesOf(d, 'dressEarring')}`);
  if (num(d.dress)) out.push(`Mang dép lê, không đeo thẻ: ${num(d.dress)} lượt (-${num(d.dress)})${violNamesOf(d, 'dress')}`);
  if (d.skip) out.push(`Bỏ tiết: ${d.skip} lượt (-${d.skip * 5})${violNamesOf(d, 'skip')}`);
  if (num(d.dishonestLie)) out.push(`Không trung thực: ${num(d.dishonestLie)} lượt (-${num(d.dishonestLie) * 5})${violNamesOf(d, 'dishonestLie')}`);
  if (num(d.dishonestSwear)) out.push(`Nói tục, chửi thề: ${num(d.dishonestSwear)} lượt (-${num(d.dishonestSwear) * 5})${violNamesOf(d, 'dishonestSwear')}`);
  if (num(d.dishonest)) out.push(`Không trung thực, nói tục: ${num(d.dishonest)} lượt (-${num(d.dishonest) * 5})${violNamesOf(d, 'dishonest')}`);
  if (num(d.parkingWrong)) out.push(`Để xe sai quy định: ${num(d.parkingWrong)} lượt (-${num(d.parkingWrong) * 5})${violNamesOf(d, 'parkingWrong')}`);
  if (num(d.parkingRev)) out.push(`Nẹt bô: ${num(d.parkingRev)} lượt (-${num(d.parkingRev) * 5})${violNamesOf(d, 'parkingRev')}`);
  if (num(d.parking)) out.push(`Để xe sai quy định, nẹt bô: ${num(d.parking)} lượt (-${num(d.parking) * 5})${violNamesOf(d, 'parking')}`);
  if (d.phone) out.push(`Dùng điện thoại trong giờ học: ${d.phone} lượt (-${d.phone * 10})${violNamesOf(d, 'phone')}`);
  if (num(d.trafficHelmet)) out.push(`Không đội mũ bảo hiểm: ${num(d.trafficHelmet)} lượt (-${num(d.trafficHelmet) * 10})${violNamesOf(d, 'trafficHelmet')}`);
  if (num(d.trafficMirror)) out.push(`Xe không có gương chiếu hậu: ${num(d.trafficMirror)} lượt (-${num(d.trafficMirror) * 10})${violNamesOf(d, 'trafficMirror')}`);
  if (num(d.trafficThree)) out.push(`Chở ba: ${num(d.trafficThree)} lượt (-${num(d.trafficThree) * 10})${violNamesOf(d, 'trafficThree')}`);
  if (num(d.traffic)) out.push(`Vi phạm ATGT: ${num(d.traffic)} lượt (-${num(d.traffic) * 10})${violNamesOf(d, 'traffic')}`);
  if (num(d.fightHit)) out.push(`Đánh nhau: ${num(d.fightHit)} lượt (-${num(d.fightHit) * 20})${violNamesOf(d, 'fightHit')}`);
  if (num(d.fightRude)) out.push(`Vô lễ với GV: ${num(d.fightRude)} lượt (-${num(d.fightRude) * 20})${violNamesOf(d, 'fightRude')}`);
  if (num(d.fightExplosive)) out.push(`Tàng trữ, sử dụng chất gây nổ: ${num(d.fightExplosive)} lượt (-${num(d.fightExplosive) * 20})${violNamesOf(d, 'fightExplosive')}`);
  if (num(d.fightDrug)) out.push(`Sử dụng thuốc lá, chất gây nghiện: ${num(d.fightDrug)} lượt (-${num(d.fightDrug) * 20})${violNamesOf(d, 'fightDrug')}`);
  if (num(d.fight)) out.push(`Đánh nhau, vô lễ với GV: ${num(d.fight)} lượt (-${num(d.fight) * 20})${violNamesOf(d, 'fight')}`);
  (d.extraMinus ?? []).filter(x => x.points > 0 || x.note.trim()).forEach(x => out.push(`${x.note.trim() || 'Trừ khác'}: -${Math.max(0, x.points || 0)}đ`));
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

// Các lỗi vi phạm tính theo lượt (không tính giờ học vì khác đơn vị,
// không tính vắng tổng vì trùng với vắng không phép).
export const VIOLATION_FIELDS: { key: keyof Details; label: string }[] = [
  { key: 'studyNoLearn', label: 'Không học bài' },
  { key: 'studyNoPrepare', label: 'Không soạn bài' },
  { key: 'studyNoMaterial', label: 'Không mang tài liệu' },
  { key: 'cheating', label: 'Gian lận trong thi' },
  { key: 'absentNoPermit', label: 'Vắng không phép' },
  { key: 'lateLate', label: 'Đi muộn' },
  { key: 'lateOut', label: 'Tự ý ra ngoài 15p' },
  { key: 'noisy', label: 'Lớp ồn sinh hoạt 15p' },
  { key: 'workPrivate', label: 'Làm việc riêng' },
  { key: 'workNotSerious', label: 'Không nghiêm túc' },
  { key: 'workSleep', label: 'Ngủ gục' },
  { key: 'lateDuty', label: 'Trực nhật muộn' },
  { key: 'dirty', label: 'Lớp bẩn' },
  { key: 'foodEat', label: 'Ăn/mang đồ ăn vào lớp' },
  { key: 'foodPhone', label: 'Không bỏ ĐT vào tủ' },
  { key: 'dressSlipper', label: 'Mang dép lê' },
  { key: 'dressNoCard', label: 'Không đeo thẻ HS' },
  { key: 'dressNoBadge', label: 'Không đeo huy hiệu đoàn' },
  { key: 'dressHair', label: 'Nhuộm tóc' },
  { key: 'dressEarring', label: 'Đeo bông tai (Nam)' },
  { key: 'skip', label: 'Bỏ tiết' },
  { key: 'dishonestLie', label: 'Không trung thực' },
  { key: 'dishonestSwear', label: 'Nói tục, chửi thề' },
  { key: 'parkingWrong', label: 'Để xe sai quy định' },
  { key: 'parkingRev', label: 'Nẹt bô' },
  { key: 'phone', label: 'Dùng điện thoại trong giờ' },
  { key: 'trafficHelmet', label: 'Không đội mũ bảo hiểm' },
  { key: 'trafficMirror', label: 'Xe không có gương chiếu hậu' },
  { key: 'trafficThree', label: 'Chở ba' },
  { key: 'fightHit', label: 'Đánh nhau' },
  { key: 'fightRude', label: 'Vô lễ với GV' },
  { key: 'fightExplosive', label: 'Tàng trữ chất gây nổ' },
  { key: 'fightDrug', label: 'Thuốc lá, chất gây nghiện' },
  // Phiếu cũ (trường gộp) — vẫn đếm để dashboard không mất số liệu cũ:
  { key: 'studyViol', label: 'Vi phạm học tập (cũ)' },
  { key: 'late', label: 'Đi muộn / ra ngoài 15p (cũ)' },
  { key: 'privateWork', label: 'Làm việc riêng, ngủ gục (cũ)' },
  { key: 'food', label: 'Ăn/mang đồ ăn vào lớp (cũ)' },
  { key: 'dress', label: 'Dép lê, không đeo thẻ (cũ)' },
  { key: 'dishonest', label: 'Không trung thực, nói tục (cũ)' },
  { key: 'parking', label: 'Để xe sai quy định, nẹt bô (cũ)' },
  { key: 'traffic', label: 'Vi phạm ATGT (cũ)' },
  { key: 'fight', label: 'Đánh nhau, vô lễ với GV (cũ)' },
];

export interface ViolationTotal { key: string; label: string; count: number; }
export interface ClassViolation { classId: string; name: string; total: number; top: ViolationTotal[]; }

// Thống kê vi phạm từ các phiếu đã cho (thường chỉ truyền phiếu đã duyệt):
// lỗi nào hay gặp nhất toàn trường, lớp nào vi phạm nhiều nhất và mỗi lớp
// hay lặp lại lỗi gì. Trả về top 5 mỗi loại.
export function violationStats(scores: Score[], classes: ClassItem[]): { topViolations: ViolationTotal[]; classWarnings: ClassViolation[]; totalCount: number } {
  const perField = new Map<string, number>();
  const perClass = new Map<string, Map<string, number>>();
  let totalCount = 0;
  for (const s of scores) {
    const d = s.details;
    for (const f of VIOLATION_FIELDS) {
      const n = Math.max(0, Number((d as unknown as Record<string, unknown>)[f.key]) || 0);
      if (!n) continue;
      totalCount += n;
      perField.set(f.key, (perField.get(f.key) ?? 0) + n);
      const m = perClass.get(s.classId) ?? new Map<string, number>();
      m.set(f.key, (m.get(f.key) ?? 0) + n);
      perClass.set(s.classId, m);
    }
  }
  const labelOf = (key: string) => VIOLATION_FIELDS.find(f => f.key === key)?.label ?? key;
  const topViolations = [...perField.entries()]
    .map(([key, count]) => ({ key, label: labelOf(key), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const classWarnings = [...perClass.entries()]
    .map(([classId, m]) => {
      const total = [...m.values()].reduce((a, b) => a + b, 0);
      const top = [...m.entries()]
        .map(([key, count]) => ({ key, label: labelOf(key), count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 2);
      return { classId, name: classes.find(c => c.id === classId)?.name ?? classId, total, top };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
  return { topViolations, classWarnings, totalCount };
}
