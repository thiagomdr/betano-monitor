import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const html = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../web/historico/index.html'),
  'utf8',
);
const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!m) {
  console.error('script module not found');
  process.exit(1);
}
try {
  new Function(m[1]);
  console.log('syntax OK');
} catch (e) {
  console.error('SYNTAX ERROR:', e.message);
  process.exit(1);
}
