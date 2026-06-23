-- ============================================================================
-- GrupMar Time v16.19 - Celebraciones canónico BD
--
-- Reglas:
-- - Cumpleaños NO se guarda aquí: sale de public.profiles.birth_date.
-- - Festivos se guardan en public.company_holidays.
-- - Santoral se guarda en public.saints_calendar.
-- - Nada de localStorage como fuente real.
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists public.company_holidays (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  holiday_date date null,
  mm_dd text not null,
  scope text not null default 'Empresa',
  country text not null default 'España',
  region text null default 'Baleares',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_holidays_mmdd_check check (mm_dd ~ '^[0-1][0-9]-[0-3][0-9]$')
);

create table if not exists public.saints_calendar (
  id uuid primary key default gen_random_uuid(),
  mm_dd text not null unique,
  day integer not null,
  month integer not null,
  names text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saints_calendar_mmdd_check check (mm_dd ~ '^[0-1][0-9]-[0-3][0-9]$')
);

create or replace function public.gmt_touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_company_holidays_touch on public.company_holidays;
create trigger trg_company_holidays_touch
before update on public.company_holidays
for each row execute function public.gmt_touch_updated_at();

drop trigger if exists trg_saints_calendar_touch on public.saints_calendar;
create trigger trg_saints_calendar_touch
before update on public.saints_calendar
for each row execute function public.gmt_touch_updated_at();

alter table public.company_holidays enable row level security;
alter table public.saints_calendar enable row level security;

drop policy if exists company_holidays_read_auth on public.company_holidays;
create policy company_holidays_read_auth
on public.company_holidays
for select
to authenticated
using (true);

drop policy if exists saints_calendar_read_auth on public.saints_calendar;
create policy saints_calendar_read_auth
on public.saints_calendar
for select
to authenticated
using (true);

drop function if exists public.admin_company_holiday_save(uuid, jsonb);
create function public.admin_company_holiday_save(
  p_id uuid,
  p_payload jsonb
)
returns public.company_holidays
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := nullif(trim(coalesce(p_payload->>'name','')), '');
  v_mm_dd text := nullif(trim(coalesce(p_payload->>'mm_dd','')), '');
  v_holiday_date date := nullif(p_payload->>'holiday_date','')::date;
  v_scope text := coalesce(nullif(trim(coalesce(p_payload->>'scope','')), ''), 'Empresa');
  v_country text := coalesce(nullif(trim(coalesce(p_payload->>'country','')), ''), 'España');
  v_region text := nullif(trim(coalesce(p_payload->>'region','')), '');
  v_active boolean := coalesce(nullif(p_payload->>'active','')::boolean, true);
  v_row public.company_holidays;
begin
  if v_name is null then
    raise exception 'El nombre del festivo es obligatorio';
  end if;

  if v_mm_dd is null and v_holiday_date is not null then
    v_mm_dd := to_char(v_holiday_date, 'MM-DD');
  end if;

  if v_mm_dd is null or v_mm_dd !~ '^[0-1][0-9]-[0-3][0-9]$' then
    raise exception 'Fecha MM-DD inválida: %', coalesce(v_mm_dd, '');
  end if;

  if p_id is null then
    insert into public.company_holidays(name, holiday_date, mm_dd, scope, country, region, active)
    values (v_name, v_holiday_date, v_mm_dd, v_scope, v_country, v_region, v_active)
    returning * into v_row;
  else
    update public.company_holidays
    set
      name = v_name,
      holiday_date = v_holiday_date,
      mm_dd = v_mm_dd,
      scope = v_scope,
      country = v_country,
      region = v_region,
      active = v_active,
      updated_at = now()
    where id = p_id
    returning * into v_row;

    if v_row.id is null then
      raise exception 'No existe festivo con id %', p_id;
    end if;
  end if;

  return v_row;
end;
$$;

grant execute on function public.admin_company_holiday_save(uuid, jsonb) to authenticated;

drop function if exists public.admin_saint_calendar_save(uuid, jsonb);
create function public.admin_saint_calendar_save(
  p_id uuid,
  p_payload jsonb
)
returns public.saints_calendar
language plpgsql
security definer
set search_path = public
as $$
declare
  v_names text := nullif(trim(coalesce(p_payload->>'names','')), '');
  v_mm_dd text := nullif(trim(coalesce(p_payload->>'mm_dd','')), '');
  v_day integer;
  v_month integer;
  v_active boolean := coalesce(nullif(p_payload->>'active','')::boolean, true);
  v_row public.saints_calendar;
