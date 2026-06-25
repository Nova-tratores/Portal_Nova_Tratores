'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { exigeComprovantePago, temComprovantePago } from '@/lib/financeiro/constants'
import { useAuth } from '@/hooks/useAuth'
import { formatarDataBR, formatarMoeda } from '@/lib/financeiro/utils'
import { notificarAdminsClient } from '@/hooks/useNotificarAdmins'
import { marcarMinhaAcao } from '@/components/financeiro/NotificationSystem'
import {
  AlertTriangle, Calendar, CreditCard, Search, X,
  CheckCircle, Eye, FileText, ExternalLink
} from 'lucide-react'
import FinanceiroNav from '@/components/financeiro/FinanceiroNav'

const rowStyle = { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--portal-text-secondary)' }
const labelStyle = { fontSize: '11px', color: 'var(--portal-text-muted)', textTransform: 'uppercase', marginBottom: '4px', fontWeight: '600', letterSpacing: '0.5px' }
const sectionStyle = { background: 'var(--portal-bg-secondary)', borderRadius: '12px', padding: '14px', marginBottom: '14px' }

function AnexoLink({ label, url }) {
  if (!url) return null
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={{
      display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px',
      color: '#3b82f6', textDecoration: 'none', padding: '8px 12px',
      background: 'rgba(59,130,246,0.05)', borderRadius: '8px',
      border: '1px solid rgba(59,130,246,0.12)', transition: 'all 0.15s',
    }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.1)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.05)' }}
    >
      <FileText size={14} /> {label} <ExternalLink size={12} style={{ marginLeft: 'auto', opacity: 0.5 }} />
    </a>
  )
}

