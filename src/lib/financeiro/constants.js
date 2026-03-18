// ─── CONSTANTES GLOBAIS DO SISTEMA ───────────────────────────────────────────
// Importar: import { STATUS_NF, FORMAS_PAGAMENTO, STATUS_CONFIG_NF } from '@/lib/constants'

// Valores exatos armazenados no banco (conforme form novo-chamado-nf)
export const FORMAS_PAGAMENTO = {
  PIX:              'Pix',
  BOLETO_30:        'Boleto 30 dias',
  BOLETO_PARCELADO: 'Boleto Parcelado',
  CARTAO_VISTA:     'Cartão a vista',
  CARTAO_PARCELADO: 'Cartão Parcelado',
}

export const STATUS_NF = {
  GERAR_BOLETO:  'gerar_boleto',
  VALIDAR_PIX:   'validar_pix',
  ENVIAR_CLIENTE:'enviar_cliente',
  AGUARDANDO:    'aguardando_vencimento',
  PAGO:          'pago',
  VENCIDO:       'vencido',
  CONCLUIDO:     'concluido',
}

export const STATUS_PAGAR = {
  PENDENTE:  'financeiro',
  CONCLUIDO: 'concluido',
}

export const STATUS_RH = {
  ATIVO:     'ativo',
  CONCLUIDO: 'concluido',
}

// Configuração visual por status (cores para kanban)
export const STATUS_CONFIG_NF = {
  gerar_boleto:          { label: 'GERAR BOLETO',          bg: '#eff6ff', color: '#3b82f6', border: '#bfdbfe' },
  validar_pix:           { label: 'VALIDAR PIX',           bg: '#f5f3ff', color: '#7c3aed', border: '#ddd6fe' },
  enviar_cliente:        { label: 'ENVIAR PARA CLIENTE',   bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
  aguardando_vencimento: { label: 'AGUARDANDO VENCIMENTO', bg: '#fffbeb', color: '#d97706', border: '#fde68a' },
  pago:                  { label: 'PAGO',                  bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
  vencido:               { label: 'VENCIDO',               bg: '#fff1f2', color: '#dc2626', border: '#fecaca' },
  concluido:             { label: 'CONCLUIDO',             bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
}
