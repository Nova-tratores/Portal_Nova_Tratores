'use client'
// LOUSA VIRTUAL — agenda dos técnicos. Padrão: calendário estilo Google Agenda só com os
// técnicos (Lousa + OS do POS), o mesmo componente da Agenda coletiva. O quadro antigo
// (técnico × dia × manhã/tarde, com conferência de OS/PPV e aviso de peças) segue em "Quadro clássico".
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { CalendarDays, LayoutGrid } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import CalendarioGoogle from '@/components/agenda/CalendarioGoogle'
import LousaClassica from '@/components/lousa/LousaClassica'

type Modo = 'agenda' | 'classica'

export default function LousaPage() {
  const { userProfile } = useAuth()
  const { temAcesso, loading } = usePermissoes(userProfile?.id)
  const [modo, setModo] = useState<Modo>('agenda')
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- preferência guardada no navegador
    try { if (localStorage.getItem('lousa-modo') === 'classica') setModo('classica') } catch { /* sem storage */ }
  }, [])
  const trocar = (m: Modo) => { setModo(m); try { localStorage.setItem('lousa-modo', m) } catch { /* sem storage */ } }

  if (!loading && userProfile && !temAcesso('lousa')) return <SemPermissao />

  const botao = (m: Modo, rotulo: string, icone: React.ReactNode) => (
    <button onClick={() => trocar(m)} aria-pressed={modo === m}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer',
        border: modo === m ? '1px solid #1a73e8' : '1px solid var(--portal-border,#dadce0)',
        background: modo === m ? 'rgba(26,115,232,.1)' : 'var(--portal-surface,#fff)', color: modo === m ? '#1a73e8' : 'var(--portal-text,#3c4043)',
      }}>{icone} {rotulo}</button>
  )
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderBottom: '1px solid var(--portal-border,#dadce0)', background: 'var(--portal-surface,#fff)' }}>
        {botao('agenda', 'Agenda', <CalendarDays size={15} />)}
        {botao('classica', 'Quadro clássico', <LayoutGrid size={15} />)}
        <span style={{ fontSize: 12, color: 'var(--portal-text-muted,#70757a)', marginLeft: 6 }}>
          {modo === 'agenda' ? 'Os técnicos também aparecem na Agenda coletiva da Central de Trabalho.' : 'Quadro antigo: confere OS/PPV de cada serviço e configura o aviso de peças.'}
        </span>
      </div>
      {modo === 'agenda' ? <CalendarioGoogle modo="tecnicos" titulo="Lousa" /> : <LousaClassica />}
    </div>
  )
}
