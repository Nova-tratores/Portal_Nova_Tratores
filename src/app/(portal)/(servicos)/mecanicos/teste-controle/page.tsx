'use client'
// Página de TESTE do controle de comissões (José, 04/11/2026: "antes da gente subir, precisamos fazer uma espécie de
// controle de comissão, para vermos se já foi enviada e de qual mês e tudo mais"). Dados reais (pedidos ao diretor +
// RH); nada aqui muda a tela de verdade. Três jeitos de mostrar para o José escolher.
import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { authHeaders } from '@/lib/auth/client'
import type { CelulaControle, EtapaControle, LinhaControle } from '@/lib/mecanicos/controle-comissoes-server'

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const curto = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1].slice(0, 3)}/${m.slice(2, 4)}`
const longo = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dia = (s: string | null) => s ? new Date(s).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }) : ''
const primeiroNome = (n: string) => n.split(' ').slice(0, 2).map((p) => p[0] + p.slice(1).toLowerCase()).join(' ')

const ETAPA: Record<EtapaControle, { txt: string; cor: string; fundo: string; ic: string }> = {
  paga: { txt: 'Paga', cor: '#047857', fundo: '#d1fae5', ic: 'fa-circle-check' },
  no_rh: { txt: 'No RH, a pagar', cor: '#1d4ed8', fundo: '#dbeafe', ic: 'fa-building-columns' },
  rh_falta_aprovar: { txt: 'No RH, falta aprovar', cor: '#a16207', fundo: '#fef3c7', ic: 'fa-hourglass-half' },
  rh_rascunho: { txt: 'Rascunho no RH', cor: '#a16207', fundo: '#fef3c7', ic: 'fa-file-pen' },
  com_diretor: { txt: 'Com o diretor', cor: '#7c3aed', fundo: '#ede9fe', ic: 'fa-signature' },
  devolvida: { txt: 'Devolvida p/ ajuste', cor: '#c2410c', fundo: '#ffedd5', ic: 'fa-rotate-left' },
  erro_rh: { txt: 'Erro ao lançar no RH', cor: '#b91c1c', fundo: '#fee2e2', ic: 'fa-triangle-exclamation' },
  nao_enviada: { txt: 'Não enviada', cor: '#b91c1c', fundo: '#fee2e2', ic: 'fa-circle-xmark' },
  em_andamento: { txt: 'Mês em andamento', cor: '#64748b', fundo: '#f1f5f9', ic: 'fa-clock' },
}
type Dados = { meses: string[]; linhas: LinhaControle[]; semRH: boolean }

function Pilula({ c, mini }: { c: CelulaControle; mini?: boolean }) {
  const e = ETAPA[c.etapa]
  return <span className="tc-pil" style={{ color: e.cor, background: e.fundo }}><i className={`fas ${e.ic}`} />{!mini && ` ${e.txt}`}</span>
}

/** A trilha do mês de uma pessoa: Enviada → Autorizada → No RH → Paga. */
function Trilha({ c }: { c: CelulaControle }) {
  const p = c.pedido, r = c.rh
  const passos: [string, boolean, string][] = [
    ['Enviada ao diretor', !!p || c.diretoNoRH, p ? `${dia(p.em)}${p.por ? ` · ${p.por.split(' ')[0]}` : ''}` : c.diretoNoRH ? 'direto no RH' : ''],
    ['Autorizada', p?.status === 'espelhada' || (c.diretoNoRH && r?.status !== 'rascunho' && r?.status !== 'pendente_aprovacao'), p?.decididoPor ? `${dia(p.decididoEm)} · ${p.decididoPor.split(' ')[0]}` : c.diretoNoRH && r?.aprovadoEm ? dia(r.aprovadoEm) : ''],
    ['No RH', !!r, r ? r.status.replace('_', ' ') : ''],
    ['Paga', r?.status === 'paga', r?.pagoEm ? dia(r.pagoEm) : ''],
  ]
  return (
    <div className="tc-trilha">
      {passos.map(([t, ok, sub], i) => <div key={t} className={ok ? 'ok' : ''}><span className="tc-bola">{ok ? <i className="fas fa-check" /> : i + 1}</span><b>{t}</b><small>{sub || '—'}</small></div>)}
    </div>
  )
}

export default function TesteControlePage() {
  const { userProfile } = useAuth()
  const { temAcesso, loading } = usePermissoes(userProfile?.id)
  const [d, setD] = useState<Dados | null>(null)
  const [erro, setErro] = useState('')
  const [op, setOp] = useState(1)
  const [mes, setMes] = useState('')
  const [aberto, setAberto] = useState<{ nome: string; mes: string } | null>(null)
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/mecanicos/controle-comissoes?n=6', { headers: await authHeaders(), cache: 'no-store' })
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || 'Falha')
        setD(j)
        // o mês que normalmente se olha: o último fechado
        setMes(j.meses[j.meses.length - 2] || j.meses[j.meses.length - 1])
      } catch (e) { setErro(e instanceof Error ? e.message : 'Falha') }
    })()
  }, [])
  if (loading) return null
  if (!temAcesso('mecanicos')) return <SemPermissao />
  const linhas = d?.linhas || []
  const doMes = linhas.map((l) => ({ l, c: l.meses[mes] })).filter((x) => x.c && (x.l.ativo || x.c.etapa !== 'nao_enviada'))
  const conta = (f: (c: CelulaControle) => boolean) => doMes.filter((x) => f(x.c)).length
  const celAberta = aberto && d ? linhas.find((l) => l.nome === aberto.nome)?.meses[aberto.mes] : null

  return (
    <div className="tc">
      <style>{ESTILO}</style>
      <div className="tc-cab">
        <h1>Controle de comissões — teste</h1>
        <p>Escolha um jeito. Dados reais: pedidos ao diretor feitos pelo portal + o que está lançado no RH.</p>
        <div className="tc-ops">
          {['1. Grade pessoa × mês', '2. Um mês por vez, com as etapas', '3. Colunas do que falta'].map((t, i) => <button key={t} type="button" className={op === i + 1 ? 'on' : ''} onClick={() => setOp(i + 1)}>{t}{i === 1 && <em>recomendada</em>}</button>)}
        </div>
      </div>
      {erro && <p className="tc-erro">{erro}</p>}
      {!d && !erro && <p className="tc-mudo"><i className="fas fa-circle-notch fa-spin" /> carregando…</p>}
      {d?.semRH && <p className="tc-erro">Sem acesso ao RH: só aparecem os pedidos do portal.</p>}

      {d && op === 1 && (
        <div className="tc-card">
          <p className="tc-dica">Cada quadradinho é a comissão daquele mês. Clique para ver o caminho dela.</p>
          <div className="tc-scroll">
            <table className="tc-grade">
              <thead><tr><th>Pessoa</th>{d.meses.map((m) => <th key={m}>{curto(m)}</th>)}</tr></thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.nome} className={l.ativo ? '' : 'saiu'}>
                    <td><b>{primeiroNome(l.nome)}</b><small>{l.ativo ? l.cargo || '' : 'desligado'}</small></td>
                    {d.meses.map((m) => { const c = l.meses[m]; return (
                      <td key={m}><button type="button" className="tc-cel" onClick={() => setAberto({ nome: l.nome, mes: m })} title={ETAPA[c.etapa].txt}>
                        <Pilula c={c} />{c.valor != null && <small>{brl(c.valor)}</small>}
                      </button></td>
                    ) })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="tc-legenda">{(Object.keys(ETAPA) as EtapaControle[]).map((k) => <span key={k}><Pilula c={{ etapa: k } as CelulaControle} mini /> {ETAPA[k].txt}</span>)}</div>
        </div>
      )}

      {d && op === 2 && (
        <div className="tc-card">
          <div className="tc-mes">
            {d.meses.map((m) => <button key={m} type="button" className={m === mes ? 'on' : ''} onClick={() => setMes(m)}>{curto(m)}</button>)}
          </div>
          <div className="tc-resumo">
            <b>Comissão de {longo(mes)}</b>
            <span><b>{conta((c) => c.etapa === 'paga')}</b> pagas</span>
            <span><b>{conta((c) => ['no_rh', 'rh_falta_aprovar', 'rh_rascunho'].includes(c.etapa))}</b> no RH</span>
            <span><b>{conta((c) => ['com_diretor', 'devolvida', 'erro_rh'].includes(c.etapa))}</b> com o diretor</span>
            <span className={conta((c) => c.etapa === 'nao_enviada') ? 'falta' : ''}><b>{conta((c) => c.etapa === 'nao_enviada')}</b> não enviadas</span>
          </div>
          <div className="tc-lista">
            {doMes.map(({ l, c }) => (
              <div key={l.nome} className="tc-linha">
                <div className="tc-quem"><b>{primeiroNome(l.nome)}</b><Pilula c={c} /><span className="tc-v">{c.valor != null ? brl(c.valor) : '—'}</span></div>
                <Trilha c={c} />
                {c.pedido?.observacao && c.etapa === 'devolvida' && <p className="tc-obs"><i className="fas fa-comment" /> {c.pedido.observacao}</p>}
              </div>
            ))}
            {!doMes.length && <p className="tc-mudo">Ninguém com comissão neste mês.</p>}
          </div>
        </div>
      )}

      {d && op === 3 && (
        <div className="tc-card">
          <div className="tc-mes">
            {d.meses.map((m) => <button key={m} type="button" className={m === mes ? 'on' : ''} onClick={() => setMes(m)}>{curto(m)}</button>)}
          </div>
          <div className="tc-cols">
            {([['Falta enviar', ['nao_enviada', 'em_andamento']], ['Com o diretor', ['com_diretor', 'devolvida', 'erro_rh']], ['No RH', ['rh_rascunho', 'rh_falta_aprovar', 'no_rh']], ['Pagas', ['paga']]] as [string, EtapaControle[]][]).map(([t, ets]) => {
              const xs = doMes.filter((x) => ets.includes(x.c.etapa))
              return (
                <div key={t} className="tc-col">
                  <h3>{t} <span>{xs.length}</span></h3>
                  {xs.map(({ l, c }) => (
                    <button key={l.nome} type="button" className="tc-ficha" onClick={() => setAberto({ nome: l.nome, mes })}>
                      <b>{primeiroNome(l.nome)}</b><Pilula c={c} /><small>{c.valor != null ? brl(c.valor) : 'sem valor ainda'}</small>
                    </button>
                  ))}
                  {!xs.length && <p className="tc-mudo">ninguém</p>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {celAberta && aberto && (
        <div className="tc-fundo" onClick={() => setAberto(null)}>
          <div className="tc-modal" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="tc-modal-cab"><b>{primeiroNome(aberto.nome)} · {longo(aberto.mes)}</b><button type="button" onClick={() => setAberto(null)} aria-label="Fechar"><i className="fas fa-xmark" /></button></div>
            <Pilula c={celAberta} />
            <Trilha c={celAberta} />
            {celAberta.rh?.origem && <p className="tc-obs">RH: {celAberta.rh.origem}</p>}
            {celAberta.pedido?.observacao && <p className="tc-obs"><i className="fas fa-comment" /> {celAberta.pedido.observacao}</p>}
          </div>
        </div>
      )}
    </div>
  )
}

const ESTILO = `
.tc { padding: 20px; display: grid; gap: 14px; color: var(--portal-text, #0f172a) }
.tc-cab h1 { margin: 0; font-size: 22px } .tc-cab p { margin: 4px 0 10px; color: #64748b; font-size: 13px }
.tc-ops { display: flex; gap: 8px; flex-wrap: wrap }
.tc-ops button, .tc-mes button { border: 1px solid #cbd5e1; background: var(--portal-bg-card, #fff); color: inherit; border-radius: 999px; padding: 7px 14px; font-size: 13px; cursor: pointer }
.tc-ops button.on, .tc-mes button.on { background: #1d4ed8; border-color: #1d4ed8; color: #fff }
.tc-ops em { font-style: normal; font-size: 10px; margin-left: 6px; background: #d1fae5; color: #047857; border-radius: 999px; padding: 1px 6px }
.tc-card { background: var(--portal-bg-card, #fff); border: 1px solid #e2e8f0; border-radius: 14px; padding: 16px; display: grid; gap: 12px }
.tc-dica, .tc-mudo { margin: 0; color: #64748b; font-size: 13px } .tc-erro { color: #b91c1c; margin: 0 }
.tc-scroll { overflow-x: auto }
.tc-grade { border-collapse: collapse; width: 100%; font-size: 13px }
.tc-grade th { text-align: left; font-size: 11px; text-transform: uppercase; color: #64748b; padding: 6px; font-weight: 600 }
.tc-grade td { padding: 4px 6px; border-top: 1px solid #f1f5f9; vertical-align: middle }
.tc-grade td:first-child { min-width: 150px } .tc-grade td:first-child small { display: block; color: #94a3b8; font-size: 11px }
.tc-grade tr.saiu { opacity: .55 }
.tc-cel { border: 0; background: none; padding: 4px; cursor: pointer; display: grid; gap: 2px; justify-items: start; color: inherit; font: inherit }
.tc-cel small { font-size: 11px; color: #64748b }
.tc-pil { display: inline-flex; gap: 5px; align-items: center; border-radius: 999px; padding: 3px 9px; font-size: 12px; font-weight: 600; white-space: nowrap }
.tc-legenda { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12px; color: #64748b }
.tc-mes { display: flex; gap: 6px; flex-wrap: wrap }
.tc-resumo { display: flex; gap: 8px 18px; flex-wrap: wrap; align-items: baseline; font-size: 13px; color: #64748b }
.tc-resumo > b { font-size: 17px; color: var(--portal-text, #0f172a); margin-right: 6px } .tc-resumo span b { color: var(--portal-text, #0f172a); font-size: 15px }
.tc-resumo .falta b { color: #b91c1c }
.tc-lista { display: grid; gap: 10px }
.tc-linha { border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; display: grid; gap: 10px }
.tc-quem { display: flex; gap: 10px; align-items: center; flex-wrap: wrap } .tc-quem > b { font-size: 15px } .tc-v { margin-left: auto; font-weight: 700 }
.tc-trilha { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px }
.tc-trilha > div { display: grid; grid-template-columns: auto 1fr; column-gap: 8px; align-items: center; color: #94a3b8 }
.tc-trilha > div b { font-size: 12px } .tc-trilha > div small { grid-column: 2; font-size: 11px }
.tc-trilha > div.ok { color: #047857 }
.tc-bola { grid-row: span 2; width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; font-size: 11px; border: 2px solid currentColor }
.tc-trilha > div.ok .tc-bola { background: #047857; color: #fff; border-color: #047857 }
.tc-obs { margin: 0; font-size: 12px; color: #c2410c }
.tc-cols { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px }
.tc-col { background: #f8fafc; border-radius: 12px; padding: 10px; display: grid; gap: 8px; align-content: start }
.tc-col h3 { margin: 0; font-size: 13px; display: flex; justify-content: space-between } .tc-col h3 span { background: #e2e8f0; border-radius: 999px; padding: 0 8px }
.tc-ficha { border: 1px solid #e2e8f0; background: var(--portal-bg-card, #fff); color: inherit; border-radius: 10px; padding: 10px; display: grid; gap: 6px; justify-items: start; text-align: left; cursor: pointer; font: inherit }
.tc-ficha small { color: #64748b; font-size: 12px }
.tc-fundo { position: fixed; inset: 0; background: rgba(15,23,42,.45); display: grid; place-items: center; z-index: 100100; padding: 16px }
.tc-modal { background: var(--portal-bg-card, #fff); border-radius: 14px; padding: 18px; width: min(640px, 100%); display: grid; gap: 12px; justify-items: start }
.tc-modal .tc-trilha { width: 100% }
.tc-modal-cab { display: flex; justify-content: space-between; width: 100%; font-size: 16px } .tc-modal-cab button { border: 0; background: none; font-size: 18px; cursor: pointer; color: inherit }
[data-theme="dark"] .tc-card, [data-theme="dark"] .tc-linha, [data-theme="dark"] .tc-ficha { border-color: #333 }
[data-theme="dark"] .tc-col { background: #111 } [data-theme="dark"] .tc-grade td { border-color: #262626 }
@media (max-width: 760px) { .tc-cols, .tc-trilha { grid-template-columns: 1fr 1fr } }
`
