
-- Korvantis Fresh Product Control - Supabase schema
-- 1) Ejecuta este SQL en Supabase SQL Editor.
-- 2) Crea tu usuario superadmin en Authentication > Users.
-- 3) Sustituye TU_EMAIL_SUPERADMIN y ejecuta el INSERT final.

create extension if not exists pgcrypto;

create table if not exists public.centros (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  created_at timestamptz default now()
);

create type public.user_role as enum ('superadmin', 'trabajador');
create type public.producto_estado as enum ('activo', 'rotura');

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  nombre text,
  role public.user_role not null default 'trabajador',
  centro_id uuid references public.centros(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists public.productos (
  id uuid primary key default gen_random_uuid(),
  centro_id uuid not null references public.centros(id) on delete cascade,
  modulo text not null default '7',
  codigo text not null,
  descripcion text not null,
  fecha_caducidad date not null,
  estado public.producto_estado not null default 'activo',
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (centro_id, codigo)
);

create table if not exists public.historial_productos (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid references public.productos(id) on delete cascade,
  usuario_id uuid references auth.users(id),
  accion text not null,
  fecha_anterior date,
  fecha_nueva date,
  estado_anterior text,
  estado_nuevo text,
  created_at timestamptz default now()
);

create or replace function public.current_user_role()
returns text
language sql
security definer
set search_path = public
as $$
  select role::text from public.profiles where id = auth.uid()
$$;

create or replace function public.current_user_centro()
returns uuid
language sql
security definer
set search_path = public
as $$
  select centro_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_superadmin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'superadmin', false)
$$;

create or replace function public.touch_producto()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_touch_producto on public.productos;
create trigger trg_touch_producto
before update on public.productos
for each row execute function public.touch_producto();

create or replace function public.log_producto_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.historial_productos(producto_id, usuario_id, accion, fecha_nueva, estado_nuevo)
    values (new.id, auth.uid(), 'creado', new.fecha_caducidad, new.estado::text);
    return new;
  elsif tg_op = 'UPDATE' then
    if old.fecha_caducidad is distinct from new.fecha_caducidad or old.estado is distinct from new.estado then
      insert into public.historial_productos(producto_id, usuario_id, accion, fecha_anterior, fecha_nueva, estado_anterior, estado_nuevo)
      values (new.id, auth.uid(), 'actualizado', old.fecha_caducidad, new.fecha_caducidad, old.estado::text, new.estado::text);
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.historial_productos(producto_id, usuario_id, accion, fecha_anterior, estado_anterior)
    values (old.id, auth.uid(), 'eliminado', old.fecha_caducidad, old.estado::text);
    return old;
  end if;
end;
$$;

drop trigger if exists trg_log_producto_insert on public.productos;
drop trigger if exists trg_log_producto_update on public.productos;
drop trigger if exists trg_log_producto_delete on public.productos;

create trigger trg_log_producto_insert after insert on public.productos for each row execute function public.log_producto_change();
create trigger trg_log_producto_update after update on public.productos for each row execute function public.log_producto_change();
create trigger trg_log_producto_delete before delete on public.productos for each row execute function public.log_producto_change();

alter table public.centros enable row level security;
alter table public.profiles enable row level security;
alter table public.productos enable row level security;
alter table public.historial_productos enable row level security;

drop policy if exists "centros_select" on public.centros;
create policy "centros_select" on public.centros
for select to authenticated
using (public.is_superadmin() or id = public.current_user_centro());

drop policy if exists "centros_admin_all" on public.centros;
create policy "centros_admin_all" on public.centros
for all to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
for select to authenticated
using (public.is_superadmin() or id = auth.uid());

drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles
for update to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());

drop policy if exists "productos_select" on public.productos;
create policy "productos_select" on public.productos
for select to authenticated
using (public.is_superadmin() or centro_id = public.current_user_centro());

drop policy if exists "productos_insert" on public.productos;
create policy "productos_insert" on public.productos
for insert to authenticated
with check (public.is_superadmin() or centro_id = public.current_user_centro());

drop policy if exists "productos_update" on public.productos;
create policy "productos_update" on public.productos
for update to authenticated
using (public.is_superadmin() or centro_id = public.current_user_centro())
with check (public.is_superadmin() or centro_id = public.current_user_centro());

drop policy if exists "productos_delete" on public.productos;
create policy "productos_delete" on public.productos
for delete to authenticated
using (public.is_superadmin() or centro_id = public.current_user_centro());

drop policy if exists "historial_select" on public.historial_productos;
create policy "historial_select" on public.historial_productos
for select to authenticated
using (
  public.is_superadmin()
  or exists (
    select 1 from public.productos p
    where p.id = historial_productos.producto_id
    and p.centro_id = public.current_user_centro()
  )
);

insert into public.centros (nombre)
values ('Centro Principal')
on conflict do nothing;

-- Después de crear el usuario en Authentication > Users, cambia el email:
-- insert into public.profiles (id, email, nombre, role, centro_id)
-- select id, email, 'Superadmin', 'superadmin', null
-- from auth.users
-- where email = 'TU_EMAIL_SUPERADMIN';
