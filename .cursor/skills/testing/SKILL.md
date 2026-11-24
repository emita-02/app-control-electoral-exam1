---
name: testing
description: Define los criterios para verificar funcionalidades, detectar errores y asegurar la calidad de Control Electoral durante el desarrollo.
---

# Skill: Testing y control de calidad

## Objetivo

Verificar que las funcionalidades de Control Electoral cumplan sus requerimientos, funcionen correctamente y no afecten otras partes de la aplicación.

## Principios

- Probar cada funcionalidad antes de considerarla terminada.
- Priorizar los escenarios que puedan afectar la integridad de los datos electorales.
- No asumir que una pantalla funciona correctamente solo porque se visualiza.
- No ocultar errores para conseguir que una prueba pase.
- Utilizar información ficticia durante las pruebas.
- Explicar los resultados de las pruebas realizadas.

## Tipos de pruebas

### 1. Pruebas unitarias

Verificar funciones y lógica independiente:

- Validaciones de formularios.
- Reglas de negocio.
- Cálculos de resultados.
- Transformaciones de datos.
- Validaciones de información extraída por OCR.

### 2. Pruebas de integración

Verificar la comunicación entre componentes:

- Aplicación y Supabase.
- Repositorios y fuentes de datos.
- SQLite y sincronización.
- Aplicación y Supabase Edge Functions.
- Procesamiento de fotografías y OCR.

### 3. Pruebas de interfaz

Comprobar:

- Visualización correcta de pantallas.
- Navegación entre funcionalidades.
- Formularios y validaciones.
- Mensajes de error y confirmación.
- Estados de carga y estados vacíos.
- Adaptación a diferentes tamaños de pantalla Android.
- Acciones disponibles según el rol.

### 4. Pruebas de funcionamiento

Comprobar los flujos completos de cada funcionalidad, desde la interacción del usuario hasta la persistencia de los datos.

## Escenarios importantes

Priorizar las siguientes situaciones:

- Usuario sin sesión activa.
- Usuario con permisos insuficientes.
- Información incompleta o inválida.
- Error de conexión con el backend.
- Funcionamiento sin internet.
- Recuperación de conexión.
- Sincronización fallida.
- Fotografías inválidas o ilegibles.
- Respuestas incompletas de Gemini.
- Intentos de modificar información no autorizada.
- Conflictos durante la actualización de datos.

## Integridad de la información electoral

- Verificar las reglas de validación aritmética de las actas.
- Comprobar que los valores no se alteren durante la sincronización.
- Verificar que el OCR no registre resultados sin revisión humana.
- Comprobar que las correcciones estén asociadas al usuario autorizado.
- Verificar que los permisos impidan acceder a información de otras jurisdicciones.
- No utilizar datos electorales reales para pruebas sin autorización.

## Herramientas y comandos

Utilizar las herramientas y dependencias de pruebas que ya estén configuradas en el proyecto.

Cuando corresponda, verificar:

- TypeScript.
- ESLint.
- Pruebas automatizadas.
- Expo Doctor.
- Ejecución de la aplicación en Android.

No instalar nuevas herramientas sin justificar su necesidad y solicitar aprobación.

## Reporte de pruebas

Al terminar una verificación, presentar:

1. Funcionalidad evaluada.
2. Escenarios probados.
3. Pruebas ejecutadas.
4. Resultados obtenidos.
5. Errores encontrados.
6. Correcciones realizadas.
7. Pendientes identificados.

Diferenciar claramente entre pruebas ejecutadas, pruebas pendientes y pruebas que no pudieron realizarse.

## Criterio de finalización

Una funcionalidad puede considerarse verificada cuando:

- Cumple sus criterios de aceptación.
- No presenta errores conocidos que bloqueen su uso.
- Sus validaciones funcionan.
- Sus permisos se comportan correctamente.
- Las pruebas correspondientes fueron ejecutadas.
- No introduce regresiones conocidas en funcionalidades existentes.
