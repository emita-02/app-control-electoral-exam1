# Requisitos del sistema — Control Electoral

## 1. Requisitos funcionales

| Código | Requerimiento |
|---|---|
| RF-01 | Validación de identidad e impedir el autorregistro público. Únicamente el coordinador provincial crea cuentas para coordinadores de recinto y estos crean cuentas para los veedores. |
| RF-02 | Validar campos como cédula, nombres, teléfono y correo electrónico, exigiendo confirmar la cuenta a través del SMTP de Supabase en cada usuario creado. |
| RF-03 | Cambio obligatorio de clave inicial y recuperación de esta. Obligar al usuario en su primer inicio de sesión a cambiar la contraseña temporal asignada por el superior y permitir restablecer las contraseñas olvidadas mediante correo electrónico. |
| RF-04 | Gestión de territorio y precarga electoral de los recintos del cantón-provincia elegidos junto con las cinco organizaciones políticas y sus candidatos tanto de Alcaldía como de Prefectura, permitiendo al coordinador provincial consultar y agregar nuevos recintos en su jurisdicción. |
| RF-05 | Permitir al coordinador provincial gestionar coordinadores de recinto (uno por recinto), al igual que cada coordinador de recinto gestiona uno o varios veedores de mesas sin límite. |
| RF-06 | Permitir al coordinador de recinto reemplazar a los veedores ausentes durante el proceso electoral, permitiendo reasignar veedores. |
| RF-07 | Permitir a cada veedor capturar dos actas por cada mesa asignada: una de Alcaldía y una de Prefectura, con el número de votos totales, válidos, nulos y en blanco. |
| RF-08 | Captura fotográfica (no se permite utilizar imágenes de galería) con control local de nitidez y geolocalización. Analizar la nitidez localmente antes de aceptar la imagen, bloquear imágenes borrosas y capturar automáticamente las coordenadas GPS en el momento de la toma. |
| RF-09 | Extracción de datos asistida por IA. Tras procesar y aceptar la nitidez de la imagen, se enviará a un agente de IA mediante OCR para extraer los votos en formato JSON, asignando null a datos ilegibles y rellenando los campos del formulario para su verificación, edición humana y validación aritmética antes del envío. |
| RF-10 | Historial de actas y cola diferida. Proveer una vista de historial con pestañas diferenciadas para pendientes y enviadas que permita gestionar actas capturadas sin señal y procesar automáticamente el OCR al recuperar la conexión, notificando al veedor para su revisión y envío manual. |
| RF-11 | Corrección de actas por veedor y coordinador. Permitir al veedor editar los resultados o fotografías de sus mesas asignadas y que el coordinador de recinto pueda corregir cualquier acta perteneciente a las mesas de su recinto. Añadir seguimiento de las acciones de usuario con notificaciones o alertas. |
| RF-12 | Control de acceso y visibilidad por rol. Restringir la visualización y modificación de información para que cada veedor acceda solamente a sus mesas asignadas, cada coordinador de recinto únicamente a su recinto y el coordinador provincial a toda su jurisdicción. |
| RF-13 | Monitoreo del avance, auditoría geográfica y Exit Poll en tiempo real. Mostrar al coordinador provincial el progreso de mesas reportadas frente a faltantes por recinto, el detalle auditado de cada acta con su fotografía y ubicación en el mapa, un indicador visual de advertencias si las coordenadas GPS difieren significativamente de las demás y el conteo acumulado en vivo por candidato, tanto por recinto como en el total cantonal. |

## 2. Requisitos no funcionales

| Código | Requerimiento |
|---|---|
| RNF-01 | Operación Offline-First y sincronización. Permitir capturar y validar nitidez, georreferenciar y almacenar actas localmente sin internet, ejecutando colas automáticas del procesamiento OCR y sincronización en segundo plano al recuperar la red. |
| RNF-02 | Aislamiento de seguridad a nivel de datos. Aplicar políticas de seguridad estrictas en el servidor y almacenamiento para impedir filtraciones de actas o fotografías entre distintos recintos o mesas electorales. |
| RNF-03 | Observabilidad y reporte de fallos offline. Capturar automáticamente cierres inesperados y errores funcionales, como fallos al subir fotografías o fallos en el agente de IA (OCR), incluyendo modelo del dispositivo, versión de Android y pantalla activa. Almacenar localmente tareas pendientes para enviarlas cuando exista conexión. |
| RNF-04 | Desarrollar la aplicación en React Native bajo la organización de código Clean Architecture y generar un APK instalable para Android. |

## 3. Alcance territorial

La configuración individual del proyecto corresponde a:

- País: Ecuador.
- Provincia: Pichincha.
- Cantón: Quito.

## 4. Actores del sistema

### Coordinador provincial
- Gestiona los recintos de su jurisdicción.
- Crea y administra coordinadores de recinto.
- Supervisa el avance electoral de los recintos.
- Consulta información y resultados de Alcaldía y Prefectura.

### Coordinador de recinto
- Gestiona los veedores de su recinto.
- Asigna y reemplaza veedores.
- Supervisa las mesas y actas del recinto.
- Puede corregir las actas de su recinto.

### Veedor
- Consulta sus mesas asignadas.
- Captura actas de Alcaldía y Prefectura.
- Adjunta evidencias fotográficas y ubicación GPS.
- Revisa, corrige y envía sus actas.
- Consulta el estado de sincronización.

## 5. Supuestos adoptados

| Código | Ambigüedad que resuelve | Supuesto adoptado |
|---|---|---|
| S-01 | El enunciado exige detectar sumas que no cuadran en el acta, pero en las actas físicas del CNE puede haber ligeros descuadres. | Exigir validación aritmética estricta: el total de sufragantes debe ser igual a la suma de los votos de los cinco candidatos, más votos blancos y nulos. Puede ser menor cuando existen papeletas no usadas, pero no debe superar el número de sufragantes. |
| S-02 | No se especifica si debe bloquearse el envío cuando el GPS está lejos del recinto. | Obtener la ubicación GPS al tomar la fotografía, incluso sin internet. Si está alejada, mostrar una advertencia para auditoría, sin bloquear el envío. |
| S-03 | El veedor y el coordinador pueden corregir la misma acta, incluso sin conexión. | Resolver conflictos mediante Last-Write-Wins, conservando el identificador del usuario que realizó el cambio y la trazabilidad. |
| S-04 | No se especifica qué ocurre con las actas de un veedor reemplazado. | Las actas conservan al autor original y el nuevo veedor hereda el acceso para registrar actas pendientes y corregir las existentes. |
| S-05 | Se exige verificar el correo y cambiar la clave inicial, pero algunos recintos no tienen conexión. | Crear las cuentas, verificar correos y cambiar claves antes de la jornada electoral. Mantener el JWT almacenado localmente mediante Expo SecureStore para operar sin conexión. |
| S-06 | El OCR de actas pendientes podría interpretarse como un envío automático al servidor. | El OCR nunca envía directamente los resultados al Exit Poll. La información pasa a un estado listo para revisión; el veedor debe verificar, completar, validar y autorizar el envío. |