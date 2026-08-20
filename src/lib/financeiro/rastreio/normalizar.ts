// Rastreio de notas — NORMALIZAÇÃO do termo de busca (pura, testável).
// O usuário digita qualquer coisa: nº de nota (com/sem zeros), chave NF-e de
// 44 dígitos, linha digitável de boleto (47/48), "#123" de requisição ou o
// nome do fornecedor. Aqui a gente decide O QUE é e deriva os campos de busca.
import { ehChaveNFeValida, partesChaveNFe } from '@/lib/financeiro/chave-nfe'

export type TipoTermo = 'chave_nfe' | 'linha_digitavel' | 'requisicao_id' | 'numero' | 'texto'

export interface BoletoDecodificado {
  linhaDigitavel: string
  valor: number | null
  /** yyyy-mm-dd (fator de vencimento, base 07/10/1997 com rollover de 2025) */
  vencimento: string | null
}

export interface TermoNormalizado {
  bruto: string
  tipo: TipoTermo
  digitos: string
  /** dígitos sem zeros à esquerda ('' se não numérico) */
  numeroSemZeros: string
  /** a MAIOR sequência de dígitos do termo — é o que vai no ilike ('1384/1547'
   *  procura por '%1547%'; a string toda concatenada não existe no banco) */
  numeroBusca: string
  chaveNfe: string | null
  /** nNF embutido na chave, sem zeros — pra busca cruzada por número */
  nNFDaChave: string | null
  cnpjDaChave: string | null
  requisicaoId: number | null
  boleto: BoletoDecodificado | null
  /** termo pra ilike de texto (SANITIZAR na rota antes de interpolar) */
  texto: string
}

export const soDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '')

/** Todos os dígitos concatenados, sem zeros à esquerda. */
export const numeroNormalizado = (v: unknown) => soDigitos(v).replace(/^0+/, '')

/** Sequências de dígitos do campo, cada uma sem zeros à esquerda.
 *  '1384/1547' → ['1384','1547']; '1AA532734-3' → ['1','532734','3'] */
export const runsDeDigitos = (v: unknown): string[] =>
  String(v ?? '').split(/\D+/).map((s) => s.replace(/^0+/, '')).filter(Boolean)

/** Forma canônica de exibição de um nº composto ('1384/1547'). */
export const numeroCanonico = (v: unknown): string => runsDeDigitos(v).join('/')

/** O campo do banco corresponde ao termo buscado?
 *  Aceita: máscara de milhar ('NF 1.234' = '1234', dígitos concatenados
 *  iguais) E nº composto real do banco ('1384/1547' contém '1384' — cada
 *  sequência do termo precisa existir no campo). '' nunca casa. */
export const mesmoNumero = (campo: unknown, termo: unknown): boolean => {
  const ct = numeroNormalizado(campo)
  const tt = numeroNormalizado(termo)
  if (tt !== '' && ct === tt) return true
  const rc = new Set(runsDeDigitos(campo))
  const rt = runsDeDigitos(termo)
  return rt.length > 0 && rt.every((x) => rc.has(x))
}

/** Fornecedor/cliente → slug de identidade: sem acento/pontuação, sem sufixo
 *  jurídico (LTDA/SA/ME/EPP/EIRELI — 'AGRO LTDA' = 'AGRO'), 20 chars (12
 *  truncava cedo demais e unia fornecedores distintos de prefixo comum). */
export function slugContraparte(nome: unknown): string {
  return String(nome ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\b(LTDA|EIRELI|EPP|MEI|ME|S ?A|SA)\b/g, ' ')
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 20)
}

// Fator de vencimento do boleto bancário: dias desde 07/10/1997. Estourou em
// 21/02/2025 (9999) e REINICIA em 1000 = 22/02/2025 — fator baixo pós-rollover
// mapearia pra 2000-2003, então somamos um ciclo (9000 dias) quando cair antes
// de 2020 (boletos reais de hoje nunca vencem lá atrás).
const BASE_FATOR_MS = Date.UTC(1997, 9, 7)
const DIA_MS = 86400000

export function vencimentoDoFator(fator: number): string | null {
  if (!Number.isFinite(fator) || fator < 1000) return null
  let ms = BASE_FATOR_MS + fator * DIA_MS
  if (new Date(ms).getUTCFullYear() < 2020) ms += 9000 * DIA_MS
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** Decodifica valor/vencimento da linha digitável (47 = bancário; 48 = arrecadação). */
export function decodificarLinhaDigitavel(digitos: string): BoletoDecodificado | null {
  const d = soDigitos(digitos)
  if (d.length === 47) {
    // campo 5 (posições 33..46): fator de vencimento (4) + valor (10, em centavos)
    const fator = Number(d.slice(33, 37))
    const valorCent = Number(d.slice(37, 47))
    return {
      linhaDigitavel: d,
      valor: valorCent > 0 ? valorCent / 100 : null,
      vencimento: vencimentoDoFator(fator),
    }
  }
  if (d.length === 48 && d.startsWith('8')) {
    // arrecadação (convênio): valor nas posições 5..15 do código de barras
    // reconstruído — na linha digitável (4 blocos de 11+1 DV) o valor fica nos
    // dígitos 4..14 do código sem os DVs de bloco. Melhor esforço:
    const semDVs = d.slice(0, 11) + d.slice(12, 23) + d.slice(24, 35) + d.slice(36, 47)
    const valorCent = Number(semDVs.slice(4, 15))
    return {
      linhaDigitavel: d,
      valor: valorCent > 0 ? valorCent / 100 : null,
      vencimento: null,
    }
  }
  return null
}

const RE_REQUISICAO = /^(?:#\s*|req\.?\s*#?\s*)(\d{1,9})$/i

export function normalizarTermo(bruto: string): TermoNormalizado {
  const trim = String(bruto || '').trim()
  const digitos = soDigitos(trim)
  const runs = runsDeDigitos(trim)
  const base: TermoNormalizado = {
    bruto: trim,
    tipo: 'texto',
    digitos,
    numeroSemZeros: digitos.replace(/^0+/, ''),
    numeroBusca: runs.slice().sort((a, b) => b.length - a.length)[0] || '',
    chaveNfe: null,
    nNFDaChave: null,
    cnpjDaChave: null,
    requisicaoId: null,
    boleto: null,
    texto: trim,
  }

  // 1) requisição explícita: "#123" / "req 123"
  const mReq = trim.match(RE_REQUISICAO)
  if (mReq) {
    return { ...base, tipo: 'requisicao_id', requisicaoId: Number(mReq[1]) }
  }

  // 2) chave NF-e (44 dígitos válidos)
  if (digitos.length === 44 && ehChaveNFeValida(digitos)) {
    const partes = partesChaveNFe(digitos)
    return {
      ...base,
      tipo: 'chave_nfe',
      chaveNfe: digitos,
      nNFDaChave: partes.nNF.replace(/^0+/, ''),
      cnpjDaChave: partes.cnpjEmitente,
    }
  }

  // 3) linha digitável de boleto (47 bancário / 48 arrecadação)
  if (digitos.length === 47 || (digitos.length === 48 && digitos.startsWith('8'))) {
    const boleto = decodificarLinhaDigitavel(digitos)
    if (boleto) return { ...base, tipo: 'linha_digitavel', boleto }
  }

  // 4) número (1..12 dígitos, só dígitos/pontuação de número no termo)
  if (digitos.length >= 1 && digitos.length <= 12 && /^[\d.\-/ ]+$/.test(trim)) {
    return { ...base, tipo: 'numero' }
  }

  // 5) texto (fornecedor/cliente)
  return base
}
