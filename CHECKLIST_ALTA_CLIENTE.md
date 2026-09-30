# Checklist: dar de alta un criador nuevo

## El caso normal: TODOS los criadores en el mismo proyecto de Supabase y el mismo bucket de R2

Esto no es una solución temporal ni un truco para esquivar el límite
de 2 proyectos del plan gratuito de Supabase -- es la arquitectura
real. RLS aísla los datos por `criador_id`, no la cantidad de
proyectos, así que un mismo proyecto puede alojar a 5, 50 o 500
criadores sin cambiar una sola línea de código. Ver "¿Cuándo sí hace
falta un proyecto dedicado?" al final para la única excepción real.

1. **SQL** — en el proyecto de Supabase compartido, SQL Editor:
   ```sql
   insert into public.criadores (slug, nombre)
   values ('slug-del-cliente', 'Nombre de Marca')
   returning id;
   ```
   Anota el `id` que regresa.

2. **Usuario admin** — Authentication > Users > Add user (marca
   "Auto Confirm User"). Copia el UUID, o simplemente usa el correo:
   ```sql
   insert into public.perfiles_admin (user_id, criador_id)
   select
       (select id from auth.users where email = 'correo-del-cliente@ejemplo.com'),
       (select id from public.criadores where slug = 'slug-del-cliente');
   ```
   
3. **`site-config.js`** — único archivo de código a tocar:
   - `brandName`, `pageTitle`
   - `criadorId` (el `id` del paso 1)
   - `criadorSlug` (el `slug` del paso 1 — organiza sus imágenes en R2)
   - `semarnatFolio`, `whatsappNumber`, `location`
   - `colors` (primary/secondary/background) y `fonts` (heading/body)

4. **5 títulos estáticos** (no hay forma de automatizar esto sin
   servidor — son el `<title>` que ve un buscador antes de que corra
   el JS): `index.html`, `admin.html`, `dashboard.html`,
   `nosotros.html`. El `<span id="brand-title-text">` de
   admin/dashboard ya se actualiza solo, no lo toques.

5. **`nosotros.html` / `nosotros.js`** — el texto de "Sobre
   nosotros" es prosa real del negocio del cliente, no hay forma de
   parametrizarlo — redáctalo a mano para cada cliente.

6. **`.env`** — el MISMO para todos los criadores de este proyecto
   compartido (Supabase URL/key, Worker URL, R2 base URL). No cambia
   por cliente.

7. **Deploy** — nuevo proyecto en Vercel/Cloudflare Pages apuntando
   a su propio dominio, con el `.env` del paso 6.

8. **Prueba de humo**: entra al catálogo público, da de alta una
   especie de prueba, agrega un ejemplar con foto, edítalo,
   bórralo, y confirma que el Dashboard se ve con su paleta.

## Lo que NUNCA debe volver a aparecer (en ningún proyecto)

`eventos_reproductivos`, `camadas`, columnas `id_padre`/`id_madre`,
columna `tipo_reproduccion`. Si aparecen, se borran — no se
completan ni se "especializan". Ver `sql/README.md` para más
contexto de por qué existe esta regla.

## ¿Cuándo el proyecto compartido deja de alcanzar?

El límite real no es "cuántos criadores caben" -- es el plan
gratuito de Supabase para ESE proyecto: 500MB de base de datos y 5GB
de bandwidth al mes (cifras de 2026, confirmar en supabase.com/pricing
porque cambian). Con imágenes viviendo en R2 (no en la base de
datos), 500MB de filas de texto alcanza para muchísimos criadores.
Cuando se acerque el límite, la solución es subir ESE MISMO proyecto
a Supabase Pro ($25/mes) -- no crear un proyecto nuevo y empezar a
repartir criadores entre varios.

## ¿Cuándo sí hace falta un proyecto de Supabase dedicado?

Prácticamente nunca, salvo que un cliente puntual exija aislamiento
de infraestructura por contrato o cumplimiento normativo (no solo
aislamiento de datos vía RLS, que ya tienes). Si ese caso aparece:

1. Crea el proyecto de Supabase nuevo.
2. Corre `sql/esquema_inicial_proyecto_nuevo.sql` completo ahí (ya
   trae `criador_id`/RLS/GRANTs, aunque tenga un solo criador no
   hace falta simplificarlo).
3. El bucket de R2 y el Worker de subida de imágenes pueden seguir
   siendo los compartidos igual -- `criadorSlug` ya organiza sus
   imágenes en su propia carpeta ahí, no hace falta un bucket nuevo.

## Pendientes conocidos (no bloquean vender el primer cliente)

- Decisión de Tailwind (seguimos con CSS + variables por ahora,
  revisar cuando haya 4-5 criadores activos).
- Migrar o abandonar formalmente el proyecto viejo de Supabase de
  Escama y Colmillo (el que tenía `camadas`/`eventos_reproductivos`)
  una vez que el proyecto nuevo esté 100% probado en producción.
- Supabase anunció que a partir del 30 oct 2026 los proyectos
  gratuitos existentes necesitan GRANTs explícitos de Postgres para
  el API de PostgREST -- este proyecto ya los tiene desde
  `esquema_inicial_proyecto_nuevo.sql`, así que no debería afectarte,
  pero vale la pena confirmarlo cuando llegue la fecha.
