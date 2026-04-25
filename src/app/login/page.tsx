'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Mail, Lock, User, Briefcase, Camera, LogIn, UserPlus, Eye, EyeOff
} from 'lucide-react'

const DOMINIOS_PERMITIDOS = ['.novatratores.com'];

function isExternalRedirect(url: string): boolean {
  try {
    const u = new URL(url);
    return DOMINIOS_PERMITIDOS.some(d => u.hostname.endsWith(d)) && u.origin !== window.location.origin;
  } catch { return false; }
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [nome, setNome] = useState('')
  const [funcao, setFuncao] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState('')
  const [isRegistering, setIsRegistering] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect_to') || ''

  const redirectComToken = useCallback(async (redirectUrl: string) => {
    if (isExternalRedirect(redirectUrl)) {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token && session?.refresh_token) {
        const u = new URL(redirectUrl)
        const authUrl = `${u.origin}/auth/token?access_token=${session.access_token}&refresh_token=${session.refresh_token}&redirect_to=${encodeURIComponent(u.pathname + u.search)}`
        window.location.href = authUrl
        return
      }
    }
    router.push(redirectUrl)
  }, [router])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        if (redirectTo) {
          redirectComToken(redirectTo)
        } else {
          router.push('/dashboard')
        }
      }
    })
  }, [router, redirectTo, redirectComToken])

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setAvatarFile(file)
      // Revogar URL anterior para evitar memory leak
      if (avatarPreview) URL.revokeObjectURL(avatarPreview)
      setAvatarPreview(URL.createObjectURL(file))
    }
  }

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (isRegistering) {
      if (password !== confirmPassword) {
        setError('As senhas não coincidem!')
        setLoading(false)
        return
      }
      if (password.length < 6) {
        setError('A senha deve ter pelo menos 6 caracteres')
        setLoading(false)
        return
      }

      const { data, error: authError } = await supabase.auth.signUp({ email, password })

      if (authError) {
        setError('Erro no cadastro: ' + authError.message)
      } else if (data.user) {
        let avatarUrl = ''

        if (avatarFile) {
          const fileExt = avatarFile.name.split('.').pop()
          const fileName = `${data.user.id}-${Math.random().toString(36).slice(2)}.${fileExt}`
          const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, avatarFile)

          if (!uploadError) {
            const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName)
            avatarUrl = urlData.publicUrl
          }
        }

        const { error: dbError } = await supabase
          .from('financeiro_usu')
          .insert([{
            id: data.user.id,
            nome,
            funcao,
            avatar_url: avatarUrl,
            email
          }])

        if (dbError) {
          setError('Erro ao salvar perfil: ' + dbError.message)
        } else {
          // Cria registro de permissões vazio (sem acesso até admin liberar)
          await supabase.from('portal_permissoes').insert([{
            user_id: data.user.id,
            is_admin: false,
            categoria: '',
            modulos_permitidos: []
          }])
          setIsRegistering(false)
          setError('')
          alert('Conta criada com sucesso! Faça login.')
        }
      }
    } else {
      const { data: loginData, error: authError } = await supabase.auth.signInWithPassword({ email, password })
      if (!authError && loginData?.user) {
        // Atualizar email no perfil (popula usuários antigos)
        await supabase.from('financeiro_usu').update({ email }).eq('id', loginData.user.id)
        await redirectComToken(redirectTo || '/dashboard')
      } else {
        setError('E-mail ou senha incorretos.')
      }
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      background: '#ffffff', position: 'relative', overflow: 'hidden'
    }}>
      {/* LEFT SIDE - Image */}
      <div style={{
        flex: 1, position: 'relative', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden', minHeight: '100vh'
      }}>
        <img
          src="/Trator2.jpg"
          alt="Trator"
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%', objectFit: 'cover'
          }}
        />
        {/* Overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(135deg, rgba(220,38,38,0.7) 0%, rgba(127,29,29,0.85) 100%)'
        }} />
        {/* Content over image */}
        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '40px' }}>
          <img
            src="/Logo_Nova.png"
            alt="Nova Tratores"
            style={{ width: '280px', marginBottom: '30px', filter: 'brightness(0) invert(1)' }}
          />
          <p style={{
            color: 'rgba(255,255,255,0.85)', fontSize: '18px', fontWeight: '400',
            maxWidth: '400px', lineHeight: '1.7'
          }}>
            Portal Corporativo de Gestão Integrada
          </p>
        </div>
      </div>

      {/* RIGHT SIDE - Form */}
      <div style={{
        width: '520px', minHeight: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px', background: '#ffffff',
        boxShadow: '-10px 0 40px rgba(0,0,0,0.05)'
      }}>
        <div style={{ width: '100%', maxWidth: '400px' }}>
          {/* Logo mobile */}
          <div style={{ textAlign: 'center', marginBottom: '36px' }}>
            <img
              src="/Logo_Nova.png"
              alt="Nova Tratores"
              style={{ width: '200px', marginBottom: '12px' }}
            />
            <p style={{
              fontSize: '12px', color: '#a3a3a3', fontWeight: '500',
              letterSpacing: '3px', textTransform: 'uppercase'
            }}>
              Acesso Corporativo
            </p>
          </div>

          {/* Tabs */}
          <div style={{
            display: 'flex', gap: '4px', marginBottom: '28px',
            background: '#f5f5f5', borderRadius: '12px', padding: '4px'
          }}>
            <button
              onClick={() => { setIsRegistering(false); setError('') }}
              style={{
                flex: 1, padding: '12px', borderRadius: '10px', border: 'none',
                cursor: 'pointer', fontWeight: '600', fontSize: '14px', fontFamily: 'Inter',
                transition: 'all 0.3s',
                background: !isRegistering ? 'linear-gradient(135deg, #dc2626, #b91c1c)' : 'transparent',
                color: !isRegistering ? '#fff' : '#a3a3a3'
              }}
            >
              <LogIn size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '8px' }} />
              Entrar
            </button>
            <button
              onClick={() => { setIsRegistering(true); setError('') }}
              style={{
                flex: 1, padding: '12px', borderRadius: '10px', border: 'none',
                cursor: 'pointer', fontWeight: '600', fontSize: '14px', fontFamily: 'Inter',
                transition: 'all 0.3s',
                background: isRegistering ? 'linear-gradient(135deg, #dc2626, #b91c1c)' : 'transparent',
                color: isRegistering ? '#fff' : '#a3a3a3'
              }}
            >
              <UserPlus size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '8px' }} />
              Cadastrar
            </button>
          </div>

          {error && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: '12px', padding: '12px 16px', marginBottom: '20px',
              color: '#dc2626', fontSize: '13px', fontWeight: '500'
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {isRegistering && (
              <>
                <label style={{
                  cursor: 'pointer', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', gap: '8px', marginBottom: '4px'
                }}>
                  <div style={{
                    width: '80px', height: '80px', borderRadius: '50%',
                    background: '#fef2f2', border: '2px dashed #fecaca',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden', transition: 'all 0.3s'
                  }}>
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <Camera size={24} color="#dc2626" />
                    )}
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: '600', color: '#dc2626', letterSpacing: '1px' }}>
                    ADICIONAR FOTO
                  </span>
                  <input type="file" hidden accept="image/*" onChange={handleAvatarChange} />
                </label>

                <div style={{ position: 'relative' }}>
                  <User size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#a3a3a3' }} />
                  <input type="text" placeholder="Nome Completo" required className="input-portal" value={nome} onChange={(e) => setNome(e.target.value)} />
                </div>

                <div style={{ position: 'relative' }}>
                  <Briefcase size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#a3a3a3', zIndex: 1 }} />
                  <select required className="input-portal" style={{ appearance: 'none', cursor: 'pointer' }} value={funcao} onChange={(e) => setFuncao(e.target.value)}>
                    <option value="">Selecione sua função</option>
                    <option value="Financeiro">Financeiro</option>
                    <option value="Pós-Vendas">Pós-Vendas</option>
                    <option value="Vendas">Vendas</option>
                    <option value="Técnico">Técnico</option>
                    <option value="Diretoria">Diretoria</option>
                  </select>
                </div>
              </>
            )}

            <div style={{ position: 'relative' }}>
              <Mail size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#a3a3a3' }} />
              <input type="email" placeholder="E-mail Corporativo" required className="input-portal" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>

            <div style={{ position: 'relative' }}>
              <Lock size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#a3a3a3' }} />
              <input type={showPassword ? 'text' : 'password'} placeholder="Senha" required className="input-portal" value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" onClick={() => setShowPassword(!showPassword)} style={{
                position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', color: '#a3a3a3'
              }}>
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {isRegistering && (
              <div style={{ position: 'relative' }}>
                <Lock size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#a3a3a3' }} />
                <input type="password" placeholder="Confirmar Senha" required className="input-portal" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary" style={{
              padding: '18px', borderRadius: '14px', border: 'none',
              color: '#fff', fontWeight: '700', fontSize: '15px',
              cursor: loading ? 'not-allowed' : 'pointer',
              marginTop: '8px', fontFamily: 'Inter',
              opacity: loading ? 0.7 : 1
            }}>
              {loading ? 'PROCESSANDO...' : (isRegistering ? 'CRIAR CONTA' : 'ACESSAR PORTAL')}
            </button>
          </form>

          <p style={{
            textAlign: 'center', marginTop: '32px',
            fontSize: '11px', color: '#d4d4d4', letterSpacing: '1px'
          }}>
            NOVA TRATORES &copy; {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  )
}
