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
import { dataMinima, diaUtil, fimDeSemana } from '@/lib/trabalho/agenda'

interface Props {
  onFechar: () => void
  onCriado: (ticketId: string) => void
  /** Print pronto ao abrir (ex.: captura do clique direito). */
  printInicial?: File | null
  /** Criar dentro de um quadro (aba Quadros): entra na coluna indicada. */
  quadro?: { id: string; nome: string; colunaId?: string | null; temCronograma?: boolean }
  /** Já preenchido (ex.: "Fulano pediu para você abrir um ticket"). */
  tituloInicial?: string
  descricaoInicial?: string
}

const br = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7)
const hojeLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const rotuloSugestao = (iso: string) => `${DIAS_SEMANA[new Date(iso + 'T12:00:00').getDay()]} ${br(iso)}`

const campoStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 14,
  border: '1px solid var(--portal-border, #e5e7eb)', background: 'var(--portal-bg, #fff)',
  color: 'var(--portal-text, #111)', outline: 'none',
}
const rotuloStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6,
  color: 'var(--portal-text-secondary, #555)', textTransform: 'uppercase', letterSpacing: .4,
}

export default function FormTicket({ onFechar, onCriado, printInicial, quadro, tituloInicial, descricaoInicial }: Props) {
  const [titulo, setTitulo] = useState(tituloInicial || '')
  const [descricao, setDescricao] = useState(descricaoInicial || '')
  const [responsavelId, setResponsavelId] = useState('')
  const [categoria, setCategoria] = useState('')
  const [prazo, setPrazo] = useState('')
  // Agenda do responsável (Central de Trabalho)
  const [inicio, setInicio] = useState('')
  const [duracao, setDuracao] = useState(1)
  const [tocouInicio, setTocouInicio] = useState(false)
  const [tocouPrazo, setTocouPrazo] = useState(false)
  const [noCronograma, setNoCronograma] = useState(true)
  // Prazo mínimo = amanhã. "Muito urgente" fura a fila e libera hoje.
  const [urgente, setUrgente] = useState(false)
  // Prazo indeterminado: sem prazo, aparece todo dia no Cronograma até alguém concluir.
  const [indeterminado, setIndeterminado] = useState(false)
  const minimo = dataMinima(hojeLocal(), urgente)
  const [agenda, setAgenda] = useState<{ sugestao: string; sugestoes: string[]; conflitos: { nome: string; ini: string; fim: string }[] } | null>(null)

  useEffect(() => {
    if (!responsavelId) { setAgenda(null); return }
    let vivo = true
    const tmr = setTimeout(async () => {
      try {
        const q = new URLSearchParams({ user: responsavelId, duracao: String(duracao) })
        if (tocouInicio && inicio) q.set('inicio', inicio)
        if (urgente) q.set('urgente', '1')
        const res = await fetch('/api/trabalho/agenda?' + q.toString(), { headers: await authHeaders() })
        const json = await res.json()
        if (!vivo || !res.ok) return
        setAgenda({ sugestao: json.sugestao, sugestoes: json.sugestoes || [json.sugestao], conflitos: json.conflitos || [] })
        if (!tocouInicio) setInicio(json.sugestao)
      } catch { /* sem agenda: segue manual */ }
    }, 250)
    return () => { vivo = false; clearTimeout(tmr) }
  }, [responsavelId, duracao, inicio, tocouInicio, urgente])

  const alternarUrgente = (v: boolean) => {
    setUrgente(v)
    // muda a data mínima: deixa a agenda sugerir de novo
    setTocouInicio(false); setTocouPrazo(false)
  }

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
    if (!responsavelId) { setErro('Escolha para quem é o pedido'); return }
    if (!titulo.trim()) { setErro('Informe o título'); return }
    if (!descricao.trim()) { setErro('Descreva o pedido — esse texto fica registrado como origem do ticket'); return }
    if (!indeterminado && prazo && prazo < minimo) { setErro('Deixe pelo menos 1 dia de prazo. Se precisa ser hoje, marque "Muito urgente".'); return }
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
          prazo: indeterminado ? null : (prazo || null),
          // Contínuo não começa no fim de semana: cai na segunda.
          inicio: inicio ? (indeterminado ? diaUtil(inicio) : inicio) : null,
          ...(urgente ? { urgente: true } : {}),
          ...(quadro?.temCronograma && noCronograma ? { cronograma: true, duracao } : {}),
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
      <style>{`@media (max-width: 480px){.ct-ft-caixa{padding:16px !important}.ct-ft-quando{grid-template-columns:1fr 1fr !important}.ct-ft-quando > div:first-child{grid-column:1 / -1}}`}</style>
      <div className="ct-ft-caixa"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto',
          background: 'var(--portal-surface, #fff)', borderRadius: 14, padding: 22,
          boxShadow: '0 20px 60px rgba(0,0,0,.3)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 18 }}>
          <h2 style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', minWidth: 0, gap: 8, fontSize: 17, fontWeight: 800, color: 'var(--portal-text, #111)', margin: 0 }}>
            <TicketIcon size={18} color="#dc2626" /> Novo Ticket
            {quadro && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: 'var(--portal-text-muted, #888)' }}><LayoutGrid size={13} /> {quadro.nome}</span>}
          </h2>
          <button onClick={onFechar} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--portal-text-muted, #888)', flex: 'none', minWidth: 36, minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* 1º: para quem — a agenda dessa pessoa define as datas sugeridas */}
          <div>
            <label style={rotuloStyle}>Para quem? *</label>
            <UserSelect value={responsavelId} onChange={setResponsavelId} placeholder="Digite o nome da pessoa..." autoFocus barraBusca />
          </div>

          {responsavelId && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, borderRadius: 10, border: '1px solid var(--portal-border, #e5e7eb)', background: 'var(--portal-bg, #fafafa)' }}>
              <div>
                <label style={rotuloStyle}>{urgente ? 'Para hoje (fura a fila)' : 'Dias livres na agenda dessa pessoa'}</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {!agenda && <span style={{ fontSize: 13, color: 'var(--portal-text-muted, #888)' }}>Olhando a agenda...</span>}
                  {agenda?.sugestoes.map((d) => {
                    const ativo = inicio === d
                    return (
                      <button key={d} type="button" onClick={() => { setInicio(d); setTocouInicio(true); setTocouPrazo(false) }}
                        style={{ padding: '7px 12px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize',
                          border: ativo ? '1.5px solid #16a34a' : '1px solid var(--portal-border, #e5e7eb)',
                          background: ativo ? 'rgba(22,163,74,.1)' : 'var(--portal-surface, #fff)', color: ativo ? '#15803d' : 'var(--portal-text, #111)' }}>
                        {rotuloSugestao(d)}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Quando: começa · dias · prazo (mínimo amanhã, salvo muito urgente) */}
              <div className={indeterminado ? undefined : 'ct-ft-quando'} style={{ display: 'grid', gridTemplateColumns: indeterminado ? '1fr' : '1fr 90px 1fr', gap: 10 }}>
                <div>
                  <label style={rotuloStyle}>Começa em</label>
                  <input type="date" value={inicio} min={minimo} onChange={(e) => { setInicio(e.target.value); setTocouInicio(true) }} style={campoStyle} />
                </div>
                {!indeterminado && <>
                <div>
                  <label style={rotuloStyle}>Dias</label>
                  <input type="number" min={1} max={120} value={duracao} onChange={(e) => setDuracao(Math.max(1, Number(e.target.value) || 1))} style={campoStyle} />
                </div>
                <div>
                  <label style={rotuloStyle}>Prazo</label>
                  <input type="date" value={prazo} min={minimo} onChange={(e) => { setPrazo(e.target.value); setTocouPrazo(true) }} style={campoStyle} />
                </div>
                </>}
              </div>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, cursor: 'pointer', color: indeterminado ? '#0369a1' : 'var(--portal-text-secondary, #555)' }}>
                <input type="checkbox" checked={indeterminado} onChange={(e) => setIndeterminado(e.target.checked)} style={{ marginTop: 2 }} />
                <span><strong>Prazo indeterminado</strong> — trabalho contínuo: aparece todo dia útil (seg a sex) no Cronograma até alguém concluir.</span>
              </label>
              {indeterminado && inicio && fimDeSemana(inicio) && (
                <div style={{ fontSize: 12.5, color: '#0369a1' }}>
                  {rotuloSugestao(inicio)} é fim de semana — começa na {rotuloSugestao(diaUtil(inicio))}.
                </div>
              )}

              {agenda && agenda.conflitos.length > 0 && !urgente && (
                <div style={{ padding: '8px 10px', borderRadius: 8, fontSize: 12.5, lineHeight: 1.45, background: 'rgba(217,119,6,.1)', color: '#b45309' }}>
                  Essa pessoa já tem {agenda.conflitos.map((c) => `"${c.nome}" (${br(c.ini)}${c.fim !== c.ini ? '–' + br(c.fim) : ''})`).join(', ')} nesses dias. Dá para criar mesmo assim.
                </div>
              )}

              {!indeterminado && (
                <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted, #777)', lineHeight: 1.45 }}>
                  Deixe <strong>pelo menos 1 dia</strong> para a pessoa se organizar.
                </div>
              )}
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
                border: urgente ? '1.5px solid #dc2626' : '1px dashed var(--portal-border, #d1d5db)', background: urgente ? 'rgba(220,38,38,.07)' : 'transparent', color: urgente ? '#b91c1c' : 'var(--portal-text-secondary, #555)' }}>
                <input type="checkbox" checked={urgente} onChange={(e) => alternarUrgente(e.target.checked)} style={{ marginTop: 2 }} />
                <span><strong>Muito urgente — precisa ser hoje.</strong> Fura a fila da pessoa. Use só quando não dá para esperar.</span>
              </label>
            </div>
          )}

          <div>
            <label style={rotuloStyle}>Título *</label>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={140}
              placeholder="Ex: Renovação do seguro da frota" style={campoStyle} />
          </div>

          <div>
            <label style={rotuloStyle}>O que precisa ser feito, e por quê? *</label>
            <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={4}
              placeholder="Essa descrição fica registrada como a origem do ticket e não pode ser alterada depois."
              style={{ ...campoStyle, resize: 'vertical' }} />
          </div>
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
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
                <img src={printUrl} alt="Print da tela" style={{ maxWidth: 'min(240px, 100%)', maxHeight: 150, borderRadius: 8, border: '1px solid var(--portal-border, #e5e7eb)', display: 'block' }} />
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

          <div style={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
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
