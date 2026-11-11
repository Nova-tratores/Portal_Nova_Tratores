// Visitas INVENTADAS para ver a tela Site → Acessos cheia enquanto o site novo não está no ar (José, 11/11/2026).
// Só aparecem com ?exemplo=1, e a tela avisa em amarelo. Sorteio com semente fixa: o mesmo período dá os mesmos números.
import type { EventoSite } from './acessos'

function sorteio(semente: number) {
  let s = semente >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32 }
}
const pega = <T,>(r: () => number, l: readonly (readonly [T, number])[]): T => {
  const total = l.reduce((s, [, p]) => s + p, 0)
  let x = r() * total
  for (const [v, p] of l) { x -= p; if (x <= 0) return v }
  return l[0][0]
}

const T = ' — Nova Tratores'
const PRODUTOS = [
  ['/trator-mahindra-6075/', `Mahindra 6075${T}`, 9], ['/trator-mahindra-2025/', `Mahindra 2025${T}`, 6],
  ['/trator-mahindra-5050/', `Mahindra 5050${T}`, 5], ['/trator-mahindra-6075e/', `Mahindra 6075E${T}`, 4],
  ['/trator-mahindra-7095/', `Mahindra 7095${T}`, 3], ['/trator-mahindra-oja-3140/', `Mahindra OJA 3140${T}`, 3],
  ['/trator-mahindra-8110/', `Mahindra 8110${T}`, 2], ['/trator-mahindra-6060/', `Mahindra 6060${T}`, 2],
  ['/rocadeira-hidraulica-kuhn/', `Roçadeira Kuhn${T}`, 3], ['/arado-reversivel-ar-tatu-marchesan/', `Arado Reversível Tatu Marchesan AR${T}`, 2],
  ['/adubadeiras-fertinox/', `Adubadeiras Marispan Fertinox${T}`, 2], ['/carreta-agricola-kamaq/', `Carreta Agrícola Kamaq${T}`, 2],
] as const
const PAGINAS = [
  ['/', `Nova Tratores — Mahindra em Piraju`, 10], ['/tratores/', `Tratores Mahindra${T}`, 7], ['/implementos/', `Implementos${T}`, 4],
  ['/credito/', `Crédito e financiamento${T}`, 4], ['/pecas-genuinas-mahindra/', `Peças genuínas Mahindra${T}`, 4],
  ['/pos-venda/', `Pós-venda${T}`, 2], ['/oficina/', `Oficina${T}`, 1], ['/garantia/', `Garantia${T}`, 1],
  ['/avaliar-usado/', `Quanto vale seu usado${T}`, 2], ['/contato/', `Contato${T}`, 2],
] as const
const ORIGENS: readonly (readonly [readonly [string, string], number])[] = [
  [['https://www.google.com/', ''], 40], [['', ''], 22], [['https://l.instagram.com/', ''], 13], [['https://m.facebook.com/', ''], 7],
  [['', 'google-ads'], 10], [['https://web.whatsapp.com/', ''], 6], [['https://www.youtube.com/', ''], 2],
] as const
const CONTATOS = [
  ['clique_whatsapp', 'Falar no WhatsApp', 30], ['simulador_whatsapp', 'Moderfrota', 10], ['simulador_formulario', 'Pronaf', 6],
  ['pecas_whatsapp', '006013427C1', 9], ['posvenda_whatsapp', 'Agendar revisão', 7], ['clique_telefone', '(14) 3351-1234', 8],
  ['usado_whatsapp', 'Massey Ferguson 275', 5], ['clique_whatsapp_trator_ideal', 'Café', 4],
] as const
const BUSCAS = [['tratores', 'cabine'], ['tratores', '6075'], ['tratores', 'café'], ['implementos', 'roçadeira'], ['implementos', 'plantadeira'],
  ['implementos', 'pá carregadeira'], ['tratores', 'pomar'], ['implementos', 'pulverizador']] as const
const SEM_RESULTADO = [['tratores', '4x2 120 cv'], ['implementos', 'colhedora de café'], ['implementos', 'retroescavadeira']] as const
const PECAS = ['filtro de óleo', 'filtro de ar', 'bomba hidráulica', 'embreagem', 'farol', 'correia'] as const
// Hora do dia em que mais entram (peso por hora, 0–23): cedo e à noite, depois da lida.
const HORAS = [1, 0, 0, 0, 1, 3, 6, 8, 7, 6, 5, 5, 6, 5, 5, 5, 5, 6, 8, 10, 11, 9, 5, 2]

