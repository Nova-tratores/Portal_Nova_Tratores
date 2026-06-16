// =============================================================================
// API: aderencia (realizado vs previsto) - port FIEL de GET /api/aderencia do
// server.js (linhas 3835-4039). Compara data_vencimento vs data_pagamento para
// medir previsibilidade. O handler original nao tem funcao em calc.js: a logica
// inteira mora aqui, espelhando o server.js linha a linha.
// req.query.gran/de/ate => searchParams. gran 'semana' senao 'mes'.
// de default = ref - 6 meses; ate default = hoje.
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'
import {
  CONTA_PADRAO, TIPO_PADRAO, TIPOS_VALIDOS,
  tabelaPorTipo, colunaNomePorTipo, aplicarConta,
} from '@/lib/dre-financeiro/calc'
import { hoje, fmtISO } from '@/lib/dre-financeiro/dates'

export const dynamic = 'force-dynamic'

// pegaConta / pegaTipo reimplementados inline (server.js:68-77): le searchParams
// 'conta'/'tipo', senao cookie, senao default. Valores: nova|castro|todas e
// pagar|receber|ambos.
function pegaConta(request: NextRequest): string {
  const c = (request.nextUrl.searchParams.get('conta')
    || request.cookies.get('conta')?.value
    || CONTA_PADRAO).toString().toLowerCase()
  if (c === 'todas') return 'todas'
  return c
}

function pegaTipo(request: NextRequest): string {
  const t = (request.nextUrl.searchParams.get('tipo')
    || request.cookies.get('tipo')?.value
    || TIPO_PADRAO).toString().toLowerCase()
  return (TIPOS_VALIDOS as Set<string>).has(t) ? t : 'pagar'
}