begin
  if v_names is null then
    raise exception 'Los nombres del santoral son obligatorios';
  end if;

  if v_mm_dd is null or v_mm_dd !~ '^[0-1][0-9]-[0-3][0-9]$' then
    raise exception 'Fecha MM-DD inválida: %', coalesce(v_mm_dd, '');
  end if;

  v_month := split_part(v_mm_dd, '-', 1)::integer;
  v_day := split_part(v_mm_dd, '-', 2)::integer;

  if p_id is null then
    insert into public.saints_calendar(mm_dd, day, month, names, active)
    values (v_mm_dd, v_day, v_month, v_names, v_active)
    on conflict(mm_dd)
    do update set
      names = excluded.names,
      day = excluded.day,
      month = excluded.month,
      active = excluded.active,
      updated_at = now()
    returning * into v_row;
  else
    update public.saints_calendar
    set
      mm_dd = v_mm_dd,
      day = v_day,
      month = v_month,
      names = v_names,
      active = v_active,
      updated_at = now()
    where id = p_id
    returning * into v_row;

    if v_row.id is null then
      raise exception 'No existe santoral con id %', p_id;
    end if;
  end if;

  return v_row;
end;
$$;

grant execute on function public.admin_saint_calendar_save(uuid, jsonb) to authenticated;

drop function if exists public.admin_restore_company_holidays_base();
create function public.admin_restore_company_holidays_base()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.company_holidays(name, mm_dd, scope, country, region, active)
  values
    ('Año Nuevo', '01-01', 'España', 'España', null, true),
    ('Reyes', '01-06', 'España', 'España', null, true),
    ('Día de las Illes Balears', '03-01', 'Baleares', 'España', 'Baleares', true),
    ('Día del Trabajador', '05-01', 'España', 'España', null, true),
    ('Asunción de la Virgen', '08-15', 'España', 'España', null, true),
    ('Fiesta Nacional de España', '10-12', 'España', 'España', null, true),
    ('Todos los Santos', '11-01', 'España', 'España', null, true),
    ('Día de la Constitución', '12-06', 'España', 'España', null, true),
    ('Inmaculada Concepción', '12-08', 'España', 'España', null, true),
    ('Navidad', '12-25', 'España', 'España', null, true)
  on conflict do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.admin_restore_company_holidays_base() to authenticated;

