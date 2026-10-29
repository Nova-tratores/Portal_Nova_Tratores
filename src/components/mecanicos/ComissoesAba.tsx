'use client'
// Aba Comissões da Equipe (José, 29/10/2026: "o cofrinho vai dentro de comissões, e os cards de técnico do mês
// também. E dentro de comissão vai dividir entre Funcionários: Técnicos / Escritório (Vinicius Correa e Larissa Garcia)").
//  - Técnicos: a caixinha, os cartões dos técnicos do mês e as regras (a antiga janela Comissões, aqui dentro).
//  - Escritório: a comissão do Vinicius e da Larissa que está no RH; a regra própria deles ainda vai ser definida.
import { useEffect, useState } from 'react'
import { authHeaders } from '@/lib/auth/client'
import CaixinhaMec from './CaixinhaMec'
import { ComissoesJanela, JanelaEmbutida } from './JanelasInfo'
import { brl2 } from './ui'

type PessoaEsc = { nome: string; rh: { nome: string; cargo: string | null; departamento: string | null } | null; comissoes: { mes: string; valor: number; status: string; origem: string }[] }
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const mesCurto = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`
const ST: Record<string, string> = { rascunho: 'rascunho', pendente_aprovacao: 'esperando aprovação', aprovada: 'aprovada', paga: 'paga', lancada: 'lançada no Omie' }

export default function ComissoesAba({ tecnicosDoMes }: { tecnicosDoMes: React.ReactNode }) {
  const [quem, setQuem] = useState<'tec' | 'esc'>('tec')
  return (
    <div className="ca">
      <style>{ESTILO_CA}</style>
      <div className="ca-seg" role="tablist" aria-label="Funcionários">
        <span>Funcionários:</span>
        <button type="button" role="tab" aria-selected={quem === 'tec'} className={quem === 'tec' ? 'on' : ''} onClick={() => setQuem('tec')}><i className="fas fa-screwdriver-wrench" /> Técnicos</button>
        <button type="button" role="tab" aria-selected={quem === 'esc'} className={quem === 'esc' ? 'on' : ''} onClick={() => setQuem('esc')}><i className="fas fa-building" /> Escritório</button>
      </div>
      {quem === 'tec' ? (
        <div className="ca-corpo">
          <CaixinhaMec />
          {tecnicosDoMes}
          <JanelaEmbutida><ComissoesJanela /></JanelaEmbutida>
        </div>
      ) : <Escritorio />}
    </div>
  )
}

function Escritorio() {
  const [d, setD] = useState<{ pessoas: PessoaEsc[]; erro?: string } | null>(null)
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const r = await fetch('/api/mecanicos/comissao-escritorio', { headers: await authHeaders(), cache: 'no-store' })
        const j = await r.json()
        if (vivo) setD(r.ok ? j : { pessoas: [], erro: j.error || 'Falha ao ler o RH' })
      } catch { if (vivo) setD({ pessoas: [], erro: 'Falha ao ler o RH' }) }
    })()
    return () => { vivo = false }
  }, [])
  if (!d) return <p className="ca-mudo"><i className="fas fa-circle-notch fa-spin" /> lendo o RH…</p>
  return (
    <div className="ca-corpo">
      <p className="ca-aviso"><i className="fas fa-circle-info" /> A regra de comissão do escritório ainda vai ser definida. Por enquanto aparece a comissão que já está lançada no RH.</p>
      {d.erro && <p className="ca-erro">{d.erro}</p>}
      <div className="ca-pessoas">
        {d.pessoas.map((p) => (
          <div key={p.nome} className="ca-p">
            <div className="ca-p-cab">
              <span className="ca-ini">{p.nome.split(' ').map((x) => x[0]).slice(0, 2).join('')}</span>
              <div><b>{p.nome}</b><small>{p.rh ? [p.rh.cargo, p.rh.departamento].filter(Boolean).join(' · ') || 'no RH' : 'não achado no cadastro do RH'}</small></div>
            </div>
            {p.comissoes.length === 0 ? <p className="ca-mudo">{p.rh ? 'Nenhuma comissão lançada no RH.' : 'Sem cadastro no RH com esse nome.'}</p> : (
              <div className="ca-lista">
                {p.comissoes.map((c) => (
                  <div key={c.mes} className="ca-l" title={c.origem}>
                    <span>{mesCurto(c.mes)}</span><b>{brl2(c.valor)}</b><em className={c.status}>{ST[c.status] || c.status.replace('_', ' ')}</em>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

const ESTILO_CA = `
.ca { display: grid; gap: 14px }
.ca-seg { display: inline-flex; align-items: center; gap: 6px; justify-self: start; padding: 5px; border-radius: 99px; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb) }
.ca-seg > span { font-size: 13px; color: var(--portal-text-muted, #64748b); padding: 0 6px 0 10px }
.ca-seg button { border: 0; background: transparent; font: inherit; font-size: 14px; padding: 8px 16px; border-radius: 99px; cursor: pointer; color: var(--portal-text, #0f172a); display: inline-flex; gap: 8px; align-items: center }
.ca-seg button:hover { background: #ecfdf5 } .ca-seg button.on { background: #047857; color: #fefefe; font-weight: 600 }
.ca-corpo { display: grid; gap: 14px; animation: aaEntra .3s ease both }
.ca-aviso { margin: 0; padding: 10px 14px; border-radius: 12px; background: #fffbeb; border: 1px solid #fde68a; color: #92400e; font-size: 13.5px }
.ca-erro { margin: 0; color: #b91c1c; font-size: 13px } .ca-mudo { margin: 0; color: var(--portal-text-muted, #64748b); font-size: 13px }
.ca-pessoas { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px }
.ca-p { background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 16px; padding: 14px; display: grid; gap: 10px }
.ca-p-cab { display: flex; gap: 12px; align-items: center } .ca-p-cab div { display: grid } .ca-p-cab b { font-size: 15px } .ca-p-cab small { font-size: 12px; color: var(--portal-text-muted, #64748b) }
.ca-ini { width: 42px; height: 42px; border-radius: 50%; display: grid; place-items: center; background: #ecfdf5; color: #047857; font-weight: 700 }
.ca-lista { display: grid; gap: 4px }
.ca-l { display: grid; grid-template-columns: 60px 1fr auto; gap: 10px; align-items: center; padding: 6px 0; border-top: 1px solid var(--portal-border, #f1f5f9); font-size: 13.5px }
.ca-l b { font-weight: 600 } .ca-l em { font-style: normal; font-size: 11.5px; padding: 2px 8px; border-radius: 99px; background: #f1f5f9; color: #475569 }
.ca-l em.paga { background: #dcfce7; color: #166534 } .ca-l em.rascunho { background: #fef3c7; color: #92400e }
`
