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

**Estado de F03:** implementación completada y Edge Function activa en remoto; pendiente verificar el flujo con una cuenta autorizada.

**Verificación:** lint dirigido y TypeScript de la aplicación completados. La configuración Supabase JSONC es válida y requiere JWT para la función. `registrar-recinto` aparece `ACTIVE` en remoto. No se pudo validar la función con el runtime local porque Deno y Docker/Podman no están instalados; no se modificaron datos de usuario, esquema ni políticas RLS.

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

**Estado de F04:** implementación completada y `gestionar-personal` activa en remoto; pendiente validar la plantilla/correo y la URL de invitación en Supabase, y probar los flujos con cuentas autorizadas en Android. La configuración local declara `controlelectoral://reset-password` como URL de redirección; la configuración remota no se modificó.

**Verificación:** el lint dirigido de la aplicación y la comprobación TypeScript limitada a `src/` pasaron. `npx expo export --platform android --no-minify` generó el bundle Android. `gestionar-personal` aparece `ACTIVE` en remoto. El lint completo continúa fallando por el error preexistente de `src/hooks/use-color-scheme.web.ts`. La comprobación TypeScript completa no está configurada para los tipos/imports de Deno de las Edge Functions; la sintaxis de la nueva función y su lint dirigido sí se validaron, pero su runtime no se pudo ejecutar porque Deno y Docker/Podman no están instalados. Las validaciones unitarias dirigidas de los casos de uso pasaron. No se modificaron datos de usuario, esquema ni políticas RLS.

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

#### Implementación completada

- El contrato real se confirmó contra el proyecto remoto: `electoral_acts` contiene `electoral_table_id`, `position_id`, `registered_by`, `total_votes`, `blank_votes`, `null_votes`, `observation` y `status`; `act_results` contiene `act_id`, `position_id`, `candidate_id` y `votes`. Las relaciones y restricciones existentes se respetaron sin crear columnas ni relaciones nuevas.
- El veedor selecciona una mesa de `watcher_assignments` vigente, una dignidad de `electoral_positions` (`alcaldia` o `prefectura`) y las candidaturas oficiales de `candidates` con su organización política. El catálogo se obtiene del servidor; no se codifican candidaturas.
- El formulario usa React Hook Form y Zod, reutiliza `validateElectoralActForm`, `validateElectoralActArithmetic` y `ActValidationFeedback`. Exige un valor entero no negativo por candidatura, blancos, nulos y total; la suma debe coincidir exactamente con el total. Muestra errores por campo, validación aritmética en vivo, estado de carga, confirmación y mensajes del servidor.
- El caso de uso `registerElectoralAct` valida los datos en la capa de dominio antes de llamar al repositorio y rechaza candidaturas repetidas. El estado de Redux `actRegistration` separa la carga del catálogo del guardado del acta y expone mensajes comprensibles.
- La escritura se realiza mediante la RPC `public.registrar_acta_electoral`, creada en `supabase/migrations/20261125120000_registrar_acta_electoral.sql`. Es `SECURITY DEFINER`, fija `search_path = ''` y valida en servidor la sesión (`auth.uid()`), usuario activo (`is_active_user()`), rol `veedor`, asignación vigente a la mesa, dignidad permitida, candidaturas oficiales completas y no repetidas, valores no negativos, aritmética exacta y ausencia de duplicados por mesa/dignidad.
- La RPC inserta el acta y sus resultados en una sola transacción. El acta conserva el valor por defecto `pendiente_revision` y el trigger deferido existente vuelve a verificar la aritmética al confirmar la transacción. Los errores de duplicado se traducen a un mensaje claro en el cliente.
- La ruta `ActRegistration` está disponible solo para el rol `veedor` en React Navigation y se accede desde su pantalla inicial. El resultado guardado abre F06 (evidencia); sin conexión, el registro se encola en SQLite y continúa en F09.
- No se modificaron tablas, columnas, relaciones, políticas RLS ni datos. La RPC `registrar_acta_electoral` existe activa en el proyecto remoto con la firma esperada.