export async function GET(request: NextRequest) {
  if (!supabase) return NextResponse.json({ erro: 'Supabase nao configurado' }, { status: 500 })
  try {
    const conta = pegaConta(request)
    const tipo = pegaTipo(request)
    const sp = request.nextUrl.searchParams
    const gran = (sp.get('gran') || 'mes').toString().toLowerCase() === 'semana' ? 'semana' : 'mes'

    const ref = hoje()
    const ateStr = sp.get('ate') || fmtISO(ref)
    let deStr = sp.get('de') || ''
    if (!deStr) {
      const d = new Date(ref)
      d.setMonth(d.getMonth() - 6)
      deStr = fmtISO(d)
    }

    const tipos = tipo === 'ambos' ? ['pagar', 'receber'] : [tipo]
    const todasRows: any[] = []
    for (const t of tipos) {
      const tabela = tabelaPorTipo(t)
      const colNome = colunaNomePorTipo(t)
      // Pega titulos cujo vencimento OU pagamento caiu na janela
      let q: any = supabase.from(tabela)
        .select(`codigo_lancamento,data_vencimento,data_pagamento,valor_documento,valor_pago,status_titulo,numero_documento_fiscal,numero_documento,${colNome}`)
        .or(`and(data_vencimento.gte.${deStr},data_vencimento.lte.${ateStr}),and(data_pagamento.gte.${deStr},data_pagamento.lte.${ateStr})`)
        .limit(50000)
      q = aplicarConta(q, conta)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      ;(data || []).forEach((r: any) => todasRows.push({ ...r, _tipo: t, _nome: r[colNome] || null }))
    }

    // Helpers de bucket
    function ymd(s: any): string | null { return s ? String(s).slice(0, 10) : null }
    function bucketDe(iso: string | null): string | null {
      if (!iso) return null
      const d = new Date(iso + 'T00:00:00Z')
      if (gran === 'semana') {
        // ISO week (segunda como inicio)
        const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
        const dow = (tmp.getUTCDay() + 6) % 7 // segunda=0
        tmp.setUTCDate(tmp.getUTCDate() - dow + 3)
        const firstThursday = tmp.valueOf()
        tmp.setUTCMonth(0, 1)
        if (tmp.getUTCDay() !== 4) tmp.setUTCMonth(0, 1 + ((4 - tmp.getUTCDay()) + 7) % 7)
        const week = 1 + Math.ceil((firstThursday - tmp.valueOf()) / 604800000)
        return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
      }
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    }
    function diasEntre(isoA: string | null, isoB: string | null): number | null {
      if (!isoA || !isoB) return null
      const a = new Date(isoA + 'T00:00:00Z')
      const b = new Date(isoB + 'T00:00:00Z')
      return Math.round((b.valueOf() - a.valueOf()) / 86400000)
    }

    // Classifica + agrega usando data_pagamento (vem do endpoint /financas/mf/
    // ListarMovimentos, populado pelo sync via aplicarBaixas).
    const buckets: Record<string, any> = {}
    function slot(k: string): any {
      if (!buckets[k]) {
        buckets[k] = {
          rotulo: k, previsto: 0, realizado: 0,
          no_prazo: 0, antecipado: 0, atrasado: 0, nao_pago: 0,
          valor_no_prazo: 0, valor_antecipado: 0, valor_atrasado: 0, valor_nao_pago: 0,
          atraso_acum_x_valor: 0, valor_atraso_acum: 0,
        }
      }
      return buckets[k]
    }

    const hojeISO = fmtISO(ref)
    const desviosCand: any[] = []

    todasRows.forEach((r: any) => {
      const valor = Number(r.valor_documento) || 0
      const valorPago = Number(r.valor_pago) || 0
      const venc = ymd(r.data_vencimento)
      const pag = ymd(r.data_pagamento)

      // PREVISTO: agrega no bucket do vencimento
      if (venc && venc >= deStr && venc <= ateStr) {
        const k = bucketDe(venc)
        if (k) slot(k).previsto += valor
      }
      // REALIZADO: agrega no bucket do pagamento
      if (pag && pag >= deStr && pag <= ateStr) {
        const k = bucketDe(pag)
        if (k) slot(k).realizado += valorPago
      }

      // CLASSIFICACAO: bucket do vencimento (planejamento)
      if (venc && venc >= deStr && venc <= ateStr) {
        const k = bucketDe(venc)
        if (!k) return
        const slt = slot(k)
        const sStatus = String(r.status_titulo || '').toUpperCase()
        if (sStatus === 'CANCELADO') return

        let classe: string | null = null
        let atraso: number | null = null
        if (pag) {
          atraso = diasEntre(venc, pag)
          if (atraso !== null) {
            if (atraso <= -2) classe = 'antecipado'
            else if (atraso >= 2) classe = 'atrasado'
            else classe = 'no_prazo'
            slt.atraso_acum_x_valor += atraso * valor
            slt.valor_atraso_acum += valor
          }
        } else if (venc < hojeISO) {
          classe = 'nao_pago'
        }
        if (classe) {
          slt[classe] += 1
          slt['valor_' + classe] += valor
        }

        if (atraso !== null && Math.abs(atraso) >= 2) {
          desviosCand.push({
            codigo_lancamento: r.codigo_lancamento,
            tipo: r._tipo,
            nome: r._nome,
            nf: r.numero_documento_fiscal || r.numero_documento || null,
            valor: valor,
            vencimento: venc,
            pagamento: pag,
            status: r.status_titulo,
            atraso_dias: atraso,
            peso: Math.abs(atraso) * valor,
          })
        }
      }
    })

    // atraso_medio por bucket
    Object.values(buckets).forEach((b: any) => {
      b.atraso_medio_dias = b.valor_atraso_acum > 0
        ? +(b.atraso_acum_x_valor / b.valor_atraso_acum).toFixed(1)
        : null
      delete b.atraso_acum_x_valor
      delete b.valor_atraso_acum
    })

    // Totais
    const arr = Object.values(buckets).sort((a: any, b: any) => a.rotulo.localeCompare(b.rotulo))
    const tot = arr.reduce((s: any, b: any) => {
      s.previsto += b.previsto
      s.realizado += b.realizado
      s.no_prazo += b.no_prazo
      s.antecipado += b.antecipado
      s.atrasado += b.atrasado
      s.nao_pago += b.nao_pago
      s.valor_no_prazo += b.valor_no_prazo
      s.valor_antecipado += b.valor_antecipado
      s.valor_atrasado += b.valor_atrasado
      s.valor_nao_pago += b.valor_nao_pago
      return s
    }, {
      previsto: 0, realizado: 0, no_prazo: 0, antecipado: 0, atrasado: 0, nao_pago: 0,
      valor_no_prazo: 0, valor_antecipado: 0, valor_atrasado: 0, valor_nao_pago: 0,
    })

    const totalClass = tot.no_prazo + tot.antecipado + tot.atrasado + tot.nao_pago
    const totais: any = {
      previsto: tot.previsto,
      realizado: tot.realizado,
      aderencia_pct: tot.previsto > 0 ? +(100 * tot.realizado / tot.previsto).toFixed(1) : 0,
      no_prazo_pct: totalClass > 0 ? +(100 * tot.no_prazo / totalClass).toFixed(1) : 0,
      antecipado_pct: totalClass > 0 ? +(100 * tot.antecipado / totalClass).toFixed(1) : 0,
      atrasado_pct: totalClass > 0 ? +(100 * tot.atrasado / totalClass).toFixed(1) : 0,
      nao_pago_pct: totalClass > 0 ? +(100 * tot.nao_pago / totalClass).toFixed(1) : 0,
      no_prazo: tot.no_prazo, antecipado: tot.antecipado, atrasado: tot.atrasado, nao_pago: tot.nao_pago,
      valor_no_prazo: tot.valor_no_prazo, valor_antecipado: tot.valor_antecipado,
      valor_atrasado: tot.valor_atrasado, valor_nao_pago: tot.valor_nao_pago,
    }
    // Atraso medio geral (ponderado por valor)
    let acumXV = 0, acumV = 0
    todasRows.forEach((r: any) => {
      const venc = ymd(r.data_vencimento)
      const pag = ymd(r.data_pagamento)
      if (venc && pag && venc >= deStr && venc <= ateStr) {
        const at = diasEntre(venc, pag)
        const v = Number(r.valor_documento) || 0
        acumXV += (at as number) * v
        acumV += v
      }
    })
    totais.atraso_medio_dias = acumV > 0 ? +(acumXV / acumV).toFixed(1) : null

    const top_desvios = desviosCand
      .sort((a, b) => b.peso - a.peso)
      .slice(0, 20)
      .map((d: any) => { const { peso, ...rest } = d; return rest })

    return NextResponse.json({
      conta, tipo, granularidade: gran,
      de: deStr, ate: ateStr,
      buckets: arr,
      totais,
      top_desvios,
    })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
