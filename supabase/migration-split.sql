-- ============================================================
-- migration-split.sql — phiên bản "split-1" (25/11/2026)
-- Tách dữ liệu phiếu khỏi gói app_state chung (P1-01 nấc 2 / D11):
-- tuần, lớp, phân công trực, phiếu, nhật ký và cài đặt thành bảng
-- riêng, RLS theo vai trò (cờ đỏ chỉ ghi phiếu lớp mình trực,
-- Ban thi đua toàn quyền). app_state cũ GIỮ NGUYÊN làm bản sao lưu
-- (app vẫn ghi kèm app_state để lịch sử sao lưu tiếp tục hoạt động).
--
-- Cách chạy: Supabase Dashboard -> SQL Editor -> New query -> dán
-- toàn bộ file này -> Run. Chạy lúc không ai đang nhập điểm, xong
-- tải lại app. File chạy lại nhiều lần vẫn an toàn (idempotent):
-- phần chuyển dữ liệu dùng ON CONFLICT DO NOTHING nên không nhân đôi.
--
-- Điều kiện: đã chạy supabase/migration-pro.sql trước (cần các hàm
-- is_admin() / profile_is_active()).
-- ============================================================

-- ------------------------------------------------------------
-- 0. Hàm phụ: vai trò + họ tên của người đang gọi
-- ------------------------------------------------------------
create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.my_full_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select full_name from public.profiles where id = auth.uid();
$$;

-- ------------------------------------------------------------
-- 1. Các bảng dữ liệu riêng
-- ------------------------------------------------------------
create table if not exists public.weeks (
  id text primary key,
  label text not null default '',
  date_range text not null default '',
  month text,
  submitted_at text,
  submitted_by text,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  version integer not null default 1
);

create table if not exists public.classes (
  id text primary key,
  name text not null default '',
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  version integer not null default 1
);

create table if not exists public.roster (
  id text primary key,
  name text not null default '',
  class_id text not null references public.classes(id) on delete cascade,
  week_id text not null references public.weeks(id) on delete cascade,
  active boolean not null default true,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  version integer not null default 1
);

create table if not exists public.scores (
  id text primary key,
  week_id text not null references public.weeks(id) on delete cascade,
  class_id text not null references public.classes(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'returned')),
  details jsonb not null default '{}'::jsonb,
  return_reason text,
  submitted_by text,
  submitted_at text,
  approved_by text,
  approved_at text,
  updated_by text,
  updated_at_text text,
  updated_at timestamptz not null default now(),
  version integer not null default 1
);

create table if not exists public.logs (
  id text primary key,
  time text not null default '',
  actor text not null default '',
  role text not null default '',
  action text not null default '',
  detail text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  id text primary key default 'main',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  version integer not null default 1
);

create index if not exists scores_week_class_idx on public.scores (week_id, class_id);
create index if not exists roster_week_idx on public.roster (week_id);
create index if not exists logs_sort_idx on public.logs (sort_order);

-- ------------------------------------------------------------
-- 2. Trigger: mỗi lần UPDATE thì updated_at = now(), version + 1
--    (app dùng version để phát hiện xung đột ghi từng dòng)
-- ------------------------------------------------------------
create or replace function public.set_row_version()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end;
$$;

drop trigger if exists weeks_version on public.weeks;
create trigger weeks_version before update on public.weeks
  for each row execute function public.set_row_version();

drop trigger if exists classes_version on public.classes;
create trigger classes_version before update on public.classes
  for each row execute function public.set_row_version();

drop trigger if exists roster_version on public.roster;
create trigger roster_version before update on public.roster
  for each row execute function public.set_row_version();

drop trigger if exists scores_version on public.scores;
create trigger scores_version before update on public.scores
  for each row execute function public.set_row_version();

drop trigger if exists settings_version on public.settings;
create trigger settings_version before update on public.settings
  for each row execute function public.set_row_version();

