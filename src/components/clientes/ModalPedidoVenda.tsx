'use client'

// Janela do Pedido de Venda (peças de balcão, sem OS) na Pasta Clientes: itens,
// valores, documentos e a NF de peça (ver / trocar / anexar). Os documentos abrem
// no visualizador do portal (onVerDocumento), igual à janela da OS.
import { X, Package, FileText, Check, Clock, Upload, Calendar, Hash, Receipt } from 'lucide-react'

export type PedidoModal = {
  num_pedido: string; cod_pedido: number; empresa: string; cliente_nome: string
  data_previsao: string | null; data_inclusao: string | null; etapa: string
  valor_total: number; cancelado: boolean; faturado: boolean
  numero_nf: string; link_nf: string; itens: { codigo?: string; descricao?: string; desc?: string; quantidade?: number; valor_unitario?: number; valor_total?: number }[]
  observacoes: string; pv_pdf?: string | null; ppv_id?: string | null; ppv_real?: boolean
  nf_status?: string | null; nf_motivo?: string | null
  financeiro?: { nf_peca: string | null; num_nf_peca: string | null } | null
}
export type DocVer = { titulo: string; nome: string; url: string }

const R$ = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBR = (d: string | null) => { const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : '—' }
const fmtNF = (n: string | null | undefined) => String(n || '').trim().replace(/^0+(?=\d)/, '')
const LBL: React.CSSProperties = { display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: '#94A3B8' }

