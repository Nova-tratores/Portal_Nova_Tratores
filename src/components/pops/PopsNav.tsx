'use client'
// POPs — faixa do módulo (guias). "Para aprovar" mostra quantas revisões estão comigo;
// "Áreas e papéis" só para o admin do módulo.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, ClipboardList, Library, PlayCircle, Stamp, Users } from 'lucide-react'
import { chamar, COR_POPS } from './comum'

export default function PopsNav() {
  const path = usePathname() || ''
  const [pendentes, setPendentes] = useState(0)
  const [admin, setAdmin] = useState(false)
  const [cuida, setCuida] = useState(false)   // tem o módulo ou papel numa área → vê o painel

  useEffect(() => {
    let vivo = true
    const carregar = () => chamar<{ revisoes: unknown[]; admin: boolean }>('/api/pops/revisoes')
      .then((r) => { if (vivo) { setPendentes(r.revisoes.length); setAdmin(r.admin) } })
      .catch(() => {})
    chamar<{ eu: { admin: boolean; papeis: unknown[] } }>('/api/pops/areas')
      .then((r) => { if (vivo) setCuida(r.eu.admin || r.eu.papeis.length > 0) }).catch(() => {})
    carregar()
    window.addEventListener('pops-mudou', carregar)
    return () => { vivo = false; window.removeEventListener('pops-mudou', carregar) }
  }, [])

  const guias = [
    { href: '/pops', label: 'POPs', icone: <ClipboardList size={15} />, ativa: path === '/pops' || (/^\/pops\/[0-9a-f-]{36}/.test(path)) },
    { href: '/pops/minhas', label: 'Minhas execuções', icone: <PlayCircle size={15} />, ativa: path.startsWith('/pops/minhas') },
    { href: '/pops/modelos', label: 'Modelos', icone: <Library size={15} />, ativa: path.startsWith('/pops/modelos') },
    { href: '/pops/aprovar', label: 'Para aprovar', icone: <Stamp size={15} />, ativa: path.startsWith('/pops/aprovar'), n: pendentes },
    ...(cuida || admin ? [{ href: '/pops/painel', label: 'Painel', icone: <BarChart3 size={15} />, ativa: path.startsWith('/pops/painel') }] : []),
    ...(admin ? [{ href: '/pops/areas', label: 'Áreas e papéis', icone: <Users size={15} />, ativa: path.startsWith('/pops/areas') }] : []),
  ]

  // Na execução (celular) a tela é toda do passo a passo.
  if (path.startsWith('/pops/executar')) return null

  return (
    <div style={{ background: `linear-gradient(135deg, #14b8a6, ${COR_POPS})`, padding: '10px 16px 0' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', alignItems: 'flex-end', gap: 4, overflowX: 'auto' }}>
        <span style={{ color: '#fefefe', fontWeight: 900, fontSize: 15, marginRight: 14, paddingBottom: 9, whiteSpace: 'nowrap' }}>
          Procedimentos (POP)
        </span>
        {guias.map((g) => (
          <Link key={g.href} href={g.href}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: '10px 10px 0 0',
              fontSize: 13, fontWeight: 800, textDecoration: 'none', whiteSpace: 'nowrap',
              background: g.ativa ? 'var(--portal-bg,#f6f7f9)' : 'rgba(255,255,255,.18)',
              color: g.ativa ? 'var(--portal-text,#111)' : '#111111',
            }}>
            {g.icone} {g.label}
            {'n' in g && g.n ? (
              <span style={{ background: '#dc2626', color: '#fefefe', borderRadius: 999, fontSize: 11, padding: '1px 7px' }}>{g.n}</span>
            ) : null}
          </Link>
        ))}
      </div>
    </div>
  )
}
