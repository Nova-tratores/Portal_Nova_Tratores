/* eslint-disable @typescript-eslint/no-explicit-any */
// Inventário do padrão antigo do "boleto agrupado" (CAMBUCI e afins):
// duplicatas de NF (COMP) baixadas ≥ 7 dias antes do vencimento + títulos
// manuais (MANP = 1ª parcela, RPTP = seguintes) criados no mesmo dia (±1)
// com a mesma soma = um CICLO.
//
// Só LEITURA por padrão (espelho contas_pagar + movimentos_cc via REST).
// Escritas na Omie só com flag explícita, UM ciclo por vez, com o José:
//   --reabrir --conta=CASTRO --data=2026-10-14   → CancelarPagamento nas baixas fictícias do ciclo
//   --excluir-manuais --conta=CASTRO --data=…    → ExcluirContaPagar nos RPTP AINDA ABERTOS do ciclo
// Entre os dois passos, registrar o boleto pela tela (Correção de contas → Lista)
// para reprogramar as duplicatas reabertas. Cada escrita vai ao audit_log.
//
//   npx tsx scripts/boletos-inventario.ts [--conta=CASTRO] [--fornecedor=CAMBUCI] [--desde=2024-01-01] [--json=saida.json]
import fs from 'node:fs';
import path from 'node:path';

for (const linha of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/)) {
  const i = linha.indexOf('=');
  if (i > 0 && !linha.startsWith('#')) process.env[linha.slice(0, i).trim()] ||= linha.slice(i + 1).trim().replace(/^"|"$/g, '');
}

import { detectarCiclos, fmtBR, somar, type TituloEspelho } from '../src/lib/ajustes/boletos-fornecedor';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? 'true'] : [a, 'true']; }));
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const contaArg = args.conta ? String(args.conta).toUpperCase() : null;
const forn = args.fornecedor ? String(args.fornecedor).toUpperCase() : null;
const desde = args.desde || '2024-01-01';

