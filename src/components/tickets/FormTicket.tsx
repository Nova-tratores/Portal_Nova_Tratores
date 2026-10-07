'use client'
// Modal de criação de ticket (v1 — tipo genérico).
// A descrição de origem ("quem pediu e por quê") é imutável depois de criada.
// Aceita um print da tela (clique direito) — vira evento 'anexo' na timeline.
import { useEffect, useMemo, useState } from 'react'
import { X, Ticket as TicketIcon, Lock, Globe, Paperclip, LayoutGrid } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import { supabase } from '@/lib/supabase'
import { CATEGORIAS_SUGERIDAS, type TicketVisibilidade } from '@/lib/tickets/constantes'
import UserSelect from './UserSelect'

interface Props {
  onFechar: () => void
  onCriado: (ticketId: string) => void
  /** Print pronto ao abrir (ex.: captura do clique direito). */
  printInicial?: File | null
  /** Criar dentro de um quadro (aba Quadros): entra na coluna indicada. */
  quadro?: { id: string; nome: string; colunaId?: string | null; temCronograma?: boolean }
}

const br = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7)

const campoStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 14,
  border: '1px solid var(--portal-border, #e5e7eb)', background: 'var(--portal-bg, #fff)',
  color: 'var(--portal-text, #111)', outline: 'none',
}
const rotuloStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6,
  color: 'var(--portal-text-secondary, #555)', textTransform: 'uppercase', letterSpacing: .4,
}

