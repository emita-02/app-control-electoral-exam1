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
- La jurisdicción recuperada se limita a `province_id`, confirmado en el contrato de `profiles`. No se consultan cantones ni recintos porque sus relaciones no están definidas.
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

### F03 — Recintos y mesas electorales

Permite gestionar los recintos electorales y sus respectivas mesas.

Cada mesa debe estar asociada a su recinto y estructura territorial.

### F04 — Gestión de personal

Permite registrar, consultar y administrar al personal electoral.

Incluye:
- Creación de coordinadores de recinto.
- Registro de veedores.
- Asignación de veedores a mesas.
- Reemplazo de veedores ausentes.
- Consulta de asignaciones.

El reemplazo debe conservar los registros electorales anteriores y respetar las autorizaciones correspondientes.

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

