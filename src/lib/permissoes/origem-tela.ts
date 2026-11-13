// =============================================================================
// De onde vem cada tela de uma pessoa (janela de acessos do Admin, 13/11/2026).
// Lê o `origens` da perm_efetivas ('conjunto:Comercial', 'conjunto:X · gerir y',
// 'extra', 'extra até 31/12/2026', 'bloqueio ver z', 'admin', 'dev') e os
// overrides (motivo das exceções e bloqueios). PURA.
// =============================================================================

export type TipoSelo = 'conjunto' | 'excecao' | 'bloqueio';
export interface Selo { texto: string; tipo: TipoSelo; dica: string }

export interface TelaComOrigem { id: string; origens: string[] }
export interface OverrideComMotivo { tela_id: string; tipo: string; motivo?: string | null; expira_em?: string | null }

const vigente = (o: OverrideComMotivo, agora: number) => !o.expira_em || new Date(o.expira_em).getTime() > agora;

/** Selos por tela: departamentos/pacotes que dão, "exceção" e "bloqueada". */
export function selosPorTela(telas: TelaComOrigem[], overrides: OverrideComMotivo[], agora = Date.now()): Record<string, Selo[]> {
  const motivo = new Map<string, string>();
  for (const o of overrides) if (vigente(o, agora) && o.motivo) motivo.set(`${o.tipo}|${o.tela_id}`, o.motivo);

  const out: Record<string, Selo[]> = {};
  for (const t of telas) {
    const nomes = new Set<string>();
    let excecao: string | null = null;
    for (const bruto of t.origens ?? []) {
      const base = bruto.split(' · ')[0];
      if (base.startsWith('conjunto:')) nomes.add(base.slice('conjunto:'.length));
      else if (base.startsWith('extra')) excecao = excecao ?? base.slice('extra'.length).trim();
    }
    const selos: Selo[] = [...nomes].sort((a, b) => a.localeCompare(b))
      .map((n) => ({ texto: n, tipo: 'conjunto' as const, dica: `Vem de "${n}"` }));
    if (excecao !== null) {
      const m = motivo.get(`extra|${t.id}`);
      selos.push({ texto: excecao ? `exceção ${excecao}` : 'exceção', tipo: 'excecao', dica: m ? `Exceção: ${m}` : 'Exceção desta pessoa (fora dos departamentos)' });
    }
    if (selos.length) out[t.id] = selos;
  }
  for (const o of overrides) {
    if (o.tipo !== 'bloqueio' || !vigente(o, agora)) continue;
    (out[o.tela_id] ||= []).push({ texto: 'bloqueada', tipo: 'bloqueio', dica: o.motivo ? `Bloqueada: ${o.motivo}` : 'Bloqueada para esta pessoa' });
  }
  return out;
}

/** Atalhos de motivo na janela da pessoa (texto livre continua valendo). */
export const MOTIVOS_RAPIDOS = [
  'Pedido do gestor',
  'Mudou de função',
  'Cobrir férias / ausência',
  'Corrigir acesso errado',
  'Teste',
];
