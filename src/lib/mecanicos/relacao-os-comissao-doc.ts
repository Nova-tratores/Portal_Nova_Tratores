// Relação de OS da comissão — folha de CONFERÊNCIA para imprimir da ficha do mecânico (05/11/2026).
// Não é o documento da autorização (esse tem as assinaturas, `autorizacao-comissao-doc.ts`): sai a qualquer
// momento, com TODAS as OS do mês, os valores de cada uma, a decisão tomada na tela e a conta até o líquido.
// PURO: recebe os dados montados no navegador e devolve o HTML A4 paisagem. Nada de banco aqui.
import { brl, esc, dia, dataHora, mesExtenso, nomeProprio, decisaoDaLinha, type LinhaDoc } from './autorizacao-comissao-doc'

export interface LinhaRelacao {
  numero: string
  data: string | null
  cliente: string
  /** valor da OS (serviço + km + peças); null = a OS não veio na lista (mostra a base) */
  valorOS: number | null
  pecas: number
  /** desconto dado ao cliente na OS (hora + km + geral + peças) */
  descontoCliente: number
  horas: number | null
  base: number
  /** o que a regra dá */
  calculado: number
  /** o que vale com a decisão da tela */
  final: number
  acao: 'pagar' | 'nao' | 'ajustar'
  motivo?: string
  divisao?: Record<string, number> | null
  /** OS de outro técnico que dividiu com este */
  veioDe?: { de: string; horas?: number | null; status: string } | null
  /** OS dividida no Omie com outros técnicos */
  com?: string[]
  /** motivo de ajuste gravado pelo RH */
  motivoRH?: string | null
  /** observações curtas (requisição não cobrada, desconto sem motivo, contrato interno…) */
  obs?: string[]
}

export interface GrupoRelacao { k: string; rot: string; dica?: string; linhas: LinhaRelacao[] }

export type TipoSituacao = 'previa' | 'aguardando' | 'devolvida' | 'recusada' | 'autorizada' | 'erro_rh' | 'omie' | 'paga'

export interface DescontoRelacao { descricao: string; valor: number; parcelas?: number; inicio?: string | null; caixinha?: boolean; ref?: string | null }

export interface DocRelacaoOS {
  tecnico: string; nomeRh?: string | null; cargo?: string | null; mes: string
  /** como a comissão é calculada, em palavras */
  regra: string
  pagamentoPrevisto?: string | null
  emitidoEm: string; emitidoPor?: string | null; logo: string
  situacao: { tipo: TipoSituacao; texto: string }
  grupos: GrupoRelacao[]
  /** OS esperando faturar — fora do total */
  aguardando: { numero: string; cliente: string; data: string | null; valor: number }[]
  /** descontos lançados na tela junto com a comissão */
  descontos: DescontoRelacao[]
  /** descontos que já estão no RH esperando ou aprovados (informativo) */
  descontosRH: DescontoRelacao[]
  /** caixinha retida (já calculada; 0 = não tem) */
  caixinha: number
  caixinhaPct?: number
}

const r2 = (v: number) => Math.round(v * 100) / 100
const primeira = (x: DescontoRelacao) => r2(x.valor / Math.max(1, x.parcelas || 1))
const mudou = (l: LinhaRelacao) => Math.abs(l.final - l.calculado) > 0.005
const valorDa = (l: LinhaRelacao) => (l.valorOS != null ? l.valorOS : l.base)

/** "pela regra" / "Não paga — motivo" / "Ajustada — motivo" / "Dividida com …" / "dividida por Fulano". */
export function decisaoRelacao(l: LinhaRelacao, tecnico: string): string {
  if (l.veioDe) return `Dividida por ${l.veioDe.de}${l.veioDe.horas ? ` (${String(l.veioDe.horas).replace('.', ',')} h para ele)` : ''} · ${l.veioDe.status === 'autorizada' ? 'autorizada' : l.veioDe.status === 'pedido' ? 'esperando o diretor' : 'divisão salva'}`
  const doc: LinhaDoc = { os: l.numero, numero: l.numero, data: l.data, cliente: l.cliente, grupo: 'cliente', regra: '', calculado: l.calculado, valor: l.final, acao: l.acao, motivo: l.motivo, divisao: l.divisao }
  const dec = decisaoDaLinha(doc, tecnico)
  const partes = [dec || 'Pela regra']
  if (!l.divisao && l.com?.length) partes.push(`dividida no Omie com ${l.com.join(', ')}`)
  if (l.motivoRH) partes.push(`RH: ${l.motivoRH}`)
  return partes.join(' · ')
}

