// Reprocessa os_servicos_itens de TODOS os meses (nov/2022 → hoje) para gravar o
// código do serviço da Omie (codigo_servico, sql/servicos-codigo-resumo.sql) nas
// linhas antigas. Sem isso a grade de Serviços não separa "Sem código" no
// histórico (linhas antigas ficam com o código NULL e caem no tipo pela descrição).
//
// Uso (depois de aplicar a migration):
//   npx tsx scripts/os-servicos-reprocessar-codigo.ts [--conta NOVA]
//
// É o mesmo backfill do cron noturno (backfillOsServicos), forçado: baixa o
// ListarOS completo UMA vez por conta e regrava mês a mês (apaga e insere o
// mês). Roda local de propósito (no Railway seria cortado aos 5 min).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Conta } from '../src/lib/estoque/conta';

for (const l of readFileSync(resolve(__dirname, '../.env.local'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

async function main() {
  const { supabase } = await import('../src/lib/estoque/supabase');
  const { backfillOsServicos, getBackfillOsServicosStatus } = await import('../src/lib/estoque/os-backfill');
  const { getContasOmie } = await import('../src/lib/estoque/conta');

  const { error } = await supabase.from('os_servicos_itens').select('codigo_servico').limit(1);
  if (error) throw new Error('Aplique sql/servicos-codigo-resumo.sql antes: ' + error.message);

  const i = process.argv.indexOf('--conta');
  const filtro = i >= 0 ? String(process.argv[i + 1] || '').toUpperCase() : '';
  const contas = getContasOmie().map((c) => c.id as Conta).filter((c) => !filtro || c === filtro);

  const t0 = Date.now();
  await backfillOsServicos(contas, true);
  console.log(JSON.stringify(getBackfillOsServicosStatus(), null, 2));

  // Conferência: quantas linhas ainda sem código (deveria sobrar só o que a Omie não devolveu).
  for (const c of contas) {
    const semCod = await supabase.from('os_servicos_itens').select('id', { count: 'exact', head: true }).eq('conta_omie', c).is('codigo_servico', null);
    const zero = await supabase.from('os_servicos_itens').select('id', { count: 'exact', head: true }).eq('conta_omie', c).eq('codigo_servico', 0);
    console.log(`${c}: linhas com código NULL = ${semCod.count} · sem código (0) = ${zero.count}`);
  }
  console.log(`concluído em ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
