'use client'
import { useEffect, useState, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { authHeaders } from '@/lib/auth/client'
import { useRouter, useSearchParams } from 'next/navigation'
import FinanceiroNav from '@/components/financeiro/FinanceiroNav'
import { User, Volume2, Palette, Camera, Save, Play, CheckCircle2, Moon, Sun, Mail } from 'lucide-react'

function ConfiguracoesContent() {
  const searchParams = useSearchParams()
  const initialTab = searchParams.get('tab') || 'perfil'
  
  const [tab, setTab] = useState(initialTab)
  const [userProfile, setUserProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const router = useRouter()

  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [somSelecionado, setSomSelecionado] = useState('som-notificacao-1.mp3.mp3')
  const [temaSelecionado, setTemaSelecionado] = useState('claro')

  // E-mail de envio (remetente por usuário)
  const [envioProvedor, setEnvioProvedor] = useState('gmail')
  const [envioEmail, setEnvioEmail] = useState('')
  const [envioSenha, setEnvioSenha] = useState('')
  const [envioHost, setEnvioHost] = useState('')
  const [envioPort, setEnvioPort] = useState('')
  const [envioSecure, setEnvioSecure] = useState(true)
  const [envioConfigurado, setEnvioConfigurado] = useState(false)
  const [envioSalvando, setEnvioSalvando] = useState(false)
  const [envioMsg, setEnvioMsg] = useState(null)

  const sonsDisponiveis = [
    { id: 'som-notificacao-1.mp3.mp3', nome: 'Alerta Clássico 1', desc: 'Som curto e elegante' },
    { id: 'som-notificacao-2.mp3.mp3', nome: 'Alerta Moderno 2', desc: 'Som melódico e suave' },
    { id: 'som-notificacao-3.mp3.mp3', nome: 'Alerta Ativo 3', desc: 'Som de maior destaque' },
  ]

  useEffect(() => {
    const carregarDados = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return router.push('/login')

      const { data: prof } = await supabase.from('financeiro_usu').select('*').eq('id', session.user.id).single()
      
      setUserProfile(prof)
      setNome(prof?.nome || '')
      setEmail(session.user.email || '')
      setAvatarUrl(prof?.avatar_url || '')
      setSomSelecionado(prof?.som_notificacao || 'som-notificacao-1.mp3.mp3')
      setTemaSelecionado(prof?.tema || 'claro')
      
      document.documentElement.setAttribute('data-theme', prof?.tema || 'claro');

      // Config do e-mail de envio (remetente) — só status, sem a senha.
      try {
        const r = await fetch('/api/financeiro/config-envio', { headers: { ...(await authHeaders()) } })
        const c = await r.json()
        if (c && !c.error) {
          setEnvioConfigurado(!!c.configurado)
          setEnvioEmail(c.email_envio || '')
          setEnvioHost(c.smtp_host || '')
          setEnvioPort(c.smtp_port ? String(c.smtp_port) : '')
          setEnvioSecure(c.smtp_secure !== false)
          const h = (c.smtp_host || '').toLowerCase()
          if (h.includes('gmail')) setEnvioProvedor('gmail')
          else if (h.includes('office365') || h.includes('outlook')) setEnvioProvedor('outlook')
          else if (h) setEnvioProvedor('outro')
        }
      } catch {}

      setLoading(false)
    }
    carregarDados()
  }, [router])

  const tocarPrevia = (nomeSom) => {
    try {
      const audio = new Audio(`/${nomeSom}`);
      audio.play().catch(e => console.error(e));
      setSomSelecionado(nomeSom);
    } catch (error) { console.error(error); }
  }

  const mudarTemaLocal = (novoTema) => {
    setTemaSelecionado(novoTema);
    document.documentElement.setAttribute('data-theme', novoTema);
  }

  const handleUpdatePerfil = async (e) => {
    if (e) e.preventDefault()
    setUpdating(true)
    try {
      let currentAvatarUrl = avatarUrl
      if (avatarFile) {
        const fileExt = avatarFile.name.split('.').pop()
        const fileName = `${userProfile.id}-${Date.now()}.${fileExt}`
        await supabase.storage.from('avatars').upload(fileName, avatarFile)
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName)
        currentAvatarUrl = urlData.publicUrl
      }

      await supabase.from('financeiro_usu').update({ 
          nome, avatar_url: currentAvatarUrl, som_notificacao: somSelecionado, tema: temaSelecionado
      }).eq('id', userProfile.id)
      
      if (senha) await supabase.auth.updateUser({ password: senha })

      alert("Configurações salvas!");
      // Redireciona para a home correta baseada na função
      router.push(userProfile?.funcao === 'Financeiro' ? '/financeiro/home-financeiro' : '/financeiro/home-posvendas')
    } catch (err) { alert("Erro: " + err.message) } finally { setUpdating(false) }
  }

  const salvarEnvio = async () => {
    setEnvioSalvando(true); setEnvioMsg(null)
    try {
      const res = await fetch('/api/financeiro/config-envio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          provedor: envioProvedor,
          email_envio: envioEmail.trim(),
          senha: envioSenha, // só troca se preenchida
          smtp_host: envioHost.trim(),
          smtp_port: envioPort,
          smtp_secure: envioSecure,
        }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(out.error || 'Falha ao salvar')
      setEnvioMsg({ tipo: 'ok', msg: 'E-mail de envio salvo!' })
      setEnvioConfigurado(!!envioEmail.trim())
      setEnvioSenha('')
    } catch (e) { setEnvioMsg({ tipo: 'erro', msg: e.message }) } finally { setEnvioSalvando(false) }
  }

  if (loading) return <div style={{background:'#f7f8fa', height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', color:'#94a3b8', fontFamily:'Inter'}}>CARREGANDO...</div>

  return (
    <div style={{ minHeight: '100vh', background: '#f4f4f4', fontFamily: 'Inter, sans-serif' }}>
      <FinanceiroNav />

      <div style={{ padding: 'clamp(12px, 4vw, 24px) clamp(12px, 4vw, 32px)' }}>

        <main style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', gap: '30px' }}>
          <div style={{ width: '300px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button onClick={() => setTab('perfil')} style={{ ...tabBtnStyle, background: tab === 'perfil' ? '#000' : 'rgba(255,255,255,0.6)', color: tab === 'perfil' ? '#fff' : '#64748b' }}>
              <User size={20} /> Perfil do Usuário
            </button>
            <button onClick={() => setTab('som')} style={{ ...tabBtnStyle, background: tab === 'som' ? '#000' : 'rgba(255,255,255,0.6)', color: tab === 'som' ? '#fff' : '#64748b' }}>
              <Volume2 size={20} /> Sons e Alertas
            </button>
            <button onClick={() => setTab('tema')} style={{ ...tabBtnStyle, background: tab === 'tema' ? '#000' : 'rgba(255,255,255,0.6)', color: tab === 'tema' ? '#fff' : '#64748b' }}>
              <Palette size={20} /> Personalização e Tema
            </button>
            <button onClick={() => setTab('envio')} style={{ ...tabBtnStyle, background: tab === 'envio' ? '#000' : 'rgba(255,255,255,0.6)', color: tab === 'envio' ? '#fff' : '#64748b' }}>
              <Mail size={20} /> E-mail de Envio
            </button>
          </div>

          <div style={{ flex: 1, background: 'var(--bg-card)', backdropFilter: 'blur(15px)', borderRadius: '35px', padding: '50px', border: '1px solid var(--borda)', boxShadow: '0 30px 60px rgba(0,0,0,0.05)' }}>
            
            {tab === 'perfil' && (
              <form onSubmit={handleUpdatePerfil}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '30px', marginBottom: '40px' }}>
                  <div style={{ position: 'relative' }}>
                    <div style={{ width: '120px', height: '120px', borderRadius: '40px', background: '#f1f5f9', overflow: 'hidden', border: '4px solid #fff', boxShadow: '0 10px 20px rgba(0,0,0,0.1)' }}>
                      <img src={avatarFile ? URL.createObjectURL(avatarFile) : avatarUrl || 'https://via.placeholder.com/150'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Avatar" />
                    </div>
                    <label style={{ position: 'absolute', bottom: '-10px', right: '-10px', background: '#000', color: '#fff', padding: '10px', borderRadius: '15px', cursor: 'pointer' }}>
                      <Camera size={18} /><input type="file" hidden accept="image/*" onChange={e => setAvatarFile(e.target.files[0])} />
                    </label>
                  </div>
                  <div>
                    <h2 style={{ fontSize: '24px', fontWeight: '900', color: 'var(--texto-principal)', margin: 0 }}>{nome}</h2>
                    <p style={{ color: 'var(--texto-secundario)', fontSize: '14px' }}>{userProfile?.funcao}</p>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '25px' }}>
                  <div style={inputGroup}><label style={labelStyle}>NOME COMPLETO</label><input style={inputStyle} value={nome} onChange={e => setNome(e.target.value)} /></div>
                  <div style={inputGroup}><label style={labelStyle}>E-MAIL (APENAS LEITURA)</label><input style={{...inputStyle, opacity: 0.6}} value={email} disabled /></div>
                  <div style={inputGroup}><label style={labelStyle}>NOVA SENHA</label><input type="password" style={inputStyle} placeholder="••••••••" value={senha} onChange={e => setSenha(e.target.value)} /></div>
                </div>
                <button disabled={updating} type="submit" style={{ marginTop: '40px', background: '#000', color: '#fff', border: 'none', padding: '20px 40px', borderRadius: '18px', fontWeight: '900', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '15px' }}>
                  {updating ? 'SALVANDO...' : <><Save size={20} /> SALVAR ALTERAÇÕES</>}
                </button>
              </form>
            )}

            {tab === 'som' && (
              <div>
                 <h2 style={{ fontSize: '24px', fontWeight: '900', color: 'var(--texto-principal)', marginBottom: '10px' }}>Sons de Notificação</h2>
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    {sonsDisponiveis.map((som) => (
                      <div key={som.id} onClick={() => tocarPrevia(som.id)} style={{ padding: '25px', borderRadius: '20px', border: somSelecionado === som.id ? '2px solid #000' : '1px solid var(--borda)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                          <div style={{ width: '45px', height: '45px', borderRadius: '12px', background: somSelecionado === som.id ? '#000' : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: somSelecionado === som.id ? '#fff' : '#000' }}>
                            <Play size={20} fill={somSelecionado === som.id ? "white" : "none"} />
                          </div>
                          <div><b style={{ fontSize: '16px' }}>{som.nome}</b><span>{som.desc}</span></div>
                        </div>
                        {somSelecionado === som.id && <CheckCircle2 size={24} color="#000" />}
                      </div>
                    ))}
                 </div>
                 <button onClick={handleUpdatePerfil} disabled={updating} style={{ marginTop: '40px', background: '#000', color: '#fff', border: 'none', padding: '20px 40px', borderRadius: '18px', fontWeight: '900', cursor: 'pointer' }}>SALVAR PREFERÊNCIA DE SOM</button>
              </div>
            )}

            {tab === 'tema' && (
              <div>
                <h2 style={{ fontSize: '24px', fontWeight: '900', color: 'var(--texto-principal)', marginBottom: '30px' }}>Escolha o Tema</h2>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '25px' }}>
                  <div onClick={() => mudarTemaLocal('claro')} style={{ padding: '40px', borderRadius: '25px', border: temaSelecionado === 'claro' ? '3px solid #000' : '1px solid var(--borda)', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px', cursor: 'pointer' }}>
                    <Sun size={48} color="#fbbf24" /><b style={{ color: '#000' }}>MODO CLARO</b>
                    {temaSelecionado === 'claro' && <CheckCircle2 size={24} color="#000" />}
                  </div>
                  <div onClick={() => mudarTemaLocal('escuro')} style={{ padding: '40px', borderRadius: '25px', border: temaSelecionado === 'escuro' ? '3px solid #3b82f6' : '1px solid var(--borda)', background: '#0f172a', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px', cursor: 'pointer' }}>
                    <Moon size={48} color="#3b82f6" /><b style={{ color: '#fff' }}>MODO ESCURO</b>
                    {temaSelecionado === 'escuro' && <CheckCircle2 size={24} color="#3b82f6" />}
                  </div>
                </div>
                <button onClick={handleUpdatePerfil} disabled={updating} style={{ marginTop: '40px', background: '#000', color: '#fff', border: 'none', padding: '20px 40px', borderRadius: '18px', fontWeight: '900', cursor: 'pointer' }}>SALVAR PREFERÊNCIA DE TEMA</button>
              </div>
            )}

            {tab === 'envio' && (
              <div>
                <h2 style={{ fontSize: '24px', fontWeight: '900', color: 'var(--texto-principal)', marginBottom: '10px' }}>E-mail de envio (remetente)</h2>
                <p style={{ color: 'var(--texto-secundario)', fontSize: '14px', lineHeight: 1.6, marginBottom: '30px' }}>
                  Os boletos e cobranças que você enviar sairão deste e-mail (aparece como <b>De:</b> no card). Use uma <b>Senha de app</b> — não a senha normal da conta. A senha é guardada criptografada.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '25px' }}>
                  <div style={inputGroup}><label style={labelStyle}>PROVEDOR</label>
                    <select style={inputStyle} value={envioProvedor} onChange={e => setEnvioProvedor(e.target.value)}>
                      <option value="gmail">Gmail / Google Workspace</option>
                      <option value="outlook">Outlook / Microsoft 365</option>
                      <option value="outro">Outro (SMTP manual)</option>
                    </select>
                  </div>
                  <div style={inputGroup}><label style={labelStyle}>E-MAIL DE ENVIO</label><input style={inputStyle} value={envioEmail} onChange={e => setEnvioEmail(e.target.value)} placeholder="voce@empresa.com" /></div>
                  <div style={inputGroup}><label style={labelStyle}>SENHA DE APP {envioConfigurado ? '(deixe em branco para manter)' : ''}</label><input type="password" style={inputStyle} value={envioSenha} onChange={e => setEnvioSenha(e.target.value)} placeholder={envioConfigurado ? '•••••••• (já salva)' : 'senha de app'} /></div>
                  {envioProvedor === 'outro' && (<>
                    <div style={inputGroup}><label style={labelStyle}>SERVIDOR SMTP</label><input style={inputStyle} value={envioHost} onChange={e => setEnvioHost(e.target.value)} placeholder="smtp.seu-provedor.com" /></div>
                    <div style={inputGroup}><label style={labelStyle}>PORTA</label><input style={inputStyle} value={envioPort} onChange={e => setEnvioPort(e.target.value)} placeholder="465" /></div>
                    <div style={inputGroup}><label style={labelStyle}>SEGURANÇA</label>
                      <select style={inputStyle} value={envioSecure ? 'ssl' : 'starttls'} onChange={e => setEnvioSecure(e.target.value === 'ssl')}>
                        <option value="ssl">SSL (porta 465)</option>
                        <option value="starttls">STARTTLS (porta 587)</option>
                      </select>
                    </div>
                  </>)}
                </div>
                {envioMsg && <p style={{ marginTop: '18px', color: envioMsg.tipo === 'ok' ? '#059669' : '#dc2626', fontWeight: '800' }}>{envioMsg.msg}</p>}
                <button onClick={salvarEnvio} disabled={envioSalvando} style={{ marginTop: '30px', background: '#000', color: '#fff', border: 'none', padding: '20px 40px', borderRadius: '18px', fontWeight: '900', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {envioSalvando ? 'SALVANDO...' : <><Save size={20} /> SALVAR E-MAIL DE ENVIO</>}
                </button>
                <p style={{ marginTop: '18px', fontSize: '12px', color: '#94a3b8', lineHeight: 1.6 }}>
                  Gmail: crie a Senha de app em <b>myaccount.google.com → Segurança → Verificação em duas etapas → Senhas de app</b> (precisa da 2FA ligada). Se não configurar nada aqui, o envio usa o e-mail padrão da empresa.
                </p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

export default function Configuracoes() {
  return (
    <Suspense fallback={<div style={{background:'#000', color:'#fff', height:'100vh', display:'flex', alignItems:'center', justifyContent:'center'}}>CARREGANDO...</div>}>
      <ConfiguracoesContent />
    </Suspense>
  );
}

// ESTILOS AUXILIARES
const tabBtnStyle = { width: '100%', padding: '20px 25px', border: 'none', borderRadius: '18px', textAlign: 'left', fontWeight: '700', cursor: 'pointer', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '15px', transition: '0.3s' }
const inputGroup = { display: 'flex', flexDirection: 'column', gap: '10px' }
const labelStyle = { fontSize: '10px', fontWeight: '900', color: '#94a3b8', letterSpacing: '1px' }
const inputStyle = { width: '100%', padding: '18px', borderRadius: '15px', border: '1px solid #cbd5e1', outline: 'none', fontFamily: 'Inter', fontSize: '15px', background: '#fff', color: '#000' }