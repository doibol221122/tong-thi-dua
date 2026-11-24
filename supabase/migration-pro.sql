-- ============================================================
-- TỔNG THI ĐUA — Migration vận hành chuyên nghiệp
-- Version: pro-1
-- Ngày: 2026-11-24
-- Nguồn yêu cầu: tong-thi-dua-tests/audit-pro.md
--   (P0-01 siết RLS profiles/app_state, P0-02 lịch sử app_state,
--    P1-20 trạng thái "rejected", P1-22 vệ sinh schema)
-- Nền tảng: schema hiện tại ở supabase/schema.sql
--
-- CÁCH CHẠY: Supabase Dashboard → SQL Editor → New query → dán
-- toàn bộ file này → Run. Chạy lại được: mọi lệnh đều có
-- IF NOT EXISTS / DROP ... IF EXISTS / CREATE OR REPLACE /
-- khối DO kiểm tra trước khi thêm ràng buộc.
--
-- NGUYÊN TẮC BẤT DI BẤT DỊCH: không bao giờ dùng service_role key
-- trong app (trình duyệt). Toàn bộ biên an toàn nằm ở RLS + trigger
-- trong file này; anon key trong bundle chỉ làm được những gì các
-- policy dưới đây cho phép.
--
-- HAI ĐIỂM CẦN ĐỌC TRƯỚC KHI CHẠY (ghi chú ở mục 0, mục 3 và mục 8):
--   0. Tài khoản của chính bạn PHẢI là Ban thi đua (admin) trước khi
--      chạy — xem BƯỚC 0 ở ngay dưới (dòng UPDATE đã chú thích sẵn).
--   1. Unique index trên profiles.email sẽ LỖI nếu đã có email trùng
--      — dọn trùng trước rồi mới chạy (xem mục 3).
--   2. Sau migration này, tài khoản pending/disabled KHÔNG đọc được
--      app_state nữa (đúng P1-13) — màn hình chờ duyệt trong app phải
--      lấy danh sách lớp từ hằng số DUTY_CLASSES trong code, nếu không
--      ô chọn lớp sẽ trống (xem mục 8).
-- ============================================================


-- ============================================================
-- 0. BƯỚC 0 — ĐẢM BẢO TÀI KHOẢN CỦA BẠN LÀ ADMIN (ĐỌC TRƯỚC KHI CHẠY)
-- ============================================================
-- Sau khi migration này chạy, chỉ tài khoản Ban thi đua (admin) mới
-- đọc được hết hồ sơ, duyệt/khóa/xóa tài khoản và khôi phục sao lưu.
-- Nếu tài khoản của chính bạn KHÔNG phải admin lúc chạy migration thì
-- bạn sẽ bị khóa ngoài phần quản trị (không tự duyệt được ai, kể cả
-- chính mình). Vì vậy, TRƯỚC KHI CHẠY, mở app và kiểm tra tài khoản
-- của bạn hiện "Ban thi đua" (vai trò admin, đang dùng). Nếu chưa:
--   (a) nhờ một admin khác duyệt/nâng vai trò cho bạn trong app, hoặc
--   (b) bỏ dấu -- ở dòng dưới, điền đúng email của bạn, rồi chạy nó
--       TRƯỚC các mục dưới (chạy riêng trong SQL Editor cũng được).
-- Quy tắc khởi tạo vẫn giữ: hồ sơ ĐẦU TIÊN từng được tạo là admin;
-- và app không bao giờ hạ/khóa/xóa tài khoản admin đang dùng duy nhất
-- (chặn ở cả trigger lẫn giao diện), nên luôn còn ít nhất một admin.
-- update profiles set role = 'admin', status = 'active' where email = '<email-cua-ban>';


-- ============================================================
-- 1. P1-22 — CỘT MỚI
-- ============================================================
-- app_state.version: số nguyên tăng 1 mỗi lần ghi, dùng để so sánh
-- "bản nào mới hơn" thay cho chuỗi timestamp (đi kèm P0-05).
-- Dòng đã có nhận version = 1 nhờ DEFAULT.
alter table public.app_state
  add column if not exists version integer not null default 1;

