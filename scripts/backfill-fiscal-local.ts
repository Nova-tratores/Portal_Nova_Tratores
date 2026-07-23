// Backfill dos campos fiscais em `produtos` (só as colunas de sql/produtos-fiscal.sql),
// rodado LOCALMENTE via tsx — o cron de produção ainda roda a main (sem esta
// feature), então o cache fica vazio até o merge. Este script popula sem esperar.
//
// Fiscal-ONLY de propósito: reusa ListarProdutos (rápido, ~70s/conta) e faz
// UPDATE só das colunas novas. NÃO recalcula estoque/cmc (que já estão no banco
// e cujo bulk é lento e às vezes bloqueia). Produtos que não existem no banco
// (inativos/famílias ocultas que o sync filtra) simplesmente não casam no UPDATE.
//
// Uso:  npx tsx scripts/backfill-fiscal-local.ts
//
// Precisa do .env.local (SUPABASE_SERVICE_ROLE_KEY, OMIE_APP_*_NOVA/CASTRO).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Popular process.env ANTES de importar as libs (o cliente supabase lê no import).
for (const linha of readFileSync(resolve(__dirname, '../.env.local'), 'utf8').split(/\r?\n/)) {
  const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

async function main() {
  const { buscarTodosProdutosDaOmie, camposFiscais } = await import('../src/lib/estoque/produtos-sync');
  const { supabase } = await import('../src/lib/estoque/supabase');
  const contas: Array<'NOVA' | 'CASTRO'> = ['NOVA', 'CASTRO'];

  for (const conta of contas) {
    const contaLow = conta.toLowerCase();
    console.log(`\n=== ${conta}: listando produtos do Omie…`);
    const produtos = await buscarTodosProdutosDaOmie(conta);
    console.log(`${conta}: ${produtos.length} produtos. Gravando campos fiscais…`);

    const CHUNK = 25;
    let atualizados = 0;
    let semLinha = 0;
    let erros = 0;

    for (let i = 0; i < produtos.length; i += CHUNK) {
      const chunk = produtos.slice(i, i + CHUNK);
      await Promise.all(chunk.map(async (p) => {
        if (!p.codigo_produto) return;
        const { error, count } = await supabase
          .from('produtos')
          .update(camposFiscais(p), { count: 'exact' })
          .eq('codigo_produto', p.codigo_produto)
          .eq('conta_omie', contaLow);
        if (error) { erros++; console.error(`  update ${p.codigo_produto}:`, error.message); }
        else if ((count || 0) > 0) atualizados++;
        else semLinha++; // produto do Omie que não está no cache (inativo/oculto)
      }));
      if (i % 500 === 0) process.stdout.write(`  ${i}/${produtos.length}\r`);
    }
    console.log(`\n${conta}: ${atualizados} atualizados, ${semLinha} fora do cache, ${erros} erros.`);
  }
  console.log('\nBackfill fiscal concluído.');
}

main().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
