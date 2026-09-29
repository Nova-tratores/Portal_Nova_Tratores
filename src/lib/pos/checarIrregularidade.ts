// Checagem de pendência Mahindra NA HORA (criação/edição da OS). As regras são
// as mesmas da varredura diária (lib/pos/vigia-revisoes.ts) — vivem em
// vigia-revisoes-regras.ts: OS de revisão FATURADA sem cheque enviado.
import { createClient } from '@supabase/supabase-js';
import { extrairChassis, extrairHorasRevisaoOS } from './extrairTrator';
import { avaliarOS, normalizarHorasRevisao, osFaturada } from './vigia-revisoes-regras';

export interface PendenciaMahindra {
  motivo: string;
  detalhes: string[];
  chassis: string;
}

interface OSEntrada {
  Projeto?: string | null;
  Serv_Solicitado?: string | null;
  Tipo_Servico?: string | null;
  Revisao?: string | null;
  Status?: string | null;
  Data?: string | null;
  Data_Fim_Servico?: string | null;
  Ordem_Omie?: string | null;
  id_omie?: number | string | null;
}

/**
 * Checa se uma OS tem pendência Mahindra (revisão faturada com cheque não enviado).
 * Retorna null se:
 *  - não conseguir extrair chassis
 *  - chassis não existe na tabela `tratores` (não é Mahindra)
 *  - não houver pendência
 */
export async function checarIrregularidade(os: OSEntrada): Promise<PendenciaMahindra | null> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const chassis = extrairChassis(os);
  if (!chassis) return null;

  // Só é Mahindra se o chassis existe em `tratores`
  const { data: tratorMatch } = await supabase
    .from('tratores')
    .select('ID, Chassis')
    .ilike('Chassis', chassis)
    .limit(1);

  if (!tratorMatch || tratorMatch.length === 0) return null;

  const chassisFinal = chassis.slice(-4);
  const { data: revisoesEnviadas } = await supabase.from('revisao_emails').select('horas').eq('chassis_final', chassisFinal);

  const enviadas = new Set<number>();
  for (const r of (revisoesEnviadas || []) as { horas: string | number }[]) {
    const h = Number(String(r.horas || '').replace(/\D/g, ''));
    if (h) enviadas.add(h);
  }

  // Horas lidas do campo Revisao OU do texto da solicitação ("REV 900H",
  // "Revisão de 2400") — o campo Revisao fica vazio com frequência.
  return avaliarOS({
    os: {
      id: '', status: os.Status || '', faturada: osFaturada(os.Ordem_Omie, os.id_omie),
      data: os.Data || null, dataFim: os.Data_Fim_Servico || null,
    },
    chassis,
    horas: normalizarHorasRevisao(extrairHorasRevisaoOS(os)),
    enviadas,
    hoje: new Date(),
  });
}
