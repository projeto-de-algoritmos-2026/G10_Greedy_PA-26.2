import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// GitHub Pages serve o projeto em /<nome-do-repositório>/; em dev a base é a raiz.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/G10_Greedy_PA-26.2/' : '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
}));
