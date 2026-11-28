// Supabase — đăng nhập dùng chung cho mọi máy + dữ liệu dùng chung.
// Khi chưa cấu hình VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY thì
// isSupabaseConfigured = false và app chạy chế độ cũ (chọn vai trò,
// dữ liệu chỉ lưu trên máy này qua localStorage).
// QUYỀN HẠN: RLS trong supabase/schema.sql + supabase/migration-pro.sql
// (chạy trong Dashboard → SQL Editor) mới là lớp chặn chính: tài khoản
// thường chỉ đọc/sửa được dòng của mình, chỉ admin đọc hết / duyệt /
// xóa tài khoản, chỉ tài khoản đã duyệt mới đọc được dữ liệu chung.
// Việc "ai được làm gì" trong app (chỉ admin duyệt/khóa tài khoản, chỉ
// cờ đỏ nhập lớp của mình...) được kiểm tra thêm ở giao diện và logic
// trong App.tsx. KHÔNG dùng service_role key ở phía trình duyệt.
import { createClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';
import type { AppState, Role, Week, ClassItem, Roster, Score, LogEntry } from './lib';
import { DUTY_CLASSES } from './lib';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = isSupabaseConfigured
  ? createClient(url as string, anonKey as string)
  : null;

export type ProfileStatus = 'pending' | 'active' | 'disabled' | 'rejected';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  status: ProfileStatus;
  reject_reason?: string | null;
  assigned_class_id: string | null;
  assigned_week_id: string | null;
  created_at: string;
}

// Mã phiên hiện tại để gọi điểm AI phía máy chủ (máy chủ tự kiểm tra
// lại vai trò Ban thi đua, trình duyệt không giữ khóa AI).
export async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Profile | null) ?? null;
}

// Tạo hồ sơ cho tài khoản vừa đăng ký / vừa đăng nhập lần đầu.
// Quy tắc khởi tạo: hồ sơ ĐẦU TIÊN từng được tạo sẽ là Ban thi đua
// (role='admin', status='active'). Cờ đỏ xác nhận email xong đăng
// nhập lần đầu là vào được ngay (status='active'); Chỉ xem vẫn chờ
// Ban thi đua duyệt.
export async function ensureProfile(user: User): Promise<Profile> {
  if (!supabase) throw new Error('Chưa cấu hình Supabase.');
  const existing = await fetchProfile(user.id);
  if (existing) return existing;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const requested = meta.requested_role === 'codo' || meta.requested_role === 'viewer'
    ? (meta.requested_role as Role)
    : 'viewer';
  const fullName = typeof meta.full_name === 'string' && meta.full_name.trim()
    ? meta.full_name.trim()
    : (user.email ?? 'Người dùng');
  // Lớp đăng ký (requested_class): tìm id lớp theo tên trong dữ liệu dùng
  // chung để gán sẵn cho hồ sơ, Ban thi đua duyệt là tài khoản hiện ngay
  // "Họ và tên — Lớp ...". Tài khoản mới chưa có hồ sơ nên RLS chưa cho
  // đọc dữ liệu chung: lúc đó tạm lưu "name:10B1", app tự đổi thành id
  // lớp thật khi danh sách lớp tải được (Ban thi đua không phải gán tay).
  let assignedClassId: string | null = null;
  if (typeof meta.requested_class === 'string' && meta.requested_class.trim()) {
    const requestedName = meta.requested_class.trim().toUpperCase();
    try {
      const shared = await fetchSharedState();
      const found = shared.data?.classes.find(c => c.name.toUpperCase() === requestedName);
      if (found) assignedClassId = found.id;
    } catch { /* dữ liệu chưa có / chưa tải được: dùng dạng tên bên dưới */ }
    if (!assignedClassId && DUTY_CLASSES.includes(requestedName)) assignedClassId = `name:${requestedName}`;
  }
  // Đếm xem đã có hồ sơ nào chưa (cần quyền đọc profiles của tài khoản đã đăng nhập).
  const { count, error: countErr } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true });
  if (countErr) throw new Error(countErr.message);
  const isFirst = (count ?? 0) === 0;
  const row = {
    id: user.id,
    email: user.email ?? '',
    full_name: fullName,
    role: isFirst ? ('admin' as Role) : requested,
    status: isFirst || requested === 'codo' ? ('active' as ProfileStatus) : ('pending' as ProfileStatus),
    assigned_class_id: assignedClassId,
    assigned_week_id: null,
  };
  const { data, error } = await supabase
    .from('profiles')
    .insert(row)
    .select('*')
    .single();
  if (error) {
    // Dưới RLS mới, tài khoản thường chỉ thấy dòng của mình nên đếm được 0
    // dù hệ thống đã có hồ sơ khác; lúc đó insert vai trò admin bị chặn
    // (42501) — đăng ký lại như tài khoản chờ duyệt thay vì báo lỗi.
    if (isFirst && ((error as { code?: string }).code === '42501' || /row-level security|permission/i.test(error.message))) {
      const { data: retry, error: retryErr } = await supabase
        .from('profiles')
        .insert({ ...row, role: requested, status: requested === 'codo' ? ('active' as ProfileStatus) : ('pending' as ProfileStatus) })
        .select('*')
        .single();
      if (!retryErr && retry) return retry as Profile;
    }
    // Tranh chấp khi 2 tài khoản đầu đăng ký cùng lúc: đọc lại hồ sơ vừa được tạo.
    const again = await fetchProfile(user.id);
    if (again) return again;
    throw new Error(error.message);
  }
  return data as Profile;
}

