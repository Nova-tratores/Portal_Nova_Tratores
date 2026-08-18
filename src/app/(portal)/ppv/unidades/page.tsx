'use client'
// RASTREIO DE UNIDADES (QR) — fila do departamento de peças: retiradas
// aguardando liberação, liberadas, devoluções pra conferir, estoque etc.
// Ações (liberar/recusar/receber/…) vão pra /api/pecas/unidades/[id]/acoes;
// quem valida permissão é o servidor (ppv puro | ppv:rastreio_liberar | admin).
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import QRCode from 'qrcode'
import { ArrowLeft, Check, ExternalLink, Loader2, Printer, QrCode, RefreshCw, X } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { authHeaders } from '@/lib/auth/client'
import SemPermissao from '@/components/SemPermissao'
import QRUnidadeModal from '@/components/ppv/QRUnidadeModal'
import PecasNav from '@/components/ppv/PecasNav'
import { htmlFolha, type BlocoEtiqueta } from '@/lib/ppv/etiquetas-html'
import { STATUS_LABEL, STATUS_COR, DESTINO_LABEL, EMPRESA_LABEL, EMPRESA_COR, type PecaUnidade, type UnidadeStatus } from '@/lib/pecas/unidades'

const ABAS: { id: string; rotulo: string; status: UnidadeStatus[] }[] = [
  { id: 'pendentes', rotulo: 'Aguardando liberação', status: ['retirada_pendente'] },
  { id: 'liberadas', rotulo: 'Liberadas', status: ['liberada'] },
  { id: 'devolucoes', rotulo: 'Devoluções', status: ['devolucao_pendente'] },
  { id: 'estoque', rotulo: 'Em estoque', status: ['estoque'] },
  { id: 'todas', rotulo: 'Todas', status: [] },
]

