import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import { TBL_GARANTIAS } from '@/lib/garantias/constants';
import { camposObrigatoriosFaltando } from '@/lib/garantias/checklist';
import { registrarEvento, notificarTecnico } from '@/lib/garantias/server';
import type { ChecklistField } from '@/lib/garantias/types';

// POST /api/garantias/[id]/enviar-fabrica
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const { data: g } = await supabase
    .from(TBL_GARANTIAS)
    .select('id, numero, status, id_ordem, tecnico_nome, montadora_id, checklist_snapshot, checklist_respostas, montadora:garantia_montadoras(tipo_template, auto_enviar_email, email_destinatarios)')
    .eq('id', id)
    .maybeSingle();
  if (!g) return NextResponse.json({ error: 'Garantia não encontrada.' }, { status: 404 });

  if (g.status !== 'em_analise') {
    return NextResponse.json(
      { error: 'A garantia precisa estar em análise para ser enviada à fábrica.' },
      { status: 400 }
    );
  }
  if (!g.montadora_id) {
    return NextResponse.json({ error: 'Defina a montadora antes de enviar à fábrica.' }, { status: 400 });
  }

  const faltando = camposObrigatoriosFaltando(
    (g.checklist_snapshot as ChecklistField[]) || [],
    (g.checklist_respostas as Record<string, unknown>) || {}
  );
  if (faltando.length > 0) {
    return NextResponse.json(
      { error: `Preencha os campos obrigatórios do checklist: ${faltando.join(', ')}` },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from(TBL_GARANTIAS)
    .update({
      status: 'enviada',
      enviada_fabrica_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error('Erro ao enviar à fábrica:', error.message);
    return NextResponse.json({ error: 'Falha ao enviar à fábrica.' }, { status: 500 });
  }

  await registrarEvento(id, {
    tipo: 'enviada_fabrica',
    statusAnterior: 'em_analise',
    statusNovo: 'enviada',
    ator: body.garantista_nome || 'Garantista',
    detalhe: 'Garantia enviada para análise da fábrica',
  });
  await notificarTecnico(g.tecnico_nome, {
    titulo: `Garantia ${g.numero} enviada à fábrica`,
    descricao: `A garantia da OS ${g.id_ordem} está em análise da fábrica.`,
  });

  // Auto-envia o SG por e-mail se a montadora está configurada para isso (best-effort)
  type MontadoraEnvio = { tipo_template?: string; auto_enviar_email?: boolean; email_destinatarios?: string[] };
  const mont = (g as unknown as { montadora?: MontadoraEnvio | MontadoraEnvio[] }).montadora;
  const m = Array.isArray(mont) ? mont[0] : mont;
  let sgEnvio: { ok?: boolean; erro?: string } | undefined;
  if (m?.auto_enviar_email && m.tipo_template === 'mahindra' && (m.email_destinatarios || []).length > 0) {
    try {
      const origin = req.nextUrl.origin;
      const sgRes = await fetch(`${origin}/api/garantias/${id}/enviar-sg`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ator: body.garantista_nome || 'Garantista' }),
      });
      const sgData = await sgRes.json().catch(() => ({}));
      sgEnvio = sgRes.ok ? { ok: true } : { erro: sgData.error || 'Falha no envio do SG' };
    } catch (err) {
      sgEnvio = { erro: err instanceof Error ? err.message : 'Falha no envio do SG' };
      console.error('Falha no envio automático do SG:', err);
    }
  }

  return NextResponse.json({ garantia: data, sgEnvio });
}