-- profiles.updated_at: để biết hồ sơ được duyệt/đổi vai trò lần cuối
-- lúc nào; được trigger ở mục 6 tự cập nhật mỗi lần UPDATE.
alter table public.profiles
  add column if not exists updated_at timestamptz not null default now();

-- profiles.reject_reason: lý do Ban thi đua từ chối tài khoản (P1-20);
-- app hiển thị lý do ở màn hình đăng nhập của tài khoản bị từ chối.
alter table public.profiles
  add column if not exists reject_reason text;


-- ============================================================
-- 2. P1-20 — THÊM TRẠNG THÁI 'rejected' CHO profiles.status
-- ============================================================
-- Vấn đề: schema.sql không đặt tên tường minh cho ràng buộc CHECK
-- của cột status (Postgres tự đặt tên, thường là
-- profiles_status_check, nhưng không có gì bảo đảm tên đó trên mọi
-- môi trường), nên không thể DROP CONSTRAINT <tên cố định> được.
-- Cách làm: khối DO tìm mọi ràng buộc CHECK nhắc tới cột status
-- trong pg_constraint rồi gỡ bằng tên thật lấy từ hệ thống, sau đó
-- thêm lại ràng buộc mới gồm cả 'rejected'. Chạy lại vẫn an toàn:
-- lần chạy sau gỡ luôn ràng buộc mới rồi thêm lại y hệt.
-- (Giá trị cũ pending/active/disabled đều nằm trong tập mới nên
-- không có dòng dữ liệu nào bị vi phạm khi thêm lại.)
do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.profiles drop constraint %I', r.conname);
    raise notice 'Đã gỡ ràng buộc CHECK cũ trên status: %', r.conname;
  end loop;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_status_check'
  ) then
    alter table public.profiles
      add constraint profiles_status_check
      check (status in ('pending', 'active', 'disabled', 'rejected'));
  end if;
end $$;


-- ============================================================
-- 3. P1-22 — EMAIL DUY NHẤT (profiles.email)
-- ============================================================
-- CHÚ Ý: lệnh này sẽ LỖI (unique violation) và dừng cả file nếu
-- trong bảng đã có 2 hồ sơ trùng email. Trước khi chạy, kiểm tra
-- và dọn trùng bằng truy vấn sau trong SQL Editor:
--   select email, count(*) from public.profiles
--   group by email having count(*) > 1;
-- Chỉ chạy migration khi truy vấn trên trả về 0 dòng.
create unique index if not exists profiles_email_unique_idx
  on public.profiles (email);


-- ============================================================
-- 4. HÀM TRỢ GIÚP — SECURITY DEFINER (tránh đệ quy RLS)
-- ============================================================
-- Vì sao cần hàm SECURITY DEFINER: một policy trên bảng profiles mà
-- lại truy vấn chính bảng profiles (vd: "người gọi có phải admin
-- không?") sẽ rơi vào đệ quy — truy vấn con cũng bị chính policy đó
-- chặn. Gói phép kiểm tra vào hàm SECURITY DEFINER thì hàm chạy với
-- quyền của chủ hàm (postgres) và bỏ qua RLS, nên không đệ quy.
-- Các hàm này chỉ trả về true/false, không lộ dữ liệu nào.
--
-- is_admin(): người đang gọi có hồ sơ role = 'admin' không.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- profile_is_active(): người đang gọi có hồ sơ status = 'active' không.
create or replace function public.profile_is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'active'
  );
$$;

-- no_profiles_yet(): trong bảng chưa có hồ sơ nào không (dùng để
-- nhận ra tài khoản đầu tiên — xem mục 5).
create or replace function public.no_profiles_yet()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (select 1 from public.profiles);
$$;


