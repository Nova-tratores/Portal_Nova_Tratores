import { NextRequest, NextResponse } from 'next/server';
import { protegerRota, autorDe } from '@/lib/ajustes/permissao-server';
import { ACESSO_RECEBIMENTOS } from '@/lib/ajustes/recebimentos-espelho';
import { registrarAuditLog } from '@/lib/server/audit-notify';
import type { Conta } from '@/lib/ajustes/conta';
import { previaRetorno, emitirRetorno, faturarRetorno, notasParaGarantia } from '@/lib/garantias/retorno-remessa-server';
import { vinculoDaFicha, buscarGarantias, ligarGarantias, marcarSemGarantia, pendentesDeVinculo } from '@/lib/garantias/retorno-vinculo-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Devolução em garantia pela Omie (remessa de retorno 5.949/6.949 da nota da fábrica).
// Quem dá entrada nas notas (Recebimentos) ou quem finaliza garantias.
const ACESSO = [...ACESSO_RECEBIMENTOS, { modulo: 'garantias', acao: 'finalizar' }];

const contaDe = (v: unknown): Conta | null => {
  const s = String(v || '').toUpperCase();
  return s === 'NOVA' || s === 'CASTRO' ? s : null;
};

// GET ?conta=&idReceb= → prévia da nota · GET ?garantia=<id> → notas da fábrica dessa garantia
// GET ?vincular=<fichaId> → garantias ligadas + sugestões · ?buscarGarantia=<q> · ?pendentesVinculo=1
export async function GET(req: NextRequest) {
  const g = await protegerRota(req, ACESSO);
  if (g.resposta) return g.resposta;
  const sp = req.nextUrl.searchParams;
  try {
    const vincular = sp.get('vincular');
    if (vincular) return NextResponse.json(await vinculoDaFicha(vincular));
    const bg = sp.get('buscarGarantia');
    if (bg != null) return NextResponse.json({ garantias: await buscarGarantias(bg) });
    if (sp.get('pendentesVinculo')) return NextResponse.json(await pendentesDeVinculo());
    const garantia = sp.get('garantia');
    if (garantia) return NextResponse.json(await notasParaGarantia(garantia));
    const conta = contaDe(sp.get('conta'));
    const idReceb = Number(sp.get('idReceb'));
    if (!conta || !idReceb) return NextResponse.json({ erro: 'Informe a empresa e a nota.' }, { status: 400 });
    return NextResponse.json(await previaRetorno(conta, idReceb));
  } catch (e) {
    return NextResponse.json({ erro: (e as { faultstring?: string }).faultstring || (e as Error).message }, { status: 502 });
  }
}

// POST {acao:'emitir', conta, idReceb, escolha:[{seq,qtd}], texto, frete, categoria, garantiaId}
//   → cria a remessa na Omie e fatura (emite a NF-e). ESCREVE NA OMIE.
// POST {acao:'faturar', fichaId, ajustes?} → fatura de novo / corrige e reenvia (NF-e rejeitada) uma remessa já criada.
// ajustes = { [seq]: {icmsCst, icmsOrigem, cBenef, semBenef, ipiCst, ipiTpCalc, ipiAliq} } (campos fiscais da prévia).
export async function POST(req: NextRequest) {
  const g = await protegerRota(req, ACESSO);
  if (g.resposta) return g.resposta;
  const quem = autorDe(g.user);
  try {
    const b = await req.json().catch(() => ({}));
    let r: Record<string, unknown>;
    if (b.acao === 'ligar' || b.acao === 'sem_garantia') {
      if (!b.fichaId) return NextResponse.json({ erro: 'Informe a devolução.' }, { status: 400 });
      const fichaId = String(b.fichaId);
      const rv: Record<string, unknown> = b.acao === 'ligar'
        ? await ligarGarantias(fichaId, (Array.isArray(b.garantiaIds) ? b.garantiaIds : []).map(String), quem)
        : await marcarSemGarantia(fichaId, String(b.motivo || ''), quem, !!b.desfazer);
      await registrarAuditLog({
        userId: g.user.id, userName: quem, sistema: 'garantias',
        acao: b.acao === 'ligar' ? 'devolucao_garantia_ligada' : b.desfazer ? 'devolucao_garantia_sem_garantia_desfeito' : 'devolucao_garantia_sem_garantia',
        entidade: 'garantia_retorno', entidadeId: fichaId, entidadeLabel: 'Devolução em garantia ↔ garantia',
        detalhes: { garantiaIds: b.garantiaIds || null, motivo: b.motivo || null, resultado: rv },
      });
      return NextResponse.json(rv, { status: rv.migracaoFaltando ? 503 : rv.ok ? 200 : 400 });
    }
    if (b.acao === 'faturar') {
      if (!b.fichaId) return NextResponse.json({ erro: 'Informe a devolução.' }, { status: 400 });
      r = await faturarRetorno(String(b.fichaId), quem, b.ajustes && typeof b.ajustes === 'object' ? b.ajustes : null);
    } else if (b.acao === 'emitir') {
      const conta = contaDe(b.conta);
      const idReceb = Number(b.idReceb);
      if (!conta || !idReceb) return NextResponse.json({ erro: 'Informe a empresa e a nota.' }, { status: 400 });
      const escolha = (Array.isArray(b.escolha) ? b.escolha : []).map((e: { seq: unknown; qtd: unknown }) => ({ seq: Number(e.seq), qtd: Number(e.qtd) }));
      r = await emitirRetorno({
        conta, idReceb, escolha, texto: String(b.texto || ''), frete: b.frete || undefined,
        categoria: b.categoria ? String(b.categoria) : null, garantiaId: b.garantiaId ? String(b.garantiaId) : null,
        garantiaIds: Array.isArray(b.garantiaIds) ? b.garantiaIds.map(String) : null,
        userId: g.user.id, userNome: quem, ajustes: b.ajustes && typeof b.ajustes === 'object' ? b.ajustes : null,
      });
    } else {
      return NextResponse.json({ erro: 'Ação desconhecida.' }, { status: 400 });
    }
    await registrarAuditLog({
      userId: g.user.id, userName: quem, sistema: 'recebimentos',
      acao: r.ok ? 'devolucao_garantia_emitida' : 'devolucao_garantia_falhou',
      entidade: 'recebimento_nfe', entidadeId: String(b.idReceb || b.fichaId || ''),
      entidadeLabel: `Devolução em garantia${r.nf ? ` — NF ${r.nf}` : ''}`,
      detalhes: { acao: b.acao, conta: b.conta, escolha: b.escolha, garantiaId: b.garantiaId || null, ajustes: b.ajustes || null, resultado: r },
    });
    if (r.migracaoFaltando) return NextResponse.json(r, { status: 503 });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as { faultstring?: string }).faultstring || (e as Error).message }, { status: 500 });
  }
}
