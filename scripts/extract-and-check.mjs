import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = process.argv[2] === '--prod'
  ? await fetch('https://thiagomdr.github.io/betano-monitor/').then((r) => r.text())
  : readFileSync(
      join(root, 'web/historico/index.template.html'),
      'utf8',
    );

const start = source.indexOf('<script type="module">') + '<script type="module">'.length;
const end = source.indexOf('</script>', start);
const code = source.slice(start, end);
writeFileSync(join(root, 'tmp-module.mjs'), code);

try {
  const require = createRequire(import.meta.url);
  const acorn = require('acorn');
  acorn.parse(code, { ecmaVersion: 2022, sourceType: 'module' });
  console.log('acorn parse OK', code.length);
} catch (e) {
  console.error('PARSE ERROR:', e.message);
  const m = String(e.message).match(/position (\d+)/);
  if (m) {
    const pos = Number(m[1]);
    const line = code.slice(0, pos).split('\n').length;
    console.error('line ~', line);
    console.error('context:', code.slice(Math.max(0, pos - 80), pos + 80));
  }
  process.exit(1);
}
