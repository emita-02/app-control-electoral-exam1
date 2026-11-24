---
name: offline-sync
description: Orienta la implementación del almacenamiento local y la sincronización de datos de Control Electoral según el ADR-02.
---

# Skill: Almacenamiento local y sincronización

## Objetivo

Permitir que la aplicación continúe funcionando cuando no exista conexión a internet y sincronice los cambios con el backend cuando la conexión esté disponible.

## Referencia obligatoria

Seguir el ADR-02 del proyecto.

Tecnologías establecidas:

- SQLite: persistencia local estructurada.
- Expo File System: almacenamiento local de fotografías y archivos.
- NetInfo: detección del estado de conectividad.

No sustituir estas tecnologías ni introducir alternativas sin aprobación.

## Principios de funcionamiento

- La aplicación debe permitir registrar información sin conexión.
- Los datos deben conservarse localmente hasta su sincronización.
- La pérdida de conexión no debe provocar la pérdida de información.
- La sincronización debe evitar duplicar registros.
- Los errores de sincronización deben poder identificarse y recuperarse.
- La interfaz debe informar el estado de sincronización.

## Gestión de datos locales

Antes de implementar una operación:

1. Identificar qué información debe persistir localmente.
2. Revisar el modelo de datos definido para la funcionalidad.
3. Determinar si requiere una operación local, remota o ambas.
4. Definir cómo se identifica cada registro.
5. Considerar qué ocurre si la aplicación se cierra durante la operación.

Los cambios locales deben conservar la información necesaria para sincronizarse posteriormente.

## Cola de sincronización

Los registros pendientes deben mantener información suficiente para procesar sus operaciones, por ejemplo:

- Identificador del registro.
- Tipo de operación.
- Datos que deben sincronizarse.
- Fecha de creación o modificación local.
- Estado de sincronización.
- Número de intentos, si corresponde.
- Mensaje del último error, si existe.

No duplicar estructuras si el modelo aprobado ya contiene estos datos.

## Sincronización

Cuando se recupere la conexión:

1. Detectar que existe conectividad.
2. Identificar operaciones pendientes.
3. Procesar las operaciones siguiendo el orden y las dependencias necesarias.
4. Confirmar el resultado de cada operación.
5. Actualizar el estado local después de una respuesta exitosa.
6. Conservar los elementos que no pudieron sincronizarse.
7. Informar los resultados relevantes al usuario.

No asumir que tener conexión significa que el servidor está disponible.

## Conflictos y errores

- Aplicar la estrategia de resolución de conflictos establecida en los ADR y supuestos del proyecto.
- El supuesto S-03 establece Last-Write-Wins para conflictos de edición.
- No sobrescribir información sin aplicar la estrategia definida.
- No eliminar datos locales antes de confirmar la sincronización.
- Evitar reintentos infinitos.
- Registrar errores que permitan identificar la causa del problema.

## Fotografías y archivos

- Utilizar Expo File System para conservar fotografías pendientes de envío.
- Mantener una referencia local válida hasta completar la carga.
- No asumir que una fotografía se encuentra disponible en el servidor solo porque existe localmente.
- Gestionar fallos de carga sin perder el archivo original.

## Interfaz

Mostrar estados comprensibles:

- Sincronizado.
- Pendiente de sincronización.
- Sin conexión.
- Sincronizando.
- Error de sincronización.

No depender únicamente de colores o iconos para comunicar estos estados.

## Verificación

Comprobar al menos:

- Registro de información sin conexión.
- Persistencia después de cerrar y abrir la aplicación.
- Recuperación de conexión.
- Sincronización exitosa.
- Fallo durante la sincronización.
- Reintento posterior.
- Prevención de registros duplicados.
- Conservación de fotografías pendientes.
- Manejo de conflictos de edición.