export async function listProfiles(): Promise<Profile[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Profile[];
}

export async function deleteProfile(id: string): Promise<void> {
  if (!supabase) throw new Error('Chưa cấu hình Supabase.');
  const { error } = await supabase.from('profiles').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function updateProfile(
  id: string,
  patch: Partial<Pick<Profile, 'role' | 'status' | 'reject_reason' | 'assigned_class_id' | 'assigned_week_id'>>,
): Promise<void> {
  if (!supabase) throw new Error('Chưa cấu hình Supabase.');
  const { error } = await supabase.from('profiles').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export interface SharedRow {
  data: AppState | null;
  updatedAt: string | null;
  version: number | null;
}

// Cột version chỉ có sau khi chạy migration-pro.sql — nhớ lần đầu có
// dùng được không để khỏi hỏi lại mỗi lần (lỗi 42703 = cột chưa có).
let versionSupported: boolean | null = null;

async function fetchBlobState(): Promise<SharedRow> {
  if (!supabase) return { data: null, updatedAt: null, version: null };
  const fields = versionSupported === false ? 'data, updated_at' : 'data, updated_at, version';
  const { data, error } = await supabase
    .from('app_state')
    .select(fields)
    .eq('id', 'main')
    .maybeSingle();
  if (error) {
    // Chưa chạy migration-pro.sql thì cột version chưa có -> đọc lại không có version.
    if (versionSupported !== false && /version/i.test(error.message)) {
      versionSupported = false;
      return fetchBlobState();
    }
    throw new Error(error.message);
  }
  if (versionSupported === null) versionSupported = true;
  if (!data) return { data: null, updatedAt: null, version: null };
  const parsed = (data as unknown as Record<string, unknown>).data as AppState;
  // Dòng remote có nhưng sai định dạng -> lỗi rõ ràng, KHÔNG coi là "chưa có dữ liệu"
  // (coi là chưa có thì app sẽ đẩy dữ liệu local lên và ghi đè mất dữ liệu chung).
  if (!parsed || !parsed.settings || !Array.isArray(parsed.weeks)) {
    throw new Error('Dữ liệu chung bị lỗi định dạng, chưa ghi đè — liên hệ Ban thi đua kiểm tra lại Supabase.');
  }
  return { data: parsed, updatedAt: (data as unknown as Record<string, unknown>).updated_at as string ?? null, version: (data as unknown as Record<string, unknown>).version as number ?? null };
}

export interface SaveResult { updatedAt: string | null; version: number | null; conflict: boolean; }

// Ghi toàn bộ AppState lên Supabase (1 dòng id='main').
// Ghi có điều kiện: chỉ ghi khi version (hoặc updated_at, nếu chưa có cột
// version) trên máy chủ vẫn đúng như lúc mình tải — nếu máy khác đã lưu
// mới hơn thì trả về conflict: true, KHÔNG ghi đè. Lần ghi đầu (chưa có
// dòng) hoặc ghi đè có xác nhận (force) thì lấy lại bản mới nhất rồi ghi.
async function saveBlobState(
  state: AppState,
  updatedBy: string,
  opts: { expectedUpdatedAt?: string | null; expectedVersion?: number | null; force?: boolean } = {},
): Promise<SaveResult> {
  if (!supabase) return { updatedAt: null, version: null, conflict: false };
  const { expectedUpdatedAt = null, expectedVersion = null, force = false } = opts;
  if (force) {
    const cur = await fetchBlobState();
    if (!cur.data) return upsertShared(state, updatedBy, 1);
    return saveBlobState(state, updatedBy, { expectedUpdatedAt: cur.updatedAt, expectedVersion: cur.version });
  }
  if (!expectedUpdatedAt && expectedVersion === null) return upsertShared(state, updatedBy, 1);
  const patch: Record<string, unknown> = { data: state, updated_by: updatedBy };
  if (versionSupported !== false && expectedVersion !== null) patch.version = expectedVersion + 1;
  let q = supabase.from('app_state').update(patch).eq('id', 'main');
  if (versionSupported !== false && expectedVersion !== null) q = q.eq('version', expectedVersion);
  else q = q.eq('updated_at', expectedUpdatedAt as string);
  const { data, error } = await q.select(versionSupported === false ? 'updated_at' : 'updated_at, version').maybeSingle();
  if (error) {
    if (versionSupported !== false && /version/i.test(error.message)) {
      versionSupported = false;
      return saveBlobState(state, updatedBy, opts);
    }
    throw new Error(error.message);
  }
  if (!data) return { updatedAt: null, version: null, conflict: true };
  return { updatedAt: (data as unknown as Record<string, unknown>).updated_at as string ?? null, version: (data as unknown as Record<string, unknown>).version as number ?? null, conflict: false };
}

async function upsertShared(state: AppState, updatedBy: string, version: number): Promise<SaveResult> {
  if (!supabase) return { updatedAt: null, version: null, conflict: false };
  const row: Record<string, unknown> = { id: 'main', data: state, updated_by: updatedBy };
  if (versionSupported !== false) row.version = version;
  const { data, error } = await supabase.from('app_state').upsert(row).select(versionSupported === false ? 'updated_at' : 'updated_at, version').single();
  if (error) {
    if (versionSupported !== false && /version/i.test(error.message)) {
      versionSupported = false;
      return upsertShared(state, updatedBy, version);
    }
    throw new Error(error.message);
  }
  return { updatedAt: (data as unknown as Record<string, unknown> | null)?.updated_at as string ?? null, version: (data as unknown as Record<string, unknown> | null)?.version as number ?? null, conflict: false };
}

// --- Bảng riêng (migration-split.sql, split-1) ---
// Khi bảng settings đã có dữ liệu, app đọc/ghi theo từng bảng
// (weeks/classes/roster/scores/logs/settings) với kiểm tra version
// từng dòng để hai máy sửa hai phiếu khác nhau không xung đột nhau.
// app_state vẫn được ghi kèm làm bản sao lưu (lịch sử khôi phục).
// Chưa chạy migration-split.sql thì tự dùng app_state như cũ.
let tablesMode: boolean | null = null;
let baseState: AppState | null = null;
let baseVersions = new Map<string, number>();
let baseSorts = new Map<string, number>();
let baseUpdatedAt: string | null = null;

type Row = Record<string, unknown>;
function canon(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v as object).sort().map(k => JSON.stringify(k) + ':' + canon((v as Row)[k])).join(',') + '}';
  return JSON.stringify(v) ?? 'null';
}
function deepCopy<T>(v: T): T { return JSON.parse(JSON.stringify(v)) as T; }
function isMissingTable(error: { code?: string; message: string }): boolean {
  return error.code === 'PGRST205' || error.code === '42P01' || /could not find the table|does not exist|schema cache/i.test(error.message);
}
function sStr(v: unknown): string { return typeof v === 'string' ? v : ''; }
function sOpt(v: unknown): string | undefined { return typeof v === 'string' ? v : undefined; }

function toWeek(r: Row): Week {
  const w: Week = { id: sStr(r.id), label: sStr(r.label), dateRange: sStr(r.date_range), submittedAt: sOpt(r.submitted_at) ?? null, submittedBy: sOpt(r.submitted_by) ?? null };
  const m = sOpt(r.month); if (m) w.month = m;
  return w;
}
function toClass(r: Row): ClassItem { return { id: sStr(r.id), name: sStr(r.name) }; }
function toRoster(r: Row): Roster { return { id: sStr(r.id), name: sStr(r.name), classId: sStr(r.class_id), weekId: sStr(r.week_id), active: r.active !== false }; }
function toScore(r: Row): Score {
  const s: Score = { id: sStr(r.id), weekId: sStr(r.week_id), classId: sStr(r.class_id), details: (r.details ?? {}) as Score['details'], status: (sStr(r.status) || 'draft') as Score['status'] };
  const rr = sOpt(r.return_reason); if (rr !== undefined) s.returnReason = rr;
  const sb = sOpt(r.submitted_by); if (sb !== undefined) s.submittedBy = sb;
  const sa = sOpt(r.submitted_at); if (sa !== undefined) s.submittedAt = sa;
  const ab = sOpt(r.approved_by); if (ab !== undefined) s.approvedBy = ab;
  const aa = sOpt(r.approved_at); if (aa !== undefined) s.approvedAt = aa;
  const ub = sOpt(r.updated_by); if (ub !== undefined) s.updatedBy = ub;
  const ua = sOpt(r.updated_at_text); if (ua !== undefined) s.updatedAt = ua;
  return s;
}
function toLog(r: Row): LogEntry { return { id: sStr(r.id), time: sStr(r.time), actor: sStr(r.actor), role: sStr(r.role), action: sStr(r.action), detail: sStr(r.detail) }; }

function weekRow(w: Week, sort: number): Row { return { id: w.id, label: w.label, date_range: w.dateRange, month: w.month ?? null, submitted_at: w.submittedAt ?? null, submitted_by: w.submittedBy ?? null, sort_order: sort }; }
function classRow(c: ClassItem, sort: number): Row { return { id: c.id, name: c.name, sort_order: sort }; }
function rosterRow(r: Roster, sort: number): Row { return { id: r.id, name: r.name, class_id: r.classId, week_id: r.weekId, active: r.active, sort_order: sort }; }
function scoreRow(s: Score): Row {
  return { id: s.id, week_id: s.weekId, class_id: s.classId, status: s.status, details: s.details, return_reason: s.returnReason ?? null, submitted_by: s.submittedBy ?? null, submitted_at: s.submittedAt ?? null, approved_by: s.approvedBy ?? null, approved_at: s.approvedAt ?? null, updated_by: s.updatedBy ?? null, updated_at_text: s.updatedAt ?? null };
}
function logRow(l: LogEntry, sort: number): Row { return { id: l.id, time: l.time, actor: l.actor, role: l.role, action: l.action, detail: l.detail, sort_order: sort }; }

interface TablesLoad { state: AppState; updatedAt: string | null; versions: Map<string, number>; sorts: Map<string, number>; }

async function loadTables(): Promise<TablesLoad | null> {
  if (!supabase) return null;
  const s = await supabase.from('settings').select('data, updated_at, version').eq('id', 'main').maybeSingle();
  if (s.error) throw s.error;
  if (!s.data) return null;
  const settingsData = (s.data as Row).data;
  if (!settingsData || typeof settingsData !== 'object') {
    throw new Error('Dữ liệu chung bị lỗi định dạng, chưa ghi đè — liên hệ Ban thi đua kiểm tra lại Supabase.');
  }
  const [w, c, r, sc, l] = await Promise.all([
    supabase.from('weeks').select('*').order('sort_order', { ascending: true }).order('updated_at', { ascending: true }),
    supabase.from('classes').select('*').order('sort_order', { ascending: true }).order('updated_at', { ascending: true }),
    supabase.from('roster').select('*').order('sort_order', { ascending: true }).order('updated_at', { ascending: true }),
    supabase.from('scores').select('*'),
    supabase.from('logs').select('*').order('sort_order', { ascending: false }).limit(300),
  ]);
  for (const q of [w, c, r, sc, l]) if (q.error) throw q.error;
  const versions = new Map<string, number>();
  const sorts = new Map<string, number>();
  let maxUpdated = sStr((s.data as Row).updated_at);
  versions.set('settings:main', Number((s.data as Row).version ?? 1));
  const track = (table: string, rows: Row[]) => {
    for (const row of rows) {
      versions.set(`${table}:${sStr(row.id)}`, Number(row.version ?? 1));
      if (typeof row.sort_order === 'number') sorts.set(`${table}:${sStr(row.id)}`, row.sort_order);
      const ua = sStr(row.updated_at); if (ua > maxUpdated) maxUpdated = ua;
    }
  };
  const wRows = (w.data ?? []) as Row[]; const cRows = (c.data ?? []) as Row[];
  const rRows = (r.data ?? []) as Row[]; const sRows = (sc.data ?? []) as Row[];
  const lRows = ((l.data ?? []) as Row[]).slice().reverse();
  track('weeks', wRows); track('classes', cRows); track('roster', rRows); track('scores', sRows);
  sorts.set('logs:max', lRows.reduce((m, row) => Math.max(m, Number(row.sort_order ?? 0)), 0));
  const state: AppState = {
    settings: settingsData as AppState['settings'],
    weeks: wRows.map(toWeek),
    classes: cRows.map(toClass),
    roster: rRows.map(toRoster),
    scores: sRows.map(toScore),
    logs: lRows.map(toLog),
  };
  if (!state.settings || !Array.isArray(state.weeks)) {
    throw new Error('Dữ liệu chung bị lỗi định dạng, chưa ghi đè — liên hệ Ban thi đua kiểm tra lại Supabase.');
  }
  return { state, updatedAt: maxUpdated || null, versions, sorts };
}

export async function fetchSharedState(): Promise<SharedRow> {
  if (!supabase) return { data: null, updatedAt: null, version: null };
  if (tablesMode === false) return fetchBlobState();
  try {
    const t = await loadTables();
    if (t) {
      tablesMode = true;
      baseState = deepCopy(t.state); baseVersions = t.versions; baseSorts = t.sorts; baseUpdatedAt = t.updatedAt;
      return { data: t.state, updatedAt: t.updatedAt, version: null };
    }
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err && typeof err.message === 'string' && isMissingTable({ code: err.code, message: err.message })) {
      tablesMode = false;
      return fetchBlobState();
    }
    throw e instanceof Error ? e : new Error(err?.message ?? 'Chưa tải được dữ liệu dùng chung từ Supabase.');
  }
  // Bảng riêng đã có nhưng chưa có dữ liệu: nếu app_state còn dữ liệu
  // thì chưa chuyển đổi xong — đọc app_state như cũ.
  const blob = await fetchBlobState();
  if (blob.data) return blob;
  tablesMode = true; baseState = null; baseVersions = new Map(); baseSorts = new Map(); baseUpdatedAt = null;
  return { data: null, updatedAt: null, version: null };
}