// PostgREST pagina de 1000 em 1000; statement timeout (57014) repete até 4× com espera.
async function rest(p: string): Promise<any[]> {
  const todos: any[] = [];
  for (let from = 0; ; from += 1000) {
    let j: any = null;
    for (let tent = 1; tent <= 4; tent++) {
      const r = await fetch(`${URL_}/rest/v1/${p}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Range: `${from}-${from + 999}` } });
      j = await r.json();
      if (Array.isArray(j)) break;
      if (j && j.code === '57014' && tent < 4) { console.log(`  (timeout no Supabase, tentando de novo em ${tent * 5}s)`); await new Promise((res) => setTimeout(res, tent * 5000)); continue; }
      throw new Error(`REST ${p}: ${JSON.stringify(j).slice(0, 200)}`);
    }
    todos.push(...j);
    if (j.length < 1000) break;
  }
  return todos;
}

async function main() {
  const contas = contaArg ? [contaArg] : ['NOVA', 'CASTRO'];
  const saida: any[] = [];
  for (const conta of contas) {
    let q = `contas_pagar?select=codigo_lancamento,numero_documento,numero_documento_fiscal,status_titulo,data_emissao,data_inclusao,data_vencimento,data_pagamento,valor_documento,valor_pago,nome_fornecedor,codigo_cliente_fornecedor,id_origem:raw->>id_origem&conta_omie=eq.${conta}&data_emissao=gte.${desde}&order=codigo_lancamento`;
    if (forn) q += `&nome_fornecedor=ilike.*${encodeURIComponent(forn)}*`;
    const linhas = await rest(q);
    // desconto da baixa (movimentos_cc.raw.detalhes.nDesconto) e nCodBaixa — só dos PAGOS antecipados
    const pagos = linhas.filter((r) => r.status_titulo === 'PAGO' && r.id_origem === 'COMP');
    const mov = new Map<number, any>();
    for (let i = 0; i < pagos.length; i += 100) {
      const cods = pagos.slice(i, i + 100).map((r) => r.codigo_lancamento).join(',');
      for (const m of await rest(`movimentos_cc?select=codigo_titulo,valor_pago,nome_conta_corrente,raw&conta_omie=eq.${conta}&codigo_titulo=in.(${cods})`)) mov.set(Number(m.codigo_titulo), m);
    }
    const titulos: TituloEspelho[] = linhas.map((r) => {
      const m = mov.get(Number(r.codigo_lancamento));
      const det = m?.raw?.detalhes || {};
      return {
        codigoLancamento: Number(r.codigo_lancamento), idOrigem: r.id_origem, status: r.status_titulo, dataEmissao: r.data_emissao, dataInclusao: r.data_inclusao, dataVencimento: r.data_vencimento,
        dataPagamento: r.data_pagamento, valorDocumento: Number(r.valor_documento) || 0, valorPago: m ? Number(m.valor_pago) || 0 : Number(r.valor_pago) || 0,
        desconto: m ? Number(det.nDesconto) || 0 : null, nomeFornecedor: r.nome_fornecedor, numeroDoc: r.numero_documento, numeroDocFiscal: r.numero_documento_fiscal,
      };
    });
    const ciclos = detectarCiclos(titulos).filter((c) => c.rptp.length || c.comp.length);
    console.log(`\n=== ${conta}: ${linhas.length} títulos desde ${desde}; ${ciclos.length} ciclo(s) com baixa antecipada ===`);
    for (const c of ciclos) {
      const baixas = c.comp.map((t) => ({ codigo: t.codigoLancamento, doc: t.numeroDoc, valor: t.valorDocumento, venc: t.dataVencimento, desconto: t.desconto, codigoBaixa: mov.get(t.codigoLancamento)?.raw?.detalhes?.nCodBaixa || null, cc: mov.get(t.codigoLancamento)?.nome_conta_corrente || null }));
      const linha = `${fmtBR(c.data)} ${c.fornecedor.slice(0, 28).padEnd(28)} COMP ${String(c.comp.length).padStart(2)} = R$ ${c.somaComp.toFixed(2).padStart(9)} (desc100: ${c.desconto100}) | manual ${String(c.rptp.length).padStart(2)} = R$ ${c.somaRptp.toFixed(2).padStart(9)} (${c.rptpAbertos} aberto) | ${c.bate ? 'BATE' : c.rptp.length ? 'nao bate' : 'sem manual'}`;
      console.log(linha);
      saida.push({ conta, ...c, comp: baixas, rptp: c.rptp.map((t) => ({ codigo: t.codigoLancamento, doc: t.numeroDoc, docFiscal: t.numeroDocFiscal, valor: t.valorDocumento, venc: t.dataVencimento, status: t.status, criadoEm: t.dataInclusao })) });
    }
    const saneaveis = ciclos.filter((c) => c.bate && c.rptpAbertos > 0);
    console.log(`→ ${saneaveis.length} ciclo(s) saneável(is) (manual ainda aberto): ${saneaveis.map((c) => `${c.fornecedor.split(' ')[0]} ${fmtBR(c.data)} R$ ${c.somaRptp.toFixed(2)}`).join('; ') || '—'}`);

    if ((args.reabrir || args['excluir-manuais']) && conta === contaArg && args.data) {
      const ciclo = ciclos.find((c) => c.data === args.data && (!forn || c.fornecedor.includes(forn)));
      if (!ciclo) { console.log('ciclo não encontrado para --data'); continue; }
      const { cancelarBaixaConta, excluirConta } = await import('../src/lib/ajustes/omie');
      const { registrarAuditLog } = await import('../src/lib/server/audit-notify');
      if (args.reabrir) {
        for (const t of ciclo.comp) {
          const cb = mov.get(t.codigoLancamento)?.raw?.detalhes?.nCodBaixa;
          if (!cb) { console.log(`  ${t.numeroDoc}: sem nCodBaixa no espelho — pegar na Omie`); continue; }
          try {
            const r = await cancelarBaixaConta(conta as any, 'pagar', cb);
            console.log(`  ${t.numeroDoc}: baixa ${cb} cancelada →`, JSON.stringify(r).slice(0, 120));
            await registrarAuditLog({ userName: 'script boletos-inventario', sistema: 'ajustes', acao: 'boleto-saneamento-reabrir', entidade: 'contas_pagar', entidadeId: String(t.codigoLancamento), entidadeLabel: String(t.numeroDoc), detalhes: { conta, codigoBaixa: cb, ciclo: ciclo.data, resposta: r } });
          } catch (e: any) { console.log(`  ${t.numeroDoc}: ERRO ${e.faultstring || e.message}`); }
          await new Promise((r) => setTimeout(r, 800));
        }
      }
      if (args['excluir-manuais']) {
        for (const t of ciclo.rptp.filter((x) => String(x.status).toUpperCase() !== 'PAGO')) {
          try {
            const r = await excluirConta(conta as any, 'pagar', t.codigoLancamento);
            console.log(`  manual ${t.codigoLancamento} (${t.numeroDoc}) excluído →`, JSON.stringify(r).slice(0, 120));
            await registrarAuditLog({ userName: 'script boletos-inventario', sistema: 'ajustes', acao: 'boleto-saneamento-excluir-manual', entidade: 'contas_pagar', entidadeId: String(t.codigoLancamento), entidadeLabel: String(t.numeroDoc), detalhes: { conta, ciclo: ciclo.data, valor: t.valorDocumento, resposta: r } });
            await fetch(`${URL_}/rest/v1/contas_pagar?conta_omie=eq.${conta}&codigo_lancamento=eq.${t.codigoLancamento}`, { method: 'DELETE', headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
          } catch (e: any) { console.log(`  manual ${t.codigoLancamento}: ERRO ${e.faultstring || e.message}`); }
          await new Promise((r) => setTimeout(r, 800));
        }
      }
    }
  }
  if (args.json) { fs.writeFileSync(String(args.json), JSON.stringify(saida, null, 2)); console.log(`\nJSON: ${args.json}`); }
  console.log(`\nTotal: ${saida.length} ciclo(s); soma dos manuais R$ ${somar(saida.map((c) => c.somaRptp)).toFixed(2)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
