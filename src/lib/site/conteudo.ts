// Conteúdo editável do site (Comercial → Site → Conteúdo). Os campos espelham src/config/conteudo.ts do site;
// o texto padrão vem do próprio site (SITE_URL/conteudo-padrao.json).

export type GrupoConteudo = 'contato' | 'horario' | 'home' | 'banners' | 'aviso'
export type TipoCampo = 'texto' | 'longo' | 'telefone' | 'url' | 'periodo' | 'liga'

export interface Campo { chave: string; rotulo: string; tipo: TipoCampo; ajuda?: string }
export interface Secao { grupo: GrupoConteudo; titulo: string; descricao: string; icone: string; campos: Campo[] }

export const SECOES: Secao[] = [
  {
    grupo: 'aviso', titulo: 'Faixa de aviso', icone: 'fa-bullhorn',
    descricao: 'Uma faixa vermelha no topo de todas as páginas. Ex.: feriado, feira, promoção.',
    campos: [
      { chave: 'ligado', rotulo: 'Mostrar a faixa no site', tipo: 'liga' },
      { chave: 'texto', rotulo: 'Texto da faixa', tipo: 'texto', ajuda: 'Curto: cabe numa linha no celular.' },
      { chave: 'link', rotulo: 'Link ao tocar (opcional)', tipo: 'url', ajuda: 'Ex.: /credito/ ou https://…' },
    ],
  },
  {
    grupo: 'home', titulo: 'Topo da página inicial', icone: 'fa-house',
    descricao: 'O texto por cima do vídeo da loja, a primeira coisa que o cliente vê.',
    campos: [
      { chave: 'olho', rotulo: 'Linha pequena de cima', tipo: 'texto' },
      { chave: 'titulo', rotulo: 'Título', tipo: 'texto' },
      { chave: 'texto', rotulo: 'Linha de apoio', tipo: 'texto' },
    ],
  },
  {
    grupo: 'contato', titulo: 'Telefones, endereço e redes', icone: 'fa-phone',
    descricao: 'Aparecem no topo, no rodapé, no Contato, no Pós-venda, em Peças e nos botões de WhatsApp.',
    campos: [
      { chave: 'telefone', rotulo: 'Telefone fixo', tipo: 'telefone' },
      { chave: 'celular', rotulo: 'Celular', tipo: 'telefone' },
      { chave: 'whatsapp', rotulo: 'WhatsApp dos vendedores (botões do site)', tipo: 'telefone' },
      { chave: 'posVendas', rotulo: 'Pós-Vendas (telefone e WhatsApp)', tipo: 'telefone' },
      { chave: 'pecas', rotulo: 'Peças (WhatsApp)', tipo: 'telefone' },
      { chave: 'endereco', rotulo: 'Endereço', tipo: 'texto' },
      { chave: 'cidade', rotulo: 'Cidade', tipo: 'texto' },
      { chave: 'uf', rotulo: 'Estado (UF)', tipo: 'texto' },
      { chave: 'instagram', rotulo: 'Instagram', tipo: 'url' },
      { chave: 'facebook', rotulo: 'Facebook', tipo: 'url' },
      { chave: 'youtube', rotulo: 'YouTube', tipo: 'url' },
    ],
  },
  {
    grupo: 'horario', titulo: 'Horário de atendimento', icone: 'fa-clock',
    descricao: 'Usado no rodapé, no Contato, no aviso "aberto agora" e no Google.',
    campos: [
      { chave: 'manha', rotulo: 'Segunda a sexta — manhã', tipo: 'periodo', ajuda: 'Ex.: 07:30-11:30' },
      { chave: 'tarde', rotulo: 'Segunda a sexta — tarde', tipo: 'periodo', ajuda: 'Ex.: 12:30-17:30' },
      { chave: 'sabado', rotulo: 'Sábado', tipo: 'periodo', ajuda: 'Vazio = fechado. Ex.: 07:30-11:30' },
    ],
  },
  {
    grupo: 'banners', titulo: 'Textos dos banners', icone: 'fa-image',
    descricao: 'A frase embaixo do título no topo de cada página.',
    campos: [
      { chave: 'credito', rotulo: 'Crédito', tipo: 'longo' },
      { chave: 'posVenda', rotulo: 'Pós-venda', tipo: 'longo' },
      { chave: 'pecas', rotulo: 'Peças', tipo: 'longo' },
      { chave: 'contato', rotulo: 'Contato', tipo: 'longo' },
      { chave: 'implementos', rotulo: 'Implementos (depois de "N implementos de N marcas.")', tipo: 'longo' },
    ],
  },
]

export const GRUPOS = SECOES.map((s) => s.grupo)

/** Confere e limpa o que veio da tela. Devolve o valor limpo ou a mensagem de erro do primeiro campo ruim. */
export function validarGrupo(grupo: GrupoConteudo, valor: Record<string, unknown>): { ok: true; valor: Record<string, unknown> } | { ok: false; erro: string } {
  const sec = SECOES.find((s) => s.grupo === grupo)
  if (!sec) return { ok: false, erro: 'seção inválida' }
  const limpo: Record<string, unknown> = {}
  for (const c of sec.campos) {
    if (!(c.chave in valor)) continue
    const v = valor[c.chave]
    if (c.tipo === 'liga') { limpo[c.chave] = v === true; continue }
    const t = String(v ?? '').trim().slice(0, c.tipo === 'longo' ? 300 : 160)
    if (c.tipo === 'telefone' && t && t.replace(/\D/g, '').length < 10) return { ok: false, erro: `${c.rotulo}: telefone com DDD (10 ou 11 números)` }
    if (c.tipo === 'url' && t && !/^(https?:\/\/|\/)/.test(t)) return { ok: false, erro: `${c.rotulo}: comece com https:// ou /` }
    if (c.tipo === 'periodo' && t && !/^\d{1,2}:?\d{2}\s*[-–a]+\s*\d{1,2}:?\d{2}$/.test(t)) return { ok: false, erro: `${c.rotulo}: use o formato 07:30-11:30` }
    limpo[c.chave] = t
  }
  return { ok: true, valor: limpo }
}
