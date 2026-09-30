# Índice de archivos SQL — ¿cuál corro?

## Para cualquier proyecto de Supabase nuevo (el caso normal de aquí en adelante)

Corre **solo** `esquema_inicial_proyecto_nuevo.sql`. Crea todo desde
cero (criadores, perfiles_admin, especies, ejemplares, RLS) ya con
multi-tenencia integrada y sin ningún rastro de reproducción/linaje.

Para dar de alta un criador NUEVO dentro de ese mismo proyecto
(compartido entre varios clientes), no vuelvas a correr este archivo
completo — solo la sección 5 (el `insert` en `criadores`) más el
`insert` en `perfiles_admin` una vez creado su usuario en
Authentication > Users. Ambos están documentados al final del propio
archivo.

## `archivo/`

Scripts viejos, de cuando cada criador tenía su propio proyecto de
Supabase dedicado (antes de la decisión de compartir un proyecto
entre varios clientes) y de cuando este proyecto todavía tenía un
módulo de reproducción/linaje. Ya no aplican al flujo actual — se
conservan solo por si algún día hay que revisar o migrar datos de un
proyecto viejo que aún los tenga. Ver el encabezado de cada archivo
para su contexto original.

## Regla de oro

Este proyecto (ejemplares/especies/criadores) **nunca** debe tener:
`eventos_reproductivos`, `camadas`, columnas `id_padre`/`id_madre`, ni
`tipo_reproduccion`. Si aparecen -- en cualquier proyecto, por
cualquier motivo -- es un error: se borran, no se completan ni se
"especializan".
