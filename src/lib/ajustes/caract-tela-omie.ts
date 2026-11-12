/* eslint-disable @typescript-eslint/no-explicit-any */
// Conserta as características que a TELA da Omie mostra errado (achado de 11/11/2026):
// - "tela velha": alterada pela API (AlterarCaractProduto) — a API tem o valor novo,
//   a tela de Produtos mostra o anterior;
// - "sem exibição": locação incluída pelo portal com todos os "Onde será exibida" em N.
// Lê ListarCaractProduto produto a produto (lista = espelho produtos_caracteristicas) e
// regrava com o valor que a API JÁ TEM (gravarCaractProduto com forcar: excluir +
// incluir). Não muda valor nenhum; só a tela e a exibição. Cada conserto vai ao audit_log.
// Idempotente: o que foi consertado deixa de aparecer no diagnóstico.
import type { Conta } from './conta';
import { supabase } from './supabase';
import { omieRequest, gravarCaractProduto } from './omie';
import { diagnosticarCaract, ehLocacao } from './caract-gravacao';
import { registrarAuditLog } from '@/lib/server/audit-notify';

export type OpcoesConserto = {
  contas: Conta[];
  /** true = conserta também as características que não são locação (ex.: "Tipo:"). */
  incluirTipo?: boolean;
  gravar: boolean;
  /** Para de começar produto novo depois disso (o resto fica para a próxima rodada). */
  limiteMin?: number;
  codigo?: string;
  log?: (msg: string) => void;
};

export type ResultadoConta = { lidos: number; falhasLeitura: number; achados: number; consertados: number; falhas: number; restantes: number; bloqueio?: string };

async function produtosDoEspelho(conta: Conta, soLocacao: boolean, codigo?: string) {
  const out: Array<{ codigo: string; codigo_produto: number }> = [];
  for (let off = 0; ; off += 1000) {
    let q = supabase.from('produtos_caracteristicas').select('codigo,codigo_produto,caracteristicas').eq('conta_omie', conta).order('codigo_produto').range(off, off + 999);
    if (codigo) q = q.eq('codigo', codigo);
    const { data, error } = await q;
    if (error) throw new Error(`espelho ${conta}: ${error.message}`);
    for (const r of data || []) {
      if (soLocacao && !Object.keys((r as any).caracteristicas || {}).some(ehLocacao)) continue;
      out.push({ codigo: (r as any).codigo, codigo_produto: Number((r as any).codigo_produto) });
    }
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function consertarTelaOmie(op: OpcoesConserto): Promise<Record<string, ResultadoConta>> {
  const log = op.log || (() => {});
  const fim = op.limiteMin ? Date.now() + op.limiteMin * 60_000 : Infinity;
  const res: Record<string, ResultadoConta> = {};
  for (const conta of op.contas) {
    const r: ResultadoConta = { lidos: 0, falhasLeitura: 0, achados: 0, consertados: 0, falhas: 0, restantes: 0 };
    res[conta] = r;
    const produtos = await produtosDoEspelho(conta, !op.incluirTipo, op.codigo);
    log(`${conta}: ${produtos.length} produtos a ler${op.gravar ? '' : ' (só leitura)'}`);
    for (let i = 0; i < produtos.length; i++) {
      if (r.bloqueio || Date.now() > fim) { r.restantes = produtos.length - i; break; }
      const p = produtos[i];
      let lista: any[] = [];
      try {
        const resp = await omieRequest('/geral/prodcaract/', 'ListarCaractProduto', { nPagina: 1, nRegPorPagina: 50, nCodProd: p.codigo_produto }, conta);
        lista = resp?.listaCaracteristicas || [];
      } catch (e: any) {
        if (e?.bloqueio) { r.bloqueio = String(e?.faultstring || e?.message).slice(0, 200); r.restantes = produtos.length - i; break; }
        if (!/n[aã]o\s+(existem|h[aá]|encontrad)|nenhum/i.test(String(e?.faultstring || e?.message))) r.falhasLeitura++;
      }
      r.lidos++;
      for (const c of lista) {
        if (!op.incluirTipo && !ehLocacao(c.cNomeCaract)) continue;
        const d = diagnosticarCaract(c);
        if (!d.telaVelha && !d.semExibicao) continue;
        r.achados++;
        if (!op.gravar) continue;
        try {
          await gravarCaractProduto(conta, { codigoProduto: p.codigo_produto, nomeCaract: c.cNomeCaract, conteudo: c.cConteudo, forcar: true });
          r.consertados++;
          await registrarAuditLog({
            userName: 'Robô (conserto da tela da Omie)', sistema: 'caracteristicas', acao: 'regravar-tela-omie',
            entidade: 'produto_caracteristica', entidadeId: `${conta}:${p.codigo_produto}`, entidadeLabel: p.codigo,
            detalhes: { empresa: conta, codigo_produto: p.codigo_produto, codigo: p.codigo, caracteristica: c.cNomeCaract, conteudo: c.cConteudo, tela_velha: d.telaVelha, sem_exibicao: d.semExibicao },
          });
        } catch (e: any) {
          r.falhas++;
          log(`  falhou ${p.codigo} ${c.cNomeCaract}: ${String(e?.faultstring || e?.message).slice(0, 160)}`);
          if (e?.bloqueio) { r.bloqueio = String(e?.faultstring || e?.message).slice(0, 200); break; }
        }
      }
      if ((i + 1) % 200 === 0) log(`  ${conta} ${i + 1}/${produtos.length} · ${r.achados} achados · ${r.consertados} consertados`);
    }
    log(`${conta}: ${JSON.stringify(r)}`);
  }
  return res;
}
