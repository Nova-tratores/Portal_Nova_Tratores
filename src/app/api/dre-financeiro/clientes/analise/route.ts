// =============================================================================
// API: clientes/analise - port FIEL de GET /api/clientes/analise do server.js
// (linhas 3268-3500). Curva ABC de clientes por receita + cruzamento com
// inadimplencia (titulos a receber vencidos em aberto). Agrega vendas no
// periodo [desde, ate] por identidade do cliente (CNPJ se conhecido, senao
// nome normalizado), funde duplicatas (mesmo cliente cadastrado 2x no Omie)
// e ignora vendas intercompany (entre as empresas do proprio grupo).
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'
import {
  selectPaginado,
  carregarPedidosInvalidos,
  pedidoEhInvalido,
} from '@/lib/dre-financeiro/calc'
import { EMPRESAS_GRUPO_CNPJ } from '@/lib/dre-financeiro/omie-api'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    if (!supabase) return NextResponse.json({ erro: 'Supabase nao configurado' }, { status: 500 })
    const sb = supabase // const local nao-nula: o narrowing do guard nao alcanca os callbacks de selectPaginado
    const sp = request.nextUrl.searchParams
    const desde = /^\d{4}-\d{2}$/.test(String(sp.get('desde') || '')) ? sp.get('desde')! : null
    const ate   = /^\d{4}-\d{2}$/.test(String(sp.get('ate')   || '')) ? sp.get('ate')!   : null
    if (!desde || !ate) return NextResponse.json({ erro: 'Informe desde=YYYY-MM e ate=YYYY-MM' }, { status: 400 })
    const [aIni, mIni] = desde.split('-').map(Number)
    const [aFim, mFim] = ate.split('-').map(Number)

    // Lista meses no intervalo
    const meses: { ano: number; mes: number }[] = []
    { let a = aIni, m = mIni
      while (a < aFim || (a === aFim && m <= mFim)) {
        meses.push({ ano: a, mes: m })
        m++; if (m > 12) { m = 1; a++ }
      } }

    // 1. Carrega mapa codigo_cliente_omie -> {cnpj_norm, razao_social}
    // (por conta_omie, ja que o codigo eh por conta)
    const { data: clientes } = await supabase.from('clientes')
      .select('codigo_cliente_omie,conta_omie,cnpj_norm,razao_social,nome_fantasia,cidade,estado')
    const clienteMap: Record<string, any> = {}
    const interCodigos: Record<string, Set<number>> = { nova: new Set(), castro: new Set() } // codigos do cliente intercompany por conta
    const cnpjsIntercompany = new Set([EMPRESAS_GRUPO_CNPJ.nova, EMPRESAS_GRUPO_CNPJ.castro])
    ;(clientes || []).forEach((c: any) => {
      const slug = String(c.conta_omie || '').toLowerCase()
      const key = `${slug}|${c.codigo_cliente_omie}`
      clienteMap[key] = c
      if (c.cnpj_norm && cnpjsIntercompany.has(c.cnpj_norm) && interCodigos[slug]) {
        interCodigos[slug].add(Number(c.codigo_cliente_omie))
      }
    })

    // 2. Vendas do periodo - agrega por cliente
    const vendasRaw = await selectPaginado(() => {
      let q = sb.from('vendas_itens')
        .select('valor_total,quantidade,cmc_unitario,codigo_cliente,nome_cliente,conta_omie,ano,mes,numero_pedido')
      const or = meses.map(x => `and(ano.eq.${x.ano},mes.eq.${x.mes})`).join(',')
      q = q.or(or)
      return q
    })
    const pedInvalidosAbc = await carregarPedidosInvalidos()
    const vendas = vendasRaw.filter((v: any) => !pedidoEhInvalido(pedInvalidosAbc, v.conta_omie, v.numero_pedido))

    // Agrega por identidade do cliente (cnpj_norm se conhecido, senao nome_cliente normalizado)
    function normNome(n: any) { return String(n || '').trim().toUpperCase() }
    // Normalizacao agressiva pra dedupe: tira acentos, sufixos juridicos, tipos
    // de imovel (FAZENDA), conectivos. Usada apenas pra fundir entradas que
    // representam o mesmo cliente cadastrado 2x no Omie (sem CNPJ ou CNPJ
    // ausente em uma das contas).
    function normParaDedupe(n: any) {
      return String(n || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
        .toUpperCase()
        .replace(/\b(E OUTROS|E OUTRO|E OUTRA|E ESPOSA|E ESPOSO|LTDA|EPP|S\.?A\.?|EIRELI|MEI|ME)\b/g, ' ')
        .replace(/\b(FAZENDA|FAZ\.?|SITIO|CHACARA|AGROPECUARIA|AGRO-?PECUARIA)\b/g, ' ')
        .replace(/[(){}\[\]\-_.,;:/\\]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    }
    var ignorados = { intercompany: 0, semCliente: 0, receitaIgnorada: 0 }
    const aggCli = new Map<string, any>() // chave -> { chave, nome, cnpj, cidade, estado, receita, cmv, qty, contas }
    vendas.forEach((v: any) => {
      const slug = String(v.conta_omie || '').toLowerCase()
      if (slug !== 'nova' && slug !== 'castro') return
      const codCli = Number(v.codigo_cliente)
      const receita = Number(v.valor_total) || 0
      // Filtra intercompany: vendas para a outra empresa do grupo nao sao receita real
      if (codCli && interCodigos[slug].has(codCli)) { ignorados.intercompany++; ignorados.receitaIgnorada += receita; return }
      const c = clienteMap[`${slug}|${v.codigo_cliente}`]
      if (c && c.cnpj_norm && cnpjsIntercompany.has(c.cnpj_norm)) { ignorados.intercompany++; ignorados.receitaIgnorada += receita; return }
      // Filtra vendas sem cliente identificado (nome vazio e sem mapeamento)
      var nomeNorm = normNome(v.nome_cliente)
      if (!nomeNorm && !c) { ignorados.semCliente++; ignorados.receitaIgnorada += receita; return }
      const chave = c && c.cnpj_norm ? `CNPJ:${c.cnpj_norm}` : `NOME:${nomeNorm}`
      const nome  = (c && (c.razao_social || c.nome_fantasia)) || v.nome_cliente || '(sem nome)'
      if (!aggCli.has(chave)) aggCli.set(chave, {
        chave, nome, cnpj: c?.cnpj_norm || null, cidade: c?.cidade || null, estado: c?.estado || null,
        receita: 0, cmv: 0, qty: 0, contas: new Set(), pedidos: new Set()
      })
      const a = aggCli.get(chave)
      a.receita += Number(v.valor_total) || 0
      a.cmv     += (Number(v.cmc_unitario) || 0) * (Number(v.quantidade) || 0)
      a.qty     += Number(v.quantidade) || 0
      a.contas.add(slug)
    })

    // 3. Inadimplencia: contas_receber em aberto com vencimento < hoje
    const hojeISO = new Date().toISOString().slice(0, 10)
    const cr = await selectPaginado(() =>
      sb.from('contas_receber')
        .select('codigo_cliente_fornecedor,nome_cliente,valor_documento,valor_pago,status_titulo,data_vencimento,data_emissao,conta_omie,numero_documento')
        .lt('data_vencimento', hojeISO)
    )
    function abertoTitulo(r: any) {
      const s = String(r.status_titulo || '').toUpperCase()
      if (['RECEBIDO', 'PAGO', 'LIQUIDADO', 'CANCELADO'].includes(s)) return 0
      return Math.max((Number(r.valor_documento) || 0) - (Number(r.valor_pago) || 0), 0)
    }
    function diasAtraso(dataVencISO: any) {
      if (!dataVencISO) return 0
      const v = new Date(dataVencISO)
      const h = new Date(hojeISO)
      return Math.max(0, Math.floor((+h - +v) / 86400000))
    }
    const aggInad = new Map<string, any>()
    cr.forEach((r: any) => {
      const aberto = abertoTitulo(r); if (aberto <= 0) return
      const slug = String(r.conta_omie || '').toLowerCase()
      const codCli = Number(r.codigo_cliente_fornecedor)
      if (codCli && interCodigos[slug] && interCodigos[slug].has(codCli)) return
      const c = clienteMap[`${slug}|${r.codigo_cliente_fornecedor}`]
      if (c && c.cnpj_norm && cnpjsIntercompany.has(c.cnpj_norm)) return
      var nomeNorm = normNome(r.nome_cliente)
      if (!nomeNorm && !c) return
      const chave = c && c.cnpj_norm ? `CNPJ:${c.cnpj_norm}` : `NOME:${nomeNorm}`
      const nome  = (c && (c.razao_social || c.nome_fantasia)) || r.nome_cliente || '(sem nome)'
      if (!aggInad.has(chave)) aggInad.set(chave, {
        chave, nome, cnpj: c?.cnpj_norm || null, cidade: c?.cidade || null, estado: c?.estado || null,
        valorAtraso: 0, qtdTitulos: 0, maiorAtraso: 0, contas: new Set()
      })
      const a = aggInad.get(chave)
      a.valorAtraso += aberto
      a.qtdTitulos++
      a.maiorAtraso = Math.max(a.maiorAtraso, diasAtraso(r.data_vencimento))
      a.contas.add(slug)
    })
    // ====== Dedupe: funde entradas com mesmo nome normalizado (sem CNPJ ou
    // com CNPJs distintos para mesma pessoa cadastrada 2x). Roda em ambos os
    // agregados, e tambem usa nome_dedupe como chave do cruzamento ABC x Inad.
    function dedupAggregate(map: Map<string, any>, somarFn: (d: any, a: any) => void, mergeFn?: (d: any, a: any) => void) {
      var byNome = new Map<string, any>()
      map.forEach(function (a) {
        var k = normParaDedupe(a.nome)
        if (!k) k = '__VAZIO__' + a.chave
        if (!byNome.has(k)) byNome.set(k, { chave: 'DEDUP:' + k, nome: a.nome, cnpj: a.cnpj, cidade: a.cidade, estado: a.estado, contas: new Set(), origens: [] })
        var dest = byNome.get(k)
        somarFn(dest, a)
        // Preferir cnpj/cidade se ainda nao tem
        if (!dest.cnpj && a.cnpj) dest.cnpj = a.cnpj
        if (!dest.cidade && a.cidade) dest.cidade = a.cidade
        if (!dest.estado && a.estado) dest.estado = a.estado
        ;(a.contas || new Set()).forEach(function (c: any) { dest.contas.add(c) })
        dest.origens.push(a.chave)
        if (mergeFn) mergeFn(dest, a)
      })
      return byNome
    }

    var aggCliDedup = dedupAggregate(aggCli, function (d, a) {
      d.receita = (d.receita || 0) + a.receita
      d.cmv     = (d.cmv     || 0) + a.cmv
      d.qty     = (d.qty     || 0) + a.qty
    })
    var aggInadDedup = dedupAggregate(aggInad, function (d, a) {
      d.valorAtraso = (d.valorAtraso || 0) + a.valorAtraso
      d.qtdTitulos  = (d.qtdTitulos  || 0) + a.qtdTitulos
      d.maiorAtraso = Math.max(d.maiorAtraso || 0, a.maiorAtraso)
    })

    // Indexa inadimplencia por nome_dedupe pra cruzar com ABC
    var inadPorNome = new Map<string, any>()
    aggInadDedup.forEach(function (a, k) { inadPorNome.set(k, a) })

    // Ordena ABC por receita e classifica
    const todos = Array.from(aggCliDedup.entries())
      .filter(function (e) { return e[1].receita > 0 })
      .sort(function (a, b) { return b[1].receita - a[1].receita })
    const totalReceita = todos.reduce(function (s, e) { return s + e[1].receita }, 0)
    let acc = 0
    const abc = todos.map(function (e, i) {
      var k = e[0], a = e[1]
      acc += a.receita
      const pctAcumulado = totalReceita > 0 ? (acc / totalReceita) * 100 : 0
      const classe = pctAcumulado <= 80 ? 'A' : pctAcumulado <= 95 ? 'B' : 'C'
      const lucroBruto = a.receita - a.cmv
      var inad = inadPorNome.get(k)
      return {
        rank: i + 1,
        nome: a.nome, cnpj: a.cnpj, cidade: a.cidade, estado: a.estado,
        contas: Array.from(a.contas).sort().join('+'),
        receita: +a.receita.toFixed(2),
        cmv:     +a.cmv.toFixed(2),
        lucroBruto: +lucroBruto.toFixed(2),
        margemPct: a.receita > 0 ? +((lucroBruto / a.receita) * 100).toFixed(1) : 0,
        pctReceita:    totalReceita > 0 ? +((a.receita / totalReceita) * 100).toFixed(2) : 0,
        pctAcumulado:  +pctAcumulado.toFixed(2),
        classe,
        // Cruzamento com inadimplencia
        valorAtraso: inad ? +inad.valorAtraso.toFixed(2) : 0,
        qtdTitulosAtraso: inad ? inad.qtdTitulos : 0,
        maiorAtraso: inad ? inad.maiorAtraso : 0
      }
    })

    const inadimplencia = Array.from(aggInadDedup.values())
      .sort(function (a, b) { return b.valorAtraso - a.valorAtraso })
      .map(function (a, i) {
        return {
          rank: i + 1,
          nome: a.nome, cnpj: a.cnpj, cidade: a.cidade, estado: a.estado,
          contas: Array.from(a.contas).sort().join('+'),
          valorAtraso: +a.valorAtraso.toFixed(2),
          qtdTitulos: a.qtdTitulos,
          maiorAtraso: a.maiorAtraso
        }
      })

    return NextResponse.json({
      periodo: { desde, ate },
      ignorados: {
        intercompany_count: ignorados.intercompany,
        sem_cliente_count: ignorados.semCliente,
        receita_ignorada: +ignorados.receitaIgnorada.toFixed(2)
      },
      abc: {
        totalReceita: +totalReceita.toFixed(2),
        totalClientes: abc.length,
        countA: abc.filter(x => x.classe === 'A').length,
        countB: abc.filter(x => x.classe === 'B').length,
        countC: abc.filter(x => x.classe === 'C').length,
        clientes: abc
      },
      inadimplencia: {
        total: +inadimplencia.reduce((s, x) => s + x.valorAtraso, 0).toFixed(2),
        totalClientes: inadimplencia.length,
        clientes: inadimplencia
      }
    })
  } catch (e: any) {
    console.error('clientes/analise:', e)
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
