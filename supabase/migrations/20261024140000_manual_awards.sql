begin;
create table public.prisma_award_selections (
 id uuid primary key default gen_random_uuid(),
 event text not null check(event in ('faf','faft')),
 kind text not null check(kind in ('solo','revelacao')),
 enrollment_id uuid not null references public.prisma_enrollments(id),
 label text not null check(label in ('bailarina','bailarino')),
 participant_name text not null default '' check(length(participant_name)<=300),
 notes text not null default '' check(length(notes)<=2000),
 active boolean not null default true,
 actor_id uuid not null references public.prisma_profiles(id),
 updated_at timestamptz not null default clock_timestamp(),
 check(kind<>'revelacao' or length(trim(participant_name))>0)
);
create unique index prisma_solo_selection on public.prisma_award_selections(enrollment_id) where kind='solo';
create unique index prisma_revelation_selection on public.prisma_award_selections(event,enrollment_id,label,participant_name) where kind='revelacao' and active;
alter table public.prisma_award_selections enable row level security;
revoke all on public.prisma_award_selections from public,anon,authenticated;
grant select on public.prisma_award_selections to authenticated;
create policy awards_admin_read on public.prisma_award_selections for select to authenticated using(public.prisma_has_role('admin'));
create function public.prisma_admin_save_award(p_id uuid,p_event text,p_entry uuid,p_kind text,p_label text,p_name text,p_notes text,p_active boolean,p_expected_updated_at timestamptz)
returns public.prisma_award_selections language plpgsql security definer set search_path='' as $$
declare entry public.prisma_enrollments; previous public.prisma_award_selections; result public.prisma_award_selections; collective text; solo text;
begin
 if not public.prisma_has_role('admin') then raise insufficient_privilege using message='Acesso negado'; end if;
 select * into entry from public.prisma_enrollments where id=p_entry and event=p_event;
 if not found then raise check_violation using message='Inscrição e evento incompatíveis'; end if;
 if concat_ws(' ',entry.payload->>'category',entry.payload->>'solo',entry.payload->>'collective',entry.payload->>'type') ilike '%mostra%' then raise check_violation using message='Mostra não concorre à premiação'; end if;
 if p_kind='solo' then
  collective:=upper(trim(coalesce(entry.payload->>'collective','')));solo:=upper(trim(coalesce(entry.payload->>'solo','')));
  if not (upper(trim(coalesce(entry.payload->>'formation','')))='SOLO' or ((collective='' or collective='NÃO SE APLICA' or collective='NAO SE APLICA') and solo<>'' and solo<>'NÃO SE APLICA' and solo<>'NAO SE APLICA')) then raise check_violation using message='Esta inscrição não é um solo'; end if;
 end if;
 if p_id is not null then
  select * into previous from public.prisma_award_selections where id=p_id for update;
  if not found or previous.event<>p_event or previous.kind<>p_kind then raise check_violation using message='Indicação incompatível'; end if;
  if previous.updated_at is distinct from p_expected_updated_at then raise serialization_failure using message='A indicação mudou. Reabra a área.'; end if;
  update public.prisma_award_selections set enrollment_id=p_entry,label=p_label,participant_name=trim(coalesce(p_name,'')),notes=coalesce(p_notes,''),active=p_active,actor_id=auth.uid(),updated_at=clock_timestamp() where id=p_id returning * into result;
 else
  insert into public.prisma_award_selections(event,kind,enrollment_id,label,participant_name,notes,active,actor_id) values(p_event,p_kind,p_entry,p_label,trim(coalesce(p_name,'')),coalesce(p_notes,''),p_active,auth.uid()) returning * into result;
 end if;
 return result;
end;
$$;
revoke all on function public.prisma_admin_save_award(uuid,text,uuid,text,text,text,text,boolean,timestamptz) from public,anon;
grant execute on function public.prisma_admin_save_award(uuid,text,uuid,text,text,text,text,boolean,timestamptz) to authenticated;
commit;
