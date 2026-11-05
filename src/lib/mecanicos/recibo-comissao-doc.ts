// Recibo da comissão (05/11/2026): o técnico declara que recebeu o valor. Impresso junto com o de acordo,
// assinado à mão, escaneado e guardado na pasta do funcionário (RH) e na pasta física. PURO: dados → HTML A4.
import { valorPorExtenso } from './de-acordo'
import { brl, esc, mesExtenso, nomeProprio, dataHora } from './autorizacao-comissao-doc'

export interface DocRecibo {
  codigo: string
  tecnico: string; nomeRh?: string | null; cpf?: string | null
  mes: string
  comissao: number
  /** descontos que saem neste pagamento (1ª parcela de cada um; pagos pela caixinha não entram) */
  descontos: { descricao: string; valor: number }[]
  caixinha: number
  empresa: { razao: string; cnpj?: string | null; cidade?: string | null }
  logo: string; emitidoEm: string
}

const cpfFmt = (s?: string | null) => { const d = String(s || '').replace(/\D/g, ''); return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : s || '' }
const cnpjFmt = (s?: string | null) => { const d = String(s || '').replace(/\D/g, ''); return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : s || '' }
const r2 = (n: number) => Math.round(n * 100) / 100

export function liquidoRecibo(d: Pick<DocRecibo, 'comissao' | 'descontos' | 'caixinha'>): number {
  return r2(d.comissao - d.descontos.reduce((a, x) => a + x.valor, 0) - d.caixinha)
}

/** Texto do recibo (vai na folha). */
export function textoRecibo(d: DocRecibo): string {
  const liq = liquidoRecibo(d)
  const nome = nomeProprio(d.nomeRh || d.tecnico)
  const totDesc = r2(d.comissao - liq)
  const partes = totDesc > 0.005 ? ` (comissão de ${brl(d.comissao)}, menos ${brl(totDesc)} de descontos)` : ''
  return `Eu, ${nome}${d.cpf ? `, CPF ${cpfFmt(d.cpf)}` : ''}, recebi de ${d.empresa.razao}${d.empresa.cnpj ? `, CNPJ ${cnpjFmt(d.empresa.cnpj)}` : ''}, a importância de ${brl(liq)} (${valorPorExtenso(liq)}), referente ao pagamento da minha comissão sobre ordens de serviço da competência de ${mesExtenso(d.mes)}${partes}, conforme a autorização nº ${d.codigo}. Por ser verdade, dou plena quitação deste valor.`
}

/** Só o corpo (para ir junto do de acordo, numa página própria) + o CSS dele. */
export function secaoRecibo(d: DocRecibo): { css: string; html: string } {
  const liq = liquidoRecibo(d)
  const nome = nomeProprio(d.nomeRh || d.tecnico)
  const linhas = [
    `<tr><td>Comissão de ${esc(mesExtenso(d.mes))}</td><td class="v">${brl(d.comissao)}</td></tr>`,
    ...d.descontos.map((x) => `<tr><td>${esc(x.descricao)}</td><td class="v neg">− ${brl(x.valor)}</td></tr>`),
    ...(d.caixinha > 0 ? [`<tr><td>Caixinha</td><td class="v neg">− ${brl(d.caixinha)}</td></tr>`] : []),
    `<tr class="fim"><td>Valor recebido</td><td class="v">${brl(liq)}</td></tr>`,
  ].join('')
  const css = `
.rec { page-break-before: always; break-before: page; max-width: 180mm; margin: 0 auto; font: 11pt/1.55 "IBM Plex Sans", Arial, sans-serif; color: #111827 }
.rec-cab { display: flex; justify-content: space-between; align-items: center; padding-bottom: 14px } .rec-cab img { height: 34px }
.rec-cab div { text-align: right; font-size: 9pt; color: #6b7280; line-height: 1.6 } .rec-cab b { display: block; font-weight: 500; font-size: 9.6pt; color: #111827; letter-spacing: 1.2px; text-transform: uppercase }
.rec-faixa { height: 2px; background: #111827; margin-bottom: 26px; position: relative } .rec-faixa::after { content: ''; position: absolute; left: 0; top: 0; width: 38mm; height: 2px; background: #c8102e }
.rec-tit { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 22px } .rec-tit h1 { margin: 0; font-size: 26pt; font-weight: 400; letter-spacing: 2px }
.rec-valor { border: 1.5px solid #111827; padding: 8px 16px; font-size: 18pt; font-weight: 500; white-space: nowrap }
.rec-txt { font-size: 12pt; line-height: 1.8; margin: 0 0 22px; text-align: justify }
.rec-t { width: 100%; max-width: 120mm; border-collapse: collapse; font-size: 10pt; margin-bottom: 34px } .rec-t td { padding: 5px 0; border-bottom: 1px solid #f3f4f6 } .rec-t td.v { text-align: right; padding-left: 16px; white-space: nowrap } .rec-t .neg { color: #b91c1c } .rec-t tr.fim td { border-top: 1px solid #111827; border-bottom: none; font-weight: 500; font-size: 11pt }
.rec-local { font-size: 12pt; margin-bottom: 26mm }
.rec-ass { width: 95mm; border-top: 1px solid #111827; padding-top: 6px; font-size: 11pt } .rec-ass small { display: block; font-size: 9pt; color: #6b7280 }
.rec-pe { margin-top: 18mm; padding-top: 8px; border-top: 1px solid #f3f4f6; font-size: 8.2pt; color: #9ca3af }`
  const html = `<section class="rec">
<header class="rec-cab"><img src="${esc(d.logo)}" alt="Nova Tratores"><div><b>Recibo de comissão</b>Ref. ${esc(d.codigo)}<br>Emitido em ${esc(dataHora(d.emitidoEm))}</div></header>
<div class="rec-faixa"></div>
<div class="rec-tit"><h1>RECIBO</h1><div class="rec-valor">${brl(liq)}</div></div>
<p class="rec-txt">${esc(textoRecibo(d))}</p>
<table class="rec-t"><tbody>${linhas}</tbody></table>
<div class="rec-local">${d.empresa.cidade ? esc(d.empresa.cidade) : '____________________'}, ______ de ______________________ de __________.</div>
<div class="rec-ass">${esc(nome)}<small>${d.cpf ? `CPF ${esc(cpfFmt(d.cpf))} · ` : ''}Técnico</small></div>
<div class="rec-pe">Recibo gerado pelo Portal Nova Tratores. Depois de assinado, é escaneado e guardado na pasta do funcionário. Ref. ${esc(d.codigo)}.</div>
</section>`
  return { css, html }
}

export function htmlReciboComissao(d: DocRecibo): string {
  const { css, html } = secaoRecibo(d)
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Recibo de comissão ${esc(d.codigo)}</title>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500&display=swap" rel="stylesheet">
<style>@page { size: A4; margin: 16mm } * { box-sizing: border-box } html, body { margin: 0; background: #fff } body { -webkit-print-color-adjust: exact; print-color-adjust: exact }${css} .rec { page-break-before: auto; break-before: auto }</style>
</head><body>${html}</body></html>`
}
