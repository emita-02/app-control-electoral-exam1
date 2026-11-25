# Instrucciones generales de GitHub Copilot — Control Electoral

## 1. Contexto del proyecto

Estás trabajando en **Control Electoral**, una aplicación móvil desarrollada como proyecto académico para el control y registro de información electoral en Ecuador.

El proyecto ya tiene una configuración inicial, documentación, decisiones arquitectónicas, reglas de desarrollo, Skills y configuración de Supabase. No debes tratarlo como un proyecto nuevo ni reconstruirlo desde cero.

Antes de realizar cualquier modificación, inspecciona la estructura y los archivos existentes.

## 2. Documentación obligatoria

Antes de implementar cualquier funcionalidad, consulta:

- `AGENTS.md`: instrucciones generales y contexto del proyecto.
- Los ADR existentes: decisiones arquitectónicas y tecnológicas aprobadas.
- Las Rules del proyecto: restricciones y convenciones de desarrollo.
- Las Skills disponibles: procedimientos y conocimientos específicos de cada área.
- El FDD: funcionalidades y requisitos funcionales del sistema.

No inventes decisiones que contradigan esta documentación.

Si encuentras contradicciones entre documentos, no elijas arbitrariamente una alternativa. Identifica el conflicto y solicita autorización antes de modificar las decisiones establecidas.

## 3. Arquitectura y tecnologías

Respeta obligatoriamente las tecnologías y decisiones aprobadas:

- Expo SDK 58 y React Native.
- TypeScript.
- Supabase para autenticación, base de datos, almacenamiento y Edge Functions.
- Clean Architecture.
- Redux Toolkit.
- React Hook Form y Zod.
- SQLite, Expo File System y NetInfo para almacenamiento y sincronización offline.
- Expo Camera, Expo Image Manipulator y JPEG-JS para captura y procesamiento de imágenes.
- Expo Location y React Native WebView.
- Firebase Crashlytics para monitoreo de errores.
- React Navigation.
- Gorhom Bottom Sheet.
- Reanimated.
- Lottie.
- Uniwind para los estilos.

No sustituyas, elimines ni incorpores tecnologías que contradigan los ADR.

Antes de instalar una dependencia, comprueba su compatibilidad con Expo SDK 58. Prioriza `npx expo install` cuando corresponda.

## 4. Diseño e interfaz

Respeta la identidad visual definida para Control Electoral.

Paleta de colores:

- Cian principal: `#00AEEF`
- Rojo: `#EF3340`
- Azul marino: `#17324D`
- Fondo: `#F5F7FA`
- Blanco: `#FFFFFF`
- Cian claro: `#EAF8FC`
- Texto: `#263238`
- Texto secundario: `#667085`
- Bordes: `#DCE3E8`

Utiliza Uniwind para los estilos mediante `className`.

Mantén una interfaz clara, consistente, accesible y apropiada para una aplicación de uso electoral. Evita incorporar estilos o componentes visuales que no respeten el diseño establecido.

## 5. Reglas de implementación

- Inspecciona los archivos antes de modificarlos.
- Reutiliza componentes, servicios, hooks y configuraciones existentes.
- Mantén la separación de responsabilidades definida por Clean Architecture.
- Utiliza TypeScript con tipado adecuado.
- Evita duplicar lógica y crear abstracciones innecesarias.
- Implementa validaciones en los formularios utilizando las herramientas establecidas.
- Gestiona correctamente los estados de carga, error, éxito y ausencia de datos.
- Considera los permisos, la autenticación y el rol del usuario.
- Respeta las políticas RLS y la seguridad configurada en Supabase.
- No incluyas credenciales, contraseñas, tokens ni claves privadas directamente en el código.
- No cambies variables de entorno existentes sin autorización.
- No inventes candidatos, organizaciones políticas ni información electoral oficial.
- No implementes funcionalidades que contradigan los requisitos del FDD.

## 6. Integración con Supabase

El proyecto ya cuenta con un proyecto Supabase configurado y vinculado.

Debes reutilizar la configuración existente.

No debes:

- Crear otro proyecto Supabase.
- Modificar el esquema de la base de datos sin autorización.
- Eliminar o reemplazar políticas RLS.
- Cambiar las funciones SQL existentes sin justificación y aprobación.
- Modificar las Edge Functions existentes sin revisar primero su implementación.
- Exponer claves privadas o credenciales.

Cuando una funcionalidad requiera operaciones de escritura, respeta el mecanismo de backend establecido y las restricciones de seguridad existentes.

## 7. Skills y Rules

Consulta las Skills aplicables a cada tarea antes de implementarla.

Skills del proyecto:

- `fdd`: requisitos y funcionalidades del sistema.
- `ui-ux-design`: diseño de interfaz y experiencia de usuario.
- `offline-sync`: almacenamiento local y sincronización.
- `ocr-gemini`: reconocimiento de actas mediante Gemini.
- `testing`: pruebas y validación.

Respeta también las instrucciones específicas ubicadas en `.github/instructions/` y las instrucciones generales de `AGENTS.md`.

No ignores una Skill aplicable ni reemplaces sus procedimientos por decisiones improvisadas.

## 8. Metodología de trabajo obligatoria

El desarrollo se realizará por fases y tareas pequeñas.

Para cada tarea:

1. Inspecciona el código y la documentación relacionada.
2. Identifica los archivos que necesitan cambios.
3. Implementa la funcionalidad solicitada.
4. Ejecuta las comprobaciones y pruebas pertinentes.
5. Corrige los errores introducidos.
6. Presenta un resumen de los cambios realizados.
7. Indica los archivos creados, modificados y los pendientes.
8. Espera la revisión y aprobación del usuario antes de continuar con otra fase.

No avances automáticamente a funcionalidades posteriores.

## 9. Restricciones sobre cambios

No realices las siguientes acciones sin autorización expresa:

- Crear o eliminar proyectos.
- Cambiar la arquitectura.
- Sustituir tecnologías de los ADR.
- Modificar el esquema de Supabase.
- Eliminar archivos de configuración o documentación.
- Modificar o eliminar Skills y Rules.
- Realizar commits o pushes.
- Instalar dependencias innecesarias.
- Implementar funcionalidades fuera del alcance de la tarea solicitada.

No sobrescribas archivos completos si basta con modificar una parte de ellos.

## 10. Comunicación y resultados

Toda explicación, documentación, comentario y resumen dirigido al usuario debe estar redactado en español.

El usuario es estudiante y está desarrollando el proyecto académicamente. Explica las decisiones técnicas de manera clara y directa, sin asumir conocimientos avanzados innecesarios.

No te limites a proponer planes o mostrar fragmentos de código cuando se te solicite implementar una funcionalidad. Realiza los cambios directamente en los archivos del proyecto.

Si no puedes completar una tarea, informa exactamente qué quedó pendiente, qué error ocurrió y qué se necesita para resolverlo.

**Prioridad principal:** implementar correctamente Control Electoral respetando los requisitos, la arquitectura y las decisiones ya aprobadas, sin reconstruir ni alterar innecesariamente el trabajo existente.