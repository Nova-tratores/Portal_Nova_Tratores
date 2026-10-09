// Horas trabalhadas × faturadas por dia e técnico (Dashboard de Vendas →
// histórico de Serviços → Comparar "Horas: trabalhadas × faturadas").
//
//   Trabalhadas: relatório do app do técnico (Ordem_Servico_Tecnicos), pela DATA
//     EM QUE O TÉCNICO FEZ o serviço; horas com quem fez o relatório
//     (regras puras em lib/pos/horas-tecnico.ts). Só OS do portal (POS) = NOVA,
//     e só desde 2026 (quando o app do técnico entrou).
//   Faturadas: itens HR (Hora Trabalhada) das OS com NFS-e (os_servicos_itens ×
//     os_nfse), qtde = horas, pela data do FATURAMENTO da OS. Técnico pela OS do
//     portal (Ordem_Omie sem zeros = numero_os): o do relatório, senão Os_Tecnico;
//     OS que não está no portal → "Sem OS no portal".
//
// ⚠️ select=* em Ordem_Servico_Tecnicos estoura o statement timeout (fotos e
// assinaturas na linha) — sempre colunas explícitas.

import { supabase } from './supabase';
import { comCacheResumo } from './resumo-cache';
import { diasDoRelatorio, normalizarTecnico, dataIso, type RelatorioTecnico } from '@/lib/pos/horas-tecnico';
import type { ContaFiltro } from './conta';

export const SEM_OS_PORTAL = 'Sem OS no portal';

export interface DiaHoras { data: string; tecnico: string; trabalhadas: number; faturadas: number }
export interface HorasResult {
  dias: DiaHoras[];
  /** Técnicos com horas, do que mais trabalhou para o que menos. */
  tecnicos: string[];
  /** Primeiro dia com relatório de técnico (antes disso não há "trabalhadas"). */
  inicioRelatorios: string | null;
  /** true quando a conta pedida não tem OS no portal (CASTRO): só há faturadas. */
  semPortal: boolean;
}

async function paginar<T>(montar: (de: number, ate: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await montar(de, de + 999);
    if (error) throw new Error(error.message);
    const linhas = (data || []) as T[];
    out.push(...linhas);
    if (linhas.length < 1000) break;
  }
  return out;
}

const semZeros = (v: unknown) => String(v ?? '').trim().replace(/^0+/, '');

async function calcularHoras(conta: ContaFiltro): Promise<HorasResult> {
  const comPortal = conta == null || conta === 'NOVA';
  const [relatorios, ordens] = comPortal
    ? await Promise.all([
        paginar<RelatorioTecnico>((de, ate) => supabase.from('Ordem_Servico_Tecnicos')
          .select('IdOs,Ordem_Servico,TecResp1,DataInicio,InicioHora,FinalHora,DataInicio2,InicioHora2,FinalHora2,DataInicio3,InicioHora3,FinaHora3,TotalHora')
          .order('IdOs').range(de, ate)),
        paginar<{ Id_Ordem: string; Ordem_Omie: string | null; Os_Tecnico: string | null }>((de, ate) => supabase.from('Ordem_Servico')
          .select('Id_Ordem,Ordem_Omie,Os_Tecnico').order('Id_Ordem').range(de, ate)),
      ])
    : [[], []];

  // Trabalhadas
  const acc = new Map<string, DiaHoras>();
  const somar = (data: string, tecnico: string, campo: 'trabalhadas' | 'faturadas', horas: number) => {
    const k = data + '|' + tecnico;
    const d = acc.get(k) ?? { data, tecnico, trabalhadas: 0, faturadas: 0 };
    d[campo] += horas;
    acc.set(k, d);
  };
  const tecDaOS = new Map<string, string>(); // Id_Ordem → técnico do relatório
  let inicioRelatorios: string | null = null;
  for (const r of relatorios) {
    for (const d of diasDoRelatorio(r)) {
      somar(d.data, d.tecnico, 'trabalhadas', d.horas);
      if (!inicioRelatorios || d.data < inicioRelatorios) inicioRelatorios = d.data;
      if (d.os && !tecDaOS.has(d.os)) tecDaOS.set(d.os, d.tecnico);
    }
  }
  const tecPorNumOmie = new Map<string, string>();
  for (const o of ordens) {
    const n = semZeros(o.Ordem_Omie);
    if (!n) continue;
    tecPorNumOmie.set(n, tecDaOS.get(o.Id_Ordem) || normalizarTecnico(o.Os_Tecnico) || SEM_OS_PORTAL);
  }

  // Faturadas: HR das OS com NFS-e
  type ItemHR = { conta_omie: string; ncod_os: number; numero_os: string; data: string; qtde: number | string };
  const contas = conta ? [conta] : ['NOVA', 'CASTRO'];
  for (const c of contas) {
    const [itens, notas] = await Promise.all([
      paginar<ItemHR>((de, ate) => supabase.from('os_servicos_itens').select('conta_omie,ncod_os,numero_os,data,qtde')
        .eq('conta_omie', c).eq('tipo', 'HR').order('id').range(de, ate)),
      paginar<{ ncod_os: number }>((de, ate) => supabase.from('os_nfse').select('ncod_os')
        .eq('conta_omie', c).eq('tem_nota', true).order('ncod_os').range(de, ate)),
    ]);
    const comNota = new Set(notas.map((n) => Number(n.ncod_os)));
    for (const it of itens) {
      if (!comNota.has(Number(it.ncod_os))) continue;
      const data = dataIso(it.data);
      if (!data) continue;
      const tecnico = c === 'NOVA' ? tecPorNumOmie.get(semZeros(it.numero_os)) || SEM_OS_PORTAL : SEM_OS_PORTAL;
      somar(data, tecnico, 'faturadas', Number(it.qtde) || 0);
    }
  }

  const dias = [...acc.values()]
    .map((d) => ({ ...d, trabalhadas: Math.round(d.trabalhadas * 100) / 100, faturadas: Math.round(d.faturadas * 100) / 100 }))
    .sort((a, b) => a.data.localeCompare(b.data));
  const totalTec = new Map<string, number>();
  for (const d of dias) totalTec.set(d.tecnico, (totalTec.get(d.tecnico) ?? 0) + d.trabalhadas + d.faturadas / 1000);
  const tecnicos = [...totalTec.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  return { dias, tecnicos, inicioRelatorios, semPortal: !comPortal };
}

/** Horas por dia e técnico — 5 min em cache (o sync de OS limpa ao gravar vendas; serviços mudam 1×/dia). */
export function obterHoras(conta: ContaFiltro): Promise<HorasResult> {
  return comCacheResumo('horas|' + (conta ?? 'todas'), () => calcularHoras(conta));
}
