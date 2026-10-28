'use client'
// Dinheiro parado do pós-vendas (José, 16/10/2026): OS que não faturaram — "feitas e não
// faturadas" (relatório preenchido / passou da execução) e "passou da data sem preencher".
// É uma foto de AGORA (não depende da fita do tempo). Dados: base.pendencias (tabela
// posvendas_pendencias, regravada pelo robô). Regras em lib/mecanicos/pendencias.ts.
import { useEffect, useMemo, useState } from 'react'
import { authHeaders } from '@/lib/auth/client'
import { useVersaoAoVivo } from './useAoVivo'
import { createPortal } from 'react-dom'
import { resumoPendencias, FAIXAS_IDADE, type Pendencia, type TipoPendencia } from '@/lib/mecanicos/pendencias'
import { grupoDe } from '@/lib/mecanicos/painel'
import { brl, brl2, Numero } from './ui'

const MUDO = 'var(--portal-text-muted, #64748b)'
const TIPO: Record<TipoPendencia, { titulo: string; sub: string; cor: string; fundo: string; icone: string }> = {
  preenchida: { titulo: 'Feito e não faturado', sub: 'relatório preenchido ou serviço executado, esperando faturar', cor: '#d97706', fundo: '#fffbeb', icone: 'fa-file-circle-check' },
  atrasada: { titulo: 'Passou da data sem preencher', sub: 'a data de execução passou e o técnico não fez o relatório', cor: '#dc2626', fundo: '#fef2f2', icone: 'fa-calendar-xmark' },
}
const COR_IDADE = ['#16a34a', '#eab308', '#f97316', '#dc2626']

/** Dinheiro parado AO VIVO: busca /api/mecanicos/parado a cada 30 s e ao voltar para a aba (OS faturada,
 *  marcada como interna ou cancelada sai na hora). Até a 1ª resposta usa o que veio na base. */
export function useParadoVivo(inicial: Pendencia[]): Pendencia[] {
  const [vivo, setVivo] = useState<Pendencia[] | null>(null)
  const versao = useVersaoAoVivo()
  useEffect(() => {
    let ativo = true
    const buscar = async () => {
      try {
        const r = await fetch('/api/mecanicos/parado', { headers: await authHeaders(), cache: 'no-store' })
        if (!r.ok) return
        const j = await r.json()
        if (ativo && Array.isArray(j.pendencias)) setVivo(j.pendencias)
      } catch { /* sem rede: fica com o último */ }
    }
    void buscar()
    const t = setInterval(() => { if (document.visibilityState === 'visible') void buscar() }, 30_000)
    const aoVoltar = () => { if (document.visibilityState === 'visible') void buscar() }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => { ativo = false; clearInterval(t); document.removeEventListener('visibilitychange', aoVoltar) }
  }, [versao])
  return vivo || inicial
}

