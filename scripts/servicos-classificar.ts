// Classifica TODAS as OS de serviço (os_servicos_itens) em comercial × garantia,
// campanha, seguro ou promoção e grava em os_classificacao
// (sql/servicos-nao-comerciais.sql). Depois disso o sync de cada mês mantém a
// classificação sozinho; OS movida à mão na tela não é sobrescrita.
//
// Uso:
//   npx tsx scripts/servicos-classificar.ts            (simula: só mostra os números)
//   npx tsx scripts/servicos-classificar.ts --gravar   (grava; exige a migration)
//   ... [--conta NOVA]

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Conta } from '../src/lib/estoque/conta';

for (const l of readFileSync(resolve(__dirname, '../.env.local'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

async function main() {
  const { classificarOSServico } = await import('../src/lib/estoque/servicos-classe-db');
  const gravar = process.argv.includes('--gravar');
  const i = process.argv.indexOf('--conta');
  const contas = (i > 0 ? [process.argv[i + 1]] : ['NOVA', 'CASTRO']) as Conta[];
  const rs = (v: number) => 'R$ ' + Math.round(v).toLocaleString('pt-BR');

  console.log(gravar ? '== GRAVANDO' : '== SIMULAÇÃO (use --gravar para gravar)');
  for (const conta of contas) {
    const r = await classificarOSServico(conta, undefined, { gravar });
    if (r.pulado) { console.log(conta + ': ' + r.pulado); continue; }
    console.log(`\n${conta}: ${r.os} OS · ${r.naoComerciais} fora do comercial · ${r.manuaisPreservadas} manuais preservadas`);
    for (const [classe, v] of Object.entries(r.porClasse).sort((a, b) => b[1]!.valor - a[1]!.valor)) {
      console.log(`  ${classe.padEnd(10)} ${String(v!.os).padStart(5)} OS  ${rs(v!.valor).padStart(16)}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
