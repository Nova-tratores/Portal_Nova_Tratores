import { NextRequest, NextResponse } from 'next/server'
import {
  CONTA_PADRAO,
  TIPO_PADRAO,
  TIPOS_VALIDOS,
  buscaTitulosBase,
  filtraPorStatus,
  escondeVencidoAntigo,
} from '@/lib/dre-financeiro/calc'
import { fmtISO, inicioMes, fimMes, hoje, statusDerivado } from '@/lib/dre-financeiro/dates'

export const dynamic = 'force-dynamic'

// pegaConta/pegaTipo reimplementados inline (le searchParams, senao cookie, senao padrao)
function pegaConta(request: NextRequest): string {
  const c = (
    request.nextUrl.searchParams.get('conta') ||
    request.cookies.get('conta')?.value ||
    CONTA_PADRAO
  ).toString().toLowerCase()
  if (c === 'todas') return 'todas'
  return c
}

function pegaTipo(request: NextRequest): string {
  const t = (
    request.nextUrl.searchParams.get('tipo') ||
    request.cookies.get('tipo')?.value ||
    TIPO_PADRAO
  ).toString().toLowerCase()
  return TIPOS_VALIDOS.has(t) ? t : 'pagar'
}

// Espelha req.query do Express: objeto plano com os filtros que calc.js le.
function montaQuery(request: NextRequest): Record<string, string> {
  const sp = request.nextUrl.searchParams
  const q: Record<string, string> = {}
  for (const k of ['status', 'fornecedor', 'categoria', 'departamento', 'grupo']) {
    const v = sp.get(k)
    if (v != null) q[k] = v
  }
  return q
}

// =============================================================================
// API: visao anual do calendario (12 meses agregados)
// =============================================================================
export async function GET(request: NextRequest) {
  try {
    const conta = pegaConta(request)
    const tipo = pegaTipo(request)
    const q = montaQuery(request)
    const eixo = request.nextUrl.searchParams.get('eixo') === 'emissao' ? 'emissao' : 'vencimento'
    const campoData = eixo === 'emissao' ? 'data_emissao' : 'data_vencimento'
    const ano = parseInt(request.nextUrl.searchParams.get('ano') || '', 10) || new Date().getFullYear()

    const ini = fmtISO(inicioMes(ano, 1))
    const fim = fmtISO(fimMes(ano, 12))

    const tipos = tipo === 'ambos' ? ['pagar', 'receber'] : [tipo]
    const dadosPorTipo: Record<string, any[]> = {}
    for (const t of tipos) {
      dadosPorTipo[t] = filtraPorStatus(
        await buscaTitulosBase(t, conta, ini, fim, q, campoData),
        q.status
      )
    }

    const ref = hoje()
    // escondeVencidoAntigo so faz sentido no eixo vencimento (ver rota mes).
    if (eixo !== 'emissao') {
      for (const t of tipos) dadosPorTipo[t] = escondeVencidoAntigo(dadosPorTipo[t], ref)
    }

    // Inicializa 12 slots (1..12)
    const meses: Record<number, any> = {}
    for (let m = 1; m <= 12; m++) {
      meses[m] = {
        mes: m,
        total: 0, count: 0, vencido: 0, pago: 0, aVencer: 0, parcial: 0,
        saida: 0, entrada: 0, countSaida: 0, countEntrada: 0,
        saldo: 0
      }
    }

    Object.entries(dadosPorTipo).forEach(([t, rows]) => {
      rows.forEach((r: any) => {
        if (!r[campoData]) return
        const m = parseInt(String(r[campoData]).slice(5, 7), 10)
        if (!meses[m]) return
        const slot = meses[m]
        const valor = Number(r.valor_documento) || 0
        const st = statusDerivado(r, ref)

        slot.total += valor
        slot.count += 1
        if (st === 'LIQUIDADO') slot.pago += 1
        else if (st === 'VENCIDO') slot.vencido += 1
        else if (st === 'PARCIAL') slot.parcial += 1
        else slot.aVencer += 1

        if (t === 'pagar') {
          slot.saida += valor
          slot.countSaida += 1
        } else {
          slot.entrada += valor
          slot.countEntrada += 1
        }
      })
    })
    Object.values(meses).forEach((s: any) => { s.saldo = s.entrada - s.saida })

    // KPIs do ano
    const kpis = {
      aVencer: 0, vencido: 0, pagoAno: 0,
      aReceberAno: 0, aPagarAno: 0, saldoPrevisto: 0
    }
    Object.entries(dadosPorTipo).forEach(([t, rows]) => {
      rows.forEach((r: any) => {
        const valor = Number(r.valor_documento) || 0
        const valorPago = Number(r.valor_pago) || 0
        const st = statusDerivado(r, ref)
        const aberto = (valor - valorPago)
        if (st === 'LIQUIDADO') kpis.pagoAno += valorPago
        else if (st === 'VENCIDO') kpis.vencido += aberto
        else kpis.aVencer += aberto

        if (st !== 'LIQUIDADO') {
          if (t === 'pagar') kpis.aPagarAno += aberto
          else kpis.aReceberAno += aberto
        }
      })
    })
    kpis.saldoPrevisto = kpis.aReceberAno - kpis.aPagarAno

    return NextResponse.json({
      ano, conta, tipo,
      meses: Object.values(meses).sort((a: any, b: any) => a.mes - b.mes),
      kpis,
      total: Object.values(dadosPorTipo).reduce((a, rows) => a + rows.length, 0)
    })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
