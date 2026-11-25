---
name: fdd
description: Guía el desarrollo del proyecto Control Electoral mediante Feature-Driven Development, desde el análisis de una funcionalidad hasta su verificación y documentación.
---

# Skill: Feature-Driven Development

## Objetivo

Aplicar la metodología Feature-Driven Development (FDD) para desarrollar Control Electoral mediante funcionalidades pequeñas, verificables y organizadas.

## Principios

- Cada funcionalidad debe aportar un resultado concreto al usuario.
- El desarrollo debe seguir los requerimientos y ADR grupales.
- No implementar funcionalidades que no estén justificadas por los requerimientos.
- Mantener cada funcionalidad lo suficientemente pequeña para poder probarla y explicarla.
- No avanzar a la siguiente fase sin la revisión y aprobación del usuario.

## Proceso de trabajo

### 1. Análisis de la funcionalidad
- Identificar el requerimiento funcional relacionado.
- Determinar qué rol utilizará la funcionalidad.
- Identificar las reglas de negocio y restricciones.
- Revisar dependencias con otras funcionalidades.
- Identificar los ADR y supuestos relacionados.

### 2. Diseño de la funcionalidad
- Describir el comportamiento esperado.
- Definir los datos de entrada y salida.
- Identificar validaciones, estados y posibles errores.
- Determinar qué capas de la arquitectura intervienen.
- Definir criterios de aceptación comprobables.

### 3. Planificación
- Dividir la funcionalidad en tareas pequeñas.
- Identificar archivos que se crearán o modificarán.
- Establecer el orden de implementación.
- Identificar riesgos y dependencias.

### 4. Implementación
- Implementar únicamente lo aprobado.
- Mantener la separación de responsabilidades.
- Evitar modificaciones innecesarias en funcionalidades existentes.
- Explicar las decisiones técnicas relevantes.

### 5. Verificación
- Ejecutar las pruebas correspondientes.
- Comprobar los criterios de aceptación.
- Revisar errores de TypeScript, lint y ejecución.
- Corregir los problemas encontrados antes de cerrar la funcionalidad.

### 6. Revisión y cierre
- Presentar los archivos modificados y explicar los cambios.
- Indicar qué pruebas se realizaron y sus resultados.
- Documentar decisiones relevantes.
- Esperar la aprobación del usuario para continuar.

## Identificación de funcionalidades

Utilizar identificadores consecutivos:

- F01: Autenticación y control de acceso.
- F02: Gestión territorial.
- F03: Gestión de recintos y mesas.
- F04: Gestión de personal y asignaciones.
- F05: Registro de actas.
- F06: Evidencia fotográfica y ubicación GPS.
- F07: Validación y corrección de actas.
- F08: Procesamiento OCR.
- F09: Sincronización de información.
- F10: Paneles de seguimiento y resultados.
- F11: Monitoreo de errores.

Estos identificadores son una organización inicial y no reemplazan los identificadores oficiales de los requerimientos grupales.

## Entrega de cada funcionalidad

Al terminar una funcionalidad, presentar:

1. Objetivo cumplido.
2. Archivos creados o modificados.
3. Funcionamiento implementado.
4. Pruebas ejecutadas y resultados.
5. Pendientes o limitaciones.
6. Confirmación necesaria para continuar.
