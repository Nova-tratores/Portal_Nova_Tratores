'use client'
import { useEffect, useState, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import FinanceiroNav from '@/components/financeiro/FinanceiroNav'
import { User, Volume2, Palette, Camera, Save, Play, CheckCircle2, Moon, Sun } from 'lucide-react'

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

  if (loading) return <div style={{background:'#000', height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontFamily:'Montserrat'}}>CARREGANDO...</div>

  return (
    <div style={{ minHeight: '100vh', background: '#f4f4f4', fontFamily: 'Montserrat, sans-serif' }}>
      <FinanceiroNav />

      <div style={{ padding: '24px 32px' }}>

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
const inputStyle = { width: '100%', padding: '18px', borderRadius: '15px', border: '1px solid #cbd5e1', outline: 'none', fontFamily: 'Montserrat', fontSize: '15px', background: '#fff', color: '#000' }