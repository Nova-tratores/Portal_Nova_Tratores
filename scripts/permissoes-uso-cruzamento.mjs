// Cruzamento uso × departamento × templates de permissão (redesenho das permissões, Fase 1).
// Só leitura. Rode da raiz do projeto:
//   node scripts/permissoes-uso-cruzamento.mjs [--dias 90] [--json saida.json]
// Fontes: audit_log (eventos), portal_uso_paginas (acessos por página, desde 07/10/2026),
// portal_permissoes + financeiro_usu (quem é quem). Usa curl: o fetch do Node trava num dos IPs do Supabase.
import fs from 'fs'
import { execFileSync } from 'child_process'

const args = process.argv.slice(2)
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }
const DIAS = Number(arg('--dias', 90))

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY

function todos(path) {
  const out = []
  for (let o = 0; ; o += 1000) {
    const txt = execFileSync('curl', ['-s', '-m', '120', `${U}/rest/v1/${path}`,
      '-H', `apikey: ${K}`, '-H', `Authorization: Bearer ${K}`, '-H', `Range: ${o}-${o + 999}`], { maxBuffer: 1 << 28 }).toString()
    const j = JSON.parse(txt)
    if (!Array.isArray(j)) throw new Error(`${path}: ${txt.slice(0, 200)}`)
    out.push(...j)
    if (j.length < 1000) return out
  }
}

// ── Pessoas ────────────────────────────────────────────────────────────────
// Contas que são da mesma pessoa ou de T.I. e não podem contar para um setor.
// Confirmado pelo José em 13/10/2026: "Irneh" (hf.hioni@) é o Henri; Henri ≠ Vinicius.
const PESSOAS_TI = ['financeiro@novatratores.com.br', 'hf.hioni@gmail.com']
const SISTEMA = /^(Sistema|Tratorilson|Vigia|release|script)/

const normDep = c => {
  c = (c || '').toLowerCase()
  if (c.includes('t.i')) return 'T.I.'
  if (c.includes('pós') || c.includes('pos v')) return 'Pós-Vendas'
  if (c.includes('técnico') && !c.includes('teste')) return 'Técnico'
  if (c.includes('peç') || c.includes('pec')) return 'Peças'
  if (c.includes('comercial')) return 'Comercial'
  if (c.includes('financeiro')) return 'Financeiro'
  return '?'
}

// ── Tela (chave de análise) a partir da rota e do sistema do audit_log ───────
const FAIXA_FIN = { 'home-pecas': 'fin-pecas', 'kanban-pecas': 'fin-pecas', 'home-posvendas': 'fin-posvendas', kanban: 'fin-posvendas' }
const AJUSTES_FIN = ['baixa-contas', 'correcao-contas', 'antecipacoes']
const AJUSTES_PECAS = ['caracteristicas', 'localizacao']
const telaDaRota = r => {
  const p = r.split('/').filter(Boolean), a = p[0] || ''
  if (a === 'opa') return p[1] === 'pecas' ? 'opa-pecas' : 'opa'
  if (a === 'estoque') return p[1] === 'dashboard' ? 'estoque-dashboard' : 'estoque'
  if (a === 'dre-financeiro') return p[1] === 'vendas-modelo' ? 'vendas-modelo' : 'dre'
  if (a === 'ajustes') return AJUSTES_FIN.includes(p[1]) ? 'ajustes-fin' : AJUSTES_PECAS.includes(p[1]) ? 'ajustes-pecas' : 'ajustes'
  if (a === 'financeiro') return FAIXA_FIN[p[1]] || 'financeiro'
  if (['tickets', 'cronograma', 'tarefas', 'reunioes', 'ideias'].includes(a)) return 'central'
  if (a === 'mapa-geral') return 'mapa'
  if (a === 'consulta-omie') return 'consulta-produto'
  return a
}
const SIS = {
  'app-requisicoes': 'requisicoes', 'Proposta Comercial': 'propostas', 'proposta-comercial': 'propostas',
  'controle-revisao': 'revisoes', 'painel-mecanicos': 'mecanicos', 'mapa-geral': 'mapa', 'mapa-clientes': 'mapa',
  'consulta-estoque': 'visual-estoque', 'consulta-omie': 'consulta-produto', 'estoque-notas-entrada': 'estoque',
  'estoque-movimentacao': 'estoque', 'estoque-recebimentos': 'estoque', 'Sugestão de Compra': 'estoque',
  caracteristicas: 'ajustes-pecas', localizacao: 'ajustes-pecas', alocacao: 'ajustes-pecas',
  tarefas: 'central', ideias: 'central', tickets: 'central', reunioes: 'central', inspecoes: 'pos', observacoes: 'pos',
}
const telaDoSistema = s => SIS[s] || s

