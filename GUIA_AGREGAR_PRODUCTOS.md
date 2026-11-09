# Editor compartido del catálogo

La edición se hace en la página **[editores.html](./editores.html)**, con el mismo diseño y navegación que ve un cliente. Comparte ese enlace solo con el equipo; los clientes no pueden abrir el modo de edición sin una cuenta autorizada.

## Cómo editar

- Pulsa el lápiz a la derecha del título o del precio. Edita el texto y pulsa el mismo botón (✓) para guardar.
- Abre **Consultar** para editar el nombre identificador y la descripción, cambiar categoría, disponibilidad y etiquetas, gestionar fotos o eliminar el producto.
- En **Fotos del producto**, desmarca las que quieras quitar, selecciona fotos nuevas y pulsa **Guardar fotos**. Debe quedar por lo menos una imagen.
- Usa **+ Nuevo producto** en la barra superior para agregar una tarjeta.

Los cambios se guardan en la base de datos compartida de Supabase. Con conexión, las páginas abiertas en los dispositivos del equipo y de los clientes reciben los cambios en vivo, sin que alguien vuelva a publicar cada producto. GitHub Pages solo necesita recibir una vez la versión inicial que incluye esta integración.

## Configuración inicial requerida

La URL del proyecto Supabase y su clave pública ya están configuradas en `supabase-config.js`. La clave `sb_publishable_...` está diseñada para uso en el navegador; nunca agregues una clave `service_role` a este archivo. Aún hay que crear las tablas y autorizar las cuentas del equipo en Supabase antes de editar.

1. Crea un proyecto en Supabase.
2. En **SQL Editor**, ejecuta el contenido de `catalogo.sql`. Esto crea la tabla del catálogo, el almacenamiento de fotos y permisos: lectura pública para clientes y cambios solo para editores autorizados.
3. En **Authentication → Users**, crea una cuenta para cada compañero. No habilites el registro público.
4. Autoriza individualmente cada cuenta ejecutando en SQL Editor (reemplaza el correo de ejemplo):

   ```sql
   insert into public.catalog_editors (user_id, email)
   select id, email
   from auth.users
   where lower(email) = lower('editor@ejemplo.com');
   ```

   Confirma que la consulta insertó una fila. No compartas una cuenta entre todo el equipo; si alguien deja de editar, elimina su fila de `catalog_editors` y desactiva su usuario.
5. Agrega `https://fogazgemat.github.io/HomeStyle507-catalogo-mayorista/` y `https://fogazgemat.github.io/HomeStyle507-catalogo-mayorista/editores.html` a las URLs permitidas de autenticación en Supabase.
6. Publica los archivos del catálogo en el repositorio GitHub `fogazgemat/HomeStyle507-catalogo-mayorista`. Abre `editores.html` e inicia sesión con una cuenta autorizada. Si el catálogo compartido está vacío, el primer inicio autorizado copiará sus 100 productos actuales a Supabase.
7. Comparte `https://fogazgemat.github.io/HomeStyle507-catalogo-mayorista/editores.html` con los compañeros. Para clientes, comparte `https://fogazgemat.github.io/HomeStyle507-catalogo-mayorista/`.

Para comprobar la pantalla de edición antes de configurar Supabase, abre `editores.html` localmente: aparecerá el aviso de que la conexión todavía no está configurada. La edición compartida no funcionará desde una copia local ni hasta completar los pasos anteriores.

Los productos y precios visibles en la página de clientes son públicos. La protección evita que clientes los modifiquen; no convierte el catálogo público en información privada.
