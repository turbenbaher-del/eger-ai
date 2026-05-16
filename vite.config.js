import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/eger-ai/',
  build: {
    outDir: 'dist',
  },
});
