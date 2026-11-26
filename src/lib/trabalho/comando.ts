// Ctrl+K — PEDIR EM LINGUAGEM NATURAL (melhorias 5.4, 25/11/2026). Regras puras, sem IA e sem banco
// (testes em __tests__/comando.test.ts). Entende:
//  · "pedir pro Mariano atualizar custo das máquinas até sexta" → pedido (pessoa, título, prazo)
//    que SÓ PREENCHE o formulário de pedido — quem pediu revisa e envia. Nunca cria direto.
//  · navegação: "minha fila", "faxina", "equipe", "agenda", "reuniões", "ideias", "todos"...
//  · "#305", "ir para #305", "abrir 305" → abre o pedido.

export interface PessoaCmd { id: string; nome: string }

export type Comando =
  | { tipo: 'pedir'; pessoa: PessoaCmd | null; candidatos: PessoaCmd[]; mencao: string; titulo: string; prazo: string | null }
  | { tipo: 'ir'; destino: string; rotulo: string }
  | { tipo: 'ticket'; numero: number }

const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const somaDias = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const diaSemana = (iso: string) => new Date(iso + 'T12:00:00Z').getUTCDay()

const DIAS: Record<string, number> = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 }

export const DESTINOS: { chaves: string[]; destino: string; rotulo: string }[] = [
  { chaves: ['minha fila', 'fila', 'meu dia', 'inicio'], destino: '/fila', rotulo: 'Minha fila' },
  { chaves: ['faxina', 'parados'], destino: '/fila/faxina', rotulo: 'Faxina dos parados' },
  { chaves: ['equipe', 'carga da equipe', 'carga'], destino: '/fila/equipe', rotulo: 'Equipe' },
  { chaves: ['todos', 'todos os pedidos', 'cronograma', 'kanban'], destino: '/cronograma', rotulo: 'Todos os pedidos' },
  { chaves: ['agenda', 'calendario'], destino: '/agenda', rotulo: 'Agenda' },
  { chaves: ['salas', 'sala'], destino: '/salas', rotulo: 'Salas' },
  { chaves: ['reunioes', 'reuniao', 'pauta'], destino: '/reunioes', rotulo: 'Reuniões' },
  { chaves: ['historico de reunioes', 'atas', 'ata'], destino: '/reunioes?aba=historico', rotulo: 'Histórico de reuniões' },
  { chaves: ['ideias', 'ideia'], destino: '/ideias', rotulo: 'Ideias' },
  { chaves: ['pendencias', 'tarefas'], destino: '/tarefas', rotulo: 'Pendências' },
]

/**
 * Prazo dito em palavras, no FIM da frase: "até sexta", "pra amanhã", "hoje", "até 05/12",
 * "em 3 dias", "semana que vem". Dia da semana = a PRÓXIMA (sexta, numa sexta, é a da outra semana).
 * Devolve o texto sem o pedaço do prazo.
 */