function diffById<T extends { id: string }>(base: T[], next: T[]): { inserts: T[]; updates: T[]; deletes: T[] } {
  const baseMap = new Map(base.map(x => [x.id, x]));
  const nextMap = new Map(next.map(x => [x.id, x]));
  const inserts: T[] = []; const updates: T[] = []; const deletes: T[] = [];
  for (const x of next) {
    const b = baseMap.get(x.id);
    if (!b) inserts.push(x);
    else if (canon(b) !== canon(x)) updates.push(x);
  }
  for (const x of base) if (!nextMap.has(x.id)) deletes.push(x);
  return { inserts, updates, deletes };
}

async function dualWriteBlob(state: AppState, updatedBy: string): Promise<void> {
  if (!supabase) return;
  try { await supabase.from('app_state').upsert({ id: 'main', data: state, updated_by: updatedBy }); } catch { /* bản sao lưu: lỗi thì bỏ qua */ }
}

async function insertAllTables(state: AppState, updatedBy: string): Promise<SaveResult> {
  if (!supabase) return { updatedAt: null, version: null, conflict: false };
  const versions = new Map<string, number>();
  const sorts = new Map<string, number>();
  let maxUpdated = '';
  const note = (table: string, rows: Row[] | null) => {
    for (const row of rows ?? []) {
      versions.set(`${table}:${sStr(row.id)}`, Number(row.version ?? 1));
      if (typeof row.sort_order === 'number') sorts.set(`${table}:${sStr(row.id)}`, row.sort_order);
      const ua = sStr(row.updated_at); if (ua > maxUpdated) maxUpdated = ua;
    }
  };
  const sRes = await supabase.from('settings').insert({ id: 'main', data: state.settings }).select('id, updated_at, version');
  if (sRes.error) throw new Error(sRes.error.message);
  note('settings', (sRes.data ?? []) as Row[]);
  const wRes = await supabase.from('weeks').insert(state.weeks.map((w, i) => weekRow(w, i))).select('id, updated_at, version, sort_order');
  if (wRes.error) throw new Error(wRes.error.message);
  note('weeks', (wRes.data ?? []) as Row[]);
  const cRes = await supabase.from('classes').insert(state.classes.map((c, i) => classRow(c, i))).select('id, updated_at, version, sort_order');
  if (cRes.error) throw new Error(cRes.error.message);
  note('classes', (cRes.data ?? []) as Row[]);
  if (state.roster.length) {
    const rRes = await supabase.from('roster').insert(state.roster.map((r, i) => rosterRow(r, i))).select('id, updated_at, version, sort_order');
    if (rRes.error) throw new Error(rRes.error.message);
    note('roster', (rRes.data ?? []) as Row[]);
  }
  if (state.scores.length) {
    const scRes = await supabase.from('scores').insert(state.scores.map(scoreRow)).select('id, updated_at, version');
    if (scRes.error) throw new Error(scRes.error.message);
    note('scores', (scRes.data ?? []) as Row[]);
  }
  if (state.logs.length) {
    const lRes = await supabase.from('logs').insert(state.logs.map((l, i) => logRow(l, i))).select('id');
    if (lRes.error) throw new Error(lRes.error.message);
  }
  sorts.set('logs:max', Math.max(state.logs.length - 1, 0));
  baseState = deepCopy(state); baseVersions = versions; baseSorts = sorts; baseUpdatedAt = maxUpdated || null;
  await dualWriteBlob(state, updatedBy);
  return { updatedAt: baseUpdatedAt, version: null, conflict: false };
}

