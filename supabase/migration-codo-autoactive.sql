-- Cờ đỏ xác nhận email xong vào được ngay, không cần Ban thi đua duyệt.
-- Chạy 1 lần trong Supabase SQL Editor của dự án Tổng Thi Đua.

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

  if new.role = 'admin' then
    select raw_user_meta_data ->> 'requested_role' into v_requested
    from auth.users where id = new.id;
    new.role := case when v_requested = 'codo' then 'codo' else 'viewer' end;
  end if;

  new.status := case
    when new.role = 'codo' and new.assigned_class_id is not null then 'active'
    else 'pending'
  end;
  return new;
end;
$$;

create or replace function public.enforce_profile_update_columns()
returns trigger
language plpgsql
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if old.role = 'codo'
     and old.status = 'pending'
     and new.assigned_class_id is not null
     and new.id is not distinct from old.id
     and new.email is not distinct from old.email
     and new.full_name is not distinct from old.full_name
     and new.role is not distinct from old.role
     and new.reject_reason is not distinct from old.reject_reason
     and new.assigned_week_id is not distinct from old.assigned_week_id
     and new.created_at is not distinct from old.created_at then
    new.status := 'active';
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

update public.profiles
set status = 'active'
where role = 'codo'
  and status = 'pending'
  and assigned_class_id is not null;
