// Supabase — đăng nhập dùng chung cho mọi máy + dữ liệu dùng chung.
// Khi chưa cấu hình VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY thì
// isSupabaseConfigured = false và app chạy chế độ cũ (chọn vai trò,
// dữ liệu chỉ lưu trên máy này qua localStorage).
// QUYỀN HẠN: RLS trong supabase/schema.sql cho phép tài khoản đã đăng
// nhập đọc/ghi bảng app_state và đọc/cập nhật profiles; việc "ai được
// làm gì" (chỉ admin duyệt/khóa tài khoản, chỉ cờ đỏ nhập lớp của mình...)
// được kiểm tra ở giao diện và logic trong App.tsx, không dựa vào RLS.
import { createClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';
import type { AppState, Role } from './lib';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = isSupabaseConfigured
  ? createClient(url as string, anonKey as string)
  : null;

export type ProfileStatus = 'pending' | 'active' | 'disabled';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  status: ProfileStatus;
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
    assigned_class_id: null,
    assigned_week_id: null,
  };
  const { data, error } = await supabase
    .from('profiles')
    .insert(row)
    .select('*')
    .single();
  if (error) {
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

export async function updateProfile(
  id: string,
  patch: Partial<Pick<Profile, 'role' | 'status' | 'assigned_class_id' | 'assigned_week_id'>>,
): Promise<void> {
  if (!supabase) throw new Error('Chưa cấu hình Supabase.');
  const { error } = await supabase.from('profiles').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export interface SharedRow {
  data: AppState | null;
  updatedAt: string | null;
}

export async function fetchSharedState(): Promise<SharedRow> {
  if (!supabase) return { data: null, updatedAt: null };
  const { data, error } = await supabase
    .from('app_state')
    .select('data, updated_at')
    .eq('id', 'main')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { data: null, updatedAt: null };
  const parsed = data.data as AppState;
  if (!parsed || !parsed.settings || !Array.isArray(parsed.weeks)) return { data: null, updatedAt: null };
  return { data: parsed, updatedAt: (data.updated_at as string) ?? null };
}

// Ghi toàn bộ AppState lên Supabase (1 dòng id='main', last-write-wins).
// Trả về updated_at mới của dòng để App so sánh, tránh ghi đè bản mới hơn từ máy khác.
export async function saveSharedState(state: AppState, updatedBy: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('app_state')
    .upsert({ id: 'main', data: state, updated_by: updatedBy })
    .select('updated_at')
    .single();
  if (error) throw new Error(error.message);
  return (data?.updated_at as string) ?? null;
}
