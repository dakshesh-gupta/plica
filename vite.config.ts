import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Website build (landing, Verify a receipt, Try the demo). Static files, deployable anywhere.
// Hash routing (#/verify, #/demo) means no server rewrites are needed.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
  },
});
