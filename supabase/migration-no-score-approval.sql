-- Gửi phiếu không cần duyệt: phiếu gửi lên tính ngay.
-- Chạy 1 lần trong Supabase SQL Editor của dự án Tổng Thi Đua.

drop policy if exists "scores_insert_admin_or_duty" on public.scores;
create policy "scores_insert_admin_or_duty" on public.scores
  for insert with check (
    public.is_admin()
    or (
      public.profile_is_active() and public.my_role() = 'codo'
      and status in ('draft', 'submitted', 'approved')
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
      and status in ('draft', 'submitted', 'approved')
      and exists (
        select 1 from public.roster r
        where r.name = public.my_full_name() and r.class_id = scores.class_id and r.week_id = scores.week_id and r.active
      )
      and not exists (
        select 1 from public.weeks w where w.id = scores.week_id and w.submitted_at is not null
      )
    )
  );

update public.scores
set status = 'approved',
    approved_by = coalesce(approved_by, submitted_by),
    approved_at = coalesce(approved_at, submitted_at)
where status = 'submitted';