export function totaisRelacao(d: DocRelacaoOS) {
  const grupos = d.grupos.filter((g) => g.linhas.length).map((g) => ({
    k: g.k, rot: g.rot, n: g.linhas.length,
    valor: r2(g.linhas.reduce((s, l) => s + valorDa(l), 0)),
    base: r2(g.linhas.reduce((s, l) => s + l.base, 0)),
    calculado: r2(g.linhas.reduce((s, l) => s + l.calculado, 0)),
    final: r2(g.linhas.reduce((s, l) => s + l.final, 0)),
  }))
  const soma = (k: 'n' | 'valor' | 'base' | 'calculado' | 'final') => r2(grupos.reduce((s, g) => s + g[k], 0))
  const todas = d.grupos.flatMap((g) => g.linhas)
  const descontos = r2(d.descontos.filter((x) => !x.caixinha).reduce((s, x) => s + primeira(x), 0))
  const final = soma('final')
  return {
    grupos, n: soma('n'), valor: soma('valor'), base: soma('base'), calculado: soma('calculado'), final,
    mexidas: todas.filter((l) => mudou(l) || l.acao !== 'pagar' || !!l.divisao).length,
    naoPagas: todas.filter((l) => l.acao === 'nao').length,
    aguardando: r2(d.aguardando.reduce((s, a) => s + a.valor, 0)),
    descontos, caixinha: r2(d.caixinha), liquido: r2(final - descontos - d.caixinha),
  }
}

const COR_SIT: Record<TipoSituacao, string> = { previa: '#64748b', aguardando: '#d97706', devolvida: '#d97706', recusada: '#b91c1c', autorizada: '#16a34a', erro_rh: '#b91c1c', omie: '#2563eb', paga: '#047857' }
const horasTxt = (h: number | null) => (h ? `${String(Math.round(h * 10) / 10).replace('.', ',')} h` : '—')

