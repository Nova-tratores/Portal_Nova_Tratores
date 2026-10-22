// Lê e grava a higiene dos responsáveis (regras em higiene-responsaveis.ts).
// Roda junto com o motor de pendências da frota (a cada 15 min) e é usado pela
// troca de responsável para recusar pessoa desligada.
import { createClient } from '@supabase/supabase-js';
import { listarFuncionariosRH, rhConfigurado } from './rh';
import { motoristasDesligados, planejarHigiene, vinculosDeDesligados, type MotoristaLocal } from './higiene-responsaveis';
import { resolverPlaca } from './placa';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  { auth: { persistSession: false } },
);

export async function carregarDesligados(): Promise<Set<string>> {
  if (!rhConfigurado()) return new Set();
  const [rh, { data: locais }] = await Promise.all([
    listarFuncionariosRH(),
    supabase.from('frota_motoristas').select('id, cpf, pessoa_id'),
  ]);
  return motoristasDesligados((locais || []) as MotoristaLocal[], rh);
}

/** Fecha (fim = hoje) os períodos abertos de desligados e de carros fora da frota. */
export async function fecharResponsaveisSemDireito(): Promise<{ fechados: number; motivos: string[] }> {
  const [desligados, abertos, veiculos] = await Promise.all([
    carregarDesligados(),
    supabase.from('frota_responsaveis').select('id, veiculo_id, motorista_id, motorista_nome').is('fim', null),
    supabase.from('frota_veiculos').select('id, status, ativo, placa'),
  ]);
  if (abertos.error) throw abertos.error;
  if (veiculos.error) throw veiculos.error;
  // técnico desligado no RH perde o vínculo com o carro (checklist/GPS/gastos)
  const motivosTec: string[] = [];
  if (rhConfigurado()) {
    const [rh, { data: tv }] = await Promise.all([
      listarFuncionariosRH(),
      supabase.from('tecnico_veiculos').select('id, tecnico_nome, placa'),
    ]);
    const ids = vinculosDeDesligados(tv || [], rh);
    if (ids.length) {
      const { error } = await supabase.from('tecnico_veiculos').delete().in('id', ids);
      if (error) throw error;
      for (const t of (tv || []).filter((x) => ids.includes(x.id))) motivosTec.push(`${t.tecnico_nome} (${t.placa}): técnico desligado no RH`);
    }
  }

  const plano = planejarHigiene(abertos.data || [], veiculos.data || [], desligados);
  if (plano.length) {
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const { error } = await supabase.from('frota_responsaveis').update({ fim: hoje }).in('id', plano.map((p) => p.id));
    if (error) throw error;
  }

  // carro que saiu da frota também perde o vínculo de técnico (checklist/GPS)
  const fora = new Set((veiculos.data || []).filter((v) => v.status === 'vendido' || v.status === 'arquivado').map((v) => resolverPlaca(v.placa)));
  if (fora.size) await removerVinculoTecnico([...fora]);

  const nomes = new Map((abertos.data || []).map((r) => [r.id, r.motorista_nome || '?']));
  return { fechados: plano.length + motivosTec.length, motivos: [...motivosTec, ...plano.map((p) => `${nomes.get(p.id)}: ${p.motivo}`)] };
}

/** Apaga o vínculo técnico↔carro (tecnico_veiculos) das placas informadas. */
export async function removerVinculoTecnico(placas: string[]): Promise<number> {
  const alvo = new Set(placas.map((p) => resolverPlaca(p)));
  const { data } = await supabase.from('tecnico_veiculos').select('id, placa');
  const ids = (data || []).filter((t) => alvo.has(resolverPlaca(t.placa))).map((t) => t.id);
  if (!ids.length) return 0;
  const { error } = await supabase.from('tecnico_veiculos').delete().in('id', ids);
  if (error) throw error;
  return ids.length;
}