export default function FormTicket({ onFechar, onCriado, printInicial, quadro }: Props) {
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [responsavelId, setResponsavelId] = useState('')
  const [categoria, setCategoria] = useState('')
  const [prazo, setPrazo] = useState('')
  // Agenda do responsável (Central de Trabalho)
  const [inicio, setInicio] = useState('')
  const [duracao, setDuracao] = useState(1)
  const [tocouInicio, setTocouInicio] = useState(false)
  const [tocouPrazo, setTocouPrazo] = useState(false)
  const [noCronograma, setNoCronograma] = useState(true)
  const [agenda, setAgenda] = useState<{ sugestao: string; conflitos: { nome: string; ini: string; fim: string }[] } | null>(null)

  useEffect(() => {
    if (!responsavelId) { setAgenda(null); return }
    let vivo = true
    const tmr = setTimeout(async () => {
      try {
        const q = new URLSearchParams({ user: responsavelId, duracao: String(duracao) })
        if (tocouInicio && inicio) q.set('inicio', inicio)
        const res = await fetch('/api/trabalho/agenda?' + q.toString(), { headers: await authHeaders() })
        const json = await res.json()
        if (!vivo || !res.ok) return
        setAgenda({ sugestao: json.sugestao, conflitos: json.conflitos || [] })
        if (!tocouInicio) setInicio(json.sugestao)
      } catch { /* sem agenda: segue manual */ }
    }, 250)
    return () => { vivo = false; clearTimeout(tmr) }
  }, [responsavelId, duracao, inicio, tocouInicio])

  // prazo acompanha início + dias, até a pessoa mexer nele
  useEffect(() => {
    if (tocouPrazo || !inicio) return
    const d = new Date(inicio + 'T12:00:00'); d.setDate(d.getDate() + duracao - 1)
    setPrazo(d.toISOString().slice(0, 10))
  }, [inicio, duracao, tocouPrazo])
  const [terceiro, setTerceiro] = useState('')
  // Dentro de um bloco o padrão é compartilhar com o bloco; fora, privado.
  const [visibilidade, setVisibilidade] = useState<TicketVisibilidade>(quadro ? 'publico' : 'privado')
  const [print, setPrint] = useState<File | null>(printInicial ?? null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const printUrl = useMemo(() => (print ? URL.createObjectURL(print) : null), [print])
  useEffect(() => () => { if (printUrl) URL.revokeObjectURL(printUrl) }, [printUrl])

  const criar = async () => {
    setErro('')
    if (!titulo.trim()) { setErro('Informe o título'); return }
    if (!descricao.trim()) { setErro('Descreva o pedido — esse texto fica registrado como origem do ticket'); return }
    if (!responsavelId) { setErro('Escolha o responsável (com quem começa a bola)'); return }
    setSalvando(true)
    try {
      // Print → bucket público (best-effort: falha no upload não trava o ticket)
      let anexos: { url: string; nome: string }[] = []
      if (print) {
        const path = `tickets/${Date.now()}-${Math.random().toString(36).slice(2, 8)}/print.png`
        const { error: upErr } = await supabase.storage.from('anexos').upload(path, print)
        if (!upErr) {
          anexos = [{
            url: supabase.storage.from('anexos').getPublicUrl(path).data.publicUrl,
            nome: 'print-da-tela.png',
          }]
        }
      }
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          titulo: titulo.trim(),
          descricao: descricao.trim(),
          responsavel_id: responsavelId,
          categoria: categoria.trim(),
          prazo: prazo || null,
          ...(quadro?.temCronograma && noCronograma ? { cronograma: true, inicio: inicio || null, duracao } : {}),
          terceiro_envolvido: terceiro.trim(),
          visibilidade,
          anexos,
          ...(quadro ? { quadro_id: quadro.id, quadro_coluna_id: quadro.colunaId || null } : {}),
        }),
      })
      const json = await res.json()
      if (!res.ok) { setErro(json.error || 'Falha ao criar o ticket'); return }
      onCriado(json.ticket.id)
    } catch {
      setErro('Falha de conexão — tente novamente')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }} onClick={onFechar}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto',
          background: 'var(--portal-surface, #fff)', borderRadius: 14, padding: 22,
          boxShadow: '0 20px 60px rgba(0,0,0,.3)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 17, fontWeight: 800, color: 'var(--portal-text, #111)', margin: 0 }}>
            <TicketIcon size={18} color="#dc2626" /> Novo Ticket
            {quadro && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: 'var(--portal-text-muted, #888)' }}><LayoutGrid size={13} /> {quadro.nome}</span>}
          </h2>
          <button onClick={onFechar} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--portal-text-muted, #888)' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={rotuloStyle}>Título *</label>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={140}
              placeholder="Ex: Renovação do seguro da frota" style={campoStyle} autoFocus />
          </div>

          <div>
            <label style={rotuloStyle}>O que precisa ser feito, e por quê? *</label>
            <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={4}
              placeholder="Essa descrição fica registrada como a origem do ticket e não pode ser alterada depois."
              style={{ ...campoStyle, resize: 'vertical' }} />
          </div>

          <div>
            <label style={rotuloStyle}>Responsável (com quem está a bola) *</label>
            <UserSelect value={responsavelId} onChange={setResponsavelId} placeholder="Escolher responsável..." autoFocus={false} />
          </div>

          {/* Quando: o sistema olha a agenda do responsável e sugere a data */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 1fr', gap: 12 }}>
            <div>
              <label style={rotuloStyle}>Começa em</label>
              <input type="date" value={inicio} onChange={(e) => { setInicio(e.target.value); setTocouInicio(true) }} style={campoStyle} />
            </div>
            <div>
              <label style={rotuloStyle}>Dias</label>
              <input type="number" min={1} max={120} value={duracao} onChange={(e) => setDuracao(Math.max(1, Number(e.target.value) || 1))} style={campoStyle} />
            </div>
            <div>
              <label style={rotuloStyle}>Prazo</label>
              <input type="date" value={prazo} onChange={(e) => { setPrazo(e.target.value); setTocouPrazo(true) }} style={campoStyle} />
            </div>
          </div>
          {responsavelId && agenda && (
            <div style={{ marginTop: -4, padding: '9px 12px', borderRadius: 8, fontSize: 12.5, lineHeight: 1.45,
              background: agenda.conflitos.length ? 'rgba(217,119,6,.1)' : 'rgba(22,163,74,.08)', color: agenda.conflitos.length ? '#b45309' : '#15803d' }}>
              {agenda.conflitos.length
                ? <>Atenção: essa pessoa já tem {agenda.conflitos.map((c) => `"${c.nome}" (${br(c.ini)}${c.fim !== c.ini ? '–' + br(c.fim) : ''})`).join(', ')} nesses dias. Dá para criar mesmo assim.</>
                : <>Agenda livre nesses dias.</>}
              {inicio !== agenda.sugestao && (
                <> Sugestão: <strong>{br(agenda.sugestao)}</strong>, primeiro dia livre.{' '}
                  <button type="button" onClick={() => { setInicio(agenda.sugestao); setTocouInicio(false) }}
                    style={{ border: 'none', background: 'transparent', padding: 0, color: 'inherit', fontWeight: 800, textDecoration: 'underline', cursor: 'pointer' }}>Usar sugestão</button>
                </>
              )}
            </div>
          )}
          {quadro?.temCronograma && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--portal-text-secondary, #555)', cursor: 'pointer' }}>
              <input type="checkbox" checked={noCronograma} onChange={(e) => setNoCronograma(e.target.checked)} />
              Também pôr no cronograma do quadro (fica alinhado com o ticket)
            </label>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
            <div>
              <label style={rotuloStyle}>Categoria</label>
              <input value={categoria} onChange={(e) => setCategoria(e.target.value)} list="tickets-categorias"
                placeholder="Opcional" style={campoStyle} />
              <datalist id="tickets-categorias">
                {CATEGORIAS_SUGERIDAS.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
          </div>

          <div>
            <label style={rotuloStyle}>Terceiro envolvido</label>
            <input value={terceiro} onChange={(e) => setTerceiro(e.target.value)} maxLength={140}
              placeholder="Ex: Corretora XYZ (opcional)" style={campoStyle} />
          </div>

          <div>
            <label style={rotuloStyle}>Visibilidade</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {([
                { valor: 'privado' as const, rotulo: 'Privado (só envolvidos)', icone: <Lock size={14} /> },
                { valor: 'publico' as const, rotulo: quadro ? `Compartilhado com o bloco ${quadro.nome}` : 'Visível a todos', icone: <Globe size={14} /> },
              ]).map((op) => (
                <button key={op.valor} type="button" onClick={() => setVisibilidade(op.valor)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8,
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    border: visibilidade === op.valor ? '1.5px solid #dc2626' : '1px solid var(--portal-border, #e5e7eb)',
                    background: visibilidade === op.valor ? 'rgba(220,38,38,.07)' : 'transparent',
                    color: visibilidade === op.valor ? '#dc2626' : 'var(--portal-text-secondary, #555)',
                  }}>
                  {op.icone} {op.rotulo}
                </button>
              ))}
            </div>
          </div>

          {print && printUrl && (
            <div>
              <label style={rotuloStyle}><Paperclip size={11} style={{ display: 'inline', marginRight: 4 }} />Print anexado</label>
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <img src={printUrl} alt="Print da tela" style={{ maxWidth: 240, maxHeight: 150, borderRadius: 8, border: '1px solid var(--portal-border, #e5e7eb)', display: 'block' }} />
                <button type="button" onClick={() => setPrint(null)} title="Remover print"
                  style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 6, border: 'none', background: 'rgba(0,0,0,.6)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <X size={13} />
                </button>
              </div>
            </div>
          )}

          {erro && (
            <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(220,38,38,.08)', color: '#dc2626', fontSize: 13, fontWeight: 600 }}>
              {erro}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
            <button onClick={onFechar} disabled={salvando}
              style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid var(--portal-border, #e5e7eb)', background: 'transparent', cursor: 'pointer', fontSize: 14, color: 'var(--portal-text-secondary, #555)' }}>
              Cancelar
            </button>
            <button onClick={criar} disabled={salvando}
              style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700, opacity: salvando ? .6 : 1 }}>
              {salvando ? 'Criando...' : 'Abrir ticket'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
