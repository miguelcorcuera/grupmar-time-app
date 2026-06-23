-- ============================================================================
-- GrupMar Time v16.18.3 - RPC canónica para Empresas
--
-- Tabla real:
-- public.companies(id, name, legal_name, tax_id, logo_storage_path,
--                  active, created_at, updated_at)
--
-- Corrige el error conceptual:
-- - Empresas NO tiene description.
-- - CIF/NIF corresponde a tax_id.
-- - Razón social corresponde a legal_name.
-- ============================================================================

create or replace function public.admin_company_save(
  p_id uuid,
  p_payload jsonb
)
returns public.companies
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := nullif(trim(coalesce(p_payload->>'name','')), '');
  v_legal_name text := nullif(trim(coalesce(p_payload->>'legal_name','')), '');
  v_tax_id text := nullif(trim(coalesce(p_payload->>'tax_id','')), '');
  v_logo_storage_path text := nullif(trim(coalesce(p_payload->>'logo_storage_path','')), '');
  v_active boolean := coalesce(nullif(p_payload->>'active','')::boolean, true);
  v_row public.companies;
begin
  if v_name is null then
    raise exception 'El nombre de la empresa es obligatorio';
  end if;

  if v_legal_name is null then
    v_legal_name := v_name;
  end if;

  if p_id is null then
    insert into public.companies(
      name,
      legal_name,
      tax_id,
      logo_storage_path,
      active
    )
    values (
      v_name,
      v_legal_name,
      v_tax_id,
      v_logo_storage_path,
      v_active
    )
    returning * into v_row;
  else
    update public.companies
    set
      name = v_name,
      legal_name = v_legal_name,
      tax_id = v_tax_id,
      logo_storage_path = v_logo_storage_path,
      active = v_active,
      updated_at = now()
    where id = p_id
    returning * into v_row;

    if v_row.id is null then
      raise exception 'No existe empresa con id %', p_id;
    end if;
  end if;

  return v_row;
end;
$$;

grant execute on function public.admin_company_save(uuid, jsonb) to authenticated;

