
# Control Electoral — Instrucciones para el equipo de desarrollo

## 1. Contexto del proyecto

Este repositorio contiene **Control Electoral**, una aplicación móvil para Android desarrollada con React Native y Expo, destinada al monitoreo de actividades electorales en Ecuador.

La aplicación contempla tres roles:

- **Coordinador provincial:** gestiona los centros de votación dentro de su jurisdicción, designa a los coordinadores de centro, monitorea el avance del proceso electoral y consulta los resultados.
- **Coordinador de centro de votación:** gestiona a los delegados (observadores), los asigna a las mesas electorales, reemplaza al personal ausente y supervisa las actas electorales en su centro de votación.
- **Delegado (observador):** consulta las mesas asignadas, registra actas electorales, carga evidencia fotográfica, registra información de GPS y corrige sus propios registros cuando cuenta con la debida autorización.

La aplicación debe permitir el funcionamiento sin conexión (offline), la sincronización segura, el acceso basado en roles y la validación de datos electorales.

El desarrollo individual debe ajustarse a los requisitos y a las decisiones de arquitectura (ADR) aprobadas por el grupo.

## 2. Tecnologías obligatorias

Se deben utilizar las tecnologías establecidas en las decisiones de arquitectura (ADR) del grupo:

- React Native y Expo.
- TypeScript.
- Arquitectura limpia (Clean Architecture).
- Redux Toolkit.
- React Hook Form y Zod.
- Supabase para el backend, la autenticación y la base de datos.
- SQLite, Expo File System y NetInfo para el almacenamiento local y la sincronización.
- Expo Camera, Expo Image Manipulator y JPEG-JS para el procesamiento de imágenes.
- API de Gemini (seleccionada para OCR asistido por IA), a la cual se accede de forma segura a través de un servicio de backend.
- Expo Location y React Native WebView para la gestión de ubicación y mapas.
- Firebase Crashlytics para el monitoreo de errores.
- React Navigation, Gorhom Bottom Sheet, Lottie, Reanimated y Uniwind.

No se permite reemplazar ni introducir tecnologías alternativas sin una aprobación explícita.

**Importante:** Si detecta un conflicto entre las configuraciones existentes del proyecto o las decisiones de arquitectura (ADR) del grupo, notifique el conflicto y solicite una aclaración antes de proceder con la implementación. No resuelva conflictos arquitectónicos basándose en suposiciones.

## 3. Documentación de Expo y React Native

Expo introduce cambios entre sus distintas versiones de SDK. Nunca asuma que las API de versiones anteriores siguen siendo compatibles.

Antes de escribir código que involucre API de Expo, EAS o React Native:

1. Verifique la versión de Expo instalada consultando el archivo `package.json`. 2. Consulta la documentación oficial correspondiente a esa versión del SDK.
3. Consulta la documentación pertinente de React Native y de las librerías cuando sea necesario.
4. Verifica que las API y dependencias propuestas sean compatibles con el SDK instalado.

Documentación oficial:

- https://docs.expo.dev/versions/
- https://docs.expo.dev/llms.txt
- https://reactnative.dev/docs/getting-started

Nunca actualices Expo o React Native simplemente porque exista una versión más reciente.

## 4. Reglas de arquitectura

Sigue los principios de la Arquitectura Limpia (Clean Architecture) y mantén la separación de responsabilidades.

Organiza el código en capas claramente diferenciadas:

- **Dominio:** entidades, reglas de negocio y contratos de repositorios.
- **Aplicación:** casos de uso y operaciones específicas de la aplicación.
- **Infraestructura/Datos:** implementaciones de repositorios, almacenamiento local, servicios remotos e integraciones externas.
- **Presentación:** pantallas, componentes, *hooks* y estado de la interfaz de usuario (UI).

La estructura exacta de las carpetas debe definirse en la documentación de arquitectura antes de implementar funcionalidades.

Reglas:

- La lógica de dominio no debe depender de React Native, Expo ni Supabase.
- Los componentes de presentación no deben ejecutar consultas a la base de datos directamente.
- El acceso a servicios externos debe realizarse a través de abstracciones adecuadas.
- Valida los datos en los límites de la aplicación y del *backend*.
- No dupliques reglas de negocio entre distintas pantallas.
- Mantén los componentes enfocados en una única responsabilidad y reutilizables cuando esté justificado.

Utiliza Redux Toolkit para gestionar el estado de la aplicación, tal como se establece en el ADR-03.

## 5. Registros de Decisiones Arquitectónicas (ADR)

