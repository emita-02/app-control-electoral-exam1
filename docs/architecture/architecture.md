# Arquitectura del sistema — Control Electoral

## 1. Visión arquitectónica

Control Electoral se desarrolla como una aplicación móvil basada en Clean Architecture, con separación de responsabilidades entre presentación, dominio y datos.

La arquitectura debe facilitar el mantenimiento, las pruebas, la evolución de los módulos y la integración con los servicios externos.

Las decisiones definitivas de tecnologías y componentes se encuentran documentadas en los ADR grupales.

## 2. Tecnologías principales

- Expo SDK 58.
- React Native.
- TypeScript.
- Supabase.
- PostgreSQL.
- Supabase Auth.
- Supabase Edge Functions.
- Supabase Storage.
- Redux Toolkit.
- React Hook Form.
- Zod.
- SQLite.
- Expo File System.
- NetInfo.
- Expo Camera.
- Expo Image Manipulator.
- JPEG-JS.
- Expo Location.
- React Native WebView.
- Firebase Crashlytics.
- React Navigation.
- Gorhom Bottom Sheet.
- Reanimated.
- Lottie.
- Uniwind.

Las versiones y dependencias deben mantenerse compatibles con Expo SDK 58.

## 3. Organización por capas

### 3.1 Presentación

Responsable de la interacción con el usuario.

Contiene:
- Pantallas.
- Componentes visuales.
- Formularios.
- Hooks de presentación.
- Navegación.
- Estados de interfaz.

Los estilos deben implementarse con Uniwind.

### 3.2 Dominio

Contiene la lógica y las reglas de negocio.

Contiene:
- Entidades.
- Casos de uso.
- Contratos de repositorios.
- Validaciones propias del dominio.

Esta capa no debe depender directamente de componentes visuales ni de servicios externos.

### 3.3 Datos

Responsable de obtener, almacenar y persistir información.

Contiene:
- Implementaciones de repositorios.
- Fuentes de datos remotas.
- Integración con Supabase.
- Persistencia local con SQLite.
- Gestión de evidencias.
- Mecanismos de sincronización.

## 4. Backend y servicios

Supabase proporciona los servicios principales del backend:

- Autenticación de usuarios.
- Base de datos PostgreSQL.
- Almacenamiento de fotografías de actas.
- Edge Functions para operaciones que requieren ejecución segura en el servidor.

El acceso a los datos debe respetar las políticas RLS y los permisos asociados a cada rol.

Las operaciones sensibles no deben depender de permisos de escritura directos desde el cliente cuando el diseño de seguridad establece su ejecución en el backend.

## 5. Almacenamiento y sincronización

El sistema utiliza una estrategia Offline-First.

SQLite permite conservar información local para trabajar sin conexión.

Expo File System permite gestionar archivos locales y evidencias.

NetInfo permite identificar el estado de conectividad.

La sincronización debe contemplar:
- Registros pendientes.
- Estados de sincronización.
- Reintentos.
- Manejo de errores.
- Resolución de conflictos conforme a los supuestos aprobados.

La implementación debe respetar el ADR-02 y la Skill `offline-sync`.

## 6. Captura y procesamiento de actas

La captura de evidencias utiliza Expo Camera.

El procesamiento de imágenes utiliza Expo Image Manipulator y JPEG-JS.

La ubicación se obtiene mediante Expo Location.

El reconocimiento OCR se realiza mediante una integración con Gemini desde una Supabase Edge Function.

El OCR debe:
- Recibir la fotografía correspondiente.
- Procesar la información de la dignidad electoral.
- Identificar los valores reconocidos.
- Devolver información estructurada.
- Permitir la revisión y corrección humana.

El OCR nunca debe aprobar ni registrar automáticamente un acta.

La integración OCR debe respetar la Skill `ocr-gemini`, sin modificar las decisiones originales del ADR-04.

## 7. Seguridad

- Autenticación mediante Supabase Auth.
- Autorización basada en roles.
- Protección de información mediante RLS.
- Validación de permisos en operaciones del backend.
- Protección de evidencias almacenadas.
- Trazabilidad de correcciones.
- Gestión segura de credenciales y variables de entorno.

## 8. Navegación e interfaz

La navegación debe respetar el ADR-07 y contemplar los tres roles:

- Coordinador provincial.
- Coordinador de recinto.
- Veedor.

Las interfaces deben adaptarse a las responsabilidades y permisos de cada rol.

Se utilizarán React Navigation, Gorhom Bottom Sheet, Reanimated, Lottie y Uniwind según corresponda.

## 9. Monitoreo

Firebase Crashlytics se utiliza para registrar y analizar errores de ejecución de la aplicación.

La implementación debe permitir identificar problemas sin exponer credenciales ni información sensible.

## 10. Documentos relacionados

- `../requirements/requirements.md`
- `../adr/`
- `../fdd/`
- `AGENTS.md`
- Skills del proyecto ubicadas en `.github/skills/`