// ============================================================================
// POPs — conferência de REDAÇÃO do rascunho (PURO, client-safe).
// Pedido de 22/10/2026: o POP OFI-001 saiu com passos que descrevem a coisa
// ("Imagem da bomba alimentadora") em vez de mandar fazer ("Fotografe a bomba
// alimentadora…"). Aqui ficam as regras de escrita de POP que o editor mostra
// como sugestão (nunca bloqueia) e o envio para revisão lista antes de mandar.
//
// Regras (as mesmas do artigo "Como escrever um bom POP" da base de conhecimento):
//  1. Todo passo começa com um VERBO de ação (Fotografe, Confira, Meça…).
//  2. Um passo = uma ação.
//  3. Diga o critério de "está certo" (o que é OK e o que não é).
//  4. Foto: diga o que precisa aparecer. Número: unidade e faixa aceitável.
//  5. Cabeçalho: objetivo diz o resultado; escopo diz quando/para quê vale;
//     materiais em lista, sem "etc.".
// ============================================================================
import type { ConfigPasso, TipoPasso } from './regras'

export type CampoRedacao = 'titulo' | 'objetivo' | 'escopo' | 'materiais' | 'passo'
export interface DicaRedacao {
  campo: CampoRedacao
  passo?: number          // índice (0-based) quando campo = 'passo'
  regra: string           // id curto (para teste e para não repetir)
  texto: string           // o que melhorar, em linguagem simples
  sugestao?: string       // novo título pronto para aplicar (só em passo)
}

export interface PassoRedacao { tipo: TipoPasso; titulo: string; ajuda?: string; config?: ConfigPasso }
export interface ConteudoRedacao { titulo?: string; objetivo?: string; escopo?: string; materiais?: string; passos: PassoRedacao[] }

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Substantivo no começo do passo → verbo que manda fazer. Chave sem acento.
const NOME_PARA_VERBO: Record<string, string> = {
  imagem: 'Fotografe', imagens: 'Fotografe', foto: 'Fotografe', fotos: 'Fotografe', fotografia: 'Fotografe', video: 'Filme', registro: 'Registre',
  verificacao: 'Verifique', conferencia: 'Confira', checagem: 'Confira', inspecao: 'Inspecione', analise: 'Analise', avaliacao: 'Avalie',
  medicao: 'Meça', leitura: 'Leia', anotacao: 'Anote', limpeza: 'Limpe', lavagem: 'Lave', troca: 'Troque', substituicao: 'Substitua',
  remocao: 'Retire', retirada: 'Retire', instalacao: 'Instale', montagem: 'Monte', desmontagem: 'Desmonte', abertura: 'Abra',
  fechamento: 'Feche', aperto: 'Aperte', ajuste: 'Ajuste', regulagem: 'Regule', lubrificacao: 'Lubrifique', drenagem: 'Drene',
  abastecimento: 'Abasteça', calibragem: 'Calibre', teste: 'Teste', separacao: 'Separe', identificacao: 'Identifique',
  preenchimento: 'Preencha', assinatura: 'Assine', entrega: 'Entregue', envio: 'Envie', solicitacao: 'Solicite', aprovacao: 'Aprove',
  pagamento: 'Pague', cadastro: 'Cadastre', lancamento: 'Lance', emissao: 'Emita', impressao: 'Imprima', organizacao: 'Organize',
}
// Começos que pedem "Confira o …": a pessoa nomeou o que olhar, sem a ação.
const GRANDEZAS = new Set(['nivel', 'pressao', 'temperatura', 'estado', 'condicao', 'situacao', 'quantidade', 'horimetro', 'hodometro', 'tensao', 'carga'])
// Terminações de substantivo (ação virada coisa): -ção, -são, -gem, -mento, -dade, -ura.
const SUFIXO_NOME = /(cao|coes|sao|soes|gem|gens|mento|mentos|dade|dades)$/
const VERBOS_VAGOS = /^(verifi|chec|olh|observ|analis|avali|confir)/

const primeira = (s: string) => s.trim().split(/\s+/)[0] || ''

