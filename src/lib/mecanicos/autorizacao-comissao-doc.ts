// Documento final da comissão autorizada (José, 20/10/2026: "na hora de pedir a autorização tem que pedir a
// assinatura de quem está pedindo, e no final gera um PDF com as comissões e as duas assinaturas").
// PURO: recebe os dados e devolve o HTML A4 (o PDF sai dele pelo navegador/Chrome). Nada de banco aqui.

export type GrupoOS = 'cliente' | 'garantia' | 'interna'
export interface LinhaDoc {
  os: string; numero: string; data: string | null; cliente: string; grupo: GrupoOS; regra: string
  calculado: number; valor: number; acao: 'pagar' | 'nao' | 'ajustar'; motivo?: string; divisao?: Record<string, number> | null
  /** desconto dado ao CLIENTE na OS (R$), para deixar claro no documento */
  descontoCliente?: { hora: number; km: number; geral: number; pecas: number } | null
}
export interface AssinaturaDoc { nome: string; papel: string; em: string; imagem: string | null; ip?: string | null; local?: string | null }
export interface DocAutorizacao {
  codigo: string; tecnico: string; nomeRh?: string | null; cargo?: string | null; mes: string
  pct?: number | null; pagamentoPrevisto?: string | null; linhas: LinhaDoc[]
  solicitante: AssinaturaDoc; diretor: (AssinaturaDoc & { observacao?: string | null }) | null
  logo: string; emitidoEm: string
  /** caixinha retida no pagamento da comissão (RH: 1%) */
  caixinhaPct?: number
  /** descontos do técnico lançados junto (requisição/outro) — saem na folha */
  descontos?: { tipo: 'requisicao' | 'outro'; ref?: string | null; descricao: string; valor: number; parcelas?: number; inicio?: string | null; fonte?: 'funcionario' | 'caixinha' }[] | null
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
export const mesExtenso = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const esc = (s: unknown) => String(s ?? '').replace(/&amp;/gi, '&').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const dia = (s: string | null) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '—')
const dataHora = (s: string) => new Date(s).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const ROT_GRUPO: Record<GrupoOS, string> = { cliente: 'Faturadas para clientes', garantia: 'Garantia', interna: 'Internas' }

/** O que aconteceu com a OS, em palavras (vai na coluna Observação). */
export function decisaoDaLinha(l: LinhaDoc, tecnico: string): string {
  if (l.acao === 'nao') return `Não paga — ${l.motivo || 'sem motivo'}`
  if (l.divisao) {
    const outros = Object.entries(l.divisao).filter(([k]) => k !== tecnico).map(([k, v]) => `${k.split(' ')[0]} ${brl(v)}`)
    return `Dividida${outros.length ? ` com ${outros.join(', ')}` : ''} — ${l.motivo || 'sem motivo'}`
  }
  if (l.acao === 'ajustar' || Math.abs(l.valor - l.calculado) > 0.005) return `Ajustada — ${l.motivo || 'sem motivo'}`
  return ''
}

/** "desconto ao cliente: R$ 200,00 nas horas, R$ 50,00 em peças" — vazio se não teve. */
export function textoDescontoCliente(dc: LinhaDoc['descontoCliente']): string {
  if (!dc) return ''
  const p = ([['nas horas', dc.hora], ['no km', dc.km], ['no total da OS', dc.geral], ['nas peças', dc.pecas]] as [string, number][]).filter(([, v]) => v > 0.005)
  return p.length ? `desconto ao cliente: ${p.map(([r, v]) => `${brl(v)} ${r}`).join(', ')}` : ''
}

/** O que reduz a comissão em relação à regra, linha a linha (para o quadro "O que está sendo descontado"). */
export function descontosDoc(linhas: LinhaDoc[], tecnico: string): { texto: string; valor: number }[] {
  const out: { texto: string; valor: number }[] = []
  for (const l of linhas) {
    const d = l.valor - l.calculado
    if (d > -0.005) continue
    const qual = l.acao === 'nao' ? 'não paga' : l.divisao ? `dividida com ${Object.keys(l.divisao).filter((k) => k !== tecnico).map((k) => k.split(' ')[0]).join(', ') || 'outro técnico'}` : 'ajustada para menos'
    out.push({ texto: `OS ${l.numero} · ${qual}${l.motivo ? ` — ${l.motivo}` : ''}`, valor: d })
  }
  return out
}

