'use client'
import { Shield } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function SemPermissao() {
  const router = useRouter()
  return (
    <div className="semperm" style={{
      minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontFamily: 'Inter, sans-serif'
    }}>
      {/* Celular: cabe na tela sem rolar (barra do topo é 60px) e o botão vira alvo grande */}
      <style>{`@media (max-width: 768px){.semperm{min-height:calc(100dvh - var(--portal-header-h, 60px)) !important;padding:0 16px}.semperm h2{font-size:21px !important}.semperm p{margin-bottom:24px !important}.semperm button{width:100%;min-height:48px;font-size:15px !important}}`}</style>
      <div style={{ textAlign: 'center', maxWidth: '420px', padding: 'clamp(20px, 6vw, 40px)' }}>
        <div style={{
          width: '80px', height: '80px', borderRadius: '20px', margin: '0 auto 24px',
          background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <Shield size={36} color="#dc2626" />
        </div>
        <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1a1a1a', marginBottom: '12px' }}>
          Acesso Restrito
        </h2>
        <p style={{ fontSize: '14px', color: '#a3a3a3', lineHeight: '1.7', marginBottom: '32px' }}>
          Você não tem permissão para acessar este módulo. Solicite acesso ao administrador do sistema.
        </p>
        <button
          onClick={() => router.push('/dashboard')}
          style={{
            background: 'linear-gradient(135deg, #dc2626, #b91c1c)', color: '#fff',
            border: 'none', padding: '12px 32px', borderRadius: '12px',
            fontSize: '14px', fontWeight: '600', cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(220,38,38,0.3)', transition: '0.2s'
          }}
        >
          Voltar ao Dashboard
        </button>
      </div>
    </div>
  )
}
