// ABATE AUTOMÁTICO das unidades rastreadas (11/08/2026): quando o técnico
// envia o relatório da OS marcando quais peças usou/não usou (PecasInfo),
// as unidades retiradas pra aquela OS transicionam sozinhas:
//   usada               -> 'aplicada'            (responsabilidade vira do cliente)
//   não usada/devolvida -> 'devolucao_pendente'  (balcão confere a volta)
//
// Idempotente: só mexe em unidades 'liberada'; sobras (relatório não menciona
// o código) ficam liberadas com evento-alerta registrado UMA vez. Relatório
// re-editado depois do abate = correção manual (ação 'devolver' na página).
// Auth: Bearer CRON_SECRET ou x-cron-secret (workflow pecas-abate.yml).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import { transicionar, notificarResponsaveisPecas } from '@/lib/pecas/unidades-server';
import { norm, type PecaUnidade } from '@/lib/pecas/unidades';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SISTEMA = { id: null, nome: 'sistema (relatório da OS)' };

export async function POST(req: NextRequest) {
  const bearer = req.headers.get('authorization') || '';
  const headerSecret = req.headers.get('x-cron-secret') || '';
  if (bearer !== `Bearer ${process.env.CRON_SECRET}` && headerSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  // 150 por rodada: cada transição custa ~4 idas ao banco e o maxDuration é
  // 60s — o cron roda a cada 30min, o excedente entra na próxima rodada (FIFO)
  const { data: liberadas } = await supabase
    .from('peca_unidades')
    .select('*')
    .eq('status', 'liberada')
    .eq('destino_tipo', 'os')
    .not('destino_os', 'is', null)
    .order('retirado_em', { ascending: true })
    .limit(150);
  const unidades = (liberadas || []) as PecaUnidade[];
  if (unidades.length === 0) return NextResponse.json({ ok: true, aplicadas: 0, devolucoes: 0 });

  const porOS = new Map<string, PecaUnidade[]>();
  for (const u of unidades) {
    const os = String(u.destino_os);
    if (!porOS.has(os)) porOS.set(os, []);
    porOS.get(os)!.push(u);
  }

  let aplicadas = 0;
  let devolucoes = 0;
  const semCorrespondencia: string[] = [];

  // relatórios enviados de TODAS as OSs da rodada numa query só (o loop por
  // OS fazia N queries e estourava o maxDuration com muitas unidades)
  const relatorioPorOS = new Map<string, any>();
  {
    const oss = [...porOS.keys()];
    for (let i = 0; i < oss.length; i += 80) {
      const { data: tecs } = await supabase
        .from('Ordem_Servico_Tecnicos')
        .select('Ordem_Servico, IdOs, Status, PecasInfo')
        .in('Ordem_Servico', oss.slice(i, i + 80))
        .order('IdOs', { ascending: false });
      for (const t of (tecs || []) as any[]) {
        const os = String(t.Ordem_Servico || '');
        if (!relatorioPorOS.has(os) && String(t.Status || '').toLowerCase() === 'enviado') relatorioPorOS.set(os, t);
      }
    }
  }

  // unidades já avisadas de "sem correspondência" (evita 1 SELECT por unidade
  // a cada rodada — as sobras ficam liberadas indefinidamente)
  const jaAvisadas = new Set<string>();
  {
    const ids = unidades.map((u) => u.id);
    for (let i = 0; i < ids.length; i += 100) {
      const { data: avisos } = await supabase
        .from('peca_unidade_eventos')
        .select('unidade_id')
        .in('unidade_id', ids.slice(i, i + 100))
        .eq('tipo', 'observacao')
        .contains('payload', { alerta: 'sem_correspondencia_relatorio' });
      for (const a of avisos || []) jaAvisadas.add((a as any).unidade_id);
    }
  }

  for (const [os, lista] of porOS) {
    const tec = relatorioPorOS.get(os);
    if (!tec) continue; // sem relatório enviado ainda

    let pecas: any[] = [];
    try {
      const parsed = JSON.parse((tec as any).PecasInfo || '[]');
      if (Array.isArray(parsed)) pecas = parsed;
    } catch { continue; } // PecasInfo inválido: pula a OS

    // agrega quantidades por código normalizado
    // semântica (confirmada em lib/pos/atualizar-relatorio.ts): com naoUsada,
    // qtdUsada carrega a quantidade a devolver; devolvida usa qtdDevolvida.
    const usadasPor = new Map<string, number>();
    const devolverPor = new Map<string, number>();
    const soma = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) || 0) + v);
    for (const p of pecas) {
      const cod = norm(p?.codigo);
      if (!cod) continue;
      // "1 por padrão" só quando o CAMPO está ausente/vazio — qtdUsada
      // explicitamente 0 (técnico zerou a quantidade) NÃO pode virar 1,
      // senão a unidade é aplicada/cobrada com a peça ainda no caminhão.
      const brutoUsada = p?.qtdUsada;
      const temQtdUsada = brutoUsada !== undefined && brutoUsada !== null && String(brutoUsada).trim() !== '';
      const qtdUsada = temQtdUsada ? Math.max(0, parseFloat(brutoUsada) || 0) : 1;
      const qtdDevolvida = Math.max(0, parseFloat(p?.qtdDevolvida) || 0);
      if (p?.naoUsada === true) {
        soma(devolverPor, cod, qtdUsada);
      } else if (p?.devolvida === true) {
        soma(devolverPor, cod, qtdDevolvida);
        soma(usadasPor, cod, Math.max(0, qtdUsada - qtdDevolvida));
      } else {
        soma(usadasPor, cod, qtdUsada);
      }
    }

    // distribui unidade↔quantidade por código, FIFO por retirado_em
    // (a query já veio ordenada por retirado_em asc)
    let devolucoesNestaOS = 0;
    for (const u of lista) {
      const codigos = [norm(u.codigo), norm(u.alt_codigo)].filter(Boolean);
      const codRelatorio = codigos.find((c) => (usadasPor.get(c) || 0) >= 1 || (devolverPor.get(c) || 0) >= 1);

      if (!codRelatorio) {
        // relatório não menciona (ou quantidade esgotou) — alerta UMA vez
        semCorrespondencia.push(`${u.numero} (${u.codigo}) na ${os}`);
        if (!jaAvisadas.has(u.id)) {
          jaAvisadas.add(u.id);
          await supabase.from('peca_unidade_eventos').insert({
            unidade_id: u.id,
            autor_id: null,
            autor_nome: SISTEMA.nome,
            tipo: 'observacao',
            payload: { alerta: 'sem_correspondencia_relatorio', os },
          });
        }
        continue;
      }

      if ((usadasPor.get(codRelatorio) || 0) >= 1) {
        soma(usadasPor, codRelatorio, -1);
        try {
          await transicionar(u.id, 'aplicar_cron', SISTEMA, { payload: { origem: 'cron', os, codigo: codRelatorio } });
          aplicadas++;
        } catch { /* concorrência — próximo ciclo pega */ }
      } else {
        soma(devolverPor, codRelatorio, -1);
        try {
          await transicionar(u.id, 'devolver_cron', SISTEMA, {
            motivo: 'relatório do técnico: não usada/devolvida',
            payload: { origem: 'cron', os, codigo: codRelatorio },
          });
          devolucoes++;
          devolucoesNestaOS++;
        } catch { /* idem */ }
      }
    }

    if (devolucoesNestaOS > 0) {
      await notificarResponsaveisPecas({
        titulo: `${os}: ${devolucoesNestaOS} unidade(s) para conferir devolução`,
        descricao: 'O relatório do técnico marcou peça(s) como não usada/devolvida.',
        link: '/ppv/unidades',
      });
    }
  }

  return NextResponse.json({ ok: true, aplicadas, devolucoes, sem_correspondencia: semCorrespondencia });
}

// os workflows chamam com GET (curl sem -X)
export { POST as GET };
