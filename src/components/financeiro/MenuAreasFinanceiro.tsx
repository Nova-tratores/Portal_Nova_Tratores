'use client'
// Menu de áreas do Financeiro (José, 06/11/2026: "um menu dentro do financeiro, com áreas, tipo a dashboard").
// Só para Dev e função Financeiro; cada cartão abre a primeira aba da área, e as abas aparecem embaixo para ir direto.
import Link from 'next/link'
import FinanceiroNav from '@/components/financeiro/FinanceiroNav'
import { AREAS_FINANCEIRO, abasVisiveis } from './areasFinanceiro'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'

export default function MenuAreasFinanceiro({ comNotas }: { comNotas: boolean }) {
  return (
    <div style={{ minHeight: 'calc(100vh - 84px)', background: 'var(--portal-bg-secondary)' }}>
      <FinanceiroNav />
      <style>{ESTILO}</style>
      <div className="mfa">
        <GradeAreasAtual comNotas={comNotas} />
      </div>
    </div>
  )
}

/** A grade de cartões do menu de áreas. */
export function GradeAreasAtual({ comNotas }: { comNotas: boolean }) {
  const { userProfile } = useAuth()
  const { pode } = usePermissoes(userProfile?.id)
  return (
    <>
      <style>{ESTILO}</style>
  <div className="mfa-grade">
    {AREAS_FINANCEIRO.map((area, i) => {
      const abas = abasVisiveis(area.abas, comNotas, pode)
      if (!abas.length) return null // nenhuma aba desta área liberada no Admin
      return (
        <section key={area.id} className={`mfa-card${area.largo ? ' mfa-largo' : ''}`} style={{ ['--c' as string]: area.cor, animationDelay: `${i * 40}ms` }}>
          <Link href={abas[0].href} className="mfa-topo">
            <span className="mfa-ico"><i className={`fa-solid fa-fw ${area.fa}`} /></span>
            <span className="mfa-txt">
              <span className="mfa-nome">{area.nome}</span>
              <span className="mfa-desc">{area.descricao}</span>
            </span>
          </Link>
          <div className="mfa-telas">
            {area.emMontagem
              ? <Link href={abas[0].href} className="mfa-montagem"><i className="fa-solid fa-fw fa-person-digging" />em montagem<i className="fa-solid fa-chevron-right mfa-seta" /></Link>
              : abas.map((a) => <Link key={a.href} href={a.href}><i className={`fa-solid fa-fw ${a.fa}`} />{a.nome}<i className="fa-solid fa-chevron-right mfa-seta" /></Link>)}
          </div>
        </section>
      )
    })}
  </div>
    </>
  )
}

// Tudo alinhado (José, 06/11/2026: "tá tudo desalinhado"): cartões da mesma altura na linha, cabeçalho de altura fixa
// (descrição sempre em 2 linhas), as telas uma por linha começando na mesma altura em todos, ícones da mesma largura
// (fa-fw) e nada sobe ao passar o mouse.
const ESTILO = `
.mfa { padding: clamp(12px, 2vw, 28px) }
.mfa-grade { display: grid; gap: 14px; grid-template-columns: repeat(4, minmax(0, 1fr)); align-items: stretch }
.mfa-largo { grid-column: span 2 } .mfa-largo .mfa-telas { grid-template-columns: 1fr 1fr } .mfa-largo .mfa-telas a:nth-child(odd) { border-right: 1px solid var(--border, #e2e8f0) }
.mfa-largo .mfa-telas a:nth-last-child(2):nth-child(odd) { border-bottom: 0 }
@media (max-width: 1199px) { .mfa-grade { grid-template-columns: repeat(2, minmax(0, 1fr)) } }
@media (max-width: 639px) { .mfa-grade { grid-template-columns: minmax(0, 1fr) } .mfa-largo { grid-column: auto } .mfa-largo .mfa-telas { grid-template-columns: 1fr } .mfa-largo .mfa-telas a:nth-child(odd) { border-right: 0 } .mfa-largo .mfa-telas a:nth-last-child(2):nth-child(odd) { border-bottom: 1px solid var(--border, #e2e8f0) } }
.mfa-card { display: flex; flex-direction: column; background: var(--surface, #fefefe); border: 1px solid var(--border, #e2e8f0); border-radius: 16px; overflow: hidden; transition: border-color .2s, box-shadow .2s; animation: mfa-entra .35s ease both }
.mfa-card:hover { border-color: color-mix(in srgb, var(--c) 45%, var(--border, #e2e8f0)); box-shadow: 0 12px 26px -20px rgba(15,23,42,.5) }
.mfa-topo { display: flex; align-items: flex-start; gap: 14px; padding: 16px 16px 14px; color: var(--portal-text, #0f172a); text-decoration: none }
.mfa-ico { width: 44px; height: 44px; flex-shrink: 0; display: grid; place-items: center; border-radius: 12px; font-size: 18px; color: #fefefe; background: var(--c) }
.mfa-txt { flex: 1; min-width: 0; display: grid; gap: 2px }
.mfa-nome { font-size: 17px; line-height: 22px }
.mfa-desc { font-size: 13.5px; line-height: 19px; height: 38px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; color: var(--portal-text-secondary, #475569) }
.mfa-telas { display: grid; align-content: start; flex: 1; border-top: 1px solid var(--border, #e2e8f0) }
.mfa-telas a { display: flex; align-items: center; gap: 10px; height: 44px; white-space: nowrap; overflow: hidden; padding: 0 16px; font-size: 14.5px; color: var(--portal-text, #0f172a); text-decoration: none; border-bottom: 1px solid var(--border, #e2e8f0); transition: background .15s, color .15s }
.mfa-telas a:last-child { border-bottom: 0 }
.mfa-telas a > i:first-child { color: var(--c); font-size: 13px }
.mfa-telas a:hover { background: color-mix(in srgb, var(--c) 6%, transparent); color: var(--c) }
.mfa-seta { margin-left: auto; font-size: 11px; color: var(--portal-text-muted, #94a3b8) }
.mfa-telas .mfa-montagem { color: #7c3aed } .mfa-telas .mfa-montagem > i:first-child { color: #7c3aed }
@keyframes mfa-entra { from { opacity: 0 } }
@media (prefers-reduced-motion: reduce) { .mfa-card { animation: none; transition: none } }
`
