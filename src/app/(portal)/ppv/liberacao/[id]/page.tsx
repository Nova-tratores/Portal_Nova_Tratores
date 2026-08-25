'use client'
// LIBERAÇÃO DE PEÇAS POR PPV (mobile-first) — o departamento de peças abre o
// pedido no celular, marca QUEM está pegando (usuário do portal) e escaneia o
// QR de cada unidade: peça já no pedido é RESERVADA/conferida; peça fora do
// pedido pode ser ADICIONADA na hora (scan-to-add). No fim, um botão libera
// todas as escaneadas de uma vez (retirado_por = usuário escolhido).
//
// PPV faturado/cancelado: banner de consulta; liberação tardia num faturado
// vai direto a 'aplicada' (o servidor decide via liberar-lote).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, CheckCircle2, Loader2, QrCode, ScanLine } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { authHeaders } from '@/lib/auth/client'
import SemPermissao from '@/components/SemPermissao'
import UserSelect from '@/components/tickets/UserSelect'
import QRScanner, { type QRScannerHandle, type ScanResultado } from '@/components/pecas/QRScanner'
import { api } from '@/lib/ppv/api'
import type { PPVDetalhes } from '@/lib/ppv/types'
import { STATUS_COR, STATUS_LABEL, norm, type PecaUnidade } from '@/lib/pecas/unidades'

interface PendenteAdicionar {
  unidade: { id: string; numero: string; codigo: string; descricao: string }
  preco: number
}

