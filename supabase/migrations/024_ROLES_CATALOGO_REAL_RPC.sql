-- ============================================================================
-- GrupMar Time v16.18.1.1 - RPC canónica para catálogo Roles
-- ============================================================================

create or replace function public.admin_role_catalog_save(
  p_id uuid,
  p_payload jsonb
)
returns public.access_role_catalog
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_text text := nullif(trim(coalesce(p_payload->>'role','')), '');
  v_label text := nullif(trim(coalesce(p_payload->>'label','')), '');
  v_description text := coalesce(p_payload->>'description','');
  v_active boolean := coalesce(nullif(p_payload->>'active','')::boolean, true);
  v_sort_order integer := nullif(p_payload->>'sort_order','')::integer;
  v_role public.app_role;
  v_row public.access_role_catalog;
begin
  if v_role_text is null then
    raise exception 'El rol técnico es obligatorio';
  end if;

  begin
    v_role := v_role_text::public.app_role;
  exception when others then
    raise exception 'Rol técnico inválido: %. Debe existir en enum public.app_role', v_role_text;
  end;

  if v_label is null then
    v_label := v_role_text;
  end if;

  if p_id is null then
    insert into public.access_role_catalog(role, label, description, active, sort_order)
    values (v_role, v_label, v_description, v_active, coalesce(v_sort_order, 999))
    on conflict (role)
    do update set
      label = excluded.label,
      description = excluded.description,
      active = excluded.active,
      sort_order = excluded.sort_order,
      updated_at = now()
    returning * into v_row;
  else
    update public.access_role_catalog
    set
      role = v_role,
      label = v_label,
      description = v_description,
      active = v_active,
      sort_order = coalesce(v_sort_order, sort_order),
      updated_at = now()
    where id = p_id
    returning * into v_row;

    if v_row.id is null then
      raise exception 'No existe rol con id %', p_id;
    end if;
  end if;

  return v_row;
end;
$$;

grant execute on function public.admin_role_catalog_save(uuid, jsonb) to authenticated;

with wanted as (
  select *
  from (
    values
      ('admin',     'Administrador',          'Acceso completo al sistema', 10),
      ('rrhh',      'Recursos Humanos',       'Gestiona usuarios, marcaciones, cartas y comunicados', 20),
      ('marketing', 'Marketing',              'Gestiona informativo interno, noticias e imagenes', 30),
      ('manager',   'Responsable / Manager',  'Consulta equipo, turnos e incidencias asignadas', 40),
      ('employee',  'Empleado',               'Acceso personal a jornada, noticias y marcaciones', 50)
  ) as x(role, label, description, sort_order)
),
enum_roles as (
  select e.enumlabel as role
  from pg_enum e
  join pg_type t on t.oid = e.enumtypid
  join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public'
    and t.typname = 'app_role'
)
insert into public.access_role_catalog(role, label, description, active, sort_order)
select w.role::public.app_role, w.label, w.description, true, w.sort_order
from wanted w
join enum_roles e on e.role = w.role
where not exists (
  select 1 from public.access_role_catalog r where r.role::text = w.role
);

select id, role, label, description, active, sort_order, created_at, updated_at
from public.access_role_catalog
order by sort_order nulls last, role::text;

