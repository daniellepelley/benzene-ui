import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * The spec viewer, built the same way as the mesh UI: one self-contained file.
 *
 * A separate build rather than a second entry in one, because `vite-plugin-singlefile` inlines a
 * whole build into a page — two entries in one build would inline each other's code into both.
 */
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: 'dist/spec',
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 2000,
    cssCodeSplit: false,
    rollupOptions: {
      input: 'spec.html',
      output: { inlineDynamicImports: true },
    },
  },
});
