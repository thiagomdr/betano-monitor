/**
 * Gera web/historico/index.html a partir do template + config.
 * Prioridade: variaveis de ambiente (GitHub Secrets) > supabase.config.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const templatePath = join(root, 'web/historico/index.template.html');
const configPath = join(root, 'web/historico/supabase.config.json');
const outPath = join(root, 'web/historico/index.html');

let url = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
let key = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

if (!url || !key) {
  const file = JSON.parse(readFileSync(configPath, 'utf8'));
  url = (file.url ?? '').trim();
  key = (file.anonKey ?? '').trim();
}

if (!url || !key) {
  console.error('Defina EXPO_PUBLIC_SUPABASE_* ou web/historico/supabase.config.json');
  process.exit(1);
}

const template = readFileSync(templatePath, 'utf8');
const html = template
  .replaceAll('__SUPABASE_URL__', url)
  .replaceAll('__SUPABASE_ANON_KEY__', key);

writeFileSync(outPath, html, 'utf8');
console.log('HTML gerado:', outPath);
