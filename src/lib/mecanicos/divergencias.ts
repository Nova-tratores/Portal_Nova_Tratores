// Divergências que o Tratorilson explica no mapa do furo (José, 28/10/2026: "em cada divergência precisa aparecer o
// Tratorilson explicando") — PURO: a tela e o servidor usam.
export type Divergencia = 'geral' | 'km-fora-relatorio' | 'km-nao-cobrado' | 'dias-sem-os' | 'horas-nao-cobradas' | 'sem-cliente'
export const DIVERGENCIAS: Record<Divergencia, { titulo: string; unidade: 'km' | 'h' | 'dias' }> = {
  'geral': { titulo: 'onde foi o furo de km', unidade: 'km' },
  'km-fora-relatorio': { titulo: 'km rodado que não está em relatório', unidade: 'km' },
  'km-nao-cobrado': { titulo: 'km do relatório que não foi cobrado', unidade: 'km' },
  'dias-sem-os': { titulo: 'dias com o carro rodando sem OS', unidade: 'km' },
  'horas-nao-cobradas': { titulo: 'horas apontadas e não cobradas', unidade: 'h' },
  'sem-cliente': { titulo: 'dias de OS sem o carro passar no cliente', unidade: 'dias' },
}
export const ehDivergencia = (v: unknown): v is Divergencia => typeof v === 'string' && v in DIVERGENCIAS

