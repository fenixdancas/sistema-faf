begin;
create table public.prisma_evaluation_edits (
 id bigint generated always as identity primary key,
 assignment_id uuid not null references public.prisma_assignments(id),
 actor_id uuid not null references public.prisma_profiles(id),
 before_value jsonb not null,
 after_value jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.prisma_evaluation_edits enable row level security;
revoke all on public.prisma_evaluation_edits from public,anon,authenticated;
grant select on public.prisma_evaluation_edits to authenticated;
create policy admin_edits_read on public.prisma_evaluation_edits for select to authenticated using(public.prisma_has_role('admin'));
create function public.prisma_admin_update_evaluation(p_assignment uuid,p_scores jsonb,p_comments text,p_expected_updated_at timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare old_value public.prisma_evaluations; new_value public.prisma_evaluations; assignment_kind text; item jsonb;
begin
 if not public.prisma_has_role('admin') then raise insufficient_privilege using message='Acesso negado'; end if;
 select * into old_value from public.prisma_evaluations where assignment_id=p_assignment for update;
 if not found then raise no_data_found using message='Avaliação não encontrada'; end if;
 if old_value.updated_at is distinct from p_expected_updated_at then raise serialization_failure using message='A avaliação foi alterada. Reabra a área antes de editar novamente.'; end if;
 select kind into assignment_kind from public.prisma_assignments where id=p_assignment;
 if jsonb_typeof(p_scores) is distinct from 'array' then raise check_violation using message='Notas inválidas'; end if;
 if jsonb_array_length(p_scores)<>(case when assignment_kind='jurada' then 11 else 2 end) then raise check_violation using message='Quantidade de notas inválida'; end if;
 for item in select value from jsonb_array_elements(p_scores) loop
  if jsonb_typeof(item)<>'number' then raise check_violation using message='Notas inválidas'; end if;
  if (item::text)::numeric<5 or (item::text)::numeric>10 then raise check_violation using message='Notas devem estar entre 5 e 10'; end if;
 end loop;
 update public.prisma_evaluations set scores=p_scores,comments=coalesce(p_comments,''),updated_at=clock_timestamp() where assignment_id=p_assignment returning * into new_value;
 insert into public.prisma_evaluation_edits(assignment_id,actor_id,before_value,after_value) values(p_assignment,auth.uid(),to_jsonb(old_value),to_jsonb(new_value));
end;
$$;
revoke all on function public.prisma_admin_update_evaluation(uuid,jsonb,text,timestamptz) from public,anon;
grant execute on function public.prisma_admin_update_evaluation(uuid,jsonb,text,timestamptz) to authenticated;
commit;
