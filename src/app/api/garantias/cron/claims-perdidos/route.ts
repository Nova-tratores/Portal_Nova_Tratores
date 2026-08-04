import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import { TBL_GARANTIAS } from '@/lib/garantias/constants';
import { registrarEvento } from '@/lib/garantias/server';
import { filtrarDestinatarios } from '@/lib/notif/prefs';

// Varredura de CLAIMS PERDIDOS (rede de segurança, 04/08/2026): o app cria a
// solicitação de garantia no envio do relatório, mas envio OFFLINE (fila) ou
// falha silenciosa deixavam a OS marcada garantia SEM claim — invisível pro
// garantista (caso real: OS-0633). Aqui: relatórios com Garantia dos últimos
// 14 dias sem claim ativo → cria o claim (peças entram depois pelo auto-sync).
// Auth: Bearer CRON_SECRET (workflow) — curl dos workflows é GET.
export async function POST(req: NextRequest) {
  // aceita os dois formatos usados pelos workflows do repo
  const bearer = req.headers.get('authorization') || '';
  const headerSecret = req.headers.get('x-cron-secret') || '';
  if (bearer !== `Bearer ${process.env.CRON_SECRET}` && headerSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const corte = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const { data: tecs } = await supabase
    .from('Ordem_Servico_Tecnicos')
    .select('Ordem_Servico, TecResp1, Chassis, TotalHora, TotalKm, Data, Status')
    .or('Garantia.eq.true,TipoServico.ilike.*garantia*')
    .gte('Data', corte)
    .order('IdOs', { ascending: false })
    .limit(200);

  const porOS = new Map<string, Record<string, unknown>>();
  for (const t of tecs || []) {
    const os = String(t.Ordem_Servico || '');
    if (os && !porOS.has(os) && String(t.Status || '').toLowerCase() === 'enviado') porOS.set(os, t);
  }
  if (porOS.size === 0) return NextResponse.json({ ok: true, criadas: 0, motivo: 'nenhum relatório garantia na janela' });

  const ids = [...porOS.keys()];
  const { data: claims } = await supabase
    .from(TBL_GARANTIAS)
    .select('id_ordem, status')
    .in('id_ordem', ids);
  // qualquer claim (ativo OU finalizado) conta como "já tratado" — recriar um
  // aprovado/rejeitado seria reabrir uma decisão do garantista
  const comClaim = new Set((claims || []).map((c) => c.id_ordem));

  const criadas: string[] = [];
  for (const [idOrdem, tec] of porOS) {
    if (comClaim.has(idOrdem)) continue;

    const { data: osRow } = await supabase
      .from('Ordem_Servico')
      .select('Os_Cliente, Projeto, ID_PPV, Status')
      .eq('Id_Ordem', idOrdem)
      .maybeSingle();
    if (!osRow) continue;
    if (/cancelada/i.test(String(osRow.Status || ''))) continue; // OS cancelada não vira claim

    const { data: g, error } = await supabase
      .from(TBL_GARANTIAS)
      .insert({
        id_ordem: idOrdem,
        tecnico_nome: String(tec.TecResp1 || 'Técnico'),
        cliente: osRow.Os_Cliente || null,
        modelo: osRow.Projeto || null,
        chassis: tec.Chassis || null,
        ppv_ids: osRow.ID_PPV || null,
        tecnico_horas: Number(tec.TotalHora) || 0,
        tecnico_km: Number(tec.TotalKm) || 0,
        tecnico_obs: 'Claim criado pela varredura automática (o app não criou no envio do relatório).',
        status: 'aberta',
      })
      .select('id, numero')
      .single();
    if (error || !g) {
      console.warn(`[claims-perdidos] falhou criar p/ ${idOrdem}:`, error?.message);
      continue;
    }
    criadas.push(`${idOrdem} → ${g.numero}`);

    await registrarEvento(g.id, {
      tipo: 'criada',
      statusNovo: 'aberta',
      ator: 'sistema (varredura)',
      detalhe: `Garantia ${g.numero} criada pela varredura — o relatório da ${idOrdem} veio marcado garantia mas o claim não tinha nascido (envio offline/falha do app).`,
    });

    try {
      const { data: admins } = await supabase
        .from('portal_permissoes')
        .select('user_id, categoria, notif_silenciado')
        .eq('is_admin', true);
      const destinos = filtrarDestinatarios('garantias', admins || []);
      if (destinos.length) {
        await supabase.from('portal_notificacoes').insert(
          destinos.map((user_id) => ({
            user_id,
            tipo: 'garantia',
            titulo: `Nova requisição de garantia — ${g.numero}`,
            descricao: `${idOrdem} · ${osRow.Os_Cliente || ''} (claim recuperado pela varredura)`,
            link: '/garantias',
          })),
        );
      }
    } catch { /* best-effort */ }
  }

  return NextResponse.json({ ok: true, criadas: criadas.length, detalhe: criadas });
}

// os workflows chamam com GET (curl sem -X)
export { POST as GET };
