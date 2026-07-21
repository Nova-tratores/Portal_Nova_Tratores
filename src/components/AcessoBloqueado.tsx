'use client'
// Tela de bloqueio para quando o portal não tem um utilizador de verdade para mostrar.
// Existe para nunca renderizar o portal meio a funcionar com perfil vazio — que era o
// que produzia o "Usuário / Colaborador" genérico, com menu encolhido, a fingir um login.
//
// A causa muda a mensagem: sessão morta e conta sem perfil são problemas diferentes e
// a pessoa do outro lado precisa de saber qual é o dela.
import { useState } from 'react'
import { LogIn } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { MotivoBloqueio } from '@/hooks/useAuth'

const TEXTOS: Record<MotivoBloqueio, { titulo: string; descricao: string; botao: string }> = {
  expirada: {
    titulo: 'Sua sessão expirou',
    descricao: 'Não foi possível confirmar o seu login. Por segurança, entre novamente — você volta para a página em que estava.',
    botao: 'ENTRAR NOVAMENTE',
  },
  'sem-perfil': {
    titulo: 'Conta sem acesso ao portal',
    descricao: 'O seu login funcionou, mas esta conta não tem um perfil configurado. Peça a um administrador para liberar o seu acesso.',
    botao: 'SAIR',
  },
  erro: {
    titulo: 'Não foi possível carregar o seu perfil',
    descricao: 'Pode ter sido uma falha de ligação. Tente novamente; se continuar, avise um administrador.',
    botao: 'TENTAR NOVAMENTE',
  },
}

export default function AcessoBloqueado({ motivo }: { motivo: MotivoBloqueio }) {
  const [ocupado, setOcupado] = useState(false)
  const texto = TEXTOS[motivo]

  const agir = async () => {
    setOcupado(true)
    if (motivo === 'erro') { window.location.reload(); return }
    const destino = window.location.pathname + window.location.search
    // signOut limpa o token podre do localStorage; sem isto o /login vê "sessão"
    // e devolve a pessoa pro portal, direto de volta pra esta tela.
    try { await supabase.auth.signOut() } catch { /* segue mesmo assim */ }
    window.location.replace(
      motivo === 'sem-perfil' ? '/login' : `/login?redirect_to=${encodeURIComponent(destino)}`,
    )
  }

  return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--portal-bg)', padding: '24px',
    }}>
      <div style={{ textAlign: 'center', maxWidth: '380px' }}>
        <div style={{
          width: '48px', height: '48px', borderRadius: '14px', margin: '0 auto 24px',
          background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
        }} />
        <h1 style={{
          fontSize: '20px', fontWeight: 700, color: 'var(--portal-text)',
          margin: '0 0 10px', fontFamily: 'Inter',
        }}>
          {texto.titulo}
        </h1>
        <p style={{
          fontSize: '14px', lineHeight: 1.6, color: 'var(--portal-text-muted)',
          margin: '0 0 28px', fontFamily: 'Inter',
        }}>
          {texto.descricao}
        </p>
        <button
          onClick={agir}
          disabled={ocupado}
          className="btn-primary"
          style={{
            padding: '14px 28px', borderRadius: '14px', border: 'none', color: '#fff',
            fontWeight: 700, fontSize: '14px', fontFamily: 'Inter',
            cursor: ocupado ? 'not-allowed' : 'pointer', opacity: ocupado ? 0.7 : 1,
          }}
        >
          <LogIn size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '8px' }} />
          {ocupado ? 'AGUARDE...' : texto.botao}
        </button>
      </div>
    </div>
  )
}
