# Sort your variants - Plugin para Figma

Este plugin organiza automáticamente las variantes de un Component Set en una grilla visual con etiquetas.

## ¿Qué hace?

- Detecta Component Sets seleccionados con exactamente 2 propiedades de variante
- Reorganiza visualmente los ComponentNodes en una grilla lógica
- Añade etiquetas de texto a la izquierda (filas) y arriba (columnas)
- Las etiquetas se crean como TextNodes simples y se agrupan fuera del Component Set
- No modifica el auto layout ni crea instancias

## Cómo usar Sort your variants

1. Selecciona un Component Set que tenga exactamente 2 propiedades de variante
2. Ejecuta Sort your variants desde el menú de plugins
3. Presiona el botón "Organizar variantes"
4. ¡Las variantes se organizarán automáticamente en una grilla!

## Instalación para desarrollo

### Requisitos previos

Descarga Node.js que incluye NPM:
https://nodejs.org/en/download/

### Configuración

1. Instala TypeScript globalmente:
```bash
npm install -g typescript
```

2. Instala las dependencias del proyecto:
```bash
npm install
```

3. Compila el código TypeScript:
```bash
npm run build
```

4. Para desarrollo continuo, usa el modo watch:
```bash
npm run watch
```

### Instalación en Figma

1. Abre Figma Desktop
2. Ve a Plugins → Development → Import plugin from manifest...
3. Selecciona el archivo `manifest.json` de este proyecto
4. ¡Sort your variants ya está listo para usar!

## Estructura del proyecto

- `code.ts` - Lógica principal del plugin
- `ui.html` - Interfaz de usuario
- `ui.js` - JavaScript para la UI
- `manifest.json` - Configuración del plugin
- `package.json` - Dependencias y scripts
- `tsconfig.json` - Configuración de TypeScript

## Tecnologías

- TypeScript
- Figma Plugin API
- NPM

Para más información sobre el desarrollo de plugins de Figma, visita:
https://www.figma.com/plugin-docs/

We recommend writing TypeScript code using Visual Studio code:

1. Download Visual Studio Code if you haven't already: https://code.visualstudio.com/.
2. Open this directory in Visual Studio Code.
3. Compile TypeScript to JavaScript: Run the "Terminal > Run Build Task..." menu item,
    then select "npm: watch". You will have to do this again every time
    you reopen Visual Studio Code.

That's it! Visual Studio Code will regenerate the JavaScript file every time you save.
