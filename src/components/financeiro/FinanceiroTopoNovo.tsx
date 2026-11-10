'use client'
// Topo do Financeiro novo (José, 06/11/2026): "Áreas" (o menu do Financeiro, em /financeiro) e as abas da área
// aberta (areasFinanceiro.ts); a empresa fica no LADO DIREITO da faixa, em texto, NOVA vermelha e CASTRO azul
// (09/11/2026 — as duas logos lado a lado ficavam desencontradas). Só para Dev e função Financeiro;
// Pós-Vendas e Peças seguem com a faixa deles. A empresa vale para todas as telas (useEmpresaFinanceiro).
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { NOME_EMPRESA_FIN, useEmpresaFinanceiro } from './empresaFinanceiro'
import { abaAtiva, abasVisiveis, areaDoEndereco, type AbaArea } from './areasFinanceiro'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'

export default function FinanceiroTopoNovo({ comNotas, children }: { comNotas: boolean; children?: ReactNode }) {
  const pathname = usePathname() || ''
  const [empresa, setEmpresa] = useEmpresaFinanceiro()
  const area = areaDoEndereco(pathname)
  const { userProfile } = useAuth()
  const { pode } = usePermissoes(userProfile?.id)
  // Notas fiscais vale pela permissão financeiro:notas, como na faixa antiga
  const abas = abasVisiveis(area?.abas || [], comNotas, pode)
  const noMenu = pathname === '/financeiro'

  const guia = (a: AbaArea, on: boolean, extra = '') => (
    <Link key={a.href} href={a.href} className={`ftn-guia${on ? ' on' : ''}${extra}`} aria-current={on ? 'page' : undefined}>
      <i className={`fa-solid ${a.fa}`} /> {a.nome}
    </Link>
  )

  return (
    <div className="fin-band-verde ftn">
      <style>{ESTILO}</style>
      <div className="ftn-lin">
        {/* fin-tabs-nav: escapa da regra ".portal-dark nav" (ver FinanceiroNav) */}
        <nav className="fin-tabs-nav ftn-guias">
          {guia({ nome: area ? 'Áreas' : 'Áreas do Financeiro', href: '/financeiro', fa: 'fa-table-cells-large' }, noMenu, ' ftn-areas')}
          {area && <span className="ftn-sep" aria-hidden="true" />}
          {abas.map((a) => guia(a, abaAtiva(a, pathname)))}
        </nav>
        {children && <div className="ftn-slot">{children}</div>}
        <div className="ftn-empresa" role="group" aria-label="Empresa">
          {(['nova', 'castro'] as const).map((e) => (
            <button key={e} type="button" aria-pressed={empresa === e} className={`ftn-emp-${e}${empresa === e ? ' on' : ''}`} onClick={() => setEmpresa(e)} title={`Ver o Financeiro da ${NOME_EMPRESA_FIN[e]}`}>
              {e === 'nova' ? 'NOVA' : 'CASTRO'}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// #fefefe/#111111: o modo escuro não remapeia essas duas (padrão das guias)
const ESTILO = `
.ftn { position: sticky; top: 84px; z-index: 30; padding: 0 24px; background: linear-gradient(135deg, #D8F0B2, #A9D47D); box-shadow: 0 1px 4px var(--portal-shadow) }
.ftn-lin { display: flex; align-items: flex-end; gap: 10px; min-height: 56px }
.ftn-empresa { align-self: center; display: inline-flex; gap: 3px; padding: 3px; border-radius: 11px; background: rgba(255,255,255,0.55); flex-shrink: 0; margin-left: auto }
/* NOVA vermelha, CASTRO azul: a escolhida fica cheia (letra #fefefe, que o modo escuro não remapeia), a outra só com a letra na cor */
.ftn-empresa button { --c: #dc2626; min-width: 92px; height: 36px; padding: 0 16px; border: 0; border-radius: 8px; background: transparent; color: var(--c); font: 800 14px/1 inherit; letter-spacing: .06em; cursor: pointer; transition: background .15s, color .15s, box-shadow .15s }
.ftn-empresa .ftn-emp-castro { --c: #2563eb }
.ftn-empresa button:hover { background: color-mix(in srgb, var(--c) 12%, transparent) }
.ftn-empresa button.on { background: var(--c); color: #fefefe; box-shadow: 0 1px 3px rgba(15,23,42,.25) }
.ftn-empresa button:focus-visible { outline: 2px solid var(--c); outline-offset: 2px }
.ftn-guias { display: flex; align-items: flex-end; gap: 3px; flex: 1; min-width: 0; overflow-x: auto; -webkit-overflow-scrolling: touch }
.ftn-guia { display: inline-flex; align-items: center; gap: 8px; padding: 11px 18px; border-radius: 11px 11px 0 0; font-size: 15px; white-space: nowrap; flex-shrink: 0; color: #111111; background: rgba(255,255,255,0.45); text-decoration: none; transition: background .15s }
.ftn-guia i { font-size: 14px }
.ftn-guia:hover { background: rgba(255,255,255,0.7) }
.ftn-guia.on { background: #fefefe; box-shadow: 0 -2px 6px rgba(0,0,0,0.15) }
.ftn-areas:not(.on) { background: rgba(255,255,255,0.25) }
.ftn-sep { align-self: center; width: 1px; height: 26px; margin: 0 6px; background: rgba(17,17,17,.18); flex-shrink: 0 }
.ftn-slot { align-self: center; display: flex; align-items: center; gap: 8px; flex-shrink: 0 }
@media (max-width: 767px) {
  .ftn { padding: 0 12px }
  .ftn-lin { flex-wrap: wrap; gap: 6px; min-height: 48px }
  .ftn-empresa { order: -2; width: 100%; margin: 8px 0 0 } .ftn-empresa button { flex: 1; min-width: 0 }
  .ftn-guias { flex-basis: 100% }
  .ftn-guia { padding: 10px 12px; font-size: 13px }
  .ftn-slot { order: -1; width: 100%; flex-wrap: wrap; padding-top: 8px }
}
`
