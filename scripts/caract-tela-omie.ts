// Características que a TELA da Omie mostra errado (achado de 11/11/2026) — versão de linha
// de comando da tarefa do agendador `caract-tela-omie` (lib/ajustes/caract-tela-omie.ts).
// Só LEITURA por padrão; com --gravar conserta (excluir + incluir com o valor que a API tem).
//
//   npx tsx scripts/caract-tela-omie.ts --conta=NOVA [--codigo=RP-...] [--tipo] [--gravar]
import fs from 'node:fs';
import path from 'node:path';

for (const linha of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/)) {
  const i = linha.indexOf('=');
  if (i > 0 && !linha.startsWith('#')) process.env[linha.slice(0, i).trim()] ||= linha.slice(i + 1).trim().replace(/^"|"$/g, '');
}

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? 'true'] : [a, 'true']; }));
const conta = String(args.conta || '').toUpperCase();
if (conta !== 'NOVA' && conta !== 'CASTRO') { console.error('Use --conta=NOVA ou --conta=CASTRO'); process.exit(1); }

(async () => {
  const { consertarTelaOmie } = await import('../src/lib/ajustes/caract-tela-omie');
  const r = await consertarTelaOmie({ contas: [conta as 'NOVA' | 'CASTRO'], incluirTipo: args.tipo === 'true', gravar: args.gravar === 'true', codigo: args.codigo ? String(args.codigo) : undefined, log: (m) => console.log(m) });
  console.log(JSON.stringify(r, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
