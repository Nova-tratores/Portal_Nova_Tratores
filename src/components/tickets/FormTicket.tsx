'use client'
// Modal de criação de ticket (v1 — tipo genérico).
// A descrição de origem ("quem pediu e por quê") é imutável depois de criada.
// Aceita um print da tela (clique direito) — vira evento 'anexo' na timeline.
import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Lock, Globe, ImagePlus } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import { supabase } from '@/lib/supabase'
import { type TicketVisibilidade } from '@/lib/tickets/constantes'
import UserSelect from './UserSelect'
import CargaDaPessoa from '@/components/trabalho/CargaDaPessoa'
import { ESTILO_FILA } from '@/components/trabalho/estiloFila'
import { dataMinima, diaUtil } from '@/lib/trabalho/agenda'
import SeletorDataAgenda from '@/components/trabalho/SeletorDataAgenda'

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
  /** Pedido já para alguém (ex.: botão "Pedir" na carga da Equipe). */
  responsavelInicial?: string
  /** Prazo já dito (Ctrl+K: "até sexta"). A pessoa pode mudar antes de enviar. */
  prazoInicial?: string
}

const br = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7)
const hojeLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const rotuloSugestao = (iso: string) => `${DIAS_SEMANA[new Date(iso + 'T12:00:00').getDay()]} ${br(iso)}`
const amanhaDe = (iso: string) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10) }
// Último dia de trabalho: conta `dias` dias ÚTEIS a partir do início (pula sáb/dom).
const somarDiasUteis = (inicio: string, dias: number) => {
  let d = diaUtil(inicio)
  for (let i = 1; i < dias; i++) d = diaUtil(amanhaDe(d))
  return d
}

// Atalho "últimas pessoas" (José, 26/11/2026): guardado neste navegador, as 6 últimas a quem pediu.
const CHAVE_RECENTES = 'pedir-recentes'
type Recente = { id: string; nome: string }
const lerRecentes = (): Recente[] => { try { return JSON.parse(localStorage.getItem(CHAVE_RECENTES) || '[]') } catch { return [] } }
const guardarRecente = (r: Recente) => {
  try { localStorage.setItem(CHAVE_RECENTES, JSON.stringify([r, ...lerRecentes().filter((x) => x.id !== r.id)].slice(0, 6))) } catch { /* sem storage */ }
}
const MAX_FOTOS = 8


