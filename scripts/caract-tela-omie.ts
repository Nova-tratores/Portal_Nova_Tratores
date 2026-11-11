/* eslint-disable @typescript-eslint/no-explicit-any */
// Características que a TELA da Omie mostra errado (achado de 11/11/2026).
// - "tela velha": alterada pela API (AlterarCaractProduto) — a API devolve o valor
//   novo, mas a tela de Produtos mostra o anterior.
// - "sem exibição": locação (#PRATELEIRA/#ANDAR/#CAIXA) incluída pelo portal com
//   todos os "Onde será exibida" em N (não sai no pedido/remessa).
//
// Só LEITURA por padrão: lê ListarCaractProduto produto a produto (lista de produtos
// = espelho produtos_caracteristicas). Com --gravar, regrava cada uma com o valor que
// a API JÁ TEM (excluir + incluir, mesmos ajustes; locação toda N ganha Pedido=S/OP=S).
//
//   npx tsx scripts/caract-tela-omie.ts --conta=NOVA [--codigo=RP-...] [--limite=50] [--json=saida.json] [--gravar]
import fs from 'node:fs';
import path from 'node:path';

for (const linha of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/)) {
  const i = linha.indexOf('=');
  if (i > 0 && !linha.startsWith('#')) process.env[linha.slice(0, i).trim()] ||= linha.slice(i + 1).trim().replace(/^"|"$/g, '');
}

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? 'true'] : [a, 'true']; }));
const conta = String(args.conta || '').toUpperCase() as 'NOVA' | 'CASTRO';
if (conta !== 'NOVA' && conta !== 'CASTRO') { console.error('Use --conta=NOVA ou --conta=CASTRO'); process.exit(1); }
const gravar = args.gravar === 'true';
const limite = args.limite ? Number(args.limite) : Infinity;

async function espelho(): Promise<Array<{ codigo: string; codigo_produto: number }>> {
  const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!; const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const out: any[] = [];
  const filtro = args.codigo ? `&codigo=eq.${encodeURIComponent(String(args.codigo))}` : '';
  for (let off = 0; ; off += 1000) {
    const r = await fetch(`${URL_}/rest/v1/produtos_caracteristicas?conta_omie=eq.${conta}${filtro}&select=codigo,codigo_produto&order=codigo_produto&offset=${off}&limit=1000`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
    const lote = await r.json();
    if (!Array.isArray(lote)) throw new Error(JSON.stringify(lote));
    out.push(...lote);
    if (lote.length < 1000) break;
  }
  return out;
}

(async () => {
  const { omieRequest, gravarCaractProduto } = await import('../src/lib/ajustes/omie');
  const { diagnosticarCaract } = await import('../src/lib/ajustes/caract-gravacao');
  const produtos = (await espelho()).slice(0, limite);
  console.log(`${conta}: ${produtos.length} produtos a ler${gravar ? ' — VAI GRAVAR na Omie' : ' (só leitura)'}`);
  const achados: any[] = [];
  let lidos = 0, falhasLeitura = 0, gravados = 0, falhasGravar = 0;
  for (const p of produtos) {
    let lista: any[] = [];
    try {
      const r = await omieRequest('/geral/prodcaract/', 'ListarCaractProduto', { nPagina: 1, nRegPorPagina: 50, nCodProd: p.codigo_produto }, conta);
      lista = r?.listaCaracteristicas || [];
    } catch (e: any) {
      if (!/n[aã]o\s+(existem|h[aá]|encontrad)|nenhum/i.test(String(e?.faultstring || e?.message))) { falhasLeitura++; console.log('  leitura falhou', p.codigo, String(e?.faultstring || e?.message).slice(0, 120)); }
    }
    lidos++;
    for (const c of lista) {
      const d = diagnosticarCaract(c);
      if (!d.telaVelha && !d.semExibicao) continue;
      const item = { codigo: p.codigo, codigo_produto: p.codigo_produto, caract: c.cNomeCaract, conteudo: c.cConteudo, alterada: `${c.info?.dAlt} ${c.info?.hAlt}`, ...d, gravado: false as boolean | string };
      if (gravar) {
        try {
          await gravarCaractProduto(conta, { codigoProduto: p.codigo_produto, nomeCaract: c.cNomeCaract, conteudo: c.cConteudo, forcar: true });
          item.gravado = true; gravados++;
        } catch (e: any) {
          item.gravado = `ERRO: ${String(e?.faultstring || e?.message).slice(0, 200)}`; falhasGravar++;
          console.log('  GRAVAR falhou', p.codigo, c.cNomeCaract, item.gravado);
          if (e?.bloqueio) { console.log('Omie bloqueou — parando.'); achados.push(item); break; }
        }
      }
      achados.push(item);
    }
    if (lidos % 200 === 0) console.log(`  ${lidos}/${produtos.length} lidos · ${achados.length} achados${gravar ? ` · ${gravados} regravados` : ''}`);
  }
  const telaVelha = achados.filter((a) => a.telaVelha).length;
  const semExib = achados.filter((a) => a.semExibicao).length;
  const porCaract: Record<string, number> = {};
  for (const a of achados) porCaract[a.caract] = (porCaract[a.caract] || 0) + 1;
  console.log(`\n${conta}: ${lidos} produtos lidos (${falhasLeitura} falhas de leitura)`);
  console.log(`  tela velha: ${telaVelha} · sem exibição: ${semExib} · produtos afetados: ${new Set(achados.map((a) => a.codigo)).size}`);
  console.log('  por característica:', porCaract);
  if (gravar) console.log(`  regravados: ${gravados} · falhas: ${falhasGravar}`);
  if (args.json) { fs.writeFileSync(String(args.json), JSON.stringify(achados, null, 1)); console.log('  lista em', args.json); }
})().catch((e) => { console.error(e); process.exit(1); });
