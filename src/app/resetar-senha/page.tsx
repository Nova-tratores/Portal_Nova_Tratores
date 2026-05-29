'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react'

export default function ResetarSenhaPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<'loading' | 'ready' | 'success' | 'error'>('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    // Supabase redireciona com tokens no hash fragment após verificar o link do email
    // O client JS do Supabase detecta automaticamente e cria a sessão
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setStatus('ready')
      }
    })

    // Fallback: se já tem sessão (token já foi processado)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setStatus('ready')
      } else {
        // Aguarda um pouco para o Supabase processar os tokens do hash
        setTimeout(() => {
          supabase.auth.getSession().then(({ data: { session: s } }) => {
            if (s) {
              setStatus('ready')
            } else {
              setStatus('error')
              setError('Link inválido ou expirado. Peça ao administrador para enviar um novo link.')
            }
          })
        }, 2000)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres')
      return
    }
    if (password !== confirmPassword) {
      setError('As senhas não coincidem')
      return
    }

    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setError('Erro ao atualizar senha: ' + updateError.message)
      setLoading(false)
    } else {
      setStatus('success')
      setLoading(false)
      // Redireciona para o login após 3 segundos
      setTimeout(() => {
        window.location.href = '/login'
      }, 3000)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#f5f5f5', fontFamily: 'Inter, sans-serif'
    }}>
      <div style={{
        width: '100%', maxWidth: '440px', padding: '48px 40px',
        background: '#fff', borderRadius: '24px',
        boxShadow: '0 8px 30px rgba(0,0,0,0.08)'
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <img
            src="/Logo_Nova.png"
            alt="Nova Tratores"
            style={{ width: '180px', marginBottom: '16px' }}
          />
          <h1 style={{ fontSize: '22px', fontWeight: '800', color: '#171717', margin: '0 0 4px 0' }}>
            Redefinir Senha
          </h1>
          <p style={{ fontSize: '13px', color: '#a3a3a3', margin: 0 }}>
            Digite sua nova senha de acesso ao portal
          </p>
        </div>

        {/* Loading */}
        {status === 'loading' && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <p style={{ color: '#a3a3a3', fontSize: '13px', letterSpacing: '2px' }}>VERIFICANDO LINK...</p>
          </div>
        )}

        {/* Error - link invalido */}
        {status === 'error' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <AlertCircle size={48} color="#dc2626" style={{ margin: '0 auto 16px' }} />
            <p style={{ fontSize: '14px', color: '#dc2626', fontWeight: '600', marginBottom: '8px' }}>
              Link expirado ou inválido
            </p>
            <p style={{ fontSize: '13px', color: '#737373', marginBottom: '24px' }}>
              {error}
            </p>
            <a
              href="/login"
              style={{
                display: 'inline-block', padding: '12px 32px', borderRadius: '12px',
                background: 'linear-gradient(135deg, #dc2626, #b91c1c)', color: '#fff',
                fontSize: '14px', fontWeight: '700', textDecoration: 'none'
              }}
            >
              Voltar ao Login
            </a>
          </div>
        )}

        {/* Success */}
        {status === 'success' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <CheckCircle size={48} color="#16a34a" style={{ margin: '0 auto 16px' }} />
            <p style={{ fontSize: '16px', color: '#16a34a', fontWeight: '700', marginBottom: '8px' }}>
              Senha alterada com sucesso!
            </p>
            <p style={{ fontSize: '13px', color: '#737373' }}>
              Redirecionando para o login...
            </p>
          </div>
        )}

        {/* Form */}
        {status === 'ready' && (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {error && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca',
                borderRadius: '12px', padding: '12px 16px',
                color: '#dc2626', fontSize: '13px', fontWeight: '500'
              }}>
                {error}
              </div>
            )}

            <div>
              <label style={{ fontSize: '12px', fontWeight: '700', color: '#525252', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>
                NOVA SENHA
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#a3a3a3' }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Mínimo 6 caracteres"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{
                    width: '100%', padding: '14px 48px 14px 48px', borderRadius: '12px',
                    border: '1px solid #e5e5e5', fontSize: '14px', color: '#171717',
                    outline: 'none', fontFamily: 'Inter', boxSizing: 'border-box'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: '#a3a3a3'
                  }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div>
              <label style={{ fontSize: '12px', fontWeight: '700', color: '#525252', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>
                CONFIRMAR SENHA
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#a3a3a3' }} />
                <input
                  type="password"
                  placeholder="Repita a nova senha"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  style={{
                    width: '100%', padding: '14px 14px 14px 48px', borderRadius: '12px',
                    border: '1px solid #e5e5e5', fontSize: '14px', color: '#171717',
                    outline: 'none', fontFamily: 'Inter', boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '16px', borderRadius: '14px', border: 'none',
                background: loading ? '#a3a3a3' : 'linear-gradient(135deg, #dc2626, #b91c1c)',
                color: '#fff', fontWeight: '700', fontSize: '15px',
                cursor: loading ? 'not-allowed' : 'pointer',
                marginTop: '8px', fontFamily: 'Inter',
                boxShadow: loading ? 'none' : '0 4px 12px rgba(220,38,38,0.3)',
                transition: 'all 0.2s'
              }}
            >
              {loading ? 'SALVANDO...' : 'SALVAR NOVA SENHA'}
            </button>
          </form>
        )}

        <p style={{
          textAlign: 'center', marginTop: '32px',
          fontSize: '11px', color: '#d4d4d4', letterSpacing: '1px'
        }}>
          NOVA TRATORES &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
