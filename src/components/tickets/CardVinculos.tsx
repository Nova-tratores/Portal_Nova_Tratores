'use client'
// Card "Requisições" da barra lateral do ticket: requisições vinculadas com
// resumo (status, fornecedor, valor), link pro card e o mapa de cotações
// expansível (req_cotacao é 1:1 com a requisição — vem junto do vínculo).
import { useState } from 'react'
import { Link2, Plus, X, ExternalLink, ChevronDown, AlertTriangle, Paperclip } from 'lucide-react'
import RequisicaoSelect from './RequisicaoSelect'
import { formatarBRL, statusReqInfo, type TicketVinculoEnriquecido, type RequisicaoResumo } from '@/lib/tickets/vinculos'

interface Props {
  vinculos: TicketVinculoEnriquecido[]
  podeEditar: boolean
  agindo: boolean
  cartao: React.CSSProperties
  onVincular: (r: RequisicaoResumo) => void
  onDesvincular: (v: TicketVinculoEnriquecido) => void
}

export default function CardVinculos({ vinculos, podeEditar, agindo, cartao, onVincular, onDesvincular }: Props) {
  const [adicionando, setAdicionando] = useState(false)
  const [expandido, setExpandido] = useState<Record<string, boolean>>({})

  return (
    <div style={cartao}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: 'var(--portal-text-secondary,#555)', textTransform: 'uppercase', letterSpacing: .4 }}>
          <Link2 size={13} /> Requisições
          {vinculos.length > 0 && <span style={{ fontWeight: 600, color: 'var(--portal-text-muted,#999)' }}>({vinculos.length})</span>}
        </span>
        {podeEditar && (
          <button onClick={() => setAdicionando((v) => !v)} title="Vincular requisição" disabled={agindo}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--portal-text-muted,#999)', display: 'flex' }}>
            {adicionando ? <X size={15} /> : <Plus size={15} />}
          </button>
        )}
      </div>

      {adicionando && (
        <div style={{ marginBottom: 10 }}>
          <RequisicaoSelect
            excluir={vinculos.map((v) => v.vinculo_ref)}
            onEscolher={(r) => { setAdicionando(false); onVincular(r) }}
          />
        </div>
      )}

      {vinculos.length === 0 && !adicionando && (
        <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted,#999)' }}>
          Nenhuma requisição vinculada{podeEditar ? ' — use o + para ligar uma.' : '.'}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {vinculos.map((v) => {
          const r = v.requisicao
          const st = statusReqInfo(r?.status)
          const aberto = !!expandido[v.id]
          const temCotacoes = v.cotacoes.length > 0
          return (
            <div key={v.id} style={{ border: '1px solid var(--portal-border,#eee)', borderRadius: 10, padding: '8px 10px', background: 'var(--portal-bg,#fafafa)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--portal-text,#111)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={v.vinculo_label}>
                    <strong>#{v.vinculo_ref}</strong> {r ? r.titulo : v.vinculo_label.replace(/^#\d+\s*/, '')}
                  </div>
                  {v.existe && r ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 3, fontSize: 11.5, color: 'var(--portal-text-muted,#888)' }}>
                      <span style={{ padding: '1px 7px', borderRadius: 999, fontWeight: 700, fontSize: 10.5, color: st.cor, background: st.fundo }}>{st.label}</span>
                      {r.fornecedor && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>{r.fornecedor}</span>}
                      <span style={{ fontWeight: 700, color: 'var(--portal-text-secondary,#555)' }}>{formatarBRL(r.valor, r.valor_cru)}</span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3, fontSize: 11.5, color: '#d97706' }}>
                      <AlertTriangle size={12} /> requisição não encontrada
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                  <a href={`/requisicoes?req=${encodeURIComponent(v.vinculo_ref)}`} target="_blank" rel="noopener noreferrer" title="Abrir requisição"
                    style={{ color: 'var(--portal-text-muted,#999)', display: 'flex', padding: 3 }}>
                    <ExternalLink size={13} />
                  </a>
                  {podeEditar && (
                    <button onClick={() => onDesvincular(v)} title="Desvincular" disabled={agindo}
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--portal-text-muted,#bbb)', display: 'flex', padding: 3 }}>
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>

              {v.existe && (
                <button type="button" onClick={() => setExpandido((m) => ({ ...m, [v.id]: !aberto }))} disabled={!temCotacoes}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, border: 'none', background: 'transparent',
                    cursor: temCotacoes ? 'pointer' : 'default', fontSize: 11.5, padding: 0,
                    color: temCotacoes ? 'var(--portal-text-secondary,#555)' : 'var(--portal-text-muted,#aaa)',
                  }}>
                  {temCotacoes
                    ? <><ChevronDown size={12} style={{ transition: 'transform .15s', transform: aberto ? 'rotate(180deg)' : 'none' }} /> {v.cotacoes.length} {v.cotacoes.length === 1 ? 'cotação' : 'cotações'}</>
                    : 'sem cotações'}
                </button>
              )}

              {aberto && temCotacoes && (
                <div style={{ marginTop: 6, overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                    <thead>
                      <tr style={{ color: 'var(--portal-text-muted,#888)', textAlign: 'left' }}>
                        <th style={{ padding: '3px 4px', fontWeight: 700 }}>#</th>
                        <th style={{ padding: '3px 4px', fontWeight: 700 }}>Fornecedor</th>
                        <th style={{ padding: '3px 4px', fontWeight: 700 }}>Serviço/Material</th>
                        <th style={{ padding: '3px 4px', fontWeight: 700, textAlign: 'right' }}>Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {v.cotacoes.map((c) => (
                        <tr key={c.n} style={{ borderTop: '1px solid var(--portal-border,#eee)', color: 'var(--portal-text,#111)' }}>
                          <td style={{ padding: '4px', verticalAlign: 'top' }}>{c.n}</td>
                          <td style={{ padding: '4px', verticalAlign: 'top' }}>
                            {c.fornecedor}
                            {c.anexo_url && (
                              <a href={c.anexo_url} target="_blank" rel="noopener noreferrer" title="Abrir anexo da cotação"
                                style={{ display: 'inline-flex', verticalAlign: 'middle', marginLeft: 5, color: '#ea580c' }}>
                                <Paperclip size={11} />
                              </a>
                            )}
                            {c.obs && <div style={{ fontSize: 10.5, color: 'var(--portal-text-muted,#888)', whiteSpace: 'pre-wrap' }}>{c.obs}</div>}
                          </td>
                          <td style={{ padding: '4px', verticalAlign: 'top' }}>{c.servico_material || '—'}</td>
                          <td style={{ padding: '4px', verticalAlign: 'top', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>{formatarBRL(c.valor, c.valor_cru)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
