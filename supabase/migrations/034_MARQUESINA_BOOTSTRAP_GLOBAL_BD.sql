-- ============================================================================
-- GrupMar Time v16.19.24 - RPC REAL PARA MARQUESINA GLOBAL
--
-- Fuente única: BD.
-- No localStorage.
-- No sessionStorage.
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists public.gmt_checkin_config (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gmt_checkin_config_history (
  id uuid primary key default gen_random_uuid(),
  config_key text not null,
  settings jsonb not null,
  action text not null default 'save',
  created_by uuid null,
  created_at timestamptz not null default now()
);

alter table public.gmt_checkin_config enable row level security;
alter table public.gmt_checkin_config_history enable row level security;

drop policy if exists gmt_checkin_config_read_auth on public.gmt_checkin_config;
create policy gmt_checkin_config_read_auth
on public.gmt_checkin_config
for select
to authenticated
using (true);

drop policy if exists gmt_checkin_config_write_auth on public.gmt_checkin_config;
create policy gmt_checkin_config_write_auth
on public.gmt_checkin_config
for all
to authenticated
using (true)
with check (true);

drop policy if exists gmt_checkin_config_history_read_auth on public.gmt_checkin_config_history;
create policy gmt_checkin_config_history_read_auth
on public.gmt_checkin_config_history
for select
to authenticated
using (true);

drop policy if exists gmt_checkin_config_history_insert_auth on public.gmt_checkin_config_history;
create policy gmt_checkin_config_history_insert_auth
on public.gmt_checkin_config_history
for insert
to authenticated
with check (true);

create or replace function public.gmt_save_checkin_config(
  p_key text,
  p_settings jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings jsonb;
begin
  if p_key is null or btrim(p_key) = '' then
    raise exception 'p_key obligatorio';
  end if;

  v_settings := coalesce(p_settings, '{}'::jsonb);

  insert into public.gmt_checkin_config(key, settings)
  values (p_key, v_settings)
  on conflict(key)
  do update set
    settings = excluded.settings,
    updated_at = now();

  insert into public.gmt_checkin_config_history(config_key, settings, action, created_by)
  values (p_key, v_settings, 'save', auth.uid());

  return v_settings;
end;
$$;

grant execute on function public.gmt_save_checkin_config(text, jsonb) to authenticated;

create or replace function public.gmt_get_checkin_config(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select settings from public.gmt_checkin_config where key = p_key limit 1),
    '{}'::jsonb
  );
$$;

grant execute on function public.gmt_get_checkin_config(text) to authenticated;

create or replace function public.gmt_company_ticker_items()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb := '[]'::jsonb;
  v_settings jsonb;
  v_item jsonb;
  v_row record;
  v_key text;
  v_keys text[] := array[
    'items',
    'tickerItems',
    'ticker_items',
    'messages',
    'notices',
    'announcements',
    'marquee',
    'marquesina',
    'companyTicker',
    'company_ticker'
  ];
  v_text text;
  v_icon text;
  v_status text;
  v_active text;
begin
  for v_row in
    select key, settings
    from public.gmt_checkin_config
    order by
      case key
        when 'company_ticker' then 1
        when 'marquesina' then 2
        when 'ticker' then 3
        else 9
      end,
      updated_at desc
  loop
    v_settings := coalesce(v_row.settings, '{}'::jsonb);

    v_active := lower(coalesce(v_settings->>'enabled', v_settings->>'active', 'true'));
    if v_active in ('false','0','no','inactive','inactivo') then
      continue;
    end if;

    foreach v_key in array v_keys loop
      if jsonb_typeof(v_settings -> v_key) = 'array' then
        for v_item in select value from jsonb_array_elements(v_settings -> v_key) loop
          v_status := lower(coalesce(v_item->>'status', 'published'));
          v_active := lower(coalesce(v_item->>'enabled', v_item->>'active', v_item->>'is_active', 'true'));

          if v_status in ('draft','borrador','inactive','inactivo','retired','retirado') then
            continue;
          end if;

          if v_active in ('false','0','no','inactive','inactivo') then
            continue;
          end if;

          v_text := btrim(coalesce(
            v_item->>'text',
            v_item->>'message',
            v_item->>'body',
            v_item->>'content',
            v_item->>'title',
            v_item->>'label',
            ''
          ));

          if v_text <> '' then
            v_icon := btrim(coalesce(
              v_item->>'icon',
              v_item->>'emoji',
              case
                when jsonb_typeof(v_item->'icons') = 'array' then
                  (select string_agg(value #>> '{}', ' ') from jsonb_array_elements(v_item->'icons'))
                else ''
              end,
              ''
            ));

            v_result := v_result || jsonb_build_array(
              jsonb_build_object(
                'id', coalesce(v_item->>'id', md5(v_row.key || ':' || v_text)),
                'text', v_text,
                'icon', v_icon,
                'source', 'gmt_checkin_config:' || v_row.key,
                'settings', v_settings
              )
            );
          end if;
        end loop;
      end if;
    end loop;

    v_text := btrim(coalesce(
      v_settings->>'text',
      v_settings->>'message',
      v_settings->>'body',
      v_settings->>'content',
      v_settings->>'title',
      ''
    ));

    if v_text <> '' then
      v_result := v_result || jsonb_build_array(
        jsonb_build_object(
          'id', md5(v_row.key || ':' || v_text),
          'text', v_text,
          'icon', coalesce(v_settings->>'icon', v_settings->>'emoji', '📣'),
          'source', 'gmt_checkin_config:' || v_row.key,
          'settings', v_settings
        )
      );
    end if;
  end loop;

  if jsonb_array_length(v_result) = 0 and to_regclass('public.checkin_messages') is not null then
    for v_row in execute
      'select to_jsonb(t) as j
       from public.checkin_messages t
       order by coalesce(to_jsonb(t)->>''updated_at'', to_jsonb(t)->>''created_at'', '''') desc
       limit 50'
    loop
      v_status := lower(coalesce(v_row.j->>'status', 'published'));
      v_active := lower(coalesce(v_row.j->>'is_active', v_row.j->>'active', v_row.j->>'enabled', 'true'));

      if v_status in ('draft','borrador','inactive','inactivo','retired','retirado') then
        continue;
      end if;

      if v_active in ('false','0','no','inactive','inactivo') then
        continue;
      end if;

      v_text := btrim(coalesce(
        v_row.j->>'text',
        v_row.j->>'message',
        v_row.j->>'body',
        v_row.j->>'content',
        v_row.j->>'title',
        ''
      ));

      if v_text <> '' then
        v_result := v_result || jsonb_build_array(
          jsonb_build_object(
            'id', coalesce(v_row.j->>'id', md5(v_text)),
            'text', v_text,
            'icon', coalesce(v_row.j->>'icon', v_row.j->>'emoji', '📣'),
            'source', 'public.checkin_messages'
          )
        );
      end if;
    end loop;
  end if;

  return v_result;
end;
$$;

grant execute on function public.gmt_company_ticker_items() to authenticated;

insert into public.gmt_checkin_config(key, settings)
values ('company_ticker', jsonb_build_object('enabled', true, 'active', true, 'items', '[]'::jsonb, 'palette', 'corporate', 'speedSeconds', 26))
on conflict(key) do nothing;

select public.gmt_company_ticker_items() as ticker_items;