-- ============================================================
-- 5. P0-01 — VIẾT LẠI RLS CHO profiles
-- ============================================================
-- Lỗi cũ (schema.sql): select/update/delete đều using (true) —
-- tài khoản nào đăng nhập rồi cũng tự sửa role='admin' cho mình,
-- sửa/xoá hồ sơ người khác, đọc hết danh sách tài khoản.
--
-- Quy tắc mới:
--   select: chỉ dòng của mình, hoặc toàn bộ nếu mình là admin.
--   insert: chỉ dòng của chính mình (giữ nguyên như schema.sql).
--   update: admin sửa mọi cột, mọi dòng; người thường chỉ sửa dòng
--           của mình VÀ chỉ cột assigned_class_id (để chọn lớp ở
--           màn hình chờ duyệt) — giới hạn cột do trigger ở mục 6
--           thực thi (xem ghi chú trung thực ở đó).
--   delete: chỉ admin.
alter table public.profiles enable row level security;

-- 5a. SELECT — dòng của mình, hoặc toàn bộ nếu là admin.
drop policy if exists "profiles_select_authenticated" on public.profiles;
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select to authenticated
  using (auth.uid() = id or public.is_admin());

-- 5b. INSERT — chỉ được tạo dòng của chính mình.
-- GHI CHÚ QUAN TRỌNG (lý do có thêm trigger ở mục 6): app xác định
-- "tài khoản đầu tiên → admin" bằng cách ĐẾM số hồ sơ đọc được
-- (src/supabase.ts ensureProfile). Sau khi siết select ở 5a, mọi
-- tài khoản mới đều chỉ đọc được 0 dòng (chưa có hồ sơ của mình),
-- nên app sẽ luôn gửi role='admin' khi đăng ký. Nếu policy insert
-- chỉ kiểm tra auth.uid() = id thì tài khoản thứ hai trở đi cũng
-- thành admin — leo thang quyền qua đúng đường đăng ký. Vì vậy
-- việc chặn role='admin' KHÔNG đặt trong policy này mà đặt trong
-- trigger BEFORE INSERT ở mục 6 (trigger ép role/status về đúng
-- giá trị theo số hồ sơ đã có, bất kể app gửi gì lên). Không đặt
-- điều kiện role trong WITH CHECK ở đây vì thứ tự đánh giá
-- WITH CHECK so với BEFORE trigger không được bảo đảm chắc chắn
-- trên mọi phiên bản Postgres — đặt ở policy có nguy cơ chặn nhầm
-- cả lần đăng ký hợp lệ; trigger thì luôn chạy trước khi ghi và
-- quyết định trạng thái cuối cùng của dòng.
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check (auth.uid() = id);

-- 5c. UPDATE — hai policy riêng (Postgres không có policy theo cột):
--   (1) admin: sửa mọi cột, mọi dòng.
--   (2) người thường: chỉ sửa dòng của mình.
-- Hai policy là quan hệ "HOẶC": thỏa một trong hai là được sửa.
-- Giới hạn "người thường chỉ được đổi cột assigned_class_id" KHÔNG
-- thể viết trong policy (xem ghi chú ở 5d) — do trigger mục 6 giữ.
drop policy if exists "profiles_update_authenticated" on public.profiles;
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 5d. DELETE — chỉ admin.
drop policy if exists "profiles_delete_authenticated" on public.profiles;
drop policy if exists "profiles_delete_admin" on public.profiles;
create policy "profiles_delete_admin" on public.profiles
  for delete to authenticated
  using (public.is_admin());


