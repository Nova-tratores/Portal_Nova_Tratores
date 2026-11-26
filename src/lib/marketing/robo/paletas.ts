// Cores do texto por cima da cena (José, 26/11/2026: "não usa sempre as mesmas cores na fonte"). O robô alterna.
// Arquivo puro (sem servidor): a tela "Editar arte" usa as mesmas bolinhas de cor.
export type Paleta = 'ouro' | 'vermelho' | 'amarelo' | 'verde' | 'laranja' | 'branco'
export type Posicao = 'alto' | 'baixo'

export const PALETAS: Record<Paleta, { nome: string; t1: string; t2: string; destaque: string }> = {
  ouro:     { nome: 'Dourado',  t1: '#f2c14e', t2: '#ffffff', destaque: '#f2c14e' },
  vermelho: { nome: 'Vermelho', t1: '#ff4b5f', t2: '#ffffff', destaque: '#ff7a88' },
  amarelo:  { nome: 'Amarelo',  t1: '#ffe14d', t2: '#fff8e1', destaque: '#ffe14d' },
  verde:    { nome: 'Verde',    t1: '#9be15d', t2: '#ffffff', destaque: '#9be15d' },
  laranja:  { nome: 'Laranja',  t1: '#ffa94d', t2: '#ffffff', destaque: '#ffa94d' },
  branco:   { nome: 'Branco',   t1: '#ffffff', t2: '#ffffff', destaque: '#f2c14e' },
}
export const PALETAS_EM_ORDEM = Object.keys(PALETAS) as Paleta[]

/** As camadas da arte (site_posts.arte). */
export type Camadas = {
  cena: string
  data: { nome: string; dia: string } | null
  titulo: string
  frase: string
  destaque: string
  paleta: Paleta
  posicao: Posicao
  foto_id?: string | null
  cena_pedido?: string
}
