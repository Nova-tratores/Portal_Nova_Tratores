'use client'
import { X, MapPin, User, Calendar, MessageSquare, Flag, Navigation, Camera, ArrowRight } from 'lucide-react'

const tipoCores: Record<string, { bg: string; text: string; label: string }> = {
  presencial: { bg: '#DBEAFE', text: '#1E40AF', label: 'Presencial' },
  mensagem: { bg: '#D1FAE5', text: '#065F46', label: 'Mensagem' },
  telefonema: { bg: '#FEF3C7', text: '#92400E', label: 'Telefonema' },
  email: { bg: '#F5F3FF', text: '#6D28D9', label: 'E-mail' },
}

export default function ModalVisita({ visita, onClose }: { visita: any; onClose: () => void }) {
  if (!visita) return null

  const tc = tipoCores[visita.tipo] || { bg: '#F1F5F9', text: '#475569', label: visita.tipo }
  const fmtData = (iso: string) => iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'
  const fotoUrl = visita.foto_path ? `https://citrhumdkfivdzbmayde.supabase.co/storage/v1/object/public/fotos-visitas/${visita.foto_path}` : null

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', zIndex: 60000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 640, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 25px 60px rgba(0,0,0,0.2)' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: 14, background: '#FAFBFC', borderRadius: '20px 20px 0 0' }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: tc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: tc.text }}>
            <MessageSquare size={20} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1E293B' }}>Detalhes da Visita</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 6, background: tc.bg, color: tc.text }}>{tc.label}</span>
              {visita.retroativa && <span style={{ fontSize: 10, fontWeight: 700, color: '#D97706', background: '#FEF3C7', padding: '2px 8px', borderRadius: 4 }}>Retroativa</span>}
              {visita.acionar_pos_vendas && <span style={{ fontSize: 10, fontWeight: 700, color: '#EA580C', background: '#FFF7ED', padding: '2px 8px', borderRadius: 4 }}>Pós Vendas</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B' }}>
            <X size={18} />
          </button>
        </div>

        {/* Corpo */}
        <div style={{ padding: '24px' }}>

          {/* Info principal */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563EB', flexShrink: 0 }}>
                <User size={18} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600 }}>VENDEDOR</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#1E293B' }}>{visita.vendedor_nome || '-'}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#047857', flexShrink: 0 }}>
                <Calendar size={18} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600 }}>DATA</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#1E293B' }}>{fmtData(visita.data_visita)}</div>
              </div>
            </div>
          </div>

          {/* Cliente e propriedade */}
          <div style={{ background: '#F8FAFC', borderRadius: 12, padding: '16px 18px', marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, marginBottom: 2 }}>CLIENTE</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#1E293B' }}>{visita.cliente_nome || '-'}</div>
              </div>
              {visita.propriedade_nome && (
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, marginBottom: 2 }}>PROPRIEDADE</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#1E293B' }}>{visita.propriedade_nome}</div>
                </div>
              )}
            </div>
          </div>

          {/* Resumo */}
          {visita.resumo && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <MessageSquare size={13} /> RESUMO DA VISITA
              </div>
              <div style={{ fontSize: 14, color: '#334155', lineHeight: 1.7, background: '#F8FAFC', borderRadius: 10, padding: '14px 16px', border: '1px solid #E2E8F0' }}>
                {visita.resumo}
              </div>
            </div>
          )}

          {/* Próximos passos */}
          {visita.proximos_passos && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <ArrowRight size={13} /> PRÓXIMOS PASSOS
              </div>
              <div style={{ fontSize: 14, color: '#334155', lineHeight: 1.7, background: '#FFF7ED', borderRadius: 10, padding: '14px 16px', border: '1px solid #FED7AA' }}>
                {visita.proximos_passos}
              </div>
            </div>
          )}

          {/* Data próximo contato */}
          {visita.data_proximo_contato && (
            <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#EFF6FF', borderRadius: 10, border: '1px solid #DBEAFE' }}>
              <Calendar size={16} color="#2563EB" />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#1D4ED8' }}>Próximo contato: {fmtData(visita.data_proximo_contato)}</span>
            </div>
          )}

          {/* GPS */}
          {(visita.latitude && visita.longitude) ? (
            <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#F0FDF4', borderRadius: 10, border: '1px solid #BBF7D0' }}>
              <Navigation size={16} color="#047857" />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#047857' }}>GPS: {Number(visita.latitude).toFixed(6)}, {Number(visita.longitude).toFixed(6)}</span>
              {visita.gps_accuracy && <span style={{ fontSize: 11, color: '#94A3B8' }}>({Math.round(visita.gps_accuracy)}m precisão)</span>}
              <button onClick={() => window.open(`https://maps.google.com/?q=${visita.latitude},${visita.longitude}`, '_blank')}
                style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 6, border: 'none', background: '#047857', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                Abrir Maps
              </button>
            </div>
          ) : (
            visita.tipo === 'presencial' && (
              <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#FEF2F2', borderRadius: 10, border: '1px solid #FECACA' }}>
                <MapPin size={16} color="#DC2626" />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#DC2626' }}>Visita presencial sem GPS registrado</span>
              </div>
            )
          )}

          {/* Foto */}
          {fotoUrl && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Camera size={13} /> FOTO
              </div>
              <img src={fotoUrl} alt="Foto da visita" style={{ width: '100%', borderRadius: 10, border: '1px solid #E2E8F0', maxHeight: 300, objectFit: 'cover' }} />
            </div>
          )}

          {/* Máquinas / Negócio */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {visita.maquina_ids && visita.maquina_ids.length > 0 && (
              <div style={{ fontSize: 12, color: '#64748B', background: '#F1F5F9', padding: '6px 12px', borderRadius: 8 }}>
                Máquinas: {visita.maquina_ids.join(', ')}
              </div>
            )}
            {visita.negocio_id && (
              <div style={{ fontSize: 12, color: '#7C3AED', background: '#F5F3FF', padding: '6px 12px', borderRadius: 8, fontWeight: 600 }}>
                Negócio #{visita.negocio_id}
              </div>
            )}
            {visita.pessoa_ids && visita.pessoa_ids.length > 0 && (
              <div style={{ fontSize: 12, color: '#64748B', background: '#F1F5F9', padding: '6px 12px', borderRadius: 8 }}>
                Pessoas: {visita.pessoa_ids.join(', ')}
              </div>
            )}
          </div>

          {/* Metadados */}
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #F1F5F9', display: 'flex', gap: 16, fontSize: 11, color: '#CBD5E1' }}>
            <span>ID: {visita.id}</span>
            <span>Criado: {fmtData(visita.created_at)}</span>
            <span>Sync: {visita.status_sync}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
