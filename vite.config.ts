import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.ALIBASA_API_KEY': JSON.stringify(env.ALIBASA_API_KEY),
      'process.env.ALIBASA_MODEL': JSON.stringify(env.ALIBASA_MODEL || 'qwen-plus'),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      host: true,
      allowedHosts: [
        'chaistic-robbi-nonscputurally.ngrok-free.dev',
        '72a81944.r40.cpolar.top',
        '.cpolar.top',
        'localhost'
      ],
      port: 5173,
      strictPort: false,
      proxy: {
        // Auth/chat/recommendations → Node.js server (port 8001)
        '/api/auth': {
          target: 'http://localhost:8001',
          changeOrigin: true,
        },
        '/api/chat': {
          target: 'http://localhost:8001',
          changeOrigin: true,
        },
        '/api/recommendations': {
          target: 'http://localhost:8001',
          changeOrigin: true,
        },
        '/api/crawler': {
          target: 'http://localhost:8001',
          changeOrigin: true,
        },
        // Image analysis → FastAPI server (port 8000)
        '/api/segment': {
          target: 'http://localhost:8000',
          changeOrigin: true,
        },
        '/api/segmote': {
          target: 'http://localhost:8000',
          changeOrigin: true,
        },
        '/api/lungmask': {
          target: 'http://localhost:8000',
          changeOrigin: true,
        },
        '/api/nodule': {
          target: 'http://localhost:8000',
          changeOrigin: true,
        },
        '/api/lesion': {
          target: 'http://localhost:8000',
          changeOrigin: true,
        },
        '/api/report': {
          target: 'http://localhost:8000',
          changeOrigin: true,
        },
      },
    },
  };
});