El equipo ha aprobado siete decisiones arquitectónicas:

- **ADR-01:** Supabase como *backend* y plataforma de autenticación.
- **ADR-02:** SQLite, Expo File System y NetInfo para el almacenamiento y la sincronización sin conexión (*offline*).
- **ADR-03:** Arquitectura Limpia (Clean Architecture), Redux Toolkit, React Hook Form y Zod.
- **ADR-04:** Expo Camera, Expo Image Manipulator y JPEG-JS para la captura de evidencias fotográficas y el procesamiento de imágenes.
- **ADR-05:** Expo Location y React Native WebView para la gestión de ubicación y mapas. - **ADR-06:** Firebase Crashlytics para el monitoreo de errores.
- **ADR-07:** React Navigation, Gorhom Bottom Sheet, Lottie, Reanimated y Uniwind.

Antes de implementar una funcionalidad, consulta el ADR correspondiente.

No modifiques, reemplaces ni contradigas las decisiones tomadas por el grupo sin una aprobación explícita.

Si un ADR no define un detalle de implementación, documenta la decisión faltante y propón alternativas antes de continuar.

## 6. Metodología de desarrollo FDD

Utiliza el desarrollo basado en funcionalidades (FDD, por sus siglas en inglés).

Organiza la implementación en torno a funcionalidades específicas, en lugar de desarrollar toda la aplicación de una sola vez.

Catálogo inicial de funcionalidades:

- F01 — Autenticación y gestión de usuarios.
- F02 — Gestión territorial y de centros de votación.
- F03 — Gestión de personal y tareas.
- F04 — Registro y validación de actas electorales.
- F05 — OCR y extracción asistida de datos.
- F06 — Almacenamiento sin conexión (offline) y sincronización.
- F07 — Paneles de seguimiento electoral y encuestas a pie de urna (Exit Polls).
- F08 — Monitoreo de errores y fiabilidad de la aplicación.

Cada funcionalidad debe incluir:

1. Descripción y objetivo.
2. Requisitos y criterios de aceptación.
3. Referencias a la arquitectura pertinente y a las decisiones de arquitectura (ADR).
4. Plan de implementación.
5. Pruebas.
6. Resultados de la verificación.
7. Estado de finalización.

No inicies una nueva funcionalidad hasta que la actual haya sido revisada y aprobada.

## 7. Flujo de trabajo del agente y aprobación

Trabaja de forma incremental y comunícate mediante etapas claras.

Para cada tarea:

1. Analiza la solicitud y los archivos relevantes del proyecto.
2. Identifica los requisitos, las decisiones de arquitectura (ADR) y las capacidades (Skills) aplicables.
3. Propón un plan de implementación.
4. Espera la aprobación del usuario antes de realizar cambios sustanciales.
5. Implementa únicamente el alcance aprobado.
6. Ejecuta las pruebas pertinentes y los controles de calidad.
7. Informa sobre los archivos modificados, los resultados, las limitaciones conocidas y las decisiones pendientes.
8. Espera la aprobación antes de pasar a la siguiente etapa.

Nunca:

- Generes la aplicación completa sin aprobación previa.
- Modifiques decisiones de arquitectura de forma independiente.
- Instales dependencias sin aprobación.
- Elimines o sobrescribas archivos existentes del proyecto sin verificar su propósito.
- Realices commits, envíes cambios (push) o fusiones ramas (merge) sin autorización explícita.
- Afirmes que una prueba ha sido superada si no se ha ejecutado.

## 8. Supabase y seguridad

Sigue prácticas seguras en el backend:

- Utiliza la seguridad a nivel de fila (Row Level Security - RLS) para los datos protegidos.
- Aplica permisos basados ​​en roles y territorio en el backend, no solo en la interfaz móvil.
- Valida la autorización en cada operación sensible.
- Nunca expongas las claves de rol de servicio (service-role keys) de Supabase en la aplicación móvil.
- Almacena los secretos en variables de entorno adecuadas o en el gestor de secretos del backend.
- No asumas que ocultar un botón constituye una autorización suficiente.
- Preserva la integridad y la trazabilidad de los registros electorales.

Utiliza Supabase Edge Functions para operaciones que requieran credenciales protegidas o una ejecución confiable en el lado del servidor. ## 9. API de Gemini y OCR

La API de Gemini es la opción de IA seleccionada para el procesamiento de actas electorales mediante OCR.

Requisitos de seguridad:

