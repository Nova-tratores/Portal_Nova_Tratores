import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import { TBL_GARANTIAS, TBL_GAR_ANEXOS } from '@/lib/garantias/constants';
import { registrarEvento, notificarGarantistas } from '@/lib/garantias/server';

// PATCH /api/garantias/[id]/devolucao — devolução das peças usadas à fábrica
// (prova de destruição). Pendência anexa à garantia APROVADA (padrão cobrança).
// Ações (body.acao):
//   "registrar"  → dá baixa no envio (NF/transportadora/rastreio/obs) → 'enviada'
//   "prazo"      → ajusta devolucao_prazo (rearma o alerta)
//   "dispensar"  → fábrica dispensou → 'dispensada' (reversível via reabrir)
//   "reabrir"    → 'enviada' ou 'dispensada' volta pra 'pendente'
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const acao = String(body.acao || '');
  const ator = body.ator || 'Garantista';

  const { data: g, error: gErr } = await supabase
    .from(TBL_GARANTIAS)
    .select('id, numero, id_ordem, status, devolucao_status, devolucao_prazo')
    .eq('id', id)
    .maybeSingle();
  if (gErr) {
    // Coluna devolucao_status inexistente = migration pendente — erro claro,
    // não um 404 enganoso.
    console.error('Erro ao carregar devolução:', gErr.message);
    return NextResponse.json(
      { error: 'Falha ao carregar a devolução (migration sql/add-garantia-devolucao-pecas.sql pendente?).' },
      { status: 500 }
    );
  }
  if (!g) return NextResponse.json({ error: 'Garantia não encontrada.' }, { status: 404 });
  if (g.status !== 'aprovada') {
    return NextResponse.json(
      { error: 'A devolução de peças só existe em garantias aprovadas.' },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const update: Record<string, unknown> = { updated_at: now };
  let detalhe = '';

  if (acao === 'registrar') {
    if (g.devolucao_status !== 'pendente') {
      return NextResponse.json({ error: 'Esta garantia não tem devolução pendente.' }, { status: 400 });
    }
    const nf = String(body.nf || '').trim();
    // Registro sem NF exige ao menos o comprovante anexado — senão a "prova
    // de destruição" vira um clique vazio.
    if (!nf) {
      const { data: anexos } = await supabase
        .from(TBL_GAR_ANEXOS)
        .select('id')
        .eq('garantia_id', id)
        .eq('categoria', 'devolucao_pecas')
        .limit(1);
      if (!anexos || anexos.length === 0) {
        return NextResponse.json(
          { error: 'Informe a NF de remessa ou anexe o comprovante do envio antes de registrar.' },
          { status: 400 }
        );
      }
    }
    update.devolucao_status = 'enviada';
    update.devolucao_enviada_em = now;
    update.devolucao_nf = nf || null;
    update.devolucao_transportadora = String(body.transportadora || '').trim() || null;
    update.devolucao_rastreio = String(body.rastreio || '').trim() || null;
    update.devolucao_obs = String(body.obs || '').trim() || null;
    detalhe = `Peças devolvidas à fábrica${nf ? ` — NF ${nf}` : ''}${body.transportadora ? ` · ${String(body.transportadora).trim()}` : ''}`;
  } else if (acao === 'prazo') {
    if (g.devolucao_status !== 'pendente') {
      return NextResponse.json({ error: 'Esta garantia não tem devolução pendente.' }, { status: 400 });
    }
    const prazo = String(body.prazo || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(prazo)) {
      return NextResponse.json({ error: 'Informe o prazo no formato de data.' }, { status: 400 });
    }
    // Guarda otimista: se outro usuário já mudou o prazo com este drawer
    // aberto, avisa em vez de reverter em silêncio.
    if (body.prazo_anterior !== undefined && (body.prazo_anterior || null) !== (g.devolucao_prazo || null)) {
      const atual = g.devolucao_prazo ? g.devolucao_prazo.split('-').reverse().join('/') : 'sem prazo';
      return NextResponse.json(
        { error: `O prazo foi alterado por outra pessoa (agora é ${atual}). Recarregue o card e tente de novo.` },
        { status: 409 }
      );
    }
    update.devolucao_prazo = prazo;
    update.devolucao_alertado_em = null; // rearma o alerta pro prazo novo
    detalhe = `Prazo da devolução ajustado para ${prazo.split('-').reverse().join('/')}`;
  } else if (acao === 'dispensar') {
    if (g.devolucao_status !== 'pendente') {
      return NextResponse.json({ error: 'Esta garantia não tem devolução pendente.' }, { status: 400 });
    }
    // 'dispensada' (e não 'nao_aplicavel') pra dispensa por engano ter volta —
    // reabrir de 'nao_aplicavel' abriria devolução em qualquer aprovada.
    update.devolucao_status = 'dispensada';
    detalhe = `Fábrica dispensou a devolução das peças${body.motivo ? ` — ${String(body.motivo).trim().slice(0, 140)}` : ''}`;
  } else if (acao === 'reabrir') {
    if (g.devolucao_status !== 'enviada' && g.devolucao_status !== 'dispensada') {
      return NextResponse.json({ error: 'Só dá pra reabrir uma devolução registrada ou dispensada.' }, { status: 400 });
    }
    const veioDeDispensa = g.devolucao_status === 'dispensada';
    update.devolucao_status = 'pendente';
    update.devolucao_enviada_em = null;
    update.devolucao_alertado_em = null;
    // Dispensa desfeita com prazo ausente/vencido: repõe 30 dias (data em BRT)
    // pra pendência não renascer já vencida.
    const hojeBRT = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
    if (veioDeDispensa && (!g.devolucao_prazo || g.devolucao_prazo < hojeBRT)) {
      update.devolucao_prazo = new Date(Date.now() - 3 * 3600000 + 30 * 86400000).toISOString().slice(0, 10);
    }
    detalhe = veioDeDispensa
      ? 'Dispensa da devolução desfeita — pendência reativada'
      : 'Registro da devolução reaberto';
  } else {
    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from(TBL_GARANTIAS)
    .update(update)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error('Erro na devolução de peças:', error.message);
    return NextResponse.json({ error: 'Falha ao atualizar a devolução.' }, { status: 500 });
  }

  await registrarEvento(id, {
    tipo: `devolucao_${acao}`,
    ator,
    detalhe,
  });
  if (acao === 'registrar') {
    await notificarGarantistas({
      titulo: `Peças da garantia ${g.numero} devolvidas à fábrica`,
      descricao: `OS ${g.id_ordem}${body.nf ? ` · NF ${String(body.nf).trim()}` : ''}`,
      link: `/garantias?id=${id}`,
    });
  }

  return NextResponse.json({ ok: true, garantia: data });
}