/** "Imagem da bomba alimentadora" → "Fotografe a bomba alimentadora". null se não souber trocar. */
export function sugerirVerbo(titulo: string): string | null {
  const t = titulo.trim()
  const pal = primeira(t)
  // "Imagem/vídeo do líquido": as duas metades da barra são nomes → "Fotografe ou filme"
  const partes = semAcento(pal).split('/').map((x) => x.replace(/[^a-z]/g, ''))
  const chave = partes[0]
  let resto = t.slice(pal.length).trim()
  if (GRANDEZAS.has(chave)) return `Confira o ${t.charAt(0).toLowerCase()}${t.slice(1)}`
  let verbo = NOME_PARA_VERBO[chave]
  if (!verbo) return null
  const outro = partes[1] ? NOME_PARA_VERBO[partes[1]] : undefined
  if (outro && outro !== verbo) verbo = `${verbo} ou ${outro.toLowerCase()}`
  // "da bomba" → "a bomba"; "do filtro" → "o filtro"; "dos/das" → "os/as"; "de X" → "X"
  resto = resto.replace(/^(d)(a|o|as|os)\b/i, (_, __, art: string) => art.toLowerCase()).replace(/^de\s+/i, '')
  return resto ? `${verbo} ${resto}` : null
}

/** O título começa como coisa (substantivo) em vez de ação? */
export function comecaSemVerbo(titulo: string): boolean {
  const pal = semAcento(primeira(titulo)).replace(/[^a-z/]/g, '')
  if (!pal) return false
  const base = pal.split('/')[0]
  if (NOME_PARA_VERBO[base] || GRANDEZAS.has(base)) return true
  return SUFIXO_NOME.test(base) && base.length > 4
}

function dicasDoPasso(p: PassoRedacao, i: number): DicaRedacao[] {
  const out: DicaRedacao[] = []
  const titulo = (p.titulo || '').trim()
  const ajuda = (p.ajuda || '').trim()
  const cfg = p.config || {}
  const d = (regra: string, texto: string, sugestao?: string) => out.push({ campo: 'passo', passo: i, regra, texto, ...(sugestao ? { sugestao } : {}) })
  if (!titulo) return out

  // Assinatura se nomeia pelo quem ("Assinatura do responsável"): virar verbo sai errado.
  if (p.tipo !== 'assinatura' && comecaSemVerbo(titulo)) {
    const s = sugerirVerbo(titulo)
    d('verbo', 'Comece com um verbo que diz o que fazer (ex.: "Fotografe…", "Confira…", "Meça…"). Do jeito que está, o passo nomeia a coisa, mas não manda fazer nada.', s || undefined)
  }
  if (titulo.length > 110) d('longo', 'Título longo: deixe só a ação no título e passe o detalhe para "Como fazer / o que é certo".')
  if ((titulo.match(/\se\s/g) || []).length >= 2 || /;/.test(titulo)) d('uma-acao', 'Parece ter mais de uma ação no mesmo passo. Um passo = uma ação: divida em passos separados.')

  switch (p.tipo) {
    case 'foto':
      if (!ajuda) d('foto-o-que', 'Diga o que precisa aparecer na foto (ex.: "peça inteira, de frente, com a etiqueta legível"). Sem isso cada um tira de um jeito.')
      break
    case 'numero':
      if (!cfg.unidade) d('unidade', 'Informe a unidade (bar, °C, h, L…).')
      if (cfg.min === undefined && cfg.max === undefined) d('faixa', 'Informe a faixa aceitável (mínimo e/ou máximo): o sistema avisa na hora quando o valor sai dela.')
      break
    case 'check':
      if (!ajuda && VERBOS_VAGOS.test(semAcento(titulo))) d('criterio', 'Diga o que é "estar OK" (ex.: "sem vazamento, sem trinca, nível entre as marcas"). "Verifique X" sozinho deixa cada um decidir o que é certo.')
      break
    case 'texto':
      if (!ajuda) d('texto-o-que', 'Diga o que a pessoa deve escrever (ex.: "descreva o defeito e onde está").')
      break
    case 'instrucao':
      if (!ajuda && titulo.length < 40) d('instrucao-curta', 'Instrução curta demais: explique em "Como fazer" o que a pessoa precisa saber nesse momento.')
      break
  }
  return out
}

/** Erros de escrita frequentes (só os que têm uma única correção certa). */
const ERROS_COMUNS: Array<{ re: RegExp; certo: string; errado: string }> = [
  { re: /\b(na|a|da|de|uma|sem)\s+perca\b/i, errado: 'perca', certo: 'perda' },
  { re: /\bconcerto\b/i, errado: 'concerto', certo: 'conserto' },
  { re: /\bderrepente\b/i, errado: 'derrepente', certo: 'de repente' },
  { re: /\bagente\s+(faz|deve|precisa|vai)\b/i, errado: 'agente', certo: 'a gente' },
]

