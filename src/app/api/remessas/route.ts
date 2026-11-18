// Módulo Remessas (18/11/2026). Lógica em src/lib/remessas/server.ts.
// GET                         → lista (espelho + prazo/decisões)
// GET ?ficha=nova-123         → ficha (itens e NF ao vivo na Omie, histórico, emissões, voltas)
// GET ?clientes=q&conta=      → busca de cliente (nova demonstração)
// GET ?produtos=q&conta=      → busca de máquina (nova demonstração)
// POST {acao, ...}            → demonstracao | volta | renovar | emitir_nf | prazo | marcar | obs | responsavel
// Ver: o módulo Remessas ou as chaves das telas antigas (Visual Estoque e Ajustes › Remessas).
// Escrever na Omie: ações EXPLÍCITAS remessas:emitir / remessas:renovar / remessas:devolver.
import { NextRequest, NextResponse } from 'next/server';
import { protegerRota, autorDe, type OpcaoAcesso } from '@/lib/ajustes/permissao-server';
import { registrarAuditLog } from '@/lib/server/audit-notify';
import {
  lerLista, lerFicha, buscarClientes, buscarProdutos, criarDemo, criarRetorno, emitirNF, renovar,
  definirPrazo, marcar, anotar, definirResponsavel, ErroRemessa,
} from '@/lib/remessas/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

const M = 'remessas';
const VER: OpcaoAcesso[] = [{ modulo: M }, { modulo: 'consulta-estoque', acao: 'remessas' }, { modulo: 'ajustes', acao: 'remessas' }];
const POR_ACAO: Record<string, OpcaoAcesso[]> = {
  demonstracao: [{ modulo: M, acao: 'emitir' }],
  emitir_nf: [{ modulo: M, acao: 'emitir' }, { modulo: M, acao: 'renovar' }, { modulo: M, acao: 'devolver' }],
  renovar: [{ modulo: M, acao: 'renovar' }],
  volta: [{ modulo: M, acao: 'devolver' }],
  marcar: [{ modulo: M, acao: 'acompanhar' }],
  prazo: [{ modulo: M, acao: 'acompanhar' }],
  obs: [{ modulo: M, acao: 'acompanhar' }],
  responsavel: [{ modulo: M, acao: 'acompanhar' }],
};

const contaLow = (v: unknown): 'nova' | 'castro' | null => {
  const s = String(v || '').toLowerCase();
  return s === 'nova' || s === 'castro' ? s : null;
};

function erro(e: unknown) {
  if (e instanceof ErroRemessa) return NextResponse.json({ erro: e.message, migracaoFaltando: e.migracao || undefined }, { status: e.status });
  const msg = (e as { faultstring?: string })?.faultstring || (e as Error)?.message || String(e);
  console.error('[api/remessas]', msg);
  return NextResponse.json({ erro: msg }, { status: 500 });
}

export async function GET(req: NextRequest) {
  const g = await protegerRota(req, VER);
  if (g.resposta) return g.resposta;
  const sp = req.nextUrl.searchParams;
  try {
    const ficha = sp.get('ficha');
    if (ficha) {
      const [c, id] = ficha.split('-');
      const conta = contaLow(c);
      if (!conta || !Number(id)) return NextResponse.json({ erro: 'Remessa inválida.' }, { status: 400 });
      return NextResponse.json(await lerFicha(conta, Number(id)));
    }
    const conta = contaLow(sp.get('conta')) || 'nova';
    if (sp.has('clientes')) return NextResponse.json({ clientes: await buscarClientes(conta, sp.get('clientes') || '') });
    if (sp.has('produtos')) return NextResponse.json({ produtos: await buscarProdutos(conta, sp.get('produtos') || '') });
    return NextResponse.json(await lerLista());
  } catch (e) {
    return erro(e);
  }
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({} as Record<string, unknown>));
  const acao = String(b.acao || '');
  const opcoes = POR_ACAO[acao];
  if (!opcoes) return NextResponse.json({ erro: 'Ação inválida.' }, { status: 400 });
  const g = await protegerRota(req, opcoes);
  if (g.resposta) return g.resposta;
  const quem = { id: g.user.id, nome: autorDe(g.user) };
  const conta = contaLow(b.conta);
  const id = Number(b.idRemessa) || 0;
  const precisa = () => { if (!conta || !id) throw new ErroRemessa('Informe a empresa e a remessa.'); };
  try {
    let resultado: unknown;
    switch (acao) {
      case 'demonstracao': {
        if (!conta) throw new ErroRemessa('Escolha a empresa.');
        const itens = (Array.isArray(b.itens) ? b.itens : []) as Array<Record<string, unknown>>;
        resultado = await criarDemo({
          conta, nCodCli: Number(b.nCodCli) || 0, prazoAte: String(b.prazoAte || ''), obs: b.obs ? String(b.obs) : null, quem,
          itens: itens.map((i) => ({ nCodProd: Number(i.nCodProd) || 0, qtd: Number(i.qtd) || 0, valorUnit: Number(i.valorUnit) || 0, descricao: i.descricao ? String(i.descricao) : null })),
        });
        break;
      }
      case 'volta': precisa(); resultado = await criarRetorno({ conta: conta!, idRemessa: id, obs: b.obs ? String(b.obs) : null, quem }); break;
      case 'renovar': precisa(); resultado = await renovar({ conta: conta!, idRemessa: id, prazoAte: b.prazoAte ? String(b.prazoAte) : null, obs: b.obs ? String(b.obs) : null, quem }); break;
      case 'emitir_nf': {
        if (!b.emissaoId) throw new ErroRemessa('Informe a emissão.');
        resultado = await emitirNF(String(b.emissaoId), quem);
        break;
      }
      case 'prazo': precisa(); await definirPrazo(conta!, id, String(b.prazoAte || ''), quem); resultado = { ok: true }; break;
      case 'marcar': {
        precisa();
        const sit = b.situacao === 'virou_venda' || b.situacao === 'devolvida' ? b.situacao : null;
        if (sit === 'devolvida' && !g.user.isAdmin && !g.user.modulos.includes('remessas:devolver')) throw new ErroRemessa('Marcar como devolvida pede a permissão "Remessas — Volta".', 403);
        await marcar(conta!, id, sit, quem, { pedido: b.pedido ? String(b.pedido) : null, obs: b.obs ? String(b.obs) : null });
        resultado = { ok: true };
        break;
      }
      case 'obs': precisa(); await anotar(conta!, id, String(b.obs || ''), quem); resultado = { ok: true }; break;
      case 'responsavel': precisa(); await definirResponsavel(conta!, id, b.userId ? String(b.userId) : null, quem); resultado = { ok: true }; break;
    }
    await registrarAuditLog({
      userId: g.user.id, userName: quem.nome, sistema: 'remessas', acao: `remessa_${acao}`, entidade: 'remessa',
      entidadeId: conta && id ? `${conta}-${id}` : undefined, detalhes: { ...b, resultado } as Record<string, unknown>,
    });
    return NextResponse.json({ ok: true, ...(resultado as object) });
  } catch (e) {
    await registrarAuditLog({
      userId: g.user.id, userName: quem.nome, sistema: 'remessas', acao: `remessa_${acao}_erro`, entidade: 'remessa',
      entidadeId: conta && id ? `${conta}-${id}` : undefined, detalhes: { ...b, erro: (e as Error).message } as Record<string, unknown>,
    });
    return erro(e);
  }
}
