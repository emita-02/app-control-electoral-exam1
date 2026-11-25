---
name: ocr-gemini
description: Guía la integración de Gemini para extraer información de fotografías de actas electorales, validar resultados y solicitar revisión humana.
---

# Skill: OCR con Gemini

## Objetivo

Utilizar Gemini para analizar fotografías de actas electorales y proponer la extracción de sus datos, reduciendo el trabajo manual sin reemplazar la revisión humana.

## Referencias obligatorias

Respetar:

- ADR-04: captura y procesamiento de fotografías.
- ADR-01: backend, autenticación y seguridad.
- Supuesto S-06: el OCR nunca registra automáticamente resultados sin revisión y autorización humana.

La integración utiliza Gemini API.

## Seguridad

- Nunca incluir la API Key de Gemini en el código de la aplicación móvil.
- Nunca almacenar la API Key en variables `EXPO_PUBLIC_*`.
- La comunicación con Gemini debe realizarse desde una Supabase Edge Function.
- La clave debe configurarse como secreto del entorno del backend.
- No registrar fotografías ni datos sensibles en logs innecesarios.
- Utilizar documentos ficticios para pruebas de desarrollo.

## Flujo de procesamiento

1. El usuario captura o selecciona una fotografía del acta.
2. La aplicación valida que exista una imagen disponible.
3. Se procesa la imagen según los criterios definidos en el ADR-04.
4. La imagen se envía al backend de forma segura.
5. La Edge Function invoca Gemini.
6. Gemini devuelve los campos extraídos en un formato estructurado.
7. El backend valida la estructura de la respuesta.
8. La aplicación presenta los datos extraídos para su revisión.
9. El usuario autorizado corrige o confirma la información.
10. Solo después de la autorización se registra el resultado definitivo.

## Extracción de información

- Utilizar únicamente los campos definidos en el modelo de actas del proyecto.
- No inventar valores cuando la imagen no permita identificarlos.
- Representar los campos ilegibles o ausentes como valores no identificados.
- Conservar los valores originales extraídos para facilitar su revisión.
- No realizar cálculos o correcciones silenciosas.
- Diferenciar los datos extraídos de los datos confirmados por una persona.

## Respuesta estructurada

Solicitar a Gemini una respuesta estructurada y validar su contenido antes de utilizarlo.

La respuesta debe permitir identificar:

- Campos extraídos.
- Valores detectados.
- Campos ilegibles o ausentes.
- Observaciones de lectura.
- Indicadores de confianza, únicamente cuando el modelo los proporcione de forma válida.

No interpretar una respuesta de Gemini como información verificada.

## Manejo de errores

Contemplar:

- Imagen ilegible.
- Imagen incompleta.
- Formato no compatible.
- Respuesta incompleta del modelo.
- Respuesta que no cumple el formato esperado.
- Tiempo de espera agotado.
- Límite de solicitudes de la API.
- Error de autenticación o configuración.
- Fallo de conectividad.

Mostrar mensajes comprensibles y permitir reintentar cuando corresponda.

## Validación humana

La interfaz debe permitir revisar los campos antes de confirmar el acta.

- Destacar los campos que requieren revisión.
- Permitir corregir valores.
- No sobrescribir las correcciones humanas con una nueva respuesta OCR.
- Registrar quién realizó la revisión y cuándo, según el modelo de auditoría definido.
- Mantener la confirmación humana como requisito para registrar resultados definitivos.

## Verificación

Probar con imágenes ficticias que incluyan:

- Actas claras.
- Fotografías inclinadas.
- Iluminación deficiente.
- Texto parcialmente ilegible.
- Campos vacíos.
- Valores numéricos difíciles de distinguir.
- Imágenes inválidas.

Evaluar la extracción por campo y no asumir que el resultado completo es correcto porque algunos valores coincidan.
