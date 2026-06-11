-- No se crea Centro Principal automáticamente.
-- Asegura el superadmin:
update public.profiles
set role = 'superadmin',
    nombre = 'Juanma',
    centro_id = null
where email = 'juan.manuel.salado@gmail.com';
