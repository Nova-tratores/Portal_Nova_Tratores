// ─── UTILITÁRIOS COMPARTILHADOS ──────────────────────────────────────────────
// Importar: import { formatarDataBR, formatarMoeda, calcTempo, getRequisicoes } from '@/lib/utils'

export const formatarData = (dataStr) => {
  if (!dataStr || dataStr === 'null' || String(dataStr).trim() === '' || dataStr === 'N/A') return 'N/A'
  try {
    const apenasData = String(dataStr).split(' ')[0]
    if (apenasData.includes('/') && apenasData.split('/')[0].length <= 2) return apenasData
    const partes = apenasData.split(/[-/]/)
    if (partes.length === 3) {
      if (partes[0].length === 4) return `${partes[2]}/${partes[1]}/${partes[0]}`
      return `${partes[0]}/${partes[1]}/${partes[2]}`
    }
    return dataStr
  } catch (e) { return String(dataStr) }
}

// Alias padrão usado em todas as páginas
export const formatarDataBR = formatarData

export const formatarMoeda = (valor) => {
  if (valor === null || valor === undefined) return 'R$ 0,00'
  const num = typeof valor === 'string' ? parseFloat(valor) : valor
  if (isNaN(num)) return 'R$ 0,00'
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export const calcTempo = (dateStr) => {
  if (!dateStr) return null
  const diffMs = new Date() - new Date(dateStr)
  const mins = Math.floor(diffMs / 60000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  const months = Math.floor(days / 30)
  if (months > 0) return `${months} ${months === 1 ? 'mes' : 'meses'}`
  if (days > 0) return `${days} ${days === 1 ? 'dia' : 'dias'}`
  if (hours > 0) return `${hours}h`
  if (mins > 0) return `${mins}min`
  return 'agora'
}

export const getRequisicoes = (t) => {
  try { return JSON.parse(t?.requisicoes_json || '[]') } catch { return [] }
}

// ─── HELPERS DE FORMA DE PAGAMENTO (case-insensitive) ────────────────────────
export const isBoleto30Dias   = (f) => f?.toLowerCase().includes('30 dias')
export const isBoletoParc     = (f) => f === 'Boleto Parcelado'
export const isCartaoParc     = (f) => f === 'Cartão Parcelado'
export const isPix            = (f) => f?.toLowerCase().includes('pix')
export const isCartaoVista    = (f) => f?.toLowerCase().includes('cartão a vista')
export const isPixOuVista     = (f) => isPix(f) || isCartaoVista(f)
