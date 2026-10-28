import { NextRequest, NextResponse } from 'next/server';
import { protegerRota } from '@/lib/ajustes/permissao-server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { chegadasDesde, colocarNoControle, limparCacheVendidos, tratoresNoPatio, tratoresVendidos, tratoresVendidosRapido } from '@/lib/revisoes/vendidos-server';
import { sincronizarSeVelho } from '@/lib/mahindra/portal-dealer-server';

export const dynamic = 'force-dynamic';

// GET /api/revisoes/vendidos?meses=6&seminovos=0&patio=1
// Tratores vendidos (notas de "Trator Novo") com cliente, onde fica, nota, chegada da
// fábrica e o controle de revisões — telas /revisoes/vendidos e /feedbacks/tratores.
// patio=1 junta os tratores novos no estoque e quantos chegaram no período; patio=1 ou mahindra=1 relê os certificados da Mahindra se tiverem mais de 12 h. Só leitura;
// módulo Revisões ou Feedbacks (o Radar de tratores fica no Feedbacks).
// POST { chave, meses?, seminovos? } → coloca/completa o trator no controle de
// revisões (`tratores`), mesma permissão do "+ Novo Trator" (revisoes:tratores).

function desdeDe(meses: number): string {
  const d = new Date(Date.now() - 3 * 3_600_000);
  d.setUTCMonth(d.getUTCMonth() - meses);
  return d.toISOString().slice(0, 10);
}
// até 10 anos: o Radar Tratores mostra TODOS os vendidos (José, 28/10/2026: "tem que aparecer todos que foram vendidos e não foram agendadas as revisões")
const mesesDe = (v: unknown) => Math.min(120, Math.max(1, Number(v) || 6));

export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'revisoes' }, { modulo: 'feedbacks' }]);
  if (g.resposta) return g.resposta;
  const p = req.nextUrl.searchParams;
  try {
    const meses = mesesDe(p.get('meses'));
    const desde = desdeDe(meses);
    const comPatio = p.get('patio') === '1';
    // certificados da Mahindra (entrega técnica): relê em segundo plano se tiver mais de 12 h
    if (comPatio || p.get('mahindra') === '1') void sincronizarSeVelho().catch(() => null);
    const [tratores, patio, chegadas] = await Promise.all([
      tratoresVendidosRapido(desde, p.get('seminovos') === '1'),
      comPatio ? tratoresNoPatio().catch(() => null) : Promise.resolve(undefined),
      comPatio ? chegadasDesde(desde).catch(() => null) : Promise.resolve(undefined),
    ]);
    return NextResponse.json({ ok: true, meses, desde, tratores, patio, chegadas });
  } catch (e) {
    const erro = e instanceof Error ? e.message : String((e as { message?: string })?.message || e);
    return NextResponse.json({ ok: false, erro }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'revisoes', acao: 'tratores' }]);
  if (g.resposta) return g.resposta;
  const body = await req.json().catch(() => ({}));
  const chave = String(body?.chave || '');
  if (!chave) return NextResponse.json({ ok: false, erro: 'Falta o trator.' }, { status: 400 });
  try {
    // relê do banco (nunca confia nos dados vindos da tela)
    const lista = await tratoresVendidos(desdeDe(mesesDe(body?.meses)), body?.seminovos === true || body?.seminovos === '1');
    const t = lista.find((x) => x.chave === chave);
    if (!t) return NextResponse.json({ ok: false, erro: 'Não achei esse trator nas vendas.' }, { status: 404 });
    const r = await colocarNoControle(t);
    limparCacheVendidos();
    await supabaseAdmin.from('audit_log').insert({
      sistema: 'revisoes', acao: r.criado ? 'criar' : 'editar', entidade: 'trator', entidade_id: r.id,
      entidade_label: `${t.modelo} - ${t.chassi}`, user_id: g.user.id, user_nome: g.user.nome || g.user.email || '—',
      detalhes: { origem: 'tratores-vendidos', pedido: t.pedido, empresa: t.empresa, preenchidos: r.preenchidos },
    }).then(() => null, () => null);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    const erro = e instanceof Error ? e.message : String((e as { message?: string })?.message || e);
    return NextResponse.json({ ok: false, erro }, { status: 500 });
  }
}
