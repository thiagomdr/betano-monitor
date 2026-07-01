/**
 * Aplica migration SQL no projeto remoto via Supabase Management API.
 * Requer: SUPABASE_ACCESS_TOKEN (Dashboard → Account → Access Tokens)
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const projectRef = 'mddortcbebtkopeanrhu';
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();

if (!token) {
  console.error('Defina SUPABASE_ACCESS_TOKEN');
  process.exit(1);
}

const sqlPath = join(root, 'supabase/migrations/20260702120000_futebol_estatisticas.sql');
const query = readFileSync(sqlPath, 'utf8');

const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query }),
});

const body = await res.text();
if (!res.ok) {
  console.error('Migration falhou:', res.status, body);
  process.exit(1);
}

console.log('Migration aplicada:', sqlPath);
console.log(body.slice(0, 500));