-- ============================================================
-- 6. TRIGGER BẢO VỆ profiles (thực thi những gì policy
--    KHÔNG viết được) + profiles.updated_at
-- ============================================================
-- 6a. BEFORE INSERT — chống tự đăng ký thành admin (xem 5b).
--   Chưa có hồ sơ nào: giữ nguyên những gì app gửi (tài khoản đầu
--   tiên làm admin/active, đúng thiết kế cũ).
--   Đã có hồ sơ: ép status về 'pending'; nếu app gửi role='admin'
--   thì ép về đúng vai trò người dùng đã chọn lúc đăng ký
--   (requested_role trong auth.users: 'codo' hoặc 'viewer').
--   Tài khoản bị ép vẫn đăng ký thành công bình thường, chỉ không
--   leo thang được; Ban thi đua duyệt như quy trình cũ.
create or replace function public.clamp_new_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requested text;
begin
  if public.no_profiles_yet() then
    return new;
  end if;

  new.status := 'pending';
  if new.role = 'admin' then
    select raw_user_meta_data ->> 'requested_role' into v_requested
    from auth.users where id = new.id;
    new.role := case when v_requested = 'codo' then 'codo' else 'viewer' end;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_clamp_new on public.profiles;
create trigger profiles_clamp_new
  before insert on public.profiles
  for each row execute function public.clamp_new_profile();

-- 6b. BEFORE UPDATE — giới hạn cột với người không phải admin.
-- GIỚI HẠN TRUNG THỰC CỦA POSTGRES: RLS policy chỉ quyết định
-- "được sửa DÒNG nào", không quyết định "được đổi CỘT nào" — không
-- có cú pháp policy nào viết được "chỉ cột assigned_class_id".
-- Vì vậy policy 5c chỉ chặn sửa dòng người khác; còn "đổi cột nào"
-- phải do trigger này giữ: người không phải admin mà đổi bất kỳ cột
-- nào ngoài assigned_class_id (role, status, assigned_week_id,
-- email, họ tên, id, created_at) thì toàn bộ câu UPDATE bị từ chối
-- với thông báo rõ ràng. Admin thì trigger cho qua ngay.
-- (updated_at được loại khỏi phép so sánh vì nó do trigger 6c tự
-- cập nhật, không phải dữ liệu người dùng đổi.)
create or replace function public.enforce_profile_update_columns()
returns trigger
language plpgsql
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.email is distinct from old.email
     or new.full_name is distinct from old.full_name
     or new.role is distinct from old.role
     or new.status is distinct from old.status
     or new.reject_reason is distinct from old.reject_reason
     or new.assigned_week_id is distinct from old.assigned_week_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Chỉ được đổi lớp trực (assigned_class_id). Đổi vai trò/trạng thái phải do Ban thi đua (admin) thực hiện.';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_profile_update_columns on public.profiles;
create trigger enforce_profile_update_columns
  before update on public.profiles
  for each row execute function public.enforce_profile_update_columns();

-- 6c. BEFORE UPDATE — tự cập nhật profiles.updated_at (P1-22).
-- Thứ tự trigger trên cùng một bảng chạy theo tên (a→z):
-- enforce_profile_update_columns (e) chạy TRƯỚC
-- profiles_set_updated_at (p), nên phép so sánh ở 6b luôn thấy
-- updated_at chưa bị đổi — và 6b cũng đã loại cột này khỏi phép so
-- sánh, nên hai trigger không xung đột nhau.
create or replace function public.set_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_profiles_updated_at();


-- ============================================================
-- 7. P1-22 — app_state.version TĂNG MỖI LẦN GHI (đi kèm P0-05)
-- ============================================================
-- Viết lại hàm trigger đã có trong schema.sql (CREATE OR REPLACE):
-- ngoài việc cập nhật updated_at, mỗi lần UPDATE còn tăng version
-- thêm 1 (INSERT giữ version = 1 nhờ DEFAULT ở mục 1).
-- Thứ tự trigger trên app_state cũng chạy theo tên (a→z):
-- app_state_history (h, mục 9) chạy TRƯỚC app_state_updated_at
-- (u), nên bản lưu vào lịch sử luôn là bản cũ, chưa tăng version.
create or replace function public.set_app_state_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.version = coalesce(old.version, 0) + 1;
  return new;
end;
$$;

