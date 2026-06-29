/**
 * Gera web/historico/index.html a partir do template + variaveis de ambiente.
 * Usado localmente e no GitHub Actions (secrets EXPO_PUBLIC_SUPABASE_*).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const templatePath = join(root, 'web/historico/index.template.html');
const outPath = join(root, 'web/historico/index.html');

const url = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
const key = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

if (!url || !key) {
  console.error('Defina EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const template = readFileSync(templatePath, 'utf8');
const html = template
  .replaceAll('__SUPABASE_URL__', url)
  .replaceAll('__SUPABASE_ANON_KEY__', key);

writeFileSync(outPath, html, 'utf8');
console.log('HTML gerado:', outPath);
