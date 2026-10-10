'use client'
// POPs — "Para aprovar": revisões que estão comigo (o aprovador pode não ter a
// Central de Trabalho; aqui ele decide sem precisar dela). Admin vê todas.
export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Stamp } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { COR_POPS, botao, br, cartao, chamar, pagina, primeiroNome, vazio, type UsuarioMapa } from '@/components/pops/comum'

interface Rev {
  ticket_id: string; numero_ticket: number; changelog: string; solicitante_id: string; responsavel_id: string; criado_em: string
  pop_id: string; versao_id: string; versao_numero: number; pop: { codigo: string; titulo: string } | null
}

export default function Aprovar() {
  const { userProfile } = useAuth()
  const [todas, setTodas] = useState(false)
  const [dados, setDados] = useState<{ revisoes: Rev[]; usuarios: UsuarioMapa; admin: boolean } | null>(null)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    try { const r = await chamar<{ revisoes: Rev[]; usuarios: UsuarioMapa; admin: boolean }>(`/api/pops/revisoes${todas ? '?todas=1' : ''}`); setDados(r) } catch (e) { setErro((e as Error).message) }
  }, [todas])
  // carregar ao montar/trocar o filtro: o setState vem depois do fetch (padrão do portal, ver CentralNav)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (userProfile) carregar() }, [carregar, userProfile])

  const nome = (u: string) => primeiroNome(dados?.usuarios[u]?.nome)
  return (
    <div style={pagina}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <p style={{ margin: 0, flex: 1, fontSize: 14, color: 'var(--portal-text-secondary,#555)' }}>
          Versões enviadas para você aprovar. Abra, leia o que mudou e aprove ou devolva com o motivo.
        </p>
        {dados?.admin && (
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, fontWeight: 600 }}>
            <input type="checkbox" checked={todas} onChange={(e) => setTodas(e.target.checked)} /> Todas as áreas (admin)
          </label>
        )}
      </div>
      {erro && <div style={{ ...cartao, color: '#dc2626', marginBottom: 12 }}>{erro}</div>}
      {!dados ? <div style={vazio}>Carregando…</div> : !dados.revisoes.length ? (
        <div style={vazio}>Nada esperando aprovação. 👍</div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {dados.revisoes.map((r) => (
            <div key={r.ticket_id} style={{ ...cartao, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', borderLeft: '4px solid #d97706' }}>
              <Stamp size={18} style={{ color: '#d97706' }} />
              <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                <div style={{ fontWeight: 800 }}>
                  <span style={{ fontFamily: 'ui-monospace,monospace', color: COR_POPS }}>{r.pop?.codigo}</span> v{r.versao_numero} · {r.pop?.titulo}
                </div>
                <div style={{ fontSize: 13, color: 'var(--portal-text-secondary,#555)', whiteSpace: 'pre-wrap' }}>{r.changelog}</div>
                <div style={{ fontSize: 12, color: 'var(--portal-text-muted,#888)', marginTop: 4 }}>
                  enviada por {nome(r.solicitante_id)} em {br(r.criado_em.slice(0, 10))}
                  {todas && <> · com {nome(r.responsavel_id)}</>}
                </div>
              </div>
              <Link href={`/pops/${r.pop_id}?versao=${r.versao_id}`} style={{ ...botao(COR_POPS), textDecoration: 'none' }}>Revisar</Link>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
