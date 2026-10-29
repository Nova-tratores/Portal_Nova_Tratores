'use client'
// Administração → Notificações (José, 29/10/2026: "jogar isso aqui lá em Administração, onde a gente controla isso e
// vê o que cada app aciona de pessoas"). Duas visões:
//  - Quem recebe: o "Minhas notificações" de TODO mundo numa grade (pessoa × módulo); clicar liga/desliga na hora.
//  - O que cada app aciona: cada lugar do portal que manda aviso, quem ele atinge pela regra e quantos avisos mandou
//    de verdade nos últimos 30 dias (e para quem).
import { useEffect, useMemo, useState } from 'react'
import { Bell } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import { modulosObrigatorios } from '@/lib/notif/prefs'
import { FONTES_NOTIF } from '@/lib/notif/fontes'

interface Usuario { id: string; nome: string; email: string; funcao: string; avatar_url: string | null; categoria: string | null; isAdmin: boolean; isDev: boolean; modulos: string[]; silenciados: string[] }
interface Dados { usuarios: Usuario[]; modulos: { id: string; nome: string }[]; porTipo: Record<string, { total: number; pessoas: Record<string, number>; ultimo: string }>; desde: string; podeEditar: boolean }

/** módulo do aviso → módulo de acesso (quem não tem acesso ao módulo, em geral, nem é candidato) */
const ACESSO: Record<string, string | null> = { avisos: null, novazap: null }
const temAcesso = (u: Usuario, m: string) => u.isAdmin || u.isDev || ACESSO[m] === null || u.modulos.includes(ACESSO[m] ?? m)
const curto = (n: string) => n.replace(/\s*\(.*\)$/, '').replace('Controle de ', '').replace('Base de conhecimento', 'Conhecimento').replace('Propostas Comerciais', 'Propostas').replace('Avisos do Portal', 'Avisos')