- Nunca incluyas la clave de la API de Gemini en la aplicación React Native.
- Accede a Gemini a través de un servicio backend protegido, como una *Edge Function* de Supabase.
- No envíes información electoral sensible real a servicios externos no autorizados.
- Utiliza documentos de prueba ficticios o autorizados durante el desarrollo.

El OCR debe servir de apoyo para la extracción de información, pero no debe tomar decisiones electorales definitivas.

Todos los valores extraídos deben ser revisados ​​y autorizados por una persona antes de registrarse como resultados oficiales.

Conserva la evidencia fotográfica original y el proceso de revisión correspondiente.

## 10. Funcionalidad *Offline-First* (prioridad al modo sin conexión)

La aplicación debe permitir su funcionamiento sin conexión a internet.

Sigue el documento ADR-02 al implementar:

- Persistencia local.
- Operaciones pendientes.
- Sincronización.
- Detección del estado de la red.
- Gestión de conflictos.
- Recuperación ante errores.

Respeta las premisas aprobadas por el grupo:

- **S-01:** validación aritmética de las actas electorales.
- **S-02:** si el GPS indica una ubicación fuera del centro de votación, se genera una advertencia, pero no un bloqueo automático.
- **S-03:** en caso de conflictos de edición, prevalece la última modificación (*Last-Write-Wins*).
- **S-04:** al reemplazar a un observador electoral, se conservan las actas previas y se otorgan los permisos correspondientes al nuevo observador.
- **S-05:** las cuentas deben estar preparadas antes del día de las elecciones.
- **S-06:** el OCR nunca envía resultados oficiales de forma automática; la revisión y autorización humana son obligatorias.

No modifiques estas premisas sin la aprobación del grupo.

## 11. Comandos y controles de calidad

Este repositorio utiliza `npm`. Emplea los comandos de `npm`, a menos que la configuración del proyecto indique lo contrario.

Instala las dependencias compatibles con Expo mediante:

```bash
npx expo install <paquete>
```

Comandos útiles:

```bash
npx expo start
npx expo lint
npx tsc --noEmit
npx expo-doctor
```

Antes de dar por finalizada una implementación:

- Ejecuta las pruebas correspondientes.
- Ejecuta el *linting*.
- Realiza la verificación de tipos de TypeScript. 
- Verifica la compatibilidad con Expo cuando cambien las dependencias o la configuración nativa.
- Informa sobre cualquier comando que no haya podido ejecutarse y explica el motivo.

No utilices `npm install <package>` para dependencias nativas de Expo; emplea `npx expo install`, ya que este comando determinará la versión compatible.

## 12. Interfaz de usuario y experiencia de usuario

La interfaz debe seguir un enfoque *mobile-first* (prioridad para dispositivos móviles), ser accesible, coherente y fácil de usar durante las actividades de la jornada electoral.

Ten en cuenta:

- Uso de Uniwind para el estilo.
- Uso de Reanimated para animaciones.
- Uso de Lottie para las animaciones requeridas.
- Uso de Gorhom Bottom Sheet para las interacciones correspondientes.
- Proporcionar retroalimentación clara en estados de carga, éxito, errores y validación.
- Pantallas y permisos específicos según el rol del usuario.
- Usabilidad en condiciones de conectividad limitada.

Evita la complejidad visual innecesaria y las interacciones que puedan ralentizar el registro de datos electorales.

## 13. Documentación del proyecto

Mantén la documentación en el directorio `docs/`:

- `requirements/`: requisitos funcionales y no funcionales.
- `adr/`: decisiones arquitectónicas aprobadas.
- `architecture/`: diagramas de arquitectura y explicaciones técnicas.
- `fdd/`: catálogo de funcionalidades, planes y progreso.

Mantén la documentación coherente con la aplicación implementada.

Cuando sea necesaria una nueva decisión arquitectónica, propón un ADR antes de implementar cualquier cambio que afecte a la arquitectura.

## 14. Instrucciones generales

- Comprende el código existente antes de modificarlo.
- Prioriza soluciones sencillas, legibles y fáciles de mantener.
- Utiliza tipos de TypeScript de forma explícita cuando sea apropiado.
- Evita abstracciones y dependencias innecesarias.
- No inventes requisitos ni reglas de negocio.
- Solicita aclaraciones si falta información o si esta resulta contradictoria.
- Explica las decisiones técnicas utilizando un lenguaje que el estudiante pueda comprender y defender académicamente.

**La prioridad es desarrollar una aplicación electoral segura, fiable y fácil de mantener, que siga la arquitectura y los requisitos aprobados por el grupo.**