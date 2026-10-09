'use client'

// Card da barra lateral da Pasta Clientes: contatos do NovaZap (Chatwoot)
// vinculados a este cliente (todos os códigos Omie do mesmo CNPJ), com cargo,
// telefone e a última conversa. Dá pra VINCULAR um contato (busca por nome ou
// telefone) e desvincular, sem sair da pasta.
import { useCallback, useEffect, useState } from 'react'
import { MessageCircle, RefreshCw, Phone, ExternalLink, MapPin, Plus, Search, X, Link2, Unlink } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { ContatoWhatsapp, SecaoWhatsapp } from '@/lib/chatwoot/parsers'

const VERDE = '#16A34A'
const COR_CARGO: Record<string, { bg: string; fg: string }> = {
  proprietario: { bg: '#FEF3C7', fg: '#92400E' },
  gerente: { bg: '#DBEAFE', fg: '#1E40AF' },
  financeiro: { bg: '#E0E7FF', fg: '#4338CA' },
  tratorista: { bg: '#D1FAE5', fg: '#065F46' },
  funcionario: { bg: '#F1F5F9', fg: '#334155' },
}
const COR_STATUS: Record<string, string> = { open: '#16A34A', pending: '#D97706', resolved: '#94A3B8', snoozed: '#6366F1' }

