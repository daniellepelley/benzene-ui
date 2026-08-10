import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The *library* build — a second target, deliberately not the app one.
 *
 * `vite.config.ts` produces one self-contained HTML page for `Benzene.Mesh.Ui` to embed. This
 * produces an importable package, which is the other half of the point: a team assembling their own
 * mesh UI takes the components rather than forking the page.
 *
 * React, Redux and their bindings are **external**. Bundling them would give a consumer two copies
 * of React — hooks throw, and context silently stops matching across the boundary.
 */
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist/lib',
    emptyOutDir: true,
    target: 'es2022',
    // CSS is emitted as a sibling file rather than injected. A library that injects a stylesheet on
    // import cannot be loaded server-side and cannot be overridden by a consumer's own cascade
    // order; making the import explicit costs one line of theirs and buys them control of both.
    cssCodeSplit: false,
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime', 'react-redux', '@reduxjs/toolkit'],
      output: { assetFileNames: 'theme.css' },
    },
  },
});
