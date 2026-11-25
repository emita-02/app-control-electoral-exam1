# Documento de Diseño Funcional (FDD) — Control Electoral

## 1. Introducción

Este documento describe el funcionamiento de Control Electoral, sus módulos, actores y funcionalidades principales.

El sistema permite gestionar información electoral, registrar actas, recopilar evidencias y supervisar el proceso mediante una aplicación móvil.

## 2. Actores

| Actor | Responsabilidad |
|---|---|
| Coordinador provincial | Administración y supervisión de la provincia. |
| Coordinador de recinto | Administración y supervisión de su recinto. |
| Veedor | Registro y seguimiento de actas de sus mesas asignadas. |

## 3. Módulos funcionales

### F01 — Autenticación y autorización

Permite iniciar y cerrar sesión, recuperar contraseñas y controlar el acceso según el rol del usuario.

El sistema debe recuperar el perfil y las asignaciones territoriales del usuario autenticado.

#### Implementación de la fase inicial

- Inicio/cierre de sesión y recuperación de contraseña mediante Supabase Auth.
- Persistencia móvil de sesión con Expo SecureStore y validación de sesión protegida por Redux Toolkit.
- Carga del perfil desde `public.profiles` y del rol mediante `get_my_role()`. Se valida el estado con `is_active_user()`. El identificador de usuario es UUID; `role_id` y `province_id` son numéricos, y `province_id` admite `null`.
- La jurisdicción recuperada se limita a `province_id`, confirmado en el contrato de `profiles`. La consulta territorial de F02 utiliza las relaciones existentes en Supabase para obtener los niveles inferiores.
- Navegación implementada directamente con React Navigation Native Stack. El navegador de trabajo solo registra la pantalla del rol validado; los tres espacios son puntos de entrada y no implementan módulos posteriores.
- No se ofrece autorregistro desde la aplicación.
- El enlace nativo de recuperación usa explícitamente `controlelectoral://reset-password`; React Navigation resuelve esa ruta y Supabase Auth intercambia el callback una sola vez. En web, el callback lo procesa la detección de URL ya configurada en Supabase Auth. Los eventos `PASSWORD_RECOVERY` repetidos para la misma sesión no vuelven a iniciar la hidratación del perfil.
- Pendiente: el cambio forzoso de contraseña temporal requiere una señal de primer ingreso que no forma parte del contrato de perfil confirmado.
- Pendiente de configuración: validar que el autorregistro esté deshabilitado en el proyecto Supabase y permitir la URL de recuperación en sus redirecciones. No se modificó configuración remota.

**Estado de F01:** implementada con React Navigation; pendientes la validación del flujo con una cuenta autorizada y las configuraciones remotas indicadas.

**Verificación:** Expo Doctor aprobó 20/20 comprobaciones, el bundle Android se generó sin Expo Router y el lint dirigido a F01 pasó. `npx expo lint` sigue detectando un error preexistente en `src/hooks/use-color-scheme.web.ts`; `npx tsc --noEmit` reporta errores preexistentes de configuración/tipos en la Edge Function de OCR. No se validó el flujo de autenticación contra una cuenta real autorizada.

### F02 — Gestión territorial

Permite consultar y administrar la estructura territorial electoral:

- Provincias.
- Cantones.
- Parroquias.

Los usuarios solamente pueden gestionar o consultar información dentro de su ámbito de autorización.

#### Primera parte: consulta de la estructura territorial

- El coordinador provincial puede consultar la provincia asignada a su perfil y explorar cantones, parroquias, recintos y mesas.
- La lectura utiliza las relaciones existentes en Supabase: `provinces → cantons → parishes → polling_places → electoral_tables`. No se crean datos ni relaciones.
- La consulta se limita al `province_id` del perfil activo; la pantalla no presenta opciones de escritura.
- La verificación del esquema remoto encontró actualmente un registro de Pichincha en cada nivel inferior: un cantón, una parroquia, un recinto y una mesa. La aplicación obtiene los nombres e identificadores del servidor; no codifica estos valores.
- Las políticas de lectura existentes permiten la consulta a usuarios activos. No aplican una restricción RLS por provincia; el cliente filtra por el `province_id` del perfil. El alcance del trabajo no incluye modificar políticas ni el esquema.

**Estado de F02:** implementada la primera parte de consulta. La administración territorial no está incluida en esta entrega.

