import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    // Safely polyfill process.env as an empty object.
    // This allows the code to check `process.env.API_KEY` without crashing,
    // while ensuring we don't accidentally leak build server environment variables.
    'process.env': {}
  }
});