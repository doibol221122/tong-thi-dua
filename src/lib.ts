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
  // Vệ sinh (-2đ/lượt mỗi lỗi)
  trashDesk?: number; // Rác trong hộc bàn
  // Điện (-5đ/lượt mỗi lỗi)
  lightsLeftOn?: number; // Không tắt điện ra về
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
    trashDesk: 0, lightsLeftOn: 0,
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
// Dòng vi phạm theo đúng mẫu tổng hợp tuần của trường: có tên HS thì
// tên nằm ngay sau dấu hai chấm, điểm trừ trong ngoặc cuối dòng
// ("Đi muộn: Thanh, Hòa (-4)"); không có tên thì giữ số lượt
// ("Đi muộn: 2 lượt (-4)"). Nếu tên và số lượt không khớp nhau (một HS
// vi phạm nhiều lần, hoặc ghi thừa tên) thì số lượt vẫn hiện sau tên
// ("Mang dép lê: Lan Anh (4 lượt) (-4)").
export function violLine(d: Details, key: string, label: string, count: number, points: number, unit = 'lượt'): string {
  const names = (d.violNames?.[key] ?? '').trim();
  if (!names) return `${label}: ${count}${unit ? ' ' + unit : ''} (${points})`;
  const nNames = names.split(',').filter(s => s.trim()).length;
  const extra = count !== nNames ? ` (${count}${unit ? ' ' + unit : ''})` : '';
  return `${label}: ${names}${extra} (${points})`;
}
// Dòng vi phạm đã được miễn vì tích 100% (không tính điểm, chỉ để người
// duyệt phiếu thấy số liệu đã nhập): "Đi muộn: 2 lượt (đã miễn vì tích
// 100% không vắng)". Tên HS (nếu có) hiện như violLine.
export function violLineWaived(d: Details, key: string, label: string, count: number, reason: string, unit = 'lượt'): string {
  const names = (d.violNames?.[key] ?? '').trim();
  if (!names) return `${label}: ${count}${unit ? ' ' + unit : ''} (${reason})`;
  const nNames = names.split(',').filter(s => s.trim()).length;
  const extra = count !== nNames ? ` (${count}${unit ? ' ' + unit : ''})` : '';
  return `${label}: ${names}${extra} (${reason})`;
}
// Hậu tố tên HS vắng không phép cho dòng Vắng (" — Minh, Quân (-5)").
// Chỉ in khi thật sự có vắng không phép (không in "(-0)").
export function absentNamesSuffix(d: Details): string {
  const names = (d.violNames?.['absentNoPermit'] ?? '').trim();
  if (!names || (d.absentNoPermit ?? 0) <= 0) return '';
  return ` — ${names} (-${(d.absentNoPermit ?? 0) * 5})`;
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
// Tích 100% giờ Tốt thì giờ Khá/Trung bình/Yếu lỡ nhập không bị trừ nữa;
// tích 100% không vắng, không đi muộn thì vắng không phép/đi muộn lỡ nhập
// cũng không bị trừ nữa (chỉ các lỗi vắng/muộn; tự ý ra ngoài trong sinh
// hoạt 15p và các lỗi nề nếp khác vẫn trừ như thường).
const num = (v?: number) => v ?? 0;
export function sectionSums(d: Details): SectionSums {
  return {
    hoursPlus: is100Tot(d) ? 20 : 0,
    hoursMinus: is100Tot(d) ? 0 : d.hoursKha * 1 + d.hoursTb * 3 + d.hoursYeu * 5,
    hocTapPlus: d.goodHigh * 1 + d.bonusYouth * 20 + d.bonusSweep * 10 + d.bonusNtvt * 10,
    hocTapMinus: d.goodLow * 1 + num(d.studyViol) * 1 + num(d.studyNoLearn) * 1 + num(d.studyNoPrepare) * 1 + num(d.studyNoMaterial) * 1 + d.cheating * 10,
    neNepPlus: isNoAbsentLate(d) ? 10 : 0,
    neNepMinus: (isNoAbsentLate(d) ? 0 : d.absentNoPermit * 5 + num(d.late) * 2 + num(d.lateLate) * 2)
      + num(d.lateOut) * 2
      + d.noisy * 5
      + num(d.privateWork) * 2 + num(d.workPrivate) * 2 + num(d.workNotSerious) * 2 + num(d.workSleep) * 2
      + d.lateDuty * 2 + d.dirty * 5 + num(d.trashDesk) * 2 + num(d.lightsLeftOn) * 5
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
// Tất cả các trường số trong Details (giờ, điểm, vi phạm, thưởng, trường cũ).
const NUM_INT_FIELDS: (keyof Details)[] = [
  'hoursTot', 'hoursKha', 'hoursTb', 'hoursYeu',
  'goodHigh', 'goodLow', 'cheating',
  'absentPermit', 'absentNoPermit',
  'noisy', 'lateDuty', 'dirty', 'skip', 'phone',
  'studyNoLearn', 'studyNoPrepare', 'studyNoMaterial',
  'lateLate', 'lateOut',
  'workPrivate', 'workNotSerious', 'workSleep',
  'trashDesk', 'lightsLeftOn',
  'foodEat', 'foodPhone',
  'dressSlipper', 'dressNoCard', 'dressNoBadge', 'dressHair', 'dressEarring',
  'dishonestLie', 'dishonestSwear',
  'parkingWrong', 'parkingRev',
  'trafficHelmet', 'trafficMirror', 'trafficThree',
  'fightHit', 'fightRude', 'fightExplosive', 'fightDrug',
  'studyViol', 'late', 'privateWork', 'food', 'dress', 'dishonest', 'parking', 'traffic', 'fight',
  'bonusYouth', 'bonusSweep', 'bonusNtvt',
];
const NUM_LABELS: Partial<Record<keyof Details, string>> = {
  hoursTot: 'Giờ Tốt', hoursKha: 'Giờ Khá', hoursTb: 'Giờ Trung bình', hoursYeu: 'Giờ Yếu',
  goodHigh: 'Tổng điểm tốt (≥5)', goodLow: 'Tổng điểm tốt (<5)', cheating: 'Gian lận trong thi',
  absentPermit: 'Vắng có phép', absentNoPermit: 'Vắng không phép',
  bonusYouth: 'Công trình thanh niên', bonusSweep: 'Quét sân', bonusNtvt: 'NTVT',
};
export function validateDetails(d: Details): string[] {
  const errs: string[] = [];
  const labelOf = (k: string): string => (NUM_LABELS[k as keyof Details] ?? VIOLATION_FIELDS.find(f => f.key === k)?.label ?? k);
  // Mọi số phải là số nguyên hữu hạn ≥ 0 (chặn số âm, phân số, NaN lọt
  // từ import/sao chép — NaN từng vô hiệu luôn kiểm tra tổng giờ).
  for (const k of NUM_INT_FIELDS) {
    const v = d[k] as unknown;
    if (v === undefined) continue;
    if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isInteger(v) || v < 0) {
      errs.push(`${labelOf(k)}: số liệu không hợp lệ (phải là số nguyên ≥ 0).`);
    }
  }
  const total = d.hoursTot + d.hoursKha + d.hoursTb + d.hoursYeu;
  // Tích 100% giờ Tốt thì không cần nhập tổng số giờ nữa.
  if (total === 0 && !is100Tot(d)) errs.push('Chưa nhập giờ học: tổng số giờ đang bằng 0.');
  // Giờ học: mỗi loại ≤ 60 giờ/tuần, tổng ≤ 60 giờ.
  for (const k of ['hoursTot', 'hoursKha', 'hoursTb', 'hoursYeu'] as const) {
    if ((d[k] ?? 0) > 60) errs.push(`${labelOf(k)}: tối đa 60 giờ/tuần.`);
  }
  if (total > 60) errs.push('Tổng số giờ học vượt quá 60 giờ/tuần.');
  // Mỗi lỗi vi phạm ≤ 100 lượt/tuần.
  for (const f of VIOLATION_FIELDS) {
    const v = (d[f.key] as number | undefined) ?? 0;
    if (v > 100) errs.push(`${f.label}: tối đa 100 lượt/tuần.`);
  }
  if ((d.goodLow ?? 0) > 100) errs.push('Tổng điểm tốt (<5): tối đa 100 điểm/tuần.');
  // Cộng/trừ đột xuất: có điểm thì bắt buộc ghi chú; tối đa 5 dòng mỗi loại
  // (không giới hạn cứng số điểm mỗi dòng — theo quyết định D5).
  for (const [key, ten] of [['extraPlus', 'Cộng khác'], ['extraMinus', 'Trừ khác']] as const) {
    const list = d[key] ?? [];
    if (list.length > 5) errs.push(`${ten}: tối đa 5 dòng.`);
    list.forEach((x, i) => {
      if (typeof x.points !== 'number' || !Number.isFinite(x.points) || !Number.isInteger(x.points) || x.points < 0) {
        errs.push(`${ten} dòng ${i + 1}: điểm phải là số nguyên ≥ 0.`);
      } else if (x.points !== 0 && !x.note.trim()) {
        errs.push(`${ten} dòng ${i + 1}: có điểm thì cần ghi nội dung.`);
      }
    });
  }
  // Tên HS: chỉ ghi khi mục có lượt, số tên không vượt số lượt.
  for (const [key, raw] of Object.entries(d.violNames ?? {})) {
    const names = (raw ?? '').trim();
    if (!names) continue;
    const count = (d[key as keyof Details] as number | undefined) ?? 0;
    const nNames = names.split(',').filter(s => s.trim()).length;
    if (count <= 0) errs.push(`${labelOf(key)}: đã ghi tên HS nhưng số lượt đang là 0.`);
    else if (nNames > count) errs.push(`${labelOf(key)}: ghi ${nNames} tên nhưng chỉ có ${count} lượt.`);
  }
  return errs;
}
// So sánh điểm trung bình để xếp hạng: lớp chưa có phiếu duyệt (null)
// luôn xếp sau lớp có điểm (không dùng -1 làm mốc — điểm thật có thể âm).
export function compareAvg(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}
// Số tuần đã nộp phiếu duyệt của một lớp trong danh sách tuần cho trước:
// "nộp n/m tuần" — hiển thị độ phủ nộp phiếu bên cạnh điểm trung bình.
export function classCoverage(state: AppState, classId: string, weekIds: string[]): { approved: number; total: number } {
  const approved = new Set(state.scores.filter(s => s.classId === classId && s.status === 'approved' && weekIds.includes(s.weekId)).map(s => s.weekId)).size;
  return { approved, total: weekIds.length };
}

// Cụm trường gộp cũ -> các trường tách nhỏ tương ứng.
const LEGACY_CLUSTERS: { legacy: keyof Details; split: (keyof Details)[]; label: string }[] = [
  { legacy: 'studyViol', split: ['studyNoLearn', 'studyNoPrepare', 'studyNoMaterial'], label: 'Vi phạm học tập' },
  { legacy: 'late', split: ['lateLate', 'lateOut'], label: 'Đi muộn / ra ngoài 15p' },
  { legacy: 'privateWork', split: ['workPrivate', 'workNotSerious', 'workSleep'], label: 'Làm việc riêng, không nghiêm túc, ngủ gục' },
  { legacy: 'food', split: ['foodEat', 'foodPhone'], label: 'Ăn/mang đồ ăn vào lớp' },
  { legacy: 'dress', split: ['dressSlipper', 'dressNoCard', 'dressNoBadge', 'dressHair', 'dressEarring'], label: 'Trang phục' },
  { legacy: 'dishonest', split: ['dishonestLie', 'dishonestSwear'], label: 'Không trung thực, nói tục' },
  { legacy: 'parking', split: ['parkingWrong', 'parkingRev'], label: 'Để xe sai quy định, nẹt bô' },
  { legacy: 'traffic', split: ['trafficHelmet', 'trafficMirror', 'trafficThree'], label: 'Vi phạm ATGT' },
  { legacy: 'fight', split: ['fightHit', 'fightRude', 'fightExplosive', 'fightDrug'], label: 'Đánh nhau, vô lễ với GV' },
];
// Phiếu trộn cả số liệu cũ (gộp) và mới (tách nhỏ) trong cùng một cụm thì
// đang tính cả hai (trừ trùng). Chỉ cảnh báo, không tự sửa điểm phiếu đã duyệt.
export function legacyMixedClusters(d: Details): string[] {
  return LEGACY_CLUSTERS
    .filter(c => ((d[c.legacy] as number | undefined) ?? 0) > 0 && c.split.some(k => ((d[k] as number | undefined) ?? 0) > 0))
    .map(c => c.label);
}
// Chép/sao chép phiếu: bỏ trường gộp cũ khi đã có trường tách nhỏ tương ứng
// (tránh trừ trùng), và bỏ tổng vắng nhập tay cũ (giờ tự tính).
export function dropLegacyWhenSplit(d: Details): Details {
  const next: Details = { ...d, absentTotal: undefined };
  for (const c of LEGACY_CLUSTERS) {
    if (c.split.some(k => ((next[k] as number | undefined) ?? 0) > 0)) (next as unknown as Record<string, unknown>)[c.legacy] = 0;
  }
  return next;
}

// Dấu ngày giờ cho tên file xuất (YYYYMMDD-HHmm, giờ địa phương).
export function stamp(): string {
  const p2 = (n: number) => String(n).padStart(2, '0');
  const t = new Date();
  return `${t.getFullYear()}${p2(t.getMonth() + 1)}${p2(t.getDate())}-${p2(t.getHours())}${p2(t.getMinutes())}`;
}

// Tên file xuất: chỉ dùng ký tự ASCII (bỏ dấu tiếng Việt, khoảng trắng
// thành _) để trình duyệt nào cũng giữ đúng tên file khi tải — tên có
// dấu ("Tuần_05.docx") làm Chrome rơi về tên "download" không có đuôi.
export function safeFilename(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^A-Za-z0-9._-]+/g, '_');
}