-- Trigger app_state_updated_at đã có từ schema.sql — giữ nguyên tên,
-- chỉ cần hàm bên trên được thay bằng bản mới (không cần DROP/CREATE
-- lại trigger). Dòng dưới đây để chắc chắn trigger tồn tại nếu ai
-- đó từng xoá nó:
drop trigger if exists app_state_updated_at on public.app_state;
create trigger app_state_updated_at
  before update on public.app_state
  for each row execute function public.set_app_state_updated_at();


-- ============================================================
-- 8. P0-01 + P1-13 — RLS CHO app_state
-- ============================================================
-- SELECT: chỉ khi hồ sơ của người gọi đang 'active', hoặc người gọi
-- là admin. Tài khoản pending/disabled/rejected không đọc được dữ
-- liệu chung (đúng P1-13: màn hình chờ duyệt chỉ là tấm rèm UI thì
-- chưa đủ — giờ database cũng chặn).
-- LƯU Ý VẬN HÀNH: app hiện lấy danh sách lớp cho màn hình chờ duyệt
-- từ dữ liệu chung; sau migration này tài khoản chờ duyệt sẽ không
-- tải được app_state nữa, nên màn hình đó PHẢI lấy danh sách lớp từ
-- hằng số DUTY_CLASSES trong code (việc của app, xem P1-13). Tương
-- tự, lúc đăng ký mới (chưa có hồ sơ) bước tra lớp theo tên đăng ký
-- trong ensureProfile sẽ lặng lẽ bỏ qua và người dùng chọn lại lớp
-- ở màn hình chờ — hành vi này đã có sẵn trong code (try/catch).
-- INSERT/UPDATE: chỉ tài khoản đã duyệt (hoặc admin) mới được ghi dữ
-- liệu chung — tài khoản pending/disabled/rejected không được ghi lén
-- (chỉ chặn SELECT thì chưa đủ: kẻ xấu vẫn upsert được dòng 'main'
-- dù không đọc được nó). App chỉ ghi từ tài khoản đã duyệt nên không
-- ảnh hưởng luồng bình thường. Không có policy DELETE cho app_state —
-- app không bao giờ xoá dòng 'main'.
alter table public.app_state enable row level security;

drop policy if exists "app_state_select_authenticated" on public.app_state;
drop policy if exists "app_state_select_active_or_admin" on public.app_state;
create policy "app_state_select_active_or_admin" on public.app_state
  for select to authenticated
  using (public.is_admin() or public.profile_is_active());

drop policy if exists "app_state_insert_authenticated" on public.app_state;
create policy "app_state_insert_authenticated" on public.app_state
  for insert to authenticated
  with check (public.is_admin() or public.profile_is_active());

drop policy if exists "app_state_update_authenticated" on public.app_state;
create policy "app_state_update_authenticated" on public.app_state
  for update to authenticated
  using (public.is_admin() or public.profile_is_active())
  with check (public.is_admin() or public.profile_is_active());


