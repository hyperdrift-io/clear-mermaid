import { defineConfig } from 'vite';
export default defineConfig({ build: { target:'es2022', minify:true, license:{fileName:'THIRD_PARTY_LICENSES.md'}, outDir:'dist', lib:{entry:'app.mjs',formats:['es'],fileName:()=>'app.js'}, rollupOptions:{output:{codeSplitting:false}} } });
