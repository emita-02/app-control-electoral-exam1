---
name: ui-ux-design
description: Define y aplica la identidad visual institucional, los criterios de usabilidad y los componentes de interfaz de Control Electoral.
---

# Skill: Diseño UI/UX

## Objetivo

Mantener una interfaz institucional y profesional para Control Electoral, con una experiencia sobria, confiable, ordenada y fácil de utilizar durante las actividades de monitoreo electoral.

## Identidad visual

La identidad visual toma como referencia los colores de Revolución Ciudadana:

- Cyan o azul celeste: color principal de identidad.
- Azul oscuro: color de textos principales.
- Rojo: color de acento institucional.
- Blanco: color de contraste y fondos.

La interfaz debe mantener una apariencia profesional. No debe parecer una pieza publicitaria ni una aplicación de campaña política.

## Paleta inicial

Los siguientes valores son una propuesta digital inicial inspirada en los colores institucionales. No deben presentarse como conversiones oficiales exactas de Pantone.

| Token | Color | Código |
|---|---|---|
| Primario | Cyan | #00AEEF |
| Secundario | Rojo | #EF3340 |
| Azul oscuro | Azul institucional | #17324D |
| Fondo | Gris muy claro | #F5F7FA |
| Superficie | Blanco | #FFFFFF |
| Fondo celeste | Celeste suave | #EAF8FC |
| Texto principal | Gris oscuro | #263238 |
| Texto secundario | Gris medio | #667085 |
| Bordes | Gris claro | #DCE3E8 |

Los colores primario y secundario deben conservar la identidad visual. Los tonos neutros deben predominar en superficies y fondos para evitar saturación.

## Criterios visuales

- Priorizar claridad, jerarquía visual y facilidad de lectura.
- Mantener una apariencia consistente en todas las pantallas.
- Evitar decoraciones innecesarias, sombras excesivas y gradientes decorativos.
- Utilizar espacios en blanco para separar secciones.
- Mantener alineaciones, márgenes y tamaños consistentes.
- Utilizar iconos sencillos y reconocibles.
- Evitar interfaces sobrecargadas de información.

## Componentes

Diseñar componentes reutilizables cuando se repitan patrones de interfaz:

- Botones principales, secundarios y de acción.
- Campos de texto y formularios.
- Tarjetas informativas.
- Encabezados y barras de navegación.
- Etiquetas de estado.
- Diálogos de confirmación.
- Indicadores de carga.
- Mensajes de éxito, advertencia y error.
- Listas y elementos de selección.

Los componentes deben mantener los mismos criterios de color, espaciado, tipografía, bordes y estados.

## Experiencia de usuario

- Mostrar únicamente las opciones correspondientes al rol autenticado.
- Evitar pasos innecesarios en el registro de información.
- Diferenciar claramente las acciones principales y secundarias.
- Solicitar confirmación antes de acciones destructivas.
- Mostrar mensajes claros cuando una operación falla.
- Informar cuando los datos estén pendientes de sincronización.
- Facilitar la lectura de datos en pantallas Android.

## Estados de interfaz

Toda pantalla que realice operaciones debe contemplar, cuando corresponda:

- Carga.
- Contenido disponible.
- Estado vacío.
- Error.
- Operación exitosa.
- Operación pendiente de sincronización.
- Datos sin conexión.

No mostrar pantallas vacías sin explicación.

## Accesibilidad y usabilidad

- Mantener contraste suficiente entre texto y fondo.
- Utilizar tamaños de texto legibles.
- No comunicar estados únicamente mediante colores.
- Acompañar los iconos de acciones importantes con etiquetas o ayudas.
- Mantener áreas táctiles cómodas.
- Evitar formularios extensos cuando puedan dividirse en pasos claros.

## Aplicación de la identidad

Antes de crear una pantalla, revisar los componentes y estilos existentes para reutilizarlos.

No crear una nueva variante visual si ya existe un componente que resuelve la misma necesidad.

No modificar la identidad visual global por una preferencia aislada de una pantalla.


## Tecnologías de interfaz obligatorias

Respetar las decisiones establecidas en el ADR-07 grupal.

- **Uniwind:** utilizar `className` y sus clases utilitarias para definir los estilos de los componentes. Mantener los estilos consistentes con la identidad visual.
- **Lottie:** utilizar animaciones Lottie para proporcionar retroalimentación visual y mejorar la experiencia cuando sea pertinente.
- **React Native Reanimated:** implementar animaciones e interacciones fluidas.
- **Gorhom Bottom Sheet:** utilizarlo para paneles inferiores y flujos de interacción que lo requieran.
- **React Navigation:** gestionar la navegación de la aplicación.

No sustituir estas tecnologías por alternativas diferentes sin aprobación.

### Criterios de implementación

- Priorizar Uniwind para los estilos; evitar introducir sistemas de estilos paralelos.
- Reutilizar clases y patrones visuales para mantener consistencia.
- Utilizar Lottie con moderación, priorizando animaciones funcionales y breves.
- Evitar animaciones que dificulten la interacción o afecten el rendimiento.
- Utilizar Reanimated cuando se requieran transiciones o interacciones animadas.
- Mantener una navegación clara y coherente con la estructura de roles de la aplicación.
- Utilizar Bottom Sheet cuando mejore la interacción, sin convertirlo en el mecanismo predeterminado para todos los formularios.
- Consultar el ADR-07 antes de realizar cambios relacionados con estas tecnologías.