export function totaisDoc(linhas: LinhaDoc[]) {
  const t = { total: 0, calculado: 0, n: linhas.length, mexidas: 0, naoPagas: 0, cliente: 0, garantia: 0, interna: 0 }
  for (const l of linhas) {
    t.total += l.valor; t.calculado += l.calculado; t[l.grupo] += l.valor
    if (l.acao === 'nao') t.naoPagas++
    if (l.acao !== 'pagar' || l.divisao || Math.abs(l.valor - l.calculado) > 0.005) t.mexidas++
  }
  return t
}

const nomeProprio = (s: string) => s.toLowerCase().replace(/(^|\s)(\S)/g, (_, a: string, b: string) => a + b.toUpperCase()).replace(/\b(De|Da|Do|Dos|Das|E)\b/g, (m) => m.toLowerCase())

function blocoAssinatura(a: AssinaturaDoc | null, papel: string, obs?: string | null): string {
  if (!a) return `<div class="ass vazia"><div class="ass-img"><span>aguardando assinatura</span></div><div class="ass-linha"></div><div class="ass-nome">&nbsp;</div><div class="ass-papel">${esc(papel)}</div></div>`
  return `<div class="ass">
    <div class="ass-img">${a.imagem ? `<img src="${esc(a.imagem)}" alt="assinatura">` : ''}</div>
    <div class="ass-linha"></div>
    <div class="ass-nome">${esc(a.nome)}</div>
    <div class="ass-papel">${esc(a.papel)}</div>
    <div class="ass-prova">Assinado eletronicamente em ${esc(dataHora(a.em))}${a.ip ? `<br>IP ${esc(a.ip)}` : ''}${a.local ? ` · ${esc(a.local)}` : ''}</div>
    ${obs ? `<div class="ass-obs">“${esc(obs)}”</div>` : ''}
  </div>`
}