// ── Templates v1 (spec de 13/10/2026) — chaves de análise ────────────────────
const PACOTES = {
  'Financeiro — faixa Pós-Vendas': ['fin-posvendas'],
  'Financeiro — faixa Peças': ['fin-pecas'],
  'Indicadores e consulta': ['estoque-dashboard', 'consulta-produto', 'visual-estoque'],
}
const TEMPLATES = {
  Base: ['dashboard', 'avisos', 'opa', 'conhecimento', 'pops', 'central', 'pendencias', 'requisicoes', 'frota'],
  'Pós-Vendas': ['pos', 'garantias', 'revisoes', 'clientes', 'lousa', 'mecanicos', 'ppv', 'feedbacks', '+Financeiro — faixa Pós-Vendas'],
  'Peças': ['ppv', 'orcamentos', 'estoque', 'ajustes-pecas', 'opa-pecas', '+Financeiro — faixa Peças'],
  Comercial: ['propostas', 'feedbacks', 'marketing', 'lead', 'dashboard-agro', 'gestao-vendas', 'vendas-modelo', '+Indicadores e consulta'],
  Financeiro: ['financeiro', 'fin-pecas', 'fin-posvendas', 'dre', 'ajustes-fin'],
}
const expandir = l => l.flatMap(x => x.startsWith('+') ? PACOTES[x.slice(1)] : [x])

// ── Dados ─────────────────────────────────────────────────────────────────
const perm = todos('portal_permissoes?select=user_id,is_admin,is_dev,categoria,modulos_permitidos')
const usuLista = todos('financeiro_usu?select=id,nome,email,funcao,ativo')
const desde = new Date(Date.now() - DIAS * 864e5).toISOString().slice(0, 10)
const aud = todos(`audit_log?select=user_id,user_nome,sistema,created_at&created_at=gte.${desde}&order=id`)
const pag = todos('portal_uso_paginas?select=user_id,rota,dia,acessos&order=dia')

const permDe = Object.fromEntries(perm.map(p => [p.user_id, p]))
const usu = Object.fromEntries(usuLista.map(u => {
  const p = permDe[u.id] || {}
  const ti = PESSOAS_TI.includes((u.email || '').toLowerCase())
  return [u.id, { ...u, dep: ti ? 'T.I.' : normDep(p.categoria || u.funcao), admin: !!(p.is_admin || p.is_dev), ti }]
}))
// audit_log antigo (e o rastreio do PPV) grava user_id zerado: resolve pelo nome, sem espaços nas pontas
// e sem sufixo entre parênteses — ex.: 'Vinicius Correa (cancelamento do PPV)'
const limpaNome = n => (n || '').replace(/\s*\([^)]*\)\s*$/, '').trim()
const porNome = {}
for (const a of aud) if (!a.user_id.startsWith('0000') && usu[a.user_id]) porNome[limpaNome(a.user_nome)] = a.user_id

// reg[tela][dep] = { pessoas: Map(nome -> Set(dias)), ev, acessos }
const reg = {}
const anotar = (tela, uid, dia, fonte, n) => {
  const u = usu[uid]; if (!u) return
  const r = ((reg[tela] ??= {})[u.dep] ??= { pessoas: new Map(), ev: 0, acessos: 0 })
  if (!r.pessoas.has(u.nome)) r.pessoas.set(u.nome, { dias: new Set(), admin: u.admin })
  r.pessoas.get(u.nome).dias.add(dia)
  if (fonte === 'a') r.ev += n; else r.acessos += n
}
const semDono = []
for (const a of aud) {
  if (SISTEMA.test(a.user_nome)) continue
  const uid = a.user_id.startsWith('0000') ? porNome[limpaNome(a.user_nome)] : a.user_id
  if (!uid || !usu[uid]) { semDono.push(a); continue }
  anotar(telaDoSistema(a.sistema), uid, a.created_at.slice(0, 10), 'a', 1)
}
for (const p of pag) if (p.dia >= desde) anotar(telaDaRota(p.rota), p.user_id, p.dia, 'p', p.acessos)

// Uso pontual: todos os dias de uso cabem numa janela de 7 dias E a pessoa parou há mais de 7 dias
// (ex.: Ana em Ajustes, 17–20/08). Quem começou agora — o monitor de páginas existe desde 07/10 — não é pontual.
const HOJE = new Date().toISOString().slice(0, 10)
const pontual = dias => {
  const d = [...dias].sort()
  const janela = (new Date(d.at(-1)) - new Date(d[0])) / 864e5
  const parou = (new Date(HOJE) - new Date(d.at(-1))) / 864e5
  return janela <= 7 && parou > 7
}
// Pessoas "que contam" para o template de um setor: do setor, não T.I., uso não pontual.
const quemConta = (tela, dep, { semAdmin = false } = {}) => {
  const r = reg[tela]?.[dep]; if (!r) return []
  return [...r.pessoas].filter(([, x]) => !pontual(x.dias) && !(semAdmin && x.admin)).map(([n]) => n)
}

