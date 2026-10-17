import { cp, mkdir, readFile, writeFile, stat, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const packageRoot = path.join(root, 'node_modules/@mediapipe/tasks-vision');
const modelUrl = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const modelFile = path.join(root, 'public/models/face_landmarker.task');
const wasmRoot = path.join(root, 'public/mediapipe/wasm');
const manifestFile = path.join(root, 'public/runtime-assets.json');
const packageData = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

async function checkAssets() {
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  const model = await readFile(modelFile);
  if (manifest.mediaPipeVersion !== packageData.version || manifest.modelUrl !== modelUrl || model.length < 1_000_000 || sha256(model) !== manifest.modelSha256) {
    throw new Error('Model/runtime assets are incomplete or use another package version. Run npm run setup:assets.');
  }
  const wasm = await stat(path.join(wasmRoot, 'vision_wasm_internal.wasm'));
  if (wasm.size < 100_000) throw new Error('MediaPipe WASM is missing or incomplete.');
  await stat(path.join(wasmRoot, 'vision_wasm_internal.js'));
}

try {
  if (process.argv.includes('--check')) {
    await checkAssets();
    console.log('Local model and matching MediaPipe runtime assets verified.');
  } else {
    await mkdir(path.dirname(modelFile), { recursive: true });
    await mkdir(wasmRoot, { recursive: true });
    await cp(path.join(packageRoot, 'wasm'), wasmRoot, { recursive: true });
    let model;
    try { model = await readFile(modelFile); } catch { /* Initial setup. */ }
    if (!model || model.length < 1_000_000) {
      console.log('Downloading the public Face Landmarker model (no user data is sent).');
      const response = await fetch(modelUrl, { signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`Model download failed: HTTP ${response.status}`);
      model = Buffer.from(await response.arrayBuffer());
      if (model.length < 1_000_000) throw new Error('Downloaded model is unexpectedly small.');
      await writeFile(`${modelFile}.download`, model);
      await rename(`${modelFile}.download`, modelFile);
    }
    await writeFile(manifestFile, `${JSON.stringify({ mediaPipeVersion: packageData.version, modelUrl, modelSha256: sha256(model) }, null, 2)}\n`);
    await checkAssets();
    console.log(`Local assets ready (MediaPipe ${packageData.version}).`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  console.error('Run npm install, then npm run setup:assets with network access for initial setup.');
  process.exitCode = 1;
}