-- ------------------------------------------------------------
-- 3. RLS theo vai trò
--    - Đọc: tài khoản đã duyệt (active) hoặc admin.
--    - Tuần/lớp/cài đặt: chỉ admin ghi.
--    - Phân công trực: admin toàn quyền; cờ đỏ chỉ ghi dòng mang
--      tên mình (tự chọn lớp trực).
--    - Phiếu: admin toàn quyền; cờ đỏ chỉ tạo/sửa phiếu của lớp
--      mình trực (theo roster), chỉ khi phiếu đang Nháp/Bị trả lại
--      và tuần chưa chốt sổ.
--    - Nhật ký: admin đọc; tài khoản active ghi dòng mang tên mình.
-- ------------------------------------------------------------
alter table public.weeks enable row level security;
alter table public.classes enable row level security;
alter table public.roster enable row level security;
alter table public.scores enable row level security;
alter table public.logs enable row level security;
alter table public.settings enable row level security;

revoke all on public.weeks, public.classes, public.roster, public.scores, public.logs, public.settings from anon;
grant select, insert, update, delete on public.weeks, public.classes, public.roster, public.scores, public.logs, public.settings to authenticated;

-- weeks
drop policy if exists "weeks_select_active" on public.weeks;
create policy "weeks_select_active" on public.weeks
  for select using (public.is_admin() or public.profile_is_active());
drop policy if exists "weeks_write_admin" on public.weeks;
create policy "weeks_write_admin" on public.weeks
  for all using (public.is_admin()) with check (public.is_admin());

-- classes
drop policy if exists "classes_select_active" on public.classes;
create policy "classes_select_active" on public.classes
  for select using (public.is_admin() or public.profile_is_active());
drop policy if exists "classes_write_admin" on public.classes;
create policy "classes_write_admin" on public.classes
  for all using (public.is_admin()) with check (public.is_admin());

-- settings
drop policy if exists "settings_select_active" on public.settings;
create policy "settings_select_active" on public.settings
  for select using (public.is_admin() or public.profile_is_active());
drop policy if exists "settings_write_admin" on public.settings;
create policy "settings_write_admin" on public.settings
  for all using (public.is_admin()) with check (public.is_admin());

-- roster
drop policy if exists "roster_select_active" on public.roster;
create policy "roster_select_active" on public.roster
  for select using (public.is_admin() or public.profile_is_active());
drop policy if exists "roster_insert_admin_or_self" on public.roster;
create policy "roster_insert_admin_or_self" on public.roster
  for insert with check (
    public.is_admin()
    or (public.profile_is_active() and public.my_role() = 'codo' and name = public.my_full_name())
  );
drop policy if exists "roster_update_admin_or_self" on public.roster;
create policy "roster_update_admin_or_self" on public.roster
  for update using (
    public.is_admin()
    or (public.profile_is_active() and public.my_role() = 'codo' and name = public.my_full_name())
  ) with check (
    public.is_admin()
    or (public.profile_is_active() and public.my_role() = 'codo' and name = public.my_full_name())
  );
drop policy if exists "roster_delete_admin" on public.roster;
create policy "roster_delete_admin" on public.roster
  for delete using (public.is_admin());

-- scores
drop policy if exists "scores_select_active" on public.scores;
create policy "scores_select_active" on public.scores
  for select using (public.is_admin() or public.profile_is_active());
drop policy if exists "scores_insert_admin_or_duty" on public.scores;
create policy "scores_insert_admin_or_duty" on public.scores
  for insert with check (
    public.is_admin()
    or (
      public.profile_is_active() and public.my_role() = 'codo'
      and status in ('draft', 'submitted')
      and exists (
        select 1 from public.roster r
        where r.name = public.my_full_name() and r.class_id = scores.class_id and r.week_id = scores.week_id and r.active
      )
      and not exists (
        select 1 from public.weeks w where w.id = scores.week_id and w.submitted_at is not null
      )
    )
  );
drop policy if exists "scores_update_admin_or_duty" on public.scores;
create policy "scores_update_admin_or_duty" on public.scores
  for update using (
    public.is_admin()
    or (
      public.profile_is_active() and public.my_role() = 'codo'
      and status in ('draft', 'returned')
      and exists (
        select 1 from public.roster r
        where r.name = public.my_full_name() and r.class_id = scores.class_id and r.week_id = scores.week_id and r.active
      )
      and not exists (
        select 1 from public.weeks w where w.id = scores.week_id and w.submitted_at is not null
      )
    )
  ) with check (
    public.is_admin()
    or (
      public.profile_is_active() and public.my_role() = 'codo'
      and status in ('draft', 'submitted')
      and exists (
        select 1 from public.roster r
        where r.name = public.my_full_name() and r.class_id = scores.class_id and r.week_id = scores.week_id and r.active
      )
      and not exists (
        select 1 from public.weeks w where w.id = scores.week_id and w.submitted_at is not null
      )
    )
  );
