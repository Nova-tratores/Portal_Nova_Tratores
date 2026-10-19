import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import { TBL_GARANTIAS, TBL_GAR_ANEXOS, GUARDA_DIAS_PADRAO } from '@/lib/garantias/constants';
import { registrarEvento, notificarGarantistas } from '@/lib/garantias/server';
import { diasAte } from '@/lib/garantias/format';

// PATCH /api/garantias/[id]/guarda — guarda das peças antes do descarte
// (padrão da empresa, todas as montadoras). Pendência anexa à garantia
// APROVADA, molde da devolução de peças. Ações (body.acao):
//   "abrir"     → inicia a guarda numa aprovada antiga (nao_aplicavel → pendente)
//   "prazo"     → ajusta guarda_prazo (rearma o aviso de descarte liberado)
//   "descartar" → registra o descarte (exige foto da destruição OU observação)
//   "dispensar" → guarda dispensada (ex.: peças foram pro cliente) — reversível
//   "reabrir"   → 'descartada' ou 'dispensada' volta pra 'pendente'
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const acao = String(body.acao || '');
  const ator = body.ator || 'Garantista';

  const { data: g, error: gErr } = await supabase
    .from(TBL_GARANTIAS)
    .select('id, numero, id_ordem, status, devolucao_status, guarda_status, guarda_prazo, localizacao')
    .eq('id', id)
    .maybeSingle();
  if (gErr) {
    // Coluna guarda_status inexistente = migration pendente — erro claro,
    // não um 404 enganoso.
    console.error('Erro ao carregar guarda de peças:', gErr.message);
    return NextResponse.json(
      { error: 'Falha ao carregar a guarda (migration sql/add-garantia-guarda-pecas.sql pendente?).' },
      { status: 500 }
    );
  }
  if (!g) return NextResponse.json({ error: 'Garantia não encontrada.' }, { status: 404 });
  if (g.status !== 'aprovada') {
    return NextResponse.json(
      { error: 'A guarda de peças só existe em garantias aprovadas.' },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  // Data em BRT (-3h antes do slice UTC), senão agir à noite grava D+1.
  const prazoPadrao = new Date(Date.now() - 3 * 3600000 + GUARDA_DIAS_PADRAO * 86400000)
    .toISOString()
    .slice(0, 10);
  const update: Record<string, unknown> = { updated_at: now };
  let detalhe = '';

  if (acao === 'abrir') {
    // Backfill manual: aprovada finalizada antes da feature (ou que teve a
    // guarda desligada na finalização) passa a guardar as peças.
    if (g.guarda_status !== 'nao_aplicavel') {
      return NextResponse.json({ error: 'Esta garantia já tem guarda de peças.' }, { status: 400 });
    }
    if (g.devolucao_status === 'pendente' || g.devolucao_status === 'enviada') {
      return NextResponse.json(
        { error: 'As peças desta garantia vão (ou foram) devolvidas à fábrica — não há o que guardar.' },
        { status: 400 }
      );
    }
    update.guarda_status = 'pendente';
    update.guarda_prazo = prazoPadrao;
    detalhe = `Guarda de peças iniciada — descarte liberado a partir de ${prazoPadrao.split('-').reverse().join('/')}`;
  } else if (acao === 'prazo') {
    if (g.guarda_status !== 'pendente') {
      return NextResponse.json({ error: 'Esta garantia não tem peças em guarda.' }, { status: 400 });
    }
    const prazo = String(body.prazo || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(prazo)) {
      return NextResponse.json({ error: 'Informe o prazo no formato de data.' }, { status: 400 });
    }
    // Guarda otimista (mesmo padrão da devolução): outro usuário mudou o prazo
    // com este drawer aberto → avisa em vez de reverter em silêncio.
    if (body.prazo_anterior !== undefined && (body.prazo_anterior || null) !== (g.guarda_prazo || null)) {
      const atual = g.guarda_prazo ? g.guarda_prazo.split('-').reverse().join('/') : 'sem prazo';
      return NextResponse.json(
        { error: `O prazo foi alterado por outra pessoa (agora é ${atual}). Recarregue o card e tente de novo.` },
        { status: 409 }
      );
    }
    update.guarda_prazo = prazo;
    update.guarda_alertado_em = null; // rearma o aviso pro prazo novo
    detalhe = `Prazo da guarda ajustado — descarte liberado a partir de ${prazo.split('-').reverse().join('/')}`;
  } else if (acao === 'descartar') {
    if (g.guarda_status !== 'pendente') {
      return NextResponse.json({ error: 'Esta garantia não tem peças em guarda.' }, { status: 400 });
    }
    const obs = String(body.obs || '').trim();
    // Prova do descarte: foto/vídeo anexado (categoria descarte_pecas) ou, no
    // mínimo, uma observação dizendo como foi — senão vira um clique vazio.
    const { data: provas } = await supabase
      .from(TBL_GAR_ANEXOS)
      .select('id')
      .eq('garantia_id', id)
      .eq('categoria', 'descarte_pecas')
      .limit(1);
    if ((!provas || provas.length === 0) && !obs) {
      return NextResponse.json(
        { error: 'Anexe a foto/vídeo do descarte ou descreva como foi feito antes de registrar.' },
        { status: 400 }
      );
    }
    // Descarte antes do prazo só com confirmação explícita do cliente (confirm
    // na tela) — o prazo existe pra fábrica poder pedir a peça de volta.
    const dias = diasAte(g.guarda_prazo);
    if (dias != null && dias > 0 && body.confirma_antecipado !== true) {
      return NextResponse.json(
        {
          error: `O prazo de guarda só termina em ${g.guarda_prazo!.split('-').reverse().join('/')} (faltam ${dias} dia(s)). Confirme o descarte antecipado.`,
          antecipado: true,
        },
        { status: 409 }
      );
    }
    update.guarda_status = 'descartada';
    update.guarda_descartada_em = now;
    update.guarda_obs = obs || null;
    detalhe = `Peças descartadas${dias != null && dias > 0 ? ' (ANTES do fim do prazo de guarda)' : ''}${obs ? ` — ${obs.slice(0, 140)}` : ''}`;
  } else if (acao === 'dispensar') {
    if (g.guarda_status !== 'pendente') {
      return NextResponse.json({ error: 'Esta garantia não tem peças em guarda.' }, { status: 400 });
    }
    // 'dispensada' (e não 'nao_aplicavel') pra dispensa por engano ter volta.
    update.guarda_status = 'dispensada';
    detalhe = `Guarda de peças dispensada${body.motivo ? ` — ${String(body.motivo).trim().slice(0, 140)}` : ''}`;
  } else if (acao === 'reabrir') {
    if (g.guarda_status !== 'descartada' && g.guarda_status !== 'dispensada') {
      return NextResponse.json({ error: 'Só dá pra reabrir uma guarda descartada ou dispensada.' }, { status: 400 });
    }
    const veioDeDispensa = g.guarda_status === 'dispensada';
    update.guarda_status = 'pendente';
    update.guarda_descartada_em = null;
    update.guarda_alertado_em = null;
    // Sem prazo (nunca teve) repõe o padrão; prazo vencido NÃO é problema na
    // guarda — vencido significa "pode descartar", não atraso.
    if (!g.guarda_prazo) update.guarda_prazo = prazoPadrao;
    detalhe = veioDeDispensa
      ? 'Dispensa da guarda desfeita — peças voltam a ficar guardadas'
      : 'Registro de descarte reaberto — peças voltam a ficar guardadas';
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
    console.error('Erro na guarda de peças:', error.message);
    return NextResponse.json({ error: 'Falha ao atualizar a guarda de peças.' }, { status: 500 });
  }

  await registrarEvento(id, {
    tipo: `guarda_${acao}`,
    ator,
    detalhe,
  });
  if (acao === 'descartar') {
    await notificarGarantistas({
      titulo: `Peças da garantia ${g.numero} descartadas`,
      descricao: `OS ${g.id_ordem}${g.localizacao ? ` · estavam em ${g.localizacao}` : ''} — guarda encerrada.`,
      link: `/garantias?id=${id}`,
    });
  }

  return NextResponse.json({ ok: true, garantia: data });
}