function erros(texto: string | undefined, campo: CampoRedacao, passo?: number): DicaRedacao[] {
  const t = texto || ''
  return ERROS_COMUNS.filter((e) => e.re.test(t)).map((e) => ({ campo, ...(passo !== undefined ? { passo } : {}), regra: `grafia-${e.errado}`, texto: `Escreve-se "${e.certo}", não "${e.errado}".` }))
}

/** Todas as sugestões do rascunho, na ordem: cabeçalho → passos. */
export function conferirRedacao(c: ConteudoRedacao): DicaRedacao[] {
  const out: DicaRedacao[] = []
  const objetivo = (c.objetivo || '').trim(), escopo = (c.escopo || '').trim(), materiais = (c.materiais || '').trim()

  if (c.titulo && comecaSemVerbo(c.titulo) === false && /^(como|procedimento|pop)\b/i.test(semAcento(c.titulo).trim()))
    out.push({ campo: 'titulo', regra: 'titulo-rotulo', texto: 'O título não precisa de "Procedimento/Como": diga o processo direto (ex.: "Inspeção de combustível na entrega do trator").' })
  if (!objetivo) out.push({ campo: 'objetivo', regra: 'objetivo-vazio', texto: 'Diga em uma frase o resultado que o POP garante (ex.: "Trator entregue sem falha de alimentação de combustível").' })
  else if (objetivo.length < 25) out.push({ campo: 'objetivo', regra: 'objetivo-curto', texto: 'Objetivo curto demais: diga o resultado esperado e para quem.' })
  else if (/\bnao\b.*\bnao\b/.test(semAcento(objetivo)) || /^(evitar|prevenir) que .*\bnao\b/.test(semAcento(objetivo)))
    out.push({ campo: 'objetivo', regra: 'objetivo-negativo', texto: 'Escreva o objetivo pelo resultado positivo (ex.: "Garantir que o trator funcione sem falha na entrega"), sem dupla negação.' })
  if (!escopo) out.push({ campo: 'escopo', regra: 'escopo-vazio', texto: 'Diga quando e a quê o POP se aplica (ex.: "Todo trator novo, antes da entrega ao cliente").' })
  else if (!/\b(todo|toda|todos|todas|sempre|quando|antes|depois|apos|cada|durante|sempre)\b/.test(semAcento(escopo)))
    out.push({ campo: 'escopo', regra: 'escopo-quando', texto: 'O escopo explica o que fazer; diga também QUANDO vale e para quais casos (ex.: "Todo trator novo, antes da entrega").' })
  if (/\betc\b/.test(semAcento(materiais)) || /\b(como|tipo)\b/.test(semAcento(materiais)))
    out.push({ campo: 'materiais', regra: 'materiais-lista', texto: 'Liste os materiais um a um (ex.: "chave de fenda 1/4", "bandeja", "pano limpo"), sem "como…" ou "etc.": quem vai executar precisa saber o que separar.' })

  out.push(...erros(c.objetivo, 'objetivo'), ...erros(c.escopo, 'escopo'), ...erros(c.materiais, 'materiais'))
  c.passos.forEach((p, i) => { out.push(...dicasDoPasso(p, i), ...erros(`${p.titulo} ${p.ajuda || ''}`, 'passo', i)) })
  return out
}

/** As regras em texto curto, para o quadro do editor. */
export const REGRAS_REDACAO: Array<{ titulo: string; ruim: string; bom: string }> = [
  { titulo: 'Comece cada passo com um verbo', ruim: 'Imagem da bomba alimentadora', bom: 'Fotografe a bomba alimentadora' },
  { titulo: 'Um passo, uma ação', ruim: 'Abra o tanque, drene e confira o filtro', bom: '1. Abra o tanque · 2. Drene · 3. Confira o filtro' },
  { titulo: 'Diga o que é "estar certo"', ruim: 'Verifique o filtro', bom: 'Confira o filtro: sem água e sem borra no copo' },
  { titulo: 'Foto: diga o que precisa aparecer', ruim: 'Foto do filtro', bom: 'Fotografe o copo do filtro de frente, com o líquido visível' },
  { titulo: 'Número: unidade e faixa', ruim: 'Pressão', bom: 'Meça a pressão do pneu (bar, entre 1,2 e 1,6)' },
  { titulo: 'Objetivo = resultado; escopo = quando vale', ruim: 'Prevenir que o trator não apresente falhas', bom: 'Trator entregue sem falha de combustível · todo trator novo, antes da entrega' },
]
