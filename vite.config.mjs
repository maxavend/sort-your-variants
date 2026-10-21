import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Figma loads the plugin UI as a single HTML file, so everything (FigUI3 included) is inlined.
export default defineConfig({
  root: 'src/ui',
  base: './',
  plugins: [viteSingleFile()],
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
    rollupOptions: { input: 'src/ui/ui.html' },
  },
})
