// Campanhas (módulo Site → Campanhas). José, 13/11/2026: "fazer uma aba dentro do módulo das redes sociais chamada
// Campanhas, separa por nome da campanha e ano; nesse caso Black Friday 2026".
// A página da campanha (Projetos\black-friday-roleta) grava direto no banco pelas funções do sql/campanhas.sql;
// aqui o portal lê os cadastros, mostra as fotos (link temporário, a pasta é privada) e muda prêmios/baixas.
// GET ?campanha=slug → campanhas, prêmios e participantes · PATCH { acao, ... } → baixa, foto vencedora, prêmio, campanha
import { NextResponse } from 'next/server'
import { guardarSite, sb } from '@/lib/site/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MSG_SQL = 'Campanhas ainda não ativadas: rode sql/campanhas.sql no projeto do portal (citrhumdkfivdzbmayde).'
const falta = (m?: string) => /campanha|does not exist|schema cache/i.test(m || '')
const SETORES = ['comercial', 'posvendas', 'pecas']
type Linha = Record<string, unknown>

export async function GET(req: Request) {
  const g = await guardarSite(req, 'campanhas')
  if (g.resposta) return g.resposta
  const { data: campanhas, error } = await sb.from('campanhas').select('*').order('ano', { ascending: false }).order('inicio', { ascending: false })
  if (error) return NextResponse.json({ ok: false, erro: falta(error.message) ? MSG_SQL : error.message, semSql: falta(error.message) }, { status: falta(error.message) ? 503 : 500 })
  const lista = (campanhas || []) as Linha[]

  // cartões da entrada (por ano, com capa): só o leve, sem participantes
  if (new URL(req.url).searchParams.get('lista') === '1') {
    const { data: ps } = await sb.from('campanha_participacoes').select('campanha_id, codigo').limit(50000)
    const conta = (id: unknown, f: (x: Linha) => boolean) => ((ps || []) as Linha[]).filter((x) => x.campanha_id === id && f(x)).length
    return NextResponse.json({ ok: true, campanhas: lista.map((c) => ({ id: c.id, slug: c.slug, nome: c.nome, ano: c.ano, inicio: c.inicio, fim: c.fim, ativo: c.ativo, capa: (c.config as Linha)?.capa || null, respostas: conta(c.id, () => true), giraram: conta(c.id, (x) => !!x.codigo) })) })
  }
  const pedida = new URL(req.url).searchParams.get('campanha')
  const atual = lista.find((c) => c.slug === pedida) || lista[0]
  if (!atual) return NextResponse.json({ ok: true, campanhas: [], atual: null, premios: [], participantes: [] })

  const [pr, pa] = await Promise.all([
    sb.from('campanha_premios').select('*').eq('campanha_id', atual.id).order('setor').order('ordem').order('id'),
    sb.from('campanha_participacoes').select('*').eq('campanha_id', atual.id).order('criado_em', { ascending: false }).limit(5000),
  ])
  if (pr.error || pa.error) return NextResponse.json({ ok: false, erro: (pr.error || pa.error)!.message }, { status: 500 })

  // fotos: link temporário de 2 h (pasta privada)
  const participantes = (pa.data || []) as Linha[]
  const caminhos = participantes.map((p) => p.foto_path).filter(Boolean) as string[]
  const links = new Map<string, string>()
  for (let i = 0; i < caminhos.length; i += 500) {
    const { data } = await sb.storage.from('campanhas').createSignedUrls(caminhos.slice(i, i + 500), 7200)
    for (const d of data || []) if (d.path && d.signedUrl) links.set(d.path, d.signedUrl)
  }
  const saidas = new Map<number, number>()
  for (const p of participantes) if (p.premio_id) saidas.set(p.premio_id as number, (saidas.get(p.premio_id as number) || 0) + 1)

  return NextResponse.json({
    ok: true,
    campanhas: lista.map((c) => ({ id: c.id, slug: c.slug, nome: c.nome, ano: c.ano, inicio: c.inicio, fim: c.fim, ativo: c.ativo })),
    atual,
    premios: ((pr.data || []) as Linha[]).map((p) => ({ ...p, saidas: saidas.get(p.id as number) || 0 })),
    participantes: participantes.map((p) => ({ ...p, aparelho: undefined, foto_url: p.foto_path ? links.get(p.foto_path as string) || null : null })),
  })
}