export default function DinheiroParado({ pendencias: inicial }: { pendencias: Pendencia[] }) {
  const pendencias = useParadoVivo(inicial)
  // garantia (Preenchido Garantia etc.) espera a MONTADORA pagar: não é "feito e não faturado" —
  // fica no card Garantia do Apoio ao pós-vendas (José, 17/10/2026)
  const todas = useMemo(() => pendencias.map((p) => ({ ...p, tecnicos: [...new Set(p.tecnicos.map(grupoDe))] })), [pendencias])
  const lista = useMemo(() => todas.filter((p) => !(p.garantia && p.tipo === 'preenchida')), [todas])
  const garantias = useMemo(() => todas.filter((p) => p.garantia && p.tipo === 'preenchida'), [todas])
  const r = useMemo(() => resumoPendencias(lista), [lista])
  const [ver, setVer] = useState<{ tipo: TipoPendencia | 'todos'; tecnico?: string } | null>(null)
  const ranking = Object.entries(r.porTecnico).sort((a, b) => b[1].total - a[1].total)
  const maxTec = Math.max(1, ...ranking.map(([, v]) => v.total))
  if (!lista.length) return null
  return (
    <section className="dp cpv-entra">
      <style>{ESTILO_DP}</style>
      <div className="dp-cab">
        <div>
          <div className="dp-rot"><i className="fas fa-hourglass-half" /> Dinheiro parado · agora</div>
          <div className="dp-frase"><b style={{ color: '#b45309' }}><Numero valor={r.total.total} formato={brl} /></b> em {r.total.qtd} OS ainda não faturadas</div>
          {garantias.length > 0 && <div style={{ fontSize: 12.5, color: MUDO, marginTop: 2 }}><i className="fas fa-shield-heart" style={{ color: '#7c3aed' }} /> fora daqui: {garantias.length} garantia(s) esperando a montadora ({brl(garantias.reduce((a, p) => a + p.total, 0))}) — veja no card Garantia</div>}
        </div>
        <button type="button" className="dp-btn" onClick={() => setVer({ tipo: 'todos' })}>ver todas <i className="fas fa-chevron-right" /></button>
      </div>

      <div className="dp-grade">
        {(['preenchida', 'atrasada'] as const).map((t, i) => {
          const x = r[t], cfg = TIPO[t]
          const maxIdade = Math.max(1, ...x.idade.map((f) => f.total))
          return (
            <button key={t} type="button" className="dp-card" style={{ animationDelay: `${i * 90}ms`, borderTopColor: cfg.cor }} onClick={() => setVer({ tipo: t })}>
              <div className="dp-card-cab">
                <span className="dp-ic" style={{ background: cfg.fundo, color: cfg.cor }}><i className={`fas ${cfg.icone}`} /></span>
                <div style={{ minWidth: 0 }}><b>{cfg.titulo}</b><small>{cfg.sub}</small></div>
              </div>
              <div className="dp-valor" style={{ color: cfg.cor }}><Numero valor={x.total} formato={brl} /><em>{x.qtd} OS</em></div>
              <div className="dp-idade">
                {x.idade.map((f, k) => (
                  <div key={f.rotulo} title={`${f.rotulo}: ${brl(f.total)} em ${f.qtd} OS`}>
                    <span className="dp-col"><i style={{ height: `${Math.max(f.total ? 8 : 2, (f.total / maxIdade) * 100)}%`, background: COR_IDADE[k], animationDelay: `${200 + k * 80}ms` }} /></span>
                    <small>{f.rotulo}</small>
                    <b>{f.qtd}</b>
                  </div>
                ))}
              </div>
            </button>
          )
        })}

        <div className="dp-card dp-rank" style={{ animationDelay: '180ms' }}>
          <div className="dp-card-cab"><span className="dp-ic" style={{ background: '#eff6ff', color: '#0369a1' }}><i className="fas fa-user-clock" /></span><div><b>Com quem está parado</b><small>clique para ver as OS de cada um</small></div></div>
          <div style={{ display: 'grid', gap: 6, marginTop: 4 }}>
            {ranking.slice(0, 6).map(([t, v], k) => (
              <button key={t} type="button" className="dp-tec" onClick={() => setVer({ tipo: 'todos', tecnico: t })}>
                <span>{t}</span>
                <span className="dp-tec-barra"><i style={{ width: `${(v.total / maxTec) * 100}%`, animationDelay: `${250 + k * 60}ms` }} /></span>
                <b>{brl(v.total)}</b><small>{v.qtd}</small>
              </button>
            ))}
          </div>
        </div>
      </div>

      {ver && <ListaParadas lista={lista} filtro={ver} onFechar={() => setVer(null)} />}
    </section>
  )
}

