// Vigia de revisões — VARREDURA (banco). Regras puras em vigia-revisoes-regras.ts.
//
// Roda 1x por dia (cron GitHub Actions → /api/pos/cron/vigia-revisoes) e sob
// demanda pelo admin. Para cada OS da janela (últimos N dias, padrão 60) mais
// qualquer OS que já esteja marcada, recalcula a `pendencia_mahindra` (regra:
// OS de revisão FATURADA no Omie sem cheque enviado) — a mesma
// coluna que a checagem de criação usa, então a exclamação no card do /pos e a
// notificação continuam valendo sem tela nova. Pendência que apareceu agora
// notifica os admins; pendência resolvida some sozinha.
import { supabase } from '@/lib/pos/supabase';
import { TBL_OS } from '@/lib/pos/constants';
import { logAndNotify, notificarAdmins, registrarAuditLog } from '@/lib/server/audit-notify';
import { extrairChassis, extrairHorasRevisaoOS } from './extrairTrator';
import {
  avaliarOS, dataLimite, detalhesNovos, mesmaPendencia, normalizarHorasRevisao, osFaturada,
  JANELA_PADRAO_DIAS, type PendenciaVigia,
} from './vigia-revisoes-regras';

interface LinhaOS {
  Id_Ordem: string;
  Status: string | null;
  Data: string | null;
  Data_Fim_Servico: string | null;
  Projeto: string | null;
  Serv_Solicitado: string | null;
  Tipo_Servico: string | null;
  Revisao: string | null;
  Os_Cliente: string | null;
  Ordem_Omie: string | null;
  id_omie: number | string | null;
  pendencia_mahindra: PendenciaVigia | null;
}

export interface ItemVigia {
  id: string;
  cliente: string;
  status: string;
  faturada: boolean;
  data: string | null;
  dataFim: string | null;
  chassis: string;
  horas: number | null;
  detalhes: string[];
  nova: boolean;
}

export interface ResultadoVigia {
  janelaDias: number;
  analisadas: number;
  comPendencia: number;
  novas: number;
  limpas: number;
  itens: ItemVigia[];
}

const SELECT = 'Id_Ordem,Status,Data,Data_Fim_Servico,Projeto,Serv_Solicitado,Tipo_Servico,Revisao,Os_Cliente,Ordem_Omie,id_omie,pendencia_mahindra';

