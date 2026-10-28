// Transferência entre as abas do Opa (José, 22/10/2026):
//  - Peças S/Estoque → Patrimônio Loja: só uma transferência — a peça sai das
//    Peças (exclusão lógica com o motivo no histórico) e nasce no Patrimônio com as
//    mesmas fotos, quantidade e lugar.
//  - Patrimônio → Peças S/Estoque: entra direto na VERIFICAÇÃO (já tem descrição,
//    quantidade, lugar e fotos); no Patrimônio o item fica "baixado" com o motivo.
// Regras puras (testes em __tests__/opa-transferencia.test.ts); o servidor está em
// opa-transferencia-server.ts.

export type QualidadePeca = 'nao_avaliada' | 'nova' | 'usada_boa' | 'usada_com_avaria' | 'sucata'
export type EstadoPatrimonio = 'novo' | 'bom' | 'regular' | 'ruim' | 'sem_uso'

const Q_PARA_E: Record<QualidadePeca, EstadoPatrimonio> = {
  nova: 'novo', usada_boa: 'bom', usada_com_avaria: 'regular', sucata: 'ruim', nao_avaliada: 'bom',
}
const E_PARA_Q: Record<EstadoPatrimonio, QualidadePeca> = {
  novo: 'nova', bom: 'usada_boa', regular: 'usada_com_avaria', ruim: 'sucata', sem_uso: 'nao_avaliada',
}

export function estadoDaQualidade(q: string | null | undefined): EstadoPatrimonio {
  return Q_PARA_E[(q || 'nao_avaliada') as QualidadePeca] || 'bom'
}
export function qualidadeDoEstado(e: string | null | undefined): QualidadePeca {
  return E_PARA_Q[(e || 'sem_uso') as EstadoPatrimonio] || 'nao_avaliada'
}

const limpar = (s: string | null | undefined) => String(s || '').trim()

export interface PecaOrigem {
  codigo: string; descricao: string | null; quantidade: number; qualidade: string | null
  codigo_fabricante?: string | null; codigo_correto?: string | null; observacoes?: string | null
  preco_sugerido?: number | string | null; local_id?: string | null; local_tecnico?: string | null; etiquetas?: string[] | null
}

/** Campos do item novo no Patrimônio, a partir da peça. */
export function patrimonioDaPeca(p: PecaOrigem): Record<string, unknown> {
  const obs = [
    `Veio das Peças S/Estoque (${p.codigo}).`,
    limpar(p.codigo_correto) && `Código correto: ${limpar(p.codigo_correto)}.`,
    limpar(p.codigo_fabricante) && `Código do fabricante: ${limpar(p.codigo_fabricante)}.`,
    limpar(p.observacoes),
  ].filter(Boolean).join('\n')
  const preco = p.preco_sugerido == null || p.preco_sugerido === '' ? null : Number(p.preco_sugerido)
  return {
    descricao: (limpar(p.descricao) || `Peça ${p.codigo}`).slice(0, 300),
    quantidade: Math.max(1, Math.round(Number(p.quantidade) || 1)),
    estado: estadoDaQualidade(p.qualidade),
    situacao: 'guardado',
    local_id: p.local_id || null,
    local_tecnico: limpar(p.local_tecnico) || null,
    valor_atual: Number.isFinite(preco) ? preco : null,
    tags: (p.etiquetas || []).slice(0, 15),
    observacoes: obs.slice(0, 2000),
  }
}

export interface PatrimonioOrigem {
  codigo: string; descricao: string; quantidade?: number | null; estado: string | null
  marca?: string | null; modelo?: string | null; numero_serie?: string | null; observacoes?: string | null
  local_id?: string | null; local_tecnico?: string | null
}

/** Campos da peça nova (já na verificação), a partir do item do Patrimônio. */
export function pecaDoPatrimonio(p: PatrimonioOrigem): Record<string, unknown> {
  const obs = [
    `Veio do Patrimônio Loja (${p.codigo}).`,
    [limpar(p.marca), limpar(p.modelo)].filter(Boolean).join(' ') && `Marca/modelo: ${[limpar(p.marca), limpar(p.modelo)].filter(Boolean).join(' ')}.`,
    limpar(p.numero_serie) && `Nº de série: ${limpar(p.numero_serie)}.`,
    limpar(p.observacoes),
  ].filter(Boolean).join('\n')
  return {
    descricao: limpar(p.descricao).slice(0, 300) || `Item ${p.codigo}`,
    quantidade: Math.max(1, Math.round(Number(p.quantidade) || 1)),
    qualidade: qualidadeDoEstado(p.estado),
    status: 'aguardando_identificacao', // = "Aguardando verificação" na tela
    local_id: p.local_id || null,
    local_tecnico: limpar(p.local_tecnico) || null,
    observacoes: obs.slice(0, 2000),
  }
}
