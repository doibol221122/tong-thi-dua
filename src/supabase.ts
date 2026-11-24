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
import type { AppState, Role } from './lib';

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
// (role='admin', status='active'). Mọi tài khoản đăng ký sau đó đều
// là status='pending' với vai trò đã chọn (cờ đỏ / chỉ xem) và phải
// chờ Ban thi đua duyệt mới được vào xem dữ liệu.
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
  // "Họ và tên — Lớp ...". Lớp chưa có trong hệ thống thì để trống, học
  // sinh tự chọn ở màn hình chờ duyệt.
  let assignedClassId: string | null = null;
  if (typeof meta.requested_class === 'string' && meta.requested_class.trim()) {
    try {
      const shared = await fetchSharedState();
      const found = shared.data?.classes.find(c => c.name.toUpperCase() === (meta.requested_class as string).trim().toUpperCase());
      if (found) assignedClassId = found.id;
    } catch { /* dữ liệu chưa có / chưa tải được: để trống, chọn sau */ }
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
    status: isFirst ? ('active' as ProfileStatus) : ('pending' as ProfileStatus),
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
        .insert({ ...row, role: requested, status: 'pending' as ProfileStatus })
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

export async function fetchSharedState(): Promise<SharedRow> {
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
      return fetchSharedState();
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
export async function saveSharedState(
  state: AppState,
  updatedBy: string,
  opts: { expectedUpdatedAt?: string | null; expectedVersion?: number | null; force?: boolean } = {},
): Promise<SaveResult> {
  if (!supabase) return { updatedAt: null, version: null, conflict: false };
  const { expectedUpdatedAt = null, expectedVersion = null, force = false } = opts;
  if (force) {
    const cur = await fetchSharedState();
    if (!cur.data) return upsertShared(state, updatedBy, 1);
    return saveSharedState(state, updatedBy, { expectedUpdatedAt: cur.updatedAt, expectedVersion: cur.version });
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
      return saveSharedState(state, updatedBy, opts);
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