export async function varrerRevisoes(opts: { dias?: number; hoje?: Date; notificar?: boolean; gravar?: boolean } = {}): Promise<ResultadoVigia> {
  const hoje = opts.hoje || new Date();
  const dias = opts.dias ?? JANELA_PADRAO_DIAS;
  const notificar = opts.notificar ?? true;
  const gravar = opts.gravar ?? true; // false = só simula (não grava nem notifica)
  const desde = dataLimite(hoje, dias);

  // 1) OS da janela + OS já marcadas (para limpar quando resolver)
  const [{ data: recentes, error: e1 }, { data: marcadas, error: e2 }] = await Promise.all([
    supabase.from(TBL_OS).select(SELECT).gte('Data', desde).neq('Status', 'Cancelada'),
    supabase.from(TBL_OS).select(SELECT).not('pendencia_mahindra', 'is', null),
  ]);
  if (e1) throw new Error(`Ordem_Servico: ${e1.message}`);
  if (e2) throw new Error(`Ordem_Servico (marcadas): ${e2.message}`);

  const porId = new Map<string, LinhaOS>();
  for (const r of [...(recentes || []), ...(marcadas || [])] as LinhaOS[]) porId.set(r.Id_Ordem, r);

  // 2) Chassi de cada OS; só interessa quem tem chassi
  const candidatas: { os: LinhaOS; chassis: string; horas: number | null }[] = [];
  for (const os of porId.values()) {
    const chassis = extrairChassis(os);
    if (!chassis) continue;
    candidatas.push({ os, chassis, horas: normalizarHorasRevisao(extrairHorasRevisaoOS(os)) });
  }
  const chassisTodos = [...new Set(candidatas.map((c) => c.chassis))];
  if (!chassisTodos.length) return { janelaDias: dias, analisadas: 0, comPendencia: 0, novas: 0, limpas: 0, itens: [] };

  // 3) Quem é Mahindra (existe em `tratores`) + o que já foi enviado
  const finais = [...new Set(chassisTodos.map((c) => c.slice(-4)))];
  const [{ data: tratores }, { data: revEnv }] = await Promise.all([
    supabase.from('tratores').select('Chassis').in('Chassis', chassisTodos),
    supabase.from('revisao_emails').select('chassis_final,horas').in('chassis_final', finais),
  ]);
  // Mahindra = existe em `tratores`
  const mahindra = new Set(((tratores || []) as { Chassis: string }[]).map((t) => String(t.Chassis || '').toUpperCase()));
  const enviadasPorFinal = new Map<string, Set<number>>();
  for (const r of (revEnv || []) as { chassis_final: string; horas: string | number }[]) {
    const h = Number(String(r.horas || '').replace(/\D/g, ''));
    if (!h) continue;
    const set = enviadasPorFinal.get(r.chassis_final) || new Set<number>();
    set.add(h);
    enviadasPorFinal.set(r.chassis_final, set);
  }

  // 4) Avalia, grava o que mudou, notifica o que apareceu
  const itens: ItemVigia[] = [];
  const paraNotificar: { os: LinhaOS; chassis: string; horas: number | null; novos: string[] }[] = [];
  let novas = 0, limpas = 0, comPendencia = 0;

  for (const { os, chassis, horas } of candidatas) {
    const final = chassis.slice(-4);
    const faturada = osFaturada(os.Ordem_Omie, os.id_omie);
    const nova: PendenciaVigia | null = mahindra.has(chassis.toUpperCase())
      ? avaliarOS({
          os: { id: os.Id_Ordem, status: os.Status || '', faturada, data: os.Data, dataFim: os.Data_Fim_Servico },
          chassis, horas,
          enviadas: enviadasPorFinal.get(final) || new Set<number>(),
          hoje,
        })
      : null;
    const anterior = os.pendencia_mahindra || null;

    if (gravar && !mesmaPendencia(anterior, nova)) {
      const { error } = await supabase.from(TBL_OS).update({ pendencia_mahindra: nova }).eq('Id_Ordem', os.Id_Ordem);
      if (error) console.error(`[vigia-revisoes] ${os.Id_Ordem}: ${error.message}`);
    }

    if (!nova) { if (anterior) limpas++; continue; }
    comPendencia++;
    const novos = detalhesNovos(anterior, nova);
    if (novos.length) {
      novas++;
      paraNotificar.push({ os, chassis, horas, novos });
    }
    itens.push({
      id: os.Id_Ordem, cliente: os.Os_Cliente || '', status: os.Status || '', faturada, data: os.Data, dataFim: os.Data_Fim_Servico,
      chassis, horas, detalhes: nova.detalhes, nova: novos.length > 0,
    });
  }

  // 5) Notifica: até 5 novas → uma notificação por OS; mais que isso → UMA
  //    notificação-resumo (senão a primeira varredura despeja dezenas de avisos).
  //    O audit_log recebe uma linha por OS em qualquer caso.
  if (gravar && notificar && paraNotificar.length) {
    const individual = paraNotificar.length <= 5;
    for (const { os, chassis, horas, novos } of paraNotificar) {
      try {
        if (individual) {
          await logAndNotify({
            userName: 'Vigia de revisões', sistema: 'pos', acao: 'pendencia_detectada',
            entidade: 'ordem_servico', entidadeId: os.Id_Ordem, entidadeLabel: `OS ${os.Id_Ordem}`,
            detalhes: { chassis, horas, novos },
            notifTitulo: `⚠️ Cheque de revisão pendente: ${os.Id_Ordem}`,
            notifDescricao: `${os.Os_Cliente || ''} · ${chassis.slice(-6)} — ${novos.join('; ')}`,
            notifLink: `/pos?id=${os.Id_Ordem}`,
          });
        } else {
          await registrarAuditLog({
            userName: 'Vigia de revisões', sistema: 'pos', acao: 'pendencia_detectada',
            entidade: 'ordem_servico', entidadeId: os.Id_Ordem, entidadeLabel: `OS ${os.Id_Ordem}`,
            detalhes: { chassis, horas, novos },
          });
        }
      } catch (e) { console.error('[vigia-revisoes] notificação:', e); }
    }
    if (!individual) {
      try {
        await notificarAdmins({
          tipo: 'pos',
          titulo: `⚠️ Vigia de revisões: ${paraNotificar.length} OS com cheque pendente`,
          descricao: paraNotificar.slice(0, 6).map((p) => p.os.Id_Ordem).join(', ') + (paraNotificar.length > 6 ? '…' : ''),
          link: '/revisoes',
        });
      } catch (e) { console.error('[vigia-revisoes] notificação-resumo:', e); }
    }
  }

  itens.sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));
  return { janelaDias: dias, analisadas: candidatas.length, comPendencia, novas, limpas, itens };
}

/** Lista o que está marcado hoje (sem recalcular) — alimenta o painel da tela de Revisões. */
export async function listarPendencias(): Promise<ItemVigia[]> {
  const { data, error } = await supabase
    .from(TBL_OS)
    .select(SELECT)
    .not('pendencia_mahindra', 'is', null)
    .neq('Status', 'Cancelada')
    .order('Data', { ascending: false })
    .limit(300);
  if (error) throw new Error(error.message);
  return ((data || []) as LinhaOS[])
    .filter((os) => os.pendencia_mahindra?.detalhes?.length)
    .map((os) => ({
      id: os.Id_Ordem, cliente: os.Os_Cliente || '', status: os.Status || '', faturada: osFaturada(os.Ordem_Omie, os.id_omie), data: os.Data, dataFim: os.Data_Fim_Servico,
      chassis: os.pendencia_mahindra?.chassis || extrairChassis(os) || '',
      horas: normalizarHorasRevisao(extrairHorasRevisaoOS(os)),
      detalhes: os.pendencia_mahindra!.detalhes, nova: false,
    }));
}
