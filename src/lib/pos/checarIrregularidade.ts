import { createClient } from '@supabase/supabase-js';
import { REVISOES_LISTA } from '@/lib/revisoes/types';
import { extrairChassis, extrairHorasRevisao } from './extrairTrator';

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
}

/**
 * Checa se uma OS tem pendências Mahindra (inspeção ou revisão anterior não enviada).
 * Retorna null se:
 *  - não conseguir extrair chassis
 *  - chassis não existe na tabela `tratores` (não é Mahindra)
 *  - não houver pendências
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
  const detalhes: string[] = [];

  // 1) Inspeção de pré-entrega enviada?
  const { data: inspecao } = await supabase
    .from('inspecao_emails')
    .select('id')
    .eq('chassis_final', chassisFinal)
    .limit(1);

  if (!inspecao || inspecao.length === 0) {
    detalhes.push('Inspeção de pré-entrega não enviada');
  }

  // 2) Se for OS de revisão, revisões anteriores foram enviadas?
  const tipoServico = os.Tipo_Servico || '';
  const horasRev = extrairHorasRevisao(os.Revisao);

  if (tipoServico.toLowerCase().includes('revis') && horasRev && horasRev > 50) {
    const { data: revisoesEnviadas } = await supabase
      .from('revisao_emails')
      .select('horas')
      .eq('chassis_final', chassisFinal);

    const enviadas = new Set((revisoesEnviadas || []).map((r: { horas: string }) => String(r.horas)));

    for (const item of REVISOES_LISTA) {
      const h = Number(item.replace('h', ''));
      if (h >= horasRev) break;
      if (!enviadas.has(String(h))) {
        detalhes.push(`Cheque de revisão ${item} não enviado`);
      }
    }
  }

  if (detalhes.length === 0) return null;

  return {
    motivo: 'OS com pendências Mahindra',
    detalhes,
    chassis,
  };
}