-- ============================================================
-- 9. P0-02 — BẢNG LỊCH SỬ app_state_history
-- ============================================================
-- Mỗi lần app_state bị UPDATE, trigger lưu toàn bộ bản cũ (OLD)
-- vào đây rồi cắt bớt, chỉ giữ 30 bản mới nhất. Một lần ghi đè
-- nhầm (lỗi đồng bộ, import JSON lỗi) vẫn khôi phục được bằng tay
-- từ 30 bản gần nhất.
create table if not exists public.app_state_history (
  id bigserial primary key,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

comment on table public.app_state_history is
  'Lịch sử 30 bản gần nhất của app_state (id=main), phục vụ khôi phục khi ghi đè nhầm. Chỉ ghi qua trigger, chỉ admin đọc được.';

alter table public.app_state_history enable row level security;

-- Hàm trigger chạy SECURITY DEFINER: nó bỏ qua RLS nên mới INSERT
-- được vào bảng lịch sử dù authenticated không có quyền INSERT trực
-- tiếp (xem policy ở dưới — đó là chủ ý, không phải thiếu sót).
-- Vì trigger và câu UPDATE gốc cùng một transaction, nếu UPDATE lỗi
-- thì bản lịch sử cũng bị rollback theo — không bao giờ lưu thừa.
create or replace function public.archive_app_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.app_state_history (data, updated_at, updated_by)
  values (old.data, old.updated_at, old.updated_by);

  -- Chỉ giữ 30 bản mới nhất (mới nhất theo updated_at, hoà thì
  -- theo id tăng dần); xoá phần còn lại ngay trong trigger để
  -- bảng không phình vô hạn mà không cần job dọn riêng.
  delete from public.app_state_history
  where id not in (
    select id from public.app_state_history
    order by updated_at desc, id desc
    limit 30
  );
  return new;
end;
$$;

drop trigger if exists app_state_history on public.app_state;
create trigger app_state_history
  before update on public.app_state
  for each row execute function public.archive_app_state();

-- RLS cho bảng lịch sử: chỉ admin được đọc. KHÔNG tạo policy
-- insert/update/delete cho authenticated — không ai được ghi hay
-- xoá lịch sử bằng REST; mọi bản ghi đều do trigger SECURITY
-- DEFINER ở trên tạo ra.
drop policy if exists "app_state_history_select_admin" on public.app_state_history;
create policy "app_state_history_select_admin" on public.app_state_history
  for select to authenticated
  using (public.is_admin());


-- ============================================================
-- 10. QUYỀN BẢNG + THU HỒI QUYỀN CỦA anon
-- ============================================================
-- anon (chưa đăng nhập) không được gì hết trên cả ba bảng — trước
-- đây schema.sql cấp cả cho anon, RLS đang chặn nhưng chỉ cần một
-- lần sửa policy nhầm là lộ (P0-01).
-- authenticated cần quyền bảng thì PostgREST mới cho qua tới lớp
-- RLS (thiếu là lỗi 42501 dù policy đã đúng); policy mới là lớp
-- chặn thật sự.
revoke all on public.profiles, public.app_state, public.app_state_history from anon;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.app_state to authenticated;
-- Lịch sử chỉ cấp SELECT cho authenticated (policy ở mục 9 giới hạn
-- tiếp chỉ admin đọc được); KHÔNG cấp insert/update/delete — ghi
-- lịch sử chỉ qua trigger SECURITY DEFINER.
grant select on public.app_state_history to authenticated;


-- ============================================================
-- 11. KIỂM CHỨNG NHANH SAU KHI CHẠY (chạy tay từng dòng trong
--     SQL Editor, hoặc dùng token cờ đỏ gọi REST như audit P0-01)
-- ============================================================
-- -- 1. Tài khoản cờ đỏ PATCH role của chính mình → 0 dòng / lỗi:
-- --    PATCH /rest/v1/profiles?id=eq.<mình> {"role":"admin"}
-- -- 2. Tài khoản cờ đỏ DELETE hồ sơ admin → thất bại.
-- -- 3. Tài khoản cờ đỏ GET /rest/v1/profiles → chỉ trả dòng của mình.
-- -- 4. Đăng ký tài khoản thứ hai → role 'viewer' (hoặc 'codo' nếu
-- --    đã chọn), status 'pending' — KHÔNG thành admin.
-- -- 5. Đăng ký tài khoản đầu tiên trên môi trường trống → vẫn admin.
-- -- 6. Ghi app_state 2 lần → version tăng 1 mỗi lần (1 → 2 → 3);
-- --    select count(*) from app_state_history → 2.
-- -- 7. Ghi app_state 35 lần → app_state_history chỉ còn 30 dòng.
-- -- 8. Insert 2 hồ sơ trùng email → lỗi unique violation.
-- -- 9. Admin cập nhật status='rejected' cho một hồ sơ pending →
-- --    thành công; tài khoản đó đăng nhập lại chỉ thấy màn hình
-- --    chờ (app hiển thị trạng thái bị từ chối — việc của app).
-- -- 10. Tài khoản pending GET /rest/v1/app_state → 0 dòng.
