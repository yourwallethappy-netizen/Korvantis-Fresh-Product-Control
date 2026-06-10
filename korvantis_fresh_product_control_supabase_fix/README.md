# Korvantis Fresh Product Control

Versión online para Supabase + Vercel.

## Seguridad

- No hay contraseña de superadmin escrita en pantalla.
- No hay contraseña fija en el código.
- Login real con Supabase Auth.
- Los trabajadores se crean desde el panel superadmin usando una API serverless de Vercel.
- La `SUPABASE_SERVICE_ROLE_KEY` solo se usa en servidor.
- Los centros están separados mediante Row Level Security.
- La foto de etiquetas se procesa temporalmente para OCR y no se archiva.

## Instalación rápida

1. Crear proyecto en Supabase.
2. Ejecutar `supabase/schema.sql` en SQL Editor.
3. Crear el usuario superadmin en Authentication > Users.
4. Ejecutar el INSERT final del SQL cambiando `TU_EMAIL_SUPERADMIN`.
5. Crear proyecto en Vercel.
6. Subir este repositorio.
7. Añadir variables de entorno:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
8. Deploy.

## Desarrollo local

```bash
npm install
cp .env.example .env
npm run dev
```

## Formato de importación

Admite:

```txt
0313593 JAMON COCIDO NATURARTE CAMPOFRIO 120G
0235671;YORK SANDWICH ALMIREZ ATM L-500G
0148809,YORK ELPOZO PIEZA 1 KG
```