export default function LiberacaoPPVPage() {
  const params = useParams<{ id: string }>()
  const idPPV = decodeURIComponent(String(params?.id || ''))
  const { userProfile } = useAuth()
  const { pode, loading: pLoading } = usePermissoes(userProfile?.id)

  const [detalhes, setDetalhes] = useState<PPVDetalhes | null>(null)
  const [unidades, setUnidades] = useState<PecaUnidade[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [retirador, setRetirador] = useState('')
  const [scanAberto, setScanAberto] = useState(false)
  const [itemFoco, setItemFoco] = useState<string | null>(null)
  const [pendente, setPendente] = useState<PendenteAdicionar | null>(null)
  const [adicionando, setAdicionando] = useState(false)
  const [liberando, setLiberando] = useState(false)
  const [concluido, setConcluido] = useState<{ qtd: number; nome: string } | null>(null)
  // unidades conferidas (escaneadas) NESTA sessão — são as que o botão libera
  const conferidasRef = useRef<Set<string>>(new Set())
  const [, forceRender] = useState(0)
  const scannerRef = useRef<QRScannerHandle>(null)

  const recarregarUnidades = useCallback(async () => {
    try {
      const r = await fetch(`/api/pecas/unidades?destino_ppv=${encodeURIComponent(idPPV)}&limit=200`, {
        headers: await authHeaders(),
      })
      const j = await r.json().catch(() => ({}))
      if (r.ok) setUnidades(j.unidades || [])
    } catch { /* mantém a lista atual */ }
  }, [idPPV])

  useEffect(() => {
    if (!idPPV) return
    ;(async () => {
      try {
        const det = await api.buscarPedido(idPPV)
        setDetalhes(det)
      } catch (e) {
        setErro(String(e instanceof Error ? e.message : e))
      } finally {
        setCarregando(false)
      }
      void recarregarUnidades()
    })()
  }, [idPPV, recarregarUnidades])

  const podeLiberar = pode('ppv', 'rastreio_liberar')
  const podeAdicionarItem = pode('ppv', 'adicionar_item')

  const terminal = ['Concluída', 'Cancelada', 'Fechado', 'Cancelado'].includes(String(detalhes?.status || ''))
  const faturado = !!detalhes?.faturadoOmieEm
  const somenteConsulta = terminal && !faturado && String(detalhes?.status || '').startsWith('Cancel')

  // itens do pedido com saldo (mesma conta do PPVDrawer: Saída − Devolução)
  const itens = useMemo(() => {
    if (!detalhes) return []
    return (detalhes.produtos || []).map((p) => {
      const qtdDev = (detalhes.devolucoes || [])
        .filter((d) => d.codigo === p.codigo)
        .reduce((acc, d) => acc + d.quantidade, 0)
      return { ...p, saldo: p.quantidade - qtdDev }
    }).filter((p) => p.saldo > 0)
  }, [detalhes])

  const unidadesDe = useCallback((codigo: string) =>
    unidades.filter((u) =>
      (norm(u.codigo) === norm(codigo) || norm(u.alt_codigo) === norm(codigo))
      && ['retirada_pendente', 'liberada', 'aplicada'].includes(u.status)),
  [unidades])

  // gate SÓ depois de todos os hooks — no 1º render pLoading é sempre true e
  // os hooks rodam; um early return antes deles quebraria a contagem de hooks
  // no render seguinte ("Rendered fewer hooks than expected")
  if (!pLoading && userProfile && !podeLiberar) return <SemPermissao />

  const aLiberar = unidades.filter((u) => u.status === 'retirada_pendente' && conferidasRef.current.has(u.id))
  const reservadasNaoConferidas = unidades.filter((u) => u.status === 'retirada_pendente' && !conferidasRef.current.has(u.id))

  // ---- scan ----
  const chamarScanAdd = async (unidadeId: string, apenasVincular: boolean): Promise<Response> =>
    fetch('/api/ppv/pedidos/scan-add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ id_ppv: idPPV, unidade_id: unidadeId, apenas_vincular: apenasVincular }),
    })

  const onScan = async (unidadeId: string): Promise<ScanResultado> => {
    if (somenteConsulta) return { ok: false, mensagem: 'PPV cancelado — apenas consulta.' }
    // unidade já vinculada a este PPV? conferência local, sem round-trip
    const local = unidades.find((u) => u.id === unidadeId)
    if (local) {
      if (local.status === 'retirada_pendente') {
        if (conferidasRef.current.has(local.id)) return { ok: 'repetida', mensagem: `${local.numero} já escaneada` }
        conferidasRef.current.add(local.id)
        forceRender((n) => n + 1)
        return { ok: true, mensagem: `${local.numero} · ${local.codigo} conferida` }
      }
      if (local.status === 'liberada') return { ok: 'repetida', mensagem: `${local.numero} já liberada` }
      return { ok: false, mensagem: `${local.numero} está ${STATUS_LABEL[local.status].toLowerCase()}` }
    }
    // unidade nova: reserva (só vincula se o código já for item do pedido)
    const res = await chamarScanAdd(unidadeId, true)
    const j = await res.json().catch(() => ({}))
    if (res.ok) {
      conferidasRef.current.add(unidadeId)
      await recarregarUnidades()
      if (j.ja_vinculada) return { ok: 'repetida', mensagem: `${j.unidade?.numero || ''} já escaneada` }
      return { ok: true, mensagem: `${j.unidade?.numero || ''} · ${j.unidade?.codigo || ''} ✓` }
    }
    if (res.status === 422 && j.codigo_fora_do_ppv) {
      setPendente({ unidade: j.unidade, preco: Number(j.preco_sugerido) || 0 })
      return { ok: 'pausar' }
    }
    return { ok: false, mensagem: j.error || 'Falha ao registrar o scan.' }
  }

  const onDigitar = async (texto: string): Promise<ScanResultado> => {
    const un = texto.trim().toUpperCase()
    if (!/^UN-?\d+$/.test(un)) return { ok: false, mensagem: 'Digite o número da etiqueta (UN-000123).' }
    const numero = un.startsWith('UN-') ? un : `UN-${un.slice(2)}`
    try {
      const r = await fetch(`/api/pecas/unidades?q=${encodeURIComponent(numero)}&limit=5`, { headers: await authHeaders() })
      const j = await r.json().catch(() => ({}))
      const achada = (j.unidades || []).find((u: PecaUnidade) => u.numero === numero)
      if (!achada) return { ok: false, mensagem: `${numero} não encontrada.` }
      return onScan(achada.id)
    } catch {
      return { ok: false, mensagem: 'Falha ao buscar a etiqueta.' }
    }
  }

  const adicionarPendente = async () => {
    if (!pendente || adicionando) return
    setAdicionando(true)
    try {
      const res = await chamarScanAdd(pendente.unidade.id, false)
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErro(j.error || 'Falha ao adicionar o item.')
      } else {
        conferidasRef.current.add(pendente.unidade.id)
        setErro('')
        await recarregarUnidades()
        try { setDetalhes(await api.buscarPedido(idPPV)) } catch { /* segue */ }
      }
    } finally {
      setAdicionando(false)
      setPendente(null)
      scannerRef.current?.resume()
    }
  }

  const ignorarPendente = () => {
    setPendente(null)
    scannerRef.current?.resume()
  }

  const liberar = async () => {
    if (aLiberar.length === 0 || !retirador || liberando) return
    setLiberando(true)
    setErro('')
    try {
      const enviadas = aLiberar.map((u) => u.id)
      const res = await fetch('/api/pecas/unidades/liberar-lote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ unidade_ids: enviadas, retirado_por_user_id: retirador, id_ppv: idPPV }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Falha ao liberar.')
      const falhas: { unidade_id: string; numero?: string; erro: string }[] = j.erros || []
      // tira do "escaneadas" SÓ as que liberaram — as que falharam continuam
      // conferidas pra nova tentativa sem re-escanear fisicamente
      const idsFalha = new Set(falhas.map((f) => f.unidade_id))
      enviadas.forEach((id) => { if (!idsFalha.has(id)) conferidasRef.current.delete(id) })
      const liberadas = Number(j.liberadas) || 0
      if (falhas.length > 0) {
        // falha parcial NÃO vai pra tela de sucesso (esconderia o problema)
        setErro(`${liberadas} liberada(s) · ${falhas.length} NÃO liberada(s): ${falhas.slice(0, 3).map((f) => `${f.numero || '?'} (${f.erro})`).join(' · ')}${falhas.length > 3 ? ' · …' : ''}`)
      } else if (liberadas > 0) {
        setConcluido({ qtd: liberadas, nome: '' })
      }
      await recarregarUnidades()
    } catch (e) {
      setErro(String(e instanceof Error ? e.message : e))
    } finally {
      setLiberando(false)
    }
  }

  const btn = (bg: string): React.CSSProperties => ({
    width: '100%', padding: '12px 16px', borderRadius: 10, border: 'none', background: bg,
    color: '#fff', fontSize: 14.5, fontWeight: 800, cursor: 'pointer', boxSizing: 'border-box',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  })

  if (carregando) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: 'var(--portal-text-muted)', gap: 8, fontSize: 14 }}>
        <Loader2 size={16} className="animate-spin" /> Carregando pedido…
      </div>
    )
  }
  if (!detalhes) {
    return (
      <div style={{ padding: 24, textAlign: 'center', fontSize: 14, color: 'var(--portal-text-secondary)' }}>
        {erro || `PPV ${idPPV} não encontrado.`}
        <div style={{ marginTop: 12 }}><Link href="/ppv" style={{ color: '#2563eb', fontWeight: 700 }}>← Voltar ao PPV</Link></div>
      </div>
    )
  }

  // tela de conclusão
  if (concluido) {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '48px 20px', textAlign: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
        <CheckCircle2 size={64} color="#16a34a" style={{ margin: '0 auto' }} />
        <h2 style={{ fontSize: 19, fontWeight: 800, color: 'var(--portal-text)', margin: '14px 0 6px' }}>
          {concluido.qtd} peça{concluido.qtd === 1 ? '' : 's'} liberada{concluido.qtd === 1 ? '' : 's'}
        </h2>
        <p style={{ fontSize: 13.5, color: 'var(--portal-text-secondary)', margin: '0 0 24px' }}>
          {idPPV} · retirada registrada no rastreio de cada unidade.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Link href={`/ppv?id=${encodeURIComponent(idPPV)}`} style={{ ...btn('#111827'), textDecoration: 'none' }}>Voltar ao PPV</Link>
          <button onClick={() => { setConcluido(null); setScanAberto(true) }} style={btn('#2563eb')}>
            <ScanLine size={16} /> Escanear mais
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '16px 16px 120px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <Link href={`/ppv?id=${encodeURIComponent(idPPV)}`} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--portal-text-muted)', textDecoration: 'none' }}>
          <ArrowLeft size={15} /> PPV
        </Link>
        <h1 style={{ fontSize: 17, fontWeight: 800, color: 'var(--portal-text)', margin: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
          <QrCode size={17} color="#C41E2A" /> Liberação de peças
        </h1>
      </div>

      {/* cabeçalho do pedido */}
      <div style={{ border: '1px solid var(--portal-border)', borderRadius: 12, padding: '12px 14px', marginBottom: 12, background: 'var(--portal-bg-card)' }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--portal-text)' }}>{idPPV} · {detalhes.cliente || '—'}</div>
        <div style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)', marginTop: 3 }}>
          Técnico: {detalhes.tecnico || '—'} · Fase: {detalhes.status || '—'}
          {faturado && <span style={{ color: '#16a34a', fontWeight: 700 }}> · Faturado</span>}
        </div>
      </div>

      {(faturado || terminal) && (
        <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', borderRadius: 10, padding: '10px 12px', fontSize: 12.5, lineHeight: 1.5, marginBottom: 12 }}>
          {somenteConsulta
            ? 'Este PPV está cancelado — tela em modo consulta.'
            : faturado
              ? 'Este PPV já foi faturado — liberação tardia aplica a peça direto (ela já saiu na NF).'
              : `Este PPV está ${detalhes.status} — confira antes de liberar.`}
        </div>
      )}

      {/* quem está pegando */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: .5, color: 'var(--portal-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
          Quem está pegando as peças *
        </div>
        <UserSelect value={retirador} onChange={setRetirador} placeholder="Selecionar usuário do portal…" autoFocus={false} />
        {!retirador && (
          <div style={{ fontSize: 12, color: '#b45309', marginTop: 6 }}>Escolha quem está retirando antes de escanear.</div>
        )}
      </div>

      {/* itens */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: .5, color: 'var(--portal-text-muted)', textTransform: 'uppercase' }}>
          Itens do pedido
        </div>
        <button
          onClick={() => { setItemFoco(null); setScanAberto(true) }}
          disabled={!retirador || somenteConsulta}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: 'none',
            background: !retirador || somenteConsulta ? '#9ca3af' : '#111827', color: '#fff', fontSize: 12.5, fontWeight: 800,
            cursor: !retirador || somenteConsulta ? 'default' : 'pointer',
          }}>
          <ScanLine size={14} /> Escanear
        </button>
      </div>

      {erro && <div style={{ fontSize: 12.5, color: '#dc2626', fontWeight: 700, marginBottom: 10 }}>{erro}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {itens.length === 0 && unidades.length === 0 && (
          <div style={{ border: '1.5px dashed var(--portal-border)', borderRadius: 10, padding: 20, textAlign: 'center', fontSize: 13, color: 'var(--portal-text-muted)' }}>
            Pedido sem itens — escaneie uma peça pra adicionar.
          </div>
        )}
        {itens.map((p) => {
          const us = unidadesDe(p.codigo)
          const escaneadas = us.filter((u) => u.status !== 'retirada_pendente' || conferidasRef.current.has(u.id)).length
          const completo = escaneadas >= p.saldo && p.saldo > 0
          return (
            <div key={p.codigo} style={{ border: '1px solid var(--portal-border)', borderRadius: 12, padding: '10px 12px', background: 'var(--portal-bg-card)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--portal-text)', fontFamily: 'monospace' }}>{p.codigo}</div>
                  <div style={{ fontSize: 12, color: 'var(--portal-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.descricao}</div>
                </div>
                {completo
                  ? <CheckCircle2 size={20} color="#16a34a" />
                  : (
                    <button
                      onClick={() => { setItemFoco(p.codigo); setScanAberto(true) }}
                      disabled={!retirador || somenteConsulta}
                      title="Escanear unidades deste item"
                      style={{
                        width: 38, height: 38, borderRadius: 9, border: 'none', flexShrink: 0,
                        background: !retirador || somenteConsulta ? '#e5e7eb' : '#eff6ff',
                        color: !retirador || somenteConsulta ? '#9ca3af' : '#2563eb',
                        cursor: !retirador || somenteConsulta ? 'default' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                      <QrCode size={18} />
                    </button>
                  )}
              </div>
              <div style={{ marginTop: 7 }}>
                <div style={{ height: 5, background: 'var(--portal-bg-secondary)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${p.saldo > 0 ? Math.min(100, (escaneadas / p.saldo) * 100) : 0}%`, background: completo ? '#16a34a' : '#2563eb', transition: 'width .3s' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11.5, color: 'var(--portal-text-muted)' }}>
                  <span>{escaneadas}/{p.saldo} escaneada{p.saldo === 1 ? '' : 's'}</span>
                  {us.length === 0 && <span>sem etiqueta QR ainda</span>}
                </div>
              </div>
              {us.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                  {us.map((u) => (
                    <span key={u.id} style={{
                      fontSize: 10.5, fontFamily: 'monospace', fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                      background: 'var(--portal-bg-secondary)',
                      color: u.status === 'retirada_pendente' && !conferidasRef.current.has(u.id) ? 'var(--portal-text-muted)' : STATUS_COR[u.status],
                      border: `1px solid ${u.status === 'retirada_pendente' && !conferidasRef.current.has(u.id) ? 'var(--portal-border)' : STATUS_COR[u.status]}`,
                    }}>
                      {u.numero}{u.status !== 'retirada_pendente' ? ` · ${STATUS_LABEL[u.status]}` : conferidasRef.current.has(u.id) ? ' ✓' : ''}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {reservadasNaoConferidas.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--portal-text-secondary)', marginTop: 10, lineHeight: 1.5 }}>
          {reservadasNaoConferidas.length} unidade(s) reservada(s) ainda não escaneada(s) nesta sessão — escaneie pra
          incluir na liberação.
        </div>
      )}

      {/* rodapé fixo */}
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, background: 'var(--portal-bg-card)', borderTop: '1px solid var(--portal-border)', padding: '12px 16px calc(12px + env(safe-area-inset-bottom))' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <button onClick={liberar} disabled={aLiberar.length === 0 || !retirador || liberando} style={{
            ...btn(aLiberar.length === 0 || !retirador || liberando ? '#9ca3af' : '#16a34a'),
            cursor: aLiberar.length === 0 || !retirador || liberando ? 'default' : 'pointer',
          }}>
            {liberando
              ? <><Loader2 size={16} className="animate-spin" /> Liberando…</>
              : `✓ Liberar ${aLiberar.length} peça${aLiberar.length === 1 ? '' : 's'} escaneada${aLiberar.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>

      {/* scanner */}
      <QRScanner
        ref={scannerRef}
        open={scanAberto}
        onClose={() => setScanAberto(false)}
        onScan={onScan}
        onDigitar={onDigitar}
        titulo="Escaneie o QR da peça"
        subtitulo={itemFoco
          ? `${itemFoco} · ${itens.find((p) => p.codigo === itemFoco)?.descricao || ''}`
          : `${idPPV} · ${aLiberar.length} pronta(s) pra liberar`}
      />

      {/* bottom sheet: peça fora do pedido */}
      {pendente && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 70500, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ background: 'var(--portal-bg-card)', borderRadius: '16px 16px 0 0', padding: '18px 18px calc(18px + env(safe-area-inset-bottom))', width: '100%', maxWidth: 560, boxSizing: 'border-box' }}>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--portal-text)', marginBottom: 4 }}>
              {pendente.unidade.codigo} não está neste pedido
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)', lineHeight: 1.5, marginBottom: 14 }}>
              {pendente.unidade.numero} · {pendente.unidade.descricao || 'sem descrição'}
              {pendente.preco > 0 && <> · R$ {pendente.preco.toFixed(2).replace('.', ',')}</>}
              <br />Adicionar o item (1 un) ao {idPPV} e reservar esta unidade?
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {podeAdicionarItem ? (
                <button onClick={adicionarPendente} disabled={adicionando} style={btn(adicionando ? '#9ca3af' : '#2563eb')}>
                  {adicionando ? <><Loader2 size={15} className="animate-spin" /> Adicionando…</> : '+ Adicionar ao PPV'}
                </button>
              ) : (
                <div style={{ fontSize: 12.5, color: '#b45309', textAlign: 'center' }}>Você não tem permissão pra adicionar itens ao pedido.</div>
              )}
              <button onClick={ignorarPendente} style={{ ...btn('transparent'), color: 'var(--portal-text-secondary)', border: '1px solid var(--portal-border)' }}>
                Ignorar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