/** Janela com as OS paradas (usada aqui e nas opções da página de teste). idade = índice de FAIXAS_IDADE. */
export function ListaParadas({ lista, filtro, onFechar }: { lista: Pendencia[]; filtro: { tipo: TipoPendencia | 'todos'; tecnico?: string; idade?: number }; onFechar: () => void }) {
  const [tipo, setTipo] = useState(filtro.tipo)
  const faixa = filtro.idade != null ? FAIXAS_IDADE[filtro.idade] : null
  const itens = lista.filter((p) => (tipo === 'todos' || p.tipo === tipo) && (!filtro.tecnico || p.tecnicos.includes(filtro.tecnico) || (filtro.tecnico === 'Sem técnico' && !p.tecnicos.length)) && (!faixa || (p.dias >= faixa[1] && p.dias <= faixa[2])))
  const total = itens.reduce((s, p) => s + p.total, 0)
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="dp-fundo" onClick={onFechar}>
      <style>{ESTILO_DP}</style>
      <div className="dp-janela" onClick={(e) => e.stopPropagation()}>
        <div className="dp-j-cab">
          <div style={{ flex: 1 }}>
            <b>Dinheiro parado{filtro.tecnico ? ` · ${filtro.tecnico}` : ''}{faixa ? ` · ${faixa[0]}` : ''}</b>
            <small>{itens.length} OS · {brl2(total)} estimados (mão de obra + km + peças)</small>
          </div>
          <button type="button" className="dp-x" onClick={onFechar}><i className="fas fa-xmark" /></button>
        </div>
        <div className="dp-filtros">
          {(['todos', 'preenchida', 'atrasada'] as const).map((k) => <button key={k} type="button" className={tipo === k ? 'on' : ''} onClick={() => setTipo(k)}>{k === 'todos' ? 'Todas' : TIPO[k].titulo}</button>)}
        </div>
        <div className="dp-lista">
          {itens.map((p, i) => {
            const k = FAIXAS_IDADE.findIndex(([, a, b]) => p.dias >= a && p.dias <= b)
            return (
              <a key={p.os} href={`/pos?id=${encodeURIComponent(p.os)}`} target="_blank" rel="noreferrer" className="dp-item" style={{ animationDelay: `${Math.min(i, 20) * 25}ms`, borderLeftColor: TIPO[p.tipo].cor }}>
                <div className="dp-dias" style={{ color: COR_IDADE[k] || MUDO }}><b>{p.dias}</b><small>dias</small></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="dp-i1"><b>{p.os}</b>{p.garantia && <em className="dp-gar">garantia</em>}<span>{p.status}</span></div>
                  <div className="dp-i2">{p.cliente || '—'} · {p.tecnicos.join(' + ') || 'sem técnico'}</div>
                </div>
                <div className="dp-dir"><b>{brl(p.total)}</b><small>MO {brl(p.maoDeObra)} · km {brl(p.deslocamento)} · peças {brl(p.pecas)}</small></div>
              </a>
            )
          })}
          {!itens.length && <div style={{ padding: 30, textAlign: 'center', color: MUDO }}>Nada parado aqui.</div>}
        </div>
      </div>
    </div>,
    (document.fullscreenElement as HTMLElement | null) || document.body,
  )
}

