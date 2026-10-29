'use client'
// A OS e o relatório do técnico lado a lado (José, 29/10/2026: "clicar em qualquer lugar abre a ordem, e não só a ordem,
// já vem o relatório do técnico também"). Esquerda: o PDF da OS. Direita: o que o técnico escreveu (diagnóstico, serviço,
// dias e horas) e, se ele mandou, o PDF do relatório.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { authHeaders } from '@/lib/auth/client'

interface Rel { status: string | null; tecnico: string | null; tecnico2: string | null; modelo: string | null; tipo: string | null; motivo: string | null; servico: string | null; horas: string | null; km: string | number | null; dias: { data: string; horas: number }[] }

const br = (d: string) => d.split('-').reverse().join('/')
const h = (v: number) => `${String(Math.round(v * 10) / 10).replace('.', ',')} h`

export default function OSRelatorioJanela({ os, cliente, onFechar }: { os: string; cliente?: string; onFechar: () => void }) {
  const [rel, setRel] = useState<Rel | null | undefined>(undefined)
  const [pdf, setPdf] = useState<string | null>(null)
  const [aba, setAba] = useState<'texto' | 'pdf'>('texto')
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onFechar])
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const r = await fetch(`/api/mecanicos/os-relatorio?os=${encodeURIComponent(os)}`, { headers: await authHeaders(), cache: 'no-store' })
        const j = r.ok ? await r.json() : {}
        if (!vivo) return
        setRel(j.relatorio ?? null); setPdf(j.pdf ?? null)
      } catch { if (vivo) setRel(null) }
    })()
    return () => { vivo = false }
  }, [os])

  const tela = (
    <div className="orj-fundo" onClick={onFechar}>
      <style>{ESTILO}</style>
      <div className="orj" role="dialog" aria-label={`${os} e relatório do técnico`} onClick={(e) => e.stopPropagation()}>
        <header className="orj-cab">
          <span className="orj-ic"><i className="fas fa-file-invoice" /></span>
          <div><b>{os}</b><small>{cliente || ''}</small></div>
          <a className="orj-bt" href={`/api/pos/ordens/${encodeURIComponent(os)}/print?embed=1`} target="_blank" rel="noreferrer"><i className="fas fa-up-right-from-square" /> abrir a OS em outra aba</a>
          <button type="button" className="orj-x" onClick={onFechar} aria-label="Fechar"><i className="fas fa-xmark" /></button>
        </header>
        <div className="orj-corpo">
          <section className="orj-os">
            <span className="orj-rot"><i className="fas fa-file-invoice" /> Ordem de serviço</span>
            <iframe src={`/api/pos/ordens/${encodeURIComponent(os)}/print?embed=1`} title={os} />
          </section>
          <section className="orj-rel">
            <div className="orj-rel-cab">
              <span className="orj-rot"><i className="fas fa-clipboard-list" /> Relatório do técnico</span>
              {pdf && (
                <div className="orj-abas">
                  <button type="button" className={aba === 'texto' ? 'on' : ''} onClick={() => setAba('texto')}>o que ele escreveu</button>
                  <button type="button" className={aba === 'pdf' ? 'on' : ''} onClick={() => setAba('pdf')}>PDF enviado</button>
                </div>
              )}
            </div>
            {rel === undefined ? <p className="orj-vazio"><i className="fas fa-circle-notch fa-spin" /> buscando o relatório…</p>
              : aba === 'pdf' && pdf ? <iframe src={pdf} title="Relatório do técnico" />
              : !rel ? <p className="orj-vazio">Esta OS não tem relatório do técnico{pdf ? ' escrito (veja o PDF enviado)' : ''}.</p>
              : (
                <div className="orj-texto">
                  <div className="orj-chips">
                    {rel.tecnico && <span><i className="fas fa-user-gear" /> {rel.tecnico}{rel.tecnico2 ? ` e ${rel.tecnico2}` : ''}</span>}
                    {rel.horas && <span><i className="fas fa-clock" /> {rel.horas}</span>}
                    {rel.km != null && rel.km !== '' && <span><i className="fas fa-road" /> {rel.km} km</span>}
                    {rel.modelo && <span><i className="fas fa-tractor" /> {rel.modelo}</span>}
                    {rel.tipo && <span>{rel.tipo}</span>}
                    {rel.status && <span className="st">{rel.status}</span>}
                  </div>
                  {rel.dias.length > 0 && <p className="orj-dias">{rel.dias.map((d) => `${br(d.data)} · ${h(d.horas)}`).join('   |   ')}</p>}
                  <div className="orj-bloco"><small>Diagnóstico</small><p>{rel.motivo || '—'}</p></div>
                  <div className="orj-bloco"><small>Serviço realizado</small><p>{rel.servico || '—'}</p></div>
                </div>
              )}
          </section>
        </div>
      </div>
    </div>
  )
  return typeof document === 'undefined' ? tela : createPortal(tela, document.body)
}