export function lerPrazoNatural(frase: string, hoje: string): { resto: string; prazo: string | null } {
  const s = sem(frase)
  const prep = '(?:\\s+(?:ate|para|pra|pro|no|na|de|em|o|a|dia))*'
  const tentar = (re: RegExp, calc: (m: RegExpMatchArray) => string | null) => {
    const m = s.match(re)
    if (!m || m.index === undefined) return null
    const prazo = calc(m)
    return prazo ? { resto: frase.slice(0, m.index).trim().replace(/[\s,;:-]+$/, ''), prazo } : null
  }
  const fim = '\\s*[.!]?\\s*$'
  return (
    tentar(new RegExp(`${prep}\\s+hoje${fim}`), () => hoje)
    || tentar(new RegExp(`${prep}\\s+depois de amanha${fim}`), () => somaDias(hoje, 2))
    || tentar(new RegExp(`${prep}\\s+amanha${fim}`), () => somaDias(hoje, 1))
    || tentar(new RegExp(`${prep}\\s+(?:a\\s+)?(?:semana que vem|proxima semana)${fim}`), () => { const w = diaSemana(hoje); return somaDias(hoje, (w === 0 ? -6 : 1 - w) + 11) }) // sexta da próxima semana
    || tentar(new RegExp(`${prep}\\s+(?:proxim[ao]\\s+)?(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:-feira)?(?:\\s+que vem)?${fim}`), (m) => {
      const alvo = DIAS[m[1]]; const w = diaSemana(hoje)
      return somaDias(hoje, ((alvo - w + 7) % 7) || 7)
    })
    || tentar(new RegExp(`${prep}\\s+(?:daqui a\\s+)?(\\d{1,2})\\s+dias?(?:\\s+uteis)?${fim}`), (m) => somaDias(hoje, Number(m[1])))
    || tentar(new RegExp(`${prep}\\s+(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?${fim}`), (m) => {
      const dia = Number(m[1]), mes = Number(m[2])
      if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null
      let ano = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : Number(hoje.slice(0, 4))
      const iso = (a: number) => `${a}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
      if (!m[3] && iso(ano) < hoje) ano++
      return iso(ano)
    })
    || { resto: frase.trim(), prazo: null }
  )
}

/** Acha a pessoa pelo nome falado ("Mariano", "Ana Clara"). Devolve todos os que servem. */
export function acharPessoa(falado: string, pessoas: PessoaCmd[]): PessoaCmd[] {
  const partes = sem(falado).split(/\s+/).filter(Boolean)
  if (!partes.length) return []
  return pessoas.filter((p) => {
    const nomes = sem(p.nome).split(/\s+/)
    return nomes[0] === partes[0] && partes.slice(1).every((x) => nomes.slice(1).some((n) => n.startsWith(x)))
  })
}

const VERBO = /^(?:pedir|pede|pe[cç]a|pedido|solicitar|solicita|mandar|manda)\s+(?:(?:pro|pra|para|ao|a|à)\s+)?(?:(?:o|a)\s+)?/i

/** Interpreta a frase. null = não entendi (a paleta mostra as opções). */
export function interpretarComando(frase: string, pessoas: PessoaCmd[], hoje: string): Comando | null {
  const f = frase.trim()
  if (!f) return null
  const s = sem(f)

  // "#305", "ir para #305", "abrir 305", "pedido 305"
  const num = s.match(/^(?:(?:ir\s+(?:para|pro|pra)|abrir|abre|ver|pedido|ticket)\s+)?#?(\d{1,6})$/)
  if (num) return { tipo: 'ticket', numero: Number(num[1]) }

  // navegação: "minha fila", "ir para a faxina", "abrir agenda"
  const nav = s.replace(/^(?:ir\s+(?:para|pro|pra)|abrir|abre|ver|mostrar)\s+(?:(?:a|o|as|os)\s+)?/, '').replace(/[.!?]+$/, '').trim()
  for (const d of DESTINOS) if (d.chaves.includes(nav)) return { tipo: 'ir', destino: d.destino, rotulo: d.rotulo }

  // pedir
  const v = f.match(VERBO)
  if (!v) return null
  const depois = f.slice(v[0].length).trim()
  // Nome: 1 palavra; 2 se assim acha um só ("Ana Clara").
  const pal = depois.split(/\s+/)
  const limpar = (x: string) => x.replace(/[,:;]+$/, '')
  let mencao = limpar(pal[0] || '')
  let cands = acharPessoa(mencao, pessoas)
  let usadas = 1
  if (cands.length > 1 && pal[1]) {
    const dois = acharPessoa(`${mencao} ${limpar(pal[1])}`, pessoas)
    if (dois.length >= 1) { cands = dois; mencao = `${mencao} ${limpar(pal[1])}`; usadas = 2 }
  }
  const texto = pal.slice(usadas).join(' ').replace(/^[,:;-]\s*/, '').replace(/^(?:que|pra|para)\s+/i, '')
  const { resto, prazo } = lerPrazoNatural(texto, hoje)
  const titulo = resto.replace(/\s+/g, ' ').trim()
  return {
    tipo: 'pedir', pessoa: cands.length === 1 ? cands[0] : null, candidatos: cands, mencao,
    titulo: titulo ? titulo.charAt(0).toUpperCase() + titulo.slice(1) : '', prazo,
  }
}
