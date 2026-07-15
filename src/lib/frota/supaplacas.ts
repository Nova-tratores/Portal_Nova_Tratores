// =============================================================================
// WRITE-THROUGH Frota -> SupaPlacas (Fase 5).
//
// A SupaPlacas é a projeção que as REQUISIÇÕES e o lançamento no OMIE
// consomem (Requisicao.veiculo = SupaPlacas.IdPlaca; omie-contapagar lê
// id_projeto_omie de lá). A aba "Veículos" das Requisições morreu — quem
// mantém a SupaPlacas agora é o FROTA: cadastrar/editar veículo aqui
// cria/atualiza a linha lá sozinho. O financeiro não muda nada.
//
// Regras:
//  - frota_veiculos.supa_placa_id é o vínculo; criado uma vez, nunca muda.
//  - NumPlaca segue a convenção histórica "MODELO - PLACA" (o placa.ts sabe
//    extrair a placa de volta com partesNumPlaca).
//  - IdPlaca novo = Date.now() (a tela antiga já fazia isso; não colide com
//    os ids pequenos legados).
// =============================================================================
import type { SupabaseClient } from '@supabase/supabase-js';
import { formatarPlaca } from './placa';

export interface VeiculoParaEspelho {
  id: string;
  placa: string;
  modelo?: string | null;
  supa_placa_id: number | null;
}

function numPlacaDe(v: VeiculoParaEspelho): string {
  const placa = formatarPlaca(v.placa);
  const modelo = (v.modelo || '').trim().toUpperCase();
  return modelo ? `${modelo} - ${placa}` : placa;
}

/**
 * Garante que o veículo tem a linha na SupaPlacas e devolve o IdPlaca.
 * Cria a linha (e grava o vínculo em frota_veiculos.supa_placa_id) se faltar.
 */
export async function garantirSupaPlaca(
  supabase: SupabaseClient,
  v: VeiculoParaEspelho,
): Promise<number> {
  if (v.supa_placa_id != null) return Number(v.supa_placa_id);

  const idNovo = Date.now();
  const { error: errIns } = await supabase
    .from('SupaPlacas')
    .insert({ IdPlaca: idNovo, NumPlaca: numPlacaDe(v) });
  if (errIns) throw new Error(`SupaPlacas (criar): ${errIns.message}`);

  const { error: errLink } = await supabase
    .from('frota_veiculos')
    .update({ supa_placa_id: idNovo })
    .eq('id', v.id);
  if (errLink) throw new Error(`frota_veiculos (vincular SupaPlacas): ${errLink.message}`);

  return idNovo;
}

/**
 * Espelha os projetos Omie editados na Ficha para a SupaPlacas (é de lá que o
 * omie-contapagar resolve o projeto da requisição veicular).
 */
export async function espelharProjetosOmie(
  supabase: SupabaseClient,
  v: VeiculoParaEspelho,
  projetos: { id_projeto_omie?: number | null; id_projeto_omie_castro?: number | null },
): Promise<void> {
  const patch: Record<string, number | null> = {};
  if ('id_projeto_omie' in projetos) patch.id_projeto_omie = projetos.id_projeto_omie ?? null;
  if ('id_projeto_omie_castro' in projetos) patch.id_projeto_omie_castro = projetos.id_projeto_omie_castro ?? null;
  if (Object.keys(patch).length === 0) return;

  const idPlaca = await garantirSupaPlaca(supabase, v);
  const { error } = await supabase.from('SupaPlacas').update(patch).eq('IdPlaca', idPlaca);
  if (error) throw new Error(`SupaPlacas (projetos Omie): ${error.message}`);
}
