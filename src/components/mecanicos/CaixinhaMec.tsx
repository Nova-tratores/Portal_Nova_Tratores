'use client'
// Caixinha dos técnicos na Janela Mecânicos (José, 27/10/2026): saldo, o que entrou e saiu, o extrato e como funciona.
// Fechada num resumo; o extrato e o "como funciona" abrem numa janela (José, 27/10/2026: "deixa a caixinha mais fechada, faz um modal").
// Só leitura — quem lança é o RH. Dados: GET /api/mecanicos/caixinha (lib/mecanicos/caixinha-server.ts).
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { authHeaders } from '@/lib/auth/client'
import { brl2 } from './ui'

interface Mov { tipo: 'contribuicao' | 'aporte' | 'desconto' | 'redistribuicao'; valor: number; descricao: string | null; funcionario: string | null; em: string }
interface Dados {
  disponivel: boolean; erro?: string
  ciclo?: { inicio: string; fim: string; status: string; vencido: boolean }
  saldo: number; entrou: number; aporte: number; saiu: number; redistribuido: number; contribuintes: number
  porTecnico: { nome: string; entrou: number; saiu: number }[]
  extrato: Mov[]
}

const TIPO: Record<Mov['tipo'], { rot: string; cor: string; sinal: 1 | -1 }> = {
  contribuicao: { rot: '1% da comissão', cor: '#047857', sinal: 1 },
  aporte: { rot: 'a empresa dobrou', cor: '#1d4ed8', sinal: 1 },
  desconto: { rot: 'desconto pago pela caixinha', cor: '#b91c1c', sinal: -1 },
  redistribuicao: { rot: 'dividido na equipe', cor: '#7c3aed', sinal: -1 },
}
const nomeCurto = (n: string | null) => (n ? n.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).split(' ').slice(0, 2).join(' ') : '—')
const dia = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit' })

