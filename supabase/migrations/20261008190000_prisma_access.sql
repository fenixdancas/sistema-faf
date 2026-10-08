begin;
create table public.prisma_profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 name text not null,
 roles text[] not null check (cardinality(roles)>0 and roles <@ array['admin','jurada','apoiador']::text[])
);
create table public.prisma_enrollments (
 id uuid primary key default gen_random_uuid(),
 event text not null check(event in ('faf','faft')),
 payload jsonb not null,
 created_at timestamptz not null default now()
);
create table public.prisma_assignments (
 id uuid primary key default gen_random_uuid(),
 enrollment_id uuid not null references public.prisma_enrollments(id) on delete cascade,
 user_id uuid not null references public.prisma_profiles(id) on delete cascade,
 kind text not null check(kind in ('jurada','apoiador')),
 unique(enrollment_id,user_id,kind)
);
create table public.prisma_evaluations (
 assignment_id uuid primary key references public.prisma_assignments(id) on delete cascade,
 user_id uuid not null references public.prisma_profiles(id) on delete cascade,
 scores jsonb not null,
 comments text not null default '' check(length(comments)<=10000),
 updated_at timestamptz not null default now()
);
create or replace function public.prisma_has_role(p_role text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.prisma_profiles where id=(select auth.uid()) and p_role=any(roles))
$$;
alter table public.prisma_profiles enable row level security;
alter table public.prisma_enrollments enable row level security;
alter table public.prisma_assignments enable row level security;
alter table public.prisma_evaluations enable row level security;
revoke all on public.prisma_profiles,public.prisma_enrollments,public.prisma_assignments,public.prisma_evaluations from anon,authenticated;
grant select on public.prisma_profiles,public.prisma_evaluations to authenticated;
grant select,insert,update,delete on public.prisma_enrollments,public.prisma_assignments to authenticated;
create policy profiles_read on public.prisma_profiles for select to authenticated using(id=(select auth.uid()) or public.prisma_has_role('admin'));
create policy enrollments_admin on public.prisma_enrollments for all to authenticated using(public.prisma_has_role('admin')) with check(public.prisma_has_role('admin'));
create policy assignments_admin on public.prisma_assignments for all to authenticated using(public.prisma_has_role('admin')) with check(public.prisma_has_role('admin'));
create policy assignments_own on public.prisma_assignments for select to authenticated using(user_id=(select auth.uid()) and public.prisma_has_role(kind));
create policy evaluations_read on public.prisma_evaluations for select to authenticated using(user_id=(select auth.uid()) or public.prisma_has_role('admin'));
create or replace function public.prisma_my_assignments(p_event text,p_kind text)
returns table(id uuid,title text,scores jsonb,comments text)
language sql stable security definer set search_path='' as $$
 select a.id,coalesce(e.payload->>'choreo','Apresentação'),v.scores,v.comments
 from public.prisma_assignments a join public.prisma_enrollments e on e.id=a.enrollment_id
 left join public.prisma_evaluations v on v.assignment_id=a.id
 where a.user_id=(select auth.uid()) and a.kind=p_kind and e.event=p_event and public.prisma_has_role(p_kind)
 order by e.created_at,e.id
$$;
create or replace function public.prisma_save_evaluation(p_assignment uuid,p_scores jsonb,p_comments text)
returns void language plpgsql security definer set search_path='' as $$
declare a public.prisma_assignments; item jsonb;
begin
 select * into a from public.prisma_assignments where id=p_assignment and user_id=(select auth.uid());
 if a.id is null or not public.prisma_has_role(a.kind) then raise insufficient_privilege using message='Acesso negado'; end if;
 if jsonb_typeof(p_scores) is distinct from 'array' then raise check_violation using message='Notas inválidas'; end if;
 if jsonb_array_length(p_scores)<>(case when a.kind='jurada' then 11 else 2 end) then raise check_violation using message='Quantidade de notas inválida'; end if;
 for item in select value from jsonb_array_elements(p_scores) loop
  if jsonb_typeof(item)<>'number' then raise check_violation using message='Notas inválidas'; end if;
  if (item::text)::numeric<5 or (item::text)::numeric>10 then raise check_violation using message='Notas devem estar entre 5 e 10'; end if;
 end loop;
 insert into public.prisma_evaluations(assignment_id,user_id,scores,comments) values(a.id,a.user_id,p_scores,coalesce(p_comments,''))
 on conflict(assignment_id) do update set scores=excluded.scores,comments=excluded.comments,updated_at=now();
end;
$$;
revoke all on function public.prisma_has_role(text),public.prisma_my_assignments(text,text),public.prisma_save_evaluation(uuid,jsonb,text) from public,anon;
grant execute on function public.prisma_has_role(text),public.prisma_my_assignments(text,text),public.prisma_save_evaluation(uuid,jsonb,text) to authenticated;
commit;
