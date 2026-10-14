'use client'
// Sincronizações & Agendamentos — o agendador do portal (Etapa 2 do plano
// docs/omie-fila-agendador-plano.md): Omie agora, linha do tempo de hoje, lista com
// "rodar agora"/pausar/horário (só Dev), histórico e os crons que ainda estão no GitHub.
// Ver: admin ou Dev. Alterar: só Dev (a rota confere).
import { useCallback, useEffect, useState } from 'react'
import { Clock, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { authHeaders } from '@/lib/auth/client'
import OmieAgora from '@/components/agendamentos/OmieAgora'
import LinhaDoTempo from '@/components/agendamentos/LinhaDoTempo'
import TabelaAgendamentos from '@/components/agendamentos/TabelaAgendamentos'
import HistoricoExecucoes from '@/components/agendamentos/HistoricoExecucoes'
import CatalogoGithub from '@/components/agendamentos/CatalogoGithub'
import type { Painel } from '@/components/agendamentos/tipos'
import { tempoRelativo } from '@/components/agendamentos/tipos'

type Aba = 'hoje' | 'agendamentos' | 'historico' | 'github'
const ABAS: { id: Aba; rotulo: string }[] = [
  { id: 'hoje', rotulo: 'Hoje' },
  { id: 'agendamentos', rotulo: 'Agendamentos' },
  { id: 'historico', rotulo: 'Histórico' },
  { id: 'github', rotulo: 'Ainda no GitHub' },
]
const CHAVE_ABA = 'agendamentos-aba'

function abaSalva(): Aba {
  try {
    const v = localStorage.getItem(CHAVE_ABA)
    if (v && ABAS.some((a) => a.id === v)) return v as Aba
  } catch { /* sem localStorage */ }
  return 'hoje'
}

export default function AgendamentosPage() {
  const { userProfile, loading: loadingAuth } = useAuth()
  const { isAdmin, loading: loadingPerm } = usePermissoes(userProfile?.id)
  const [aba, setAba] = useState<Aba>(abaSalva)
  const [painel, setPainel] = useState<Painel | null>(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)

  const trocarAba = (a: Aba) => {
    setAba(a)
    try { localStorage.setItem(CHAVE_ABA, a) } catch { /* ok */ }
  }

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const r = await fetch('/api/agendador', { headers: await authHeaders() })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || `Erro ${r.status}`)
      setPainel(d); setErro('')
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    if (!isAdmin) return
    carregar()
    const id = setInterval(carregar, 20_000)
    return () => clearInterval(id)
  }, [isAdmin, carregar])

  if (loadingAuth || loadingPerm) return null
  if (userProfile && !isAdmin) return <SemPermissao />

  const batidaHa = painel?.batida?.batida_em ? (Date.now() - new Date(painel.batida.batida_em).getTime()) / 1000 : null
  const agendadorVivo = batidaHa != null && batidaHa < 120
  const falhas = (painel?.agendamentos || []).filter((a) => a.ultima && ['erro', 'interrompida', 'bloqueio'].includes(a.ultima.status))

  return (
    <div style={{ padding: '24px clamp(12px, 3vw, 32px)', maxWidth: 1280, margin: '0 auto' }}>
      <div style={{ marginBottom: 14, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 'clamp(22px, 5vw, 28px)', fontWeight: 800, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Clock size={26} style={{ color: '#dc2626' }} />
            Sincronizações &amp; Agendamentos
          </h2>
          {painel && !painel.migracaoFaltando && (
            <p style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, color: agendadorVivo ? '#047857' : '#b91c1c', fontWeight: 600 }}>
              {agendadorVivo ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              {agendadorVivo
                ? <>Agendador ligado · última volta {tempoRelativo(painel.batida!.batida_em)}{painel.batida?.versao ? ` · versão ${painel.batida.versao}` : ''}</>
                : <>Agendador sem sinal de vida{painel.batida?.batida_em ? ` desde ${tempoRelativo(painel.batida.batida_em)}` : ''} — os agendamentos do portal não estão rodando</>}
            </p>
          )}
        </div>
        <button
          onClick={carregar} disabled={carregando}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', fontSize: '.8rem', fontWeight: 600, cursor: carregando ? 'default' : 'pointer' }}
        >
          <RefreshCw size={14} style={carregando ? { animation: 'spin 1s linear infinite' } : undefined} />
          {carregando ? 'Atualizando…' : 'Atualizar'}
        </button>
      </div>

      {erro && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', marginBottom: 14, borderRadius: 12, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '.84rem' }}>
          <AlertTriangle size={18} /> {erro}
        </div>
      )}
      {painel?.migracaoFaltando && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', marginBottom: 14, borderRadius: 12, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: '.84rem' }}>
          <AlertTriangle size={18} /> {painel.mensagem}
        </div>
      )}
      {falhas.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', marginBottom: 14, borderRadius: 12, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '.82rem' }}>
          <AlertTriangle size={16} />
          <span><strong>{falhas.length}</strong> com problema na última execução: {falhas.map((a) => a.nome).join(', ')}.</span>
        </div>
      )}

      {painel && <OmieAgora painel={painel} />}

      <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid #e5e7eb', marginBottom: 14, overflowX: 'auto' }}>
        {ABAS.map((a) => (
          <button key={a.id} onClick={() => trocarAba(a.id)}
            style={{ padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '.84rem', fontWeight: aba === a.id ? 800 : 600, color: aba === a.id ? '#dc2626' : '#6b7280', borderBottom: aba === a.id ? '2px solid #dc2626' : '2px solid transparent', marginBottom: -2, whiteSpace: 'nowrap' }}>
            {a.rotulo}
          </button>
        ))}
      </div>

      {aba === 'hoje' && painel && <LinhaDoTempo hoje={painel.hoje} agendamentos={painel.agendamentos} />}
      {aba === 'agendamentos' && painel && <TabelaAgendamentos agendamentos={painel.agendamentos} podeAlterar={painel.podeAlterar} aoMudar={carregar} />}
      {aba === 'historico' && painel && <HistoricoExecucoes agendamentos={painel.agendamentos} />}
      {aba === 'github' && <CatalogoGithub />}

      <style>{`@keyframes spin { from { transform: rotate(0) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