/** `icone`: só o ícone nos atalhos do Centro, ao lado do Tribunal (José, 28/10/2026: "a caixinha vira um ícone lá"). */
export default function CaixinhaMec({ icone }: { icone?: boolean } = {}) {
  const [d, setD] = useState<Dados | null>(null)
  const [filtro, setFiltro] = useState<'tudo' | 'entrou' | 'saiu'>('tudo')
  const [verTudo, setVerTudo] = useState(false)
  const [comoFunciona, setComoFunciona] = useState(false)
  const [aberta, setAberta] = useState(false)
  useEffect(() => {
    if (!aberta) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberta(false) }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [aberta])
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const r = await fetch('/api/mecanicos/caixinha', { headers: await authHeaders(), cache: 'no-store' })
        const j = await r.json().catch(() => ({}))
        if (vivo) setD(r.ok ? j : { disponivel: false, erro: j.error || `Erro ${r.status}`, saldo: 0, entrou: 0, aporte: 0, saiu: 0, redistribuido: 0, contribuintes: 0, porTecnico: [], extrato: [] })
      } catch { if (vivo) setD({ disponivel: false, erro: 'Sem conexão com o portal.', saldo: 0, entrou: 0, aporte: 0, saiu: 0, redistribuido: 0, contribuintes: 0, porTecnico: [], extrato: [] }) }
    })()
    return () => { vivo = false }
  }, [])

  if (icone && (!d || !d.ciclo)) return (
    <button type="button" className="mi-b" style={{ '--c': '#047857' } as React.CSSProperties} aria-label="Caixinha" disabled={!d}>
      <i className="fas fa-piggy-bank" />
      <span className="mi-dica" role="tooltip"><b>Caixinha</b><small>{!d ? 'lendo no RH…' : d.erro || 'indisponível'}</small></span>
    </button>
  )
  if (!d) return <div className="cx-resumo"><style>{ESTILO}</style><div className="cx-carr"><i className="fas fa-circle-notch fa-spin" /> lendo a caixinha no RH…</div></div>
  if (!d.ciclo) return <div className="cx-resumo"><style>{ESTILO}</style><div className="cx-carr">{d.erro || 'Caixinha indisponível.'}</div></div>

  // saldo da caixinha depois de cada movimentação (o extrato vem do mais novo para o mais velho)
  const saldoDepois = new Map<Mov, number>()
  d.extrato.slice().reverse().reduce((s, m) => { const n = s + TIPO[m.tipo].sinal * m.valor; saldoDepois.set(m, n); return n }, 0)
  const totEntrou = d.entrou + d.aporte, totSaiu = d.saiu + d.redistribuido
  const maxFluxo = Math.max(totEntrou, totSaiu, 0.01)
  const maxTec = Math.max(...d.porTecnico.map((t) => Math.max(t.entrou, t.saiu)), 0.01)
  const extrato = d.extrato.filter((m) => filtro === 'tudo' || (filtro === 'entrou' ? TIPO[m.tipo].sinal > 0 : TIPO[m.tipo].sinal < 0))
  const mostrar = verTudo ? extrato : extrato.slice(0, 8)
  const vencido = d.ciclo.vencido && d.ciclo.status === 'aberto'
  return (
    <>
    <style>{ESTILO}</style>
    {icone ? (
    <button type="button" className={`mi-b ${aberta ? 'on' : ''}`} style={{ '--c': '#047857' } as React.CSSProperties} onClick={() => setAberta(true)} aria-label={`Caixinha: saldo ${brl2(d.saldo)}`}>
      <i className="fas fa-piggy-bank" />
      {vencido && <em>!</em>}
      <span className="mi-dica" role="tooltip"><b>Caixinha · {brl2(d.saldo)}</b><small>{vencido ? 'ciclo vencido, falta redistribuir' : `ciclo ${d.ciclo.inicio} a ${d.ciclo.fim}`}</small></span>
    </button>
    ) : (
    <button type="button" className="cx-resumo" onClick={() => setAberta(true)}>
      <span className="cx-ic"><i className="fas fa-piggy-bank" /></span>
      <span className="cx-r-t"><small>Saldo da caixinha</small><b>{brl2(d.saldo)}</b></span>
      <span className="cx-r-m">ciclo {d.ciclo.inicio} a {d.ciclo.fim} · {d.contribuintes} técnicos</span>
      {vencido && <span className="cx-r-al"><i className="fas fa-triangle-exclamation" /> ciclo vencido, falta redistribuir</span>}
      <span className="cx-r-ver">Ver extrato e como funciona <i className="fas fa-arrow-right" /></span>
    </button>
    )}
    {aberta && createPortal(
    <div className="cx-fundo" onClick={() => setAberta(false)}>
    <div className="cx" role="dialog" aria-modal="true" aria-label="Caixinha dos técnicos" onClick={(e) => e.stopPropagation()}>
      <style>{ESTILO}</style>
      <div className="cx-cab"><b><i className="fas fa-piggy-bank" /> Caixinha dos técnicos</b><button type="button" aria-label="Fechar" onClick={() => setAberta(false)}><i className="fas fa-xmark" /></button></div>
      {/* o caminho do dinheiro, sempre à vista (José, 29/10/2026: "isso tem que ficar claro para a gente") */}
      <ol className="cx-cam">
        <li style={{ '--c': '#047857' } as React.CSSProperties}>
          <span className="ic"><i className="fas fa-file-signature" /></span>
          <b>Comissão aprovada</b>
          <small>No RH (&quot;submeter&quot;) ou com a assinatura do diretor no portal: <strong>1%</strong> vai para a caixinha.</small>
          <em>ex.: comissão de R$ 2.000 → R$ 20 na caixinha</em>
        </li>
        <li style={{ '--c': '#1d4ed8' } as React.CSSProperties}>
          <span className="ic"><i className="fas fa-building-columns" /></span>
          <b>Omie paga 99%</b>
          <small>O RH lança a comissão no Omie já sem o 1% (a observação mostra &quot;1% caixinha do problema&quot;).</small>
          <em>ex.: R$ 1.980 para o técnico</em>
        </li>
        <li style={{ '--c': '#b91c1c' } as React.CSSProperties}>
          <span className="ic"><i className="fas fa-screwdriver-wrench" /></span>
          <b>Erro pago pela caixinha</b>
          <small>O RH pode pagar um desconto de erro pela caixinha: sai do bolo de todos, não do salário de quem errou.</small>
          <em>{d.saiu ? `neste ciclo: ${brl2(d.saiu)} pagos` : 'neste ciclo: nenhum'}</em>
        </li>
        <li style={{ '--c': '#7c3aed' } as React.CSSProperties}>
          <span className="ic"><i className="fas fa-people-arrows" /></span>
          <b>Fim do ciclo: empresa dobra</b>
          <small>A cada 3 meses a empresa põe o mesmo valor do saldo e o total é dividido igual entre quem contribuiu (vira bônus na comissão).</small>
          <em>{d.contribuintes ? `hoje: ${brl2(d.saldo)} × 2 ÷ ${d.contribuintes} = ${brl2((d.saldo * 2) / d.contribuintes)} cada` : '—'}</em>
        </li>
      </ol>
      <div className="cx-topo">
        <div className="cx-saldo">
          <small>Saldo da caixinha</small>
          <b>{brl2(d.saldo)}</b>
          <span>ciclo {d.ciclo.inicio} a {d.ciclo.fim} · {d.contribuintes} técnico{d.contribuintes === 1 ? '' : 's'} contribuindo</span>
          {d.ciclo.vencido && d.ciclo.status === 'aberto' && <em className="cx-alerta"><i className="fas fa-triangle-exclamation" /> o ciclo terminou em {d.ciclo.fim} e ainda não foi redistribuído — o RH redistribui em Caixinha</em>}
          {!d.ciclo.vencido && <em className="cx-info">no fim do ciclo a empresa dobra: {d.contribuintes ? `${brl2(d.saldo * 2)} ÷ ${d.contribuintes} = ${brl2((d.saldo * 2) / d.contribuintes)} para cada um hoje` : '—'}</em>}
        </div>
        {/* a conta do ciclo em barras: entrou − saiu = sobrou */}
        <div className="cx-fluxo">
          <div className="e"><span><i className="fas fa-arrow-down" /> Entrou</span><em><i style={{ width: `${(totEntrou / maxFluxo) * 100}%` }} /></em><b>+{brl2(totEntrou)}</b><small>1% das comissões{d.aporte ? ` + ${brl2(d.aporte)} da empresa` : ''}</small></div>
          <div className="s"><span><i className="fas fa-arrow-up" /> Saiu</span><em><i style={{ width: `${(totSaiu / maxFluxo) * 100}%` }} /></em><b>−{brl2(totSaiu)}</b><small>descontos pagos{d.redistribuido ? ` + ${brl2(d.redistribuido)} dividido` : ''}</small></div>
          <div className="r"><span>= Sobrou</span><em><i style={{ width: `${(Math.max(d.saldo, 0) / maxFluxo) * 100}%` }} /></em><b>{brl2(d.saldo)}</b><small>é o saldo de hoje</small></div>
        </div>
      </div>

      {d.porTecnico.length > 0 && (
        <div className="cx-tab">
          <div className="cx-tab-cab"><span>Técnico</span><span>Pôs na caixinha</span><span>A caixinha pagou por ele</span></div>
          {d.porTecnico.map((t) => (
            <div key={t.nome} className="cx-tab-l">
              <b>{nomeCurto(t.nome)}</b>
              <span className="e"><em><i style={{ width: `${(t.entrou / maxTec) * 100}%` }} /></em>+{brl2(t.entrou)}</span>
              <span className="s">{t.saiu > 0 ? <><em><i style={{ width: `${(t.saiu / maxTec) * 100}%` }} /></em>−{brl2(t.saiu)}</> : <small>nada</small>}</span>
            </div>
          ))}
        </div>
      )}

      <div className="cx-ext">
        <div className="cx-ext-cab">
          <b>Extrato do ciclo</b>
          <div className="cx-fil">
            {(['tudo', 'entrou', 'saiu'] as const).map((f) => <button key={f} type="button" className={filtro === f ? 'on' : ''} onClick={() => setFiltro(f)}>{f === 'tudo' ? 'Tudo' : f === 'entrou' ? 'Entradas' : 'Saídas'}</button>)}
          </div>
        </div>
        {mostrar.map((m, i) => {
          const t = TIPO[m.tipo]
          return (
            <div key={i} className={`cx-l ${t.sinal > 0 ? 'e' : 's'}`}>
              <span className="cx-seta" style={{ color: t.cor, background: `color-mix(in srgb, ${t.cor} 12%, transparent)` }}><i className={`fas fa-arrow-${t.sinal > 0 ? 'down' : 'up'}`} /></span>
              <span className="cx-t"><b>{nomeCurto(m.funcionario)}</b><small>{dia(m.em)} · {m.tipo === 'contribuicao' ? (m.descricao || t.rot) : m.descricao ? `${t.rot}: ${m.descricao.replace(/^Desconto pago pela caixinha:\s*/i, '')}` : t.rot}</small></span>
              <span className="cx-v"><b style={{ color: t.cor }}>{t.sinal > 0 ? '+' : '−'}{brl2(m.valor)}</b><small>saldo {brl2(saldoDepois.get(m) ?? 0)}</small></span>
            </div>
          )
        })}
        {!extrato.length && <p className="cx-vazio">Nada neste filtro.</p>}
        {extrato.length > 8 && <button type="button" className="cx-mais" onClick={() => setVerTudo((v) => !v)}>{verTudo ? 'mostrar menos' : `ver as ${extrato.length} movimentações`}</button>}
      </div>

      <button type="button" className="cx-como-t" onClick={() => setComoFunciona((v) => !v)}><i className={`fas fa-chevron-${comoFunciona ? 'up' : 'down'}`} /> Como a caixinha funciona</button>
      {comoFunciona && (
        <ol className="cx-como">
          <li><b>Quem participa:</b> os técnicos. Cada comissão de técnico aprovada (no RH ou assinada pelo diretor no portal) põe <b>1%</b> na caixinha. No RH a comissão fica com o valor cheio; quando o RH lança no Omie, lança <b>99%</b>.</li>
          <li><b>Para que serve:</b> pagar descontos de erro (ex.: alimentação lançada errado, pequenos prejuízos) sem tirar do salário de quem errou. O RH decide quando um desconto sai da caixinha.</li>
          <li><b>Ciclo de 3 meses:</b> no fim, a <b>empresa dobra</b> o que sobrou e o total é <b>dividido igual</b> entre todos que contribuíram no ciclo (vira um bônus na comissão). Depois começa um ciclo novo.</li>
          <li><b>Quanto menos erro, mais sobra:</b> todo desconto pago sai do bolo de todos — a caixinha cheia é dinheiro de volta para a equipe.</li>
          <li>Esta tela só mostra. Quem lança desconto e redistribui é o RH (sistema do RH → Caixinha).</li>
        </ol>
      )}
    </div>
    </div>, document.body)}
    </>
  )
}

