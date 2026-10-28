// Setores da frota (José, 22/10/2026). Usado na ficha, na tela de Veículos e no
// servidor (o banco tem CHECK com os mesmos valores: sql/frota-setor-sem-uso.sql).
export const SETORES_FROTA = [
  { id: 'comercial', rotulo: 'Comercial', cor: '#dc2626' },
  { id: 'pecas', rotulo: 'Peças', cor: '#ea580c' },
  { id: 'pos_vendas', rotulo: 'Pós-Vendas', cor: '#0369a1' },
  { id: 'pessoal', rotulo: 'Pessoal', cor: '#7c3aed' },
] as const;

export type SetorFrota = (typeof SETORES_FROTA)[number]['id'];

export function rotuloSetor(id: string | null | undefined): string {
  return SETORES_FROTA.find((s) => s.id === id)?.rotulo || 'Sem setor';
}

export function corSetor(id: string | null | undefined): string {
  return SETORES_FROTA.find((s) => s.id === id)?.cor || '#64748b';
}
