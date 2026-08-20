// REVISÕES/INSPEÇÃO — registro MANUAL de envio.
//
// Para revisão que já foi enviada POR FORA do portal (Gmail direto, WhatsApp,
// entregue em mãos): grava a linha em revisao_emails / inspecao_emails com a
// flag registro_manual, SEM disparar e-mail nenhum. A timeline passa a mostrar
// "Notificado (manual)" e a pendência Mahindra da OS é liberada, igual ao
// envio de verdade.
//
//   POST   { tipo: 'revisao'|'inspecao', chassis, horas?|horimetro?, modelo?,
//            cliente?, data?, obs? }
//   DELETE { tipo, id }  → desfaz (SÓ registro manual; envio real é histórico)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { exigirPermissao } from '@/lib/ajustes/permissao-server';
import { registrarAuditLog } from '@/lib/server/audit-notify';
import { sanitizarFiltro } from '@/lib/busca-segura';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const limpar = (v: unknown, max = 120) => String(v ?? '').replace(/[<>&"']/g, '').trim().slice(0, max);
const tabelaDe = (tipo: string) => (tipo === 'inspecao' ? 'inspecao_emails' : 'revisao_emails');

export async function POST(req: NextRequest) {
  let quem;
  try {
    quem = await exigirPermissao(req, 'revisoes', 'enviar');
  } catch (e) {
    const st = (e as { http?: number })?.http || 401;
    return NextResponse.json({ error: e instanceof Error ? e.message : 'não autenticado' }, { status: st });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const tipo = body.tipo === 'inspecao' ? 'inspecao' : 'revisao';
    const chassis = limpar(body.chassis, 60);
    if (!chassis) return NextResponse.json({ error: 'Informe o chassi.' }, { status: 400 });

    const horas = limpar(body.horas, 10).replace(/\D/g, ''); // '50h' -> '50'
    if (tipo === 'revisao' && !horas) {
      return NextResponse.json({ error: 'Informe as horas da revisão.' }, { status: 400 });
    }

    const chassisFinal = chassis.slice(-4);
    const nome = quem.nome || quem.email || 'Usuário';
    // data do envio declarado (não pode ser no futuro); vazio = agora
    const dataInformada = String(body.data || '').trim();
    let enviadoEm = new Date().toISOString();
    if (/^\d{4}-\d{2}-\d{2}$/.test(dataInformada)) {
      const d = new Date(`${dataInformada}T12:00:00-03:00`);
      if (!Number.isNaN(d.getTime()) && d.getTime() <= Date.now()) enviadoEm = d.toISOString();
    }
    const obs = limpar(body.obs, 300);
    const rotulo = tipo === 'inspecao' ? 'Inspeção de pré-entrega' : `Revisão ${horas}h`;
    const assunto = `[REGISTRO MANUAL] ${rotulo} — ${chassis}`;

    const base: Record<string, unknown> = {
      chassis,
      chassis_final: chassisFinal,
      modelo: limpar(body.modelo, 80) || null,
      cliente: limpar(body.cliente, 120) || null,
      assunto,
      destinatarios: [],
      corpo: `<p>Registro manual: ${rotulo} enviada fora do portal.</p>`
        + `<p>Marcado por <strong>${nome}</strong>.</p>`
        + (obs ? `<p>Observação: ${obs}</p>` : ''),
      pdf_url: null,
      enviado_por: nome,
      enviado_em: enviadoEm,
      registro_manual: true,
      observacao_manual: obs || null,
    };
    if (tipo === 'revisao') base.horas = horas;
    else base.horimetro = limpar(body.horimetro, 10) || null;

    // Já existe registro pra esse chassi+revisão? (não duplica o selo)
    const jaTem = supabase.from(tabelaDe(tipo)).select('id, registro_manual').eq('chassis_final', chassisFinal);
    const { data: existentes } = await (tipo === 'revisao' ? jaTem.eq('horas', horas) : jaTem);
    if ((existentes || []).length > 0) {
      return NextResponse.json({ error: `${rotulo} já consta como enviada para este chassi.` }, { status: 409 });
    }

    let { data: inserido, error } = await supabase.from(tabelaDe(tipo)).insert(base).select('id').single();
    // migração ainda não rodou? grava sem as colunas novas (o assunto já marca
    // que é manual) pra não travar o uso
    if (error && /registro_manual|observacao_manual/i.test(error.message || '')) {
      delete base.registro_manual;
      delete base.observacao_manual;
      ({ data: inserido, error } = await supabase.from(tabelaDe(tipo)).insert(base).select('id').single());
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Mesmo efeito do envio real: libera a pendência Mahindra das OS abertas
    // desse chassi (a revisão existe, só não saiu por aqui).
    try {
      await supabase
        .from('Ordem_Servico')
        .update({ pendencia_mahindra: null })
        .or(`Projeto.ilike.%${sanitizarFiltro(chassis)}%,Serv_Solicitado.ilike.%${sanitizarFiltro(chassis)}%`)
        .not('Status', 'in', '("Concluída","Cancelada")');
    } catch { /* best-effort */ }

    try {
      await registrarAuditLog({
        userId: quem.id, userName: nome,
        sistema: 'revisoes', acao: 'marcar_enviada_manual', entidade: tipo === 'inspecao' ? 'inspecao' : 'revisao',
        entidadeId: String(inserido?.id || chassisFinal), entidadeLabel: `${rotulo} · ${chassis}`,
        detalhes: { chassis, tipo, horas: horas || null, enviado_em: enviadoEm, obs: obs || null },
      });
    } catch { /* best-effort */ }

    return NextResponse.json({ ok: true, id: inserido?.id ?? null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'erro' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  let quem;
  try {
    quem = await exigirPermissao(req, 'revisoes', 'enviar');
  } catch (e) {
    const st = (e as { http?: number })?.http || 401;
    return NextResponse.json({ error: e instanceof Error ? e.message : 'não autenticado' }, { status: st });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const tipo = body.tipo === 'inspecao' ? 'inspecao' : 'revisao';
    const id = String(body.id || '').trim();
    if (!id) return NextResponse.json({ error: 'Informe o registro.' }, { status: 400 });

    const { data: linha } = await supabase
      .from(tabelaDe(tipo))
      .select('id, chassis, assunto, registro_manual')
      .eq('id', id)
      .maybeSingle();
    if (!linha) return NextResponse.json({ error: 'Registro não encontrado.' }, { status: 404 });

    // trava: e-mail REAL enviado pelo portal é histórico, não se apaga por aqui
    const ehManual = (linha as any).registro_manual === true
      || /^\[REGISTRO MANUAL\]/i.test(String((linha as any).assunto || ''));
    if (!ehManual) {
      return NextResponse.json({ error: 'Este envio foi feito pelo portal — não dá pra desfazer.' }, { status: 400 });
    }

    const { error } = await supabase.from(tabelaDe(tipo)).delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    try {
      await registrarAuditLog({
        userId: quem.id, userName: quem.nome || quem.email || '',
        sistema: 'revisoes', acao: 'desfazer_marcacao_manual', entidade: tipo === 'inspecao' ? 'inspecao' : 'revisao',
        entidadeId: id, entidadeLabel: String((linha as any).assunto || id),
        detalhes: { chassis: (linha as any).chassis || null, tipo },
      });
    } catch { /* best-effort */ }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'erro' }, { status: 500 });
  }
}
