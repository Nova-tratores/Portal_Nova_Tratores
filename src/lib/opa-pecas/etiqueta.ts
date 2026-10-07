// Etiquetas das Peças Não Identificadas — reaproveita o gerador do PPV
// (lib/ppv/etiquetas-html: folha Pimaco 6180 3×10 ou papel comum com corte,
// window.print do navegador) e as preferências de papel/calibração que a tela
// de Etiquetas do PPV guarda no navegador. NÃO usa a fila do PPV.
//
// Economia de papel: a folha adesiva é aproveitada até o fim. Guardamos neste
// navegador a próxima posição livre da folha (0–29); a próxima impressão
// começa dali e as posições já usadas saem em branco.
// QR = link público da peça (/e/<chave>): qualquer celular abre os dados
// básicos sem login. A localização ocupa a zona grande de "locação".
// Medidas: Pimaco/Avery 6180 (66,7 × 25,4 mm, folha Carta) — as mesmas da tela
// de Etiquetas do módulo Peças, de onde vêm o papel da impressora e o ajuste fino.

import QRCode from 'qrcode'
import { htmlFolha, qrSvg, type BlocoEtiqueta, type OpcoesFolha } from '@/lib/ppv/etiquetas-html'

export const POR_FOLHA = 30
const CHAVE_PROXIMA = 'pni_etiqueta_proxima_posicao'

export interface EtiquetaItem {
  codigo: string
  /** chave do link público (pni_itens.token_publico) */
  token: string
  descricao: string | null
  quantidade?: number
  local?: string
}

export function urlPublica(origem: string, token: string): string {
  return `${origem}/e/${token}`
}

/** Próxima posição livre da folha em uso (0 = folha nova). */
export function proximaPosicao(): number {
  try {
    const n = Number(localStorage.getItem(CHAVE_PROXIMA))
    return Number.isInteger(n) && n >= 0 && n < POR_FOLHA ? n : 0
  } catch {
    return 0
  }
}

export function guardarProximaPosicao(n: number) {
  try { localStorage.setItem(CHAVE_PROXIMA, String(((n % POR_FOLHA) + POR_FOLHA) % POR_FOLHA)) } catch { /* sem storage */ }
}

/** Onde a folha fica depois de imprimir `qtd` etiquetas começando em `inicio`. */
export function posicaoDepois(inicio: number, qtd: number): number {
  return (inicio + qtd) % POR_FOLHA
}

/** Quantas folhas a impressão vai gastar (contando a parcial). */
export function folhasNecessarias(inicio: number, qtd: number): number {
  return qtd === 0 ? 0 : Math.ceil((inicio + qtd) / POR_FOLHA)
}

export interface AjustesImpressao {
  papel: 'carta' | 'a4'
  x: number
  y: number
  recorte: boolean
}

/** Calibração gravada pela tela de Etiquetas do módulo Peças (mesmas chaves e padrões). */
export function ajustesImpressao(): AjustesImpressao {
  const a: AjustesImpressao = { papel: 'carta', x: 0, y: 0, recorte: false }
  try {
    a.papel = localStorage.getItem('etiquetas_papel') === 'a4' ? 'a4' : 'carta'
    a.x = Number(localStorage.getItem('etiquetas_ajuste_x')) || 0
    a.y = Number(localStorage.getItem('etiquetas_ajuste_y')) || 0
    a.recorte = localStorage.getItem('etiquetas_formato') === 'recorte'
  } catch { /* sem storage: padrões do PPV */ }
  return a
}

function preferencias(): OpcoesFolha {
  const a = ajustesImpressao()
  return { titulo: 'Peças S/Estoque', papel: a.papel, x: a.x, y: a.y, tracejado: a.recorte, comBarra: false }
}

/**
 * Abre a folha de etiquetas e o diálogo de impressão, começando na posição
 * `inicio` da primeira folha. Chamar DIRETO no clique (window.open fora de
 * gesto do usuário é bloqueado). Devolve false se o navegador bloqueou.
 */
export function imprimirEtiquetas(itens: EtiquetaItem[], inicio = 0): boolean {
  const w = window.open('', '_blank')
  if (!w) return false
  try {
    const blocos: BlocoEtiqueta[] = itens.map((i) => ({
      linhas: [{
        empresa: 'PN',
        codigo: i.codigo,
        descricao: (i.descricao || 'Peça não identificada') + (i.quantidade && i.quantidade > 1 ? ` (${i.quantidade} un.)` : ''),
        locacao: i.local || '',
      }],
      qrSvg: qrSvg(QRCode.create(urlPublica(window.location.origin, i.token), { errorCorrectionLevel: 'M' }).modules),
      numero: null,
    }))
    const usadas = new Set(Array.from({ length: inicio }, (_, k) => k))
    w.document.write(htmlFolha(blocos, usadas, preferencias()))
    w.document.close()
    return true
  } catch {
    w.close()
    return false
  }
}