export const ESTILO_DP = `
.dp { background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 18px; padding: 16px 18px; margin-bottom: 14px; box-shadow: 0 1px 3px rgba(15,23,42,.05) }
.dp-cab { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; margin-bottom: 12px }
.dp-rot { font-size: 12.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .6px; color: var(--portal-text-muted, #64748b) }
.dp-frase { font-size: 21px; font-weight: 700; color: var(--portal-text, #0f172a) } .dp-frase b { font-weight: 900 }
.dp-btn { border: 1px solid var(--portal-border, #e2e8f0); background: transparent; border-radius: 99px; padding: 6px 14px; font-family: inherit; font-weight: 800; font-size: 13px; color: #0369a1; cursor: pointer }
.dp-grade { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 12px }
.dp-card { text-align: left; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-top: 4px solid; border-radius: 16px; padding: 12px 14px; font-family: inherit; color: inherit; cursor: pointer; display: grid; gap: 8px; animation: cpvEntra .5s cubic-bezier(.2,.8,.2,1) both; transition: transform .2s, box-shadow .2s }
.dp-card:hover { transform: translateY(-3px); box-shadow: 0 12px 26px rgba(15,23,42,.10) }
.dp-rank { cursor: default; border-top-color: #0369a1 } .dp-rank:hover { transform: none }
.dp-card-cab { display: flex; gap: 10px; align-items: center }
.dp-card-cab b { display: block; font-size: 15px; color: var(--portal-text, #0f172a) } .dp-card-cab small { font-size: 12px; color: var(--portal-text-muted, #64748b) }
.dp-ic { width: 38px; height: 38px; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0 }
.dp-valor { font-size: 30px; font-weight: 900; display: flex; align-items: baseline; gap: 8px } .dp-valor em { font-style: normal; font-size: 13px; color: var(--portal-text-muted, #64748b); font-weight: 700 }
.dp-idade { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; align-items: end }
.dp-idade > div { display: flex; flex-direction: column; align-items: center; gap: 2px }
.dp-col { width: 100%; height: 48px; display: flex; align-items: flex-end; background: var(--portal-bg-secondary, #f8fafc); border-radius: 8px; overflow: hidden }
.dp-col i { display: block; width: 100%; border-radius: 8px 8px 0 0; animation: dpSobe .8s cubic-bezier(.2,.8,.2,1) both; transform-origin: bottom }
@keyframes dpSobe { from { transform: scaleY(0) } }
.dp-idade small { font-size: 10.5px; color: var(--portal-text-muted, #94a3b8); white-space: nowrap } .dp-idade b { font-size: 13px; color: var(--portal-text, #0f172a) }
.dp-tec { display: grid; grid-template-columns: 120px 1fr auto 24px; gap: 8px; align-items: center; border: none; background: transparent; font-family: inherit; font-size: 13px; color: var(--portal-text, #334155); cursor: pointer; padding: 3px 4px; border-radius: 8px; text-align: left }
.dp-tec:hover { background: var(--portal-bg-secondary, #f1f5f9) }
.dp-tec > span:first-child { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 700 }
.dp-tec-barra { height: 8px; background: var(--portal-bg-secondary, #f1f5f9); border-radius: 99px; overflow: hidden }
.dp-tec-barra i { display: block; height: 100%; background: linear-gradient(90deg, #f59e0b, #dc2626); border-radius: 99px; animation: dpBarra .8s cubic-bezier(.2,.8,.2,1) both; transform-origin: left }
@keyframes dpBarra { from { transform: scaleX(0) } }
.dp-tec b { font-variant-numeric: tabular-nums } .dp-tec small { color: var(--portal-text-muted, #94a3b8); text-align: right }
.dp-fundo { position: fixed; inset: 0; z-index: 100050; background: rgba(15,23,42,.45); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; padding: 16px; animation: dpFundo .25s both }
@keyframes dpFundo { from { opacity: 0 } }
.dp-janela { width: min(900px, 100%); max-height: 88vh; display: flex; flex-direction: column; background: var(--portal-bg-card, #fefefe); border-radius: 18px; box-shadow: 0 30px 80px rgba(15,23,42,.35); overflow: hidden; animation: dpAbre .45s cubic-bezier(.2,1.15,.3,1) both }
@keyframes dpAbre { from { opacity: 0; transform: translateY(28px) scale(.94); filter: blur(4px) } }
.dp-j-cab { display: flex; gap: 10px; align-items: center; padding: 14px 18px; border-bottom: 1px solid var(--portal-border, #e5e7eb) }
.dp-j-cab b { display: block; font-size: 17px; color: var(--portal-text, #0f172a) } .dp-j-cab small { font-size: 12.5px; color: var(--portal-text-muted, #64748b) }
.dp-x { width: 36px; height: 36px; border-radius: 50%; border: 1px solid var(--portal-border, #e2e8f0); background: transparent; cursor: pointer; color: var(--portal-text-muted, #64748b) }
.dp-filtros { display: flex; gap: 6px; padding: 10px 18px; flex-wrap: wrap }
.dp-filtros button { border: 1px solid var(--portal-border, #e2e8f0); background: transparent; border-radius: 99px; padding: 5px 12px; font-family: inherit; font-size: 13px; font-weight: 700; color: var(--portal-text-muted, #475569); cursor: pointer }
.dp-filtros button.on { background: #0369a1; border-color: #0369a1; color: #fefefe }
.dp-lista { overflow-y: auto; padding: 0 18px 18px; display: grid; gap: 6px }
.dp-item { display: flex; gap: 12px; align-items: center; border: 1px solid var(--portal-border, #eef2f7); border-left: 4px solid; border-radius: 12px; padding: 8px 12px; text-decoration: none; color: inherit; animation: cpvEntra .35s ease both; transition: background .15s }
.dp-item:hover { background: var(--portal-bg-secondary, #f8fafc) }
.dp-dias { width: 46px; display: flex; flex-direction: column; align-items: center; line-height: 1 } .dp-dias b { font-size: 20px; font-weight: 900 } .dp-dias small { font-size: 10px; font-weight: 700 }
.dp-i1 { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 14px } .dp-i1 span { font-size: 12px; color: var(--portal-text-muted, #64748b); background: var(--portal-bg-secondary, #f1f5f9); border-radius: 99px; padding: 1px 8px }
.dp-gar { font-style: normal; font-size: 11px; font-weight: 800; color: #db2777; background: #fdf2f8; border-radius: 99px; padding: 1px 8px }
.dp-i2 { font-size: 12.5px; color: var(--portal-text-muted, #64748b); white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.dp-dir { display: flex; flex-direction: column; align-items: flex-end; text-align: right } .dp-dir b { font-size: 15px; font-variant-numeric: tabular-nums } .dp-dir small { font-size: 11px; color: var(--portal-text-muted, #94a3b8); white-space: nowrap }
@media (max-width: 720px) { .dp-dir small { display: none } .dp-tec { grid-template-columns: 90px 1fr auto } .dp-tec small { display: none } }
`