const ESTILO = `
.orj-fundo { position: fixed; inset: 0; z-index: 100090; background: rgba(15,23,42,.5); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; padding: 16px; animation: orjFade .2s both }
@keyframes orjFade { from { opacity: 0 } } @keyframes orjSobe { from { opacity: 0; transform: translateY(10px) scale(.99) } }
.orj { width: min(1400px, 100%); height: 92vh; display: flex; flex-direction: column; background: var(--surface, #fefefe); border-radius: 18px; overflow: hidden; box-shadow: 0 30px 80px rgba(15,23,42,.35); animation: orjSobe .3s cubic-bezier(.2,1.1,.3,1) both; color: #0f172a }
.orj-cab { display: flex; gap: 12px; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--border, #e2e8f0) }
.orj-ic { width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; color: #2563eb; background: color-mix(in srgb, #2563eb 9%, #fefefe); border: 1px solid color-mix(in srgb, #2563eb 18%, transparent) }
.orj-cab > div { display: grid; flex: 1; min-width: 0 } .orj-cab b { font-size: 16px; font-weight: 500 } .orj-cab small { font-size: 13px; color: #475569; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.orj-bt { display: inline-flex; gap: 6px; align-items: center; font-size: 13px; color: #2563eb; text-decoration: none; padding: 6px 10px; border-radius: 10px } .orj-bt:hover { background: #eff6ff }
.orj-x { width: 34px; height: 34px; border-radius: 10px; border: 1px solid var(--border, #e2e8f0); background: transparent; color: #475569; cursor: pointer }
.orj-corpo { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr) }
@media (max-width: 900px) { .orj-corpo { grid-template-columns: 1fr; grid-template-rows: 1fr 1fr } }
.orj-os, .orj-rel { display: flex; flex-direction: column; min-height: 0 } .orj-os { border-right: 1px solid var(--border, #e2e8f0) }
.orj-rot { display: inline-flex; gap: 6px; align-items: center; font-size: 13px; color: #475569; padding: 10px 14px } .orj-rot i { color: #64748b }
.orj iframe { flex: 1; width: 100%; border: 0; background: #f8fafc }
.orj-rel-cab { display: flex; justify-content: space-between; align-items: center; padding-right: 12px }
.orj-abas { display: inline-flex; gap: 2px; background: #f1f5f9; border-radius: 99px; padding: 3px } .orj-abas button { border: 0; background: transparent; border-radius: 99px; padding: 4px 12px; font-family: inherit; font-size: 12.5px; color: #475569; cursor: pointer } .orj-abas button.on { background: #fefefe; color: #0f172a; box-shadow: 0 1px 3px rgba(15,23,42,.12) }
.orj-vazio { padding: 24px 16px; color: #64748b; font-size: 14px; margin: 0 }
.orj-texto { flex: 1; overflow: auto; padding: 0 16px 18px; display: grid; gap: 12px; align-content: start }
.orj-chips { display: flex; gap: 6px; flex-wrap: wrap } .orj-chips span { font-size: 12.5px; color: #334155; background: #f1f5f9; border-radius: 99px; padding: 3px 10px } .orj-chips i { color: #64748b; margin-right: 3px; font-size: 11px } .orj-chips .st { background: #ecfdf5; color: #047857 }
.orj-dias { margin: 0; font-size: 12.5px; color: #475569; white-space: pre-wrap }
.orj-bloco { background: #f8fafc; border: 1px solid var(--border, #e2e8f0); border-radius: 12px; padding: 10px 14px } .orj-bloco small { font-size: 12.5px; color: #64748b } .orj-bloco p { margin: 4px 0 0; font-size: 14.5px; line-height: 1.55; color: #0f172a; white-space: pre-wrap }
`