// ── Saída ─────────────────────────────────────────────────────────────────
const L = []
L.push(`# Cruzamento uso × setor — ${new Date().toISOString().slice(0, 10)} (janela ${DIAS} d, desde ${desde})`)
L.push(`Fontes: audit_log ${aud.length} eventos · portal_uso_paginas ${pag.length} linhas (desde ${pag[0]?.dia ?? '—'})`)
L.push(`Excluídos como T.I.: ${usuLista.filter(u => usu[u.id].ti).map(u => u.nome).join(', ')}`)
L.push(`Eventos sem dono: ${semDono.length}${semDono.length ? ' — ' + [...new Set(semDono.map(a => a.user_nome || '(vazio)'))].join(', ') : ''}`)

L.push('\n## Uso por tela e setor (dias-pessoa · pessoas; * = admin/dev; ~ = uso pontual)')
const DEPS = ['Pós-Vendas', 'Técnico', 'Peças', 'Comercial', 'Financeiro', '?', 'T.I.']
for (const tela of Object.keys(reg).sort()) {
  const partes = DEPS.filter(d => reg[tela][d]).map(d => {
    const r = reg[tela][d], dp = [...r.pessoas.values()].reduce((s, x) => s + x.dias.size, 0)
    const nomes = [...r.pessoas].map(([n, x]) => n + (x.admin ? '*' : '') + (pontual(x.dias) ? '~' : '')).join(', ')
    return `${d}: ${dp} (${nomes})`
  })
  L.push(`- **${tela}** — ${partes.join(' | ')}`)
}

L.push('\n## Templates v1 × uso real (quem conta = do setor, fora T.I., uso não pontual)')
for (const [tpl, itens] of Object.entries(TEMPLATES)) {
  if (tpl === 'Base') continue
  L.push(`\n### ${tpl}`)
  for (const tela of expandir(itens)) {
    const todos_ = quemConta(tela, tpl), semAdm = quemConta(tela, tpl, { semAdmin: true })
    const tec = tpl === 'Pós-Vendas' ? quemConta(tela, 'Técnico') : []
    const sinal = semAdm.length >= 2 ? 'OK' : semAdm.length === 1 ? '1 pessoa' : todos_.length ? 'só admin' : 'SEM USO'
    L.push(`- ${tela}: ${sinal} — ${[...todos_, ...tec.map(t => t + ' (téc)')].join(', ') || '—'}`)
  }
  const dentro = new Set(expandir(itens).concat(TEMPLATES.Base))
  const fora = Object.keys(reg).filter(t => !dentro.has(t) && quemConta(t, tpl, { semAdmin: true }).length >= 2)
  if (fora.length) L.push(`- fora do template, usado por ≥ 2 do setor: ${fora.map(t => `${t} (${quemConta(t, tpl, { semAdmin: true }).join(', ')})`).join('; ')}`)
}

L.push('\n## Base (todos) × uso')
for (const tela of TEMPLATES.Base) {
  const deps = DEPS.filter(d => d !== 'T.I.' && quemConta(tela, d).length)
  L.push(`- ${tela}: ${deps.map(d => `${d} ${quemConta(tela, d).length}`).join(' · ') || 'SEM USO'}`)
}

L.push('\n## Pessoas: liberado × usado (ativos)')
for (const u of Object.values(usu).filter(u => u.ativo).sort((a, b) => a.dep.localeCompare(b.dep))) {
  const lib = [...new Set((permDe[u.id]?.modulos_permitidos || []).map(x => x.split(':')[0]))]
  const usados = Object.keys(reg).filter(t => Object.values(reg[t]).some(r => r.pessoas.has(u.nome)))
  L.push(`- ${u.nome} (${u.dep}${u.admin ? ', admin' : ''}): libera ${lib.length} [${lib.join(',')}] · usa ${usados.length} [${usados.join(',')}]`)
}

console.log(L.join('\n'))
const j = arg('--json'); if (j) fs.writeFileSync(j, JSON.stringify({ desde, reg: Object.fromEntries(Object.entries(reg).map(([t, d]) => [t, Object.fromEntries(Object.entries(d).map(([k, r]) => [k, { ev: r.ev, acessos: r.acessos, pessoas: Object.fromEntries([...r.pessoas].map(([n, x]) => [n, [...x.dias]])) }]))])) }, null, 1))