async function saveTables(state: AppState, updatedBy: string, force: boolean): Promise<SaveResult> {
  if (!supabase) return { updatedAt: null, version: null, conflict: false };
  if (!baseState || force) {
    const cur = await loadTables();
    if (!cur) return insertAllTables(state, updatedBy);
    baseState = cur.state; baseVersions = cur.versions; baseSorts = cur.sorts; baseUpdatedAt = cur.updatedAt;
  }
  const base = baseState;
  const dWeeks = diffById(base.weeks, state.weeks);
  const dClasses = diffById(base.classes, state.classes);
  const dRoster = diffById(base.roster, state.roster);
  const dScores = diffById(base.scores, state.scores);
  const settingsChanged = canon(base.settings) !== canon(state.settings);
  const baseLogIds = new Set(base.logs.map(l => l.id));
  const newLogs = state.logs.filter(l => !baseLogIds.has(l.id));

  if (!force) {
    // Kiểm tra version trước khi ghi: dòng nào máy khác đã sửa thì báo
    // xung đột ngay, chưa ghi gì cả.
    const checks: { table: string; ids: string[] }[] = [
      { table: 'weeks', ids: [...dWeeks.updates, ...dWeeks.deletes].map(x => x.id) },
      { table: 'classes', ids: [...dClasses.updates, ...dClasses.deletes].map(x => x.id) },
      { table: 'roster', ids: [...dRoster.updates, ...dRoster.deletes].map(x => x.id) },
      { table: 'scores', ids: [...dScores.updates, ...dScores.deletes].map(x => x.id) },
    ];
    if (settingsChanged) checks.push({ table: 'settings', ids: ['main'] });
    for (const chk of checks) {
      if (!chk.ids.length) continue;
      const { data, error } = await supabase.from(chk.table).select('id, version').in('id', chk.ids);
      if (error) throw new Error(error.message);
      const remote = new Map(((data ?? []) as Row[]).map(r => [sStr(r.id), Number(r.version ?? 1)]));
      for (const id of chk.ids) {
        if (remote.get(id) !== baseVersions.get(`${chk.table}:${id}`)) return { updatedAt: null, version: null, conflict: true };
      }
    }
    const insertChecks: { table: string; ids: string[] }[] = [
      { table: 'weeks', ids: dWeeks.inserts.map(x => x.id) },
      { table: 'classes', ids: dClasses.inserts.map(x => x.id) },
      { table: 'roster', ids: dRoster.inserts.map(x => x.id) },
      { table: 'scores', ids: dScores.inserts.map(x => x.id) },
    ];
    for (const chk of insertChecks) {
      if (!chk.ids.length) continue;
      const { data, error } = await supabase.from(chk.table).select('id').in('id', chk.ids);
      if (error) throw new Error(error.message);
      if ((data ?? []).length) return { updatedAt: null, version: null, conflict: true };
    }
  }

  let maxUpdated = baseUpdatedAt ?? '';
  const noteRow = (table: string, row: Row) => {
    baseVersions.set(`${table}:${sStr(row.id)}`, Number(row.version ?? 1));
    if (typeof row.sort_order === 'number') baseSorts.set(`${table}:${sStr(row.id)}`, row.sort_order);
    const ua = sStr(row.updated_at); if (ua > maxUpdated) maxUpdated = ua;
  };
  const nextSort = (table: string): number => {
    let m = -1;
    for (const [k, v] of baseSorts) if (k.startsWith(table + ':')) m = Math.max(m, v);
    return m + 1;
  };

  async function applyTable<T extends { id: string }>(
    table: string,
    d: { inserts: T[]; updates: T[] },
    rowOf: (x: T, sort: number) => Row,
    withSort: boolean,
  ): Promise<boolean> {
    if (!supabase) return true;
    const sel = withSort ? 'id, updated_at, version, sort_order' : 'id, updated_at, version';
    if (d.inserts.length) {
      let sort = nextSort(table);
      const rows = d.inserts.map(x => rowOf(x, withSort ? sort++ : 0));
      const { data, error } = await supabase.from(table).insert(rows).select(sel);
      if (error) throw new Error(error.message);
      for (const row of (data ?? []) as unknown as Row[]) noteRow(table, row);
    }
    for (const x of d.updates) {
      const sort = baseSorts.get(`${table}:${x.id}`) ?? 0;
      const row = rowOf(x, sort);
      if (force) {
        const { data, error } = await supabase.from(table).upsert(row).select(sel);
        if (error) throw new Error(error.message);
        for (const r of (data ?? []) as unknown as Row[]) noteRow(table, r);
      } else {
        const { data, error } = await supabase.from(table).update(row).eq('id', x.id).eq('version', baseVersions.get(`${table}:${x.id}`) ?? 1).select(sel).maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return false; // máy khác vừa sửa dòng này
        noteRow(table, data as unknown as Row);
      }
    }
    return true;
  }

  if (settingsChanged) {
    if (force) {
      const { data, error } = await supabase.from('settings').upsert({ id: 'main', data: state.settings }).select('id, updated_at, version');
      if (error) throw new Error(error.message);
      for (const r of (data ?? []) as Row[]) noteRow('settings', r);
    } else {
      const { data, error } = await supabase.from('settings').update({ data: state.settings }).eq('id', 'main').eq('version', baseVersions.get('settings:main') ?? 1).select('id, updated_at, version').maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return { updatedAt: null, version: null, conflict: true };
      noteRow('settings', data as Row);
    }
  }
  if (!(await applyTable('weeks', dWeeks, weekRow, true))) return { updatedAt: null, version: null, conflict: true };
  if (!(await applyTable('classes', dClasses, classRow, true))) return { updatedAt: null, version: null, conflict: true };
  if (!(await applyTable('roster', dRoster, rosterRow, true))) return { updatedAt: null, version: null, conflict: true };
  if (!(await applyTable('scores', dScores, (s) => scoreRow(s), false))) return { updatedAt: null, version: null, conflict: true };

  if (newLogs.length) {
    let sort = (baseSorts.get('logs:max') ?? 0) + 1;
    const rows = newLogs.map(l => logRow(l, sort++));
    const { error } = await supabase.from('logs').insert(rows).select('id');
    if (error) throw new Error(error.message);
    baseSorts.set('logs:max', sort - 1);
  }

  const deleteOrder: { table: string; ids: string[] }[] = [
    { table: 'scores', ids: dScores.deletes.map(x => x.id) },
    { table: 'roster', ids: dRoster.deletes.map(x => x.id) },
    { table: 'weeks', ids: dWeeks.deletes.map(x => x.id) },
    { table: 'classes', ids: dClasses.deletes.map(x => x.id) },
  ];
  for (const del of deleteOrder) {
    for (const id of del.ids) {
      let q = supabase.from(del.table).delete().eq('id', id);
      if (!force) q = q.eq('version', baseVersions.get(`${del.table}:${id}`) ?? 1);
      const { data, error } = await q.select('id');
      if (error) throw new Error(error.message);
      if (!force && !(data ?? []).length) return { updatedAt: null, version: null, conflict: true };
      baseVersions.delete(`${del.table}:${id}`);
      baseSorts.delete(`${del.table}:${id}`);
    }
  }

  baseState = deepCopy(state);
  baseUpdatedAt = maxUpdated || baseUpdatedAt;
  await dualWriteBlob(state, updatedBy);
  return { updatedAt: baseUpdatedAt, version: null, conflict: false };
}

