-- ============================================================
-- Esquema inicial -- proyecto de Supabase NUEVO, desde cero
-- ------------------------------------------------------------
-- Usa este archivo (y solo este) para un proyecto de Supabase recién
-- creado, sin ninguna tabla todavía. Crea todo de una vez: multi-
-- tenencia integrada desde el inicio (varios criadores pueden
-- compartir este proyecto) y CERO rastro de reproducción/linaje.
--
-- Este proyecto NUNCA debe tener: tabla eventos_reproductivos, tabla
-- camadas, columnas id_padre/id_madre en ejemplares, ni columna
-- tipo_reproduccion en especies. Si en algún momento aparece
-- cualquiera de esas cosas (por ejemplo, por seguir instrucciones de
-- un documento viejo), es un error -- hay que borrarlo, no
-- completarlo.
--
-- No uses recorte_reproduccion_linaje.sql ni multi_tenant_criadores.sql
-- en un proyecto nuevo -- esos son para ARREGLAR un proyecto viejo que
-- ya tenía datos y esas tablas de más. Este archivo ya nace limpio.
-- ============================================================


-- 1) Criadores ------------------------------------------------------
-- Sin ninguna política de RLS a propósito: nadie accede a esta tabla
-- vía API, solo tú desde el SQL Editor al dar de alta un cliente.

create table public.criadores (
    id bigint generated always as identity primary key,
    slug text not null unique,
    nombre text not null,
    activo boolean not null default true,
    creado_en timestamptz not null default now()
);

alter table public.criadores enable row level security;


-- 2) Mapeo usuario de Auth -> criador ---------------------------------

create table public.perfiles_admin (
    user_id uuid primary key references auth.users(id) on delete cascade,
    criador_id bigint not null references public.criadores(id),
    creado_en timestamptz not null default now()
);

alter table public.perfiles_admin enable row level security;

create policy "Cada quien lee solo su propio mapeo"
on public.perfiles_admin for select
to authenticated
using (user_id = auth.uid());


-- 3) Especies ---------------------------------------------------------
-- A propósito SIN columna tipo_reproduccion.

create table public.especies (
    id bigint generated always as identity primary key,
    criador_id bigint not null references public.criadores(id),
    nombre text not null,
    creado_en timestamptz not null default now(),
    unique (criador_id, nombre)
);

alter table public.especies enable row level security;

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


-- 4) Ejemplares ---------------------------------------------------------
-- A propósito SIN columnas id_padre / id_madre. "id" es el código
-- legible que asigna el criador (ej. "CR-16") -- único POR CRIADOR,
-- no global (dos criadores distintos sí pueden usar el mismo código).

create table public.ejemplares (
    id text not null,
    criador_id bigint not null references public.criadores(id),
    especie text not null,
    especie_id bigint not null references public.especies(id),
    genetica text not null default 'Nominal',
    sexo text not null default 'No sexado'
        check (sexo in ('Macho', 'Hembra', 'No sexado')),
    etapa text not null default 'Cría'
        check (etapa in ('Cría', 'Juvenil', 'Adulto')),
    nacimiento integer,
    longitud numeric,
    peso_gramos numeric,
    precio numeric not null,
    estatus text not null default 'Disponible'
        check (estatus in ('Disponible', 'Apartado', 'Vendido', 'Holdback')),
    visible_publico boolean not null default true,
    notas text,
    imagen_url text,
    imagen_url_2 text,
    imagen_url_3 text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (criador_id, id)
);

alter table public.ejemplares enable row level security;

-- Acelera la consulta más frecuente del catálogo público (filtra por
-- criador_id + visible_publico en cada carga).
create index idx_ejemplares_publico on public.ejemplares (criador_id, visible_publico);

-- Mantiene updated_at al día en cada UPDATE (el código no lo toca a
-- mano, pero es útil tenerlo).
create or replace function public.set_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create trigger trg_ejemplares_updated_at
before update on public.ejemplares
for each row execute function public.set_updated_at();

-- Público: solo ejemplares marcados como visibles.
create policy "Publico lee solo ejemplares visibles"
on public.ejemplares for select
to anon
using (visible_publico = true);

-- Autenticados: solo su propio criador.
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


-- 5) Dar de alta a Escama y Colmillo como primer criador --------------
-- Ajusta slug/nombre si el primer criador de este proyecto nuevo va a
-- ser otro.

insert into public.criadores (slug, nombre)
values ('escama-y-colmillo', 'Escama y Colmillo')
returning id;

-- Anota el "id" que devolvió la consulta de arriba -- va en
-- site-config.js como "criadorId" del sitio de este criador.


-- ============================================================
-- SIGUIENTE PASO: crear el usuario admin
-- ------------------------------------------------------------
-- 1. Authentication > Users > Add user (con el correo/contraseña que
--    va a usar el criador para entrar a su panel).
-- 2. Copia el UUID de ese usuario recién creado.
-- 3. Corre (con el <uuid> y el <id> de la sección 5 de arriba):
--
-- insert into public.perfiles_admin (user_id, criador_id)
-- values ('<uuid del usuario>', <id del criador>);
-- ============================================================


-- ============================================================
-- Verificación rápida
-- ============================================================
select tablename, rowsecurity
from pg_tables
where schemaname = 'public';
-- Debe mostrar exactamente: criadores, perfiles_admin, especies,
-- ejemplares -- todas con rowsecurity = true. Si ves cualquier otra
-- tabla (eventos_reproductivos, camadas, etc.), algo se coló y hay
-- que borrarlo con "drop table <nombre> cascade;" antes de continuar.
