-- All jurors/supporters evaluate all presentations in both events.
begin;
create or replace function public.prisma_assign_all_presentations()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if TG_TABLE_NAME = 'prisma_enrollments' then
    insert into public.prisma_assignments(enrollment_id,user_id,kind)
    select NEW.id,p.id,r.kind from public.prisma_profiles p
    cross join lateral unnest(p.roles) as r(kind)
    where r.kind in ('jurada','apoiador')
    on conflict(enrollment_id,user_id,kind) do nothing;
  else
    insert into public.prisma_assignments(enrollment_id,user_id,kind)
    select e.id,NEW.id,r.kind from public.prisma_enrollments e
    cross join lateral unnest(NEW.roles) as r(kind)
    where r.kind in ('jurada','apoiador')
    on conflict(enrollment_id,user_id,kind) do nothing;
  end if;
  return NEW;
end;
$$;
revoke all on function public.prisma_assign_all_presentations() from public,anon,authenticated;
create trigger prisma_enrollment_assign_all after insert on public.prisma_enrollments
for each row execute function public.prisma_assign_all_presentations();
create trigger prisma_profile_assign_all after insert or update of roles on public.prisma_profiles
for each row execute function public.prisma_assign_all_presentations();
insert into public.prisma_assignments(enrollment_id,user_id,kind)
select e.id,p.id,r.kind from public.prisma_enrollments e
cross join public.prisma_profiles p cross join lateral unnest(p.roles) as r(kind)
where r.kind in ('jurada','apoiador')
on conflict(enrollment_id,user_id,kind) do nothing;
commit;
