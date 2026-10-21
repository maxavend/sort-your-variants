# Sort your variants - Plugin para Figma

Este plugin organiza automáticamente las variantes de un Component Set en una grilla visual con etiquetas.

## ¿Qué hace?

- Trabaja sobre un Component Set seleccionado, con una o más propiedades de variante
- A cada propiedad se le asigna un rol:
  - **Column**: define las columnas (una sola propiedad)
  - **Row**: define las filas (una sola propiedad)
  - **Col group** / **Row group**: separan la grilla en bloques; pueden ser varias propiedades
- Añade etiquetas (chips) arriba de las columnas, a la izquierda de las filas y, por cada grupo, un chip con sus valores y una llave
- Si las etiquetas de columna no caben, las rota 90°
- Las etiquetas quedan en un grupo `"<nombre del set> tags"` junto al Component Set y se reemplazan en cada ejecución
- Desactiva el auto layout del Component Set para poder posicionar las variantes libremente
- Recuerda la última configuración usada y guarda en cada Component Set su espaciado y estilo de etiquetas

## Cómo usar Sort your variants

1. Selecciona un Component Set
2. Ejecuta Sort your variants desde el menú de plugins
3. Asigna un rol a cada propiedad y ajusta el espaciado y el estilo de las etiquetas
4. Presiona "Reorganize variants"

"Reset" vuelve a los valores por defecto y los guarda en el Component Set seleccionado.

## Instalación para desarrollo

### Requisitos previos

Descarga Node.js que incluye NPM:
https://nodejs.org/en/download/

### Configuración

1. Instala las dependencias del proyecto:
```bash
npm install
```

2. Compila el plugin (código + interfaz):
```bash
npm run build
```

3. Para desarrollo continuo, en dos terminales:
```bash
npm run watch
```
```bash
npm run watch:ui
```

### Instalación en Figma

1. Abre Figma Desktop
2. Ve a Plugins → Development → Import plugin from manifest...
3. Selecciona el archivo `manifest.json` de este proyecto
4. ¡Sort your variants ya está listo para usar!

## Estructura del proyecto

- `code.ts` - Lógica del plugin (se compila a `code.js`)
- `src/ui/` - Interfaz: `ui.html`, `main.js`, `styles.css` e íconos
- `dist/ui.html` - Interfaz compilada en un solo archivo (la que carga Figma)
- `vite.config.mjs` - Build de la interfaz
- `manifest.json` - Configuración del plugin
- `Figma UI Kit.html` - Referencia visual del diseño anterior

## Tecnologías

- TypeScript y Figma Plugin API
- [FigUI3](https://github.com/rogie/figui3) para los controles con estilo Figma UI3. El núcleo es MIT; `fig-select` y el selector de color vienen del módulo editor, con licencia PolyForm Shield 1.0.0
- Vite + vite-plugin-singlefile para empaquetar la interfaz
- Íconos de Figma UI3 tomados de `@create-figma-plugin/ui` (MIT)

Para más información sobre el desarrollo de plugins de Figma, visita:
https://www.figma.com/plugin-docs/
