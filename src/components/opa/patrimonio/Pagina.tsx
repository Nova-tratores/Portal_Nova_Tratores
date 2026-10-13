'use client'
// Moldura das páginas do Patrimônio Loja: barra do Opa + trava do módulo
// 'patrimonio' (liberado/bloqueado na Administração; Admin/Dev sempre).

import SemPermissao from '@/components/SemPermissao'
import { Moldura } from '../pecas/Moldura'
import { SECAO } from '../pecas/comum'
import { useBasePat, type BasePat } from './comum'

export default function PaginaPatrimonio({ children }: { children: (base: BasePat) => React.ReactNode }) {
  const base = useBasePat()
  return (
    <Moldura podeGerir={false}>
      {base.carregandoPermissao
        ? <div style={{ ...SECAO, alignItems: 'center', color: 'var(--portal-text-muted)' }}>Carregando…</div>
        : base.pode ? children(base) : <SemPermissao />}
    </Moldura>
  )
}
