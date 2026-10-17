import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { loadEnv } from 'vite';
import { applyCareConnectPolicy, parseCareConfig } from './src/care/config.ts';

export default defineConfig(({ mode }) => {
  const care = parseCareConfig(loadEnv(mode, process.cwd(), 'VITE_'));
  return {
    plugins: [react(), tailwindcss(), {
      name: 'motif-care-network-policy',
      transformIndexHtml: (html) => applyCareConnectPolicy(html, care.status === 'ready' ? care.config : undefined),
    }],
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      restoreMocks: true,
      clearMocks: true,
    },
  };
});