export default function NotificacoesAdmin() {
  const [d, setD] = useState<Dados | null>(null)
  const [erro, setErro] = useState('')
  const [aba, setAba] = useState<'quem' | 'fontes'>('quem')
  const [busca, setBusca] = useState('')
  const [salvando, setSalvando] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const r = await fetch('/api/admin/notificacoes', { headers: await authHeaders(), cache: 'no-store' })
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || 'Falha')
        if (vivo) setD(j)
      } catch (e) { if (vivo) setErro(e instanceof Error ? e.message : 'Falha ao carregar') }
    })()
    return () => { vivo = false }
  }, [])

  const usuarios = useMemo(() => (d?.usuarios || []).filter((u) => !busca || `${u.nome} ${u.categoria || ''} ${u.funcao}`.toLowerCase().includes(busca.toLowerCase())), [d, busca])
  const nomeDe = useMemo(() => new Map((d?.usuarios || []).map((u) => [u.id, u.nome])), [d])

  const alternar = async (u: Usuario, m: string) => {
    if (!d?.podeEditar || modulosObrigatorios(u.categoria).includes(m)) return
    const novos = u.silenciados.includes(m) ? u.silenciados.filter((x) => x !== m) : [...u.silenciados, m]
    const antes = u.silenciados
    setD((x) => x && { ...x, usuarios: x.usuarios.map((y) => (y.id === u.id ? { ...y, silenciados: novos } : y)) })
    setSalvando(`${u.id}|${m}`); setErro('')
    try {
      const r = await fetch('/api/admin/notificacoes', { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ user_id: u.id, silenciados: novos }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || String(r.status))
      setD((x) => x && { ...x, usuarios: x.usuarios.map((y) => (y.id === u.id ? { ...y, silenciados: j.silenciados || novos } : y)) })
    } catch (e) {
      setD((x) => x && { ...x, usuarios: x.usuarios.map((y) => (y.id === u.id ? { ...y, silenciados: antes } : y)) })
      setErro(`Não salvou (${u.nome}): ${e instanceof Error ? e.message : 'erro'}`)
    }
    setSalvando(null)
  }

  return (
    <div className="na">
      <style>{ESTILO_NA}</style>
      <div className="na-cab">
        <Bell size={16} color="#ef4444" />
        <h3>Notificações</h3>
        <div className="na-abas" role="tablist">
          <button type="button" className={aba === 'quem' ? 'on' : ''} onClick={() => setAba('quem')}>Quem recebe</button>
          <button type="button" className={aba === 'fontes' ? 'on' : ''} onClick={() => setAba('fontes')}>O que cada app aciona</button>
        </div>
      </div>
      <p className="na-sub">{aba === 'quem'
        ? 'O "Minhas notificações" de todo mundo. Clique para ligar ou desligar um módulo para a pessoa (vale na hora). Com cadeado é obrigatório pelo cargo.'
        : 'Cada lugar do portal que manda aviso: para quem vai pela regra e quanto mandou de verdade nos últimos 30 dias.'}</p>
      {erro && <div className="na-erro">{erro}</div>}
      {!d ? <div className="na-carr">{erro ? '' : 'carregando…'}</div> : aba === 'quem' ? (
        <>
          <input className="na-busca" placeholder="Buscar pessoa ou cargo…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <div className="na-tab-wrap">
            <table className="na-tab">
              <thead>
                <tr>
                  <th className="p">Pessoa</th>
                  {d.modulos.map((m) => {
                    const n = d.usuarios.filter((u) => !u.silenciados.includes(m.id) || modulosObrigatorios(u.categoria).includes(m.id)).length
                    return <th key={m.id} title={`${m.nome}: ${n} de ${d.usuarios.length} recebem`}><span>{curto(m.nome)}</span><small>{n}</small></th>
                  })}
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => (
                  <tr key={u.id}>
                    <td className="p">
                      {u.avatar_url ? <img src={u.avatar_url} alt="" /> : <span className="av">{u.nome.slice(0, 1)}</span>}
                      <div><b>{u.nome}</b><small>{u.categoria || u.funcao || 'sem cargo'}{u.isDev ? ' · Dev' : u.isAdmin ? ' · Admin' : ''}</small></div>
                    </td>
                    {d.modulos.map((m) => {
                      const obrig = modulosObrigatorios(u.categoria).includes(m.id)
                      const recebe = obrig || !u.silenciados.includes(m.id)
                      const acesso = temAcesso(u, m.id)
                      const st = obrig ? 'obrig' : recebe ? 'sim' : 'nao'
                      return (
                        <td key={m.id} className="c">
                          <button type="button" className={`na-cel ${st} ${acesso ? '' : 'sem'} ${salvando === `${u.id}|${m.id}` ? 'salva' : ''}`} disabled={!d.podeEditar || obrig}
                            onClick={() => alternar(u, m.id)}
                            title={`${u.nome} · ${m.nome}: ${obrig ? 'obrigatório pelo cargo' : recebe ? 'recebe (clique para desligar)' : 'desligado (clique para ligar)'}${acesso ? '' : ' · não tem acesso a esse módulo'}`}>
                            <i className={`fas ${obrig ? 'fa-lock' : recebe ? 'fa-bell' : 'fa-bell-slash'}`} />
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="na-leg"><span><i className="fas fa-bell" style={{ color: '#16a34a' }} /> recebe</span><span><i className="fas fa-bell-slash" style={{ color: '#94a3b8' }} /> desligado</span><span><i className="fas fa-lock" style={{ color: '#b45309' }} /> obrigatório pelo cargo</span><span><i className="fas fa-bell" style={{ color: '#16a34a', opacity: .35 }} /> sem acesso ao módulo (não chega mesmo ligado)</span></p>
        </>
      ) : (
        <div className="na-fontes">
          {FONTES_NOTIF.map((f) => {
            const st = f.tipos.reduce((acc, t) => {
              const x = d.porTipo[t]
              if (!x) return acc
              acc.total += x.total
              for (const [uid, n] of Object.entries(x.pessoas)) acc.pessoas[uid] = (acc.pessoas[uid] || 0) + n
              return acc
            }, { total: 0, pessoas: {} as Record<string, number> })
            const pessoas = Object.entries(st.pessoas).sort((a, b) => b[1] - a[1])
            const mod = f.modulo ? d.modulos.find((m) => m.id === f.modulo)?.nome : null
            const algumNao = f.eventos.some((e) => !e.respeita)
            return (
              <article key={f.id} className={`na-f ${algumNao ? 'nao' : ''}`}>
                <header>
                  <span className="ic"><i className={`fas ${f.ic}`} /></span>
                  <div><b>{f.app}</b><small>{mod ? `desliga em "${mod}"` : 'sem chave para desligar'}</small></div>
                  <em>{st.total ? `${st.total} avisos · ${pessoas.length} ${pessoas.length === 1 ? 'pessoa' : 'pessoas'}` : 'nenhum aviso em 30 dias'}</em>
                </header>
                <ul className="na-ev">
                  {f.eventos.map((e, k) => (
                    <li key={k} className={e.respeita ? 'ok' : 'x'} title={e.respeita ? 'quem desligou não recebe' : 'manda mesmo para quem desligou'}>
                      <i className={`fas ${e.respeita ? 'fa-sliders' : 'fa-triangle-exclamation'}`} />
                      <span><b>{e.evento}</b><small>→ {e.quem}{e.respeita ? '' : ' · não dá para desligar'}</small></span>
                    </li>
                  ))}
                </ul>
                {pessoas.length > 0 && <div className="na-pess">{pessoas.map(([uid, n]) => <span key={uid}>{nomeDe.get(uid) || 'usuário inativo'} <small>{n}</small></span>)}</div>}
              </article>
            )
          })}
          {(() => {
            const conhecidos = new Set(FONTES_NOTIF.flatMap((f) => f.tipos))
            const outros = Object.entries(d.porTipo).filter(([t]) => !conhecidos.has(t))
            return outros.length ? <p className="na-sub">Outros tipos de aviso nos últimos 30 dias: {outros.map(([t, x]) => `${t} (${x.total})`).join(', ')}</p> : null
          })()}
        </div>
      )}
    </div>
  )
}

const ESTILO_NA = `
.na { margin-top: 28px }
.na-cab { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px } .na-cab h3 { font-size: 15px; font-weight: 800; color: var(--portal-text-secondary); margin: 0 }
.na-abas { margin-left: 10px; display: inline-flex; gap: 2px; background: var(--portal-bg-secondary, #f1f5f9); border-radius: 99px; padding: 3px }
.na-abas button { border: 0; background: transparent; border-radius: 99px; padding: 5px 14px; font-family: inherit; font-size: 13px; color: var(--portal-text-secondary); cursor: pointer } .na-abas button.on { background: var(--portal-bg-card, #fefefe); color: var(--portal-text); box-shadow: 0 1px 3px rgba(15,23,42,.12); font-weight: 600 }
.na-sub { font-size: 12px; color: #a3a3a3; margin: 0 0 12px }
.na-erro { margin-bottom: 10px; color: #dc2626; font-size: 13px; font-weight: 600 } .na-carr { padding: 20px; color: #a3a3a3; font-size: 13px }
.na-busca { width: min(320px, 100%); padding: 8px 12px; border-radius: 10px; border: 1px solid var(--portal-border); background: var(--portal-bg-card); color: var(--portal-text); font-family: inherit; font-size: 13px; margin-bottom: 10px }
.na-tab-wrap { overflow: auto; max-height: 70vh; border-radius: 16px; background: var(--portal-bg-card); border: 1px solid var(--portal-border) }
.na-tab { border-collapse: separate; border-spacing: 0; font-size: 13px; min-width: 100% }
.na-tab th { position: sticky; top: 0; z-index: 2; background: var(--portal-bg-card); padding: 10px 6px; border-bottom: 1px solid var(--portal-border); font-weight: 600; color: var(--portal-text-secondary); vertical-align: bottom }
.na-tab th span { display: block; font-size: 11.5px; max-width: 74px; margin: 0 auto; line-height: 1.2 } .na-tab th small { display: block; font-size: 11px; color: #94a3b8; font-weight: 400; margin-top: 2px }
.na-tab th.p, .na-tab td.p { position: sticky; left: 0; z-index: 1; background: var(--portal-bg-card); text-align: left } .na-tab th.p { z-index: 3 }
.na-tab td { border-bottom: 1px solid var(--portal-border); padding: 6px } .na-tab tr:hover td { background: var(--portal-bg-secondary, #f8fafc) }
.na-tab td.p { display: flex; gap: 8px; align-items: center; min-width: 210px } .na-tab td.p img, .na-tab td.p .av { width: 26px; height: 26px; border-radius: 50%; object-fit: cover; flex: none; background: var(--portal-bg-secondary); display: inline-grid; place-items: center; font-size: 11px }
.na-tab td.p div { display: grid; line-height: 1.25 } .na-tab td.p b { font-weight: 600; color: var(--portal-text) } .na-tab td.p small { font-size: 11.5px; color: #94a3b8 }
.na-tab td.c { text-align: center }
.na-cel { width: 32px; height: 28px; border-radius: 8px; border: 1px solid transparent; background: transparent; cursor: pointer; font-size: 12.5px; transition: background .15s, transform .15s }
.na-cel.sim { color: #16a34a; background: rgba(22,163,74,.08) } .na-cel.nao { color: #94a3b8 } .na-cel.obrig { color: #b45309; background: rgba(245,158,11,.1); cursor: default }
.na-cel:not(:disabled):hover { transform: scale(1.08); border-color: var(--portal-border) } .na-cel.sem { opacity: .35 } .na-cel.salva { animation: naPisca .6s infinite alternate } @keyframes naPisca { to { opacity: .4 } }
.na-leg { display: flex; gap: 6px 16px; flex-wrap: wrap; font-size: 12px; color: #94a3b8; margin: 10px 0 0 } .na-leg i { margin-right: 4px }
.na-fontes { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 10px }
.na-f { display: grid; gap: 8px; align-content: start; border-radius: 14px; background: var(--portal-bg-card); border: 1px solid var(--portal-border); padding: 12px 14px }
.na-f header { display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; gap: 10px; align-items: center } .na-f header .ic { width: 32px; height: 32px; border-radius: 9px; display: grid; place-items: center; background: rgba(239,68,68,.1); color: #ef4444 }
.na-f header div { display: grid; line-height: 1.3 } .na-f header b { font-size: 14px; font-weight: 600; color: var(--portal-text) } .na-f header small { font-size: 12px; color: #94a3b8 } .na-f header em { font-style: normal; font-size: 12px; color: var(--portal-text-secondary); white-space: nowrap }
.na-f p { margin: 0; display: grid; grid-template-columns: 16px 1fr; gap: 6px; font-size: 12.5px; color: var(--portal-text-secondary); line-height: 1.45 } .na-f p i { color: #94a3b8; font-size: 11.5px; margin-top: 3px }
.na-f p.ok i { color: #16a34a } .na-f p.x { color: #b91c1c } .na-f p.x i { color: #dc2626 } .na-f.nao { border-color: #fecaca }
.na-ev { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px } .na-ev li { display: grid; grid-template-columns: 16px 1fr; gap: 6px; font-size: 12.5px; line-height: 1.4 } .na-ev li > i { font-size: 11px; margin-top: 3px; color: #16a34a } .na-ev li.x > i { color: #dc2626 }
.na-ev b { font-weight: 500; color: var(--portal-text) } .na-ev small { display: block; color: var(--portal-text-secondary) } .na-ev li.x small { color: #b91c1c }
.na-pess { display: flex; gap: 4px; flex-wrap: wrap } .na-pess span { font-size: 11.5px; background: var(--portal-bg-secondary, #f1f5f9); color: var(--portal-text-secondary); border-radius: 99px; padding: 2px 8px } .na-pess small { color: #94a3b8; margin-left: 2px }
`
