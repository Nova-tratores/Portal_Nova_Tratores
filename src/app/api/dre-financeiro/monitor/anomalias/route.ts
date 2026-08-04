// =============================================================================
// API: monitor/anomalias - port FIEL de GET /api/monitor/anomalias do server.js
// (linhas 4159-4200). Lista anomalias + contagens agrupadas.
// Filtros opcionais: conta, modulo, status, severidade.
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'
import { labelConta, mapaUsuariosOmie } from '@/lib/dre-financeiro/omie-api'
import { selectPaginado } from '@/lib/dre-financeiro/calc'
import { MODULOS, MODULO_LABEL } from '@/lib/dre-financeiro/monitors'

export const dynamic = 'force-dynamic'

// Normaliza texto p/ casar nome/email entre Omie e portal (trim + lower + sem acento).
function norm(s: any): string {
  return String(s || '').trim().toLowerCase().normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
}

export async function GET(request: NextRequest) {
  if (!supabase) return NextResponse.json({ erro: 'Supabase nao configurado' }, { status: 500 })
  const sb = supabase // narrowing nao-null flui p/ os closures de selectPaginado
  try {
    const sp = request.nextUrl.searchParams
    const conta = (sp.get('conta') || 'todas').toString().toLowerCase()
    const status = (sp.get('status') || 'aberta').toString()
    const modulo = sp.get('modulo') ? String(sp.get('modulo')) : null
    const severidade = sp.get('severidade') ? String(sp.get('severidade')) : null

    // Pagina alem do limite de 1000 do PostgREST (.limit nao supera o cap do servidor).
    // Order composto e estavel (data_ref + id) p/ paginacao sem pular linhas.
    const todas = await selectPaginado(() => {
      let q = sb.from('qa_anomalias').select('*')
        .order('data_ref', { ascending: false }).order('id', { ascending: true })
      if (conta !== 'todas') q = q.eq('conta_omie', labelConta(conta))
      if (status !== 'todas') q = q.eq('status', status)
      if (modulo) q = q.eq('modulo', modulo)
      if (severidade) q = q.eq('severidade', severidade)
      return q
    })
    const LIMITE_LISTA = 5000
    const data = todas.slice(0, LIMITE_LISTA)

    // Resumo por modulo/severidade (sempre sobre status=aberta, p/ os cards) - paginado p/ contagem exata.
    const abertas = await selectPaginado(() => {
      let rq = sb.from('qa_anomalias').select('modulo,conta_omie,severidade,regra')
        .eq('status', 'aberta').order('id', { ascending: true })
      if (conta !== 'todas') rq = rq.eq('conta_omie', labelConta(conta))
      return rq
    })

    const resumo: any = {}
    for (const m of MODULOS) resumo[m] = { total: 0, alta: 0, media: 0, baixa: 0, regras: {} }
    ;(abertas || []).forEach((a: any) => {
      const r = resumo[a.modulo] || (resumo[a.modulo] = { total: 0, alta: 0, media: 0, baixa: 0, regras: {} })
      r.total++; r[a.severidade] = (r[a.severidade] || 0) + 1
      r.regras[a.regra] = (r.regras[a.regra] || 0) + 1
    })

    // -----------------------------------------------------------------------
    // Enriquecimento: incluido_por / data_vencimento / data_inclusao.
    // Estes campos NAO vivem em qa_anomalias; vem de contas_pagar/contas_receber
    // (faturamento/compras tem schema fino -> ficam null). Juntamos pela chave
    // da fonte: registro_id == codigo_lancamento (ver monitors.js).
    // Alem disso, sugerimos o usuario do portal (financeiro_usu) correspondente
    // ao "incluido por" da Omie, p/ pre-selecionar ao criar a tarefa de correcao.
    // -----------------------------------------------------------------------
    const TABELAS_CONTA: Record<string, string> = { contas_pagar: 'contas_pagar', contas_receber: 'contas_receber' }
    // ids por tabela de origem (dedup)
    const idsPorTabela: Record<string, Set<string>> = {}
    for (const a of data) {
      const tbl = TABELAS_CONTA[a.modulo]
      if (!tbl || a.registro_id == null) continue
      ;(idsPorTabela[tbl] = idsPorTabela[tbl] || new Set()).add(String(a.registro_id))
    }
    // mapa `${conta_omie}|${codigo_lancamento}` -> { incluido_por, data_vencimento, data_inclusao }
    const fonte: Record<string, { incluido_por: string | null; data_vencimento: string | null; data_inclusao: string | null }> = {}
    for (const [tbl, idSet] of Object.entries(idsPorTabela)) {
      const ids = Array.from(idSet)
      for (let i = 0; i < ids.length; i += 500) {
        const lote = ids.slice(i, i + 500)
        const { data: rows } = await sb.from(tbl)
          .select('codigo_lancamento,conta_omie,incluido_por,data_vencimento,data_inclusao')
          .in('codigo_lancamento', lote)
        ;(rows || []).forEach((r: any) => {
          fonte[`${r.conta_omie}|${r.codigo_lancamento}`] = {
            incluido_por: r.incluido_por ?? null,
            data_vencimento: r.data_vencimento ?? null,
            data_inclusao: r.data_inclusao ?? null,
          }
        })
      }
    }

    // Traducao codigo Omie -> nome real, e sugestao de usuario do portal.
    const usuariosOmie: Record<string, string> = await mapaUsuariosOmie()
    // codigos Omie efetivamente presentes nas linhas
    const codigosOmie = new Set<string>()
    for (const a of data) {
      const f = fonte[`${a.conta_omie}|${a.registro_id}`]
      if (f?.incluido_por) codigosOmie.add(String(f.incluido_por))
    }
    // omie_usuarios (codigo -> {nome,email}) p/ os codigos presentes
    const omieDados: Record<string, { nome: string | null; email: string | null }> = {}
    if (codigosOmie.size) {
      const cods = Array.from(codigosOmie)
      for (let i = 0; i < cods.length; i += 500) {
        const { data: ou } = await sb.from('omie_usuarios')
          .select('codigo,nome,email').in('codigo', cods.slice(i, i + 500))
        ;(ou || []).forEach((u: any) => { omieDados[u.codigo] = { nome: u.nome ?? null, email: u.email ?? null } })
      }
    }
    // usuarios do portal (financeiro_usu) indexados por email/nome normalizados.
    const porEmail: Record<string, string> = {}
    const porNome: Record<string, string> = {}
    const nomePorId: Record<string, string> = {} // uid -> nome normalizado (p/ validar match)
    if (codigosOmie.size) {
      const { data: fus } = await sb.from('financeiro_usu').select('id,nome,email,ativo').eq('ativo', true)
      ;(fus || []).forEach((u: any) => {
        nomePorId[u.id] = norm(u.nome)
        if (u.email && !porEmail[norm(u.email)]) porEmail[norm(u.email)] = u.id
        if (u.nome) porNome[norm(u.nome)] = u.id
      })
    }
    // Tokens de nome (>=3 chars) p/ validar um match. Evita falso positivo por
    // EMAIL compartilhado no Omie (varios usuarios Omie com o mesmo email, que
    // resolveria todos p/ o mesmo usuario do portal): so aceitamos o match se o
    // nome do usuario Omie e o do portal compartilham algum token real.
    const tokens = (s: string) => new Set(norm(s).split(/\s+/).filter((t) => t.length >= 3))
    const nomesCompativeis = (omieNome: string, uid: string) => {
      const a = tokens(omieNome), b = tokens(nomePorId[uid] || '')
      for (const t of a) if (b.has(t)) return true
      return false
    }
    // codigo Omie -> financeiro_usu.id. Precisao em primeiro lugar: nome exato,
    // senao email — mas SEMPRE validando compatibilidade de nome.
    const sugestaoPorCod: Record<string, string | null> = {}
    for (const cod of codigosOmie) {
      const d = omieDados[cod]
      let uid: string | null = null
      if (d?.nome && porNome[norm(d.nome)]) uid = porNome[norm(d.nome)]
      if (!uid && d?.email && porEmail[norm(d.email)]) uid = porEmail[norm(d.email)]
      // rejeita match cujo nome do portal nao bate com o nome Omie (email compartilhado)
      if (uid && d?.nome && !nomesCompativeis(d.nome, uid)) uid = null
      sugestaoPorCod[cod] = uid
    }

    const anomalias = data.map((a: any) => {
      const f = fonte[`${a.conta_omie}|${a.registro_id}`] || null
      const cod = f?.incluido_por ? String(f.incluido_por) : null
      return {
        ...a,
        incluido_por_cod: cod,
        incluido_por_nome: cod ? (usuariosOmie[cod] || cod) : null,
        data_vencimento: f?.data_vencimento ?? null,
        data_inclusao: f?.data_inclusao ?? null,
        sugestao_atribuido_a: cod ? (sugestaoPorCod[cod] || null) : null,
      }
    })

    return NextResponse.json({ anomalias, total: todas.length, truncada: todas.length > LIMITE_LISTA, resumo, modulosLabel: MODULO_LABEL })
  } catch (e: any) {
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