// --- Kiểm tra hình dạng của một Details (dùng khi nhập JSON) ---
function detailsShapeError(d: unknown): string | null {
  if (typeof d !== 'object' || d === null || Array.isArray(d)) return 'chi tiết phiếu không phải là một đối tượng';
  const o = d as Record<string, unknown>;
  for (const k of NUM_INT_FIELDS) {
    const v = o[k];
    if (v === undefined) continue;
    if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isInteger(v) || v < 0) return `chi tiết phiếu: trường ${k} phải là số nguyên ≥ 0`;
  }
  for (const k of ['allGood', 'noAbsLate'] as const) {
    if (o[k] !== undefined && typeof o[k] !== 'boolean') return `chi tiết phiếu: trường ${k} phải là true/false`;
  }
  for (const k of ['extraPlus', 'extraMinus'] as const) {
    const list = o[k];
    if (list === undefined) continue;
    if (!Array.isArray(list)) return `chi tiết phiếu: trường ${k} phải là một mảng`;
    for (const x of list) {
      if (typeof x !== 'object' || x === null) return `chi tiết phiếu: dòng ${k} không đúng định dạng`;
      const r = x as Record<string, unknown>;
      if (typeof r.points !== 'number' || !Number.isFinite(r.points) || !Number.isInteger(r.points) || (r.points as number) < 0) return `chi tiết phiếu: dòng ${k} có điểm không phải số nguyên ≥ 0`;
      if (typeof r.note !== 'string') return `chi tiết phiếu: dòng ${k} thiếu nội dung`;
    }
  }
  if (o.violNames !== undefined) {
    if (typeof o.violNames !== 'object' || o.violNames === null || Array.isArray(o.violNames)) return 'chi tiết phiếu: violNames không đúng định dạng';
    for (const v of Object.values(o.violNames as Record<string, unknown>)) {
      if (typeof v !== 'string') return 'chi tiết phiếu: tên HS vi phạm phải là chuỗi';
    }
  }
  for (const k of ['names', 'opinionClass', 'opinionCodo'] as const) {
    if (o[k] !== undefined && typeof o[k] !== 'string') return `chi tiết phiếu: trường ${k} phải là chuỗi`;
  }
  if (o.absentTotal !== undefined && typeof o.absentTotal !== 'number') return 'chi tiết phiếu: trường absentTotal phải là số';
  return null;
}