const ESTILO = `
.cx-resumo { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 8px 18px; justify-self: start; width: auto; max-width: 100%; text-align: left; font: inherit; color: #0f172a; background: #fefefe; border: 1px solid #e2e8f0; border-radius: 16px; padding: 12px 16px; cursor: pointer; transition: border-color .2s }
.cx-resumo:hover { border-color: #10b981 } .cx-resumo:hover .cx-r-ver i { transform: translateX(3px) }
.cx-ic { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px; background: #ecfdf5; color: #047857; font-size: 18px }
.cx-r-t { display: grid; line-height: 1.15 } .cx-r-t small { font-size: 13px; color: #334155 } .cx-r-t b { font-size: 22px; font-weight: 500 }
.cx-r-m { font-size: 13.5px; color: #334155 } .cx-r-al { font-size: 12.5px; color: #92400e; background: #fef3c7; border-radius: 99px; padding: 3px 10px }
.cx-r-ver { font-size: 13.5px; font-weight: 500; color: #1d4ed8; display: inline-flex; gap: 6px; align-items: center } .cx-r-ver i { transition: transform .2s }
.cx-fundo { position: fixed; inset: 0; z-index: 9500; background: rgba(15,23,42,.45); display: grid; place-items: center; padding: 16px }
.cx-cab { display: flex; justify-content: space-between; align-items: center } .cx-cab b { font-size: 17px; font-weight: 500 } .cx-cab b i { color: #047857; margin-right: 6px } .cx-cab button { border: 0; background: #f1f5f9; border-radius: 10px; width: 34px; height: 34px; cursor: pointer; color: #475569 }
.cx { display: grid; gap: 14px; background: #fefefe; border-radius: 18px; padding: 18px 20px; color: #0f172a; width: min(760px, 100%); max-height: calc(100vh - 32px); overflow: auto }
.cx-carr { padding: 18px; text-align: center; color: #64748b; font-size: 14px }
.cx-cam { list-style: none; margin: 0 0 14px; padding: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; counter-reset: cam }
@media (max-width: 760px) { .cx-cam { grid-template-columns: 1fr 1fr } }
.cx-cam li { position: relative; display: grid; gap: 4px; align-content: start; background: color-mix(in srgb, var(--c) 6%, #fefefe); border: 1px solid color-mix(in srgb, var(--c) 22%, #e2e8f0); border-radius: 14px; padding: 12px; counter-increment: cam }
.cx-cam li::before { content: counter(cam); position: absolute; top: 10px; right: 12px; font-size: 12px; font-weight: 600; color: var(--c); opacity: .7 }
.cx-cam li:not(:last-child)::after { content: '→'; position: absolute; right: -11px; top: 22px; z-index: 1; width: 16px; height: 16px; display: grid; place-items: center; font-size: 12px; color: #94a3b8; background: #fefefe; border-radius: 50% }
@media (max-width: 760px) { .cx-cam li::after { display: none } }
.cx-cam .ic { width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; background: color-mix(in srgb, var(--c) 14%, #fefefe); color: var(--c); font-size: 13px }
.cx-cam b { font-size: 14px; font-weight: 500; color: #0f172a } .cx-cam small { font-size: 12.5px; color: #475569; line-height: 1.45 } .cx-cam strong { font-weight: 600; color: var(--c) }
.cx-cam em { font-style: normal; font-size: 12px; color: var(--c); font-weight: 500; margin-top: 2px }
.cx-topo { display: flex; gap: 18px; flex-wrap: wrap; align-items: stretch }
.cx-saldo { flex: 1; min-width: 260px; display: grid; gap: 3px } .cx-saldo small { font-size: 13px; color: #475569 } .cx-saldo b { font-size: 34px; font-weight: 500; line-height: 1.1 } .cx-saldo > span { font-size: 13px; color: #475569 }
.cx-alerta, .cx-info { font-style: normal; font-size: 12.5px; border-radius: 10px; padding: 6px 10px; margin-top: 4px; justify-self: start } .cx-alerta { color: #92400e; background: #fef3c7 } .cx-info { color: #1e3a8a; background: #eff6ff }
.cx-fluxo { flex: 1.2; min-width: 300px; display: grid; gap: 8px; border: 1px solid #e2e8f0; border-radius: 14px; padding: 12px 14px }
.cx-fluxo > div { display: grid; grid-template-columns: 82px minmax(0, 1fr) auto; column-gap: 10px; align-items: center }
.cx-fluxo span { font-size: 13px; color: #334155 } .cx-fluxo span i { font-size: 11px; margin-right: 3px }
.cx-fluxo em { height: 10px; border-radius: 99px; background: #f1f5f9; overflow: hidden } .cx-fluxo em i { display: block; height: 100%; border-radius: 99px; transition: width .5s ease }
.cx-fluxo b { font-size: 16px; font-weight: 500; text-align: right; font-variant-numeric: tabular-nums } .cx-fluxo small { grid-column: 2 / -1; font-size: 11.5px; color: #64748b; margin-top: -2px }
.cx-fluxo .e span, .cx-fluxo .e b { color: #047857 } .cx-fluxo .e em i { background: #10b981 }
.cx-fluxo .s span, .cx-fluxo .s b { color: #b91c1c } .cx-fluxo .s em i { background: #ef4444 }
.cx-fluxo .r { border-top: 1px dashed #cbd5e1; padding-top: 8px } .cx-fluxo .r span, .cx-fluxo .r b { color: #0f172a; font-weight: 600 } .cx-fluxo .r em i { background: #334155 }
.cx-tab { display: grid; border: 1px solid #eef2f6; border-radius: 12px; overflow: hidden }
.cx-tab-cab, .cx-tab-l { display: grid; grid-template-columns: minmax(130px, 1fr) minmax(0, 1.2fr) minmax(0, 1.2fr); gap: 12px; align-items: center; padding: 7px 12px }
.cx-tab-cab { background: #f8fafc; font-size: 12px; color: #64748b } .cx-tab-l { border-top: 1px solid #f1f5f9; font-size: 13.5px } .cx-tab-l > b { font-weight: 500 }
.cx-tab-l > span { display: grid; grid-template-columns: minmax(0, 1fr) 82px; gap: 8px; align-items: center; text-align: right; font-variant-numeric: tabular-nums }
.cx-tab-l em { height: 8px; border-radius: 99px; background: #f1f5f9; overflow: hidden } .cx-tab-l em i { display: block; height: 100%; border-radius: 99px }
.cx-tab-l .e { color: #047857 } .cx-tab-l .e em i { background: #10b981 } .cx-tab-l .s { color: #b91c1c } .cx-tab-l .s em i { background: #ef4444 }
.cx-tab-l .s small { grid-column: 1 / -1; color: #94a3b8; font-size: 12.5px }
.cx-ext { display: grid; gap: 2px } .cx-ext-cab { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 4px } .cx-ext-cab b { font-size: 15px; font-weight: 500 }
.cx-fil { display: inline-flex; gap: 2px; background: #eef2f6; border-radius: 10px; padding: 3px } .cx-fil button { border: 0; background: transparent; border-radius: 8px; padding: 4px 11px; font: inherit; font-size: 12.5px; color: #475569; cursor: pointer } .cx-fil button.on { background: #fefefe; color: #0f172a; box-shadow: 0 1px 2px rgba(15,23,42,.1) }
.cx-l { display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 8px 4px; border-top: 1px solid #f1f5f9; font-size: 13.5px }
.cx-seta { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; font-size: 13px }
.cx-t { display: grid; gap: 1px; min-width: 0 } .cx-t b { font-weight: 500 } .cx-t small { font-size: 12.5px; color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.cx-v { display: grid; justify-items: end; gap: 1px; font-variant-numeric: tabular-nums } .cx-v b { font-weight: 600; font-size: 14.5px } .cx-v small { font-size: 11.5px; color: #94a3b8 }
.cx-vazio { color: #64748b; font-size: 13px; padding: 8px 4px } .cx-mais, .cx-como-t { justify-self: start; border: 0; background: transparent; color: #2563eb; font: inherit; font-size: 13px; cursor: pointer; padding: 4px } .cx-mais:hover, .cx-como-t:hover { text-decoration: underline }
.cx-como { margin: 0; padding: 12px 16px 12px 34px; border-radius: 12px; background: #f8fafc; display: grid; gap: 8px; font-size: 13.5px; color: #334155; line-height: 1.5 } .cx-como b { font-weight: 600 }
`
