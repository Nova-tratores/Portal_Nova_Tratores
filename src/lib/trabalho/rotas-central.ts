// ENDEREÇOS DA CENTRAL DE TRABALHO (José, 27/11/2026: "arruma a url de toda a central de trabalho,
// parece que está tudo jogado"). Tudo passa a morar em /central/... As telas continuam nos mesmos
// arquivos (pastas antigas); o next.config faz:
//   · rewrites:  /central/...  → serve a tela da pasta antiga (o navegador mostra o endereço novo)
//   · redirects: endereço antigo → endereço novo (avisos no sino, WhatsApp e favoritos seguem valendo)
// SEM dependências (o next.config importa este arquivo).

/** [endereço novo, endereço antigo (pasta real)] — do mais específico para o mais geral. */
export const MAPA_CENTRAL: [string, string][] = [
  ['/central/esperando', '/fila/esperando'],
  ['/central/equipe', '/fila/equipe'],
  ['/central/faxina', '/fila/faxina'],
  ['/central/teste', '/fila/teste'],
  ['/central/todos', '/cronograma'],
  ['/central/compras', '/tickets/compras'],
  ['/central/quadros', '/tickets/quadros'],
  ['/central/agenda', '/agenda'],
  ['/central/salas', '/salas'],
  ['/central/reunioes', '/reunioes'],
  ['/central/ideias', '/ideias'],
  ['/central/pendencias', '/tarefas'],
]

/** Rewrites do next.config: endereço novo → pasta antiga. */
export function rewritesCentral() {
  return [
    ...MAPA_CENTRAL.flatMap(([novo, antigo]) => [
      { source: novo, destination: antigo },
      { source: `${novo}/:resto*`, destination: `${antigo}/:resto*` },
    ]),
    // Visão geral (antes /tickets) e um pedido (antes /tickets/<id>)
    { source: '/central/visao-geral', destination: '/tickets' },
    { source: '/central/pedido/:id', destination: '/tickets/:id' },
    // Minha fila (antes /fila) — por último: é o mais geral
    { source: '/central', destination: '/fila' },
  ]
}

/** Redirects do next.config: endereço antigo → novo (permanent: false, como os outros do projeto). */
export function redirectsCentral() {
  return [
    ...MAPA_CENTRAL.flatMap(([novo, antigo]) => [
      { source: antigo, destination: novo, permanent: false },
      { source: `${antigo}/:resto*`, destination: `${novo}/:resto*`, permanent: false },
    ]),
    { source: '/fila/prototipo', destination: '/central', permanent: false },
    { source: '/fila', destination: '/central', permanent: false },
    { source: '/tickets', destination: '/central/visao-geral', permanent: false },
    // /tickets/<id> → /central/pedido/<id> (compras e quadros já foram acima)
    { source: '/tickets/:id((?!compras$|quadros$)[^/]+)', destination: '/central/pedido/:id', permanent: false },
  ]
}

/**
 * Endereço novo → o antigo (a pasta real). A barra da Central e outros lugares que comparam o
 * endereço continuam com a regra antiga passando por aqui. Endereço que não é da Central volta igual.
 */
export function rotaInterna(pathname: string): string {
  if (pathname === '/central') return '/fila'
  if (pathname === '/central/visao-geral') return '/tickets'
  if (pathname.startsWith('/central/pedido/')) return '/tickets/' + pathname.slice('/central/pedido/'.length)
  for (const [novo, antigo] of MAPA_CENTRAL) {
    if (pathname === novo || pathname.startsWith(novo + '/')) return antigo + pathname.slice(novo.length)
  }
  return pathname
}

/** Endereço antigo → o novo (para os links da barra e do menu). */
export function rotaNova(antigo: string): string {
  if (antigo === '/fila') return '/central'
  if (antigo === '/tickets') return '/central/visao-geral'
  for (const [novo, velho] of MAPA_CENTRAL) {
    if (antigo === velho || antigo.startsWith(velho + '/')) return novo + antigo.slice(velho.length)
  }
  if (/^\/tickets\/[^/]+$/.test(antigo)) return '/central/pedido/' + antigo.slice('/tickets/'.length)
  return antigo
}
