// src/lib.ts
var uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
var nowStr = () => (/* @__PURE__ */ new Date()).toLocaleString("vi-VN");
var TU_NHIEN = /* @__PURE__ */ new Set(["10B1", "10B2", "11A1", "11A2", "12C1", "12C2"]);
var XA_HOI = /* @__PURE__ */ new Set(["10B3", "10B4", "10B5", "11A3", "11A4", "12C3", "12C4", "12C5"]);
function classGroup(name) {
  const n = name.trim().toUpperCase().replace(/\s+/g, "");
  if (TU_NHIEN.has(n)) return "tu-nhien";
  if (XA_HOI.has(n)) return "xa-hoi";
  return null;
}
function groupLabel(g) {
  return g === "tu-nhien" ? "Kh\u1ED1i t\u1EF1 nhi\xEAn" : "Kh\u1ED1i x\xE3 h\u1ED9i";
}
function weekNumberOf(w, fallback) {
  const m = w.label.match(/(\d+)/);
  const n = m ? Number(m[1]) : fallback;
  return n > 0 ? n : fallback;
}
function monthBlockOf(w, fallback) {
  return Math.floor((weekNumberOf(w, fallback) - 1) / 4);
}
function monthOfBlock(b) {
  return (8 + b) % 12 + 1;
}
function monthLabel(b) {
  return `Th\xE1ng ${monthOfBlock(b)}`;
}
var DUTY_GROUP_A = ["10B1", "10B2", "10B3", "10B4", "10B5"];
var DUTY_GROUP_B = ["11A1", "11A2", "11A3", "11A4", "12C1", "12C2", "12C3", "12C4", "12C5"];
var DUTY_CLASSES = [...DUTY_GROUP_A, ...DUTY_GROUP_B];
var DUTY_WEEKS = 17;
function dutyMonitored(homeClass, weekNo) {
  const name = homeClass.trim().toUpperCase();
  for (const [group, cycle] of [[DUTY_GROUP_A, 4], [DUTY_GROUP_B, 8]]) {
    const i = group.indexOf(name);
    if (i >= 0) {
      const shift = (weekNo - 1) % cycle + 1;
      return group[(i - shift + group.length) % group.length];
    }
  }
  return null;
}
function gateDuty(weekNo) {
  return {
    sang: DUTY_GROUP_B[(weekNo - 1) % DUTY_GROUP_B.length],
    chieu: DUTY_GROUP_A[(weekNo - 1) % 4]
  };
}
function clsOf(avg) {
  return avg >= 80 ? "A" : avg >= 65 ? "B" : avg >= 50 ? "C" : "D";
}
function classAvg(state, classId, weekIds) {
  const list = state.scores.filter((s) => s.classId === classId && s.status === "approved" && weekIds.includes(s.weekId));
  if (!list.length) return null;
  return list.reduce((a, s) => a + calcScore(s.details).final, 0) / list.length;
}
function emptyDetails() {
  return {
    hoursTot: 0,
    hoursKha: 0,
    hoursTb: 0,
    hoursYeu: 0,
    allGood: false,
    goodHigh: 0,
    goodLow: 0,
    cheating: 0,
    absentPermit: 0,
    absentNoPermit: 0,
    noAbsLate: false,
    noisy: 0,
    lateDuty: 0,
    dirty: 0,
    skip: 0,
    phone: 0,
    studyNoLearn: 0,
    studyNoPrepare: 0,
    studyNoMaterial: 0,
    lateLate: 0,
    lateOut: 0,
    workPrivate: 0,
    workNotSerious: 0,
    workSleep: 0,
    foodEat: 0,
    foodPhone: 0,
    dressSlipper: 0,
    dressNoCard: 0,
    dressNoBadge: 0,
    dressHair: 0,
    dressEarring: 0,
    dishonestLie: 0,
    dishonestSwear: 0,
    parkingWrong: 0,
    parkingRev: 0,
    trafficHelmet: 0,
    trafficMirror: 0,
    trafficThree: 0,
    fightHit: 0,
    fightRude: 0,
    fightExplosive: 0,
    fightDrug: 0,
    studyViol: 0,
    late: 0,
    privateWork: 0,
    food: 0,
    dress: 0,
    dishonest: 0,
    parking: 0,
    traffic: 0,
    fight: 0,
    bonusYouth: 0,
    bonusSweep: 0,
    bonusNtvt: 0,
    extraPlus: [],
    extraMinus: [],
    names: "",
    opinionClass: "",
    opinionCodo: ""
  };
}
function defaultSettings() {
  return {
    school: "TR\u01AF\u1EDCNG THPT H\xD9NG V\u01AF\u01A0NG - QU\u1EA2NG PH\xDA",
    dept: "BAN THI \u0110UA",
    docNo: "04/T\u0110-HV",
    signer: "Tr\u1EA7n Th\u1ECB H\u01B0\u01A1ng",
    signerTitle: "PH\u1EE4 TR\xC1CH THI \u0110UA",
    generalPros: "",
    generalCons: ""
  };
}
function emptyState() {
  return { settings: defaultSettings(), weeks: [], classes: [], roster: [], scores: [], logs: [] };
}
function absentTotalOf(d) {
  return num(d.absentPermit) + num(d.absentNoPermit);
}
function violLine(d, key, label, count, points, unit = "l\u01B0\u1EE3t") {
  const names = (d.violNames?.[key] ?? "").trim();
  if (!names) return `${label}: ${count}${unit ? " " + unit : ""} (${points})`;
  const nNames = names.split(",").filter((s) => s.trim()).length;
  const extra = count !== nNames ? ` (${count}${unit ? " " + unit : ""})` : "";
  return `${label}: ${names}${extra} (${points})`;
}
function violLineWaived(d, key, label, count, reason, unit = "l\u01B0\u1EE3t") {
  const names = (d.violNames?.[key] ?? "").trim();
  if (!names) return `${label}: ${count}${unit ? " " + unit : ""} (${reason})`;
  const nNames = names.split(",").filter((s) => s.trim()).length;
  const extra = count !== nNames ? ` (${count}${unit ? " " + unit : ""})` : "";
  return `${label}: ${names}${extra} (${reason})`;
}
function absentNamesSuffix(d) {
  const names = (d.violNames?.["absentNoPermit"] ?? "").trim();
  if (!names || (d.absentNoPermit ?? 0) <= 0) return "";
  return ` \u2014 ${names} (-${(d.absentNoPermit ?? 0) * 5})`;
}
function isNoAbsentLate(d) {
  return d.noAbsLate === true || d.noAbsLate === void 0 && absentTotalOf(d) === 0 && (d.late ?? 0) === 0 && (d.lateLate ?? 0) === 0;
}
function is100Tot(d) {
  return d.allGood === true || d.allGood === void 0 && d.hoursTot > 0 && d.hoursKha === 0 && d.hoursTb === 0 && d.hoursYeu === 0;
}
var extraSum = (list) => (list ?? []).reduce((a, x) => a + Math.max(0, x.points || 0), 0);
var num = (v) => v ?? 0;
function sectionSums(d) {
  return {
    hoursPlus: is100Tot(d) ? 20 : 0,
    hoursMinus: is100Tot(d) ? 0 : d.hoursKha * 1 + d.hoursTb * 3 + d.hoursYeu * 5,
    hocTapPlus: d.goodHigh * 1 + d.bonusYouth * 20 + d.bonusSweep * 10 + d.bonusNtvt * 10,
    hocTapMinus: d.goodLow * 1 + num(d.studyViol) * 1 + num(d.studyNoLearn) * 1 + num(d.studyNoPrepare) * 1 + num(d.studyNoMaterial) * 1 + d.cheating * 10,
    neNepPlus: isNoAbsentLate(d) ? 10 : 0,
    neNepMinus: (isNoAbsentLate(d) ? 0 : d.absentNoPermit * 5 + num(d.late) * 2 + num(d.lateLate) * 2) + num(d.lateOut) * 2 + d.noisy * 5 + num(d.privateWork) * 2 + num(d.workPrivate) * 2 + num(d.workNotSerious) * 2 + num(d.workSleep) * 2 + d.lateDuty * 2 + d.dirty * 5 + num(d.food) * 2 + num(d.foodEat) * 2 + num(d.foodPhone) * 2 + num(d.dress) * 1 + num(d.dressSlipper) * 1 + num(d.dressNoCard) * 1 + num(d.dressNoBadge) * 1 + num(d.dressHair) * 1 + num(d.dressEarring) * 1 + d.skip * 5 + num(d.dishonest) * 5 + num(d.dishonestLie) * 5 + num(d.dishonestSwear) * 5 + num(d.parking) * 5 + num(d.parkingWrong) * 5 + num(d.parkingRev) * 5 + d.phone * 10 + num(d.traffic) * 10 + num(d.trafficHelmet) * 10 + num(d.trafficMirror) * 10 + num(d.trafficThree) * 10 + num(d.fight) * 20 + num(d.fightHit) * 20 + num(d.fightRude) * 20 + num(d.fightExplosive) * 20 + num(d.fightDrug) * 20,
    extraPlus: extraSum(d.extraPlus),
    extraMinus: extraSum(d.extraMinus)
  };
}
function calcScore(d) {
  const sec = sectionSums(d);
  const totalHours = d.hoursTot + d.hoursKha + d.hoursTb + d.hoursYeu;
  const tot100 = is100Tot(d);
  const noAbsentLate = isNoAbsentLate(d);
  const plus = sec.hoursPlus + sec.hocTapPlus + sec.neNepPlus + sec.extraPlus;
  const minus = sec.hoursMinus + sec.hocTapMinus + sec.neNepMinus + sec.extraMinus;
  const final = 100 + plus - minus;
  const cls = final >= 80 ? "A" : final >= 65 ? "B" : final >= 50 ? "C" : "D";
  return { plus, minus, final, cls, totalHours, is100Tot: tot100, noAbsentLate };
}
var NUM_INT_FIELDS = [
  "hoursTot",
  "hoursKha",
  "hoursTb",
  "hoursYeu",
  "goodHigh",
  "goodLow",
  "cheating",
  "absentPermit",
  "absentNoPermit",
  "noisy",
  "lateDuty",
  "dirty",
  "skip",
  "phone",
  "studyNoLearn",
  "studyNoPrepare",
  "studyNoMaterial",
  "lateLate",
  "lateOut",
  "workPrivate",
  "workNotSerious",
  "workSleep",
  "foodEat",
  "foodPhone",
  "dressSlipper",
  "dressNoCard",
  "dressNoBadge",
  "dressHair",
  "dressEarring",
  "dishonestLie",
  "dishonestSwear",
  "parkingWrong",
  "parkingRev",
  "trafficHelmet",
  "trafficMirror",
  "trafficThree",
  "fightHit",
  "fightRude",
  "fightExplosive",
  "fightDrug",
  "studyViol",
  "late",
  "privateWork",
  "food",
  "dress",
  "dishonest",
  "parking",
  "traffic",
  "fight",
  "bonusYouth",
  "bonusSweep",
  "bonusNtvt"
];
var NUM_LABELS = {
  hoursTot: "Gi\u1EDD T\u1ED1t",
  hoursKha: "Gi\u1EDD Kh\xE1",
  hoursTb: "Gi\u1EDD Trung b\xECnh",
  hoursYeu: "Gi\u1EDD Y\u1EBFu",
  goodHigh: "T\u1ED5ng \u0111i\u1EC3m t\u1ED1t (\u22655)",
  goodLow: "T\u1ED5ng \u0111i\u1EC3m t\u1ED1t (<5)",
  cheating: "Gian l\u1EADn trong thi",
  absentPermit: "V\u1EAFng c\xF3 ph\xE9p",
  absentNoPermit: "V\u1EAFng kh\xF4ng ph\xE9p",
  bonusYouth: "C\xF4ng tr\xECnh thanh ni\xEAn",
  bonusSweep: "Qu\xE9t s\xE2n",
  bonusNtvt: "NTVT"
};
function validateDetails(d) {
  const errs = [];
  const labelOf = (k) => NUM_LABELS[k] ?? VIOLATION_FIELDS.find((f) => f.key === k)?.label ?? k;
  for (const k of NUM_INT_FIELDS) {
    const v = d[k];
    if (v === void 0) continue;
    if (typeof v !== "number" || !Number.isFinite(v) || !Number.isInteger(v) || v < 0) {
      errs.push(`${labelOf(k)}: s\u1ED1 li\u1EC7u kh\xF4ng h\u1EE3p l\u1EC7 (ph\u1EA3i l\xE0 s\u1ED1 nguy\xEAn \u2265 0).`);
    }
  }
  const total = d.hoursTot + d.hoursKha + d.hoursTb + d.hoursYeu;
  if (total === 0 && !is100Tot(d)) errs.push("Ch\u01B0a nh\u1EADp gi\u1EDD h\u1ECDc: t\u1ED5ng s\u1ED1 gi\u1EDD \u0111ang b\u1EB1ng 0.");
  for (const k of ["hoursTot", "hoursKha", "hoursTb", "hoursYeu"]) {
    if ((d[k] ?? 0) > 60) errs.push(`${labelOf(k)}: t\u1ED1i \u0111a 60 gi\u1EDD/tu\u1EA7n.`);
  }
  if (total > 60) errs.push("T\u1ED5ng s\u1ED1 gi\u1EDD h\u1ECDc v\u01B0\u1EE3t qu\xE1 60 gi\u1EDD/tu\u1EA7n.");
  for (const f of VIOLATION_FIELDS) {
    const v = d[f.key] ?? 0;
    if (v > 100) errs.push(`${f.label}: t\u1ED1i \u0111a 100 l\u01B0\u1EE3t/tu\u1EA7n.`);
  }
  if ((d.goodLow ?? 0) > 100) errs.push("T\u1ED5ng \u0111i\u1EC3m t\u1ED1t (<5): t\u1ED1i \u0111a 100 \u0111i\u1EC3m/tu\u1EA7n.");
  for (const [key, ten] of [["extraPlus", "C\u1ED9ng kh\xE1c"], ["extraMinus", "Tr\u1EEB kh\xE1c"]]) {
    const list = d[key] ?? [];
    if (list.length > 5) errs.push(`${ten}: t\u1ED1i \u0111a 5 d\xF2ng.`);
    list.forEach((x, i) => {
      if (typeof x.points !== "number" || !Number.isFinite(x.points) || !Number.isInteger(x.points) || x.points < 0) {
        errs.push(`${ten} d\xF2ng ${i + 1}: \u0111i\u1EC3m ph\u1EA3i l\xE0 s\u1ED1 nguy\xEAn \u2265 0.`);
      } else if (x.points !== 0 && !x.note.trim()) {
        errs.push(`${ten} d\xF2ng ${i + 1}: c\xF3 \u0111i\u1EC3m th\xEC c\u1EA7n ghi n\u1ED9i dung.`);
      }
    });
  }
  for (const [key, raw] of Object.entries(d.violNames ?? {})) {
    const names = (raw ?? "").trim();
    if (!names) continue;
    const count = d[key] ?? 0;
    const nNames = names.split(",").filter((s) => s.trim()).length;
    if (count <= 0) errs.push(`${labelOf(key)}: \u0111\xE3 ghi t\xEAn HS nh\u01B0ng s\u1ED1 l\u01B0\u1EE3t \u0111ang l\xE0 0.`);
    else if (nNames > count) errs.push(`${labelOf(key)}: ghi ${nNames} t\xEAn nh\u01B0ng ch\u1EC9 c\xF3 ${count} l\u01B0\u1EE3t.`);
  }
  return errs;
}
function compareAvg(a, b) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}
function classCoverage(state, classId, weekIds) {
  const approved = new Set(state.scores.filter((s) => s.classId === classId && s.status === "approved" && weekIds.includes(s.weekId)).map((s) => s.weekId)).size;
  return { approved, total: weekIds.length };
}
var LEGACY_CLUSTERS = [
  { legacy: "studyViol", split: ["studyNoLearn", "studyNoPrepare", "studyNoMaterial"], label: "Vi ph\u1EA1m h\u1ECDc t\u1EADp" },
  { legacy: "late", split: ["lateLate", "lateOut"], label: "\u0110i mu\u1ED9n / ra ngo\xE0i 15p" },
  { legacy: "privateWork", split: ["workPrivate", "workNotSerious", "workSleep"], label: "L\xE0m vi\u1EC7c ri\xEAng, kh\xF4ng nghi\xEAm t\xFAc, ng\u1EE7 g\u1EE5c" },
  { legacy: "food", split: ["foodEat", "foodPhone"], label: "\u0102n/mang \u0111\u1ED3 \u0103n v\xE0o l\u1EDBp" },
  { legacy: "dress", split: ["dressSlipper", "dressNoCard", "dressNoBadge", "dressHair", "dressEarring"], label: "Trang ph\u1EE5c" },
  { legacy: "dishonest", split: ["dishonestLie", "dishonestSwear"], label: "Kh\xF4ng trung th\u1EF1c, n\xF3i t\u1EE5c" },
  { legacy: "parking", split: ["parkingWrong", "parkingRev"], label: "\u0110\u1EC3 xe sai quy \u0111\u1ECBnh, n\u1EB9t b\xF4" },
  { legacy: "traffic", split: ["trafficHelmet", "trafficMirror", "trafficThree"], label: "Vi ph\u1EA1m ATGT" },
  { legacy: "fight", split: ["fightHit", "fightRude", "fightExplosive", "fightDrug"], label: "\u0110\xE1nh nhau, v\xF4 l\u1EC5 v\u1EDBi GV" }
];
function legacyMixedClusters(d) {
  return LEGACY_CLUSTERS.filter((c) => (d[c.legacy] ?? 0) > 0 && c.split.some((k) => (d[k] ?? 0) > 0)).map((c) => c.label);
}
function dropLegacyWhenSplit(d) {
  const next = { ...d, absentTotal: void 0 };
  for (const c of LEGACY_CLUSTERS) {
    if (c.split.some((k) => (next[k] ?? 0) > 0)) next[c.legacy] = 0;
  }
  return next;
}
function stamp() {
  const p2 = (n) => String(n).padStart(2, "0");
  const t = /* @__PURE__ */ new Date();
  return `${t.getFullYear()}${p2(t.getMonth() + 1)}${p2(t.getDate())}-${p2(t.getHours())}${p2(t.getMinutes())}`;
}
function safeFilename(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").replace(/[^A-Za-z0-9._-]+/g, "_");
}
function detailsShapeError(d) {
  if (typeof d !== "object" || d === null || Array.isArray(d)) return "chi ti\u1EBFt phi\u1EBFu kh\xF4ng ph\u1EA3i l\xE0 m\u1ED9t \u0111\u1ED1i t\u01B0\u1EE3ng";
  const o = d;
  for (const k of NUM_INT_FIELDS) {
    const v = o[k];
    if (v === void 0) continue;
    if (typeof v !== "number" || !Number.isFinite(v) || !Number.isInteger(v) || v < 0) return `chi ti\u1EBFt phi\u1EBFu: tr\u01B0\u1EDDng ${k} ph\u1EA3i l\xE0 s\u1ED1 nguy\xEAn \u2265 0`;
  }
  for (const k of ["allGood", "noAbsLate"]) {
    if (o[k] !== void 0 && typeof o[k] !== "boolean") return `chi ti\u1EBFt phi\u1EBFu: tr\u01B0\u1EDDng ${k} ph\u1EA3i l\xE0 true/false`;
  }
  for (const k of ["extraPlus", "extraMinus"]) {
    const list = o[k];
    if (list === void 0) continue;
    if (!Array.isArray(list)) return `chi ti\u1EBFt phi\u1EBFu: tr\u01B0\u1EDDng ${k} ph\u1EA3i l\xE0 m\u1ED9t m\u1EA3ng`;
    for (const x of list) {
      if (typeof x !== "object" || x === null) return `chi ti\u1EBFt phi\u1EBFu: d\xF2ng ${k} kh\xF4ng \u0111\xFAng \u0111\u1ECBnh d\u1EA1ng`;
      const r = x;
      if (typeof r.points !== "number" || !Number.isFinite(r.points) || !Number.isInteger(r.points) || r.points < 0) return `chi ti\u1EBFt phi\u1EBFu: d\xF2ng ${k} c\xF3 \u0111i\u1EC3m kh\xF4ng ph\u1EA3i s\u1ED1 nguy\xEAn \u2265 0`;
      if (typeof r.note !== "string") return `chi ti\u1EBFt phi\u1EBFu: d\xF2ng ${k} thi\u1EBFu n\u1ED9i dung`;
    }
  }
  if (o.violNames !== void 0) {
    if (typeof o.violNames !== "object" || o.violNames === null || Array.isArray(o.violNames)) return "chi ti\u1EBFt phi\u1EBFu: violNames kh\xF4ng \u0111\xFAng \u0111\u1ECBnh d\u1EA1ng";
    for (const v of Object.values(o.violNames)) {
      if (typeof v !== "string") return "chi ti\u1EBFt phi\u1EBFu: t\xEAn HS vi ph\u1EA1m ph\u1EA3i l\xE0 chu\u1ED7i";
    }
  }
  for (const k of ["names", "opinionClass", "opinionCodo"]) {
    if (o[k] !== void 0 && typeof o[k] !== "string") return `chi ti\u1EBFt phi\u1EBFu: tr\u01B0\u1EDDng ${k} ph\u1EA3i l\xE0 chu\u1ED7i`;
  }
  if (o.absentTotal !== void 0 && typeof o.absentTotal !== "number") return "chi ti\u1EBFt phi\u1EBFu: tr\u01B0\u1EDDng absentTotal ph\u1EA3i l\xE0 s\u1ED1";
  return null;
}
function parseVnTime(s) {
  if (!s) return 0;
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return 0;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0)).getTime();
}
var isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
var isStr = (v) => typeof v === "string";
function validateImportedState(p) {
  const fail = (error) => ({ ok: false, error });
  if (!isObj(p)) return fail("File kh\xF4ng ph\u1EA3i l\xE0 m\u1ED9t \u0111\u1ED1i t\u01B0\u1EE3ng JSON.");
  const s = p.settings;
  if (!isObj(s)) return fail("Thi\u1EBFu m\u1EE5c settings.");
  for (const k of ["school", "dept", "docNo", "signer", "signerTitle"]) {
    if (!isStr(s[k])) return fail(`settings: thi\u1EBFu tr\u01B0\u1EDDng ${k}.`);
  }
  for (const k of ["generalPros", "generalCons"]) {
    if (s[k] !== void 0 && !isStr(s[k])) return fail(`settings: tr\u01B0\u1EDDng ${k} ph\u1EA3i l\xE0 chu\u1ED7i.`);
  }
  for (const k of ["weeks", "classes", "roster", "scores", "logs"]) {
    if (!Array.isArray(p[k])) return fail(`Thi\u1EBFu m\u1EE5c ${k} (ph\u1EA3i l\xE0 m\u1ED9t m\u1EA3ng).`);
  }
  const weeks = p.weeks;
  const classes = p.classes;
  const roster = p.roster;
  const scores = p.scores;
  const logs = p.logs;
  const seenIds = (arr, label) => {
    const ids = /* @__PURE__ */ new Set();
    for (const x of arr) {
      if (!isObj(x) || !isStr(x.id) || !x.id.trim()) return `${label}: c\xF3 m\u1EE5c thi\u1EBFu id.`;
      if (ids.has(x.id)) return `${label}: tr\xF9ng id ${x.id}.`;
      ids.add(x.id);
    }
    return null;
  };
  for (const [arr, label] of [[weeks, "weeks"], [classes, "classes"], [roster, "roster"], [scores, "scores"], [logs, "logs"]]) {
    const e = seenIds(arr, label);
    if (e) return fail(e);
  }
  const weekIds = new Set(weeks.map((x) => x.id));
  const classIds = new Set(classes.map((x) => x.id));
  for (const x of weeks) {
    const w = x;
    if (!isStr(w.label)) return fail(`weeks: tu\u1EA7n ${String(w.id)} thi\u1EBFu label.`);
    if (w.dateRange !== void 0 && !isStr(w.dateRange)) return fail(`weeks: tu\u1EA7n ${String(w.id)} c\xF3 dateRange kh\xF4ng ph\u1EA3i chu\u1ED7i.`);
  }
  for (const x of classes) {
    const c = x;
    if (!isStr(c.name) || !c.name.trim()) return fail(`classes: l\u1EDBp ${String(c.id)} thi\u1EBFu t\xEAn.`);
  }
  for (const x of roster) {
    const r = x;
    if (!isStr(r.name) || !isStr(r.classId) || !isStr(r.weekId)) return fail(`roster: m\u1EE5c ${String(r.id)} thi\u1EBFu t\xEAn/l\u1EDBp/tu\u1EA7n.`);
    if (r.active !== void 0 && typeof r.active !== "boolean") return fail(`roster: m\u1EE5c ${String(r.id)} c\xF3 active kh\xF4ng ph\u1EA3i true/false.`);
    if (!classIds.has(r.classId)) return fail(`roster: ${String(r.name)} tr\u1ECF t\u1EDBi l\u1EDBp kh\xF4ng t\u1ED3n t\u1EA1i (${String(r.classId)}).`);
    if (!weekIds.has(r.weekId)) return fail(`roster: ${String(r.name)} tr\u1ECF t\u1EDBi tu\u1EA7n kh\xF4ng t\u1ED3n t\u1EA1i (${String(r.weekId)}).`);
  }
  for (const x of scores) {
    const sc = x;
    if (!isStr(sc.weekId) || !isStr(sc.classId)) return fail(`scores: phi\u1EBFu ${String(sc.id)} thi\u1EBFu tu\u1EA7n/l\u1EDBp.`);
    if (!weekIds.has(sc.weekId)) return fail(`scores: phi\u1EBFu ${String(sc.id)} tr\u1ECF t\u1EDBi tu\u1EA7n kh\xF4ng t\u1ED3n t\u1EA1i (${String(sc.weekId)}).`);
    if (!classIds.has(sc.classId)) return fail(`scores: phi\u1EBFu ${String(sc.id)} tr\u1ECF t\u1EDBi l\u1EDBp kh\xF4ng t\u1ED3n t\u1EA1i (${String(sc.classId)}).`);
    if (!["draft", "submitted", "approved", "returned"].includes(String(sc.status))) return fail(`scores: phi\u1EBFu ${String(sc.id)} c\xF3 tr\u1EA1ng th\xE1i kh\xF4ng h\u1EE3p l\u1EC7 (${String(sc.status)}).`);
    const e = detailsShapeError(sc.details);
    if (e) return fail(`scores: phi\u1EBFu ${String(sc.id)} \u2014 ${e}.`);
  }
  for (const x of logs) {
    const l = x;
    for (const k of ["time", "actor", "role", "action"]) {
      if (!isStr(l[k])) return fail(`logs: m\u1EE5c ${String(l.id)} thi\u1EBFu tr\u01B0\u1EDDng ${k}.`);
    }
    if (l.detail !== void 0 && !isStr(l.detail)) return fail(`logs: m\u1EE5c ${String(l.id)} c\xF3 detail kh\xF4ng ph\u1EA3i chu\u1ED7i.`);
  }
  const byKey = /* @__PURE__ */ new Map();
  for (const x of scores) {
    const sc = x;
    const key = `${String(sc.classId)}|${String(sc.weekId)}`;
    const prev = byKey.get(key);
    if (!prev || parseVnTime(String(sc.updatedAt ?? "")) >= parseVnTime(String(prev.updatedAt ?? ""))) byKey.set(key, sc);
  }
  const state = p;
  return {
    ok: true,
    state: {
      settings: state.settings,
      weeks: state.weeks.map((w) => ({ ...w, dateRange: w.dateRange ?? "" })),
      classes: state.classes,
      roster: state.roster.map((r) => ({ ...r, active: r.active !== false })),
      scores: [...byKey.values()],
      logs: state.logs
    }
  };
}
function hocTapLines(d) {
  const out = [];
  const total = d.hoursTot + d.hoursKha + d.hoursTb + d.hoursYeu;
  if (is100Tot(d)) {
    out.push(`Gi\u1EDD t\u1ED1t: 100% t\u1ED1t (+20\u0111)`);
    const parts = [];
    if (d.hoursKha) parts.push(`${d.hoursKha} kh\xE1`);
    if (d.hoursTb) parts.push(`${d.hoursTb} trung b\xECnh`);
    if (d.hoursYeu) parts.push(`${d.hoursYeu} y\u1EBFu`);
    if (parts.length) out.push(`Gi\u1EDD Kh\xE1/Trung b\xECnh/Y\u1EBFu: ${parts.join(", ")} (\u0111\xE3 mi\u1EC5n v\xEC t\xEDch 100% gi\u1EDD T\u1ED1t)`);
  } else if (total > 0) {
    const minus = d.hoursKha * 1 + d.hoursTb * 3 + d.hoursYeu * 5;
    out.push(`Gi\u1EDD t\u1ED1t: ${d.hoursTot} t\u1ED1t, ${d.hoursKha} kh\xE1${d.hoursTb ? `, ${d.hoursTb} trung b\xECnh` : ""}${d.hoursYeu ? `, ${d.hoursYeu} y\u1EBFu` : ""}${minus ? ` (-${minus}\u0111)` : ""}`);
  }
  if (d.goodHigh) out.push(`\u0110i\u1EC3m t\u1ED1t (\u22655): ${d.goodHigh} (+${d.goodHigh}\u0111)`);
  if (d.goodLow) out.push(violLine(d, "goodLow", "\u0110i\u1EC3m d\u01B0\u1EDBi 5", d.goodLow, -d.goodLow, ""));
  if (num(d.studyNoLearn)) out.push(violLine(d, "studyNoLearn", "Kh\xF4ng h\u1ECDc b\xE0i", num(d.studyNoLearn), -num(d.studyNoLearn)));
  if (num(d.studyNoPrepare)) out.push(violLine(d, "studyNoPrepare", "Kh\xF4ng so\u1EA1n b\xE0i", num(d.studyNoPrepare), -num(d.studyNoPrepare)));
  if (num(d.studyNoMaterial)) out.push(violLine(d, "studyNoMaterial", "Kh\xF4ng mang t\xE0i li\u1EC7u, \u0111\u1ED3 d\xF9ng h\u1ECDc t\u1EADp", num(d.studyNoMaterial), -num(d.studyNoMaterial)));
  if (num(d.studyViol)) out.push(violLine(d, "studyViol", "Vi ph\u1EA1m h\u1ECDc t\u1EADp", num(d.studyViol), -num(d.studyViol)));
  if (d.cheating) out.push(violLine(d, "cheating", "Gian l\u1EADn trong thi", d.cheating, -(d.cheating * 10)));
  if (d.bonusYouth) out.push(`C\xF4ng tr\xECnh thanh ni\xEAn: +${d.bonusYouth * 20}\u0111`);
  if (d.bonusSweep) out.push(`Qu\xE9t s\xE2n: +${d.bonusSweep * 10}\u0111`);
  if (d.bonusNtvt) out.push(`NTVT: +${d.bonusNtvt * 10}\u0111`);
  (d.extraPlus ?? []).filter((x) => x.points > 0 || x.note.trim()).forEach((x) => out.push(`${x.note.trim() || "C\u1ED9ng kh\xE1c"}: +${Math.max(0, x.points || 0)}\u0111`));
  return out.length ? out : ["\u2014"];
}
function neNepLines(d) {
  const out = [];
  if (isNoAbsentLate(d)) {
    out.push("Kh\xF4ng v\u1EAFng, kh\xF4ng \u0111i mu\u1ED9n: +10\u0111");
    if (absentTotalOf(d) > 0) {
      if (d.absentNoPermit > 0) {
        const names = (d.violNames?.["absentNoPermit"] ?? "").trim();
        out.push(`V\u1EAFng: ${absentTotalOf(d)} (${d.absentPermit}p, ${d.absentNoPermit}Kp)${names ? ` \u2014 ${names}` : ""} (\u0111\xE3 mi\u1EC5n v\xEC t\xEDch 100% kh\xF4ng v\u1EAFng)`);
      } else {
        out.push(`V\u1EAFng: ${absentTotalOf(d)} (${d.absentPermit}p, 0Kp)`);
      }
    }
    if (num(d.lateLate)) out.push(violLineWaived(d, "lateLate", "\u0110i mu\u1ED9n", num(d.lateLate), "\u0111\xE3 mi\u1EC5n v\xEC t\xEDch 100% kh\xF4ng v\u1EAFng"));
    if (num(d.late)) out.push(violLineWaived(d, "late", "\u0110i mu\u1ED9n, sinh ho\u1EA1t 15p t\u1EF1 \xFD ra ngo\xE0i", num(d.late), "\u0111\xE3 mi\u1EC5n v\xEC t\xEDch 100% kh\xF4ng v\u1EAFng"));
  } else if (absentTotalOf(d)) out.push(`V\u1EAFng: ${absentTotalOf(d)} (${d.absentPermit}p, ${d.absentNoPermit}Kp)${absentNamesSuffix(d)}`);
  if (!isNoAbsentLate(d) && num(d.lateLate)) out.push(violLine(d, "lateLate", "\u0110i mu\u1ED9n", num(d.lateLate), -(num(d.lateLate) * 2)));
  if (num(d.lateOut)) out.push(violLine(d, "lateOut", "T\u1EF1 \xFD ra ngo\xE0i trong sinh ho\u1EA1t 15p", num(d.lateOut), -(num(d.lateOut) * 2)));
  if (!isNoAbsentLate(d) && num(d.late)) out.push(violLine(d, "late", "\u0110i mu\u1ED9n, sinh ho\u1EA1t 15p t\u1EF1 \xFD ra ngo\xE0i", num(d.late), -(num(d.late) * 2)));
  if (d.noisy) out.push(violLine(d, "noisy", "L\u1EDBp \u1ED3n trong sinh ho\u1EA1t 15p", d.noisy, -(d.noisy * 5)));
  if (num(d.workPrivate)) out.push(violLine(d, "workPrivate", "L\xE0m vi\u1EC7c ri\xEAng", num(d.workPrivate), -(num(d.workPrivate) * 2)));
  if (num(d.workNotSerious)) out.push(violLine(d, "workNotSerious", "Kh\xF4ng nghi\xEAm t\xFAc", num(d.workNotSerious), -(num(d.workNotSerious) * 2)));
  if (num(d.workSleep)) out.push(violLine(d, "workSleep", "Ng\u1EE7 g\u1EE5c", num(d.workSleep), -(num(d.workSleep) * 2)));
  if (num(d.privateWork)) out.push(violLine(d, "privateWork", "L\xE0m vi\u1EC7c ri\xEAng, kh\xF4ng nghi\xEAm t\xFAc, ng\u1EE7 g\u1EE5c", num(d.privateWork), -(num(d.privateWork) * 2)));
  if (d.lateDuty) out.push(violLine(d, "lateDuty", "Tr\u1EF1c nh\u1EADt mu\u1ED9n", d.lateDuty, -(d.lateDuty * 2), "l\u1EA7n"));
  if (d.dirty) out.push(violLine(d, "dirty", "L\u1EDBp b\u1EA9n", d.dirty, -(d.dirty * 5)));
  if (num(d.foodEat)) out.push(violLine(d, "foodEat", "\u0102n/mang \u0111\u1ED3 \u0103n v\xE0o l\u1EDBp", num(d.foodEat), -(num(d.foodEat) * 2)));
  if (num(d.foodPhone)) out.push(violLine(d, "foodPhone", "Kh\xF4ng b\u1ECF \u0111i\u1EC7n tho\u1EA1i v\xE0o t\u1EE7", num(d.foodPhone), -(num(d.foodPhone) * 2)));
  if (num(d.food)) out.push(violLine(d, "food", "\u0102n/mang \u0111\u1ED3 \u0103n v\xE0o l\u1EDBp", num(d.food), -(num(d.food) * 2)));
  if (num(d.dressSlipper)) out.push(violLine(d, "dressSlipper", "Mang d\xE9p l\xEA", num(d.dressSlipper), -num(d.dressSlipper)));
  if (num(d.dressNoCard)) out.push(violLine(d, "dressNoCard", "Kh\xF4ng \u0111eo th\u1EBB HS", num(d.dressNoCard), -num(d.dressNoCard)));
  if (num(d.dressNoBadge)) out.push(violLine(d, "dressNoBadge", "Kh\xF4ng \u0111eo huy hi\u1EC7u \u0111o\xE0n", num(d.dressNoBadge), -num(d.dressNoBadge)));
  if (num(d.dressHair)) out.push(violLine(d, "dressHair", "Nhu\u1ED9m t\xF3c", num(d.dressHair), -num(d.dressHair)));
  if (num(d.dressEarring)) out.push(violLine(d, "dressEarring", "\u0110eo b\xF4ng tai (Nam)", num(d.dressEarring), -num(d.dressEarring)));
  if (num(d.dress)) out.push(violLine(d, "dress", "Mang d\xE9p l\xEA, kh\xF4ng \u0111eo th\u1EBB", num(d.dress), -num(d.dress)));
  if (d.skip) out.push(violLine(d, "skip", "B\u1ECF ti\u1EBFt", d.skip, -(d.skip * 5)));
  if (num(d.dishonestLie)) out.push(violLine(d, "dishonestLie", "Kh\xF4ng trung th\u1EF1c", num(d.dishonestLie), -(num(d.dishonestLie) * 5)));
  if (num(d.dishonestSwear)) out.push(violLine(d, "dishonestSwear", "N\xF3i t\u1EE5c, ch\u1EEDi th\u1EC1", num(d.dishonestSwear), -(num(d.dishonestSwear) * 5)));
  if (num(d.dishonest)) out.push(violLine(d, "dishonest", "Kh\xF4ng trung th\u1EF1c, n\xF3i t\u1EE5c", num(d.dishonest), -(num(d.dishonest) * 5)));
  if (num(d.parkingWrong)) out.push(violLine(d, "parkingWrong", "\u0110\u1EC3 xe sai quy \u0111\u1ECBnh", num(d.parkingWrong), -(num(d.parkingWrong) * 5)));
  if (num(d.parkingRev)) out.push(violLine(d, "parkingRev", "N\u1EB9t b\xF4", num(d.parkingRev), -(num(d.parkingRev) * 5)));
  if (num(d.parking)) out.push(violLine(d, "parking", "\u0110\u1EC3 xe sai quy \u0111\u1ECBnh, n\u1EB9t b\xF4", num(d.parking), -(num(d.parking) * 5)));
  if (d.phone) out.push(violLine(d, "phone", "D\xF9ng \u0111i\u1EC7n tho\u1EA1i trong gi\u1EDD h\u1ECDc", d.phone, -(d.phone * 10)));
  if (num(d.trafficHelmet)) out.push(violLine(d, "trafficHelmet", "Kh\xF4ng \u0111\u1ED9i m\u0169 b\u1EA3o hi\u1EC3m", num(d.trafficHelmet), -(num(d.trafficHelmet) * 10)));
  if (num(d.trafficMirror)) out.push(violLine(d, "trafficMirror", "Xe kh\xF4ng c\xF3 g\u01B0\u01A1ng chi\u1EBFu h\u1EADu", num(d.trafficMirror), -(num(d.trafficMirror) * 10)));
  if (num(d.trafficThree)) out.push(violLine(d, "trafficThree", "Ch\u1EDF ba", num(d.trafficThree), -(num(d.trafficThree) * 10)));
  if (num(d.traffic)) out.push(violLine(d, "traffic", "Vi ph\u1EA1m ATGT", num(d.traffic), -(num(d.traffic) * 10)));
  if (num(d.fightHit)) out.push(violLine(d, "fightHit", "\u0110\xE1nh nhau", num(d.fightHit), -(num(d.fightHit) * 20)));
  if (num(d.fightRude)) out.push(violLine(d, "fightRude", "V\xF4 l\u1EC5 v\u1EDBi GV", num(d.fightRude), -(num(d.fightRude) * 20)));
  if (num(d.fightExplosive)) out.push(violLine(d, "fightExplosive", "T\xE0ng tr\u1EEF, s\u1EED d\u1EE5ng ch\u1EA5t g\xE2y n\u1ED5", num(d.fightExplosive), -(num(d.fightExplosive) * 20)));
  if (num(d.fightDrug)) out.push(violLine(d, "fightDrug", "S\u1EED d\u1EE5ng thu\u1ED1c l\xE1, ch\u1EA5t g\xE2y nghi\u1EC7n", num(d.fightDrug), -(num(d.fightDrug) * 20)));
  if (num(d.fight)) out.push(violLine(d, "fight", "\u0110\xE1nh nhau, v\xF4 l\u1EC5 v\u1EDBi GV", num(d.fight), -(num(d.fight) * 20)));
  (d.extraMinus ?? []).filter((x) => x.points > 0 || x.note.trim()).forEach((x) => out.push(`${x.note.trim() || "Tr\u1EEB kh\xE1c"}: -${Math.max(0, x.points || 0)}\u0111`));
  if (d.names.trim()) out.push(`HS vi ph\u1EA1m: ${d.names.trim()}`);
  return out.length ? out : ["\u2014"];
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1e3);
}
function toCsv(rows) {
  const esc = (s) => `"${s.replace(/"/g, '""')}"`;
  return "\uFEFF" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
}
var VIOLATION_FIELDS = [
  { key: "studyNoLearn", label: "Kh\xF4ng h\u1ECDc b\xE0i" },
  { key: "studyNoPrepare", label: "Kh\xF4ng so\u1EA1n b\xE0i" },
  { key: "studyNoMaterial", label: "Kh\xF4ng mang t\xE0i li\u1EC7u" },
  { key: "cheating", label: "Gian l\u1EADn trong thi" },
  { key: "absentNoPermit", label: "V\u1EAFng kh\xF4ng ph\xE9p" },
  { key: "lateLate", label: "\u0110i mu\u1ED9n" },
  { key: "lateOut", label: "T\u1EF1 \xFD ra ngo\xE0i 15p" },
  { key: "noisy", label: "L\u1EDBp \u1ED3n sinh ho\u1EA1t 15p" },
  { key: "workPrivate", label: "L\xE0m vi\u1EC7c ri\xEAng" },
  { key: "workNotSerious", label: "Kh\xF4ng nghi\xEAm t\xFAc" },
  { key: "workSleep", label: "Ng\u1EE7 g\u1EE5c" },
  { key: "lateDuty", label: "Tr\u1EF1c nh\u1EADt mu\u1ED9n" },
  { key: "dirty", label: "L\u1EDBp b\u1EA9n" },
  { key: "foodEat", label: "\u0102n/mang \u0111\u1ED3 \u0103n v\xE0o l\u1EDBp" },
  { key: "foodPhone", label: "Kh\xF4ng b\u1ECF \u0110T v\xE0o t\u1EE7" },
  { key: "dressSlipper", label: "Mang d\xE9p l\xEA" },
  { key: "dressNoCard", label: "Kh\xF4ng \u0111eo th\u1EBB HS" },
  { key: "dressNoBadge", label: "Kh\xF4ng \u0111eo huy hi\u1EC7u \u0111o\xE0n" },
  { key: "dressHair", label: "Nhu\u1ED9m t\xF3c" },
  { key: "dressEarring", label: "\u0110eo b\xF4ng tai (Nam)" },
  { key: "skip", label: "B\u1ECF ti\u1EBFt" },
  { key: "dishonestLie", label: "Kh\xF4ng trung th\u1EF1c" },
  { key: "dishonestSwear", label: "N\xF3i t\u1EE5c, ch\u1EEDi th\u1EC1" },
  { key: "parkingWrong", label: "\u0110\u1EC3 xe sai quy \u0111\u1ECBnh" },
  { key: "parkingRev", label: "N\u1EB9t b\xF4" },
  { key: "phone", label: "D\xF9ng \u0111i\u1EC7n tho\u1EA1i trong gi\u1EDD" },
  { key: "trafficHelmet", label: "Kh\xF4ng \u0111\u1ED9i m\u0169 b\u1EA3o hi\u1EC3m" },
  { key: "trafficMirror", label: "Xe kh\xF4ng c\xF3 g\u01B0\u01A1ng chi\u1EBFu h\u1EADu" },
  { key: "trafficThree", label: "Ch\u1EDF ba" },
  { key: "fightHit", label: "\u0110\xE1nh nhau" },
  { key: "fightRude", label: "V\xF4 l\u1EC5 v\u1EDBi GV" },
  { key: "fightExplosive", label: "T\xE0ng tr\u1EEF ch\u1EA5t g\xE2y n\u1ED5" },
  { key: "fightDrug", label: "Thu\u1ED1c l\xE1, ch\u1EA5t g\xE2y nghi\u1EC7n" },
  // Phiếu cũ (trường gộp) — vẫn đếm để dashboard không mất số liệu cũ:
  { key: "studyViol", label: "Vi ph\u1EA1m h\u1ECDc t\u1EADp (c\u0169)" },
  { key: "late", label: "\u0110i mu\u1ED9n / ra ngo\xE0i 15p (c\u0169)" },
  { key: "privateWork", label: "L\xE0m vi\u1EC7c ri\xEAng, ng\u1EE7 g\u1EE5c (c\u0169)" },
  { key: "food", label: "\u0102n/mang \u0111\u1ED3 \u0103n v\xE0o l\u1EDBp (c\u0169)" },
  { key: "dress", label: "D\xE9p l\xEA, kh\xF4ng \u0111eo th\u1EBB (c\u0169)" },
  { key: "dishonest", label: "Kh\xF4ng trung th\u1EF1c, n\xF3i t\u1EE5c (c\u0169)" },
  { key: "parking", label: "\u0110\u1EC3 xe sai quy \u0111\u1ECBnh, n\u1EB9t b\xF4 (c\u0169)" },
  { key: "traffic", label: "Vi ph\u1EA1m ATGT (c\u0169)" },
  { key: "fight", label: "\u0110\xE1nh nhau, v\xF4 l\u1EC5 v\u1EDBi GV (c\u0169)" }
];
function violationStats(scores, classes) {
  const perField = /* @__PURE__ */ new Map();
  const perClass = /* @__PURE__ */ new Map();
  let totalCount = 0;
  for (const s of scores) {
    const d = s.details;
    for (const f of VIOLATION_FIELDS) {
      const n = Math.max(0, Number(d[f.key]) || 0);
      if (!n) continue;
      totalCount += n;
      perField.set(f.key, (perField.get(f.key) ?? 0) + n);
      const m = perClass.get(s.classId) ?? /* @__PURE__ */ new Map();
      m.set(f.key, (m.get(f.key) ?? 0) + n);
      perClass.set(s.classId, m);
    }
  }
  const labelOf = (key) => VIOLATION_FIELDS.find((f) => f.key === key)?.label ?? key;
  const topViolations = [...perField.entries()].map(([key, count]) => ({ key, label: labelOf(key), count })).sort((a, b) => b.count - a.count).slice(0, 5);
  const classWarnings = [...perClass.entries()].map(([classId, m]) => {
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    const top = [...m.entries()].map(([key, count]) => ({ key, label: labelOf(key), count })).sort((a, b) => b.count - a.count).slice(0, 2);
    return { classId, name: classes.find((c) => c.id === classId)?.name ?? classId, total, top };
  }).sort((a, b) => b.total - a.total).slice(0, 5);
  return { topViolations, classWarnings, totalCount };
}
export {
  DUTY_CLASSES,
  DUTY_GROUP_A,
  DUTY_GROUP_B,
  DUTY_WEEKS,
  VIOLATION_FIELDS,
  absentNamesSuffix,
  absentTotalOf,
  calcScore,
  classAvg,
  classCoverage,
  classGroup,
  clsOf,
  compareAvg,
  defaultSettings,
  downloadBlob,
  dropLegacyWhenSplit,
  dutyMonitored,
  emptyDetails,
  emptyState,
  gateDuty,
  groupLabel,
  hocTapLines,
  is100Tot,
  isNoAbsentLate,
  legacyMixedClusters,
  monthBlockOf,
  monthLabel,
  monthOfBlock,
  neNepLines,
  nowStr,
  safeFilename,
  sectionSums,
  stamp,
  toCsv,
  uid,
  validateDetails,
  validateImportedState,
  violLine,
  violLineWaived,
  violationStats,
  weekNumberOf
};