export function htmlRelacaoOS(d: DocRelacaoOS): string {
  const t = totaisRelacao(d)
  const nome = nomeProprio(d.nomeRh || d.tecnico)
  const dif = t.final - t.calculado
  const tabela = d.grupos.filter((g) => g.linhas.length).map((g) => {
    const tg = t.grupos.find((x) => x.k === g.k)!
    return `<tbody>
      <tr class="grp"><td colspan="10">${esc(g.rot)}<span class="grp-n">${g.linhas.length} ${g.linhas.length === 1 ? 'ordem' : 'ordens'}${g.dica ? ` · ${esc(g.dica)}` : ''}</span></td></tr>
      ${g.linhas.map((l) => {
        const dec = decisaoRelacao(l, d.tecnico)
        const mex = mudou(l) || l.acao !== 'pagar' || !!l.divisao || !!l.veioDe
        return `<tr${mex ? ' class="mex"' : ''}>
          <td class="os">${esc(l.numero)}</td><td class="dt">${dia(l.data)}</td>
          <td class="cli">${esc(nomeProprio(l.cliente || '—'))}${l.obs?.length ? `<div class="sub">${l.obs.map((o) => `<span>${esc(o)}</span>`).join('')}</div>` : ''}</td>
          <td class="v">${brl(valorDa(l))}</td><td class="v cinza">${l.pecas > 0 ? brl(l.pecas) : '—'}</td>
          <td class="v ${l.descontoCliente > 0 ? 'neg' : 'cinza'}">${l.descontoCliente > 0 ? `− ${brl(l.descontoCliente)}` : '—'}</td>
          <td class="v cinza">${horasTxt(l.horas)}</td><td class="v">${l.base ? brl(l.base) : '—'}</td>
          <td class="dec${mex ? ' on' : ''}">${esc(dec)}</td>
          <td class="v com">${mudou(l) ? `<s>${brl(l.calculado)}</s>` : ''}${brl(l.final)}</td>
        </tr>`
      }).join('')}
      <tr class="subt"><td colspan="3">Subtotal · ${esc(g.rot)}</td><td class="v">${brl(tg.valor)}</td><td colspan="3"></td><td class="v">${brl(tg.base)}</td><td></td><td class="v">${brl(tg.final)}</td></tr>
    </tbody>`
  }).join('')

  const aguardando = d.aguardando.length ? `<section class="bloco">
    <h2>Esperando faturar <small>entram na comissão quando faturarem · fora do total</small></h2>
    <table class="mini"><thead><tr><th>OS</th><th>Data</th><th>Cliente</th><th class="v">Comissão a caminho</th></tr></thead><tbody>
      ${d.aguardando.map((a) => `<tr><td class="os">${esc(a.numero)}</td><td class="dt">${dia(a.data)}</td><td>${esc(nomeProprio(a.cliente || '—'))}</td><td class="v">${brl(a.valor)}</td></tr>`).join('')}
      <tr class="subt"><td colspan="3">${d.aguardando.length} OS</td><td class="v">${brl(t.aguardando)}</td></tr>
    </tbody></table></section>` : ''

  const parcelaTxt = (x: DescontoRelacao) => x.caixinha ? 'pago pela caixinha dos técnicos — não sai da comissão' : (x.parcelas || 1) > 1 ? `em ${x.parcelas} parcelas de ${brl(primeira(x))}${x.inicio ? `, a partir de ${mesExtenso(x.inicio)}` : ''} (total ${brl(x.valor)})` : 'desconto em folha'
  const liquido = `<section class="bloco liq">
    <h2>Da comissão ao líquido</h2>
    <table class="desc-t"><tbody>
      <tr class="ini"><td>Comissão com as decisões</td><td class="v">${brl(t.final)}</td></tr>
      ${d.descontos.map((x) => `<tr><td>${x.ref ? `Requisição #${esc(x.ref)} — ` : ''}${esc(x.descricao)}<span class="onde">${esc(parcelaTxt(x))}</span></td><td class="v neg">${x.caixinha ? `(${brl(x.valor)})` : `− ${brl(primeira(x))}`}</td></tr>`).join('')}
      ${d.caixinha > 0 ? `<tr><td>Caixinha ${String(d.caixinhaPct ?? 1).replace('.', ',')}%<span class="onde">retida no pagamento da comissão</span></td><td class="v neg">− ${brl(d.caixinha)}</td></tr>` : ''}
      <tr class="fim"><td>Líquido para ${esc(nome.split(' ')[0])}</td><td class="v">${brl(t.liquido)}</td></tr>
    </tbody></table>
    ${d.descontosRH.length ? `<p class="rh-t">Já no RH (pendentes ou aprovados, saem na folha):</p><table class="desc-t rh"><tbody>${d.descontosRH.map((x) => `<tr><td>${esc(x.descricao)}<span class="onde">${x.caixinha ? 'pela caixinha' : 'da comissão'}</span></td><td class="v">${brl(x.valor)}</td></tr>`).join('')}</tbody></table>` : ''}
  </section>`

  const rodape = `Nova Tratores  ·  Relação de OS  ·  ${nome}  ·  ${mesExtenso(d.mes)}`
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relação de OS — ${esc(nome)} — ${esc(mesExtenso(d.mes))}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500&display=swap" rel="stylesheet">
<style>
@page { size: A4 landscape; margin: 12mm 12mm 14mm; @bottom-left { content: "${esc(rodape)}"; font: 8pt "IBM Plex Sans", Arial, sans-serif; color: #94a3b8 } @bottom-right { content: "página " counter(page) " de " counter(pages); font: 8pt "IBM Plex Sans", Arial, sans-serif; color: #94a3b8 } }
* { box-sizing: border-box } html, body { margin: 0; padding: 0; background: #fff }
body { font: 9.4pt/1.4 "IBM Plex Sans", Arial, Helvetica, sans-serif; color: #111827; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-feature-settings: "tnum" 1 }
.cab { display: flex; justify-content: space-between; align-items: center; padding-bottom: 10px }
.cab img { height: 30px } .cab-dir { text-align: right; font-size: 8.4pt; color: #6b7280; line-height: 1.55 } .cab-dir b { display: block; font-weight: 500; font-size: 9pt; color: #111827; letter-spacing: 1.2px; text-transform: uppercase }
.faixa { height: 2px; background: #111827; margin-bottom: 14px; position: relative } .faixa::after { content: ''; position: absolute; left: 0; top: 0; width: 38mm; height: 2px; background: #c8102e }
.titulo { display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; margin-bottom: 12px }
.titulo h1 { margin: 0; font-size: 19pt; font-weight: 400; letter-spacing: -.3px; line-height: 1.1 }
.titulo p { margin: 4px 0 0; font-size: 9.6pt; color: #4b5563 } .titulo p span { white-space: nowrap } .titulo p span + span::before { content: '·'; margin: 0 7px; color: #9ca3af }
.st { font-size: 9pt; margin-bottom: 4px } .st i { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 6px }
.aviso { font-size: 8.4pt; color: #92400e; text-align: right; max-width: 70mm }
.res { display: grid; grid-template-columns: repeat(5, 1fr) 1.6fr; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; margin-bottom: 14px; break-inside: avoid }
.res > div { padding: 8px 0 8px 12px } .res > div:first-child { padding-left: 0 } .res > div + div { border-left: 1px solid #e5e7eb }
.res small { display: block; font-size: 7.8pt; color: #6b7280; text-transform: uppercase; letter-spacing: .7px; margin-bottom: 3px }
.res b { font-weight: 400; font-size: 12.6pt } .res .tot b { font-size: 16pt; font-weight: 500 } .res em { display: block; font-style: normal; font-size: 8.2pt; color: #6b7280; margin-top: 1px } .res .neg { color: #b91c1c } .res .pos { color: #047857 }
.res .grs { font-size: 8.4pt; color: #374151; line-height: 1.55 } .res .grs b { font-size: 9pt; font-weight: 500 } .res .grs span { display: flex; justify-content: space-between; gap: 8px } .res .grs span em { display: inline; margin: 0 }
h2 { font-size: 8.6pt; font-weight: 500; text-transform: uppercase; letter-spacing: 1.1px; margin: 0 0 5px } h2 small { text-transform: none; letter-spacing: 0; color: #9ca3af; font-weight: 400; margin-left: 8px }
table { width: 100%; border-collapse: collapse }
thead { display: table-header-group }
thead th { text-align: left; font-weight: 400; color: #6b7280; font-size: 7.6pt; text-transform: uppercase; letter-spacing: .5px; padding: 5px 5px 5px 0; border-bottom: 1px solid #111827; vertical-align: bottom }
td { padding: 4px 5px 4px 0; border-bottom: 1px solid #f3f4f6; vertical-align: top }
th.v, td.v { text-align: right; white-space: nowrap; padding-left: 8px } td.cinza { color: #9ca3af } td.neg { color: #b91c1c }
td.os { white-space: nowrap; color: #374151 } td.dt { white-space: nowrap; color: #6b7280 } td.cli { width: 22% }
td.cli .sub span { display: block; font-size: 7.8pt; color: #b45309; margin-top: 1px }
td.dec { font-size: 8.4pt; color: #6b7280; width: 21%; padding-left: 14px } th.dec { padding-left: 14px } td.dec.on { color: #92400e }
td.com { font-weight: 500 } td.com s { color: #9ca3af; font-weight: 400; margin-right: 6px; font-size: 8.4pt }
tr.mex td.os { box-shadow: inset 2px 0 0 #d97706; padding-left: 5px }
tr.grp td { padding-top: 10px; font-weight: 500; border-bottom: 1px solid #e5e7eb } tr.grp .grp-n { font-weight: 400; color: #9ca3af; font-size: 8.4pt; margin-left: 8px }
tr.subt td { font-weight: 500; border-bottom: 1px solid #e5e7eb; background: #f9fafb; padding-top: 5px; padding-bottom: 5px } tr.subt td:first-child { padding-left: 6px }
tr { break-inside: avoid } tbody { break-inside: auto }
tfoot td { border-top: 1.5px solid #111827; border-bottom: none; padding-top: 7px; font-size: 10.4pt; font-weight: 500 }
.bloco { margin-top: 16px; break-inside: avoid } .mini { max-width: 160mm }
.liq { max-width: 150mm } .desc-t td { padding: 4px 0 } .desc-t td.v { padding-left: 16px } .desc-t .onde { display: block; font-size: 7.8pt; color: #9ca3af }
.desc-t tr.ini td { color: #374151 } .desc-t tr.fim td { border-top: 1.5px solid #111827; border-bottom: none; font-weight: 500; font-size: 11pt; padding-top: 6px }
.rh-t { margin: 10px 0 2px; font-size: 8.4pt; color: #6b7280 } .desc-t.rh td { color: #6b7280; font-size: 8.6pt }
.nota { margin-top: 14px; font-size: 7.8pt; color: #9ca3af }
</style></head><body>
<header class="cab">
  <img src="${esc(d.logo)}" alt="Nova Tratores">
  <div class="cab-dir"><b>Relação de OS · comissão</b>Emitido em ${esc(dataHora(d.emitidoEm))}${d.emitidoPor ? ` por ${esc(d.emitidoPor)}` : ''}</div>
</header>
<div class="faixa"></div>
<section class="titulo">
  <div>
    <div class="st" style="color:${COR_SIT[d.situacao.tipo]}"><i style="background:${COR_SIT[d.situacao.tipo]}"></i>${esc(d.situacao.texto)}</div>
    <h1>${esc(nome)} — comissão de ${esc(mesExtenso(d.mes))}</h1>
    <p>${d.cargo ? `<span>${esc(nomeProprio(d.cargo))}</span>` : ''}<span>${esc(d.regra)}</span>${d.pagamentoPrevisto ? `<span>Pagamento previsto ${esc(d.pagamentoPrevisto.split('-').reverse().join('/'))}</span>` : ''}</p>
  </div>
  <div class="aviso">Documento de conferência — não substitui a autorização assinada pelo diretor.</div>
</section>
<section class="res">
  <div><small>Ordens de serviço</small><b>${t.n}</b><em>${t.mexidas ? `${t.mexidas} com decisão${t.naoPagas ? ` · ${t.naoPagas} não paga${t.naoPagas > 1 ? 's' : ''}` : ''}` : 'todas pela regra'}</em></div>
  <div><small>Valor das OS</small><b>${brl(t.valor)}</b><em>serviço, km e peças</em></div>
  <div><small>Base da comissão</small><b>${brl(t.base)}</b></div>
  <div><small>Pela regra</small><b>${brl(t.calculado)}</b>${Math.abs(dif) > 0.005 ? `<em class="${dif > 0 ? 'pos' : 'neg'}">${dif > 0 ? '+' : '−'} ${brl(Math.abs(dif))} nas decisões</em>` : ''}</div>
  <div class="tot"><small>Comissão</small><b>${brl(t.final)}</b><em>líquido ${brl(t.liquido)}</em></div>
  <div class="grs"><small>Por grupo</small>${t.grupos.map((g) => `<span>${esc(g.rot)} <em>${g.n} OS · ${brl(g.valor)} → <b>${brl(g.final)}</b></em></span>`).join('')}</div>
</section>
${t.n ? `<h2>Ordens de serviço</h2>
<table>
  <thead><tr><th>OS</th><th>Data</th><th>Cliente</th><th class="v">Valor da OS</th><th class="v">Peças</th><th class="v">Desconto ao cliente</th><th class="v">Horas</th><th class="v">Base</th><th class="dec">Decisão</th><th class="v">Comissão</th></tr></thead>
  ${tabela}
  <tfoot><tr><td colspan="3">Total · ${t.n} OS</td><td class="v">${brl(t.valor)}</td><td colspan="3"></td><td class="v">${brl(t.base)}</td><td></td><td class="v">${brl(t.final)}</td></tr></tfoot>
</table>` : '<p>Nenhuma OS faturada neste mês.</p>'}
${aguardando}
${liquido}
<p class="nota">Valores e decisões como estavam na tela da ficha no momento da impressão. Comissão riscada = o que a regra daria; ao lado, o que vale com a decisão.</p>
</body></html>`
}
