import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    base: '/Hotel-Dayuse/', // <--- Essencial para corrigir a tela branca no GitHub Pages
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          login: path.resolve(__dirname, 'login.html'),
          recepcao: path.resolve(__dirname, 'recepcao.html'),
          atendente: path.resolve(__dirname, 'atendente.html'),
          cliente: path.resolve(__dirname, 'cliente.html'),
          caixa: path.resolve(__dirname, 'caixa.html'),
          admin: path.resolve(__dirname, 'admin.html'),
        },
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
