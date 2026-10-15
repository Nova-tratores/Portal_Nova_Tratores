// REST do Supabase do portal com a service role, via curl (o fetch do Node
// trava num dos IPs do Supabase — ver memória rede-supabase-ip-morto).
import { execFileSync } from 'child_process';
import fs from 'fs';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const U = env.NEXT_PUBLIC_SUPABASE_URL;
const K = env.SUPABASE_SERVICE_ROLE_KEY;

function curl(metodo: string, path: string, corpo?: unknown, extra: string[] = []): string {
  const args = ['-s', '-m', '120', '-X', metodo, `${U}/rest/v1/${path}`,
    '-H', `apikey: ${K}`, '-H', `Authorization: Bearer ${K}`, '-H', 'Content-Type: application/json', ...extra];
  if (corpo !== undefined) args.push('--data-binary', '@-');
  return execFileSync('curl', args, { input: corpo === undefined ? undefined : JSON.stringify(corpo), maxBuffer: 1 << 28 }).toString();
}

export function lerTudo<T = unknown>(path: string): T[] {
  const out: T[] = [];
  for (let o = 0; ; o += 1000) {
    const txt = curl('GET', path, undefined, ['-H', `Range: ${o}-${o + 999}`]);
    const j = JSON.parse(txt);
    if (!Array.isArray(j)) throw new Error(`${path}: ${txt.slice(0, 300)}`);
    out.push(...j);
    if (j.length < 1000) return out;
  }
}

/** Upsert em lotes; `conflito` = colunas do ON CONFLICT. Devolve as linhas gravadas. */
export function upsert<T = unknown>(tabela: string, linhas: unknown[], conflito: string): T[] {
  const out: T[] = [];
  for (let i = 0; i < linhas.length; i += 500) {
    const txt = curl('POST', `${tabela}?on_conflict=${conflito}`, linhas.slice(i, i + 500),
      ['-H', 'Prefer: resolution=merge-duplicates,return=representation']);
    const j = JSON.parse(txt || '[]');
    if (!Array.isArray(j)) throw new Error(`${tabela}: ${txt.slice(0, 300)}`);
    out.push(...j);
  }
  return out;
}
