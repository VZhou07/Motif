import { fileURLToPath } from 'node:url';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { applyCareConnectPolicy, parseCareConfig } from '../../src/care/config';
import { buildManifest } from '../../src/features/browser-access/manifest';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');

/** Applies the care origin to the page meta policy and emits manifest.json from the tested generator. */
function motifExtension(care: ReturnType<typeof parseCareConfig>): Plugin {
  const config = care.status === 'ready' ? care.config : undefined;
  return {
    name: 'motif-extension',
    transformIndexHtml: (html, ctx) => (ctx.filename.endsWith('grant-camera.html') ? html : applyCareConnectPolicy(html, config)),
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'manifest.json', source: `${JSON.stringify(buildManifest(config), null, 2)}\n` });
    },
  };
}

// Build: npx vite build --config extensions/motif/vite.config.ts   (output: extensions/motif/dist)
export default defineConfig(({ mode }) => {
  const care = parseCareConfig(loadEnv(mode, repo, 'VITE_'));
  return {
    root: here,
    base: './',
    envDir: repo,
    publicDir: path.join(repo, 'public'),
    plugins: [react(), tailwindcss(), motifExtension(care)],
    build: {
      outDir: path.join(here, 'dist'),
      emptyOutDir: true,
      modulePreload: false,
      rollupOptions: {
        input: {
          sidepanel: path.join(here, 'sidepanel.html'),
          'grant-camera': path.join(here, 'grant-camera.html'),
          background: path.join(here, 'src/background.ts'),
        },
        output: { entryFileNames: (chunk: { name: string }) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js') },
      },
    },
  };
});
