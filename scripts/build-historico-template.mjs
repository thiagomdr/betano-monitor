/**
 * Gera web/historico/index.template.html a partir da fonte unica (Edge Function shared).
 * Rode: node scripts/build-historico-template.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcPath = join(root, 'supabase/functions/_shared/historicoWebPage.ts');
const outDir = join(root, 'web/historico');
const outPath = join(outDir, 'index.template.html');

const src = readFileSync(srcPath, 'utf8');
const urlPh = src.match(/HISTORICO_URL_PLACEHOLDER = '([^']+)'/)?.[1];
const keyPh = src.match(/HISTORICO_ANON_KEY_PLACEHOLDER = '([^']+)'/)?.[1];

if (!urlPh || !keyPh) {
  console.error('Placeholders nao encontrados em historicoWebPage.ts');
  process.exit(1);
}

const configJson = `{"url":"${urlPh}","anonKey":"${keyPh}"}`;

// Extrai o HTML do return `...`;
const returnMatch = src.match(/return `([\s\S]*)`;\s*\}\s*\n\s*export function buildHistoricoPage/);
if (!returnMatch) {
  console.error('Nao foi possivel extrair HTML do template');
  process.exit(1);
}

const html = returnMatch[1].replace(/\$\{configJson\}/g, configJson);

mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, html, 'utf8');
console.log('Template gerado:', outPath);
