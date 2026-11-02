import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    license: { fileName: 'THIRD_PARTY_LICENSES.md' },
    target: 'es2022',
    // Preserve native light-dark() inside Shadow DOM. Its lowered helper variables
    // would otherwise depend on a host stylesheet that consumers do not have.
    cssTarget: ['chrome124', 'firefox128', 'safari17.5'],
    rollupOptions: {
      input: 'src/source-reader.js',
      preserveEntrySignatures: 'strict',
      output: { entryFileNames: 'clear-mermaid.js' },
    },
  },
});