**Estado de F05:** integrado con F06/F08/F09. Pendiente probar el registro con una cuenta de veedor autorizada en un dispositivo Android.

**Verificación:** 18 pruebas unitarias dirigidas pasaron (8 de F07, 6 de F06 y 4 de F05). La comprobación TypeScript limitada a `src/` y el ESLint dirigido pasaron; Expo Doctor aprobó 20/20 comprobaciones y `npx expo export --platform android --no-minify` generó el bundle Android. Una consulta remota de solo lectura confirmó la RPC y sus argumentos. `npx expo lint` continúa fallando por el error preexistente de `src/hooks/use-color-scheme.web.ts`; `npx tsc --noEmit` completo continúa reportando errores preexistentes de Deno/imports en las Edge Functions. No se ejecutó la RPC contra la base remota ni se validó el flujo con datos reales.

### F06 — Evidencias y geolocalización

Permite capturar y almacenar fotografías de las actas.

También registra:
- Usuario que realizó la captura.
- Fecha y hora.
- Coordenadas GPS.
- Referencia del archivo almacenado.

Las fotografías deben conservarse en almacenamiento seguro.

La ubicación fuera del recinto genera una advertencia y no un bloqueo automático.

#### Integración completada

- El veedor toma la fotografía desde la cámara; no se ofrece selección desde la galería. Cámara y ubicación solicitan permisos en primer plano y muestran errores claros si se deniegan o si los servicios están desactivados.
- Se obtiene la posición con `getCurrentPositionAsync` después de la captura y se rechaza si su marca de tiempo difiere más de 5 segundos. La nitidez se mide sobre una copia reducida a 320 píxeles con varianza del Laplaciano (umbral inicial: 2.000); la imagen original no se modifica. El umbral necesita calibración con fotos autorizadas de dispositivos reales.
- Cada captura aceptada se copia al directorio persistente `Paths.document/evidence` mediante `ExpoEvidenceFileStore` (API de `expo-file-system` v58). Esa ruta durable es la que se guarda en Redux, se encola en SQLite y se usa para la carga; no depende de la URI temporal de la cámara.
- La carga usa el bucket privado real `act-evidence`, con ruta `${actId}/${uuid}.jpg` y compresión JPEG. La Edge Function `registrar-evidencia`, desplegada en remoto, valida sesión, cuenta activa, rol `veedor`, asignación vigente a la mesa del acta y existencia del archivo; registra `act_evidence` con clave de servicio solo en servidor y es idempotente por `storage_path`.
- La ubicación fuera del recinto produce una advertencia heurística en el panel (distancia al centroide de evidencias > 1.000 m), nunca un bloqueo automático, coherente con S-02. No se modificaron esquema, RLS ni datos.

**Estado de F06:** captura, persistencia local durable, carga protegida y metadatos integrados con F05/F08/F09. Pendiente de prueba en dispositivo Android, calibración del umbral y validación con el bucket remoto usando una cuenta autorizada.

**Verificación:** las seis pruebas unitarias dirigidas pasaron; ESLint y TypeScript limitado a `src/` pasaron; Expo Doctor aprobó 20/20 comprobaciones y el bundle Android se exportó correctamente. La función `registrar-evidencia` aparece `ACTIVE` en remoto. No se validó una carga real contra el bucket remoto.

### F07 — Validación y corrección de actas

Permite validar la información registrada dentro de un formulario y detectar inconsistencias.

Incluye:
- Validación de campos obligatorios.
- Validación de valores no negativos.
- Comprobación de sumas de votos.
- Registro de observaciones.
- Corrección de información.
- Historial de modificaciones.

Las correcciones deben conservar los datos anteriores, los nuevos valores, el usuario responsable, la fecha y el motivo.

#### Integración completada

