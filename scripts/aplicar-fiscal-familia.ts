// Aplica um PERFIL FISCAL a todos os produtos de uma FAMÍLIA (tabela produto_fiscal).
// Grava o mesmo bloco de imposto (ICMS/ICMS-ST/IPI/PIS/COFINS + CFOP) que o
// "Item de Orçamento" salva no portal — assim o Enviar ao Omie já manda certinho.
//
// Uso:
//   npx tsx scripts/aplicar-fiscal-familia.ts --familia "Peças" --conta nova            (preview)
//   npx tsx scripts/aplicar-fiscal-familia.ts --familia "Peças" --conta nova --aplicar   (grava)
//   ... --overwrite   → sobrescreve também os que já têm fiscal (default: NÃO toca neles)
//   ... --perfil-de SKU → copia o perfil de um produto já salvo (default: perfil padrão abaixo)
//
// Perfil PADRÃO (o que você salvou no 10W30/4): ICMS 60 (ST), CFOP 5.102, origem 0,
// PIS/COFINS 04 (monofásico), IPI 53. Confirme se é o certo pra família escolhida.
import { createClient } from '@supabase/supabase-js';
import { lerEnvLocal } from './servicos-omie-exportar';

const env = lerEnvLocal();
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

function arg(nome: string, def = ''): string {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : def;
}
const has = (nome: string) => process.argv.includes(`--${nome}`);

// Perfil padrão = o que o usuário salvou (fiscalPadrao do portal).
const PERFIL_PADRAO = {
  cfop: '5.102',
  icms_cst: '60', icms_origem: '0', icms_modalidade: '3', icms_aliquota: 0, icms_base: 0, icms_perc_red_base: 0,
  icmsst_cst: '60', icmsst_modalidade: null, icmsst_aliquota: 0, icmsst_aliq_op_prop: 0, icmsst_base: 0, icmsst_margem: 0, icmsst_perc_red_base_op: 0, icmsst_perc_red_base_st: 0, icmsst_cest: null,
  ipi_cst: '53', ipi_enquadramento: '999', ipi_aliquota: 0, ipi_base: 0,
  pis_cst: '04', pis_aliquota: 0, pis_base: 0,
  cofins_cst: '04', cofins_aliquota: 0, cofins_base: 0,
};

async function copiarPerfilDe(conta: string, sku: string) {
  const { data } = await sb.from('produtos').select('codigo_produto').eq('conta_omie', conta).eq('codigo', sku).limit(1);
  const cp = data?.[0]?.codigo_produto;
  if (!cp) throw new Error(`SKU ${sku} não achado na conta ${conta}`);
  const { data: pf } = await sb.from('produto_fiscal').select('*').eq('conta_omie', conta).eq('codigo_produto', cp).limit(1);
  const r = pf?.[0];
  if (!r) throw new Error(`SKU ${sku} não tem produto_fiscal salvo (salve no portal primeiro)`);
  const { codigo_produto, codigo, id, atualizado_em, atualizado_por, ...perfil } = r; // tira chaves de identidade
  void codigo_produto; void codigo; void id; void atualizado_em; void atualizado_por;
  return perfil as typeof PERFIL_PADRAO;
}

async function paginar<T>(tabela: string, sel: string, filtro: (q: any) => any): Promise<T[]> {
  const out: T[] = []; let from = 0; const step = 1000;
  for (;;) {
    const { data, error } = await filtro(sb.from(tabela).select(sel).range(from, from + step - 1));
    if (error) throw new Error(error.message);
    if (!data || !data.length) break;
    out.push(...(data as T[]));
    if (data.length < step) break; from += step;
  }
  return out;
}

(async () => {
  const familia = arg('familia');
  const conta = (arg('conta', 'nova')).toLowerCase();
  const aplicar = has('aplicar');
  const overwrite = has('overwrite');
  const perfilDe = arg('perfil-de');
  if (!familia) { console.log('Informe --familia "NOME" (busca parcial).'); process.exit(1); }

  const perfil = perfilDe ? await copiarPerfilDe(conta, perfilDe) : PERFIL_PADRAO;
  console.log(`Conta: ${conta} | Família (contém): "${familia}" | Perfil: ICMS ${perfil.icms_cst} / CFOP ${perfil.cfop} / PIS-COFINS ${perfil.pis_cst} / IPI ${perfil.ipi_cst}${perfilDe ? ` (copiado de ${perfilDe})` : ' (padrão)'}`);

  // Produtos da família
  const prods = await paginar<{ codigo_produto: number; codigo: string; familia_nome: string }>(
    'produtos', 'codigo_produto,codigo,familia_nome',
    (q) => q.eq('conta_omie', conta).ilike('familia_nome', `%${familia}%`),
  );
  console.log(`Produtos na família: ${prods.length}`);
  if (!prods.length) { process.exit(0); }

  // Já têm fiscal? (pra não sobrescrever, salvo --overwrite)
  const jaTem = new Set<number>();
  if (!overwrite) {
    const existentes = await paginar<{ codigo_produto: number }>(
      'produto_fiscal', 'codigo_produto', (q) => q.eq('conta_omie', conta),
    );
    for (const e of existentes) jaTem.add(e.codigo_produto);
  }

  const alvo = prods.filter((p) => p.codigo_produto && (overwrite || !jaTem.has(p.codigo_produto)));
  const pulados = prods.length - alvo.length;
  console.log(`A gravar: ${alvo.length}${pulados ? ` | já tinham fiscal (pulados): ${pulados}` : ''}`);

  if (!aplicar) { console.log('\n(PREVIEW — rode de novo com --aplicar pra gravar)'); process.exit(0); }

  const rows = alvo.map((p) => ({
    conta_omie: conta, codigo_produto: p.codigo_produto, codigo: p.codigo || null,
    ...perfil, atualizado_em: new Date().toISOString(), atualizado_por: 'lote-familia',
  }));

  let ok = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await sb.from('produto_fiscal').upsert(chunk, { onConflict: 'conta_omie,codigo_produto' });
    if (error) { console.error(`  ERRO chunk ${i}: ${error.message}`); }
    else { ok += chunk.length; console.log(`  gravados ${ok}/${rows.length}`); }
  }
  console.log(`\nPRONTO: ${ok} produtos da família "${familia}" com fiscal aplicado (conta ${conta}).`);
})().catch((e) => { console.error('FALHA:', e); process.exit(1); });
