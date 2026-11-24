// Tạo seed5.json: 5 tuần, 14 lớp, 6 phiếu (dùng cho kiểm thử Playwright local).
import { emptyDetails, defaultSettings } from './lib.mjs';
import { writeFileSync } from 'fs';

const classes = ['10B1', '10B2', '10B3', '10B4', '10B5', '11A1', '11A2', '11A3', '11A4', '12C1', '12C2', '12C3', '12C4', '12C5']
  .map((name, i) => ({ id: 'c' + i, name }));
const weeks = [1, 2, 3, 4, 5].map(n => ({
  id: 'w' + n, label: 'Tuần 0' + n,
  dateRange: `0${n}/11 – 0${n + 1}/11/2026`,
}));
function base(over = {}) {
  const d = emptyDetails();
  d.hoursTot = 25; d.allGood = true; d.goodHigh = 12; d.goodLow = 2; d.names = 'Nguyễn Văn A';
  return { ...d, ...over };
}
function score(id, weekId, classId, status, details, extra = {}) {
  return { id, weekId, classId, details, status, submittedBy: 'Nguyễn Văn A', submittedAt: '24/11/2026 06:00', ...extra };
}
const seed = {
  settings: defaultSettings(),
  weeks, classes, roster: [],
  scores: [
    score('s1', 'w1', 'c0', 'approved', base({ lateLate: 1 }), { approvedBy: 'Ban thi đua', approvedAt: '24/11/2026 06:05' }),
    score('s2', 'w1', 'c1', 'approved', base(), { approvedBy: 'Ban thi đua', approvedAt: '24/11/2026 06:05' }),
    score('s3', 'w5', 'c0', 'approved', base({ dressHair: 2 }), { approvedBy: 'Ban thi đua', approvedAt: '24/11/2026 06:05' }),
    score('s4', 'w5', 'c2', 'submitted', base({ lateLate: 2 })),
    score('s5', 'w5', 'c3', 'submitted', base({ foodEat: 1 })),
    score('s6', 'w5', 'c4', 'returned', base({ dressHair: 1 }), { returnReason: 'Thiếu số liệu giờ Khá.' }),
  ],
  logs: [{ id: 'l1', time: '24/11/2026 06:00', actor: 'Ban thi đua', role: 'Ban thi đua', action: 'Tạo tuần', detail: 'Tuần 01' }],
};
writeFileSync('./seed5.json', JSON.stringify(seed, null, 2));
const duty = JSON.parse(JSON.stringify(seed));
duty.roster = [{ id: 'r1', name: 'Nguyễn Văn A', classId: 'c4', weekId: 'w5', active: true }];
writeFileSync('./seed-duty.json', JSON.stringify(duty, null, 2));
console.log('seed5.json + seed-duty.json written');
