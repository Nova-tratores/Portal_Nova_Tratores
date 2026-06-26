'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import FinanceiroNav from '@/components/financeiro/FinanceiroNav'
import { useAuditLog } from '@/hooks/useAuditLog'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { notificarAdminsClient } from '@/hooks/useNotificarAdmins'
import { User, FileText, Building, CheckCircle, Tag } from 'lucide-react'

export default function NovoChamadoRH() {
  const { log: auditLog } = useAuditLog()
  const { userProfile } = useAuth()
  const { pode } = usePermissoes(userProfile?.id)
  const podeCriar = pode('financeiro', 'criar_chamado')
  const [user, setUser] = useState(null)
  const [form, setForm] = useState({ funcionario: '', titulo: '', descricao: '', setor: '' })
  const [enviando, setEnviando] = useState(false)
  const [pageLoading, setPageLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const carregarUsuario = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return router.push('/login')
      setUser(session.user)
      setPageLoading(false)
    }
    carregarUsuario()
  }, [router])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!podeCriar) { alert('Você não tem permissão para abrir chamados.'); return }
    setEnviando(true)
    try {
      const { error } = await supabase.from('finan_rh').insert([{
        ...form,
        usuario_id: user.id,
        status: 'aberto'
      }])
      if (error) throw error
      auditLog({ sistema: 'financeiro', acao: 'criar', entidade: 'finan_rh', entidade_label: `RH - ${form.funcionario} - ${form.titulo}`, detalhes: { funcionario: form.funcionario, titulo: form.titulo, setor: form.setor } })
      notificarAdminsClient('financeiro', `${userProfile?.nome || 'Usuário'} criou chamado RH`, `Funcionário: ${form.funcionario} — ${form.titulo}`, '/financeiro')
      alert("Chamado de RH criado com sucesso!")
      router.push('/financeiro')
    } catch (err) {
      alert("Erro ao criar chamado: " + err.message)
    } finally {
      setEnviando(false)
    }
  }

  if (pageLoading) return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#6b7280', fontSize: '16px', letterSpacing: '2px', fontFamily: 'Inter, sans-serif' }}>Carregando...</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'Inter, sans-serif', color: '#1e293b' }}>
      <FinanceiroNav />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 20px' }}>
        <div style={{ width: '100%', maxWidth: '720px' }}>

          <h2 style={{ fontWeight: '500', fontSize: '24px', color: '#1e293b', marginBottom: '32px' }}>Novo Chamado de RH</h2>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            <Field label="Nome do Funcionario" icon={<User size={18} />}>
              <input required value={form.funcionario} onChange={e => setForm({...form, funcionario: e.target.value})} style={inputIconStyle} placeholder="Digite o nome completo" />
            </Field>

            <Field label="Titulo da Solicitacao" icon={<Tag size={18} />}>
              <input required value={form.titulo} onChange={e => setForm({...form, titulo: e.target.value})} style={inputIconStyle} placeholder="Ex: Solicitacao de Ferias ou Ajuste de Ponto" />
            </Field>

            <Field label="Setor Pertencente" icon={<Building size={18} />}>
              <select required value={form.setor} onChange={e => setForm({...form, setor: e.target.value})} style={selectStyle}>
                <option value="">Selecione o setor...</option>
                <option value="Administrativo">Administrativo</option>
                <option value="Financeiro">Financeiro</option>
                <option value="Vendas">Vendas</option>
                <option value="Pós-Vendas">Pos-Vendas</option>
                <option value="Oficina">Oficina</option>
              </select>
            </Field>

            <div>
              <label style={labelStyle}>Descricao dos Detalhes</label>
              <textarea
                rows={4}
                value={form.descricao}
                onChange={e => setForm({...form, descricao: e.target.value})}
                style={{ ...inputStyle, resize: 'none', minHeight: '100px' }}
                placeholder="Descreva detalhadamente o motivo da sua solicitacao..."
              />
            </div>

            <button type="submit" disabled={enviando || !podeCriar} style={{
              background: (enviando || !podeCriar) ? '#e5e7eb' : '#1e293b',
              color: (enviando || !podeCriar) ? '#6b7280' : '#ffffff',
              border: 'none',
              padding: '16px',
              borderRadius: '10px',
              fontWeight: '600',
              cursor: enviando ? 'not-allowed' : 'pointer',
              fontSize: '15px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              transition: '0.2s',
              fontFamily: 'Inter, sans-serif'
            }}>
              {enviando ? 'Processando...' : <><CheckCircle size={18} /> Criar Chamado Interno</>}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

// --- COMPONENTES AUXILIARES ---
function Field({ label, icon, children }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ position: 'relative' }}>
        {icon && <div style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', zIndex: 1, display: 'flex' }}>{icon}</div>}
        {children}
      </div>
    </div>
  )
}

// --- ESTILOS ---
const labelStyle = { display: 'block', fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '6px', letterSpacing: '0.5px', textTransform: 'uppercase' };
const inputStyle = { width: '100%', padding: '12px 14px', borderRadius: '8px', border: '1px solid #e5e7eb', outline: 'none', background: '#ffffff', color: '#1e293b', fontSize: '15px', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif', transition: '0.2s' };
const inputIconStyle = { ...inputStyle, paddingLeft: '42px' };
const selectStyle = { ...inputIconStyle, appearance: 'none', cursor: 'pointer' };