export default function ModalPedidoVenda({ pv, clienteNome, onFechar, onVerDocumento, onAnexarNF, anexando }: {
  pv: PedidoModal; clienteNome: string; onFechar: () => void
  onVerDocumento: (d: DocVer) => void
  onAnexarNF: (f: File, substituir: boolean) => void
  anexando: boolean
}) {
  const st = pv.cancelado ? { rot: 'Cancelado', cor: '#B91C1C', fundo: '#FEF2F2', borda: '#FECACA' }
    : pv.faturado ? { rot: 'Faturado', cor: '#047857', fundo: '#ECFDF5', borda: '#A7F3D0' }
    : { rot: pv.etapa || 'Em aberto', cor: '#B45309', fundo: '#FFFBEB', borda: '#FDE68A' }
  const itens = Array.isArray(pv.itens) ? pv.itens : []
  const somaItens = itens.reduce((s, i) => s + (Number(i.valor_total) || 0), 0)
  const linkNF = pv.link_nf || pv.financeiro?.nf_peca || ''
  const numNF = fmtNF(pv.numero_nf || pv.financeiro?.num_nf_peca)
  const urlPV = pv.pv_pdf || `/api/clientes/print?tipo=pv&cod=${pv.cod_pedido}&empresa=${encodeURIComponent(pv.empresa)}`
  const castro = /castro/i.test(pv.empresa)
  // observações do Omie vêm com "|" no lugar de quebra de linha
  const obs = String(pv.observacoes || '').split('|').map(s => s.trim()).filter(Boolean)

  const BTN_VER: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fefefe', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }
  const BTN_SEC: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: '1px solid #E5E7EB', background: 'var(--portal-bg-card, #fff)', color: '#334155', fontSize: 12.5, fontWeight: 700, cursor: anexando ? 'wait' : 'pointer', whiteSpace: 'nowrap' }
  const linhaDoc = (icone: React.ReactNode, cor: string, fundo: string, titulo: string, detalhe: React.ReactNode, acoes: React.ReactNode, detalheCor?: string, primeira?: boolean) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '11px 14px', borderTop: primeira ? 'none' : '1px solid #F1F5F9' }}>
      <span style={{ width: 34, height: 34, borderRadius: 10, background: fundo, color: cor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icone}</span>
      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--portal-text, #0f172a)' }}>{titulo}</div>
        <div style={{ fontSize: 12, color: detalheCor || '#64748B', marginTop: 1, lineHeight: 1.4 }}>{detalhe}</div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>{acoes}</div>
    </div>
  )
  const inputArquivo = (substituir: boolean) => (
    <input type="file" accept="application/pdf" style={{ display: 'none' }} disabled={anexando}
      onChange={e => { const f = e.target.files?.[0]; if (f) onAnexarNF(f, substituir); e.target.value = '' }} />
  )

  return (
    <div className="cli-overlay" onClick={onFechar}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="cli-modal" onClick={e => e.stopPropagation()}
        style={{ background: 'var(--portal-bg-card, #fff)', borderRadius: 16, width: '100%', maxWidth: 820, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.25)' }}>
        {/* Fechar preso no topo */}
        <div style={{ position: 'sticky', top: 0, height: 0, zIndex: 5 }}>
          <button onClick={onFechar} title="Fechar"
            style={{ position: 'absolute', top: 10, right: 10, width: 32, height: 32, borderRadius: '50%', border: '1px solid #E5E7EB', background: 'var(--portal-bg-card, #fff)', color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 8px rgba(16,24,40,0.15)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Cabeçalho */}
        <div style={{ padding: '22px 64px 18px 26px', borderBottom: '2px solid #0F172A', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <span style={{ width: 44, height: 44, borderRadius: 12, background: '#FFF7ED', color: '#C2410C', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Package size={22} /></span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: '#94A3B8' }}>Pedido de venda · peças de balcão</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--portal-text, #0f172a)', lineHeight: 1.1 }}>
                PV {pv.num_pedido}
                {castro && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: '#EFF6FF', color: '#1D4ED8', verticalAlign: 'middle' }}>CASTRO</span>}
              </div>
              <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 3 }}>{pv.cliente_nome || clienteNome}</div>
            </div>
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: st.cor, background: st.fundo, border: `1px solid ${st.borda}`, padding: '4px 11px', borderRadius: 999 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.cor }} />{st.rot}
          </span>
        </div>

        <div style={{ padding: '18px 26px 24px' }}>
          {/* Informações */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden', marginBottom: 18 }}>
            {[
              { rot: 'Valor total', val: R$(pv.valor_total), cor: '#C2410C', icone: <Receipt size={12} /> },
              { rot: 'Data', val: dataBR(pv.data_previsao || pv.data_inclusao), icone: <Calendar size={12} /> },
              { rot: 'NF de peça', val: numNF || '—', cor: numNF ? undefined : '#94A3B8', icone: <Hash size={12} /> },
              { rot: 'Itens', val: String(itens.length), icone: <Package size={12} /> },
            ].map((c, i) => (
              <div key={c.rot} style={{ padding: '12px 16px', borderLeft: i ? '1px solid #F1F5F9' : 'none' }}>
                <span style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 5 }}>{c.icone} {c.rot}</span>
                <div style={{ fontSize: 17, fontWeight: 800, color: c.cor || 'var(--portal-text, #0f172a)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{c.val}</div>
              </div>
            ))}
          </div>

          {/* Itens */}
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text, #0f172a)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Peças do pedido</div>
          <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden', marginBottom: 18 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                <thead><tr style={{ background: '#F8FAFC' }}>
                  {['Código', 'Descrição', 'Qtd', 'Unitário', 'Total'].map((h, i) => (
                    <th key={h} style={{ padding: '8px 12px', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#64748B', textAlign: i >= 2 ? 'right' : 'left', borderBottom: '1px solid #E5E7EB' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {itens.length === 0 ? (
                    <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', fontSize: 13, color: '#94A3B8' }}>Sem itens registrados.</td></tr>
                  ) : itens.map((it, i) => (
                    <tr key={i}>
                      <td style={{ padding: '8px 12px', borderBottom: '1px solid #F1F5F9', fontFamily: 'ui-monospace, monospace', fontSize: 11.5, color: '#C2410C', fontWeight: 600, whiteSpace: 'nowrap' }}>{it.codigo || '—'}</td>
                      <td style={{ padding: '8px 12px', borderBottom: '1px solid #F1F5F9', fontSize: 13, color: '#334155' }}>{it.descricao || it.desc || '—'}</td>
                      <td style={{ padding: '8px 12px', borderBottom: '1px solid #F1F5F9', fontSize: 13, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#64748B' }}>{it.quantidade ?? '—'}</td>
                      <td style={{ padding: '8px 12px', borderBottom: '1px solid #F1F5F9', fontSize: 13, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#64748B', whiteSpace: 'nowrap' }}>{it.valor_unitario != null ? R$(it.valor_unitario) : '—'}</td>
                      <td style={{ padding: '8px 12px', borderBottom: '1px solid #F1F5F9', fontSize: 13, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, whiteSpace: 'nowrap' }}>{R$(Number(it.valor_total) || 0)}</td>
                    </tr>
                  ))}
                </tbody>
                {itens.length > 0 && (
                  <tfoot><tr style={{ background: '#F8FAFC' }}>
                    <td colSpan={4} style={{ padding: '9px 12px', fontSize: 12, fontWeight: 700, color: '#64748B', textAlign: 'right' }}>
                      Total das peças{Math.abs(somaItens - pv.valor_total) > 0.5 ? ` (pedido: ${R$(pv.valor_total)})` : ''}
                    </td>
                    <td style={{ padding: '9px 12px', fontSize: 14, fontWeight: 800, color: '#C2410C', textAlign: 'right', whiteSpace: 'nowrap' }}>{R$(somaItens)}</td>
                  </tr></tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Documentos e nota fiscal */}
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text, #0f172a)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Documentos e nota fiscal</div>
          <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden', marginBottom: obs.length ? 18 : 0 }}>
            {linhaDoc(<Package size={16} />, '#C2410C', '#FFF7ED', `Pedido de Venda ${pv.num_pedido}`,
              pv.ppv_real ? `PPV do portal${pv.ppv_id ? ` (${pv.ppv_id})` : ''}` : 'PDF oficial do Omie',
              <button onClick={() => onVerDocumento({ titulo: `Pedido de Venda ${pv.num_pedido}`, nome: `PV-${pv.num_pedido}`, url: urlPV })} style={BTN_VER}><FileText size={14} /> Ver</button>,
              undefined, true)}
            {linkNF
              ? linhaDoc(<Check size={16} strokeWidth={3} />, '#059669', '#ECFDF5', `NF de Peça${numNF ? ` nº ${numNF}` : ''}`, 'PDF guardado na pasta', <>
                  <button onClick={() => onVerDocumento({ titulo: `NF de Peça${numNF ? ` nº ${numNF}` : ''} · PV ${pv.num_pedido}`, nome: `NF-peca-${numNF || pv.num_pedido}`, url: linkNF })} style={BTN_VER}><FileText size={14} /> Ver</button>
                  {pv.link_nf && <label title="Enviar outro PDF no lugar desta nota" style={BTN_SEC}><Upload size={14} /> {anexando ? 'Enviando...' : 'Trocar PDF'}{inputArquivo(true)}</label>}
                </>)
              : pv.cancelado
                ? linhaDoc(<FileText size={15} />, '#94A3B8', '#F8FAFC', 'NF de Peça', 'Pedido cancelado — sem nota', null)
                : pv.nf_motivo
                  ? linhaDoc(<X size={16} strokeWidth={3} />, '#DC2626', '#FEF2F2', 'NF de Peça', `Não autorizada na SEFAZ${pv.nf_status ? ` (status ${pv.nf_status})` : ''}: ${pv.nf_motivo}`,
                      <label style={{ ...BTN_SEC, border: 'none', background: '#B91C1C', color: '#fefefe' }}><Upload size={14} /> {anexando ? 'Enviando...' : 'Anexar'}{inputArquivo(false)}</label>, '#B91C1C')
                  : linhaDoc(<Clock size={15} strokeWidth={2.5} />, '#D97706', '#FFFBEB', 'NF de Peça', pv.faturado ? 'Não veio do Omie — anexe o PDF da nota' : 'Sai quando o pedido for faturado',
                      pv.faturado ? <label style={{ ...BTN_SEC, borderColor: '#F59E0B', background: '#FFFBEB', color: '#B45309' }}><Upload size={14} /> {anexando ? 'Enviando...' : 'Anexar'}{inputArquivo(false)}</label> : null,
                      pv.faturado ? '#92400E' : undefined)}
          </div>

          {/* Observações */}
          {obs.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text, #0f172a)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Observações</div>
              <div style={{ padding: '12px 16px', borderRadius: 12, background: '#F8FAFC', border: '1px solid #E5E7EB', fontSize: 13, color: '#334155', lineHeight: 1.6 }}>
                {obs.map((l, i) => {
                  const url = l.match(/https?:\/\/\S+/)?.[0]
                  if (!url) return <div key={i}>{l}</div>
                  const [antes] = l.split(url)
                  return <div key={i}>{antes}<a href={url} target="_blank" rel="noopener noreferrer" style={{ color: '#2563EB', fontWeight: 600 }}>{url.replace(/^https?:\/\/[^/]+/, '')}</a></div>
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