export default function FormTicket({ onFechar, onCriado, printInicial, quadro, tituloInicial, descricaoInicial, responsavelInicial, prazoInicial }: Props) {
  const [titulo, setTitulo] = useState(tituloInicial || '')
  const [descricao, setDescricao] = useState(descricaoInicial || '')
  const [responsavelId, setResponsavelId] = useState(responsavelInicial || '')
  const [responsavelNome, setResponsavelNome] = useState('')
  const [recentes, setRecentes] = useState<Recente[]>([])
  useEffect(() => { setRecentes(lerRecentes()) }, [])
  const [categoria] = useState('')
  const [prazo, setPrazo] = useState(prazoInicial || '')
  // Agenda do responsável (Central de Trabalho)
  const [inicio, setInicio] = useState('')
  const [duracao] = useState(1)
  const [tocouInicio, setTocouInicio] = useState(false)
  const [tocouPrazo, setTocouPrazo] = useState(!!prazoInicial)
  const [noCronograma, setNoCronograma] = useState(true)
  // Prazo mínimo = amanhã. "Muito urgente" fura a fila e libera hoje.
  const [urgente, setUrgente] = useState(false)
  // Prazo indeterminado: sem prazo, aparece todo dia no Cronograma até alguém concluir.
  const [indeterminado, setIndeterminado] = useState(false)
  const minimo = dataMinima(hojeLocal(), urgente)
  const [, setAgenda] = useState<{ sugestao: string; sugestoes: string[]; conflitos: { nome: string; ini: string; fim: string }[]; falhou?: boolean } | null>(null)

  useEffect(() => {
    if (!responsavelId) { setAgenda(null); return }
    let vivo = true
    const tmr = setTimeout(async () => {
      try {
        const q = new URLSearchParams({ user: responsavelId, duracao: String(duracao) })
        if (tocouInicio && inicio) q.set('inicio', inicio)
        if (urgente) q.set('urgente', '1')
        const res = await fetch('/api/trabalho/agenda?' + q.toString(), { headers: await authHeaders() })
        const json = await res.json().catch(() => ({}))
        if (!vivo) return
        // sem agenda: segue manual (não fica "Olhando a agenda..." para sempre)
        if (!res.ok || !json.sugestao) { setAgenda({ sugestao: '', sugestoes: [], conflitos: [], falhou: true }); return }
        setAgenda({ sugestao: json.sugestao, sugestoes: json.sugestoes || [json.sugestao], conflitos: json.conflitos || [] })
        if (!tocouInicio) setInicio(json.sugestao)
      } catch { if (vivo) setAgenda({ sugestao: '', sugestoes: [], conflitos: [], falhou: true }) }
    }, 250)
    return () => { vivo = false; clearTimeout(tmr) }
  }, [responsavelId, duracao, inicio, tocouInicio, urgente])

  const alternarUrgente = (v: boolean) => {
    setUrgente(v)
    // muda a data mínima: deixa a agenda sugerir de novo
    setTocouInicio(false); setTocouPrazo(false)
  }

  // prazo acompanha início + dias ÚTEIS, até a pessoa mexer nele
  useEffect(() => {
    if (tocouPrazo || !inicio) return
    setPrazo(somarDiasUteis(inicio, duracao))
  }, [inicio, duracao, tocouPrazo])
  const [terceiro] = useState('')
  // Dentro de um bloco o padrão é compartilhar com o bloco; fora, privado.
  const [visibilidade, setVisibilidade] = useState<TicketVisibilidade>(quadro ? 'publico' : 'privado')
  // Fotos anexadas (várias): o print do clique direito entra como a 1ª.
  const [fotos, setFotos] = useState<File[]>(printInicial ? [printInicial] : [])
  const inputFotos = useRef<HTMLInputElement>(null)
  const juntarFotos = (novas: File[]) => {
    const imagens = novas.filter((f) => f.type.startsWith('image/'))
    if (imagens.length) setFotos((l) => [...l, ...imagens].slice(0, MAX_FOTOS))
  }
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  // fundo escuro: só fecha se o clique começou E terminou nele (arrastar seleção não fecha)
  const downNoFundo = useRef(false)
  const fecharPeloFundo = () => {
    const escreveu = titulo.trim() !== (tituloInicial || '').trim() || descricao.trim() !== (descricaoInicial || '').trim() || !!categoria.trim() || !!terceiro.trim()
    if (escreveu && !confirm('Descartar o que você escreveu?')) return
    onFechar()
  }

  const fotosUrl = useMemo(() => fotos.map((f) => URL.createObjectURL(f)), [fotos])
  useEffect(() => () => { fotosUrl.forEach((u) => URL.revokeObjectURL(u)) }, [fotosUrl])

  const criar = async () => {
    setErro('')
    if (!responsavelId) { setErro('Escolha para quem é o pedido'); return }
    if (!titulo.trim()) { setErro('Informe o título'); return }
    if (!descricao.trim()) { setErro('Descreva o pedido — esse texto fica registrado como origem do ticket'); return }
    if (!indeterminado && prazo && inicio && prazo < inicio) { setErro(`O prazo (${br(prazo)}) não pode ser antes do dia em que começa (${br(inicio)}).`); return }
    if (!indeterminado && prazo && prazo < minimo) { setErro('Deixe pelo menos 1 dia de prazo. Se precisa ser hoje, marque "Muito urgente".'); return }
    setSalvando(true)
    try {
      // Fotos → bucket público (best-effort: falha no upload não trava o ticket)
      const pasta = `tickets/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const subidas = await Promise.all(fotos.map(async (f, k) => {
        const ext = (f.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
        const path = `${pasta}/foto-${k + 1}.${ext}`
        const { error: upErr } = await supabase.storage.from('anexos').upload(path, f, { contentType: f.type || undefined })
        return upErr ? null : { url: supabase.storage.from('anexos').getPublicUrl(path).data.publicUrl, nome: f.name || `foto-${k + 1}.${ext}` }
      }))
      const anexos = subidas.filter((a): a is { url: string; nome: string } => !!a)
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
          ...(semEspaco ? { sem_espaco: true } : {}),
          ...(quadro?.temCronograma && noCronograma ? { cronograma: true, duracao } : {}),
          terceiro_envolvido: terceiro.trim(),
          visibilidade,
          anexos,
          ...(quadro ? { quadro_id: quadro.id, quadro_coluna_id: quadro.colunaId || null } : {}),
        }),
      })
      const json = await res.json()
      if (!res.ok) { setErro(json.error || 'Falha ao criar o ticket'); return }
      if (responsavelNome) guardarRecente({ id: responsavelId, nome: responsavelNome })
      onCriado(json.ticket.id)
    } catch {
      setErro('Falha de conexão — tente novamente')
    } finally {
      setSalvando(false)
    }
  }

  // ── Atalhos de prazo (26/11/2026: "criar ticket mais ágil e objetivo") ──
  const hoje = hojeLocal()
  const somaDias = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
  const sextaDe = (iso: string) => { const d = new Date(iso + 'T12:00:00Z'); const w = d.getUTCDay(); d.setUTCDate(d.getUTCDate() + ((5 - w + 7) % 7)); return d.toISOString().slice(0, 10) }
  const amanha = diaUtil(amanhaDe(hoje))
  const sexta = sextaDe(amanha)
  const atalhos: { id: string; rotulo: string; data: string | null; dica: string }[] = [
    { id: 'amanha', rotulo: 'Amanhã', data: amanha, dica: rotuloSugestao(amanha) },
    { id: 'sexta', rotulo: 'Esta semana', data: sexta, dica: rotuloSugestao(sexta) },
    { id: 'semana', rotulo: 'Próxima semana', data: somaDias(sexta, 7), dica: rotuloSugestao(somaDias(sexta, 7)) },
    { id: '15', rotulo: 'Em 15 dias', data: diaUtil(somaDias(hoje, 15)), dica: rotuloSugestao(diaUtil(somaDias(hoje, 15))) },
  ]
  const [escolherData, setEscolherData] = useState(false)
  const usarPrazo = (d: string) => {
    setIndeterminado(false); if (urgente) setUrgente(false)
    setPrazo(d); setTocouPrazo(true)
    // a agenda pode ter sugerido começar depois: começa no máximo no prazo
    if (inicio && inicio > d) { setInicio(d); setTocouInicio(true) }
  }
  const prazoAtivo = indeterminado ? 'sem' : urgente ? 'hoje' : atalhos.find((a) => a.data === prazo)?.id || (prazo ? 'outra' : '')

  // Últimas pessoas: as do navegador + as de quem já recebeu pedidos seus (servidor), sem repetir.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const r = await fetch('/api/trabalho/central?so=pedidos', { headers: await authHeaders() })
        if (!r.ok) return
        const j = await r.json() as { pedidos?: { responsavel_id: string; created_at?: string }[]; usuarios?: Record<string, { id: string; nome: string }> }
        const doServidor = [...(j.pedidos || [])].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
          .map((p) => j.usuarios?.[p.responsavel_id]).filter((u): u is { id: string; nome: string } => !!u)
        if (!vivo) return
        setRecentes((locais) => {
          const out: Recente[] = []
          for (const u of [...locais, ...doServidor]) if (!out.some((x) => x.id === u.id)) out.push({ id: u.id, nome: u.nome })
          return out.slice(0, 6)
        })
      } catch { /* fica só o do navegador */ }
    })()
    return () => { vivo = false }
  }, [])

  const iniciais = (n: string) => n.split(' ').filter(Boolean).map((x) => x[0]).slice(0, 2).join('').toUpperCase()
  const pronto = !!responsavelId && !!titulo.trim() && !!descricao.trim()

  // Até quando a pessoa já está ocupada (último dia com tarefa). null = ainda carregando/sem dado.
  const [livreEm, setLivreEm] = useState<string | null>(null)
  useEffect(() => {
    setLivreEm(null)
    if (!responsavelId) return
    let vivo = true
    ;(async () => {
      try {
        const r = await fetch(`/api/trabalho/carga?user=${responsavelId}`, { headers: await authHeaders(), cache: 'no-store' })
        const j = await r.json().catch(() => ({})) as { pessoas?: { id: string; livreEm: string }[] }
        const p = (j.pessoas || []).find((x) => x.id === responsavelId)
        if (vivo) setLivreEm(p?.livreEm || '')
      } catch { if (vivo) setLivreEm('') }
    })()
    return () => { vivo = false }
  }, [responsavelId])
  // Sem espaço: o prazo cai num dia em que a pessoa já está ocupada (o pedido entra no fim da fila).
  const semEspaco = !!prazo && !indeterminado && !urgente && !!livreEm && prazo <= livreEm
  const primeiroNome = (responsavelNome || recentes.find((r) => r.id === responsavelId)?.nome || 'A pessoa').split(' ')[0]

  return (
    <div className="nt-fundo" onMouseDown={(e) => { downNoFundo.current = e.target === e.currentTarget }}
      onClick={(e) => { if (e.target === e.currentTarget && downNoFundo.current) fecharPeloFundo() }}
      onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && pronto && !salvando) { e.preventDefault(); criar() } }}>
      <style>{CSS_NOVO}</style>
      <div className="nt-caixa" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Novo ticket">
        <div className="nt-cab">
          <h2>Novo ticket{quadro && <small> · {quadro.nome}</small>}</h2>
          <button className="nt-x" onClick={onFechar} aria-label="Fechar"><X size={20} /></button>
        </div>

        {/* 1 · Para quem */}
        <section className="nt-passo">
          <div className="nt-rot"><span className="nt-n">1</span> Para quem?</div>
          {recentes.length > 0 && (
            <div className="nt-pessoas">
              {recentes.map((r) => (
                <button key={r.id} type="button" className={r.id === responsavelId ? 'on' : ''} onClick={() => { setResponsavelId(r.id); setResponsavelNome(r.nome) }}>
                  <span className="nt-av">{iniciais(r.nome)}</span>{r.nome.split(' ')[0]}
                </button>
              ))}
            </div>
          )}
          <UserSelect value={responsavelId} onChange={(id, u) => { setResponsavelId(id); setResponsavelNome(u?.nome || '') }}
            placeholder={recentes.length ? 'Outra pessoa: digite o nome...' : 'Digite o nome da pessoa...'} autoFocus={!recentes.length} barraBusca />
          {responsavelId && <div className="nt-carga"><style>{ESTILO_FILA}</style><CargaDaPessoa userId={responsavelId} /></div>}
        </section>

        {/* 2 · O que precisa */}
        <section className="nt-passo">
          <div className="nt-rot"><span className="nt-n">2</span> O que precisa?</div>
          <input className="nt-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={140}
            placeholder="Resumo em poucas palavras (ex.: Renovar o seguro da frota)" autoFocus={!!recentes.length} />
          <div className="nt-desc" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); juntarFotos(Array.from(e.dataTransfer.files)) }}>
            <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={4}
              onPaste={(e) => { const imgs = Array.from(e.clipboardData.files || []); if (imgs.length) { e.preventDefault(); juntarFotos(imgs) } }}
              placeholder="Explique o que precisa ser feito e por quê. Cole um print com Ctrl+V ou arraste fotos aqui." />
            <input ref={inputFotos} type="file" accept="image/*" multiple hidden onChange={(e) => { juntarFotos(Array.from(e.target.files || [])); e.target.value = '' }} />
            <div className="nt-fotos">
              {fotosUrl.map((u, k) => (
                <div key={u} className="nt-foto">
                  <img src={u} alt={`Foto ${k + 1}`} />
                  <button type="button" onClick={() => setFotos((l) => l.filter((_, i) => i !== k))} aria-label={`Tirar a foto ${k + 1}`}><X size={12} /></button>
                </div>
              ))}
              {fotos.length < MAX_FOTOS && (
                <button type="button" className="nt-addfoto" onClick={() => inputFotos.current?.click()}><ImagePlus size={15} /> {fotos.length ? 'Mais fotos' : 'Anexar fotos'}</button>
              )}
              <span className="nt-dica">Fica registrado como origem do ticket e não muda depois.</span>
            </div>
          </div>
        </section>

        {/* 3 · Até quando */}
        <section className="nt-passo">
          <div className="nt-rot"><span className="nt-n">3</span> Até quando?</div>
          <div className="nt-chips">
            {atalhos.map((a) => (
              <button key={a.id} type="button" className={prazoAtivo === a.id ? 'on' : ''} onClick={() => { setEscolherData(false); usarPrazo(a.data!) }}>
                {a.rotulo}<small>{a.dica}</small>
              </button>
            ))}
            <button type="button" className={prazoAtivo === 'outra' || escolherData ? 'on' : ''} onClick={() => setEscolherData((v) => !v)}>
              Outra data<small>{prazoAtivo === 'outra' && prazo ? rotuloSugestao(prazo) : 'escolher'}</small>
            </button>
            <button type="button" className={prazoAtivo === 'sem' ? 'on' : ''} onClick={() => { setEscolherData(false); setIndeterminado(true); if (urgente) setUrgente(false) }}>
              Sem prazo<small>contínuo</small>
            </button>
            <button type="button" className={`urg${prazoAtivo === 'hoje' ? ' on' : ''}`} onClick={() => { setEscolherData(false); setIndeterminado(false); alternarUrgente(true); setPrazo(hoje); setTocouPrazo(true) }}
              title="Fura a fila da pessoa. Use só quando não dá para esperar.">
              Hoje · urgente<small>fura a fila</small>
            </button>
          </div>
          {escolherData && (
            <div style={{ marginTop: 10, maxWidth: 260 }}>
              <SeletorDataAgenda diasUteis value={prazo} min={minimo} userId={responsavelId || undefined} textoVazio="Escolha a data"
                onChange={(v) => { usarPrazo(v); setEscolherData(false) }} />
            </div>
          )}
          {/* Cabe no prazo? (José, 26/11/2026) Quem cria NÃO define o tempo: quem faz define depois.
              Se a pessoa já está ocupada todos os dias até o prazo, o pedido vai como
              "urgente · você decide" e quem recebe escolhe se põe na frente de alguma tarefa. */}
          {responsavelId && !indeterminado && prazo && !urgente && semEspaco && (
            <div className="nt-semespaco">
              <b>{primeiroNome} já tem tarefas para todos os dias até {rotuloSugestao(livreEm!)}.</b>
              {' '}O pedido vai marcado como <b>urgente</b> e {primeiroNome} decide se coloca na frente de alguma tarefa ou não.
            </div>
          )}
          {responsavelId && (
            <div className="nt-resumo">
              {indeterminado ? 'Sem prazo: aparece todo dia útil até alguém concluir.'
                : prazo ? <>Entrega até <b>{rotuloSugestao(prazo)}</b>{urgente ? ' · fura a fila' : semEspaco ? '' : livreEm === null ? '' : ` · cabe na agenda de ${primeiroNome}`}</>
                : 'Escolha um prazo acima.'}
              <div style={{ marginTop: 4, fontSize: 13, color: '#64748b' }}>Quanto tempo leva, {primeiroNome} define quando receber.</div>
            </div>
          )}
        </section>

        {/* Só "Quem vê" (José, 26/11/2026: começa em, dias, categoria e terceiro saíram do formulário;
            dá para preencher depois em Detalhes, dentro do pedido). */}
        <section className="nt-passo nt-extra">
          <div>
            <label>Quem vê</label>
            <div className="nt-chips">
              <button type="button" className={visibilidade === 'privado' ? 'on' : ''} onClick={() => setVisibilidade('privado')}><Lock size={13} /> Só os envolvidos</button>
              <button type="button" className={visibilidade === 'publico' ? 'on' : ''} onClick={() => setVisibilidade('publico')}><Globe size={13} /> {quadro ? `Quadro ${quadro.nome}` : 'Todos'}</button>
            </div>
          </div>
          {quadro?.temCronograma && (
            <label className="nt-check"><input type="checkbox" checked={noCronograma} onChange={(e) => setNoCronograma(e.target.checked)} /> Também pôr no cronograma do quadro</label>
          )}
        </section>

        {erro && <div className="nt-erro">{erro}</div>}

        <div className="nt-rodape">
          <span className="nt-atalho">Ctrl+Enter envia</span>
          <button className="nt-cancelar" onClick={onFechar} disabled={salvando}>Cancelar</button>
          <button className="nt-enviar" onClick={criar} disabled={salvando || !pronto} title={pronto ? undefined : 'Falta: ' + [!responsavelId && 'para quem', !titulo.trim() && 'resumo', !descricao.trim() && 'o que precisa'].filter(Boolean).join(', ')}>
            {salvando ? 'Enviando…' : 'Enviar pedido'}
          </button>
        </div>
      </div>
    </div>
  )
}

const CSS_NOVO = `
.nt-fundo{position:fixed;inset:0;z-index:1000;background:rgba(15,23,42,.5);display:flex;align-items:flex-start;justify-content:center;padding:32px 16px;overflow-y:auto}
.nt-caixa{width:100%;max-width:760px;background:#fff;border-radius:18px;padding:22px 24px 18px;color:#0f172a;box-shadow:0 30px 80px -20px rgba(15,23,42,.5);animation:ntEntra .3s cubic-bezier(.2,.8,.2,1) both}
@keyframes ntEntra{from{opacity:0;transform:translateY(10px) scale(.99)}}
@media (prefers-reduced-motion:reduce){.nt-caixa{animation:none}}
.nt-cab{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
.nt-cab h2{margin:0;font-size:21px;font-weight:700;letter-spacing:-.01em}
.nt-cab h2 small{font-size:14px;font-weight:500;color:#475569}
.nt-x{border:none;background:transparent;color:#475569;cursor:pointer;width:38px;height:38px;border-radius:10px;display:grid;place-items:center}
.nt-x:hover{background:#f1f5f9;color:#0f172a}
.nt-passo{padding:16px 0;border-top:1px solid #eef2f6}
.nt-cab + .nt-passo{border-top:none}
.nt-rot{display:flex;align-items:center;gap:8px;font-size:15px;font-weight:700;margin-bottom:10px}
.nt-n{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;background:#2563eb;color:#fff;font-size:13px;font-weight:700}
.nt-pessoas{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}
.nt-pessoas button{display:inline-flex;align-items:center;gap:8px;padding:5px 14px 5px 5px;border-radius:999px;border:1px solid #cbd5e1;background:#fff;font:inherit;font-size:14.5px;font-weight:600;color:#0f172a;cursor:pointer;transition:border-color .15s,background .15s,transform .15s}
.nt-pessoas button:hover{border-color:#2563eb;transform:translateY(-1px)}
.nt-pessoas button.on{border-color:#2563eb;background:#eff6ff;color:#1d4ed8;box-shadow:0 0 0 1px #2563eb}
.nt-av{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:#64748b;color:#fff;font-size:11px;font-weight:700}
.nt-pessoas button.on .nt-av{background:#2563eb}
.nt-carga{margin-top:10px}
.nt-titulo{width:100%;box-sizing:border-box;padding:12px 14px;border-radius:12px;border:1px solid #cbd5e1;font:inherit;font-size:17px;font-weight:600;color:#0f172a;outline:none;margin-bottom:10px}
.nt-titulo:focus,.nt-desc:focus-within{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.15)}
.nt-desc{border:1px solid #cbd5e1;border-radius:12px;overflow:hidden;transition:box-shadow .15s,border-color .15s}
.nt-desc textarea{width:100%;box-sizing:border-box;border:none;outline:none;resize:vertical;padding:12px 14px;font:inherit;font-size:15px;line-height:1.5;color:#0f172a;min-height:96px}
.nt-fotos{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 10px;background:#f8fafc;border-top:1px solid #eef2f6}
.nt-foto{position:relative}
.nt-foto img{width:56px;height:56px;object-fit:cover;border-radius:8px;border:1px solid #e2e8f0;display:block}
.nt-foto button{position:absolute;top:2px;right:2px;width:18px;height:18px;border-radius:5px;border:none;background:rgba(15,23,42,.7);color:#fff;display:grid;place-items:center;cursor:pointer;padding:0}
.nt-addfoto{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 12px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;font:inherit;font-size:13.5px;font-weight:600;color:#0f172a;cursor:pointer}
.nt-addfoto:hover{border-color:#2563eb;color:#1d4ed8}
.nt-dica{margin-left:auto;font-size:12.5px;color:#64748b}
.nt-chips{display:flex;flex-wrap:wrap;gap:8px}
.nt-chips button{display:inline-flex;flex-direction:column;align-items:flex-start;gap:1px;padding:8px 14px;border-radius:12px;border:1px solid #cbd5e1;background:#fff;font:inherit;font-size:14.5px;font-weight:600;color:#0f172a;cursor:pointer;transition:border-color .15s,background .15s,transform .15s}
.nt-chips button small{font-size:12px;font-weight:500;color:#64748b;text-transform:capitalize}
.nt-chips button:hover{border-color:#2563eb;transform:translateY(-1px)}
.nt-chips button.on{border-color:#2563eb;background:#eff6ff;color:#1d4ed8;box-shadow:0 0 0 1px #2563eb}
.nt-chips button.on small{color:#1d4ed8}
.nt-chips button.urg.on{border-color:#dc2626;background:#fef2f2;color:#b91c1c;box-shadow:0 0 0 1px #dc2626}
.nt-chips button.urg.on small{color:#b91c1c}
.nt-extra .nt-chips button{flex-direction:row;align-items:center;gap:6px}
.nt-semespaco{margin-top:12px;padding:12px 14px;border-radius:12px;background:#fef2f2;border:1px solid #fecaca;color:#7f1d1d;font-size:14.5px;line-height:1.5}
.nt-semespaco b{color:#991b1b}
.nt-resumo{margin-top:12px;padding:10px 14px;border-radius:10px;background:#f8fafc;font-size:14.5px;color:#334155}
.nt-resumo b{color:#0f172a}
.nt-aviso{margin-top:6px;font-size:13px;color:#b45309}
.nt-mais{display:flex;align-items:baseline;gap:8px;width:100%;padding:12px 0;border:none;border-top:1px solid #eef2f6;background:none;font:inherit;font-size:14.5px;font-weight:600;color:#1d4ed8;cursor:pointer;text-align:left}
.nt-mais small{font-size:13px;font-weight:400;color:#64748b}
.nt-extra{display:flex;flex-direction:column;gap:12px;padding-top:4px;border-top:none}
.nt-extra label{display:block;font-size:13px;font-weight:600;color:#334155;margin-bottom:5px}
.nt-extra input:not([type=checkbox]){width:100%;box-sizing:border-box;padding:10px 12px;border-radius:10px;border:1px solid #cbd5e1;font:inherit;font-size:14.5px;color:#0f172a;outline:none}
.nt-extra input:focus{border-color:#2563eb}
.nt-linha{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.nt-check{display:flex!important;align-items:center;gap:8px;font-weight:500!important}
.nt-erro{margin-top:8px;padding:10px 12px;border-radius:10px;background:#fef2f2;color:#b91c1c;font-size:14px;font-weight:600}
.nt-rodape{display:flex;align-items:center;gap:10px;padding-top:16px;border-top:1px solid #eef2f6;margin-top:4px}
.nt-atalho{margin-right:auto;font-size:12.5px;color:#64748b}
.nt-cancelar{height:42px;padding:0 16px;border-radius:10px;border:1px solid #cbd5e1;background:#fff;font:inherit;font-size:14.5px;font-weight:600;color:#334155;cursor:pointer}
.nt-enviar{height:42px;padding:0 22px;border-radius:10px;border:none;background:#2563eb;color:#fff;font:inherit;font-size:15px;font-weight:700;cursor:pointer;transition:background .15s,transform .15s,box-shadow .15s}
.nt-enviar:hover:not(:disabled){background:#1d4ed8;transform:translateY(-1px);box-shadow:0 10px 20px -12px rgba(37,99,235,.9)}
.nt-enviar:disabled{opacity:.45;cursor:default}
@media (max-width:560px){.nt-fundo{padding:8px}.nt-caixa{padding:16px}.nt-dica{display:none}}
`
