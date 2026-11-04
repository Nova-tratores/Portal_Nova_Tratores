// Cria a Requisição "Veicular Manutenção" de um carro da frota. Usada pela
// pendência ("criar requisição") e pela ordem de serviço da oficina.
// A requisição nasce em 'pedido'; quem a liga à pendência/OS é quem chama.
import type { SupabaseClient } from '@supabase/supabase-js';

export interface NovaRequisicaoManutencao {
  placa: string;
  titulo: string;
  solicitante: string;
  criadoPor: string;
  km?: number | null;
  /** primeira linha das observações ("Aberta automaticamente pela …") */
  origem: string;
  descricao?: string | null;
}

export async function criarRequisicaoManutencao(supabase: SupabaseClient, r: NovaRequisicaoManutencao): Promise<number> {
  const { data: v } = await supabase
    .from('frota_veiculos')
    .select('supa_placa_id, modelo')
    .eq('placa', r.placa)
    .maybeSingle();
  const obs = [
    `${r.origem} no ${r.placa}${v?.modelo ? ` (${v.modelo})` : ''}.`,
    r.descricao || '',
  ].filter(Boolean).join('\n');
  const { data, error } = await supabase
    .from('Requisicao')
    .insert({
      titulo: r.titulo,
      tipo: 'Veicular Manutenção',
      solicitante: r.solicitante,
      setor: 'Frota',
      data: new Date().toISOString().slice(0, 10),
      empresa: 'NOVA TRATORES MÁQUINAS AGRÍCOLAS LTDA',
      endereco_empr: 'AVENIDA SÃO SEBASTIÃO, 1065 | Piraju - SP',
      veiculo: v?.supa_placa_id ?? null,
      hodometro: r.km != null ? String(r.km) : '',
      obs,
      status: 'pedido',
      criado_por: r.criadoPor,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message || 'Erro ao criar a requisição.');
  return Number(data.id);
}
