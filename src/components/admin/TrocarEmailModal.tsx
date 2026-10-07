'use client'
// Admin → trocar o e-mail de LOGIN de um usuário (o mesmo usuário continua:
// permissões e histórico ficam). Opcional: senha provisória para passar à pessoa.
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { X, Mail } from 'lucide-react'
import { erroEmail, sugestaoEmail, normalizarEmail } from '@/lib/auth/email'

export default function TrocarEmailModal({ usuario, onFechar, onTrocado }: {
  usuario: { id: string; nome?: string; email?: string | null }
  onFechar: () => void
  onTrocado: (novoEmail: string) => void
}) {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [feito, setFeito] = useState<{ para: string; senha: string } | null>(null)

  const limpo = normalizarEmail(email)
  const problema = email ? erroEmail(limpo) : null
  const sugestao = email && !problema ? sugestaoEmail(limpo) : null

  const salvar = async () => {
    if (!limpo || problema) { setErro(problema || 'Informe o e-mail novo.'); return }
    if (senha && senha.length < 6) { setErro('A senha provisória precisa ter pelo menos 6 caracteres.'); return }
    setSalvando(true); setErro('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/usuario-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ user_id: usuario.id, email: limpo, senha }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { setErro(out.error || 'Falha ao trocar o e-mail.'); return }
      setFeito({ para: out.para, senha })
      onTrocado(out.para)
    } catch {
      setErro('Erro ao conectar com o servidor.')
    } finally {
      setSalvando(false)
    }
  }

  const campo: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text)', fontSize: 14, boxSizing: 'border-box' }
  const rotulo: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--portal-text-secondary)', marginBottom: 4, display: 'block' }

  return (
    <div onClick={onFechar} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--portal-bg-card)', color: 'var(--portal-text)', borderRadius: 14, width: '100%', maxWidth: 440, padding: 22, boxShadow: '0 20px 50px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 16 }}><Mail size={18} /> Trocar e-mail de login</div>
          <button onClick={onFechar} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--portal-text-secondary)' }}><X size={18} /></button>
        </div>

        {feito ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14 }}>
            <div style={{ padding: 12, borderRadius: 10, background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}>
              Pronto! {usuario.nome || 'O usuário'} agora entra com <b>{feito.para}</b>.
              {feito.senha
                ? <> Senha provisória: <b>{feito.senha}</b> — passe pra pessoa e peça pra trocar depois em Perfil.</>
                : <> A senha continua a mesma. Se ela não lembrar, use “Resetar” — o link agora vai pro e-mail novo.</>}
            </div>
            <button onClick={onFechar} style={{ padding: '10px 14px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fefefe', fontWeight: 600, cursor: 'pointer' }}>Fechar</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, color: 'var(--portal-text-secondary)' }}>
              {usuario.nome && <><b style={{ color: 'var(--portal-text)' }}>{usuario.nome}</b><br /></>}
              E-mail atual: <b style={{ color: 'var(--portal-text)' }}>{usuario.email || '(sem e-mail)'}</b>
            </div>
            <div>
              <label style={rotulo}>E-mail novo (o que a pessoa usa de verdade)</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@novatratores.com.br" style={campo} autoFocus />
              {problema && <div style={{ fontSize: 12, color: '#dc2626', marginTop: 4 }}>{problema}</div>}
              {sugestao && (
                <div style={{ fontSize: 12, color: '#b45309', marginTop: 4 }}>
                  Você quis dizer <button type="button" onClick={() => setEmail(sugestao)} style={{ background: 'none', border: 'none', padding: 0, color: '#2563eb', textDecoration: 'underline', cursor: 'pointer', fontSize: 12 }}>{sugestao}</button>?
                </div>
              )}
            </div>
            <div>
              <label style={rotulo}>Senha provisória (opcional)</label>
              <input type="text" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="deixe vazio pra manter a senha atual" style={campo} />
            </div>
            {erro && <div style={{ fontSize: 13, color: '#dc2626' }}>{erro}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={onFechar} style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--portal-border)', background: 'transparent', color: 'var(--portal-text)', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={salvar} disabled={salvando || !email || !!problema} style={{ padding: '10px 14px', borderRadius: 8, border: 'none', background: salvando || !email || problema ? '#9ca3af' : '#2563eb', color: '#fefefe', fontWeight: 600, cursor: salvando ? 'default' : 'pointer' }}>
                {salvando ? 'Salvando…' : 'Trocar e-mail'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
