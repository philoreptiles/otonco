-- ============================================================
-- Multi-tenencia: varios criadores en un solo proyecto Supabase
-- ------------------------------------------------------------
-- CONTEXTO: el plan gratuito de Supabase solo permite 2 proyectos
-- activos a la vez. Para los primeros 5 clientes, todos comparten
-- este único proyecto/base de datos, y cada uno tiene su propio
-- sitio desplegado (su propio site-config.js, su propio dominio).
--
-- LO QUE CAMBIA:
--   1. Cada ejemplar/especie queda ligado a un criador_id.
--   2. El catálogo público de cada sitio filtra por SU PROPIO
--      criador_id (vía site-config.js) -- esto NO es una frontera
--      de seguridad, es solo para no mezclar catálogos: los datos
--      que el público puede leer (visible_publico = true) son,
--      por definición, públicos de cualquier forma.
--   3. La frontera de seguridad real está en el panel admin: el
--      criador A jamás debe poder leer/editar/borrar datos del
--      criador B, aunque comparta el mismo proyecto y la misma
--      llave "anon". Esto lo garantiza RLS, no la app.
--
-- Corre este script UNA VEZ en el proyecto compartido, antes de
-- dar de alta al primer criador en él.
-- ============================================================


-- 1) Tabla de criadores -------------------------------------------------
-- No se consulta desde el frontend en tiempo de ejecución (cada sitio
-- ya trae su criador_id fijo en site-config.js), así que se queda sin
-- ninguna política de RLS que la exponga por la API -- solo tú la
-- tocas desde el SQL Editor.

create table if not exists public.criadores (
    id bigint generated always as identity primary key,
    slug text not null unique,
    nombre text not null,
    activo boolean not null default true,
    creado_en timestamptz not null default now()
);

alter table public.criadores enable row level security;
-- (a propósito, sin ninguna política -- nadie accede vía API)


-- 2) Mapeo usuario de Auth -> criador -----------------------------------
-- Cuando das de alta el usuario admin de un criador nuevo en Supabase
-- Auth, aquí registras a qué criador pertenece. RLS de ejemplares y
-- especies usa esta tabla para saber "de quién son los datos que este
-- usuario puede tocar".

create table if not exists public.perfiles_admin (
    user_id uuid primary key references auth.users(id) on delete cascade,
    criador_id bigint not null references public.criadores(id),
    creado_en timestamptz not null default now()
);

alter table public.perfiles_admin enable row level security;

create policy "Cada quien lee solo su propio mapeo"
on public.perfiles_admin for select
to authenticated
using (user_id = auth.uid());


-- 3) Agregar criador_id a ejemplares y especies -------------------------

alter table public.ejemplares add column if not exists criador_id bigint references public.criadores(id);
alter table public.especies add column if not exists criador_id bigint references public.criadores(id);


-- 4) Backfill: registra al criador que ya tiene datos en este proyecto
--    (ajusta slug/nombre si no es Escama y Colmillo) y asígnaselos.

insert into public.criadores (slug, nombre)
values ('escama-y-colmillo', 'Escama y Colmillo')
on conflict (slug) do nothing;

update public.ejemplares
set criador_id = (select id from public.criadores where slug = 'escama-y-colmillo')
where criador_id is null;

update public.especies
set criador_id = (select id from public.criadores where slug = 'escama-y-colmillo')
where criador_id is null;

alter table public.ejemplares alter column criador_id set not null;
alter table public.especies alter column criador_id set not null;


-- 5) Corregir unicidad: "id" y "nombre" dejan de ser únicos de forma
--    GLOBAL y pasan a ser únicos POR CRIADOR. Sin esto, el criador B
--    no podría usar el código "CR-01" solo porque el criador A ya lo
--    usó (aunque sean negocios completamente distintos).
--
--    NOTA: si el nombre real de alguno de estos constraints es
--    distinto en tu proyecto, corre primero esta consulta para
--    confirmarlo antes de continuar:
--
--    select conname, conrelid::regclass
--    from pg_constraint
--    where conrelid in ('public.ejemplares'::regclass, 'public.especies'::regclass)
--      and contype in ('p', 'u');

