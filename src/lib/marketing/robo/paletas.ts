// Cores do texto por cima da cena (José, 26/11/2026: "não usa sempre as mesmas cores na fonte"). O robô alterna.
// Arquivo puro (sem servidor): a tela "Editar arte" usa as mesmas bolinhas de cor.
export type Paleta = 'ouro' | 'vermelho' | 'amarelo' | 'verde' | 'laranja' | 'branco'
export type Posicao = 'alto' | 'baixo'
/** Composição (José, 26/11: "os posts estão muito semelhantes"). cena = imagem inteira com texto por cima ·
 *  faixa = cena em cima + bloco de cor sólida com o texto embaixo · quadro = fundo de cor, texto e a cena num quadro. */
export type Estilo = 'cena' | 'faixa' | 'quadro'
export const ESTILOS: Record<Estilo, string> = { cena: 'Cena inteira', faixa: 'Faixa de cor', quadro: 'Quadro' }
export const ESTILOS_EM_ORDEM = Object.keys(ESTILOS) as Estilo[]

/** t1 = 1ª linha do título · t2 = resto · destaque = parte colorida da frase · base = fundo sólido (faixa/quadro) */
export const PALETAS: Record<Paleta, { nome: string; t1: string; t2: string; destaque: string; base: string }> = {
  ouro:     { nome: 'Dourado',  t1: '#f2c14e', t2: '#ffffff', destaque: '#f2c14e', base: '#1c1f24' },
  vermelho: { nome: 'Vermelho', t1: '#ff4b5f', t2: '#ffffff', destaque: '#ff7a88', base: '#8a0f20' },
  amarelo:  { nome: 'Amarelo',  t1: '#ffe14d', t2: '#fff8e1', destaque: '#ffe14d', base: '#23262b' },
  verde:    { nome: 'Verde',    t1: '#9be15d', t2: '#ffffff', destaque: '#9be15d', base: '#16402a' },
  laranja:  { nome: 'Laranja',  t1: '#ffa94d', t2: '#ffffff', destaque: '#ffa94d', base: '#3d200d' },
  branco:   { nome: 'Branco',   t1: '#ffffff', t2: '#ffffff', destaque: '#f2c14e', base: '#173a63' },
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
  estilo?: Estilo                // sem estilo = 'cena' (posts antigos)
  foto_id?: string | null
  cena_pedido?: string
}