const chave = (s: string | null) => (s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
const iniciais = (nome: string) => nome.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('') || '?'

function quando(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const dias = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (dias <= 0) return `hoje ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
  if (dias === 1) return 'ontem'
  if (dias < 30) return `há ${dias} dias`
  return d.toLocaleDateString('pt-BR')
}

type Resposta = { secao: SecaoWhatsapp; urlContatoBase: string | null }
type Achado = { id: number; nome: string; telefone: string | null; thumbnail: string | null; tipo: string | null; vinculado_a: string | null; cliente_ref: string | null }

async function cabecalhos(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token || ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const BTN_PEQ: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 7, border: '1px solid #E5E7EB', background: 'var(--portal-bg-card)', cursor: 'pointer' }

export default function ContatosChatwoot({ cod, cnpj, empresa, nomeCliente }: { cod: number | string; cnpj: string; empresa: string; nomeCliente: string }) {
  const [dados, setDados] = useState<Resposta | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  // vincular contato
  const [buscando, setBuscando] = useState(false)
  const [termo, setTermo] = useState('')
  const [achados, setAchados] = useState<Achado[]>([])
  const [procurando, setProcurando] = useState(false)
  const [erroBusca, setErroBusca] = useState('')
  const [salvando, setSalvando] = useState<number | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('')
    try {
      const r = await fetch(`/api/clientes/contatos-chatwoot?cod=${encodeURIComponent(String(cod))}&cnpj=${encodeURIComponent(cnpj || '')}`,
        { headers: await cabecalhos() })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(j?.erro || j?.error || `Erro ${r.status}`)
      setDados(j)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar')
    } finally {
      setCarregando(false)
    }
  }, [cod, cnpj])

  useEffect(() => {
    let vivo = true
    // carrega ao abrir/trocar de cliente (o setState fica no callback assíncrono)
    Promise.resolve().then(() => { if (vivo) carregar() })
    return () => { vivo = false }
  }, [carregar])

  // busca de contatos com espera de 400 ms enquanto digita
  useEffect(() => {
    if (!buscando) return
    const q = termo.trim()
    let vivo = true
    const t = setTimeout(async () => {
      if (q.length < 3) { if (vivo) { setAchados([]); setErroBusca('') } return }
      setProcurando(true)
      try {
        const r = await fetch(`/api/clientes/contatos-chatwoot?buscar=${encodeURIComponent(q)}`, { headers: await cabecalhos() })
        const j = await r.json().catch(() => null)
        if (!vivo) return
        if (!r.ok) throw new Error(j?.error || j?.erro || `Erro ${r.status}`)
        setAchados(j?.contatos || []); setErroBusca('')
      } catch (e) {
        if (vivo) setErroBusca(e instanceof Error ? e.message : 'Erro na busca')
      } finally {
        if (vivo) setProcurando(false)
      }
    }, 400)
    return () => { vivo = false; clearTimeout(t) }
  }, [termo, buscando])

  const enviar = async (corpo: Record<string, unknown>, contactId: number) => {
    setSalvando(contactId)
    try {
      const r = await fetch('/api/clientes/contatos-chatwoot', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await cabecalhos()) },
        body: JSON.stringify({ ...corpo, contactId }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(j?.error || j?.erro || `Erro ${r.status}`)
      return true
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao falar com o NovaZap')
      return false
    } finally {
      setSalvando(null)
    }
  }
  const ehDeste = (a: Achado) => (a.cliente_ref || '').split(':')[0] === String(cod)
  const vincular = async (a: Achado) => {
    if (ehDeste(a)) return
    if (a.vinculado_a && !confirm(`${a.nome} está vinculado a "${a.vinculado_a}".\n\nTrocar para ${nomeCliente}?`)) return
    if (await enviar({ acao: 'vincular', cod: String(cod), empresa }, a.id)) {
      setBuscando(false); setTermo(''); setAchados([])
      carregar()
    }
  }
  const desvincular = async (c: ContatoWhatsapp) => {
    if (!confirm(`Desvincular ${c.nome} de ${nomeCliente} no NovaZap?`)) return
    if (await enviar({ acao: 'desvincular' }, c.id)) carregar()
  }
  const alternarBusca = () => { setBuscando(b => !b); setTermo(''); setAchados([]); setErroBusca('') }

  const secao = dados?.secao
  const contatos: ContatoWhatsapp[] = secao?.estado === 'ok' ? secao.contatos : []

  return (
    <div style={{ background: 'var(--portal-bg-card)', borderRadius: 16, border: '1px solid #E5E7EB', padding: '14px 16px', boxShadow: '0 1px 3px rgba(16,24,40,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, color: 'var(--portal-text)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
          <MessageCircle size={14} color={VERDE} /> Contatos no WhatsApp
          {secao?.estado === 'ok' && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 10, background: '#DCFCE7', color: '#166534' }}>{secao.total}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={alternarBusca} title="Vincular um contato do NovaZap a este cliente"
            style={{ ...BTN_PEQ, background: buscando ? '#DCFCE7' : 'var(--portal-bg-card)', color: VERDE }}>
            {buscando ? <X size={14} /> : <Plus size={15} />}
          </button>
          <button onClick={carregar} disabled={carregando} title="Atualizar"
            style={{ ...BTN_PEQ, color: '#64748B', cursor: carregando ? 'wait' : 'pointer' }}>
            <RefreshCw size={13} style={carregando ? { animation: 'spin 1s linear infinite' } : undefined} />
          </button>
        </div>
      </div>

      {/* Vincular: busca no NovaZap por nome ou telefone */}
      {buscando && (
        <div style={{ border: '1px solid #BBF7D0', background: '#F0FDF4', borderRadius: 12, padding: 10, marginBottom: 10 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#166534', marginBottom: 7 }}>Vincular contato do NovaZap</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, border: '1px solid #E5E7EB', background: 'var(--portal-bg-card)' }}>
            <Search size={13} color="#64748B" />
            <input autoFocus value={termo} onChange={e => setTermo(e.target.value)} placeholder="Nome ou telefone do contato"
              style={{ border: 'none', outline: 'none', background: 'none', fontSize: 12.5, flex: 1, minWidth: 0, color: 'var(--portal-text)' }} />
            {procurando && <RefreshCw size={12} color="#64748B" style={{ animation: 'spin 1s linear infinite' }} />}
          </div>
          {erroBusca ? (
            <div style={{ fontSize: 12, color: '#B91C1C', marginTop: 8 }}>{erroBusca}</div>
          ) : termo.trim().length < 3 ? (
            <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 7 }}>Digite ao menos 3 letras ou números.</div>
          ) : !procurando && achados.length === 0 ? (
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 8 }}>Nenhum contato encontrado.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8, maxHeight: 260, overflowY: 'auto' }}>
              {achados.map(a => {
                const deste = ehDeste(a)
                return (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 9, background: 'var(--portal-bg-card)', border: '1px solid #F1F5F9' }}>
                    <span style={{ width: 28, height: 28, borderRadius: '50%', background: '#DCFCE7', color: '#166534', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{iniciais(a.nome)}</span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--portal-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nome}</div>
                      <div style={{ fontSize: 11, color: a.vinculado_a && !deste ? '#B45309' : '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={a.vinculado_a || undefined}>
                        {a.telefone || 'sem telefone'}{deste ? ' · já é deste cliente' : a.vinculado_a ? ` · em ${a.vinculado_a}` : ''}
                      </div>
                    </div>
                    <button onClick={() => vincular(a)} disabled={deste || salvando === a.id}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 9px', borderRadius: 7, border: 'none', background: deste ? '#E5E7EB' : VERDE, color: deste ? '#64748B' : '#fefefe', fontSize: 11.5, fontWeight: 700, cursor: deste ? 'default' : salvando === a.id ? 'wait' : 'pointer', flexShrink: 0 }}>
                      <Link2 size={12} /> {salvando === a.id ? '...' : deste ? 'Vinculado' : a.vinculado_a ? 'Trocar' : 'Vincular'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {carregando && !dados ? (
        <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted)', padding: '6px 0' }}>Buscando no NovaZap...</div>
      ) : erro ? (
        <div style={{ fontSize: 12.5, color: '#B91C1C' }}>{erro}</div>
      ) : secao?.estado === 'nao_configurado' ? (
        <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted)' }}>NovaZap não configurado neste ambiente.</div>
      ) : secao?.estado === 'indisponivel' ? (
        <div style={{ fontSize: 12.5, color: '#B45309' }}>NovaZap fora do ar agora. Tente atualizar daqui a pouco.</div>
      ) : contatos.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted)', lineHeight: 1.45 }}>
          Nenhum contato do WhatsApp vinculado a este cliente. Use o <b>+</b> acima para vincular.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {contatos.map(c => {
            const cargo = COR_CARGO[chave(c.cargo)] || COR_CARGO.funcionario
            const conv = c.ultima_conversa
            const link = conv?.url || (dados?.urlContatoBase ? `${dados.urlContatoBase}${c.id}` : null)
            return (
              <div key={c.id} style={{ border: '1px solid #F1F5F9', borderRadius: 12, padding: '10px 11px', background: 'var(--portal-bg-card)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {c.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.thumbnail} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <span style={{ width: 36, height: 36, borderRadius: '50%', background: '#DCFCE7', color: '#166534', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>{iniciais(c.nome)}</span>
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--portal-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                      {c.cargo && <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 7px', borderRadius: 6, background: cargo.bg, color: cargo.fg }}>{c.cargo}</span>}
                      {c.telefone && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11.5, color: '#64748B' }}><Phone size={11} /> {c.telefone}</span>}
                    </div>
                  </div>
                  <button onClick={() => desvincular(c)} disabled={salvando === c.id} title="Desvincular deste cliente"
                    style={{ ...BTN_PEQ, width: 30, height: 30, borderRadius: 8, color: '#94A3B8', cursor: salvando === c.id ? 'wait' : 'pointer', flexShrink: 0 }}>
                    <Unlink size={13} />
                  </button>
                  {link && (
                    <a href={link} target="_blank" rel="noopener noreferrer" title={conv ? 'Abrir a conversa no NovaZap' : 'Abrir o contato no NovaZap'}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, background: VERDE, color: '#fefefe', flexShrink: 0 }}>
                      <ExternalLink size={14} />
                    </a>
                  )}
                </div>
                {conv && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, paddingTop: 7, borderTop: '1px solid #F1F5F9', fontSize: 11.5, color: '#64748B', flexWrap: 'wrap' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: COR_STATUS[conv.status] || '#94A3B8' }} />
                    <span style={{ fontWeight: 600, color: 'var(--portal-text)' }}>{conv.status_label}</span>
                    {conv.ultima_atividade && <span>· {quando(conv.ultima_atividade)}</span>}
                    {conv.atendente && <span>· {conv.atendente}</span>}
                    {conv.nao_lidas > 0 && <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 800, padding: '1px 7px', borderRadius: 10, background: VERDE, color: '#fefefe' }}>{conv.nao_lidas} nova{conv.nao_lidas > 1 ? 's' : ''}</span>}
                  </div>
                )}
                {c.localizacoes.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
                    {c.localizacoes.slice(0, 3).map((l, i) => (
                      <a key={i} href={l.link} target="_blank" rel="noopener noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, color: '#2563EB', textDecoration: 'none', padding: '2px 7px', borderRadius: 6, background: '#EFF6FF' }}>
                        <MapPin size={10} /> {l.nome || 'Localização'}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          {secao?.estado === 'ok' && secao.truncado && (
            <div style={{ fontSize: 11.5, color: 'var(--portal-text-muted)' }}>Mostrando {contatos.length} de {secao.total} contatos.</div>
          )}
        </div>
      )}
    </div>
  )
}
