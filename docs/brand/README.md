# Logo de Sort your variants

**Encaje · Ordenado.** Tres variantes ya están en su sitio y la cuarta gira 15° para encajar: es el momento en que el set queda ordenado. Los colores siguen el espectro de Apple, de cálido a frío, en orden de lectura.

Presentación completa: [`presentacion.html`](presentacion.html) (y en imágenes en [`slides/`](slides/)).

## Archivos

| Archivo | Uso |
|---|---|
| `logo/sort-your-variants-icon.svg` | Ícono del plugin: fondo claro con la forma redondeada de Apple. Fuente de `docs/publishing/icon.png` |
| `logo/sort-your-variants-symbol.svg` | Símbolo a color, sin fondo |
| `logo/sort-your-variants-symbol-small.svg` | Símbolo para 16–24 px: formas más grandes y separación más amplia |
| `logo/sort-your-variants-horizontal.svg` | Símbolo + nombre en horizontal, sobre fondo claro |
| `logo/sort-your-variants-horizontal-on-dark.svg` | Símbolo + nombre en horizontal, sobre fondo oscuro |
| `logo/sort-your-variants-stacked.svg` | Símbolo sobre el nombre |
| `logo/sort-your-variants-wordmark.svg` | Solo el nombre |
| `logo/variants/` | Versiones a una tinta (negro, blanco, `#1D1D1F`), PNG grandes, favicon e íconos web (`head-snippet.html`, `site.webmanifest`) |
| `concepts/` | Exploración: los conceptos que no se eligieron |

Todos los SVG tienen el texto convertido a trazos, así que no necesitan fuentes instaladas.

## Color

| Rol | Color | HEX | RGB |
|---|---|---|---|
| Variante 1 | Orange | `#FF9500` | 255 149 0 |
| Variante 2 | Pink | `#FF2D55` | 255 45 85 |
| Variante 3 | Purple | `#AF52DE` | 175 82 222 |
| Variante 4 (la que encaja) | Blue | `#0A84FF` | 10 132 255 |
| Degradado de la variante 4 en el ícono | Indigo | `#5E5CE6` | 94 92 230 |
| Nombre | Ink | `#1D1D1F` | 29 29 31 |
| Fondo del ícono | — | `#FFFFFF` → `#E8EAEF` | — |

Son los colores del sistema de Apple. El orden de las variantes no cambia: naranja, rosa, violeta y azul, en orden de lectura.

## Tipografía

El nombre usa **Inter SemiBold** (tamaño óptico 32), con espaciado de −1,2 % y ajustes a mano entre algunos pares de letras. Inter tiene licencia SIL Open Font License, que permite usarla en un logo. Para el resto de los textos de la marca, usa Inter o la fuente del sistema (SF Pro en Apple).

## Reglas de uso

- **Espacio libre:** deja alrededor del logo, como mínimo, el alto de una variante (uno de los cuadrados).
- **Tamaño mínimo:** símbolo de 16 px (por debajo de 24 px, usa `symbol-small`); logo horizontal de 120 px de ancho; logo vertical de 72 px de ancho.
- **Fondos:** el logo a color va sobre blanco, gris claro o casi negro (`#1E1E1E`, como Figma en modo oscuro). Sobre fotos o colores fuertes, usa la versión blanca o negra a una tinta.
- **A una tinta:** las cuatro variantes van del mismo color. La variante girada se mantiene girada.

## Qué no hacer

- Enderezar la cuarta variante o girar cualquiera de las otras.
- Cambiar el orden de los colores o agregar otros.
- Poner sombras, contornos o efectos al símbolo (el ícono del plugin ya trae su propio acabado).
- Deformar, inclinar o rotar el logo completo.
- Volver a escribir el nombre con otra fuente o con un espaciado distinto.

## Regenerar el ícono de publicación

Desde la raíz del repositorio, con Google Chrome instalado:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars --window-size=128,128 --default-background-color=00000000 --screenshot="$PWD/docs/publishing/icon.png" "file://$PWD/docs/publishing/source/icon.svg"
```

## Pendientes

- No se hizo búsqueda de marcas registradas. Antes de usarlo fuera de Figma, conviene buscar íconos parecidos (por ejemplo, con búsqueda inversa de imágenes).
- Las versiones `.ai`, `.eps` y `.pdf` no están incluidas; se pueden exportar desde los SVG en Figma o Illustrator.