// Giờ "24/11/2026 06:00" (định dạng vi-VN trong dữ liệu) -> mốc thời gian
// để so sánh bản nào mới hơn; không đọc được thì coi là 0 (cũ nhất).
function parseVnTime(s?: string): number {
  if (!s) return 0;
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return 0;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0)).getTime();
}
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

// Kiểm tra file JSON sao lưu trước khi nhập: đủ mảng đúng kiểu, id duy
// nhất, phiếu trỏ tới lớp/tuần có thật, mọi số nguyên hữu hạn ≥ 0.
// Trùng (lớp, tuần) thì giữ bản mới nhất theo updatedAt. Lỗi -> từ chối
// toàn bộ, giữ nguyên dữ liệu, báo lỗi đầu tiên gặp.
export function validateImportedState(p: unknown): { ok: true; state: AppState } | { ok: false; error: string } {
  const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
  if (!isObj(p)) return fail('File không phải là một đối tượng JSON.');
  const s = p.settings;
  if (!isObj(s)) return fail('Thiếu mục settings.');
  for (const k of ['school', 'dept', 'docNo', 'signer', 'signerTitle'] as const) {
    if (!isStr(s[k])) return fail(`settings: thiếu trường ${k}.`);
  }
  for (const k of ['generalPros', 'generalCons'] as const) {
    if (s[k] !== undefined && !isStr(s[k])) return fail(`settings: trường ${k} phải là chuỗi.`);
  }
  for (const k of ['weeks', 'classes', 'roster', 'scores', 'logs'] as const) {
    if (!Array.isArray(p[k])) return fail(`Thiếu mục ${k} (phải là một mảng).`);
  }
  const weeks = p.weeks as unknown[];
  const classes = p.classes as unknown[];
  const roster = p.roster as unknown[];
  const scores = p.scores as unknown[];
  const logs = p.logs as unknown[];
  const seenIds = (arr: unknown[], label: string): string | null => {
    const ids = new Set<string>();
    for (const x of arr) {
      if (!isObj(x) || !isStr(x.id) || !x.id.trim()) return `${label}: có mục thiếu id.`;
      if (ids.has(x.id)) return `${label}: trùng id ${x.id}.`;
      ids.add(x.id);
    }
    return null;
  };
  for (const [arr, label] of [[weeks, 'weeks'], [classes, 'classes'], [roster, 'roster'], [scores, 'scores'], [logs, 'logs']] as const) {
    const e = seenIds(arr, label);
    if (e) return fail(e);
  }
  const weekIds = new Set(weeks.map(x => (x as Record<string, unknown>).id as string));
  const classIds = new Set(classes.map(x => (x as Record<string, unknown>).id as string));
  for (const x of weeks) {
    const w = x as Record<string, unknown>;
    if (!isStr(w.label)) return fail(`weeks: tuần ${String(w.id)} thiếu label.`);
    if (w.dateRange !== undefined && !isStr(w.dateRange)) return fail(`weeks: tuần ${String(w.id)} có dateRange không phải chuỗi.`);
  }
  for (const x of classes) {
    const c = x as Record<string, unknown>;
    if (!isStr(c.name) || !c.name.trim()) return fail(`classes: lớp ${String(c.id)} thiếu tên.`);
  }
  for (const x of roster) {
    const r = x as Record<string, unknown>;
    if (!isStr(r.name) || !isStr(r.classId) || !isStr(r.weekId)) return fail(`roster: mục ${String(r.id)} thiếu tên/lớp/tuần.`);
    if (r.active !== undefined && typeof r.active !== 'boolean') return fail(`roster: mục ${String(r.id)} có active không phải true/false.`);
    if (!classIds.has(r.classId)) return fail(`roster: ${String(r.name)} trỏ tới lớp không tồn tại (${String(r.classId)}).`);
    if (!weekIds.has(r.weekId)) return fail(`roster: ${String(r.name)} trỏ tới tuần không tồn tại (${String(r.weekId)}).`);
  }
  for (const x of scores) {
    const sc = x as Record<string, unknown>;
    if (!isStr(sc.weekId) || !isStr(sc.classId)) return fail(`scores: phiếu ${String(sc.id)} thiếu tuần/lớp.`);
    if (!weekIds.has(sc.weekId)) return fail(`scores: phiếu ${String(sc.id)} trỏ tới tuần không tồn tại (${String(sc.weekId)}).`);
    if (!classIds.has(sc.classId)) return fail(`scores: phiếu ${String(sc.id)} trỏ tới lớp không tồn tại (${String(sc.classId)}).`);
    if (!['draft', 'submitted', 'approved', 'returned'].includes(String(sc.status))) return fail(`scores: phiếu ${String(sc.id)} có trạng thái không hợp lệ (${String(sc.status)}).`);
    const e = detailsShapeError(sc.details);
    if (e) return fail(`scores: phiếu ${String(sc.id)} — ${e}.`);
  }
  for (const x of logs) {
    const l = x as Record<string, unknown>;
    for (const k of ['time', 'actor', 'role', 'action'] as const) {
      if (!isStr(l[k])) return fail(`logs: mục ${String(l.id)} thiếu trường ${k}.`);
    }
    if (l.detail !== undefined && !isStr(l.detail)) return fail(`logs: mục ${String(l.id)} có detail không phải chuỗi.`);
  }
  // Trùng (lớp, tuần): giữ bản mới nhất theo updatedAt.
  const byKey = new Map<string, Record<string, unknown>>();
  for (const x of scores) {
    const sc = x as Record<string, unknown>;
    const key = `${String(sc.classId)}|${String(sc.weekId)}`;
    const prev = byKey.get(key);
    if (!prev || parseVnTime(String(sc.updatedAt ?? '')) >= parseVnTime(String(prev.updatedAt ?? ''))) byKey.set(key, sc);
  }
  const state = p as unknown as AppState;
  return {
    ok: true,
    state: {
      settings: state.settings,
      weeks: (state.weeks as Week[]).map(w => ({ ...w, dateRange: w.dateRange ?? '' })),
      classes: state.classes,
      roster: (state.roster as Roster[]).map(r => ({ ...r, active: r.active !== false })),
      scores: [...byKey.values()] as unknown as Score[],
      logs: state.logs,
    },
  };
}
export function hocTapLines(d: Details): string[] {
  const out: string[] = [];
  const total = d.hoursTot + d.hoursKha + d.hoursTb + d.hoursYeu;
  // Tích 100% giờ Tốt thì phiếu ghi 100% tốt ngay cả khi chưa nhập số giờ.
  // Mọi dòng đều ghi đủ điểm để cộng lại ra (1); giờ Khá/TB/Yếu lỡ nhập
  // thì hiện thành dòng đã miễn (không tính điểm) thay vì biến mất.
  if (is100Tot(d)) {
    out.push(`Giờ tốt: 100% tốt (+20đ)`);
    const parts: string[] = [];
    if (d.hoursKha) parts.push(`${d.hoursKha} khá`);
    if (d.hoursTb) parts.push(`${d.hoursTb} trung bình`);
    if (d.hoursYeu) parts.push(`${d.hoursYeu} yếu`);
    if (parts.length) out.push(`Giờ Khá/Trung bình/Yếu: ${parts.join(', ')} (đã miễn vì tích 100% giờ Tốt)`);
  } else if (total > 0) {
    const minus = d.hoursKha * 1 + d.hoursTb * 3 + d.hoursYeu * 5;
    out.push(`Giờ tốt: ${d.hoursTot} tốt, ${d.hoursKha} khá${d.hoursTb ? `, ${d.hoursTb} trung bình` : ''}${d.hoursYeu ? `, ${d.hoursYeu} yếu` : ''}${minus ? ` (-${minus}đ)` : ''}`);
  }
  if (d.goodHigh) out.push(`Điểm tốt (≥5): ${d.goodHigh} (+${d.goodHigh}đ)`);
  if (d.goodLow) out.push(violLine(d, 'goodLow', 'Điểm dưới 5', d.goodLow, -d.goodLow, ''));
  if (num(d.studyNoLearn)) out.push(violLine(d, 'studyNoLearn', 'Không học bài', num(d.studyNoLearn), -(num(d.studyNoLearn))));
  if (num(d.studyNoPrepare)) out.push(violLine(d, 'studyNoPrepare', 'Không soạn bài', num(d.studyNoPrepare), -(num(d.studyNoPrepare))));
  if (num(d.studyNoMaterial)) out.push(violLine(d, 'studyNoMaterial', 'Không mang tài liệu, đồ dùng học tập', num(d.studyNoMaterial), -(num(d.studyNoMaterial))));
  if (num(d.studyViol)) out.push(violLine(d, 'studyViol', 'Vi phạm học tập', num(d.studyViol), -(num(d.studyViol))));
  if (d.cheating) out.push(violLine(d, 'cheating', 'Gian lận trong thi', d.cheating, -(d.cheating * 10)));
  if (d.bonusYouth) out.push(`Công trình thanh niên: +${d.bonusYouth * 20}đ`);
  if (d.bonusSweep) out.push(`Quét sân: +${d.bonusSweep * 10}đ`);
  if (d.bonusNtvt) out.push(`NTVT: +${d.bonusNtvt * 10}đ`);
  (d.extraPlus ?? []).filter(x => x.points > 0 || x.note.trim()).forEach(x => out.push(`${x.note.trim() || 'Cộng khác'}: +${Math.max(0, x.points || 0)}đ`));
  return out.length ? out : ['—'];
}
export function neNepLines(d: Details): string[] {
  const out: string[] = [];
  if (isNoAbsentLate(d)) {
    out.push('Không vắng, không đi muộn: +10đ');
    // Đã tích 100% thì vắng/đi muộn lỡ nhập hiện thành dòng đã miễn (không
    // tính điểm) thay vì biến mất; vắng có phép thật thì giữ dòng Vắng
    // bình thường (vắng có phép vốn không bị trừ điểm).
    if (absentTotalOf(d) > 0) {
      if (d.absentNoPermit > 0) {
        const names = (d.violNames?.['absentNoPermit'] ?? '').trim();
        out.push(`Vắng: ${absentTotalOf(d)} (${d.absentPermit}p, ${d.absentNoPermit}Kp)${names ? ` — ${names}` : ''} (đã miễn vì tích 100% không vắng)`);
      } else {
        out.push(`Vắng: ${absentTotalOf(d)} (${d.absentPermit}p, 0Kp)`);
      }
    }
    if (num(d.lateLate)) out.push(violLineWaived(d, 'lateLate', 'Đi muộn', num(d.lateLate), 'đã miễn vì tích 100% không vắng'));
    if (num(d.late)) out.push(violLineWaived(d, 'late', 'Đi muộn, sinh hoạt 15p tự ý ra ngoài', num(d.late), 'đã miễn vì tích 100% không vắng'));
  } else if (absentTotalOf(d)) out.push(`Vắng: ${absentTotalOf(d)} (${d.absentPermit}p, ${d.absentNoPermit}Kp)${absentNamesSuffix(d)}`);
  // Đã tích 100% không vắng, không đi muộn thì các dòng vắng/muộn lỡ nhập
  // hiện ở trên dạng đã miễn; tự ý ra ngoài 15p vẫn hiện vì là lỗi khác.
  if (!isNoAbsentLate(d) && num(d.lateLate)) out.push(violLine(d, 'lateLate', 'Đi muộn', num(d.lateLate), -(num(d.lateLate) * 2)));
  if (num(d.lateOut)) out.push(violLine(d, 'lateOut', 'Tự ý ra ngoài trong sinh hoạt 15p', num(d.lateOut), -(num(d.lateOut) * 2)));
  if (!isNoAbsentLate(d) && num(d.late)) out.push(violLine(d, 'late', 'Đi muộn, sinh hoạt 15p tự ý ra ngoài', num(d.late), -(num(d.late) * 2)));
  if (d.noisy) out.push(violLine(d, 'noisy', 'Lớp ồn trong sinh hoạt 15p', d.noisy, -(d.noisy * 5)));
  if (num(d.workPrivate)) out.push(violLine(d, 'workPrivate', 'Làm việc riêng', num(d.workPrivate), -(num(d.workPrivate) * 2)));
  if (num(d.workNotSerious)) out.push(violLine(d, 'workNotSerious', 'Không nghiêm túc', num(d.workNotSerious), -(num(d.workNotSerious) * 2)));
  if (num(d.workSleep)) out.push(violLine(d, 'workSleep', 'Ngủ gục', num(d.workSleep), -(num(d.workSleep) * 2)));
  if (num(d.privateWork)) out.push(violLine(d, 'privateWork', 'Làm việc riêng, không nghiêm túc, ngủ gục', num(d.privateWork), -(num(d.privateWork) * 2)));
  if (d.lateDuty) out.push(violLine(d, 'lateDuty', 'Trực nhật muộn', d.lateDuty, -(d.lateDuty * 2), 'lần'));
  if (d.dirty) out.push(violLine(d, 'dirty', 'Lớp bẩn', d.dirty, -(d.dirty * 5)));
  if (num(d.trashDesk)) out.push(violLine(d, 'trashDesk', 'Rác trong hộc bàn', num(d.trashDesk), -(num(d.trashDesk) * 2)));
  if (num(d.lightsLeftOn)) out.push(violLine(d, 'lightsLeftOn', 'Không tắt điện ra về', num(d.lightsLeftOn), -(num(d.lightsLeftOn) * 5)));
  if (num(d.foodEat)) out.push(violLine(d, 'foodEat', 'Ăn/mang đồ ăn vào lớp', num(d.foodEat), -(num(d.foodEat) * 2)));
  if (num(d.foodPhone)) out.push(violLine(d, 'foodPhone', 'Không bỏ điện thoại vào tủ', num(d.foodPhone), -(num(d.foodPhone) * 2)));
  if (num(d.food)) out.push(violLine(d, 'food', 'Ăn/mang đồ ăn vào lớp', num(d.food), -(num(d.food) * 2)));
  if (num(d.dressSlipper)) out.push(violLine(d, 'dressSlipper', 'Mang dép lê', num(d.dressSlipper), -(num(d.dressSlipper))));
  if (num(d.dressNoCard)) out.push(violLine(d, 'dressNoCard', 'Không đeo thẻ HS', num(d.dressNoCard), -(num(d.dressNoCard))));
  if (num(d.dressNoBadge)) out.push(violLine(d, 'dressNoBadge', 'Không đeo huy hiệu đoàn', num(d.dressNoBadge), -(num(d.dressNoBadge))));
  if (num(d.dressHair)) out.push(violLine(d, 'dressHair', 'Nhuộm tóc', num(d.dressHair), -(num(d.dressHair))));
  if (num(d.dressEarring)) out.push(violLine(d, 'dressEarring', 'Đeo bông tai (Nam)', num(d.dressEarring), -(num(d.dressEarring))));
  if (num(d.dress)) out.push(violLine(d, 'dress', 'Mang dép lê, không đeo thẻ', num(d.dress), -(num(d.dress))));
  if (d.skip) out.push(violLine(d, 'skip', 'Bỏ tiết', d.skip, -(d.skip * 5)));
  if (num(d.dishonestLie)) out.push(violLine(d, 'dishonestLie', 'Không trung thực', num(d.dishonestLie), -(num(d.dishonestLie) * 5)));
  if (num(d.dishonestSwear)) out.push(violLine(d, 'dishonestSwear', 'Nói tục, chửi thề', num(d.dishonestSwear), -(num(d.dishonestSwear) * 5)));
  if (num(d.dishonest)) out.push(violLine(d, 'dishonest', 'Không trung thực, nói tục', num(d.dishonest), -(num(d.dishonest) * 5)));
  if (num(d.parkingWrong)) out.push(violLine(d, 'parkingWrong', 'Để xe sai quy định', num(d.parkingWrong), -(num(d.parkingWrong) * 5)));
  if (num(d.parkingRev)) out.push(violLine(d, 'parkingRev', 'Nẹt bô', num(d.parkingRev), -(num(d.parkingRev) * 5)));
  if (num(d.parking)) out.push(violLine(d, 'parking', 'Để xe sai quy định, nẹt bô', num(d.parking), -(num(d.parking) * 5)));
  if (d.phone) out.push(violLine(d, 'phone', 'Dùng điện thoại trong giờ học', d.phone, -(d.phone * 10)));
  if (num(d.trafficHelmet)) out.push(violLine(d, 'trafficHelmet', 'Không đội mũ bảo hiểm', num(d.trafficHelmet), -(num(d.trafficHelmet) * 10)));
  if (num(d.trafficMirror)) out.push(violLine(d, 'trafficMirror', 'Xe không có gương chiếu hậu', num(d.trafficMirror), -(num(d.trafficMirror) * 10)));
  if (num(d.trafficThree)) out.push(violLine(d, 'trafficThree', 'Chở ba', num(d.trafficThree), -(num(d.trafficThree) * 10)));
  if (num(d.traffic)) out.push(violLine(d, 'traffic', 'Vi phạm ATGT', num(d.traffic), -(num(d.traffic) * 10)));
  if (num(d.fightHit)) out.push(violLine(d, 'fightHit', 'Đánh nhau', num(d.fightHit), -(num(d.fightHit) * 20)));
  if (num(d.fightRude)) out.push(violLine(d, 'fightRude', 'Vô lễ với GV', num(d.fightRude), -(num(d.fightRude) * 20)));
  if (num(d.fightExplosive)) out.push(violLine(d, 'fightExplosive', 'Tàng trữ, sử dụng chất gây nổ', num(d.fightExplosive), -(num(d.fightExplosive) * 20)));
  if (num(d.fightDrug)) out.push(violLine(d, 'fightDrug', 'Sử dụng thuốc lá, chất gây nghiện', num(d.fightDrug), -(num(d.fightDrug) * 20)));
  if (num(d.fight)) out.push(violLine(d, 'fight', 'Đánh nhau, vô lễ với GV', num(d.fight), -(num(d.fight) * 20)));
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
  { key: 'trashDesk', label: 'Rác trong hộc bàn' },
  { key: 'lightsLeftOn', label: 'Không tắt điện ra về' },
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
