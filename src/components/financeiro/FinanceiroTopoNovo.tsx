'use client'
// Topo do Financeiro novo (José, 06/11/2026): a empresa na frente, pela logo; depois "Áreas" (o menu do
// Financeiro, em /financeiro) e as abas da área aberta (areasFinanceiro.ts). Só para Dev e função Financeiro;
// Pós-Vendas e Peças seguem com a faixa deles. A empresa vale para todas as telas (useEmpresaFinanceiro).
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { LOGO_EMPRESA_FIN, NOME_EMPRESA_FIN, useEmpresaFinanceiro } from './empresaFinanceiro'
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
        <div className="ftn-empresa" role="group" aria-label="Empresa">
          {(['nova', 'castro'] as const).map((e) => (
            <button key={e} type="button" aria-pressed={empresa === e} className={empresa === e ? 'on' : ''} onClick={() => setEmpresa(e)} title={NOME_EMPRESA_FIN[e]}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={LOGO_EMPRESA_FIN[e]} alt={NOME_EMPRESA_FIN[e]} className={`ftn-logo-${e}`} />
            </button>
          ))}
        </div>
        {/* fin-tabs-nav: escapa da regra ".portal-dark nav" (ver FinanceiroNav) */}
        <nav className="fin-tabs-nav ftn-guias">
          {guia({ nome: area ? 'Áreas' : 'Áreas do Financeiro', href: '/financeiro', fa: 'fa-table-cells-large' }, noMenu, ' ftn-areas')}
          {area && <span className="ftn-sep" aria-hidden="true" />}
          {abas.map((a) => guia(a, abaAtiva(a, pathname)))}
        </nav>
        {children && <div className="ftn-slot">{children}</div>}
      </div>
    </div>
  )
}

// #fefefe/#111111: o modo escuro não remapeia essas duas (padrão das guias)
const ESTILO = `
.ftn { position: sticky; top: 84px; z-index: 30; padding: 0 24px; background: linear-gradient(135deg, #D8F0B2, #A9D47D); box-shadow: 0 1px 4px var(--portal-shadow) }
.ftn-lin { display: flex; align-items: flex-end; gap: 10px; min-height: 56px }
.ftn-empresa { align-self: center; display: inline-flex; gap: 2px; padding: 3px; border-radius: 11px; background: rgba(255,255,255,0.5); flex-shrink: 0; margin-right: 4px }
/* os dois botões do mesmo tamanho; cada logo cabe inteira e centralizada (o T da Nova é quase quadrado, o CASTRO é comprido) */
.ftn-empresa button { width: 116px; height: 40px; display: grid; place-items: center; border: 0; background: transparent; padding: 6px 14px; border-radius: 8px; cursor: pointer; transition: background .15s }
.ftn-empresa img { width: 100%; height: 100%; object-fit: contain; display: block; filter: grayscale(1); opacity: .45; transition: filter .15s, opacity .15s }
.ftn-empresa button:hover img { opacity: .75 }
.ftn-empresa .on { background: #fefefe; box-shadow: 0 1px 2px rgba(15,23,42,.15) }
.ftn-empresa .on img { filter: none; opacity: 1 }
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
  .ftn-empresa { width: 100%; margin: 8px 0 0 } .ftn-empresa button { flex: 1; width: auto }
  .ftn-guias { flex-basis: 100% }
  .ftn-guia { padding: 10px 12px; font-size: 13px }
  .ftn-slot { order: -1; width: 100%; flex-wrap: wrap; padding-top: 8px }
}
`
