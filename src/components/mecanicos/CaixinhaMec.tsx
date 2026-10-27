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
  contribuicao: { rot: 'Entrou · 1% da comissão', cor: '#047857', sinal: 1 },
  aporte: { rot: 'Entrou · a empresa dobrou', cor: '#1d4ed8', sinal: 1 },
  desconto: { rot: 'Saiu · desconto pago', cor: '#b91c1c', sinal: -1 },
  redistribuicao: { rot: 'Saiu · dividido na equipe', cor: '#7c3aed', sinal: -1 },
}
const nomeCurto = (n: string | null) => (n ? n.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).split(' ').slice(0, 2).join(' ') : '—')
const dia = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit' })

export default function CaixinhaMec() {
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

  if (!d) return <div className="cx-resumo"><style>{ESTILO}</style><div className="cx-carr"><i className="fas fa-circle-notch fa-spin" /> lendo a caixinha no RH…</div></div>
  if (!d.ciclo) return <div className="cx-resumo"><style>{ESTILO}</style><div className="cx-carr">{d.erro || 'Caixinha indisponível.'}</div></div>

  const extrato = d.extrato.filter((m) => filtro === 'tudo' || (filtro === 'entrou' ? TIPO[m.tipo].sinal > 0 : TIPO[m.tipo].sinal < 0))
  const mostrar = verTudo ? extrato : extrato.slice(0, 8)
  const vencido = d.ciclo.vencido && d.ciclo.status === 'aberto'
  return (
    <>
    <style>{ESTILO}</style>
    <button type="button" className="cx-resumo" onClick={() => setAberta(true)}>
      <span className="cx-ic"><i className="fas fa-piggy-bank" /></span>
      <span className="cx-r-t"><small>Saldo da caixinha</small><b>{brl2(d.saldo)}</b></span>
      <span className="cx-r-m">ciclo {d.ciclo.inicio} a {d.ciclo.fim} · {d.contribuintes} técnicos</span>
      {vencido && <span className="cx-r-al"><i className="fas fa-triangle-exclamation" /> ciclo vencido, falta redistribuir</span>}
      <span className="cx-r-ver">Ver extrato e como funciona <i className="fas fa-arrow-right" /></span>
    </button>
    {aberta && createPortal(
    <div className="cx-fundo" onClick={() => setAberta(false)}>
    <div className="cx" role="dialog" aria-modal="true" aria-label="Caixinha dos técnicos" onClick={(e) => e.stopPropagation()}>
      <style>{ESTILO}</style>
      <div className="cx-cab"><b><i className="fas fa-piggy-bank" /> Caixinha dos técnicos</b><button type="button" aria-label="Fechar" onClick={() => setAberta(false)}><i className="fas fa-xmark" /></button></div>
      <div className="cx-topo">
        <div className="cx-saldo">
          <small>Saldo da caixinha</small>
          <b>{brl2(d.saldo)}</b>
          <span>ciclo {d.ciclo.inicio} a {d.ciclo.fim} · {d.contribuintes} técnico{d.contribuintes === 1 ? '' : 's'} contribuindo</span>
          {d.ciclo.vencido && d.ciclo.status === 'aberto' && <em className="cx-alerta"><i className="fas fa-triangle-exclamation" /> o ciclo terminou em {d.ciclo.fim} e ainda não foi redistribuído — o RH redistribui em Caixinha</em>}
          {!d.ciclo.vencido && <em className="cx-info">no fim do ciclo a empresa dobra: {d.contribuintes ? `${brl2(d.saldo * 2)} ÷ ${d.contribuintes} = ${brl2((d.saldo * 2) / d.contribuintes)} para cada um hoje` : '—'}</em>}
        </div>
        <div className="cx-nums">
          <div className="e"><small>Entrou</small><b>{brl2(d.entrou + d.aporte)}</b><span>1% das comissões{d.aporte ? ` + ${brl2(d.aporte)} da empresa` : ''}</span></div>
          <div className="s"><small>Saiu</small><b>{brl2(d.saiu + d.redistribuido)}</b><span>descontos pagos{d.redistribuido ? ` + ${brl2(d.redistribuido)} dividido` : ''}</span></div>
        </div>
      </div>

      {d.porTecnico.length > 0 && (
        <div className="cx-tecs">
          {d.porTecnico.map((t) => (
            <div key={t.nome} title={`${nomeCurto(t.nome)}: pôs ${brl2(t.entrou)} · a caixinha pagou ${brl2(t.saiu)} de desconto dele`}>
              <b>{nomeCurto(t.nome)}</b>
              <span className="e">+{brl2(t.entrou)}</span>
              {t.saiu > 0 && <span className="s">−{brl2(t.saiu)}</span>}
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
            <div key={i} className="cx-l">
              <span className="cx-d">{dia(m.em)}</span>
              <span className="cx-t"><em style={{ color: t.cor, background: `color-mix(in srgb, ${t.cor} 10%, transparent)` }}>{t.rot}</em><small>{nomeCurto(m.funcionario)}{m.descricao ? ` · ${m.descricao.replace(/^Desconto pago pela caixinha:\s*/i, '')}` : ''}</small></span>
              <b style={{ color: t.cor }}>{t.sinal > 0 ? '+' : '−'}{brl2(m.valor)}</b>
            </div>
          )
        })}
        {!extrato.length && <p className="cx-vazio">Nada neste filtro.</p>}
        {extrato.length > 8 && <button type="button" className="cx-mais" onClick={() => setVerTudo((v) => !v)}>{verTudo ? 'mostrar menos' : `ver as ${extrato.length} movimentações`}</button>}
      </div>

      <button type="button" className="cx-como-t" onClick={() => setComoFunciona((v) => !v)}><i className={`fas fa-chevron-${comoFunciona ? 'up' : 'down'}`} /> Como a caixinha funciona</button>
      {comoFunciona && (
        <ol className="cx-como">
          <li><b>Quem participa:</b> os técnicos. Cada comissão de técnico aprovada no RH põe <b>1%</b> na caixinha — o técnico recebe 99% da comissão.</li>
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
.cx-resumo { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; width: 100%; text-align: left; font: inherit; color: #0f172a; background: #fefefe; border: 1px solid #e2e8f0; border-radius: 16px; padding: 12px 16px; cursor: pointer; transition: border-color .2s }
.cx-resumo:hover { border-color: #10b981 } .cx-resumo:hover .cx-r-ver i { transform: translateX(3px) }
.cx-ic { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px; background: #ecfdf5; color: #047857; font-size: 18px }
.cx-r-t { display: grid; line-height: 1.15 } .cx-r-t small { font-size: 12.5px; color: #475569 } .cx-r-t b { font-size: 22px; font-weight: 500 }
.cx-r-m { font-size: 13px; color: #64748b } .cx-r-al { font-size: 12.5px; color: #92400e; background: #fef3c7; border-radius: 99px; padding: 3px 10px }
.cx-r-ver { margin-left: auto; font-size: 13px; color: #2563eb; display: inline-flex; gap: 6px; align-items: center } .cx-r-ver i { transition: transform .2s }
.cx-fundo { position: fixed; inset: 0; z-index: 9500; background: rgba(15,23,42,.45); display: grid; place-items: center; padding: 16px }
.cx-cab { display: flex; justify-content: space-between; align-items: center } .cx-cab b { font-size: 17px; font-weight: 500 } .cx-cab b i { color: #047857; margin-right: 6px } .cx-cab button { border: 0; background: #f1f5f9; border-radius: 10px; width: 34px; height: 34px; cursor: pointer; color: #475569 }
.cx { display: grid; gap: 14px; background: #fefefe; border-radius: 18px; padding: 18px 20px; color: #0f172a; width: min(760px, 100%); max-height: calc(100vh - 32px); overflow: auto }
.cx-carr { padding: 18px; text-align: center; color: #64748b; font-size: 14px }
.cx-topo { display: flex; gap: 18px; flex-wrap: wrap; align-items: stretch }
.cx-saldo { flex: 1; min-width: 260px; display: grid; gap: 3px } .cx-saldo small { font-size: 13px; color: #475569 } .cx-saldo b { font-size: 34px; font-weight: 500; line-height: 1.1 } .cx-saldo > span { font-size: 13px; color: #475569 }
.cx-alerta, .cx-info { font-style: normal; font-size: 12.5px; border-radius: 10px; padding: 6px 10px; margin-top: 4px; justify-self: start } .cx-alerta { color: #92400e; background: #fef3c7 } .cx-info { color: #1e3a8a; background: #eff6ff }
.cx-nums { display: flex; gap: 10px; flex-wrap: wrap } .cx-nums > div { display: grid; gap: 2px; min-width: 170px; border-radius: 12px; padding: 10px 14px; border: 1px solid #e2e8f0 }
.cx-nums small { font-size: 12.5px; color: #475569 } .cx-nums b { font-size: 20px; font-weight: 500 } .cx-nums span { font-size: 12px; color: #64748b }
.cx-nums .e b { color: #047857 } .cx-nums .s b { color: #b91c1c }
.cx-tecs { display: flex; gap: 8px; flex-wrap: wrap } .cx-tecs > div { display: inline-flex; gap: 8px; align-items: baseline; border-radius: 99px; background: #f8fafc; border: 1px solid #eef2f6; padding: 5px 12px; font-size: 13px }
.cx-tecs b { font-weight: 500 } .cx-tecs .e { color: #047857 } .cx-tecs .s { color: #b91c1c }
.cx-ext { display: grid; gap: 2px } .cx-ext-cab { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 4px } .cx-ext-cab b { font-size: 15px; font-weight: 500 }
.cx-fil { display: inline-flex; gap: 2px; background: #eef2f6; border-radius: 10px; padding: 3px } .cx-fil button { border: 0; background: transparent; border-radius: 8px; padding: 4px 11px; font: inherit; font-size: 12.5px; color: #475569; cursor: pointer } .cx-fil button.on { background: #fefefe; color: #0f172a; box-shadow: 0 1px 2px rgba(15,23,42,.1) }
.cx-l { display: grid; grid-template-columns: 70px minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 8px 4px; border-top: 1px solid #f1f5f9; font-size: 13.5px }
.cx-d { color: #64748b; font-size: 12.5px } .cx-t { display: grid; gap: 2px; min-width: 0 } .cx-t em { justify-self: start; font-style: normal; font-size: 12px; border-radius: 99px; padding: 1px 9px } .cx-t small { font-size: 12.5px; color: #475569; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.cx-l > b { font-weight: 500; font-variant-numeric: tabular-nums }
.cx-vazio { color: #64748b; font-size: 13px; padding: 8px 4px } .cx-mais, .cx-como-t { justify-self: start; border: 0; background: transparent; color: #2563eb; font: inherit; font-size: 13px; cursor: pointer; padding: 4px } .cx-mais:hover, .cx-como-t:hover { text-decoration: underline }
.cx-como { margin: 0; padding: 12px 16px 12px 34px; border-radius: 12px; background: #f8fafc; display: grid; gap: 8px; font-size: 13.5px; color: #334155; line-height: 1.5 } .cx-como b { font-weight: 600 }
`