export function eventosExemplo(desde: string, ate: string, semente: number, escala = 1): EventoSite[] {
  const r = sorteio(Math.floor(Date.parse(desde) / 86_400_000) * 31 + semente)
  const ini = Date.parse(desde), fim = Math.min(Date.parse(ate), Date.now())
  // meia-noite de Piraju (-03:00) do primeiro dia
  const zero = Date.parse(new Date(ini - 3 * 3_600_000).toISOString().slice(0, 10) + 'T03:00:00Z')
  const dias = Math.max(1, Math.ceil((fim - zero) / 86_400_000))
  const total = Math.round(dias * 38 * escala)
  const eventos: EventoSite[] = []
  const visitantes: string[] = []
  for (let i = 0; i < total; i++) {
    const dia = Math.floor(r() * dias)
    const hora = pega(r, HORAS.map((p, h) => [h, p] as const))
    let t = zero + dia * 86_400_000 + hora * 3_600_000 + Math.floor(r() * 3_600_000)
    if (t < ini || t > fim) continue
    const voltou = visitantes.length > 5 && r() < 0.22
    const visitante = voltou ? visitantes[Math.floor(r() * visitantes.length)] : `ex-v${semente}-${i}`
    if (!voltou) visitantes.push(visitante)
    const sessao = `ex-s${semente}-${i}`
    const [origem, utm] = pega(r, ORIGENS)
    const aparelho = pega(r, [['celular', 78], ['computador', 18], ['tablet', 4]] as const)
    const campanha = utm === 'google-ads' ? pega(r, [['safra-2027', 6], ['6075-pronaf', 4]] as const) : origem.includes('instagram') && r() < 0.4 ? 'post-6075-cabine' : ''
    const base = { visitante, sessao, origem, utm, campanha, aparelho }
    // entra pela home, por um produto (Google) ou por outra página
    const caminho: (readonly [string, string])[] = []
    const entraProduto = origem.includes('google') && r() < 0.45
    caminho.push(entraProduto ? (pega(r, PRODUTOS.map(([c, ti, p]) => [[c, ti] as const, p] as const))) : pega(r, PAGINAS.map(([c, ti, p]) => [[c, ti] as const, p] as const)))
    const mais = pega(r, [[0, 42], [1, 25], [2, 16], [3, 10], [5, 7]] as const)
    for (let k = 0; k < mais; k++) {
      caminho.push(r() < 0.5 ? pega(r, PRODUTOS.map(([c, ti, p]) => [[c, ti] as const, p] as const)) : pega(r, PAGINAS.map(([c, ti, p]) => [[c, ti] as const, p] as const)))
    }
    for (const [c, titulo] of caminho) {
      eventos.push({ em: new Date(t).toISOString(), tipo: 'pagina', caminho: c, titulo, ...base })
      const fica = Math.round(8 + r() * (caminho.length > 1 ? 110 : 50))
      if (c === '/tratores/' && r() < 0.18) { const [, q] = BUSCAS[Math.floor(r() * 3)]; eventos.push({ em: new Date(t + 4000).toISOString(), tipo: 'clique', caminho: c, evento: 'busca_tratores', rotulo: q, ...base }) }
      if (c === '/implementos/' && r() < 0.3) { const [, q] = BUSCAS[3 + Math.floor(r() * 5)]; eventos.push({ em: new Date(t + 4000).toISOString(), tipo: 'clique', caminho: c, evento: 'busca_implementos', rotulo: q, ...base }) }
      if (/^\/(tratores|implementos)\/$/.test(c) && r() < 0.06) {
        const [onde, q] = SEM_RESULTADO[Math.floor(r() * SEM_RESULTADO.length)]
        eventos.push({ em: new Date(t + 5000).toISOString(), tipo: 'clique', caminho: c, evento: `busca_${onde}`, rotulo: q, ...base })
        eventos.push({ em: new Date(t + 5001).toISOString(), tipo: 'clique', caminho: c, evento: `busca_sem_resultado_${onde}`, rotulo: q, ...base })
      }
      if (c === '/pecas-genuinas-mahindra/' && r() < 0.6) eventos.push({ em: new Date(t + 3000).toISOString(), tipo: 'clique', caminho: c, evento: 'busca_pecas', rotulo: PECAS[Math.floor(r() * PECAS.length)], ...base })
      if (c === '/pecas-genuinas-mahindra/' && r() < 0.1) eventos.push({ em: new Date(t + 6000).toISOString(), tipo: 'clique', caminho: c, evento: 'pecas_nao_achou', rotulo: '', ...base })
      t += fica * 1000
      eventos.push({ em: new Date(t).toISOString(), tipo: 'saida', caminho: c, tempo_s: fica, rolou: Math.round(20 + r() * 80), ...base })
      t += 1000
    }
    // quem viu mais páginas chama mais
    if (r() < 0.04 + caminho.length * 0.035) {
      const [evento, rotulo] = pega(r, CONTATOS.map(([e, ro, p]) => [[e, ro] as const, p] as const))
      const c = caminho[caminho.length - 1][0]
      eventos.push({ em: new Date(t - 3000).toISOString(), tipo: 'clique', caminho: c, evento, rotulo, ...base })
    }
  }
  return eventos.sort((a, b) => a.em.localeCompare(b.em))
}

export function pedidosExemplo(eventos: EventoSite[]) {
  const r = sorteio(eventos.length)
  const n = eventos.filter((e) => e.evento === 'simulador_formulario').length + Math.round(eventos.length / 900)
  return Array.from({ length: n }, () => ({
    interesse: pega(r, [['Trator Mahindra 6075', 6], ['Trator Mahindra 2025', 3], ['Trator Mahindra 5050', 3], ['Trator Mahindra 7095', 2], ['Ainda não sei', 2]] as const),
    linha: pega(r, [['pronaf5', 5], ['moderfrota', 4], ['pronamp', 3], ['consorcio', 1], ['nao-sei', 2]] as const),
    cidade: pega(r, [['Piraju', 5], ['Fartura', 3], ['Sarutaiá', 2], ['Tejupá', 2], ['Bernardino de Campos', 2], ['Ourinhos', 2], ['Avaré', 1]] as const),
    status: pega(r, [['novo', 3], ['em_contato', 4], ['proposta', 2], ['ganho', 1], ['perdido', 1]] as const),
    valor: Math.round(120 + r() * 300) * 1000,
  }))
}