drop policy if exists "scores_delete_admin" on public.scores;
create policy "scores_delete_admin" on public.scores
  for delete using (public.is_admin());

-- logs
drop policy if exists "logs_select_admin" on public.logs;
create policy "logs_select_admin" on public.logs
  for select using (public.is_admin());
drop policy if exists "logs_insert_self" on public.logs;
create policy "logs_insert_self" on public.logs
  for insert with check (
    public.is_admin()
    or (public.profile_is_active() and actor = public.my_full_name())
  );
drop policy if exists "logs_update_admin" on public.logs;
create policy "logs_update_admin" on public.logs
  for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "logs_delete_admin" on public.logs;
create policy "logs_delete_admin" on public.logs
  for delete using (public.is_admin());

-- ------------------------------------------------------------
-- 4. Chuyển dữ liệu hiện có từ app_state (id='main') sang bảng riêng
--    Chạy lại không nhân đôi (ON CONFLICT DO NOTHING).
-- ------------------------------------------------------------
insert into public.settings (id, data)
select 'main', a.data -> 'settings'
from public.app_state a
where a.id = 'main' and a.data ? 'settings'
on conflict (id) do nothing;

insert into public.weeks (id, label, date_range, month, submitted_at, submitted_by, sort_order)
select w ->> 'id', coalesce(w ->> 'label', ''), coalesce(w ->> 'dateRange', ''),
       w ->> 'month', w ->> 'submittedAt', w ->> 'submittedBy', (ord - 1)::integer
from public.app_state a, jsonb_array_elements(a.data -> 'weeks') with ordinality as t(w, ord)
where a.id = 'main'
on conflict (id) do nothing;

insert into public.classes (id, name, sort_order)
select c ->> 'id', coalesce(c ->> 'name', ''), (ord - 1)::integer
from public.app_state a, jsonb_array_elements(a.data -> 'classes') with ordinality as t(c, ord)
where a.id = 'main'
on conflict (id) do nothing;

insert into public.roster (id, name, class_id, week_id, active, sort_order)
select r ->> 'id', coalesce(r ->> 'name', ''), r ->> 'classId', r ->> 'weekId',
       coalesce((r ->> 'active')::boolean, true), (ord - 1)::integer
from public.app_state a, jsonb_array_elements(a.data -> 'roster') with ordinality as t(r, ord)
where a.id = 'main'
on conflict (id) do nothing;

insert into public.scores (id, week_id, class_id, status, details, return_reason,
                           submitted_by, submitted_at, approved_by, approved_at, updated_by, updated_at_text)
select s ->> 'id', s ->> 'weekId', s ->> 'classId', coalesce(s ->> 'status', 'draft'),
       coalesce(s -> 'details', '{}'::jsonb), s ->> 'returnReason',
       s ->> 'submittedBy', s ->> 'submittedAt', s ->> 'approvedBy', s ->> 'approvedAt',
       s ->> 'updatedBy', s ->> 'updatedAt'
from public.app_state a, jsonb_array_elements(a.data -> 'scores') as t(s)
where a.id = 'main'
on conflict (id) do nothing;

insert into public.logs (id, time, actor, role, action, detail, sort_order)
select l ->> 'id', coalesce(l ->> 'time', ''), coalesce(l ->> 'actor', ''),
       coalesce(l ->> 'role', ''), coalesce(l ->> 'action', ''), coalesce(l ->> 'detail', ''),
       (ord - 1)::integer
from public.app_state a, jsonb_array_elements(a.data -> 'logs') with ordinality as t(l, ord)
where a.id = 'main'
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 5. Kiểm tra sau khi chạy (chạy riêng từng câu nếu muốn):
--    select count(*) from public.weeks;
--    select count(*) from public.classes;
--    select count(*) from public.scores;
--    select count(*) from public.roster;
--    select id from public.settings;
-- ------------------------------------------------------------
