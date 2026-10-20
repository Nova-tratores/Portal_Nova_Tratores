'use client'
// LOUSA VIRTUAL — o quadro da oficina (José, 20/10/2026; opção 2 da página de teste
// /lousa/teste): técnicos nas linhas, segunda a sábado nas colunas, cartões = OS.
// Arrastar o cartão muda o dia e o técnico NA OS; embaixo da faixa vermelha a OS fica
// pendente (a data continua; aparece na aba Pendentes do POS).
// "Calendário" = a visão antiga estilo Google Agenda (lançar folga, feriado, serviço avulso).
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import CalendarioGoogle from '@/components/agenda/CalendarioGoogle'
import QuadroLousa from '@/components/lousa/QuadroLousa'

type Vista = 'quadro' | 'calendario'

export default function LousaPage() {
  const { userProfile } = useAuth()
  const { temAcesso, loading } = usePermissoes(userProfile?.id)
  const [vista, setVista] = useState<Vista>('quadro')
  useEffect(() => {
    try { if (localStorage.getItem('lousa-vista') === 'calendario') void Promise.resolve().then(() => setVista('calendario')) } catch { /* sem storage */ }
  }, [])
  const escolher = (v: Vista) => { setVista(v); try { localStorage.setItem('lousa-vista', v) } catch { /* sem storage */ } }
  if (!loading && userProfile && !temAcesso('lousa')) return <SemPermissao />
  const aba = (v: Vista, rot: string) => (
    <button onClick={() => escolher(v)}
      style={{ padding: '6px 13px', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5,
        background: vista === v ? 'var(--portal-bg-card)' : 'transparent', color: vista === v ? 'var(--portal-text)' : 'var(--portal-text-secondary)',
        boxShadow: vista === v ? '0 1px 3px rgba(0,0,0,.12)' : 'none' }}>{rot}</button>
  )
  // a troca Quadro | Calendário fica na própria barra (sem linha em branco em cima)
  const troca = (
    <div style={{ display: 'flex', gap: 3, padding: 3, borderRadius: 10, background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)' }}>
      {aba('quadro', 'Quadro')}{aba('calendario', 'Calendário')}
    </div>
  )
  return vista === 'quadro'
    ? <div style={{ padding: '12px clamp(12px, 2vw, 24px) 40px' }}><QuadroLousa variante="semana" gravar acoes={troca} /></div>
    : (
      <div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px clamp(12px, 2vw, 24px) 0' }}>{troca}</div>
        <CalendarioGoogle modo="tecnicos" titulo="Lousa" />
      </div>
    )
}
