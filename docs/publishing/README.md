# Publicar Sort your variants en la Comunidad de Figma

Todo lo necesario para publicar el plugin desde Figma Desktop. Figma solo acepta publicaciones desde la app de escritorio y revisa cada plugin antes de listarlo (suele tardar de 5 a 10 días hábiles). Mientras está en revisión se pueden subir actualizaciones.

## Archivos de esta carpeta

| Archivo | Uso en el modal de publicación |
|---|---|
| `icon.png` | Ícono del plugin (128 × 128) |
| `cover.png` | Portada (1920 × 1080) |
| `gallery-1-before-after.png` | Carrusel 1: un set desordenado y el mismo set ordenado y etiquetado |
| `gallery-2-roles.png` | Carrusel 2: los cuatro roles de propiedad (Column, Row, Col group, Row group) |
| `gallery-3-labels.png` | Carrusel 3: estilo por defecto, estilo propio y etiquetas rotadas |
| `gallery-4-ui.png` | Carrusel 4: la interfaz en tema claro y oscuro |
| `source/` | Fuentes editables: `icon.svg`, `community.html` (portada y carrusel) y las capturas de la interfaz |

> Antes de subir los gráficos, compara sus medidas con las que indica el modal de publicación. Si Figma pide otras, ajusta `source/community.html` y vuelve a renderizar (ver "Regenerar los gráficos").

## Checklist antes de publicar

1. **ID del plugin:** confirma que `"id"` en `manifest.json` es el del plugin registrado en tu cuenta de Figma. Si vas a publicarlo como un plugin nuevo, Figma genera el ID en el primer envío.
2. **Compilar y verificar:**
   ```bash
   npm install
   npm run release:check
   ```
   Corre el lint, compila `code.js` y `dist/ui.html`, y verifica que el manifest apunte a archivos existentes.
3. **Probar en Figma Desktop:** Plugins → Development → Import plugin from manifest… y elige `manifest.json`. Prueba al menos:
   - un set con 1 propiedad, otro con 2 y otro con grupos de filas y columnas;
   - un set dentro de un frame con auto layout;
   - tema claro y oscuro de Figma;
   - que los menús de fuente y de rol se abran bien dentro de la ventana.
4. **Publicar:** en Figma Desktop, Plugins → Development → Manage plugins in development → **Publish**. Completa el modal con los textos de abajo y los gráficos de esta carpeta.

## Textos para la ficha

### Nombre
Sort your variants

### Tagline
Lay out any component set as a clean, labeled grid in one click.

### Descripción (inglés)
Sort your variants turns a messy component set into a tidy, readable grid.

Pick which property becomes the columns and which becomes the rows. Any extra properties can split the grid into column or row groups. The plugin positions every variant, resizes the component set to fit, and adds labels for each column, row and group so the whole set reads at a glance.

**How to use**
1. Select a component set.
2. Run Sort your variants.
3. Assign a role to each property: Column, Row, Col group or Row group.
4. Adjust spacing and label style, then click Reorganize variants.

**Features**
- Columns, rows and grouped blocks from your variant properties
- Labels with your own fill, stroke, radius, font, size and color
- Group labels with a brace that spans the rows they cover
- Column labels rotate automatically when they don't fit
- Remembers your settings per component set and between sessions
- Works in light and dark mode

Running it again replaces the previous labels. The plugin turns off auto layout on the component set so it can place each variant.

### Descripción (español, opcional)
Sort your variants convierte un component set desordenado en una grilla clara y fácil de leer.

Elige qué propiedad forma las columnas y cuál las filas. Las propiedades extra pueden separar la grilla en grupos de columnas o de filas. El plugin ubica cada variante, ajusta el tamaño del component set y agrega etiquetas para cada columna, fila y grupo.

### Tags (Figma admite hasta 12)
variants, component set, components, design system, organize, grid, layout, labels, documentation, properties, auto layout, tidy

### Acceso a red
El plugin solo se conecta a Google Fonts (`fonts.googleapis.com` y `fonts.gstatic.com`) para mostrar la tipografía de la interfaz y de la vista previa. No envía datos del archivo a ningún servidor.

### Contacto de soporte
Agrega un correo o un enlace (por ejemplo, la página de issues del repositorio). Figma lo muestra en la ficha.

## Notas de la versión 1.0
- Organiza las variantes por roles: Column, Row, Col group y Row group
- Etiquetas con estilo configurable y llaves para los grupos
- Interfaz con aspecto nativo de Figma (UI3), en tema claro y oscuro

## Licencias de terceros
- **FigUI3** (controles de la interfaz): el núcleo es MIT. `fig-select` y el selector de color vienen del módulo editor, con licencia **PolyForm Shield 1.0.0**, que permite el uso salvo para hacer un producto que compita con el del autor. Revísala antes de publicar.
- **Íconos de Figma UI3:** tomados de `@create-figma-plugin/ui` (MIT).

## Regenerar los gráficos
Desde `docs/publishing/`, con Google Chrome instalado. `source/community.html` dibuja cada imagen según `?s=`: `cover`, `before-after`, `roles`, `labels` o `ui`. Las grillas se arman con las mismas medidas que usa el plugin (padding 48, gap 48, grupos 128, etiquetas a 24).

```bash
for s in cover:cover before-after:gallery-1-before-after roles:gallery-2-roles labels:gallery-3-labels ui:gallery-4-ui; do "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars --window-size=1920,1080 --allow-file-access-from-files --virtual-time-budget=8000 --screenshot="$PWD/${s#*:}.png" "file://$PWD/source/community.html?s=${s%%:*}"; done
```

El ícono sale de `source/icon.svg`, que es una copia de `docs/brand/logo/sort-your-variants-icon.svg` a 128 × 128:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars --window-size=128,128 --default-background-color=00000000 --screenshot="$PWD/icon.png" "file://$PWD/source/icon.svg"
```

El logo, los colores y las reglas de uso están en [docs/brand](../brand/README.md).
