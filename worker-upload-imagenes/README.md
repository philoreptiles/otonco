# Configurar Cloudflare R2 + este Worker (desde cero)

Esto se configura **una sola vez** — el mismo bucket y el mismo Worker
sirven a todos los criadores que compartan este proyecto de Supabase.
No es algo que repitas por cada cliente nuevo (ver el checklist de
alta rápida para lo que sí cambia por cliente).

## 1. Crear cuenta de Cloudflare

1. Ve a https://dash.cloudflare.com/sign-up y crea una cuenta gratis.
2. Confirma tu correo.

## 2. Instalar Wrangler (la herramienta de línea de comandos de Cloudflare)

Necesitas Node.js instalado (el mismo que usas para correr `npm run dev`
en este proyecto). Corre esto en tu terminal:

```bash
npm install -g wrangler
wrangler login
```

`wrangler login` abre tu navegador para que autorices el acceso a tu
cuenta de Cloudflare.

## 3. Crear el bucket de R2

```bash
wrangler r2 bucket create criadores-imagenes
```

Si prefieres otro nombre, cámbialo aquí Y en `wrangler.toml`
(`bucket_name`).

## 4. Habilitar acceso público de lectura al bucket

Las fotos del catálogo necesitan ser accesibles por URL directa, igual
que en Supabase Storage:

1. Entra a https://dash.cloudflare.com → R2 Object Storage → tu bucket
   (`criadores-imagenes`) → pestaña **Settings**.
2. Busca la sección **"Public Development URL"** (Cloudflare la llamó
   "Public Access" antes; si ves ese nombre en vez de este, es lo
   mismo) → botón **"Enable"** → confirma el aviso.
3. Te aparece un dominio público, algo como:
   `https://pub-xxxxxxxxxxxx.r2.dev`
   Ese es tu `R2_PUBLIC_BASE_URL` (cópialo sin la diagonal final).

   (Opcional, más adelante: puedes conectar un dominio propio tipo
   `imagenes.tudominio.com` con "Custom Domains" en esa misma página,
   en vez del `.r2.dev` — no es necesario para empezar.)

## 5. Completar wrangler.toml

Abre `wrangler.toml` en esta misma carpeta y reemplaza:

- `SUPABASE_URL`: la URL de tu proyecto de Supabase compartido
  (la misma que ya usas en `.env` como `VITE_SUPABASE_URL`).
- `SUPABASE_ANON_KEY`: la misma `anon key` de ese proyecto
  (la misma que `VITE_SUPABASE_ANON_KEY`). Es pública por diseño, no
  hace falta ocultarla.
- `R2_PUBLIC_BASE_URL`: el dominio público que te dio Cloudflare en
  el paso 4 (sin `/` al final).

## 6. Desplegar el Worker

Desde esta carpeta (`worker-upload-imagenes/`):

```bash
wrangler deploy
```

Al terminar, la terminal imprime la URL del Worker, algo como:

```
https://criadores-upload-imagenes.TU-SUBDOMINIO.workers.dev
```

Esa es la URL que necesitas para el siguiente paso.

## 7. Configurar el frontend

En el `.env` de **cada** sitio de cliente (todos comparten el mismo
Worker y el mismo bucket), agrega:

```
VITE_UPLOAD_WORKER_URL=https://criadores-upload-imagenes.TU-SUBDOMINIO.workers.dev
VITE_R2_PUBLIC_BASE_URL=https://pub-xxxxxxxxxxxx.r2.dev
```

(Ver `.env.example` en la raíz del proyecto.)

## Probarlo

1. Corre el sitio local (`npm run dev`), entra al panel admin, agrega
   un ejemplar con una foto.
2. Si todo salió bien, la imagen aparece en el catálogo y, si entras a
   tu bucket en el dashboard de Cloudflare, verás el archivo dentro de
   la carpeta `<criadorSlug>/ejemplares/`.
3. Si algo falla, abre la consola del navegador (F12) — el mensaje de
   error del Worker aparece ahí tal cual (sesión inválida, ruta
   inválida, etc.).

## Costos (referencia, plan gratuito de Cloudflare)

- **R2**: 10GB de almacenamiento gratis al mes, y R2 **no cobra por
  egress** (transferencia de salida) — a diferencia de Supabase
  Storage, que si acumula muchas visitas al catálogo público puede
  agotar su cuota de transferencia gratuita.
- **Workers**: 100,000 solicitudes gratis al día — muy por encima de
  lo que 5-20 criadores subiendo fotos van a generar.

## Cuando ya no quepa un criador más en el plan gratuito de R2

Nada de esto cambia — R2 sigue siendo el mismo bucket compartido. Lo
único que se agota más adelante es el límite de **Supabase** (2
proyectos en el plan gratuito), no el de Cloudflare.