export function htmlAutorizacaoComissao(d: DocAutorizacao): string {
  const t = totaisDoc(d.linhas)
  const dif = t.total - t.calculado
  const autorizada = !!d.diretor
  const nome = nomeProprio(d.nomeRh || d.tecnico)
  const grupos = (['cliente', 'garantia', 'interna'] as GrupoOS[]).map((g) => ({ g, ls: d.linhas.filter((l) => l.grupo === g) })).filter((x) => x.ls.length)
  const tabela = grupos.map(({ g, ls }) => {
    const sub = ls.reduce((s, l) => s + l.valor, 0), subCalc = ls.reduce((s, l) => s + l.calculado, 0)
    return `<tbody>
      <tr class="grp"><td colspan="4">${ROT_GRUPO[g]}<span class="grp-n">${ls.length} ${ls.length === 1 ? 'ordem' : 'ordens'}</span></td><td class="v">${brl(subCalc)}</td><td class="v">${brl(sub)}</td></tr>
      ${ls.map((l) => {
        const dec = decisaoDaLinha(l, d.tecnico)
        return `<tr${dec ? ' class="mex"' : ''}><td class="os">${esc(l.numero)}</td><td class="dt">${dia(l.data)}</td><td class="cli">${esc(nomeProprio(l.cliente || '—'))}<div class="sub">${esc(l.regra)}${textoDescontoCliente(l.descontoCliente) ? `<span class="dc">${esc(textoDescontoCliente(l.descontoCliente))}</span>` : ''}</div></td><td class="obs">${dec ? esc(dec) : ''}</td><td class="v cinza">${brl(l.calculado)}</td><td class="v">${brl(l.valor)}</td></tr>`
      }).join('')}
    </tbody>`
  }).join('')

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Autorização de comissão ${esc(d.codigo)} — ${esc(nome)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500&display=swap" rel="stylesheet">
<style>
@page { size: A4; margin: 16mm 16mm 18mm; @bottom-left { content: "Nova Tratores  ·  ${esc(d.codigo)}"; font: 8.5pt "IBM Plex Sans", Arial, sans-serif; color: #94a3b8 } @bottom-right { content: counter(page) " / " counter(pages); font: 8.5pt "IBM Plex Sans", Arial, sans-serif; color: #94a3b8 } }
* { box-sizing: border-box } html, body { margin: 0; padding: 0; background: #fff }
body { font: 10.8pt/1.45 "IBM Plex Sans", Arial, Helvetica, sans-serif; color: #111827; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-feature-settings: "tnum" 1 }
.folha { max-width: 180mm; margin: 0 auto; position: relative }
.cab { display: flex; justify-content: space-between; align-items: center; padding-bottom: 14px }
.cab img { height: 34px } .cab-dir { text-align: right; font-size: 9pt; color: #6b7280; line-height: 1.6; letter-spacing: .2px } .cab-dir b { display: block; font-weight: 500; font-size: 9.6pt; color: #111827; letter-spacing: 1.2px; text-transform: uppercase }
.faixa { height: 2px; background: #111827; margin-bottom: 22px; position: relative } .faixa::after { content: ''; position: absolute; left: 0; top: 0; width: 38mm; height: 2px; background: #c8102e }
.titulo { display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; margin-bottom: 18px }
.titulo h1 { margin: 0; font-size: 24pt; font-weight: 400; letter-spacing: -.4px; line-height: 1.1 }
.titulo p { margin: 6px 0 0; font-size: 10.8pt; color: #4b5563 } .titulo p span { white-space: nowrap } .titulo p span + span::before { content: '·'; margin: 0 7px; color: #9ca3af }
.st { font-size: 9.6pt; white-space: nowrap; padding-bottom: 3px } .st i { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 6px; vertical-align: 0 } .st.ok { color: #166534 } .st.ok i { background: #16a34a } .st.ag { color: #92400e } .st.ag i { background: #d97706 }
.res { margin-bottom: 26px !important; display: grid; grid-template-columns: 1fr 1fr 1.3fr; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; margin-bottom: 8px }
.res > div { padding: 11px 0 11px 14px } .res > div:first-child { padding-left: 0 } .res > div + div { border-left: 1px solid #e5e7eb }
.res small { display: block; font-size: 8.4pt; color: #6b7280; text-transform: uppercase; letter-spacing: .8px; margin-bottom: 4px }
.res b { font-weight: 400; font-size: 14.4pt } .res .tot b { font-size: 20.4pt; font-weight: 500 } .res .neg { color: #b91c1c } .res .pos { color: #047857 } .res em { display: block; font-style: normal; font-size: 9pt; color: #6b7280; margin-top: 2px }
.comp { font-size: 9.6pt; color: #4b5563; margin: 0 0 22px } .comp .sep { margin: 0 8px; color: #d1d5db } .comp .num { color: #111827 }
h2 { font-size: 9pt; font-weight: 500; text-transform: uppercase; letter-spacing: 1.2px; color: #111827; margin: 0 0 6px }
table { width: 100%; border-collapse: collapse; font-size: 10pt }
thead th { text-align: left; font-weight: 400; color: #6b7280; font-size: 8.4pt; text-transform: uppercase; letter-spacing: .6px; padding: 6px 6px 6px 0; border-bottom: 1px solid #111827 }
td { padding: 5px 6px 5px 0; border-bottom: 1px solid #f3f4f6; vertical-align: top }
th.v, td.v { text-align: right; white-space: nowrap; padding-right: 0; padding-left: 10px } td.cinza { color: #9ca3af }
td.os { white-space: nowrap; color: #374151 } td.dt { white-space: nowrap; color: #6b7280 } td.cli { width: 32% } td.regra { color: #6b7280; font-size: 9.1pt } td.obs { color: #92400e; font-size: 9.1pt; width: 22% }
tr.mex td.os { box-shadow: inset 2px 0 0 #d97706; padding-left: 6px }
tr.grp td { padding-top: 12px; font-weight: 500; border-bottom: 1px solid #e5e7eb; color: #111827 } tr.grp .grp-n { font-weight: 400; color: #9ca3af; font-size: 9pt; margin-left: 8px } tr.grp td.v { font-weight: 500 }
tr { break-inside: avoid }
tfoot td { border-top: 1px solid #111827; border-bottom: none; padding-top: 8px; font-size: 11.4pt; font-weight: 500 } tfoot td.v { font-size: 12.6pt }
td.cli .sub { font-size: 8.4pt; color: #6b7280; margin-top: 1px } td.cli .sub .dc { display: block; color: #b45309 }
.st { margin-bottom: 6px }
.desc { margin: 26px 0 0; max-width: 125mm; break-inside: avoid } .desc-t .onde { display: block; font-size: 8.4pt; color: #9ca3af } .desc-t { font-size: 10pt } .desc-t td { padding: 5px 0; border-bottom: 1px solid #f3f4f6 } .desc-t td.v { text-align: right; white-space: nowrap; padding-left: 16px }
.desc-t .neg { color: #b91c1c } .desc-t .pos { color: #047857 } .desc-t tr.ini td { color: #374151 } .desc-t tr.sub td { border-top: 1px solid #111827; font-weight: 500 } .desc-t tr.fim td { border-top: 1px solid #111827; border-bottom: none; font-weight: 500; font-size: 11pt }
.desc-nota { margin: 8px 0 0; font-size: 8.6pt; color: #92400e }
.decl { margin: 26px 0 0; font-size: 9.6pt; color: #4b5563; line-height: 1.6; max-width: 150mm }
.assinaturas { display: grid; grid-template-columns: 1fr 1fr; gap: 16mm; margin-top: 18px; break-inside: avoid }
.ass-img { height: 20mm; display: flex; align-items: flex-end; justify-content: flex-start } .ass-img img { max-height: 20mm; max-width: 68mm }
.vazia .ass-img span { color: #b45309; font-size: 9pt; letter-spacing: .3px }
.ass-linha { border-top: 1px solid #111827; margin-top: 2px } .ass-nome { font-size: 11.4pt; margin-top: 6px } .ass-papel { font-size: 9pt; color: #6b7280 }
.ass-prova { font-size: 8.4pt; color: #9ca3af; margin-top: 5px; line-height: 1.5 } .ass-obs { font-size: 9.6pt; color: #374151; margin-top: 4px }
.verif { margin-top: 22px; padding-top: 8px; border-top: 1px solid #f3f4f6; font-size: 8.2pt; color: #9ca3af }
.marca { position: fixed; top: 46%; left: 0; right: 0; text-align: center; transform: rotate(-22deg); font-size: 48pt; color: rgba(217,119,6,.08); letter-spacing: 6px; pointer-events: none }
</style></head><body><div class="folha">
${autorizada ? '' : '<div class="marca">AGUARDANDO AUTORIZAÇÃO</div>'}
<header class="cab">
  <img src="${esc(d.logo)}" alt="Nova Tratores">
  <div class="cab-dir"><b>Autorização de comissão</b>Nº ${esc(d.codigo)}<br>Emitido em ${esc(dataHora(d.emitidoEm))}</div>
</header>
<div class="faixa"></div>
<section class="titulo">
  <div><div class="st ${autorizada ? 'ok' : 'ag'}"><i></i>${autorizada ? 'Autorizada pelo diretor' : 'Aguardando autorização do diretor'}</div><h1>${esc(nome)}</h1>
  <p>${d.cargo ? `<span>${esc(nomeProprio(d.cargo))}</span>` : ''}<span>Competência ${esc(mesExtenso(d.mes))}</span>${d.pct != null ? `<span>${String(d.pct).replace('.', ',')}% sobre as horas</span>` : ''}${d.pagamentoPrevisto ? `<span>Pagamento previsto ${esc(d.pagamentoPrevisto.split('-').reverse().join('/'))}</span>` : ''}</p></div>
</section>
<section class="res">
  <div><small>Ordens de serviço</small><b>${t.n}</b><em>${t.mexidas ? `${t.mexidas} com decisão${t.naoPagas ? `, ${t.naoPagas} não paga${t.naoPagas > 1 ? 's' : ''}` : ''}` : 'todas pela regra'}</em></div>
  <div><small>Pela regra</small><b>${brl(t.calculado)}</b>${Math.abs(dif) > 0.005 ? `<em>${dif > 0 ? '+' : '−'} ${brl(Math.abs(dif))} nas decisões</em>` : ''}</div>
  <div class="tot"><small>Comissão</small><b>${brl(t.total)}</b></div>
</section>

<h2>Ordens de serviço</h2>
<table>
  <thead><tr><th>OS</th><th>Data</th><th>Cliente e regra</th><th>Decisão</th><th class="v">Pela regra</th><th class="v">A pagar</th></tr></thead>
  ${tabela}
  <tfoot><tr><td colspan="4">Total</td><td class="v">${brl(t.calculado)}</td><td class="v">${brl(t.total)}</td></tr></tfoot>
</table>

${(() => {
  const ds = d.descontos || []
  // parcelado: neste pagamento entra só a 1ª parcela
  const primeira = (x: { valor: number; parcelas?: number }) => Math.round((x.valor / Math.max(1, x.parcelas || 1)) * 100) / 100
  const totDs = ds.filter((x) => x.fonte !== 'caixinha').reduce((a, x) => a + primeira(x), 0)
  const pct = d.caixinhaPct ?? 1
  const cx = Math.round(t.total * pct) / 100
  return `<section class="desc">
  <h2>Descontos</h2>
  <table class="desc-t"><tbody>
    <tr class="ini"><td>Comissão das ordens de serviço</td><td class="v">${brl(t.total)}</td></tr>
    ${ds.map((x) => `<tr><td>${x.tipo === 'requisicao' && x.ref ? `Requisição #${esc(x.ref)} — ` : ''}${esc(x.descricao)}<span class="onde">${x.fonte === 'caixinha' ? 'pago pela caixinha dos técnicos — não sai da comissão' : (x.parcelas || 1) > 1 ? `desconto em folha em ${x.parcelas} parcelas de ${brl(primeira(x))}${x.inicio ? `, a partir de ${mesExtenso(x.inicio)}` : ''} (total ${brl(x.valor)})` : 'desconto em folha'}</span></td><td class="v neg">${x.fonte === 'caixinha' ? `(${brl(x.valor)})` : `− ${brl(primeira(x))}`}</td></tr>`).join('')}
    ${pct > 0 ? `<tr><td>Caixinha ${String(pct).replace('.', ',')}%<span class="onde">retida no pagamento da comissão</span></td><td class="v neg">− ${brl(cx)}</td></tr>` : ''}
    <tr class="fim"><td>Líquido para o técnico</td><td class="v">${brl(t.total - totDs - cx)}</td></tr>
  </tbody></table>
</section>`
})()}
<p class="decl">Declaro que conferi as ordens de serviço acima e que os valores, as divisões e os motivos das ordens não pagas ou ajustadas estão corretos. Depois de autorizada pelo diretor, esta comissão é lançada no RH da Nova Tratores para pagamento.</p>
<section class="assinaturas">
  ${blocoAssinatura(d.solicitante, d.solicitante.papel)}
  ${blocoAssinatura(d.diretor, d.diretor?.papel || 'Diretor', d.diretor?.observacao)}
</section>
<div class="verif">Documento gerado pelo Portal Nova Tratores. As assinaturas foram feitas na tela do portal, com data, hora e endereço de rede registrados. Código ${esc(d.codigo)}.</div>
</div></body></html>`
}
