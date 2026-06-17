'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatarDataBR, formatarMoeda, calcTempo } from '@/lib/financeiro/utils'
import { notificarAdminsClient } from '@/hooks/useNotificarAdmins'
import { marcarMinhaAcao } from '@/components/financeiro/NotificationSystem'
import {
  AlertTriangle, Calendar, CreditCard, Clock, Search, X,
  CheckCircle, FileText, Eye, Download, Barcode
} from 'lucide-react'
import FinanceiroNav from '@/components/financeiro/FinanceiroNav'

export default function VencidosPage() {
  const { userProfile } = useAuth()
  const [cards, setCards] = useState([])
  const [filtro, setFiltro] = useState('')
  const [selecionado, setSelecionado] = useState(null)
  const [loading, setLoading] = useState(true)

  const notificarMovimento = (t, novoStatus, descExtra) => {
    const label = `NF #${t.id} - ${t.nom_cliente || ''}`;
    const statusLabels = { gerar_boleto: 'Gerar Boleto', enviar_cliente: 'Enviar ao Cliente', aguardando_vencimento: 'Aguardando Vencimento', pago: 'Pago', vencido: 'Vencido', concluido: 'Concluído' };
    marcarMinhaAcao('Chamado_NF', t.id, {
      titulo: `Card movimentado → ${statusLabels[novoStatus] || novoStatus}`,
      descricao: descExtra || label,
      link: `/financeiro/vencidos`,
      userId: userProfile?.id,
      alvo: userProfile?.funcao === 'Financeiro' ? 'posvendas' : 'financeiro',
    });
  };

  const carregarDados = async () => {
    try {
      const { data } = await supabase
        .from('Chamado_NF')
        .select('*')
        .in('status', ['vencido', 'aguardando_vencimento'])
        .order('vencimento_boleto', { ascending: true })

      const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
      const vencidos = (data || []).filter(c => {
        if (c.status === 'vencido') return true
        if (c.status === 'aguardando_vencimento' && c.vencimento_boleto) {
          const venc = new Date(c.vencimento_boleto); venc.setHours(0, 0, 0, 0)
          return venc < hoje
        }
        return false
      }).map(c => {
        const venc = c.vencimento_boleto ? new Date(c.vencimento_boleto) : null
        if (venc) venc.setHours(0, 0, 0, 0)
        const diasAtraso = venc ? Math.floor((hoje.getTime() - venc.getTime()) / 86400000) : 0
        return { ...c, diasAtraso }
      })

      setCards(vencidos)
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  useEffect(() => {
    if (userProfile) carregarDados()
  }, [userProfile])

  useEffect(() => {
    const channel = supabase
      .channel('vencidos_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'Chamado_NF' }, () => carregarDados())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const handlePedirRecobranca = async (t) => {
    const newVal = (t.recombrancas_qtd || 0) + 1
    notificarMovimento(t, 'vencido', `NF #${t.id} - ${t.nom_cliente || ''} — Recobrança #${newVal}`)
    await supabase.from('Chamado_NF').update({
      status: 'vencido',
      tarefa: 'Cobrar Cliente (Recobrança)',
      setor: 'Pós-Vendas',
      recombrancas_qtd: newVal,
      status_changed_at: new Date().toISOString(),
    }).eq('id', t.id)
    notificarAdminsClient('financeiro', `${userProfile?.nome || 'Usuário'} solicitou recobrança #${newVal}`, `NF #${t.id} — ${t.nom_cliente || ''}`, `/financeiro/vencidos`)
    alert('Recobrança enviada ao Pós-Vendas!')
    setSelecionado(null)
    carregarDados()
  }

  const handleMarcarPago = async (t) => {
    notificarMovimento(t, 'pago', `NF #${t.id} - ${t.nom_cliente || ''} — Marcado como pago`)
    await supabase.from('Chamado_NF').update({
      status: 'pago',
      tarefa: 'Pagamento Confirmado',
      status_changed_at: new Date().toISOString(),
    }).eq('id', t.id)
    notificarAdminsClient('financeiro', `${userProfile?.nome || 'Usuário'} marcou NF #${t.id} como pago`, `Cliente: ${t.nom_cliente || ''}`, `/financeiro/vencidos`)
    alert('Card movido para Pago!')
    setSelecionado(null)
    carregarDados()
  }

  const cardsFiltrados = cards.filter(c => {
    if (!filtro) return true
    const s = filtro.toLowerCase()
    return c.nom_cliente?.toLowerCase().includes(s) || String(c.id).includes(s)
  })

  return (
    <div style={{ minHeight: 'calc(100vh - 64px)', fontFamily: 'Inter, sans-serif', background: '#fafafa' }}>
      <FinanceiroNav />

      <div style={{ padding: '32px 40px', maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '12px',
              background: cards.length > 0 ? '#fef2f2' : '#f0fdf4',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: cards.length > 0 ? 'pulse-icon 2s ease-in-out infinite' : 'none',
            }}>
              <AlertTriangle size={22} color={cards.length > 0 ? '#ef4444' : '#22c55e'} />
            </div>
            <div>
              <h1 style={{ fontSize: '22px', fontWeight: '700', margin: 0, color: '#1e293b' }}>
                Cards Vencidos
                {cards.length > 0 && (
                  <span style={{
                    background: '#ef4444', color: '#fff', fontSize: '13px',
                    padding: '2px 10px', borderRadius: '12px', marginLeft: '12px',
                    verticalAlign: 'middle',
                  }}>
                    {cards.length}
                  </span>
                )}
              </h1>
              <p style={{ fontSize: '13px', color: '#94a3b8', margin: '4px 0 0 0' }}>
                {cards.length > 0 ? 'Cards com vencimento ultrapassado que precisam de atenção' : 'Nenhum card vencido no momento'}
              </p>
            </div>
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: '#fff', borderRadius: '10px', padding: '8px 14px',
            border: '1px solid #e2e8f0',
          }}>
            <Search size={16} color="#94a3b8" />
            <input
              type="text" placeholder="Buscar cliente ou ID..."
              value={filtro} onChange={e => setFiltro(e.target.value)}
              style={{ border: 'none', outline: 'none', background: 'none', fontSize: '13px', width: '180px', color: '#1e293b' }}
            />
          </div>
        </div>

        {/* Cards Grid */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>Carregando...</div>
        ) : cardsFiltrados.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px', color: '#94a3b8' }}>
            <CheckCircle size={48} color="#d1d5db" style={{ marginBottom: '16px' }} />
            <p style={{ fontSize: '16px', fontWeight: '500' }}>
              {filtro ? 'Nenhum resultado encontrado' : 'Nenhum card vencido'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
            {cardsFiltrados.map(t => (
              <div key={t.id} onClick={() => setSelecionado(t)} style={{
                background: '#fff', border: '1px solid #fecaca', borderRadius: '16px',
                borderLeft: '5px solid #ef4444', overflow: 'hidden', cursor: 'pointer',
                transition: 'all 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
              }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 8px 24px rgba(239,68,68,0.12)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)'; e.currentTarget.style.transform = 'translateY(0)' }}
              >
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #fef2f2' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>
                      {t.nom_cliente?.toUpperCase()}
                    </h3>
                    <span style={{
                      background: '#fef2f2', color: '#ef4444', fontSize: '11px', fontWeight: '700',
                      padding: '3px 10px', borderRadius: '8px', whiteSpace: 'nowrap',
                    }}>
                      {t.diasAtraso} dia{t.diasAtraso !== 1 ? 's' : ''} atrás
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>ID #{t.id}</div>
                </div>

                <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#64748b' }}>
                    <CreditCard size={14} /> {t.forma_pagamento || 'N/A'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#ef4444' }}>
                    <Calendar size={14} /> Venc: {formatarDataBR(t.vencimento_boleto)}
                  </div>
                  <div style={{ fontSize: '26px', fontWeight: '600', color: '#1e293b', marginTop: '4px' }}>
                    {formatarMoeda(t.valor_servico || t.valor)}
                  </div>
                  {t.recombrancas_qtd > 0 && (
                    <div style={{ fontSize: '11px', color: '#f97316', fontWeight: '600' }}>
                      {t.recombrancas_qtd} recobrança(s) enviada(s)
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal detalhes */}
      {selecionado && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto', padding: '32px', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>
                  {selecionado.nom_cliente?.toUpperCase()}
                </h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>ID #{selecionado.id}</p>
              </div>
              <button onClick={() => setSelecionado(null)} style={{ background: '#f5f5f5', border: 'none', borderRadius: '10px', padding: '8px', cursor: 'pointer' }}>
                <X size={18} color="#737373" />
              </button>
            </div>

            {/* Badge vencido */}
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px',
              padding: '16px', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px',
            }}>
              <AlertTriangle size={20} color="#ef4444" />
              <div>
                <div style={{ fontSize: '14px', fontWeight: '700', color: '#ef4444' }}>
                  VENCIDO — {selecionado.diasAtraso} dia{selecionado.diasAtraso !== 1 ? 's' : ''} em atraso
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                  Vencimento: {formatarDataBR(selecionado.vencimento_boleto)}
                </div>
              </div>
            </div>

            {/* Info */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
              <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '14px' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Valor</div>
                <div style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b' }}>{formatarMoeda(selecionado.valor_servico || selecionado.valor)}</div>
              </div>
              <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '14px' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Forma</div>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b' }}>{selecionado.forma_pagamento || 'N/A'}</div>
              </div>
            </div>

            {/* NFs */}
            {(selecionado.num_nf_servico || selecionado.num_nf_peca) && (
              <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '14px', marginBottom: '20px' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px' }}>Notas Fiscais</div>
                {selecionado.num_nf_servico && <div style={{ fontSize: '13px', color: '#1e293b' }}>NF Serviço: {selecionado.num_nf_servico}</div>}
                {selecionado.num_nf_peca && <div style={{ fontSize: '13px', color: '#1e293b' }}>NF Peça: {selecionado.num_nf_peca}</div>}
              </div>
            )}

            {/* Observações */}
            {selecionado.obs && (
              <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '14px', marginBottom: '20px' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px' }}>Observações</div>
                <div style={{ fontSize: '14px', color: '#334155', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>{selecionado.obs}</div>
              </div>
            )}

            {/* Boletos anexados */}
            {selecionado.anexo_boleto && (
              <div style={{ background: '#eff6ff', borderRadius: '12px', padding: '14px', marginBottom: '20px' }}>
                <div style={{ fontSize: '11px', color: '#3b82f6', textTransform: 'uppercase', marginBottom: '8px', fontWeight: '600' }}>Boletos</div>
                {(() => {
                  const urls = [];
                  if (selecionado.anexo_boleto) selecionado.anexo_boleto.split(',').forEach(u => { const t = u.trim(); if (t) urls.push(t); });
                  if (selecionado.anexo_boleto_2) { const t = selecionado.anexo_boleto_2.trim(); if (t && !urls.includes(t)) urls.push(t); }
                  if (selecionado.anexo_boleto_3) { const t = selecionado.anexo_boleto_3.trim(); if (t && !urls.includes(t)) urls.push(t); }
                  return urls.map((url, i) => ({ label: `Boleto ${i + 1}`, url }));
                })().map((b, i) => (
                  <a key={i} href={b.url} target="_blank" rel="noopener noreferrer" style={{
                    display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px',
                    color: '#3b82f6', textDecoration: 'none', padding: '6px 0',
                  }}>
                    <Eye size={14} /> {b.label}
                  </a>
                ))}
              </div>
            )}

            {selecionado.recombrancas_qtd > 0 && (
              <div style={{ fontSize: '12px', color: '#f97316', fontWeight: '600', marginBottom: '20px' }}>
                Recobrança(s) enviada(s): {selecionado.recombrancas_qtd}
              </div>
            )}

            {/* Ações */}
            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button onClick={() => handlePedirRecobranca(selecionado)} style={{
                flex: 1, padding: '14px', borderRadius: '12px', border: 'none',
                background: 'linear-gradient(135deg, #f97316, #ea580c)', color: '#fff',
                fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(249,115,22,0.25)',
              }}>
                Pedir Recobrança
              </button>
              <button onClick={() => handleMarcarPago(selecionado)} style={{
                flex: 1, padding: '14px', borderRadius: '12px', border: 'none',
                background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff',
                fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(34,197,94,0.25)',
              }}>
                Marcar como Pago
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse-icon {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
      `}</style>
    </div>
  )
}
