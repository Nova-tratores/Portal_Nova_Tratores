'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import FinanceiroNav from '@/components/financeiro/FinanceiroNav'
import { useAuditLog } from '@/hooks/useAuditLog'
import { ArrowLeft, Send, User, Bookmark, FileText, Building } from 'lucide-react'

// --- 1. TELA DE CARREGAMENTO (ESTILO ATUALIZADO) ---
function LoadingScreen() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#212124', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <h1 style={{ color: '#f8fafc', fontFamily: 'Montserrat, sans-serif', fontWeight: '300', fontSize: '28px', letterSpacing: '4px', textTransform: 'uppercase', textAlign: 'center', lineHeight: '1.4' }}>
            Fluxo de RH <br /> 
            <span style={{ fontWeight: '400', fontSize: '32px', color: '#9e9e9e' }}>Nova Tratores</span>
        </h1>
    </div>
  )
}

export default function NovoChamadoRH() {
  const { log: auditLog } = useAuditLog()
  const [user, setUser] = useState(null)
  const [form, setForm] = useState({ funcionario: '', titulo: '', descricao: '', setor: '' })
  const [enviando, setEnviando] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const carregarUsuario = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        router.push('/login')
        return
      }
      
      setUser(session.user)
    }

    carregarUsuario()
  }, [router])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setEnviando(true)
    try {
      const { error } = await supabase.from('finan_rh').insert([{
        ...form,
        usuario_id: user.id,
        status: 'aberto'
      }])
      if (error) throw error
      auditLog({ sistema: 'financeiro', acao: 'criar', entidade: 'finan_rh', entidade_label: `RH - ${form.funcionario} - ${form.titulo}`, detalhes: { funcionario: form.funcionario, titulo: form.titulo, setor: form.setor } })
      alert("Chamado de RH criado com sucesso!")
      router.push('/financeiro')
    } catch (err) {
      alert("Erro ao criar chamado: " + err.message)
    } finally {
      setEnviando(false)
    }
  }

  // OBJETOS DE ESTILO PARA MANTER O PADRÃO 50% MAIS CLARO E FONTES MAIORES
  const inputStyle = {
    width: '100%',
    padding: '18px 20px',
    borderRadius: '14px',
    border: '1px solid #55555a',
    outline: 'none',
    background: '#242427',
    color: '#ffffff',
    fontFamily: 'Montserrat, sans-serif',
    fontSize: '16px',
    fontWeight: '400',
    transition: '0.3s ease',
    boxSizing: 'border-box'
  }

  const labelStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '13px',
    fontWeight: '400',
    color: '#9e9e9e',
    marginBottom: '10px',
    letterSpacing: '1px',
    textTransform: 'uppercase'
  }

  return (
    <div style={{ minHeight: '100vh', background: '#2a2a2d', fontFamily: 'Montserrat, sans-serif', color: '#f1f5f9' }}>
      <FinanceiroNav />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '30px 20px' }}>

        <div style={{ width: '100%', maxWidth: '750px', background: '#3f3f44', padding: '60px', borderRadius: '35px', border: '0.5px solid #55555a', boxShadow: '0 30px 80px rgba(0,0,0,0.3)' }}>
          <h1 style={{ fontWeight: '300', fontSize: '32px', color: '#ffffff', marginBottom: '10px', letterSpacing: '-1px', textAlign: 'center' }}>Novo Chamado de RH</h1>
          <p style={{ color: '#9e9e9e', marginBottom: '50px', fontSize: '15px', fontWeight: '400', textAlign: 'center' }}>Preencha as informações necessárias para a solicitação interna.</p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            <div>
              <label style={labelStyle}><User size={16}/> Nome do Funcionário</label>
              <input required value={form.funcionario} onChange={e => setForm({...form, funcionario: e.target.value})} style={inputStyle} placeholder="Digite o nome completo" />
            </div>

            <div>
              <label style={labelStyle}><Bookmark size={16}/> Título da Solicitação</label>
              <input required value={form.titulo} onChange={e => setForm({...form, titulo: e.target.value})} style={inputStyle} placeholder="Ex: Solicitação de Férias ou Ajuste de Ponto" />
            </div>

            <div>
              <label style={labelStyle}><Building size={16}/> Setor Pertencente</label>
              <select required value={form.setor} onChange={e => setForm({...form, setor: e.target.value})} style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}>
                <option value="">Selecione o setor...</option>
                <option value="Administrativo">Administrativo</option>
                <option value="Financeiro">Financeiro</option>
                <option value="Vendas">Vendas</option>
                <option value="Pós-Vendas">Pós-Vendas</option>
                <option value="Oficina">Oficina</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}><FileText size={16}/> Descrição dos Detalhes</label>
              <textarea rows="5" value={form.descricao} onChange={e => setForm({...form, descricao: e.target.value})} style={{ ...inputStyle, resize: 'none', height: '120px' }} placeholder="Descreva detalhadamente o motivo da sua solicitação..." />
            </div>

            <button type="submit" disabled={enviando} style={{ 
              background: enviando ? '#55555a' : '#93c5fd20', 
              color: '#93c5fd', 
              border: '1px solid #93c5fd', 
              padding: '22px', 
              borderRadius: '18px', 
              fontWeight: '400', 
              cursor: enviando ? 'not-allowed' : 'pointer', 
              fontSize: '17px', 
              marginTop: '15px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              gap: '12px',
              transition: '0.3s',
              opacity: 0.9
            }}>
              {enviando ? "Processando..." : <><Send size={20}/> Criar Chamado Interno</>}
            </button>
          </form>
        </div>
      </div>

      <style jsx global>{`
        input::placeholder, textarea::placeholder { color: #55555a; }
        select { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239e9e9e'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='C19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 1.2rem center; background-size: 1.2em; }
        button:hover { opacity: 1 !important; transform: translateY(-1px); }
      `}</style>
    </div>
  )
}