- La validación exige votos para cada candidatura y valores enteros no negativos para blancos, nulos y total; reutiliza el validador aritmético de F05 y exige coincidencia exacta. Los errores se muestran por campo en un componente accesible.
- El repositorio de corrección carga el acta, sus resultados, las candidaturas oficiales, las asignaciones vigentes del usuario y el historial desde Supabase, respetando RLS. La pantalla `ActCorrection` reutiliza `ActCorrectionForm` y exige motivo.
- La Edge Function `confirmar-resultados`, desplegada en remoto, comprueba rol, autoría/asignación del veedor o jurisdicción del coordinador de recinto, catálogo oficial y aritmética. Escribe `act_results`, hace la transición `borrador` → `aprobada` para respetar el trigger deferido e inserta `act_corrections` solo cuando los valores cambian. El historial es inmutable por el trigger existente.
- La confirmación humana del OCR usa la misma función con `confirm_ocr`; los valores extraídos nunca se aprueban automáticamente (S-06). Sin conexión, ambas acciones se encolan y el worker las envía al recuperar red; prevalece la última modificación enviada (S-03).

**Estado de F07:** validación, autorización en servidor, corrección durable e historial integrados. No se añadió un estado de aprobación adicional porque los requisitos no definen quién aprueba formalmente una corrección.

**Pendiente:** prueba con cuentas reales de veedor y coordinador de recinto, incluida la verificación de rechazos por jurisdicción y de la inmutabilidad del historial.

**Verificación:** pasaron las 8 pruebas unitarias de F07 y las 6 de F06; ESLint y TypeScript limitado a `src/` pasaron; Expo Doctor aprobó 20/20 comprobaciones y el bundle Android se exportó. La función `confirmar-resultados` aparece `ACTIVE` en remoto. No se ejecutó una corrección real contra la base remota.

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

#### Integración completada

- La Edge Function `procesar-acta-ocr` valida sesión, cuenta activa, rol `veedor` y asignación a la mesa; descarga desde `act-evidence` solo la evidencia del acta autorizada, usando el cliente sujeto a RLS.
- La función acepta imágenes JPEG de hasta 10 MB, lee `GEMINI_API_KEY` desde secretos de Supabase (configurado) y envía la imagen junto con el catálogo oficial de candidaturas. La respuesta JSON estructurada se valida en servidor y en cliente: votos enteros o `null`, candidaturas no legibles y advertencias aritméticas sin autoajuste.
- Después de cargar la evidencia se abre `ActOcrReview` con los identificadores reales. La pantalla muestra los valores originales y permite editarlos con React Hook Form y Zod. El botón «Confirmar resultados revisados» llama a `confirmar-resultados` con revisión humana obligatoria (S-06); nada se publica automáticamente.
- Sin conexión, el worker procesa la cola `process_ocr`, guarda `ocr_result.${localEvidenceId}` en SQLite y registra una entrada `ocr_review.*`. El historial de pendientes permite abrir la revisión cuando vuelve la conectividad y descarta la entrada después de confirmar.
- No se modificaron esquema, RLS ni relaciones; la función no persiste resultados propios fuera de los campos existentes del acta y del historial de correcciones.

**Estado de F08:** captura → evidencia → OCR → revisión editable → confirmación humana integrado de extremo a extremo. El secreto de Gemini existe en Supabase; pendiente de prueba real con documentos ficticios o autorizados y verificación del tipo MIME/tamaño en dispositivo.

**Verificación:** las siete aserciones del validador de respuesta OCR y las 18 pruebas unitarias dirigidas pasaron; ESLint y TypeScript limitado a `src/` pasaron; Expo Doctor aprobó 20/20 comprobaciones y el bundle Android se exportó. `procesar-acta-ocr` aparece `ACTIVE` en remoto. No se realizó una llamada real a Gemini.

### F09 — Funcionamiento offline y sincronización

Permite trabajar sin conexión mediante almacenamiento local.

Contempla:
- Consulta de información disponible localmente.
- Registro de información sin conexión.
- Conservación de fotografías y datos pendientes.
- Identificación de registros pendientes de sincronización.
- Sincronización al recuperar conectividad.
- Manejo de errores y conflictos.

La estrategia respeta ADR-02.

#### Implementación completada