export default function VencidosPage() {
  const { userProfile } = useAuth()
  const [cards, setCards] = useState([])
  const [filtro, setFiltro] = useState('')
  const [selecionado, setSelecionado] = useState(null)
  const [loading, setLoading] = useState(true)

  const notificarMovimento = (t, novoStatus, descExtra) => {
    const label = `NF #${t.id} - ${t.nom_cliente || ''}`
    const statusLabels = { gerar_boleto: 'Gerar Boleto', enviar_cliente: 'Enviar ao Cliente', aguardando_vencimento: 'Aguardando Vencimento', pago: 'Pago', vencido: 'Vencido', concluido: 'Concluído' }
    marcarMinhaAcao('Chamado_NF', t.id, {
      titulo: `Card movimentado → ${statusLabels[novoStatus] || novoStatus}`,
      descricao: descExtra || label,
      link: `/financeiro/vencidos`,
      userId: userProfile?.id,
      alvo: userProfile?.funcao === 'Financeiro' ? 'posvendas' : 'financeiro',
    })
  }

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
    if (exigeComprovantePago(t.forma_pagamento) && !temComprovantePago(t)) {
      alert('Este método de pagamento exige o comprovante anexado para mover para Pago.')
      return
    }
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
    return (
      c.nom_cliente?.toLowerCase().includes(s) ||
      String(c.id).includes(s) ||
      c.num_nf_servico?.toLowerCase().includes(s) ||
      c.num_nf_peca?.toLowerCase().includes(s) ||
      c.forma_pagamento?.toLowerCase().includes(s) ||
      c.cnpj_cliente?.includes(s)
    )
  })

  const totalValor = cardsFiltrados.reduce((s, c) => s + (c.valor_servico || c.valor || 0), 0)

  return (
    <div style={{ minHeight: 'calc(100vh - 64px)', background: 'var(--portal-bg-secondary)' }}>
      <FinanceiroNav />

      <div style={{ padding: '28px 32px', maxWidth: '1100px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '12px',
              background: cards.length > 0 ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <AlertTriangle size={22} color={cards.length > 0 ? '#ef4444' : '#22c55e'} />
            </div>
            <div>
              <h1 style={{ fontSize: '20px', fontWeight: '600', margin: 0, color: 'var(--portal-text)' }}>
                Cards Vencidos
                {cards.length > 0 && (
                  <span style={{
                    background: '#ef4444', color: '#fff', fontSize: '12px',
                    padding: '2px 9px', borderRadius: '10px', marginLeft: '10px',
                    verticalAlign: 'middle', fontWeight: '700',
                  }}>
                    {cards.length}
                  </span>
                )}
              </h1>
              <p style={{ fontSize: '13px', color: 'var(--portal-text-muted)', margin: '2px 0 0 0' }}>
                {cards.length > 0
                  ? `${cards.length} card${cards.length !== 1 ? 's' : ''} · Total: ${formatarMoeda(totalValor)}`
                  : 'Nenhum card vencido no momento'}
              </p>
            </div>
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: 'var(--portal-bg-card)', borderRadius: '10px', padding: '8px 14px',
            border: '1px solid var(--portal-border)',
          }}>
            <Search size={16} color="var(--portal-text-muted)" />
            <input
              type="text" placeholder="Buscar cliente, NF ou ID..."
              value={filtro} onChange={e => setFiltro(e.target.value)}
              style={{ border: 'none', outline: 'none', background: 'none', fontSize: '13px', width: '200px', color: 'var(--portal-text)' }}
            />
            {filtro && <X size={14} onClick={() => setFiltro('')} style={{ cursor: 'pointer', color: 'var(--portal-text-muted)' }} />}
          </div>
        </div>

        {/* Lista */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: 'var(--portal-text-muted)' }}>Carregando...</div>
        ) : cardsFiltrados.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px', color: 'var(--portal-text-muted)' }}>
            <CheckCircle size={48} color="var(--portal-text-faint)" style={{ marginBottom: '16px' }} />
            <p style={{ fontSize: '15px', fontWeight: '500' }}>
              {filtro ? 'Nenhum resultado encontrado' : 'Nenhum card vencido'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {cardsFiltrados.map(t => (
              <div key={t.id} onClick={() => setSelecionado(t)} className="kanban-card" style={{
                background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: '12px',
                borderLeft: '4px solid #ef4444', cursor: 'pointer', transition: 'all 0.15s',
                display: 'grid', gridTemplateColumns: '1fr auto auto auto', alignItems: 'center',
                padding: '16px 20px', gap: '16px',
              }}>
                {/* Cliente + ID */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--portal-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {t.nom_cliente?.toUpperCase()}
                  </div>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '3px', fontSize: '12px', color: 'var(--portal-text-muted)' }}>
                    <span>#{t.id}</span>
                    {t.num_nf_servico && <span>NFS {t.num_nf_servico}</span>}
                    {t.num_nf_peca && <span>NFP {t.num_nf_peca}</span>}
                  </div>
                </div>

                {/* Forma + Vencimento */}
                <div style={{ textAlign: 'center', minWidth: '140px' }}>
                  <div style={{ ...rowStyle, justifyContent: 'center' }}><CreditCard size={13} /> {t.forma_pagamento || 'N/A'}</div>
                  <div style={{ ...rowStyle, justifyContent: 'center', color: '#ef4444', marginTop: '2px' }}><Calendar size={13} /> {formatarDataBR(t.vencimento_boleto)}</div>
                </div>

                {/* Valor */}
                <div style={{ textAlign: 'right', minWidth: '120px' }}>
                  <div style={{ fontSize: '18px', fontWeight: '600', color: 'var(--portal-text)' }}>
                    {formatarMoeda(t.valor_servico || t.valor)}
                  </div>
                  {t.recombrancas_qtd > 0 && (
                    <div style={{ fontSize: '11px', color: '#f97316', fontWeight: '600', marginTop: '2px' }}>
                      {t.recombrancas_qtd}x recobrança
                    </div>
                  )}
                </div>

                {/* Badge atraso */}
                <div style={{ minWidth: '90px', textAlign: 'right' }}>
                  <span style={{
                    background: t.diasAtraso > 30 ? '#dc2626' : t.diasAtraso > 7 ? '#ef4444' : 'rgba(239,68,68,0.1)',
                    color: t.diasAtraso > 7 ? '#fff' : '#ef4444',
                    fontSize: '11px', fontWeight: '700',
                    padding: '4px 10px', borderRadius: '8px', whiteSpace: 'nowrap',
                  }}>
                    {t.diasAtraso}d atrás
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal detalhes */}
      {selecionado && (
        <div onClick={e => { if (e.target === e.currentTarget) setSelecionado(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: 'var(--portal-bg-card)', borderRadius: '20px', width: '100%', maxWidth: '540px', maxHeight: '90vh', overflowY: 'auto', padding: '28px', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '17px', fontWeight: '600', color: 'var(--portal-text)' }}>
                  {selecionado.nom_cliente?.toUpperCase()}
                </h2>
                <div style={{ display: 'flex', gap: '10px', marginTop: '4px', fontSize: '12px', color: 'var(--portal-text-muted)' }}>
                  <span>ID #{selecionado.id}</span>
                  {selecionado.cnpj_cliente && <span>· {selecionado.cnpj_cliente}</span>}
                </div>
              </div>
              <button onClick={() => setSelecionado(null)} style={{ background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)', borderRadius: '10px', padding: '8px', cursor: 'pointer' }}>
                <X size={16} color="var(--portal-text-secondary)" />
              </button>
            </div>

            {/* Badge vencido */}
            <div style={{
              background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: '12px',
              padding: '14px', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px',
            }}>
              <AlertTriangle size={18} color="#ef4444" />
              <div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#ef4444' }}>
                  VENCIDO — {selecionado.diasAtraso} dia{selecionado.diasAtraso !== 1 ? 's' : ''} em atraso
                </div>
                <div style={{ fontSize: '12px', color: 'var(--portal-text-muted)' }}>
                  Vencimento: {formatarDataBR(selecionado.vencimento_boleto)}
                </div>
              </div>
            </div>

            {/* Info grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
              <div style={sectionStyle}>
                <div style={labelStyle}>Valor</div>
                <div style={{ fontSize: '18px', fontWeight: '600', color: 'var(--portal-text)' }}>{formatarMoeda(selecionado.valor_servico || selecionado.valor)}</div>
              </div>
              <div style={sectionStyle}>
                <div style={labelStyle}>Forma</div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--portal-text)' }}>{selecionado.forma_pagamento || 'N/A'}</div>
                {selecionado.qtd_parcelas > 1 && <div style={{ fontSize: '11px', color: 'var(--portal-text-muted)', marginTop: '2px' }}>{selecionado.qtd_parcelas}x parcelas</div>}
              </div>
            </div>

            {/* Notas Fiscais + Anexos */}
            {(selecionado.num_nf_servico || selecionado.num_nf_peca || selecionado.anexo_nf_servico || selecionado.anexo_nf_peca) && (
              <div style={sectionStyle}>
                <div style={labelStyle}>Notas Fiscais</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                  {selecionado.num_nf_servico && (
                    <div>
                      <div style={{ fontSize: '12px', color: 'var(--portal-text-secondary)', marginBottom: '4px' }}>NF Serviço: <strong>{selecionado.num_nf_servico}</strong></div>
                      <AnexoLink label="Abrir NF de Serviço" url={selecionado.anexo_nf_servico} />
                    </div>
                  )}
                  {selecionado.num_nf_peca && (
                    <div>
                      <div style={{ fontSize: '12px', color: 'var(--portal-text-secondary)', marginBottom: '4px' }}>NF Peça: <strong>{selecionado.num_nf_peca}</strong></div>
                      <AnexoLink label="Abrir NF de Peça (DANFE)" url={selecionado.anexo_nf_peca} />
                    </div>
                  )}
                  {!selecionado.num_nf_servico && selecionado.anexo_nf_servico && (
                    <AnexoLink label="Abrir NF de Serviço" url={selecionado.anexo_nf_servico} />
                  )}
                  {!selecionado.num_nf_peca && selecionado.anexo_nf_peca && (
                    <AnexoLink label="Abrir NF de Peça" url={selecionado.anexo_nf_peca} />
                  )}
                </div>
              </div>
            )}

            {/* Boletos anexados */}
            {(selecionado.anexo_boleto || selecionado.anexo_boleto_2 || selecionado.anexo_boleto_3) && (
              <div style={sectionStyle}>
                <div style={labelStyle}>Boletos</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                  {(() => {
                    const urls = []
                    if (selecionado.anexo_boleto) selecionado.anexo_boleto.split(',').forEach(u => { const t = u.trim(); if (t) urls.push(t) })
                    if (selecionado.anexo_boleto_2) { const t = selecionado.anexo_boleto_2.trim(); if (t && !urls.includes(t)) urls.push(t) }
                    if (selecionado.anexo_boleto_3) { const t = selecionado.anexo_boleto_3.trim(); if (t && !urls.includes(t)) urls.push(t) }
                    return urls
                  })().map((url, i) => (
                    <AnexoLink key={i} label={`Boleto ${i + 1}`} url={url} />
                  ))}
                </div>
              </div>
            )}

            {/* Comprovantes */}
            {(selecionado.comprovante_pagamento || selecionado.comprovante_pagamento_p1) && (
              <div style={sectionStyle}>
                <div style={labelStyle}>Comprovantes</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                  {(() => {
                    const comps = []
                    for (let i = 1; i <= 5; i++) {
                      const c = selecionado[`comprovante_pagamento_p${i}`]
                      if (c) comps.push({ label: selecionado.qtd_parcelas > 1 ? `Parcela ${i}` : 'Comprovante', url: c })
                    }
                    if (comps.length === 0 && selecionado.comprovante_pagamento) {
                      comps.push({ label: 'Comprovante', url: selecionado.comprovante_pagamento })
                    }
                    return comps
                  })().map((c, i) => (
                    <AnexoLink key={i} label={c.label} url={c.url} />
                  ))}
                </div>
              </div>
            )}

            {/* Observações */}
            {selecionado.obs && (
              <div style={sectionStyle}>
                <div style={labelStyle}>Observações</div>
                <div style={{ fontSize: '13px', color: 'var(--portal-text-secondary)', lineHeight: '1.6', whiteSpace: 'pre-wrap', marginTop: '4px' }}>{selecionado.obs}</div>
              </div>
            )}

            {selecionado.recombrancas_qtd > 0 && (
              <div style={{ fontSize: '12px', color: '#f97316', fontWeight: '600', marginBottom: '14px' }}>
                {selecionado.recombrancas_qtd} recobrança(s) enviada(s)
              </div>
            )}

            {/* Ações */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
              <button onClick={() => handlePedirRecobranca(selecionado)} style={{
                flex: 1, padding: '13px', borderRadius: '12px', border: 'none',
                background: '#f97316', color: '#fff',
                fontSize: '13px', fontWeight: '600', cursor: 'pointer',
              }}>
                Pedir Recobrança
              </button>
              <button onClick={() => handleMarcarPago(selecionado)} style={{
                flex: 1, padding: '13px', borderRadius: '12px', border: 'none',
                background: '#22c55e', color: '#fff',
                fontSize: '13px', fontWeight: '600', cursor: 'pointer',
              }}>
                Marcar como Pago
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