function fmtDataHora(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function UnidadesRastreioPage() {
  const { userProfile } = useAuth()
  const { pode, loading: pLoading } = usePermissoes(userProfile?.id)

  const [aba, setAba] = useState('pendentes')
  const [q, setQ] = useState('')
  const [linhas, setLinhas] = useState<PecaUnidade[]>([])
  const [total, setTotal] = useState(0)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [agindo, setAgindo] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [qrModal, setQrModal] = useState<PecaUnidade | null>(null)

  const abaDef = useMemo(() => ABAS.find(a => a.id === aba) || ABAS[0], [aba])
  const podeLiberar = pode('ppv', 'rastreio_liberar')

  const buscar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      const params = new URLSearchParams({ limit: '200' })
      if (abaDef.status.length) params.set('status', abaDef.status.join(','))
      if (q.trim()) params.set('q', q.trim())
      const r = await fetch(`/api/pecas/unidades?${params}`, { headers: await authHeaders() })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Falha ao carregar')
      setLinhas(j.unidades || [])
      setTotal(j.total || 0)
      setSel(new Set())
    } catch (e) {
      setErro(String(e instanceof Error ? e.message : e))
    } finally {
      setCarregando(false)
    }
  }, [abaDef, q])

  useEffect(() => { buscar() }, [buscar])

  // mesmo critério do GET da API: ppv puro OU o granular rastreio_liberar
  if (!pLoading && userProfile && !pode('ppv', 'rastreio_liberar')) return <SemPermissao />

  // POST de uma ação — compartilhado pelo botão individual e pelo lote
  const postAcao = async (id: string, acao: string, extra: Record<string, unknown>, headers: Record<string, string>) => {
    const r = await fetch(`/api/pecas/unidades/${id}/acoes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ acao, ...extra }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || 'Falha na ação')
  }

  const agir = async (u: PecaUnidade, acao: string, extra: Record<string, unknown> = {}) => {
    setAgindo(`${u.id}:${acao}`)
    setErro('')
    try {
      await postAcao(u.id, acao, extra, await authHeaders())
    } catch (e) {
      setErro(String(e instanceof Error ? e.message : e))
    } finally {
      setAgindo('')
      await buscar()
    }
  }

  // Lote: não aborta na primeira falha — libera o que der e reporta o resto
  const liberarSelecionadas = async () => {
    const ids = [...sel]
    if (ids.length === 0) return
    setAgindo('lote')
    setErro('')
    const headers = await authHeaders()
    const falhas: string[] = []
    for (const id of ids) {
      try {
        await postAcao(id, 'liberar', {}, headers)
      } catch (e) {
        const u = linhas.find(l => l.id === id)
        falhas.push(`${u?.numero || id}: ${e instanceof Error ? e.message : e}`)
      }
    }
    if (falhas.length) setErro(`${falhas.length} não liberada(s) — ${falhas.slice(0, 3).join(' · ')}${falhas.length > 3 ? ' · …' : ''}`)
    setAgindo('')
    await buscar()
  }

  // Reimprime a etiqueta da unidade (perdeu/rasgou) — MESMO uuid/QR
  const reimprimir = async (u: PecaUnidade) => {
    const w = window.open('', '_blank')
    if (!w) return
    try {
      const qrSvg = await QRCode.toString(`${window.location.origin}/p/${u.id}`, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' })
      const bloco: BlocoEtiqueta = {
        linhas: [
          { empresa: EMPRESA_LABEL[u.conta_omie] || u.conta_omie, codigo: u.codigo, descricao: u.descricao, locacao: u.locacao },
          ...(u.alt_codigo ? [{ empresa: EMPRESA_LABEL[u.alt_conta_omie || ''] || u.alt_conta_omie || '', codigo: u.alt_codigo, descricao: u.alt_descricao || '', locacao: u.alt_locacao || '' }] : []),
        ],
        qrSvg,
        numero: u.numero,
      }
      w.document.write(htmlFolha([bloco], new Set()))
      w.document.close()
    } catch {
      w.close()
    }
  }

  const selStyle: React.CSSProperties = { padding: '9px 12px', border: '1px solid var(--portal-border)', borderRadius: 8, fontSize: 13, background: 'var(--portal-bg-card)', color: 'var(--portal-text)' }
  const btnMini = (bg: string, cor = '#fff'): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 7,
    border: 'none', background: bg, color: cor, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
  })

  return (
    <div className="pecas-skin">
    <PecasNav />
    <div style={{ padding: '18px 22px', maxWidth: 1200, margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <Link href="/ppv" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--portal-text-muted)', textDecoration: 'none' }}>
          <ArrowLeft size={15} /> PPV
        </Link>
        <h1 style={{ fontSize: 19, fontWeight: 800, color: 'var(--portal-text)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <QrCode size={18} color="#EA580C" /> Rastreio de unidades
        </h1>
        <button onClick={buscar} title="Atualizar" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--portal-border)', background: 'transparent', color: 'var(--portal-text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          <RefreshCw size={13} /> Atualizar
        </button>
      </div>

      <p style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)', margin: '0 0 12px', lineHeight: 1.6 }}>
        Cada etiqueta com QR é uma unidade física. Quem pega escaneia e marca &quot;peguei&quot;; aqui o departamento
        <strong> libera</strong> a retirada, confere <strong>devoluções</strong> e acompanha o ciclo — peça retirada pra OS é
        abatida sozinha quando o técnico envia o relatório.
      </p>

      {/* Abas */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {ABAS.map(a => (
          <button key={a.id} onClick={() => setAba(a.id)} style={{
            padding: '7px 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
            border: aba === a.id ? '2px solid #EA580C' : '1px solid var(--portal-border)',
            background: aba === a.id ? 'rgba(13,148,136,.08)' : 'var(--portal-bg-card)',
            color: aba === a.id ? '#EA580C' : 'var(--portal-text-secondary)',
          }}>{a.rotulo}</button>
        ))}
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar código, UN-, nome ou OS…" style={{ ...selStyle, marginLeft: 'auto', minWidth: 230 }} />
      </div>

      {erro && <div style={{ fontSize: 12.5, color: '#dc2626', fontWeight: 600, marginBottom: 10 }}>{erro}</div>}

      {/* Lote */}
      {aba === 'pendentes' && podeLiberar && sel.size > 0 && (
        <div style={{ marginBottom: 10 }}>
          <button onClick={liberarSelecionadas} disabled={agindo === 'lote'} style={{ ...btnMini('#2563eb'), padding: '8px 16px', fontSize: 12.5 }}>
            <Check size={13} /> {agindo === 'lote' ? 'Liberando…' : `Liberar selecionadas (${sel.size})`}
          </button>
        </div>
      )}

      {/* Tabela */}
      <div style={{ border: '1px solid var(--portal-border)', borderRadius: 10, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: 'var(--portal-bg-secondary)', textAlign: 'left' }}>
              {aba === 'pendentes' && podeLiberar && <th style={{ padding: '8px 8px', width: 26 }} />}
              <th style={{ padding: '8px 10px', width: 90 }}>Unidade</th>
              <th style={{ padding: '8px 10px' }}>Peça</th>
              <th style={{ padding: '8px 10px', width: 160 }}>Locação</th>
              <th style={{ padding: '8px 10px', width: 150 }}>Status</th>
              <th style={{ padding: '8px 10px', width: 180 }}>Retirada por</th>
              <th style={{ padding: '8px 10px', width: 130 }}>Destino</th>
              <th style={{ padding: '8px 10px', width: 250 }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {carregando && (
              <tr><td colSpan={8} style={{ padding: 18, textAlign: 'center', color: 'var(--portal-text-muted)' }}>
                <Loader2 size={15} className="animate-spin" style={{ verticalAlign: -3, marginRight: 6 }} /> Carregando…
              </td></tr>
            )}
            {!carregando && linhas.length === 0 && (
              <tr><td colSpan={8} style={{ padding: 18, textAlign: 'center', color: 'var(--portal-text-muted)' }}>
                Nenhuma unidade {abaDef.status.length ? `em "${abaDef.rotulo.toLowerCase()}"` : 'registrada'} — imprima etiquetas com &quot;Rastrear unidades (QR)&quot; ligado na tela de Etiquetas.
              </td></tr>
            )}
            {!carregando && linhas.map(u => (
              <tr key={u.id} style={{ borderTop: '1px solid var(--portal-border)' }}>
                {aba === 'pendentes' && podeLiberar && (
                  <td style={{ padding: '7px 8px' }}>
                    <input type="checkbox" checked={sel.has(u.id)} onChange={() => setSel(prev => { const s = new Set(prev); if (s.has(u.id)) s.delete(u.id); else s.add(u.id); return s })} />
                  </td>
                )}
                <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--portal-text)', whiteSpace: 'nowrap' }}>{u.numero}</td>
                <td style={{ padding: '7px 10px' }}>
                  <span style={{ display: 'inline-block', fontSize: 9.5, fontWeight: 800, padding: '1px 8px', borderRadius: 999, color: '#fff', background: EMPRESA_COR[u.conta_omie] || '#6b7280', marginRight: 6 }}>
                    {u.conta_omie}
                  </span>
                  <strong style={{ fontFamily: 'monospace' }}>{u.codigo}</strong>
                  {u.alt_codigo && <span style={{ color: 'var(--portal-text-muted)' }}> / {u.alt_codigo}</span>}
                  <div style={{ fontSize: 11.5, color: 'var(--portal-text-secondary)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.descricao}</div>
                </td>
                <td style={{ padding: '7px 10px', color: 'var(--portal-text-secondary)', fontSize: 11.5 }}>{u.locacao || '—'}</td>
                <td style={{ padding: '7px 10px' }}>
                  <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 999, color: '#fff', background: STATUS_COR[u.status] || '#64748b', whiteSpace: 'nowrap' }}>
                    {STATUS_LABEL[u.status] || u.status}
                  </span>
                </td>
                <td style={{ padding: '7px 10px', fontSize: 11.5, color: 'var(--portal-text)' }}>
                  {u.retirado_por_nome || '—'}
                  {u.retirado_em && <div style={{ color: 'var(--portal-text-muted)' }}>{fmtDataHora(u.retirado_em)}</div>}
                </td>
                <td style={{ padding: '7px 10px', fontSize: 11.5 }}>
                  {u.destino_tipo === 'os' && u.destino_os
                    ? <a href={`/pos?os=${encodeURIComponent(u.destino_os)}`} target="_blank" rel="noreferrer" style={{ color: '#0ea5e9', fontWeight: 700 }}>{u.destino_os}</a>
                    : u.destino_tipo ? DESTINO_LABEL[u.destino_tipo] : '—'}
                </td>
                <td style={{ padding: '7px 10px' }}>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {u.status === 'retirada_pendente' && podeLiberar && (
                      <>
                        <button onClick={() => agir(u, 'liberar')} disabled={!!agindo} style={btnMini('#2563eb')}>
                          <Check size={12} /> {agindo === `${u.id}:liberar` ? '…' : 'Liberar'}
                        </button>
                        <button onClick={() => { const m = prompt('Motivo da recusa:'); if (m != null && m.trim()) agir(u, 'recusar', { motivo: m.trim() }) }} disabled={!!agindo} style={btnMini('#fff', '#dc2626')}>
                          <X size={12} /> Recusar
                        </button>
                      </>
                    )}
                    {u.status === 'liberada' && podeLiberar && (
                      <>
                        <button onClick={() => agir(u, 'concluir')} disabled={!!agindo} style={btnMini('#111827')}>Concluir</button>
                        <button onClick={() => { const m = prompt('Motivo da devolução (opcional):') || ''; agir(u, 'devolver', { motivo: m.trim() }) }} disabled={!!agindo} style={btnMini('#fff', '#334155')}>Devolver</button>
                      </>
                    )}
                    {u.status === 'devolucao_pendente' && podeLiberar && (
                      <button onClick={() => agir(u, 'receber_devolucao')} disabled={!!agindo} style={btnMini('#16a34a')}>
                        <Check size={12} /> Receber
                      </button>
                    )}
                    {u.status === 'extraviada' && podeLiberar && (
                      <button onClick={() => agir(u, 'recuperar')} disabled={!!agindo} style={btnMini('#16a34a')}>Recuperar</button>
                    )}
                    <button onClick={() => setQrModal(u)} title="Ver QR / copiar link" style={btnMini('#fff', '#334155')}>
                      <QrCode size={12} /> QR
                    </button>
                    <button onClick={() => reimprimir(u)} title="Reimprimir etiqueta (mesmo QR)" style={btnMini('#fff', '#334155')}>
                      <Printer size={12} />
                    </button>
                    <a href={`/p/${u.id}`} target="_blank" rel="noreferrer" title="Abrir página de rastreio" style={{ ...btnMini('#fff', '#0ea5e9'), textDecoration: 'none' }}>
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--portal-text-muted)' }}>{total} unidade(s) no filtro</div>

      {qrModal && <QRUnidadeModal unidadeId={qrModal.id} numero={qrModal.numero} codigo={qrModal.codigo} onClose={() => setQrModal(null)} />}
    </div>
    </div>
  )
}