export async function PATCH(req: Request) {
  const g = await guardarSite(req, 'campanhas', true)
  if (g.resposta) return g.resposta
  const b = (await req.json().catch(() => null)) as Linha | null
  if (!b?.acao) return NextResponse.json({ ok: false, erro: 'acao obrigatória' }, { status: 400 })
  const quem = g.user.nome || g.user.email || 'Portal'
  const t = (x: unknown, n: number) => { const s = String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, n); return s || null }

  // Venda em que o prêmio foi usado (José, 17/11: "ver os faturamentos que conseguimos a partir dos códigos da roleta").
  // Fica em extras.venda (a página só regrava extras antes de girar; a baixa só existe depois do giro), sem SQL novo.
  const lerVenda = (x: unknown) => {
    const v = (x || {}) as Linha
    const tipo = ['os', 'ppv', 'pedido', 'balcao', 'nenhuma'].includes(String(v.tipo)) ? String(v.tipo) : null
    if (!tipo) return null
    const valor = v.valor === '' || v.valor == null ? null : Number(String(v.valor).replace(/\./g, '').replace(',', '.'))
    return { tipo, numero: tipo === 'nenhuma' ? null : t(v.numero, 30), valor: valor != null && Number.isFinite(valor) && valor >= 0 ? Math.round(valor * 100) / 100 : null, por: quem, em: new Date().toISOString() }
  }
  const gravarVenda = async (id: string, venda: ReturnType<typeof lerVenda> | 'apagar') => {
    const { data: p, error: e1 } = await sb.from('campanha_participacoes').select('extras').eq('id', id).single()
    if (e1) return e1
    const extras = { ...((p?.extras as Linha) || {}) }
    if (venda === 'apagar') delete extras.venda; else extras.venda = venda
    const { error } = await sb.from('campanha_participacoes').update({ extras }).eq('id', id)
    return error
  }

  if (b.acao === 'resgatar' || b.acao === 'desfazer') {
    const muda = b.acao === 'resgatar' ? { resgatado_em: new Date().toISOString(), resgatado_por: quem } : { resgatado_em: null, resgatado_por: null }
    const { data, error } = await sb.from('campanha_participacoes').update(muda).eq('id', String(b.id)).not('codigo', 'is', null).select('id, resgatado_em, resgatado_por').single()
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
    const venda = b.acao === 'resgatar' ? lerVenda(b.venda) : null
    if (venda || b.acao === 'desfazer') {
      const e2 = await gravarVenda(String(b.id), venda || 'apagar')
      if (e2) return NextResponse.json({ ok: false, erro: e2.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, participante: data })
  }

  if (b.acao === 'venda') {
    const venda = lerVenda(b.venda)
    if (!venda) return NextResponse.json({ ok: false, erro: 'Escolha onde o prêmio foi usado' }, { status: 400 })
    const e = await gravarVenda(String(b.id), venda)
    if (e) return NextResponse.json({ ok: false, erro: e.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // brinde físico (José, 17/11): quem ganha vê "retire na loja dia 15/12" com o mapa. Lista em config.fisicos.
  if (b.acao === 'fisico') {
    const { data: c, error: e1 } = await sb.from('campanhas').select('config').eq('id', String(b.id)).single()
    if (e1) return NextResponse.json({ ok: false, erro: e1.message }, { status: 500 })
    const cfg = ((c?.config as Linha) || {})
    let lista: string[]
    if (Array.isArray(cfg.fisicos)) lista = (cfg.fisicos as unknown[]).map(String)
    else {
      // 1ª marcação: parte do que a página já considerava físico pelo nome
      const { data: ps } = await sb.from('campanha_premios').select('id, nome').eq('campanha_id', String(b.id))
      lista = (ps || []).filter((p) => /bon[eé]|camiseta|t[aá]bua|faca|chaira|caneca|chaveiro|squeeze|garrafa|copo|brinde/i.test(String(p.nome || ''))).map((p) => String(p.id))
    }
    const id = String(b.premio)
    lista = b.valor === true ? [...new Set([...lista, id])] : lista.filter((x) => x !== id)
    const { error } = await sb.from('campanhas').update({ config: { ...cfg, fisicos: lista } }).eq('id', String(b.id))
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (b.acao === 'vencedora') {
    const { data, error } = await sb.from('campanha_participacoes').update({ foto_vencedora: b.valor === true }).eq('id', String(b.id)).select('id, foto_vencedora').single()
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, participante: data })
  }

  if (b.acao === 'premio') {
    const p = (b.premio || {}) as Linha
    const v: Linha = { atualizado_em: new Date().toISOString(), atualizado_por: quem }
    if ('rotulo' in p) { v.rotulo = t(p.rotulo, 24); if (!v.rotulo) return NextResponse.json({ ok: false, erro: 'Escreva o texto da fatia' }, { status: 400 }) }
    if ('nome' in p) { v.nome = t(p.nome, 80); if (!v.nome) return NextResponse.json({ ok: false, erro: 'Escreva o nome do prêmio' }, { status: 400 }) }
    if ('detalhe' in p) v.detalhe = t(p.detalhe, 200)
    if ('peso' in p) { const n = Math.round(Number(p.peso)); if (!(n >= 0 && n <= 1000)) return NextResponse.json({ ok: false, erro: 'Chance inválida' }, { status: 400 }); v.peso = n }
    if ('estoque' in p) { const n = p.estoque === null || p.estoque === '' ? null : Math.round(Number(p.estoque)); if (n !== null && !(n >= 0)) return NextResponse.json({ ok: false, erro: 'Limite inválido' }, { status: 400 }); v.estoque = n }
    if ('ativo' in p) v.ativo = p.ativo === true
    if ('ordem' in p) v.ordem = Math.round(Number(p.ordem)) || 0
    if (p.id) {
      const { data, error } = await sb.from('campanha_premios').update(v).eq('id', Number(p.id)).select('*').single()
      if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, premio: data })
    }
    if (!SETORES.includes(String(p.setor)) || !p.campanha_id || !v.rotulo || !v.nome) return NextResponse.json({ ok: false, erro: 'Preencha o prêmio' }, { status: 400 })
    const { data, error } = await sb.from('campanha_premios').insert({ ...v, setor: p.setor, campanha_id: String(p.campanha_id), peso: v.peso ?? 1 }).select('*').single()
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, premio: data })
  }

  // o que aparece em cada passo da página (Início, Regras, Ficha, WhatsApp de cada roleta)
  if (b.acao === 'config') {
    const e = (b.config || {}) as Linha
    const lista = (x: unknown, max: number, tam: number) => (Array.isArray(x) ? x : []).map((i) => t(i, tam)).filter(Boolean).slice(0, max) as string[]
    const ini = (e.inicio || {}) as Linha, fi = (e.ficha || {}) as Linha, wh = (e.whats || {}) as Linha
    const { data: c, error: e1 } = await sb.from('campanhas').select('config').eq('id', String(b.id)).single()
    if (e1) return NextResponse.json({ ok: false, erro: e1.message }, { status: 500 })
    const config = {
      ...((c?.config as Linha) || {}),
      inicio: { subtitulo: t(ini.subtitulo, 120), passos: lista(ini.passos, 4, 60), concurso: t(ini.concurso, 140) },
      regras: lista(e.regras, 8, 140),
      ficha: {
        pedir_local: fi.pedir_local !== false, pedir_trator: fi.pedir_trator !== false, pedir_foto: fi.pedir_foto !== false, modelos: lista(fi.modelos, 30, 20),
        // campos a mais escolhidos no portal (vão para campanha_participacoes.extras)
        campos: (Array.isArray(fi.campos) ? fi.campos : []).slice(0, 8).map((x: unknown) => {
          const c = (x || {}) as Linha
          const tipo = ['telefone', 'documento', 'email', 'texto', 'opcoes', 'local', 'nota'].includes(String(c.tipo)) ? String(c.tipo) : 'texto'
          return { id: String(c.id || '').replace(/[^a-z0-9_]/gi, '').slice(0, 30) || `c${Math.random().toString(36).slice(2, 8)}`, tipo, rotulo: t(c.rotulo, 80), obrigatorio: c.obrigatorio === true, ...(tipo === 'opcoes' ? { opcoes: lista(c.opcoes, 12, 40) } : {}) }
        }).filter((c: Linha) => c.rotulo && (c.tipo !== 'opcoes' || (c.opcoes as string[]).length)),
      },
      whats: Object.fromEntries(SETORES.map((s) => [s, String(wh[s] ?? '').replace(/\D/g, '').slice(0, 15)])),
      ...(typeof e.premio_foto === 'string' ? { premio_foto: t(e.premio_foto, 200) } : {}),
      ...(typeof e.validade === 'string' ? { validade: t(e.validade, 30) } : {}),
    }
    if (!config.regras.length) return NextResponse.json({ ok: false, erro: 'Deixe pelo menos uma regra' }, { status: 400 })
    if (config.ficha.pedir_trator && !config.ficha.modelos.length) return NextResponse.json({ ok: false, erro: 'Coloque pelo menos um modelo de trator' }, { status: 400 })
    const { data, error } = await sb.from('campanhas').update({ config }).eq('id', String(b.id)).select('*').single()
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, campanha: data })
  }

  if (b.acao === 'campanha') {
    const v: Linha = {}
    // nome, ano, datas e liga/desliga (José, 17/11: "não consigo alterar o nome"). O slug NÃO muda: os links já mandados seguem valendo.
    if ('nome' in b) { v.nome = t(b.nome, 80); if (!v.nome) return NextResponse.json({ ok: false, erro: 'Escreva o nome da campanha' }, { status: 400 }) }
    if ('ano' in b) { const a = Math.round(Number(b.ano)); if (!(a >= 2020 && a <= 2100)) return NextResponse.json({ ok: false, erro: 'Ano inválido' }, { status: 400 }); v.ano = a }
    const dataOk = (x: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(x || ''))
    if ('inicio' in b) { if (!dataOk(b.inicio)) return NextResponse.json({ ok: false, erro: 'Data de início inválida' }, { status: 400 }); v.inicio = b.inicio }
    if ('fim' in b) { if (!dataOk(b.fim)) return NextResponse.json({ ok: false, erro: 'Data de fim inválida' }, { status: 400 }); v.fim = b.fim }
    if (v.inicio && v.fim && String(v.fim) < String(v.inicio)) return NextResponse.json({ ok: false, erro: 'O fim não pode ser antes do início' }, { status: 400 })
    if ('ativo' in b) v.ativo = b.ativo === true
    if ('url' in b) { v.url = t(b.url, 300); if (v.url && !/^https?:\/\//.test(String(v.url))) return NextResponse.json({ ok: false, erro: 'O endereço começa com https://' }, { status: 400 }) }
    if ('capa' in b) {
      const capa = t(b.capa, 500)
      if (capa && !capa.startsWith('https://')) return NextResponse.json({ ok: false, erro: 'Foto inválida' }, { status: 400 })
      const { data: c } = await sb.from('campanhas').select('config').eq('id', String(b.id)).single()
      v.config = { ...((c?.config as Linha) || {}), capa }
    }
    if ('premio_foto' in b || 'validade' in b) {
      const { data: c } = await sb.from('campanhas').select('config').eq('id', String(b.id)).single()
      const config = { ...((c?.config as Linha) || {}) }
      if ('premio_foto' in b) config.premio_foto = t(b.premio_foto, 200)
      if ('validade' in b) config.validade = t(b.validade, 30)
      v.config = config
    }
    const { data, error } = await sb.from('campanhas').update(v).eq('id', String(b.id)).select('*').single()
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, campanha: data })
  }

  return NextResponse.json({ ok: false, erro: 'acao desconhecida' }, { status: 400 })
}
