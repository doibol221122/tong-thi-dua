-- Hệ thống Tổng Thi Đua — Supabase schema
-- Chạy file này trong Supabase Dashboard → SQL Editor → New query → Run.
-- Cần chạy TRƯỚC khi nhập VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY vào Vercel.
--
-- LƯU Ý VỀ QUYỀN HẠN:
-- RLS ở đây chỉ chặn người chưa đăng nhập. Tài khoản đã đăng nhập được
-- đọc/ghi bảng app_state và đọc/cập nhật profiles (để Ban thi đua duyệt
-- tài khoản ngay trong app mà không cần service_role key). Việc "ai được
-- làm gì" (chỉ admin duyệt/khóa/đổi vai trò, chỉ cờ đỏ nhập lớp của mình,
-- chỉ xem không được sửa) được kiểm tra ở giao diện và logic trong App.tsx.
-- Vì vậy KHÔNG dùng service_role key ở phía trình duyệt, và đừng chia sẻ
-- link quản trị Supabase cho người không phải Ban thi đua.

-- 1. Bảng hồ sơ tài khoản (1 dòng cho mỗi tài khoản Supabase Auth)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role text not null default 'viewer' check (role in ('admin', 'codo', 'viewer')),
  status text not null default 'pending' check (status in ('pending', 'active', 'disabled')),
  assigned_class_id text,
  assigned_week_id text,
  created_at timestamptz not null default now()
);

-- 2. Bảng dữ liệu dùng chung: 1 dòng id='main' chứa toàn bộ AppState (JSON)
create table if not exists public.app_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- 3. Bật Row Level Security
alter table public.profiles enable row level security;
alter table public.app_state enable row level security;

-- 3b. Cấp quyền bảng cho các role anon/authenticated (bắt buộc:
-- bảng mới tạo trong SQL Editor chưa tự có quyền này, thiếu là
-- PostgREST trả 42501 "permission denied" dù RLS đã đúng).
-- RLS ở mục 4-5 vẫn là lớp chặn chính: chỉ tài khoản đã đăng nhập
-- mới đọc/ghi được dữ liệu.
grant select, insert, update, delete on public.profiles to anon, authenticated;
grant select, insert, update, delete on public.app_state to anon, authenticated;

-- 4. Chính sách cho profiles
-- Tài khoản đã đăng nhập được đọc danh sách hồ sơ (để đếm hồ sơ đầu
-- tiên làm admin, và để Ban thi đua duyệt tài khoản trong tab Quản lý).
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated" on public.profiles
  for select to authenticated using (true);

-- Mỗi người chỉ được tự tạo hồ sơ của chính mình (khi đăng ký / đăng nhập lần đầu).
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

-- Tài khoản đã đăng nhập được cập nhật hồ sơ. App chỉ cho Ban thi đua
-- gọi cập nhật này (duyệt, đổi vai trò, gán lớp/tuần, khóa/mở tài khoản).
drop policy if exists "profiles_update_authenticated" on public.profiles;
create policy "profiles_update_authenticated" on public.profiles
  for update to authenticated using (true) with check (true);

-- Tài khoản đã đăng nhập được xóa hồ sơ. App chỉ cho Ban thi đua
-- gọi xóa này, và không cho xóa tài khoản của chính mình.
-- LƯU Ý: xóa ở đây chỉ gỡ hồ sơ trong bảng profiles, người đó không
-- vào app được nữa; tài khoản đăng nhập (email/mật khẩu) vẫn còn trong
-- Supabase Auth — muốn xóa hẳn thì xóa thêm trong Dashboard →
-- Authentication → Users.
drop policy if exists "profiles_delete_authenticated" on public.profiles;
create policy "profiles_delete_authenticated" on public.profiles
  for delete to authenticated using (true);

-- 5. Chính sách cho app_state (dữ liệu tuần/lớp/phiếu dùng chung)
drop policy if exists "app_state_select_authenticated" on public.app_state;
create policy "app_state_select_authenticated" on public.app_state
  for select to authenticated using (true);

drop policy if exists "app_state_insert_authenticated" on public.app_state;
create policy "app_state_insert_authenticated" on public.app_state
  for insert to authenticated with check (true);

drop policy if exists "app_state_update_authenticated" on public.app_state;
create policy "app_state_update_authenticated" on public.app_state
  for update to authenticated using (true) with check (true);

-- 6. Tự cập nhật updated_at mỗi lần ghi app_state
create or replace function public.set_app_state_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists app_state_updated_at on public.app_state;
create trigger app_state_updated_at
  before update on public.app_state
  for each row execute function public.set_app_state_updated_at();
