import { cpSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const packageDir = dirname(require.resolve('pdfjs-dist/package.json'));
const target = fileURLToPath(new URL('../public/assets/pdfjs/', import.meta.url));
mkdirSync(target, { recursive: true });
cpSync(join(packageDir, 'legacy/build/pdf.worker.min.mjs'), join(target, 'pdf.worker.min.mjs'));
for (const name of ['cmaps', 'iccs', 'standard_fonts', 'wasm']) {
  cpSync(join(packageDir, name), join(target, name), { recursive: true });
}