- `SQLiteOfflineQueue` conserva operaciones `register_act`, `upload_evidence`, `process_ocr`, `confirm_ocr`, `apply_correction` y `exit_poll`, con estado, intentos, error y fecha. `local_state` guarda los mapas de identificadores locales a remotos, el catálogo cacheado por veedor y los resultados/revisiones de OCR.
- `NetInfoNetworkStatus` detecta conectividad y el bootstrap de la sesión sincroniza automáticamente al recuperar red. `OfflineSyncWorker` procesa la cola en dos fases: primero acta y evidencia, después OCR, confirmación/corrección y Exit Poll. Los fallos se marcan como `failed`, se reintentan manualmente y se reportan al registrador de errores.
- La fotografía se copia al directorio persistente del dispositivo antes de encolarse; la cola conserva esa ruta durable, no la URI temporal de la cámara.
- La pantalla `OfflineHistory` muestra pendientes, permite sincronizar o reintentar y ofrece las revisiones de OCR ya generadas. Los actos de confirmación/corrección prevalecen por última modificación (S-03); las operaciones se envían con la sesión del usuario y las validaciones del servidor.

**Estado de F09:** implementado e integrado con F05–F08 y F10. Pendiente probar cortes de red reales, reinicios de la aplicación y reintentos en Android.

**Verificación:** ESLint y TypeScript limitado a `src/` pasaron; 18 pruebas unitarias dirigidas pasaron; Expo Doctor aprobó 20/20 comprobaciones y el bundle Android se exportó. No se simuló aún un ciclo completo offline → online en dispositivo.

### F10 — Paneles y resultados

Permite visualizar información y estadísticas según el rol y el ámbito territorial.

Incluye:
- Seguimiento de recintos.
- Estado de registro de actas.
- Información de personal.
- Resultados de Alcaldía.
- Resultados de Prefectura.

Los datos mostrados deben respetar los permisos de acceso.

#### Implementación completada

- `DashboardScreen` consulta `SupabaseDashboardRepository`, que filtra por asignaciones vigentes del veedor, recinto del coordinador de recinto o provincia del coordinador provincial. Muestra avance por recinto, actas recientes, resultados por dignidad, evidencias, correcciones y Exit Poll, sin consultas directas desde la interfaz.
- El Exit Poll se registra mediante la Edge Function `registrar-encuesta`, desplegada en remoto, que valida sesión, rol de coordinador, jurisdicción de la mesa, dignidad y candidatura. Sin conexión, la respuesta se encola y se sincroniza después.
- Las advertencias GPS son heurísticas (centroide de evidencias, umbral de 1.000 m) y no bloquean registros, de acuerdo con S-02.
- La corrección de actas se abre desde las actas recientes para veedor y coordinador de recinto, reutilizando F07.

**Estado de F10:** panel por rol y Exit Poll integrados con persistencia real. Pendiente validar agregaciones y permisos con cuentas autorizadas y datos electorales de prueba.

**Verificación:** ESLint y TypeScript limitado a `src/` pasaron; Expo Doctor aprobó 20/20 comprobaciones y el bundle Android se exportó. La función `registrar-encuesta` aparece `ACTIVE` en remoto. No se consultaron resultados reales desde un dispositivo.

### F11 — Monitoreo y manejo de errores

Permite identificar y registrar errores de ejecución.

Se utiliza Firebase Crashlytics para facilitar el seguimiento y análisis de problemas, conforme a ADR-06.

#### Integración completada