alter table public.ejemplares drop constraint if exists ejemplares_pkey;
alter table public.ejemplares add primary key (criador_id, id);

alter table public.especies drop constraint if exists especies_nombre_key;
alter table public.especies add constraint especies_criador_nombre_key unique (criador_id, nombre);


-- 6) Reescribir RLS de ejemplares y especies -----------------------------
-- Reemplaza por completo las políticas de rls_ejemplares_especies.sql
-- (corridas en la sesión anterior) por versiones que aíslan por criador.

drop policy if exists "Publico lee solo ejemplares visibles" on public.ejemplares;
drop policy if exists "Autenticados leen todo el inventario" on public.ejemplares;
drop policy if exists "Autenticados insertan ejemplares" on public.ejemplares;
drop policy if exists "Autenticados actualizan ejemplares" on public.ejemplares;
drop policy if exists "Autenticados borran ejemplares" on public.ejemplares;

drop policy if exists "Autenticados leen especies" on public.especies;
drop policy if exists "Autenticados insertan especies" on public.especies;
drop policy if exists "Autenticados actualizan especies" on public.especies;
drop policy if exists "Autenticados borran especies" on public.especies;

-- ejemplares: público sigue igual (esto NO aísla por criador a
-- propósito -- ver nota al inicio del archivo).
create policy "Publico lee solo ejemplares visibles"
on public.ejemplares for select
to anon
using (visible_publico = true);

-- ejemplares: autenticados quedan encerrados a su propio criador.
create policy "Autenticados leen su propio inventario"
on public.ejemplares for select
to authenticated
using (criador_id = (select criador_id from public.perfiles_admin where user_id = auth.uid()));

create policy "Autenticados insertan en su propio criador"
on public.ejemplares for insert
to authenticated
with check (criador_id = (select criador_id from public.perfiles_admin where user_id = auth.uid()));

create policy "Autenticados actualizan su propio inventario"
on public.ejemplares for update
to authenticated
using (criador_id = (select criador_id from public.perfiles_admin where user_id = auth.uid()))
with check (criador_id = (select criador_id from public.perfiles_admin where user_id = auth.uid()));

create policy "Autenticados borran su propio inventario"
on public.ejemplares for delete
to authenticated
using (criador_id = (select criador_id from public.perfiles_admin where user_id = auth.uid()));

-- especies: mismo patrón (nunca tuvo lectura pública, sigue igual).
create policy "Autenticados leen sus propias especies"
on public.especies for select
to authenticated
using (criador_id = (select criador_id from public.perfiles_admin where user_id = auth.uid()));

create policy "Autenticados insertan en su propio criador"
on public.especies for insert
to authenticated
with check (criador_id = (select criador_id from public.perfiles_admin where user_id = auth.uid()));

create policy "Autenticados actualizan sus propias especies"
on public.especies for update
to authenticated
using (criador_id = (select criador_id from public.perfiles_admin where user_id = auth.uid()))
with check (criador_id = (select criador_id from public.perfiles_admin where user_id = auth.uid()));

create policy "Autenticados borran sus propias especies"
on public.especies for delete
to authenticated
using (criador_id = (select criador_id from public.perfiles_admin where user_id = auth.uid()));


-- 7) Verificación rápida --------------------------------------------------
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('ejemplares', 'especies', 'criadores', 'perfiles_admin');

select id, slug, nombre from public.criadores;


-- ============================================================
-- ALTA DE UN CRIADOR NUEVO EN ESTE PROYECTO COMPARTIDO
-- ------------------------------------------------------------
-- Una vez que el criador nuevo tenga su usuario creado en
-- Authentication > Users de este mismo proyecto:
--
-- insert into public.criadores (slug, nombre)
-- values ('slug-del-cliente', 'Nombre de Marca del Cliente')
-- returning id;
--
-- insert into public.perfiles_admin (user_id, criador_id)
-- values ('<uuid del usuario recién creado>', <id devuelto arriba>);
--
-- Ese <id> es el mismo valor que va en colors/fonts... es decir, en
-- el campo "criadorId" de site-config.js del sitio de ese cliente.
-- ============================================================
