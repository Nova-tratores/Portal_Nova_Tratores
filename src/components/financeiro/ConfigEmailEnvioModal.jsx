'use client'
// Modal "Configurar meu e-mail de envio" — pedido na hora quando o usuário ainda
// não escolheu por qual e-mail vai enviar. Salva em financeiro_envio_config
// (senha de app criptografada no servidor). Cada usuário envia pelo seu e-mail.
import { useState } from 'react'
import { authHeaders } from '@/lib/auth/client'
import { X, Mail, KeyRound, ShieldCheck } from 'lucide-react'

export default function ConfigEmailEnvioModal({ open, onClose, onSaved, emailInicial = '' }) {
  const [email, setEmail] = useState(emailInicial)
  const [provedor, setProvedor] = useState('gmail')
  const [senha, setSenha] = useState('')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('')
  const [secure, setSecure] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  if (!open) return null

  const salvar = async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setErro('Informe um e-mail válido.'); return }
    if (!senha.trim()) { setErro('Informe a senha de app do e-mail.'); return }
    if (provedor === 'outro' && (!host.trim() || !port)) { setErro('Informe o servidor SMTP e a porta.'); return }
    setSalvando(true); setErro('')
    try {
      const body = { email_envio: email.trim(), senha: senha.trim(), provedor }
      if (provedor === 'outro') { body.smtp_host = host.trim(); body.smtp_port = Number(port) || null; body.smtp_secure = secure }
      const res = await fetch('/api/financeiro/config-envio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify(body),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(out.error || 'Falha ao salvar a configuração.')
      onSaved?.()
    } catch (e) { setErro(e.message) }
    setSalvando(false)
  }

  const inp = { width: '100%', padding: '11px 12px', borderRadius: 8, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text)', fontSize: 14, boxSizing: 'border-box', outline: 'none' }
  const lbl = { fontSize: 12, fontWeight: 700, color: 'var(--portal-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, display: 'block' }

  return (
    <div onClick={() => !salvando && onClose()} style={{ position: 'fixed', inset: 0, zIndex: 9500, background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 16px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 16, width: '100%', maxWidth: 480, boxShadow: '0 24px 60px rgba(0,0,0,.3)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid var(--portal-border)' }}>
          <Mail size={18} color="#e8730c" />
          <div style={{ flex: 1, fontSize: 16, fontWeight: 800, color: 'var(--portal-text)' }}>Configurar meu e-mail de envio</div>
          <button onClick={onClose} disabled={salvando} style={{ background: 'var(--portal-bg-secondary)', border: 'none', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', color: 'var(--portal-text-secondary)' }}><X size={16} /></button>
        </div>

        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)', margin: 0, lineHeight: 1.5 }}>
            Os e-mails que você enviar vão sair <strong>pelo seu e-mail</strong> (não pelo padrão do sistema). Configure uma vez — a senha fica <strong>criptografada</strong> no servidor.
          </p>

          <div>
            <label style={lbl}>Seu e-mail</label>
            <input style={inp} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@empresa.com.br" autoFocus />
          </div>

          <div>
            <label style={lbl}>Provedor</label>
            <select style={inp} value={provedor} onChange={e => setProvedor(e.target.value)}>
              <option value="gmail">Gmail / Google Workspace</option>
              <option value="outlook">Outlook / Office 365</option>
              <option value="outro">Outro (SMTP manual)</option>
            </select>
          </div>

          {provedor === 'outro' && (
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 2 }}><label style={lbl}>Servidor SMTP</label><input style={inp} value={host} onChange={e => setHost(e.target.value)} placeholder="smtp.seuprovedor.com" /></div>
              <div style={{ flex: 1 }}><label style={lbl}>Porta</label><input style={inp} value={port} onChange={e => setPort(e.target.value)} placeholder="465" /></div>
            </div>
          )}
          {provedor === 'outro' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--portal-text)' }}>
              <input type="checkbox" checked={secure} onChange={e => setSecure(e.target.checked)} /> Conexão segura (SSL/TLS)
            </label>
          )}

          <div>
            <label style={lbl}><KeyRound size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Senha de app</label>
            <input style={inp} type="password" value={senha} onChange={e => setSenha(e.target.value)} placeholder="senha de app (16 dígitos no Gmail)" />
            {provedor === 'gmail' && (
              <div style={{ fontSize: 11.5, color: 'var(--portal-text-secondary)', marginTop: 6, lineHeight: 1.5 }}>
                No Gmail <strong>não é a senha normal</strong>: gere uma <strong>Senha de App</strong> em Conta Google → Segurança → Verificação em 2 etapas → <em>Senhas de app</em> (16 dígitos).
              </div>
            )}
          </div>

          {erro && <div style={{ fontSize: 12.5, color: '#dc2626', fontWeight: 600 }}>{erro}</div>}

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button onClick={salvar} disabled={salvando} style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', background: '#e8730c', color: '#fff', fontSize: 14, fontWeight: 700, cursor: salvando ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <ShieldCheck size={16} /> {salvando ? 'Salvando…' : 'Salvar e enviar'}
            </button>
            <button onClick={onClose} disabled={salvando} style={{ padding: '12px 18px', borderRadius: 10, border: '1px solid var(--portal-border)', background: 'transparent', color: 'var(--portal-text-secondary)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
          </div>
        </div>
      </div>
    </div>
  )
}
