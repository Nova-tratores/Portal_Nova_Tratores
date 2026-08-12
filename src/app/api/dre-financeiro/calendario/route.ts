import { NextRequest, NextResponse } from 'next/server'
import {
  CONTA_PADRAO,
  TIPO_PADRAO,
  TIPOS_VALIDOS,
  buscaTitulosBase,
  filtraPorStatus,
  escondeVencidoAntigo,
} from '@/lib/dre-financeiro/calc'
import { fmtISO, inicioMes, fimMes, hoje, addDias, statusDerivado } from '@/lib/dre-financeiro/dates'

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
// API: dados do calendario (mes a mes, agregado por dia)
// =============================================================================
export async function GET(request: NextRequest) {
  try {
    const conta = pegaConta(request)
    const tipo = pegaTipo(request)
    const q = montaQuery(request)
    const eixoRaw = request.nextUrl.searchParams.get('eixo')
    const eixo = eixoRaw === 'emissao' || eixoRaw === 'inclusao' ? eixoRaw : 'vencimento'
    const campoData = eixo === 'emissao' ? 'data_emissao' : eixo === 'inclusao' ? 'data_inclusao' : 'data_vencimento'
    const mes = parseInt(request.nextUrl.searchParams.get('mes') || '', 10) || (new Date().getMonth() + 1)
    const ano = parseInt(request.nextUrl.searchParams.get('ano') || '', 10) || new Date().getFullYear()

    const ini = fmtISO(inicioMes(ano, mes))
    const fim = fmtISO(fimMes(ano, mes))

    const tipos = tipo === 'ambos' ? ['pagar', 'receber'] : [tipo]
    const dadosPorTipo: Record<string, any[]> = {}
    for (const t of tipos) {
      dadosPorTipo[t] = filtraPorStatus(
        await buscaTitulosBase(t, conta, ini, fim, q, campoData),
        q.status
      )
    }

    const ref = hoje()
    // escondeVencidoAntigo so faz sentido no eixo vencimento (limpa lixo de anos
    // passados por data_vencimento). Nos eixos emissao/inclusao a janela ja e por
    // aquela coluna, entao nao se aplica.
    if (eixo === 'vencimento') {
      for (const t of tipos) dadosPorTipo[t] = escondeVencidoAntigo(dadosPorTipo[t], ref)
    }
    const hojeISO = fmtISO(ref)
    const proximos7ISO = fmtISO(addDias(ref, 7))

    // Agrega por dia. No modo "ambos", separamos saida (pagar) de entrada (receber).
    const porDia: Record<string, any> = {}
    function slotDe(k: string) {
      if (!porDia[k]) {
        porDia[k] = {
          data: k,
          // Modo unico (pagar OU receber)
          total: 0, count: 0, vencido: 0, pago: 0, aVencer: 0, parcial: 0,
          // Modo ambos
          saida: 0, entrada: 0, countSaida: 0, countEntrada: 0,
          saldo: 0
        }
      }
      return porDia[k]
    }

    Object.entries(dadosPorTipo).forEach(([t, rows]) => {
      rows.forEach((r: any) => {
        // data_inclusao vem como timestamp; normaliza para o dia (YYYY-MM-DD).
        const k = r[campoData] ? String(r[campoData]).slice(0, 10) : null
        if (!k) return
        const slot = slotDe(k)
        const valor = Number(r.valor_documento) || 0
        const st = statusDerivado(r, ref)

        // Agregados unicos
        slot.total += valor
        slot.count += 1
        if (st === 'LIQUIDADO') slot.pago += 1
        else if (st === 'VENCIDO') slot.vencido += 1
        else if (st === 'PARCIAL') slot.parcial += 1
        else slot.aVencer += 1

        // Agregados por tipo (para modo "ambos")
        if (t === 'pagar') {
          slot.saida += valor
          slot.countSaida += 1
        } else {
          slot.entrada += valor
          slot.countEntrada += 1
        }
      })
    })
    Object.values(porDia).forEach((s: any) => { s.saldo = s.entrada - s.saida })

    // KPIs do mes
    const kpis = {
      // modo unico
      aVencer: 0, vencido: 0, pagoMes: 0, prox7: 0,
      // modo ambos
      aReceberMes: 0, aPagarMes: 0, saldoPrevisto: 0, saldoProx7: 0
    }

    Object.entries(dadosPorTipo).forEach(([t, rows]) => {
      rows.forEach((r: any) => {
        const valor = Number(r.valor_documento) || 0
        const valorPago = Number(r.valor_pago) || 0
        const st = statusDerivado(r, ref)
        const aberto = (valor - valorPago)

        // KPIs unicos
        if (st === 'LIQUIDADO') kpis.pagoMes += valorPago
        else if (st === 'VENCIDO') kpis.vencido += aberto
        else kpis.aVencer += aberto

        if (r.data_vencimento && r.data_vencimento >= hojeISO && r.data_vencimento <= proximos7ISO && st !== 'LIQUIDADO') {
          kpis.prox7 += aberto
        }

        // KPIs ambos: somente o que ainda nao foi liquidado
        if (st !== 'LIQUIDADO') {
          if (t === 'pagar') kpis.aPagarMes += aberto
          else kpis.aReceberMes += aberto

          if (r.data_vencimento && r.data_vencimento >= hojeISO && r.data_vencimento <= proximos7ISO) {
            kpis.saldoProx7 += (t === 'receber' ? aberto : -aberto)
          }
        }
      })
    })
    kpis.saldoPrevisto = kpis.aReceberMes - kpis.aPagarMes

    return NextResponse.json({
      mes, ano, conta, tipo,
      dias: Object.values(porDia).sort((a: any, b: any) => a.data.localeCompare(b.data)),
      kpis,
      total: Object.values(dadosPorTipo).reduce((acc, rows) => acc + rows.length, 0)
    })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
