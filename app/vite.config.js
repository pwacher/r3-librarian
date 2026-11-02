import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Port 8642 is the same address as the old page, so Chrome's saved list carries over
export default defineConfig({
  plugins: [react()],
  server: { port: 8642, strictPort: true, host: 'localhost' },
});