**Verificación de la primera parte:** el lint dirigido a los archivos de F02 pasó; la verificación TypeScript de la aplicación, excluyendo la Edge Function de OCR, pasó; y `npx expo export --platform android --no-minify` generó el bundle Android. No existe un comando ni configuración de pruebas automatizadas en `package.json`.

**Pendientes de verificación:** `npm run lint` continúa fallando por el error preexistente de `src/hooks/use-color-scheme.web.ts`; `npx tsc --noEmit` continúa reportando errores preexistentes en `supabase/functions/procesar-acta-ocr/index.ts`. No se probó la pantalla con una cuenta autenticada en un dispositivo Android. La consulta requiere conexión y el esquema/RLS no se modificó.

### F03 — Recintos y mesas electorales

Permite gestionar los recintos electorales y sus respectivas mesas.

Cada mesa debe estar asociada a su recinto y estructura territorial.

#### Alcance implementado: registro de recintos

- El coordinador provincial puede registrar un recinto seleccionando una parroquia ya existente dentro de su provincia.
- El nombre es obligatorio; el código y la dirección son opcionales y corresponden a columnas existentes en `polling_places`.
- La Edge Function `registrar-recinto` valida la sesión activa, el rol, la provincia del perfil y la relación `parishes → cantons → provinces` antes de insertar en `polling_places`.
- La consulta de mesas de F02 se conserva; no se crean ni modifican mesas.
- No se modificaron el esquema ni las políticas RLS. La inserción protegida se ejecuta en la Edge Function con la credencial de servidor, que no se expone al cliente.

**Estado de F03:** implementación local completada; falta desplegar la Edge Function y verificar el flujo con una cuenta autorizada.

**Verificación:** lint dirigido y TypeScript de la aplicación completados. La configuración Supabase JSONC es válida y requiere JWT para la función. No hay un ejecutor de pruebas configurado; no se pudo validar la función con el runtime local porque Deno y Docker/Podman no están instalados. No se desplegó la función ni se modificó información remota.

### F04 — Gestión de personal

Permite registrar, consultar y administrar al personal electoral.

Incluye:
- Creación de coordinadores de recinto.
- Registro de veedores.
- Asignación de veedores a mesas.
- Reemplazo de veedores ausentes.
- Consulta de asignaciones.

El reemplazo debe conservar los registros electorales anteriores y respetar las autorizaciones correspondientes.

#### Alcance implementado

- El coordinador provincial consulta los coordinadores visibles en su provincia y puede invitar un coordinador para un recinto de esa provincia. Se impide crear un segundo coordinador activo para el mismo recinto.
- El coordinador de recinto consulta los veedores de su recinto, puede invitarlos por correo y asignar un veedor activo a una o varias mesas de ese recinto.
- El reemplazo cierra las asignaciones anteriores con `ended_at`, `ended_by` y `end_reason`, y registra las nuevas filas en `watcher_assignments`. No elimina asignaciones históricas ni actas.
- La Edge Function `gestionar-personal` valida sesión, cuenta activa, rol, provincia/recinto y pertenencia de las mesas. La creación de usuarios usa Supabase Auth Admin del lado servidor; la clave de servicio no se incluye en la aplicación.
- Se usan las tablas existentes `profiles` y `watcher_assignments`; no se modifica el esquema ni las políticas RLS.
- Los formularios no recopilan cédula ni teléfono: `profiles` no contiene columnas para esos datos y el alcance aprobado no autoriza cambiar el esquema.
- El enlace de invitación se procesa como una recuperación de contraseña para que el usuario establezca su contraseña desde la aplicación.

**Estado de F04:** implementación local completada; pendiente desplegar `gestionar-personal`, validar la plantilla/correo y URL de invitación en Supabase, y probar los flujos con cuentas autorizadas en Android. La configuración local declara `controlelectoral://reset-password` como URL de redirección; la configuración remota no se modificó.

**Verificación:** el lint dirigido de la aplicación y la comprobación TypeScript limitada a `src/` pasaron. `npx expo export --platform android --no-minify` generó el bundle Android. El lint completo continúa fallando por el error preexistente de `src/hooks/use-color-scheme.web.ts`. La comprobación TypeScript completa no está configurada para los tipos/imports de Deno de las Edge Functions (incluida la nueva `gestionar-personal`) y también reporta errores preexistentes en `procesar-acta-ocr`; la sintaxis de la nueva función y su lint dirigido sí se validaron, pero su runtime no se pudo ejecutar porque Deno y Docker/Podman no están instalados. Las validaciones unitarias dirigidas de los casos de uso pasaron; no hay un ejecutor de pruebas automatizadas configurado. No se desplegó la función ni se modificaron datos remotos.