- Se instalaron con `npx expo install`, compatibles con Expo SDK 58 / React Native 0.88.1: `@react-native-firebase/app` y `@react-native-firebase/crashlytics` 27.2.0, `expo-build-properties` 58.0.12 y `expo-dev-client` 58.0.21 (este último para compilaciones de desarrollo con código nativo).
- `app.json` registra los plugins `@react-native-firebase/app`, `@react-native-firebase/crashlytics` y `expo-build-properties` con `android.minSdkVersion: 24`, requisito de React Native Firebase v27. Define `android.package: com.controlelectoral.app` y `android.googleServicesFile: ./google-services.json`.
- `firebase.json` desactiva la generación automática de eventos fatales de JS de Crashlytics (`crashlytics_is_error_generation_on_js_crash_enabled: false`) y mantiene el encadenamiento (`crashlytics_javascript_exception_handler_chaining_enabled: true`). Así se conserva el único manejador global de `App.tsx`, se preserva el comportamiento fatal de React Native y no se duplican reportes. `App.tsx` no fue modificado en esta entrega.
- `FirebaseCrashlyticsErrorReporter` sustituye al reportero local en el cableado de `src/store/store.ts`. Primero persiste el evento con `SQLiteErrorReporter` y después envía a Crashlytics los atributos `screen`, `operation`, versión de Android, modelo de dispositivo y detalles primitivos filtrados. No envía identificadores de usuario, correos, contraseñas, tokens ni claves. Los fallos de Crashlytics no interrumpen la aplicación ni borran el registro local.
- Crashlytics captura automáticamente los críticos nativos; los errores manejados y el manejador global existente se envían como eventos no fatales con traza JS mediante `recordError`. La recolección permanece desactivada en compilaciones de depuración, según la configuración predeterminada del SDK.
- No se agregó un segundo manejador global, no se expusieron secretos en el cliente y no se modificaron otras funcionalidades.
- `google-services.json` está presente en la raíz. Su JSON es válido, contiene un único cliente Android, el paquete `com.controlelectoral.app`, `mobilesdk_app_id`, clave de cliente, `project_id`, `project_number` y `storage_bucket`. La ausencia de `api_key` en la raíz y de `firebase_url` es normal en este formato cuando no se usan esas secciones. No se imprimieron ni copiaron valores sensibles.
- Se ejecutó `npx expo prebuild --platform android --no-install` solo como verificación: aplicó los plugins, generó `namespace`/`applicationId` `com.controlelectoral.app`, `minSdkVersion=24`, `newArchEnabled=true`, las dependencias Gradle de Google Services y Crashlytics, y copió `google-services.json` a `android/app/`. La carpeta nativa generada se eliminó posteriormente para conservar el repositorio como estaba.
- `eas.json` define el perfil `preview` con `android.buildType: "apk"`, además del perfil `production` predeterminado. No se ejecutó EAS Build ni se generó el APK.

**Estado de F11:** integración y configuración local completadas conforme a ADR-06. La asociación remota del archivo con Firebase Console fue informada por el usuario, pero no se verificó de forma independiente desde este entorno.

**Requisitos para generar y probar el APK:**
1. Confirmar en Firebase Console que Crashlytics está habilitado para el proyecto asociado a `google-services.json`.
2. Tener sesión iniciada en EAS, un proyecto de Expo vinculado (`eas init` si aún no está vinculado) y acceso a las credenciales de firma Android.
3. Ejecutar `eas build -p android --profile preview` para obtener un APK instalable. Para una compilación local se requiere Android SDK y JDK; este entorno no los tiene configurados.
4. Instalar el APK release en un dispositivo o emulador, generar un evento de prueba, reiniciar la aplicación y revisar el evento en Firebase Crashlytics Console. No se debe probar con Expo Go ni con una compilación de depuración.
5. Node.js 24.12 o superior evita los avisos `EBADENGINE` de las dependencias de Firebase; el entorno local tiene 24.11.1.

**Pendiente:** ejecutar la compilación EAS, instalar la compilación release y confirmar la recepción real de un evento en Crashlytics. No se generó APK ni se inventaron credenciales.

**Verificación de esta ronda:** `npx expo-doctor` 20/20; `npx tsc --noEmit -p tsconfig.src.json` pasó; ESLint dirigido a `App.tsx`, `store.ts`, `src/features/monitoring` y `src/navigation` pasó; `npx expo export --platform android --no-minify` generó el bundle sin el aviso anterior de `google-services.json`; `npx expo config --type prebuild --json` resolvió el paquete y la ruta del archivo; el prebuild de verificación aplicó la configuración nativa esperada. No se recibió un evento real en Crashlytics porque no se compiló ni instaló una versión release.

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