drop function if exists public.admin_restore_saints_calendar_365();
create function public.admin_restore_saints_calendar_365()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.saints_calendar(mm_dd, day, month, names, active)
  values
      ('01-01', 1, 1, 'Emanuel, Jesús, Manuel'),
      ('01-02', 2, 1, 'Astrid, Basilio, Emma, Gregorio'),
      ('01-03', 3, 1, 'Daniel, Florencio, Genova/Genoveva, Jennifer, Prisciliano'),
      ('01-04', 4, 1, 'Eugenio'),
      ('01-05', 5, 1, 'Amada, Emiliana, Simón, Simona'),
      ('01-06', 6, 1, 'Adoración, Baltasar, Epifanía, Gaspar, Raymundo, Reyes'),
      ('01-07', 7, 1, 'Amadeo, Aquiles, Luciano, Raimundo'),
      ('01-08', 8, 1, 'Eladio, Maximino'),
      ('01-09', 9, 1, 'Julián, Pedro'),
      ('01-10', 10, 1, 'Alda, Aldo, Gonzalo, Hortensia, Marciano, Vilma'),
      ('01-11', 11, 1, 'Alejandro, Guillermo, Higinia, Higinio, Hortensia, Modesto'),
      ('01-12', 12, 1, 'Alfredo, Hilario, Tania, Tatiana'),
      ('01-13', 13, 1, 'Milagros, Verónica'),
      ('01-14', 14, 1, 'Félix, Gil'),
      ('01-15', 15, 1, 'Marcelo, Mauro, Raquel'),
      ('01-16', 16, 1, 'Odette, Oto, Priscila'),
      ('01-17', 17, 1, 'Alba, Alfredo, Antonio, Mariana, Mariano'),
      ('01-18', 18, 1, 'Beatriz, Florida, Mario, Pia'),
      ('01-19', 19, 1, 'Mario, Sebastián, Vicente'),
      ('01-20', 20, 1, 'Fabián'),
      ('01-21', 21, 1, 'Vicente'),
      ('01-22', 22, 1, 'Domingo, Emma, Gaudencio, Imanol'),
      ('01-23', 23, 1, 'Alberta, Alberto, Armando, Ildefonso, María Paz, Xenia'),
      ('01-24', 24, 1, 'Feliciano, Francisco, Paz'),
      ('01-25', 25, 1, 'Elvira, Paula, Timoteo'),
      ('01-26', 26, 1, 'Gonzalo, Paula, Tito'),
      ('01-27', 27, 1, 'Ángela, Tomás, Valerio'),
      ('01-28', 28, 1, 'Pedro, Tomas'),
      ('01-29', 29, 1, 'Martina, Valeria, Valerio'),
      ('01-30', 30, 1, 'Alejandro'),
      ('01-31', 31, 1, 'Juan'),
      ('02-01', 1, 2, 'Cecilio'),
      ('02-02', 2, 2, 'Aída, Ayuda, Candelaria, Catalina, Felipe, Néstor, Purificación'),
      ('02-03', 3, 2, 'Adelina, Blas, Oscar'),
      ('02-04', 4, 2, 'Gilberto, Isidro, Juana, Verónica'),
      ('02-05', 5, 2, 'Ágata, Águeda, Isaac'),
      ('02-06', 6, 2, 'Amanda, Amando, Gonzalo, Silvano'),
      ('02-07', 7, 2, 'Moisés, Ricardo'),
      ('02-08', 8, 2, 'Elisanda, Jerónimo, Lucio'),
      ('02-09', 9, 2, 'Apolonia, Donato, Reinaldo, Sabino'),
      ('02-10', 10, 2, 'Amancio, Arnaldo, Arnau, Guillermo'),
      ('02-11', 11, 2, 'Adolfo, Dante, Lourdes'),
      ('02-12', 12, 2, 'Eulalia, Modesto'),
      ('02-13', 13, 2, 'Benigno, Cristian'),
      ('02-14', 14, 2, 'Dionisio, Odile, Valentín, Valentina'),
      ('02-15', 15, 2, 'Faustino, Georgia, Georgina'),
      ('02-16', 16, 2, 'Elías, Isaías, Jeremías, Samuel'),
      ('02-17', 17, 2, 'Alexis, Constanza, Rómulo'),
      ('02-18', 18, 2, 'Lucio, Simeón'),
      ('02-19', 19, 2, 'Almudina, Álvaro, Conrado, Gabina, Gabino'),
      ('02-20', 20, 2, 'Eleuterio'),
      ('02-21', 21, 2, 'Irene, Pedro'),
      ('02-22', 22, 2, 'Leonor, Margarita'),
      ('02-23', 23, 2, 'Lázaro, Romance'),
      ('02-24', 24, 2, 'Modesto'),
      ('02-25', 25, 2, 'Cesáreo, Dióscoro'),
      ('02-26', 26, 2, 'Néstor'),
      ('02-27', 27, 2, 'Baldomero, Gabriel, Gabriela'),
      ('02-28', 28, 2, 'Leandro, Román, Romano'),
      ('03-01', 1, 3, 'Eudoxia, Eudoxio, Federico, Rosendo'),
      ('03-02', 2, 3, 'Enrique, Enriqueta, Heraclio, Pablo'),
      ('03-03', 3, 3, 'Medín, Rosendo'),
      ('03-04', 4, 3, 'Arcadio, Casimiro, Eugenio, Francisca'),
      ('03-05', 5, 3, 'Juan José'),
      ('03-06', 6, 3, 'Humberto, Judith, Nina, Olegario'),
      ('03-07', 7, 3, 'Clotilde, Felicidad'),
      ('03-08', 8, 3, 'Juan'),
      ('03-09', 9, 3, 'Cándido, Francisca'),
      ('03-10', 10, 3, 'Andrés, Macario'),
      ('03-11', 11, 3, 'Oria, Ramiro'),
      ('03-12', 12, 3, 'Fina, Josefina, Maximiliano'),
      ('03-13', 13, 3, 'Patricia, Ramiro, Rodrigo'),
      ('03-14', 14, 3, 'Florentina, Jacobo, Matilde'),
      ('03-15', 15, 3, 'César, Luis, Madrona, Raimundo'),
      ('03-16', 16, 3, 'Abrahan, Clemente'),
      ('03-17', 17, 3, 'Patricio'),
      ('03-18', 18, 3, 'Narciso, Salvador'),
      ('03-19', 19, 3, 'José, Josefa, Marcos'),
      ('03-20', 20, 3, 'Alejandra, Claudia'),
      ('03-21', 21, 3, 'Clemencia, Fabiola, Nicolás'),
      ('03-22', 22, 3, 'Octaviano, Sergio'),
      ('03-23', 23, 3, 'Fidel, José, Oriol, Victoriano'),
      ('03-24', 24, 3, 'Delmiro, Edelmira, Edelmiro, Timolao'),
      ('03-25', 25, 3, 'Abel, Anunciación, Encarnación, Gloria, Humberto, Maite, Rebeca'),
      ('03-26', 26, 3, 'Braulio, Diego'),
      ('03-27', 27, 3, 'Alejandro, Lilia, Ruperto'),
      ('03-28', 28, 3, 'Esperanza, Gundelina'),
      ('03-29', 29, 3, 'Jonas, Segundo'),
      ('03-30', 30, 3, 'Quirino'),
      ('03-31', 31, 3, 'Amós, Benjamín'),
      ('04-01', 1, 4, 'Venancio'),
      ('04-02', 2, 4, 'Francisco, Ofelia'),
      ('04-03', 3, 4, 'Sixto'),
      ('04-04', 4, 4, 'Isidoro, Platón'),
      ('04-05', 5, 4, 'Emilia, Vicente'),
      ('04-06', 6, 4, 'Celso, Diógenes'),
      ('04-07', 7, 4, 'Donato, Juan'),
      ('04-08', 8, 4, 'Amancio, Dionisio'),
      ('04-09', 9, 4, 'Casilda, Eusequio, Hugo'),
      ('04-10', 10, 4, 'Ezequiel'),
      ('04-11', 11, 4, 'Estanislao, Gema, Oria'),
      ('04-12', 12, 4, 'Andrés, Damián, Julio'),
      ('04-13', 13, 4, 'Hermenegildo, Martín'),
      ('04-14', 14, 4, 'Lamberto'),
      ('04-15', 15, 4, 'Aníbal, Máximo'),
      ('04-16', 16, 4, 'Bernadeta, Engracia'),
      ('04-17', 17, 4, 'Anicéto, Rodolfo'),
      ('04-18', 18, 4, 'Perfecto'),
      ('04-19', 19, 4, 'Crescencio, León'),
      ('04-20', 20, 4, 'Inés, Víctor'),
      ('04-21', 21, 4, 'Anselmo'),
      ('04-22', 22, 4, 'Alexander, Apeles, Teodoro'),
      ('04-23', 23, 4, 'Adalberto, Jorge'),
      ('04-24', 24, 4, 'Fidel, Honoria, Honorio, Leoncio'),
      ('04-25', 25, 4, 'Antonieta, Antonio, Erminío, Herminío, Marcia, Marco'),
      ('04-26', 26, 4, 'Basilio, Engracia, Isidoro, Marcelino'),
      ('04-27', 27, 4, 'Montserrat, Zita'),
      ('04-28', 28, 4, 'Amado, Pedro'),
      ('04-29', 29, 4, 'Catalina, Karen, Katia, Teodora, Wilfredo'),
      ('04-30', 30, 4, 'Amador, Jaime, Pía, Pío'),
      ('05-01', 1, 5, 'Andeoro, Berta, Oroncio, Paciencia, Tamar, Tamara, Teodardo'),
      ('05-02', 2, 5, 'Araceli, Atanasio, Exuperio, Germán, Mafalda, Vindemial, Zoé'),
      ('05-03', 3, 5, 'Alejandro, Estela, Evencio, Felipe, Juvenal, Teódulo, Violeta'),
      ('05-04', 4, 5, 'Florián, Froilán, Lidón, Paulino, Porfirio, Silvano'),
      ('05-05', 5, 5, 'Adrián, Ángelica, Niceto, Silvano'),
      ('05-06', 6, 5, 'Domingo, Evodio, Judith, Protógenes'),
      ('05-07', 7, 5, 'Augusto, Flavio, Gisela'),
      ('05-08', 8, 5, 'Acacio'),
      ('05-09', 9, 5, 'Geroncio, Gregorio, Hermas'),
      ('05-10', 10, 5, 'Gordiano, Job, Solange'),
      ('05-11', 11, 5, 'Amparo, Anastasio, Estela, Eudaldo, Favio, Iluminado, Poncio'),
      ('05-12', 12, 5, 'Aquileo, Domingo, Domitila, Flavia, Nerea, Nereo'),
      ('05-13', 13, 5, 'Fátima, Imelda'),
      ('05-14', 14, 5, 'Alba, Cora, Corona, Gemma, Henedina, Matías'),
      ('05-15', 15, 5, 'Cecilio, Eufrasia, Indalecio, Isidro, Torcuato'),
      ('05-16', 16, 5, 'Brenda, Honorato, Ubaldo'),
      ('05-17', 17, 5, 'Eric, Erica, Pascual'),
      ('05-18', 18, 5, 'Alejandra, Félix, Próspero'),
      ('05-19', 19, 5, 'Celestina, Celestino, Crispín'),
      ('05-20', 20, 5, 'Asterio, Baudilio, Orlando'),
      ('05-21', 21, 5, 'Constantino, Giselle, Valente, Virginia'),
      ('05-22', 22, 5, 'Emilio, Rita, Rosana'),
      ('05-23', 23, 5, 'Desiderio, Eufebio, Humildad, Mercurial, Miguel'),
      ('05-24', 24, 5, 'Auxiliadora, Ester, Providencia, Rocío, Susana'),
      ('05-25', 25, 5, 'Sonia, Valentín, Valentina'),
      ('05-26', 26, 5, 'Felipei, Zacarías'),
      ('05-27', 27, 5, 'Carolina'),
      ('05-28', 28, 5, 'Agustín, Bernardo, Emilio, Germán'),
      ('05-29', 29, 5, 'Alejandro, Justo, Teodosia'),
      ('05-30', 30, 5, 'Estela, Fernanda, Fernando, Hernán, Hernando, Lorena'),
      ('05-31', 31, 5, 'Amelia, Avelina, Petronila, Visitación'),
      ('06-01', 1, 6, 'Alta, Candelaria, Gracia, Graciano, Inigo, Jimena, Laura'),
      ('06-02', 2, 6, 'Ausonia, Blandina, Edelmira, Erasmo, Marcelino'),
      ('06-03', 3, 6, 'Cecilio, Clotilde, Davino, Kevin, Luciniano, Oliva'),
      ('06-04', 4, 6, 'Emma, Noemí, Quirino, Ruth, Saturnina'),
      ('06-05', 5, 6, 'Bonifacio, Doroteo, Eloisa, Igor, Marcia, Nicanor, Valeria'),
      ('06-06', 6, 6, 'Amancio, Artemio, Cándida, Ismael, Norberto'),
      ('06-07', 7, 6, 'Roberto'),
      ('06-08', 8, 6, 'Giraldo'),
      ('06-09', 9, 6, 'Blanca, Diana, Efraín, Feliciano, Primo'),
      ('06-10', 10, 6, 'Amalia, Amelia, Asterio, Críspulo, Getulio, Máximo, Trinidad'),
      ('06-11', 11, 6, 'Aléida, Benito, Bernabé'),
      ('06-12', 12, 6, 'Cirilo, Nazario, Olimpo'),
      ('06-13', 13, 6, 'Andoni, Antonia, Antonio, Joel'),
      ('06-14', 14, 6, 'Digna, Eliseo, Félix'),
      ('06-15', 15, 6, 'Benilde, Crescencia, Eutrópia, Landelino, Libia, Lidia, Vito'),
      ('06-16', 16, 6, 'Alina, Aquilino, Aureliano, Ciro, Regina, Regis, Siro'),
      ('06-17', 17, 6, 'Isauro, Ismael, Montano'),
      ('06-18', 18, 6, 'Justo, Marceliano, Marina'),
      ('06-19', 19, 6, 'Aurora'),
      ('06-20', 20, 6, 'Elia, Macario, Silverio'),
      ('06-21', 21, 6, 'Demetria, Gina, Koldo, Luis, Raul, Rodolfo, Terencio'),
      ('06-22', 22, 6, 'Albano, Paulino'),
      ('06-23', 23, 6, 'Agripina, Alicia, Apolo, Inmaculada, Walter'),
      ('06-24', 24, 6, 'Iván, Ivana, Jean, Joan, Jon, Juan, Juana'),
      ('06-25', 25, 6, 'Guillermo, Salomón'),
      ('06-26', 26, 6, 'Alicia, Antelmo, Pelayo, Virgilio'),
      ('06-27', 27, 6, 'Anecto, Ladislao, Sansón, Socorro, Zoilo'),
      ('06-28', 28, 6, 'Marcela'),
      ('06-29', 29, 6, 'Ciro, David, Pablo, Paola, Pedro, Siro'),
      ('06-30', 30, 6, 'Leonila, Marcial'),
      ('07-01', 1, 7, 'Aarón, Esther, Luz'),
      ('07-02', 2, 7, 'Martiniano, Teobaldo, Teodorico, Vidal, Visitación'),
      ('07-03', 3, 7, 'Amable, Enrique, Heliodoro, Jacinto, Tomás'),
      ('07-04', 4, 7, 'Berta, Elizabeth, Inocencio, Isabel, Laureano'),
      ('07-05', 5, 7, 'Filomena, Filomeno, Zoa'),
      ('07-06', 6, 7, 'Dominica, Isaías, Rómulo'),
      ('07-07', 7, 7, 'Fermín, Germano, Odón, Peregrino, Roberto'),
      ('07-08', 8, 7, 'Adrián, Edgar, Marina, Priscila'),
      ('07-09', 9, 7, 'Milagros, Verónica'),
      ('07-10', 10, 7, 'Cristóbal, Honorato, Silvano'),
      ('07-11', 11, 7, 'Abundio, Benito, Olga, Sabino'),
      ('07-12', 12, 7, 'Oliverio, Paulina'),
      ('07-13', 13, 7, 'Eugenio, Joel, Sara'),
      ('07-14', 14, 7, 'Camila, Camilo, Vladimiro'),
      ('07-15', 15, 7, 'Carmela, Carmelo, Fausto, Hilaria, Hilario'),
      ('07-16', 16, 7, 'Carmen, Generosa, Marcelina'),
      ('07-17', 17, 7, 'Elías'),
      ('07-18', 18, 7, 'Emiliano, Federico, Luz'),
      ('07-19', 19, 7, 'Aurea, Aureo'),
      ('07-20', 20, 7, 'Elías, Elisa'),
      ('07-21', 21, 7, 'Angelina, Angelines, Daniel, Julia, Lorenza'),
      ('07-22', 22, 7, 'Magdalena, Primitiva, Teófila, Zaida, Zoraida'),
      ('07-23', 23, 7, 'Boris, Brigida, Teresa'),
      ('07-24', 24, 7, 'Cristina'),
      ('07-25', 25, 7, 'Jaime, Santiago'),
      ('07-26', 26, 7, 'Ana, Joaquín'),
      ('07-27', 27, 7, 'Cucufate, Natalia'),
      ('07-28', 28, 7, 'Celso'),
      ('07-29', 29, 7, 'Marta, Olavo'),
      ('07-30', 30, 7, 'Abdón'),
      ('07-31', 31, 7, 'Ignacio'),
      ('08-01', 1, 8, 'Alfonso, Dalmau'),
      ('08-02', 2, 8, 'Angeles, Eusebio'),
      ('08-03', 3, 8, 'Gustavo, Lídia'),
      ('08-04', 4, 8, 'Juan María'),
      ('08-05', 5, 8, 'Africa, Blanca, Nieves'),
      ('08-06', 6, 8, 'Salvador'),
      ('08-07', 7, 8, 'Cayetano'),
      ('08-08', 8, 8, 'Domingo'),
      ('08-09', 9, 8, 'Edith'),
      ('08-10', 10, 8, 'Lorenzo'),
      ('08-11', 11, 8, 'Clara, Filomena, Susana'),
      ('08-12', 12, 8, 'Herculano'),
      ('08-13', 13, 8, 'Aurora, Hipólito'),
      ('08-14', 14, 8, 'Atanasia'),
      ('08-15', 15, 8, 'Asunción, Estrella, José, María, Paloma'),
      ('08-16', 16, 8, 'Roque'),
      ('08-17', 17, 8, 'Isaac, Jacinto'),
      ('08-18', 18, 8, 'Elena'),
      ('08-19', 19, 8, 'Magín'),
      ('08-20', 20, 8, 'Bernardo'),
      ('08-21', 21, 8, 'Sidonio'),
      ('08-22', 22, 8, 'Reina'),
      ('08-23', 23, 8, 'Rosa'),
      ('08-24', 24, 8, 'Bartolomé'),
      ('08-25', 25, 8, 'Ginés'),
      ('08-26', 26, 8, 'Ceferino'),
      ('08-27', 27, 8, 'Mónica'),
      ('08-28', 28, 8, 'Agustín'),
      ('08-29', 29, 8, 'Sabina'),
      ('08-30', 30, 8, 'Gaudencia'),
      ('08-31', 31, 8, 'Raimón, Ramón'),
      ('09-01', 1, 9, 'Arturo, Egidio, Gil'),
      ('09-02', 2, 9, 'Antolín, Raquel'),
      ('09-03', 3, 9, 'Dorotea'),
      ('09-04', 4, 9, 'Moisés, Rosalía'),
      ('09-05', 5, 9, 'Eudosio'),
      ('09-06', 6, 9, 'Eva, Fausto'),
      ('09-07', 7, 9, 'Regina'),
      ('09-08', 8, 9, 'Adela, Meritxell, Nuria'),
      ('09-09', 9, 9, 'Claustro, Felicia'),
      ('09-10', 10, 9, 'Nicolás'),
      ('09-11', 11, 9, 'Patiens'),
      ('09-12', 12, 9, 'Dulce, María'),
      ('09-13', 13, 9, 'Juan'),
      ('09-14', 14, 9, 'Exaltación'),
      ('09-15', 15, 9, 'Aurora, Dolores'),
      ('09-16', 16, 9, 'Rogelio'),
      ('09-17', 17, 9, 'Ariadna, Columba, Roberto'),
      ('09-18', 18, 9, 'Sofía'),
      ('09-19', 19, 9, 'Nilo'),
      ('09-20', 20, 9, 'Eustaquio'),
      ('09-21', 21, 9, 'Mateo, Mauricio'),
      ('09-22', 22, 9, 'Digna, Inocencio'),
      ('09-23', 23, 9, 'Lina, Lino, Tecla'),
      ('09-24', 24, 9, 'Gerardo, Mercedes'),
      ('09-25', 25, 9, 'Dalmacio'),
      ('09-26', 26, 9, 'Cosme, Damián'),
      ('09-27', 27, 9, 'Florentino, Vicente'),
      ('09-28', 28, 9, 'Wenceslao'),
      ('09-29', 29, 9, 'Gabriel, Miguel, Rafael'),
      ('09-30', 30, 9, 'Jerónimo'),
      ('10-01', 1, 10, 'Teresa'),
      ('10-02', 2, 10, 'Angeles Custodios'),
      ('10-03', 3, 10, 'Cándido, Francisco'),
      ('10-04', 4, 10, 'Francisco'),
      ('10-05', 5, 10, 'Gala, Plácido'),
      ('10-06', 6, 10, 'Bruno'),
      ('10-07', 7, 10, 'Rosario'),
      ('10-08', 8, 10, 'Salud, Thaís'),
      ('10-09', 9, 10, 'Abrahan, Dionisio'),
      ('10-10', 10, 10, 'Tomás'),
      ('10-11', 11, 10, 'Begona'),
      ('10-12', 12, 10, 'Pilar, Serafín'),
      ('10-13', 13, 10, 'Eduardo'),
      ('10-14', 14, 10, 'Calixto'),
      ('10-15', 15, 10, 'Teresa'),
      ('10-16', 16, 10, 'Margarita, María'),
      ('10-17', 17, 10, 'Ignacio'),
      ('10-18', 18, 10, 'Lucas'),
      ('10-19', 19, 10, 'Laura'),
      ('10-20', 20, 10, 'Academia, Irene'),
      ('10-21', 21, 10, 'Griselda, Ursula'),
      ('10-22', 22, 10, 'Salomé'),
      ('10-23', 23, 10, 'Servando'),
      ('10-24', 24, 10, 'Antonio'),
      ('10-25', 25, 10, 'Bernardo'),
      ('10-26', 26, 10, 'Evaristo'),
      ('10-27', 27, 10, 'Capitolina'),
      ('10-28', 28, 10, 'Judas, Simón, Tadeo'),
      ('10-29', 29, 10, 'Narciso'),
      ('10-30', 30, 10, 'Bienvenida, Claudio'),
      ('10-31', 31, 10, 'Quintin'),
      ('11-01', 1, 11, 'Benigno, Penélope'),
      ('11-02', 2, 11, 'Gorka, Jorge'),
      ('11-03', 3, 11, 'Ermengol, Silvia'),
      ('11-04', 4, 11, 'Carlos, Carlota, Carolina'),
      ('11-05', 5, 11, 'Elisabet, Isabel, Zacarías'),
      ('11-06', 6, 11, 'Leonardo'),
      ('11-07', 7, 11, 'Carina, Ernesto'),
      ('11-08', 8, 11, 'Severiano'),
      ('11-09', 9, 11, 'Teodoro'),
      ('11-10', 10, 11, 'Almudena, León'),
      ('11-11', 11, 11, 'Martín'),
      ('11-12', 12, 11, 'Aurelio'),
      ('11-13', 13, 11, 'Diego, Leandro'),
      ('11-14', 14, 11, 'Clemente, Teodoto'),
      ('11-15', 15, 11, 'Alberto, Leopoldo'),
      ('11-16', 16, 11, 'Edmundo, Margarita'),
      ('11-17', 17, 11, 'Gertrudis, Hilda, Isabel, Victoria'),
      ('11-18', 18, 11, 'Aurelio'),
      ('11-19', 19, 11, 'Crispino, Fausto'),
      ('11-20', 20, 11, 'Félix, Lucrecia, Ocatavio'),
      ('11-21', 21, 11, 'Demetrio, Fructuoso, Piedad'),
      ('11-22', 22, 11, 'Cecilia'),
      ('11-23', 23, 11, 'Clemente'),
      ('11-24', 24, 11, 'Flora'),
      ('11-25', 25, 11, 'Erasmo'),
      ('11-26', 26, 11, 'Juan'),
      ('11-27', 27, 11, 'Auxilio'),
      ('11-28', 28, 11, 'Rufo'),
      ('11-29', 29, 11, 'Saturnino'),
      ('11-30', 30, 11, 'Andrés'),
      ('12-01', 1, 12, 'Adelaida, Eloy, Hugo'),
      ('12-02', 2, 12, 'Elisa, Elsa'),
      ('12-03', 3, 12, 'Francisco Javier, María'),
      ('12-04', 4, 12, 'Bárbara'),
      ('12-05', 5, 12, 'Crispina'),
      ('12-06', 6, 12, 'Nicolás'),
      ('12-07', 7, 12, 'Ambrosio'),
      ('12-08', 8, 12, 'Concepción, Inmaculada, Pura'),
      ('12-09', 9, 12, 'Juan'),
      ('12-10', 10, 12, 'Eulalia'),
      ('12-11', 11, 12, 'Dámaso'),
      ('12-12', 12, 12, 'Chantal, Guadalupe'),
      ('12-13', 13, 12, 'Lucía'),
      ('12-14', 14, 12, 'Juan, Nicasio, Pompeyo'),
      ('12-15', 15, 12, 'Cristina, Fortunato'),
      ('12-16', 16, 12, 'Albina'),
      ('12-17', 17, 12, 'Lázaro, Yolanda'),
      ('12-18', 18, 12, 'Esperanza, Macarena'),
      ('12-19', 19, 12, 'Darío'),
      ('12-20', 20, 12, 'Ptolomeo'),
      ('12-21', 21, 12, 'Pedro'),
      ('12-22', 22, 12, 'Floro'),
      ('12-23', 23, 12, 'Juan'),
      ('12-24', 24, 12, 'Delfín, Társila'),
      ('12-25', 25, 12, 'Belén, Eugenia, Natividad'),
      ('12-26', 26, 12, 'Esteban'),
      ('12-27', 27, 12, 'Teófanos'),
      ('12-28', 28, 12, 'Abel'),
      ('12-29', 29, 12, 'Davíd'),
      ('12-30', 30, 12, 'Raúl'),
      ('12-31', 31, 12, 'Silvestre')
  on conflict(mm_dd)
  do update set
    names = excluded.names,
    day = excluded.day,
    month = excluded.month,
    active = true,
    updated_at = now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.admin_restore_saints_calendar_365() to authenticated;

-- Seed inicial seguro.
select public.admin_restore_company_holidays_base();
select public.admin_restore_saints_calendar_365();