export async function saveSharedState(
  state: AppState,
  updatedBy: string,
  opts: { expectedUpdatedAt?: string | null; expectedVersion?: number | null; force?: boolean } = {},
): Promise<SaveResult> {
  if (!supabase) return { updatedAt: null, version: null, conflict: false };
  if (tablesMode !== true) return saveBlobState(state, updatedBy, opts);
  return saveTables(state, updatedBy, !!opts.force);
}

// --- Lịch sử sao lưu (app_state_history, từ migration-pro.sql) ---
export interface HistoryVersion { id: string; updated_at: string; updated_by: string | null; }

// Liệt kê các bản sao lưu (mới nhất trước). Bảng chưa có (chưa chạy
// migration-pro.sql) thì trả [] để giao diện hiện hướng dẫn chạy SQL thay vì lỗi.
export async function fetchHistory(): Promise<HistoryVersion[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('app_state_history')
    .select('id, updated_at, updated_by')
    .order('updated_at', { ascending: false })
    .limit(30);
  if (error) return [];
  return (data ?? []) as HistoryVersion[];
}

// Lấy dữ liệu của một bản sao lưu để khôi phục. Trả null khi không có/bị lỗi/sai định dạng.
export async function fetchHistoryData(id: string): Promise<AppState | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('app_state_history')
    .select('data')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  const parsed = (data as unknown as Record<string, unknown>).data as AppState;
  if (!parsed || !parsed.settings || !Array.isArray(parsed.weeks)) return null;
  return parsed;
}