### F05 — Registro de actas

Permite registrar actas correspondientes a:

- Alcaldía.
- Prefectura.

El registro contempla:
- Información de la mesa electoral.
- Dignidad electoral.
- Candidatos y organizaciones políticas.
- Votos por candidato.
- Votos blancos.
- Votos nulos.
- Total de votos.
- Observaciones.

El sistema debe controlar que no existan registros duplicados de una misma dignidad para una misma mesa.

### F06 — Evidencias y geolocalización

Permite capturar y almacenar fotografías de las actas.

También registra:
- Usuario que realizó la captura.
- Fecha y hora.
- Coordenadas GPS.
- Referencia del archivo almacenado.

Las fotografías deben conservarse en almacenamiento seguro.

La ubicación fuera del recinto genera una advertencia y no un bloqueo automático.

### F07 — Validación y corrección de actas

Permite validar la información registrada y detectar inconsistencias.

Incluye:
- Validación de campos obligatorios.
- Validación de valores no negativos.
- Comprobación de sumas de votos.
- Registro de observaciones.
- Corrección de información.
- Historial de modificaciones.

Las correcciones deben conservar los datos anteriores, los nuevos valores, el usuario responsable, la fecha y el motivo.

### F08 — Reconocimiento OCR

Permite utilizar Gemini para reconocer información contenida en las fotografías de las actas.

El proceso contempla:

1. Selección de una fotografía.
2. Envío seguro para procesamiento.
3. Reconocimiento de información.
4. Obtención de resultados estructurados.
5. Presentación de los valores reconocidos.
6. Revisión y corrección por parte del usuario.

Los resultados del OCR son sugerencias. Nunca se deben aprobar ni registrar automáticamente sin revisión humana.

### F09 — Funcionamiento offline y sincronización

Permite trabajar sin conexión mediante almacenamiento local.

Contempla:
- Consulta de información disponible localmente.
- Registro de información sin conexión.
- Conservación de fotografías y datos pendientes.
- Identificación de registros pendientes de sincronización.
- Sincronización al recuperar conectividad.
- Manejo de errores y conflictos.

La estrategia debe respetar el enfoque Offline-First establecido en el ADR-02.

### F10 — Paneles y resultados

Permite visualizar información y estadísticas según el rol y el ámbito territorial.

Incluye:
- Seguimiento de recintos.
- Estado de registro de actas.
- Información de personal.
- Resultados de Alcaldía.
- Resultados de Prefectura.

Los datos mostrados deben respetar los permisos de acceso.

### F11 — Monitoreo y manejo de errores

Permite identificar y registrar errores de ejecución.

Se utiliza Firebase Crashlytics para facilitar el seguimiento y análisis de problemas.

## 4. Reglas generales del negocio

1. Cada usuario debe operar según su rol y ámbito territorial.
2. Un veedor solamente puede gestionar las mesas que tiene asignadas.
3. Una mesa puede tener un acta por cada dignidad electoral.
4. Las actas corresponden a Alcaldía o Prefectura.
5. Los votos registrados deben ser valores no negativos.
6. La suma de votos de candidatos, blancos y nulos debe coincidir con el total de votos para validar aritméticamente el acta.
7. Las correcciones deben conservar trazabilidad.
8. El reemplazo de un veedor no elimina las actas previamente registradas.
9. La ubicación GPS fuera del recinto genera una advertencia.
10. Los datos obtenidos mediante OCR requieren revisión humana.
11. La sincronización debe respetar la estrategia Offline-First.
12. Los resultados y registros deben estar protegidos según los permisos de cada rol.

## 5. Catálogos electorales

El sistema contempla organizaciones políticas y candidatos para las dignidades de Alcaldía y Prefectura.

La información definitiva debe provenir de fuentes oficiales.

No se deben utilizar candidatos u organizaciones ficticias como información electoral real.

## 6. Relación con otros documentos

- Requisitos: `../requirements/requirements.md`
- Decisiones arquitectónicas: `../adr/`
- Arquitectura: `../architecture/architecture.md`
- Skill FDD: `.github/skills/fdd/SKILL.md`

