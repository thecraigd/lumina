import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    // Polyfill process.env for compatibility with the provided Gemini SDK examples
    // if they rely on it, though we mainly use explicit key passing now.
    'process.env': process.env
  }
});