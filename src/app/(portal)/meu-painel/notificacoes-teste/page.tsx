'use client'
// PÁGINA DE TESTE (José, 19/10/2026): opções para a "aba lateral" de notificação
// que aparece quando chega um aviso. Só demonstração — nada aqui grava no banco nem
// muda o sino de verdade. Opção 1 = como é hoje. Depois que ele escolher, a escolhida
// vai para o PortalLayout e esta página sai.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, Wallet, Wrench, Package, ClipboardList, MessageCircle, X, Check, BellOff, ChevronRight, Zap, Layers, PanelRight, Sparkles, LayoutList, GripVertical, Settings, Sun, Moon, RotateCcw } from 'lucide-react'

type Tipo = 'financeiro' | 'pos' | 'ppv' | 'requisicao' | 'novazap'
interface Aviso { id: number; tipo: Tipo; titulo: string; texto: string; urgente: boolean; em: number }

const TIPOS: Record<Tipo, { nome: string; cor: string; icone: React.ReactNode }> = {
  financeiro: { nome: 'Financeiro', cor: '#16a34a', icone: <Wallet size={18} /> },
  pos: { nome: 'Pós-Vendas', cor: '#0284c7', icone: <Wrench size={18} /> },
  ppv: { nome: 'Peças', cor: '#ea580c', icone: <Package size={18} /> },
  requisicao: { nome: 'Requisições', cor: '#7c3aed', icone: <ClipboardList size={18} /> },
  novazap: { nome: 'NovaZap', cor: '#dc2626', icone: <MessageCircle size={18} /> },
}

const EXEMPLOS: Omit<Aviso, 'id' | 'em'>[] = [
  { tipo: 'financeiro', titulo: 'Boleto pago', texto: 'Cliente Sidney A. Medeiros pagou R$ 744,01 (OS 5379).', urgente: false },
  { tipo: 'pos', titulo: 'OS-0822 faturada', texto: 'NFS-e 82 autorizada no sistema nacional.', urgente: false },
  { tipo: 'novazap', titulo: 'Cliente esperando há 12 min', texto: 'João (14) 99755-5520: "bom dia, o trator ficou pronto?"', urgente: true },
  { tipo: 'ppv', titulo: 'PPV-0519 aguardando remessa', texto: 'Falta o CST do ICMS do produto PRO 10p na Castro.', urgente: true },
  { tipo: 'requisicao', titulo: 'Requisição #6440 aprovada', texto: 'Alimentação da OS-0821 foi para o financeiro.', urgente: false },
  { tipo: 'financeiro', titulo: 'Título vence hoje', texto: '3 contas a pagar vencem hoje — R$ 12.480,00.', urgente: false },
]

const OPCOES = [
  { n: 1, nome: 'Atual', icone: <Bell size={14} />, resumo: 'Como é hoje: o aviso entra deslizando pela direita e some em 6 segundos. Cada evento vira um aviso solto.' },
  { n: 2, nome: 'Pilha', icone: <Layers size={14} />, resumo: 'Os avisos se empilham um atrás do outro no canto. Passe o mouse para abrir a pilha. Urgente ganha borda e não some sozinho.' },
  { n: 3, nome: 'Gaveta lateral', icone: <PanelRight size={14} />, resumo: 'Uma aba fica presa na borda direita com o número. Quando chega aviso, ela abre a gaveta por 5 s, mostra o novo e recolhe sozinha. Separada em Urgente e Informativo.' },
  { n: 4, nome: 'Ilha no topo', icone: <Sparkles size={14} />, resumo: 'Uma pílula no meio do topo cresce e mostra o aviso, depois encolhe e fica só com o contador. Não cobre nada da tela.' },
  { n: 5, nome: 'Agrupado por módulo', icone: <LayoutList size={14} />, resumo: 'Avisos do mesmo módulo se juntam num cartão só ("3 do Financeiro"), com ações rápidas: Abrir, Marcar lido e Silenciar o módulo.' },
  { n: 6, nome: 'Ilha ajustada', icone: <Sparkles size={14} />, resumo: 'A ilha da Opção 4 com as cores do tema (claro ou escuro), que você arrasta pela alça para qualquer lugar da tela. Dois modos: "Fica no lugar" (mostra o aviso e fica com o contador e a lista) ou "Aparece e some" (o aviso passa, some e vai para o sininho, onde você lê depois).' },
]

const agoraTxt = (em: number) => {
  const s = Math.max(0, Math.round((Date.now() - em) / 1000))
  return s < 5 ? 'agora' : s < 60 ? `há ${s}s` : `há ${Math.round(s / 60)} min`
}

export default function NotificacoesTeste() {
  const [opcao, setOpcao] = useState(1)
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const seq = useRef(0)
  const idx = useRef(0)
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t) }, [])

  const disparar = useCallback((qual?: Omit<Aviso, 'id' | 'em'>) => {
    const ex = qual || EXEMPLOS[idx.current++ % EXEMPLOS.length]
    setAvisos((l) => [{ ...ex, id: ++seq.current, em: Date.now() }, ...l].slice(0, 30))
  }, [])
  const rajada = () => { [0, 1, 2, 3].forEach((i) => setTimeout(() => disparar(), i * 450)) }
  const tirar = (id: number) => setAvisos((l) => l.filter((a) => a.id !== id))
  const tirarTipo = (t: Tipo) => setAvisos((l) => l.filter((a) => a.tipo !== t))

  const atual = OPCOES[opcao - 1]
  return (
    <div className="nt-pagina">
      <style>{CSS}</style>
      {/* abas estilo Chrome com as opções */}
      <div className="nt-abas">
        {OPCOES.map((o) => (
          <button key={o.n} className={`nt-aba ${opcao === o.n ? 'on' : ''}`} onClick={() => { setOpcao(o.n); setAvisos([]) }}>
            {o.icone} Opção {o.n} · {o.nome}
          </button>
        ))}
      </div>

      <div className="nt-corpo">
        <div className="nt-painel">
          <div className="nt-tag">PÁGINA DE TESTE · nada aqui muda o sino de verdade</div>
          <h2 className="nt-h2">Opção {atual.n} — {atual.nome}</h2>
          <p className="nt-resumo">{atual.resumo}</p>
          <div className="nt-botoes">
            <button className="nt-btn prim" onClick={() => disparar()}><Zap size={15} /> Disparar aviso</button>
            <button className="nt-btn" onClick={rajada}><Layers size={15} /> Disparar 4 seguidos</button>
            <button className="nt-btn urg" onClick={() => disparar(EXEMPLOS[2])}><MessageCircle size={15} /> Urgente (cliente esperando)</button>
            <button className="nt-btn" onClick={() => setAvisos([])}><X size={15} /> Limpar</button>
          </div>
          <div className="nt-como">
            <b>Como testar:</b> clique em &quot;Disparar 4 seguidos&quot; para ver como cada opção lida com muitos avisos de uma vez, que é o caso do dia a dia (na última semana foram mais de 1.000 avisos para 13 pessoas, e 94% ficaram sem ler).
          </div>
          {/* tela de fundo de mentira, para ver o que o aviso cobre */}
          <div className="nt-fake">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="nt-fake-linha" style={{ width: `${90 - i * 9}%` }} />)}
          </div>
        </div>
      </div>

      {opcao === 1 && <Opcao1 avisos={avisos} tirar={tirar} />}
      {opcao === 2 && <Opcao2 avisos={avisos} tirar={tirar} />}
      {opcao === 3 && <Opcao3 avisos={avisos} tirar={tirar} />}
      {opcao === 4 && <Opcao4 avisos={avisos} tirar={tirar} />}
      {opcao === 5 && <Opcao5 avisos={avisos} tirar={tirar} tirarTipo={tirarTipo} />}
      {opcao === 6 && <Opcao6 avisos={avisos} tirar={tirar} />}
    </div>
  )
}

// some sozinho depois de X ms (urgente pode ficar)
function useSomeSozinho(avisos: Aviso[], tirar: (id: number) => void, ms: number, manterUrgente: boolean) {
  useEffect(() => {
    const ts = avisos.filter((a) => !(manterUrgente && a.urgente)).map((a) => setTimeout(() => tirar(a.id), Math.max(0, ms - (Date.now() - a.em))))
    return () => ts.forEach(clearTimeout)
  }, [avisos, tirar, ms, manterUrgente])
}

function Icone({ tipo, tam = 40 }: { tipo: Tipo; tam?: number }) {
  const t = TIPOS[tipo]
  return <span className="nt-ico" style={{ width: tam, height: tam, color: t.cor, background: `color-mix(in srgb, ${t.cor} 13%, transparent)` }}>{t.icone}</span>
}

// ── Opção 1: atual ────────────────────────────────────────────────────────────
function Opcao1({ avisos, tirar }: { avisos: Aviso[]; tirar: (id: number) => void }) {
  useSomeSozinho(avisos, tirar, 6000, false)
  return (
    <div className="o1-wrap">
      {avisos.map((a, i) => (
        <div key={a.id} className="o1-toast" style={{ opacity: i > 2 ? 0.7 : 1 }} onClick={() => tirar(a.id)}>
          <div className="o1-barra" style={{ background: TIPOS[a.tipo].cor }} />
          <div className="o1-lin">
            <Icone tipo={a.tipo} tam={46} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="o1-tit">{a.titulo} <span className="o1-novo">NOVO</span></div>
              <div className="nt-txt">{a.texto}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Opção 2: pilha ────────────────────────────────────────────────────────────
function Opcao2({ avisos, tirar }: { avisos: Aviso[]; tirar: (id: number) => void }) {
  useSomeSozinho(avisos, tirar, 8000, true)
  const [aberta, setAberta] = useState(false)
  const vis = avisos.slice(0, 5)
  return (
    <div className={`o2-wrap ${aberta ? 'aberta' : ''}`} onMouseEnter={() => setAberta(true)} onMouseLeave={() => setAberta(false)}>
      {avisos.length > 1 && <div className="o2-conta">{avisos.length} avisos {aberta ? '' : '· passe o mouse'}</div>}
      <div className="o2-pilha" style={{ height: aberta ? vis.length * 92 : 96 }}>
        {vis.map((a, i) => (
          <div key={a.id} className={`o2-card ${a.urgente ? 'urg' : ''}`}
            style={{ transform: aberta ? `translateY(${i * 92}px)` : `translateY(${i * 9}px) scale(${1 - i * 0.05})`, zIndex: 10 - i, opacity: !aberta && i > 2 ? 0 : 1 }}>
            <Icone tipo={a.tipo} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="o2-topo"><span className="o2-mod" style={{ color: TIPOS[a.tipo].cor }}>{TIPOS[a.tipo].nome}</span><span className="nt-quando">{agoraTxt(a.em)}</span></div>
              <div className="o2-tit">{a.titulo}</div>
              <div className="nt-txt um">{a.texto}</div>
            </div>
            <button className="nt-x" onClick={() => tirar(a.id)}><X size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Opção 3: gaveta lateral com alça ──────────────────────────────────────────
function Opcao3({ avisos, tirar }: { avisos: Aviso[]; tirar: (id: number) => void }) {
  const [aberta, setAberta] = useState(false)
  const [fixa, setFixa] = useState(false)
  const [filtro, setFiltro] = useState<'urg' | 'info'>('urg')
  const ult = avisos[0]?.id
  useEffect(() => {
    if (!ult) return
    let vivo = true
    void Promise.resolve().then(() => { if (vivo) setAberta(true) })
    const t = fixa ? null : setTimeout(() => setAberta(false), 5000)
    return () => { vivo = false; if (t) clearTimeout(t) }
  }, [ult, fixa])
  const urg = avisos.filter((a) => a.urgente), info = avisos.filter((a) => !a.urgente)
  useEffect(() => { const a = avisos[0]; if (!a) return; void Promise.resolve().then(() => setFiltro(a.urgente ? 'urg' : 'info')) }, [ult]) // eslint-disable-line react-hooks/exhaustive-deps
  const lista = filtro === 'urg' ? urg : info
  return (
    <>
      <button className={`o3-alca ${aberta ? 'escondida' : ''} ${urg.length ? 'tem-urg' : ''}`} onClick={() => { setAberta(true); setFixa(true) }}>
        <Bell size={16} />
        {avisos.length > 0 && <span className="o3-num">{avisos.length}</span>}
      </button>
      <div className={`o3-gaveta ${aberta ? 'aberta' : ''}`} onMouseEnter={() => setFixa(true)}>
        <div className="o3-cab">
          <b>Notificações</b>
          <button className="nt-x" onClick={() => { setAberta(false); setFixa(false) }}><ChevronRight size={16} /></button>
        </div>
        <div className="o3-filtros">
          <button className={filtro === 'urg' ? 'on urg' : ''} onClick={() => setFiltro('urg')}>Pede sua ação <span>{urg.length}</span></button>
          <button className={filtro === 'info' ? 'on' : ''} onClick={() => setFiltro('info')}>Informativo <span>{info.length}</span></button>
        </div>
        <div className="o3-lista">
          {lista.length === 0 && <div className="o3-vazio"><Check size={18} /> Nada aqui.</div>}
          {lista.map((a, i) => (
            <div key={a.id} className={`o3-item ${i === 0 && a.id === ult ? 'novo' : ''}`}>
              <Icone tipo={a.tipo} tam={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="o2-topo"><span className="o2-mod" style={{ color: TIPOS[a.tipo].cor }}>{TIPOS[a.tipo].nome}</span><span className="nt-quando">{agoraTxt(a.em)}</span></div>
                <div className="o2-tit">{a.titulo}</div>
                <div className="nt-txt">{a.texto}</div>
              </div>
              <button className="nt-x" title="Marcar como lido" onClick={() => tirar(a.id)}><Check size={14} /></button>
            </div>
          ))}
        </div>
        {!fixa && aberta && <div className="o3-timer" key={ult} />}
      </div>
    </>
  )
}

// ── Opção 4: ilha no topo ─────────────────────────────────────────────────────
function Opcao4({ avisos, tirar }: { avisos: Aviso[]; tirar: (id: number) => void }) {
  const [mostrando, setMostrando] = useState<Aviso | null>(null)
  const [aberta, setAberta] = useState(false)
  const ult = avisos[0]
  useEffect(() => {
    if (!ult) return
    let vivo = true
    void Promise.resolve().then(() => { if (vivo) setMostrando(ult) })
    const t = setTimeout(() => setMostrando(null), 4500)
    return () => { vivo = false; clearTimeout(t) }
  }, [ult?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const urg = avisos.filter((a) => a.urgente).length
  const expandida = !!mostrando || aberta
  return (
    <div className="o4-wrap">
      <div className={`o4-ilha ${expandida ? 'exp' : ''} ${aberta ? 'lista' : ''} ${mostrando?.urgente ? 'urg' : ''}`} onClick={() => !mostrando && setAberta((x) => !x)}>
        {!expandida && (
          <div className="o4-mini">
            <Bell size={14} /> {avisos.length ? `${avisos.length} novas` : 'Sem avisos'}
            {urg > 0 && <span className="o4-urg">{urg} urgente{urg > 1 ? 's' : ''}</span>}
          </div>
        )}
        {mostrando && !aberta && (
          <div className="o4-aviso" key={mostrando.id}>
            <Icone tipo={mostrando.tipo} tam={38} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="o4-tit">{mostrando.titulo}</div>
              <div className="nt-txt um">{mostrando.texto}</div>
            </div>
          </div>
        )}
        {aberta && (
          <div className="o4-lista" onClick={(e) => e.stopPropagation()}>
            {avisos.slice(0, 6).map((a) => (
              <div key={a.id} className="o4-item">
                <Icone tipo={a.tipo} tam={30} />
                <div style={{ flex: 1, minWidth: 0 }}><div className="o4-tit pq">{a.titulo}</div><div className="nt-txt um">{a.texto}</div></div>
                <button className="nt-x" onClick={() => tirar(a.id)}><Check size={13} /></button>
              </div>
            ))}
            {!avisos.length && <div className="o3-vazio"><Check size={16} /> Tudo lido.</div>}
            <button className="o4-fechar" onClick={() => setAberta(false)}>Recolher</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Opção 5: agrupado por módulo ──────────────────────────────────────────────
function Opcao5({ avisos, tirar, tirarTipo }: { avisos: Aviso[]; tirar: (id: number) => void; tirarTipo: (t: Tipo) => void }) {
  const [silenciados, setSilenciados] = useState<Tipo[]>([])
  const [abertos, setAbertos] = useState<Tipo[]>([])
  const grupos = (Object.keys(TIPOS) as Tipo[])
    .map((t) => ({ t, itens: avisos.filter((a) => a.tipo === t) }))
    .filter((g) => g.itens.length && !silenciados.includes(g.t))
    .sort((a, b) => Number(b.itens.some((x) => x.urgente)) - Number(a.itens.some((x) => x.urgente)) || b.itens[0].em - a.itens[0].em)
  return (
    <div className="o5-wrap">
      {silenciados.length > 0 && (
        <div className="o5-silenc"><BellOff size={13} /> Silenciados: {silenciados.map((s) => TIPOS[s].nome).join(', ')} <button onClick={() => setSilenciados([])}>desfazer</button></div>
      )}
      {grupos.map((g) => {
        const urg = g.itens.some((x) => x.urgente)
        const aberto = abertos.includes(g.t)
        return (
          <div key={g.t} className={`o5-card ${urg ? 'urg' : ''}`} style={{ ['--cor' as string]: TIPOS[g.t].cor }}>
            <div className="o5-cab" onClick={() => setAbertos((l) => aberto ? l.filter((x) => x !== g.t) : [...l, g.t])}>
              <Icone tipo={g.t} tam={38} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="o5-tit">{TIPOS[g.t].nome} {g.itens.length > 1 && <span className="o5-qtd" key={g.itens.length}>{g.itens.length}</span>} {urg && <span className="o5-flag">pede ação</span>}</div>
                <div className="nt-txt um">{g.itens[0].titulo} — {g.itens[0].texto}</div>
              </div>
              <span className="nt-quando">{agoraTxt(g.itens[0].em)}</span>
            </div>
            {aberto && g.itens.length > 1 && (
              <div className="o5-itens">
                {g.itens.map((a) => <div key={a.id} className="o5-it"><span>{a.titulo}</span><button className="nt-x" onClick={() => tirar(a.id)}><Check size={12} /></button></div>)}
              </div>
            )}
            <div className="o5-acoes">
              <button className="prim">Abrir</button>
              <button onClick={() => tirarTipo(g.t)}><Check size={13} /> Marcar lido{g.itens.length > 1 ? 's' : ''}</button>
              <button onClick={() => { setSilenciados((l) => [...l, g.t]) }}><BellOff size={13} /> Silenciar {TIPOS[g.t].nome}</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Opção 6: ilha ajustada (tema do usuário + arrastar + modo) ────────────────
type ModoIlha = 'fica' | 'some'
interface PosIlha { x: number; y: number } // centro, em fração da tela (0–1)
const POS_PRONTAS: { id: string; nome: string; pos: PosIlha }[] = [
  { id: 'te', nome: 'Topo esq.', pos: { x: 0.16, y: 0.12 } },
  { id: 'tc', nome: 'Topo meio', pos: { x: 0.5, y: 0.12 } },
  { id: 'td', nome: 'Topo dir.', pos: { x: 0.84, y: 0.12 } },
  { id: 'be', nome: 'Baixo esq.', pos: { x: 0.16, y: 0.92 } },
  { id: 'bc', nome: 'Baixo meio', pos: { x: 0.5, y: 0.92 } },
  { id: 'bd', nome: 'Baixo dir.', pos: { x: 0.84, y: 0.92 } },
]
const POS_PADRAO = POS_PRONTAS[1].pos
const LARG = 440 // largura aberta (para não sair da tela)

function lerLocal<T>(chave: string, padrao: T): T {
  try { const v = localStorage.getItem(chave); return v ? (JSON.parse(v) as T) : padrao } catch { return padrao }
}
function gravarLocal(chave: string, v: unknown) { try { localStorage.setItem(chave, JSON.stringify(v)) } catch { /* sem storage */ } }

function Opcao6({ avisos, tirar }: { avisos: Aviso[]; tirar: (id: number) => void }) {
  const [modo, setModo] = useState<ModoIlha>(() => lerLocal<ModoIlha>('teste-ilha-modo', 'fica'))
  const [pos, setPos] = useState<PosIlha>(() => lerLocal<PosIlha>('teste-ilha-pos', POS_PADRAO))
  const [arrastando, setArrastando] = useState(false)
  const [mostrando, setMostrando] = useState<Aviso | null>(null)
  const [aberta, setAberta] = useState(false)
  const [sinoAberto, setSinoAberto] = useState(false)
  const [pulo, setPulo] = useState(0)
  const [tela, setTela] = useState({ w: 1280, h: 800 })
  const [tema, setTema] = useState<'light' | 'dark'>('light')
  const temaOriginal = useRef<string | null>(null)

  // tamanho da tela (para manter a ilha dentro dela)
  useEffect(() => {
    const medir = () => setTela({ w: window.innerWidth, h: window.innerHeight })
    void Promise.resolve().then(medir)
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [])
  // prévia do tema: troca e, ao sair da opção, devolve o tema do usuário
  useEffect(() => {
    const raiz = document.documentElement
    temaOriginal.current = raiz.getAttribute('data-theme')
    void Promise.resolve().then(() => setTema(temaOriginal.current === 'dark' ? 'dark' : 'light'))
    return () => { if (temaOriginal.current) raiz.setAttribute('data-theme', temaOriginal.current); else raiz.removeAttribute('data-theme') }
  }, [])
  const trocarTema = (t: 'light' | 'dark') => { document.documentElement.setAttribute('data-theme', t); setTema(t) }

  // aviso novo: a ilha cresce e mostra; depois encolhe (modo "fica") ou some e o sino pula (modo "some")
  const ult = avisos[0]
  useEffect(() => {
    if (!ult) return
    let vivo = true
    void Promise.resolve().then(() => { if (vivo) setMostrando(ult) })
    const t = setTimeout(() => { setMostrando(null); setPulo((p) => p + 1) }, 4500)
    return () => { vivo = false; clearTimeout(t) }
  }, [ult?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // arrastar pela alça
  useEffect(() => {
    if (!arrastando) return
    const mover = (e: PointerEvent) => setPos({ x: Math.min(1, Math.max(0, e.clientX / window.innerWidth)), y: Math.min(1, Math.max(0, e.clientY / window.innerHeight)) })
    const soltar = () => setArrastando(false)
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
    return () => { window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', soltar) }
  }, [arrastando])
  useEffect(() => { if (!arrastando) gravarLocal('teste-ilha-pos', pos) }, [arrastando, pos])
  const escolherModo = (m: ModoIlha) => { setModo(m); gravarLocal('teste-ilha-modo', m); setAberta(false) }
  const escolherPos = (p: PosIlha) => { setPos(p); gravarLocal('teste-ilha-pos', p) }

  // posição na tela: centro em x; embaixo da metade da tela a ilha cresce para CIMA
  const metade = LARG / 2 + 8
  const left = Math.min(tela.w - metade, Math.max(metade, pos.x * tela.w))
  const embaixo = pos.y > 0.55
  const ancora: React.CSSProperties = embaixo
    ? { left, bottom: Math.max(8, (1 - pos.y) * tela.h - 22) }
    : { left, top: Math.max(76, pos.y * tela.h - 22) }

  const urg = avisos.filter((a) => a.urgente).length
  const expandida = !!mostrando || aberta
  const escondida = modo === 'some' && !mostrando && !arrastando
  const presetAtual = POS_PRONTAS.find((p) => Math.abs(p.pos.x - pos.x) < 0.01 && Math.abs(p.pos.y - pos.y) < 0.01)?.id

  return (
    <>
      <div className={`o6-ilha ${expandida ? 'exp' : ''} ${aberta ? 'lista' : ''} ${mostrando?.urgente ? 'urg' : ''} ${escondida ? 'escondida' : ''} ${arrastando ? 'arrastando' : ''} ${embaixo ? 'embaixo' : ''}`}
        style={ancora}>
        <button className="o6-alca" title="Arraste para colocar onde quiser" onPointerDown={(e) => { e.preventDefault(); setArrastando(true) }}><GripVertical size={15} /></button>
        <div className="o6-conteudo" onClick={() => { if (!mostrando && modo === 'fica') setAberta((x) => !x) }}>
          {!expandida && (
            <div className="o6-mini">
              <Bell size={14} /> {avisos.length ? `${avisos.length} nova${avisos.length > 1 ? 's' : ''}` : 'Sem avisos'}
              {urg > 0 && <span className="o6-urg">{urg} urgente{urg > 1 ? 's' : ''}</span>}
            </div>
          )}
          {mostrando && !aberta && (
            <div className="o6-aviso" key={mostrando.id}>
              <Icone tipo={mostrando.tipo} tam={38} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="o6-mod" style={{ color: TIPOS[mostrando.tipo].cor }}>{TIPOS[mostrando.tipo].nome}{mostrando.urgente ? ' · pede sua ação' : ''}</div>
                <div className="o6-tit">{mostrando.titulo}</div>
                <div className="nt-txt um">{mostrando.texto}</div>
              </div>
            </div>
          )}
          {aberta && (
            <div className="o6-lista" onClick={(e) => e.stopPropagation()}>
              {avisos.slice(0, 6).map((a) => (
                <div key={a.id} className={`o6-item ${a.urgente ? 'urg' : ''}`}>
                  <Icone tipo={a.tipo} tam={30} />
                  <div style={{ flex: 1, minWidth: 0 }}><div className="o6-tit pq">{a.titulo}</div><div className="nt-txt um">{a.texto}</div></div>
                  <button className="nt-x" title="Marcar como lido" onClick={() => tirar(a.id)}><Check size={13} /></button>
                </div>
              ))}
              {!avisos.length && <div className="o3-vazio"><Check size={16} /> Tudo lido.</div>}
              <button className="o6-fechar" onClick={() => setAberta(false)}>Recolher</button>
            </div>
          )}
        </div>
        {mostrando && <div className="o6-tempo" key={`t${mostrando.id}`} />}
      </div>

      {/* ajustes (no portal de verdade ficariam no sininho / Preferências) */}
      <div className="o6-ajustes">
        <div className="o6-aj-tit"><Settings size={14} /> Ajustes da ilha <span>(cada usuário escolhe o seu)</span></div>
        <div className="o6-aj-rot">Como os avisos aparecem</div>
        <div className="o6-seg">
          <button className={modo === 'fica' ? 'on' : ''} onClick={() => escolherModo('fica')}>Fica no lugar</button>
          <button className={modo === 'some' ? 'on' : ''} onClick={() => escolherModo('some')}>Aparece e some</button>
        </div>
        <div className="o6-aj-ajuda">{modo === 'fica' ? 'Mostra o aviso e fica pequena com o contador. Clique nela para ver a lista.' : 'O aviso passa e some. Para ler depois, abra o sininho.'}</div>
        <div className="o6-aj-rot">Onde fica <span>— ou arraste pela alça <GripVertical size={11} /></span></div>
        <div className="o6-grade">
          {POS_PRONTAS.map((p) => <button key={p.id} className={presetAtual === p.id ? 'on' : ''} onClick={() => escolherPos(p.pos)}>{p.nome}</button>)}
        </div>
        <div className="o6-aj-linha">
          <button className="o6-mini-btn" onClick={() => escolherPos(POS_PADRAO)}><RotateCcw size={12} /> Voltar ao padrão</button>
          <div className="o6-seg pq">
            <button className={tema === 'light' ? 'on' : ''} onClick={() => trocarTema('light')}><Sun size={12} /> Claro</button>
            <button className={tema === 'dark' ? 'on' : ''} onClick={() => trocarTema('dark')}><Moon size={12} /> Escuro</button>
          </div>
        </div>
        {modo === 'some' && (
          <div className="o6-sino-linha">
            <button className="o6-sino" key={pulo} onClick={() => setSinoAberto((x) => !x)} title="Sininho de exemplo">
              <Bell size={16} />{avisos.length > 0 && <span>{avisos.length}</span>}
            </button>
            <span className="o6-aj-ajuda" style={{ margin: 0 }}>Sininho de exemplo: o aviso que some vem para cá.</span>
          </div>
        )}
        {modo === 'some' && sinoAberto && (
          <div className="o6-sino-lista">
            {avisos.map((a) => (
              <div key={a.id} className="o6-item"><Icone tipo={a.tipo} tam={26} /><div style={{ flex: 1, minWidth: 0 }}><div className="o6-tit pq">{a.titulo}</div><div className="nt-txt um">{a.texto}</div></div><button className="nt-x" onClick={() => tirar(a.id)}><Check size={12} /></button></div>
            ))}
            {!avisos.length && <div className="o3-vazio"><Check size={14} /> Nada no sino.</div>}
          </div>
        )}
      </div>
    </>
  )
}

const CSS = `
.nt-pagina { min-height: calc(100vh - 90px); background: var(--portal-bg, #f6f4ef); color: var(--portal-text, #111827); }
.nt-abas { display: flex; gap: 2px; padding: 10px 16px 0; background: var(--portal-bg-secondary, #ece7dd); overflow-x: auto; }
.nt-aba { display: flex; align-items: center; gap: 7px; padding: 9px 16px; border: none; border-radius: 10px 10px 0 0; background: transparent; color: var(--portal-text-secondary, #475569); font: 600 13px inherit; cursor: pointer; white-space: nowrap; transition: background .2s; }
.nt-aba:hover { background: color-mix(in srgb, var(--portal-bg-card, #fff) 60%, transparent); }
.nt-aba.on { background: var(--portal-bg-card, #fff); color: var(--portal-text, #111); box-shadow: 0 -2px 8px rgba(0,0,0,.05); }
.nt-corpo { padding: 24px 16px; }
.nt-painel { max-width: none; background: var(--portal-bg-card, #fff); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 16px; padding: 22px; }
.nt-tag { display: inline-block; font-size: 10.5px; font-weight: 800; letter-spacing: .6px; color: #b45309; background: #fef3c7; padding: 3px 9px; border-radius: 999px; }
.nt-h2 { margin: 12px 0 4px; font-size: 22px; }
.nt-resumo { margin: 0; color: var(--portal-text-secondary, #475569); font-size: 14px; line-height: 1.55; max-width: 760px; }
.nt-botoes { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; }
.nt-btn { display: inline-flex; align-items: center; gap: 7px; padding: 10px 15px; border-radius: 10px; border: 1px solid var(--portal-border, #e5e7eb); background: var(--portal-bg-secondary, #f8fafc); color: var(--portal-text, #111); font: 700 13px inherit; cursor: pointer; transition: transform .15s; }
.nt-btn:active { transform: scale(.96); }
.nt-btn.prim { background: #0f172a; border-color: #0f172a; color: #fefefe; }
.nt-btn.urg { border-color: #fca5a5; color: #b91c1c; }
.nt-como { margin-top: 16px; padding: 11px 14px; border-radius: 10px; background: var(--portal-bg-secondary, #f8fafc); font-size: 13px; line-height: 1.5; color: var(--portal-text-secondary, #475569); }
.nt-fake { margin-top: 18px; display: grid; gap: 10px; }
.nt-fake-linha { height: 34px; border-radius: 8px; background: var(--portal-bg-secondary, #f1f5f9); }
.nt-ico { display: inline-flex; align-items: center; justify-content: center; border-radius: 12px; flex-shrink: 0; }
.nt-txt { font-size: 12.5px; color: var(--portal-text-secondary, #475569); line-height: 1.4; }
.nt-txt.um { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nt-quando { font-size: 11px; color: var(--portal-text-muted, #94a3b8); white-space: nowrap; }
.nt-x { border: none; background: transparent; color: var(--portal-text-muted, #94a3b8); cursor: pointer; padding: 5px; border-radius: 7px; display: flex; }
.nt-x:hover { background: var(--portal-bg-secondary, #f1f5f9); color: var(--portal-text, #111); }

/* 1 — atual */
.o1-wrap { position: fixed; top: 92px; right: 24px; display: flex; flex-direction: column; gap: 12px; z-index: 9999; }
.o1-toast { width: 380px; max-width: calc(100vw - 48px); background: var(--portal-bg-card, #fff); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,.12); overflow: hidden; cursor: pointer; animation: o1In .4s cubic-bezier(.16,1,.3,1); }
.o1-barra { height: 3px; animation: o1Bar 6s linear forwards; }
.o1-lin { display: flex; align-items: center; gap: 14px; padding: 14px 18px; }
.o1-tit { font-size: 14px; font-weight: 700; margin-bottom: 3px; }
.o1-novo { font-size: 9px; font-weight: 800; color: #fff; background: #dc2626; padding: 2px 6px; border-radius: 4px; margin-left: 6px; }
@keyframes o1In { from { transform: translateX(120%); opacity: 0 } to { transform: none; opacity: 1 } }
@keyframes o1Bar { from { width: 100% } to { width: 0 } }

/* 2 — pilha */
.o2-wrap { position: fixed; bottom: 24px; right: 24px; width: 370px; max-width: calc(100vw - 32px); z-index: 9999; }
.o2-conta { text-align: right; font-size: 11.5px; font-weight: 700; color: var(--portal-text-secondary, #475569); margin-bottom: 6px; }
.o2-pilha { position: relative; transition: height .35s cubic-bezier(.16,1,.3,1); }
.o2-card { position: absolute; top: 0; left: 0; right: 0; display: flex; gap: 12px; align-items: flex-start; padding: 13px 14px; background: var(--portal-bg-card, #fff); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 14px; box-shadow: 0 10px 30px rgba(15,23,42,.14); transition: transform .35s cubic-bezier(.16,1,.3,1), opacity .25s; animation: o2In .45s cubic-bezier(.16,1,.3,1); transform-origin: top center; }
.o2-card.urg { border: 1.5px solid #fca5a5; box-shadow: 0 10px 30px rgba(220,38,38,.18); }
.o2-topo { display: flex; justify-content: space-between; gap: 8px; }
.o2-mod { font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .4px; }
.o2-tit { font-size: 13.5px; font-weight: 800; margin: 1px 0 2px; }
@keyframes o2In { from { transform: translateY(40px) scale(.92); opacity: 0 } }

/* 3 — gaveta */
.o3-alca { position: fixed; right: 0; top: 50%; transform: translateY(-50%); z-index: 9998; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 14px 9px; border: 1px solid var(--portal-border, #e5e7eb); border-right: none; border-radius: 12px 0 0 12px; background: var(--portal-bg-card, #fff); color: var(--portal-text, #111); box-shadow: -4px 0 18px rgba(0,0,0,.08); cursor: pointer; transition: transform .3s, opacity .3s; }
.o3-alca.escondida { transform: translate(100%, -50%); opacity: 0; }
.o3-alca.tem-urg { color: #dc2626; animation: o3Pulso 1.6s ease-in-out infinite; }
.o3-num { font-size: 11px; font-weight: 800; min-width: 20px; padding: 2px 5px; border-radius: 10px; background: #0f172a; color: #fefefe; }
.o3-alca.tem-urg .o3-num { background: #dc2626; }
@keyframes o3Pulso { 50% { box-shadow: -4px 0 22px rgba(220,38,38,.35) } }
.o3-gaveta { position: fixed; top: 84px; right: 0; bottom: 0; width: 380px; max-width: 92vw; z-index: 9999; background: var(--portal-bg-card, #fff); border-left: 1px solid var(--portal-border, #e5e7eb); box-shadow: -18px 0 40px rgba(15,23,42,.14); transform: translateX(105%); transition: transform .42s cubic-bezier(.16,1,.3,1); display: flex; flex-direction: column; }
.o3-gaveta.aberta { transform: none; }
.o3-cab { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; border-bottom: 1px solid var(--portal-border, #e5e7eb); font-size: 15px; }
.o3-filtros { display: flex; gap: 6px; padding: 10px 14px; }
.o3-filtros button { flex: 1; display: flex; justify-content: center; align-items: center; gap: 6px; padding: 8px; border-radius: 9px; border: 1px solid var(--portal-border, #e5e7eb); background: transparent; color: var(--portal-text-secondary, #475569); font: 700 12.5px inherit; cursor: pointer; }
.o3-filtros button span { font-size: 11px; padding: 0 6px; border-radius: 8px; background: var(--portal-bg-secondary, #f1f5f9); }
.o3-filtros button.on { background: #0f172a; border-color: #0f172a; color: #fefefe; }
.o3-filtros button.on.urg { background: #dc2626; border-color: #dc2626; }
.o3-filtros button.on span { background: rgba(255,255,255,.22); }
.o3-lista { flex: 1; overflow-y: auto; padding: 4px 12px 12px; display: grid; gap: 8px; align-content: start; }
.o3-item { display: flex; gap: 11px; padding: 11px; border-radius: 12px; border: 1px solid var(--portal-border, #e5e7eb); animation: o3Item .45s cubic-bezier(.16,1,.3,1); }
.o3-item.novo { border-color: #93c5fd; background: color-mix(in srgb, #3b82f6 6%, transparent); }
@keyframes o3Item { from { transform: translateX(30px); opacity: 0 } }
.o3-vazio { display: flex; align-items: center; justify-content: center; gap: 7px; padding: 30px; color: var(--portal-text-muted, #94a3b8); font-size: 13px; }
.o3-timer { height: 3px; background: #3b82f6; animation: o1Bar 5s linear forwards; }

/* 4 — ilha */
.o4-wrap { position: fixed; top: 96px; left: 0; right: 0; display: flex; justify-content: center; z-index: 9999; pointer-events: none; }
.o4-ilha { pointer-events: auto; background: #0f172a; color: #fefefe; border-radius: 999px; padding: 8px 16px; min-width: 150px; box-shadow: 0 12px 34px rgba(15,23,42,.3); cursor: pointer; transition: all .5s cubic-bezier(.34,1.4,.5,1); overflow: hidden; }
.o4-ilha.exp { border-radius: 22px; padding: 12px 16px; min-width: 420px; max-width: calc(100vw - 32px); }
.o4-ilha.urg { box-shadow: 0 0 0 2px #ef4444, 0 12px 34px rgba(220,38,38,.35); }
.o4-ilha.lista { border-radius: 18px; min-width: 440px; cursor: default; }
.o4-mini { display: flex; align-items: center; justify-content: center; gap: 7px; font-size: 12.5px; font-weight: 700; white-space: nowrap; }
.o4-urg { font-size: 10.5px; padding: 1px 7px; border-radius: 999px; background: #ef4444; }
.o4-aviso { display: flex; align-items: center; gap: 12px; animation: o4Fade .4s ease .15s both; }
.o4-ilha .nt-txt { color: #cbd5e1; }
.o4-tit { font-size: 14px; font-weight: 800; }
.o4-tit.pq { font-size: 12.5px; }
.o4-lista { display: grid; gap: 6px; animation: o4Fade .35s ease both; }
.o4-item { display: flex; align-items: center; gap: 10px; padding: 7px 8px; border-radius: 11px; background: rgba(255,255,255,.06); }
.o4-ilha .nt-x { color: #94a3b8; } .o4-ilha .nt-x:hover { background: rgba(255,255,255,.1); color: #fff; }
.o4-fechar { margin-top: 4px; border: none; background: transparent; color: #94a3b8; font: 700 12px inherit; cursor: pointer; }
@keyframes o4Fade { from { opacity: 0; transform: translateY(-6px) } }

/* 5 — agrupado */
.o5-wrap { position: fixed; top: 92px; right: 24px; width: 390px; max-width: calc(100vw - 32px); display: grid; gap: 10px; z-index: 9999; }
.o5-silenc { justify-self: end; display: flex; align-items: center; gap: 6px; font-size: 11.5px; padding: 5px 10px; border-radius: 999px; background: var(--portal-bg-card, #fff); border: 1px solid var(--portal-border, #e5e7eb); color: var(--portal-text-secondary, #475569); }
.o5-silenc button { border: none; background: none; color: #2563eb; font-weight: 700; cursor: pointer; }
.o5-card { background: var(--portal-bg-card, #fff); border: 1px solid var(--portal-border, #e5e7eb); border-left: 4px solid var(--cor); border-radius: 14px; box-shadow: 0 10px 28px rgba(15,23,42,.12); overflow: hidden; animation: o2In .45s cubic-bezier(.16,1,.3,1); }
.o5-card.urg { box-shadow: 0 10px 28px rgba(220,38,38,.2); }
.o5-cab { display: flex; align-items: center; gap: 11px; padding: 12px 13px 8px; cursor: pointer; }
.o5-tit { display: flex; align-items: center; gap: 6px; font-size: 13.5px; font-weight: 800; }
.o5-qtd { font-size: 11px; min-width: 20px; text-align: center; padding: 1px 6px; border-radius: 9px; background: var(--cor); color: #fefefe; animation: o5Pop .4s cubic-bezier(.34,1.6,.5,1); }
.o5-flag { font-size: 10px; font-weight: 800; padding: 1px 7px; border-radius: 999px; color: #b91c1c; background: #fee2e2; }
@keyframes o5Pop { from { transform: scale(.4) } }
.o5-itens { padding: 0 13px 6px 62px; display: grid; gap: 3px; }
.o5-it { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--portal-text-secondary, #475569); }
.o5-acoes { display: flex; gap: 6px; padding: 8px 13px 12px; border-top: 1px solid var(--portal-border, #f1f5f9); }
.o5-acoes button { display: inline-flex; align-items: center; gap: 5px; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--portal-border, #e5e7eb); background: transparent; color: var(--portal-text-secondary, #475569); font: 700 11.5px inherit; cursor: pointer; white-space: nowrap; }
.o5-acoes button.prim { background: var(--cor); border-color: var(--cor); color: #fefefe; }
/* 6 — ilha ajustada: só variáveis do tema (claro/escuro) */
.o6-ilha { position: fixed; z-index: 9999; transform: translateX(-50%); display: flex; align-items: stretch; gap: 2px; background: var(--portal-bg-card, #fff); color: var(--portal-text, #111); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 999px; padding: 6px 14px 6px 4px; min-width: 170px; max-width: calc(100vw - 16px); box-shadow: 0 12px 34px rgba(15,23,42,.18); transition: all .5s cubic-bezier(.34,1.4,.5,1); overflow: hidden; }
.o6-ilha.exp { border-radius: 22px; padding: 10px 14px 10px 4px; width: 420px; }
.o6-ilha.lista { border-radius: 18px; width: 440px; }
.o6-ilha.urg { border-color: #ef4444; box-shadow: 0 0 0 2px color-mix(in srgb, #ef4444 45%, transparent), 0 12px 34px rgba(220,38,38,.25); }
.o6-ilha.escondida { opacity: 0; transform: translateX(-50%) scale(.6); pointer-events: none; }
.o6-ilha.arrastando { transition: none; cursor: grabbing; box-shadow: 0 18px 44px rgba(15,23,42,.3); }
.o6-alca { flex: none; display: flex; align-items: center; border: none; background: transparent; color: var(--portal-text-muted, #94a3b8); cursor: grab; padding: 0 2px; border-radius: 8px; touch-action: none; }
.o6-alca:hover { color: var(--portal-text, #111); background: var(--portal-bg-secondary, #f1f5f9); }
.o6-conteudo { flex: 1; min-width: 0; cursor: pointer; }
.o6-mini { display: flex; align-items: center; justify-content: center; gap: 7px; font-size: 12.5px; font-weight: 700; white-space: nowrap; padding: 2px 0; }
.o6-urg { font-size: 10.5px; padding: 1px 7px; border-radius: 999px; background: #ef4444; color: #fefefe; }
.o6-aviso { display: flex; align-items: center; gap: 12px; animation: o4Fade .4s ease .15s both; }
.o6-mod { font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .4px; }
.o6-tit { font-size: 14px; font-weight: 800; }
.o6-tit.pq { font-size: 12.5px; }
.o6-lista { display: grid; gap: 6px; animation: o4Fade .35s ease both; cursor: default; }
.o6-item { display: flex; align-items: center; gap: 10px; padding: 7px 8px; border-radius: 11px; background: var(--portal-bg-secondary, #f8fafc); }
.o6-item.urg { box-shadow: inset 3px 0 0 #ef4444; }
.o6-fechar { margin-top: 2px; border: none; background: transparent; color: var(--portal-text-muted, #94a3b8); font: 700 12px inherit; cursor: pointer; }
.o6-tempo { position: absolute; left: 0; bottom: 0; height: 3px; background: #3b82f6; animation: o1Bar 4.5s linear forwards; }
.o6-ilha.urg .o6-tempo { background: #ef4444; }
.o6-ajustes { position: fixed; left: 24px; bottom: 24px; z-index: 9998; width: 330px; max-width: calc(100vw - 48px); background: var(--portal-bg-card, #fff); color: var(--portal-text, #111); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 14px; padding: 14px; box-shadow: 0 10px 30px rgba(15,23,42,.12); display: grid; gap: 8px; }
.o6-aj-tit { display: flex; align-items: center; gap: 7px; font-size: 13.5px; font-weight: 800; }
.o6-aj-tit span, .o6-aj-rot span { font-weight: 500; color: var(--portal-text-muted, #94a3b8); font-size: 11.5px; text-transform: none; letter-spacing: 0; display: inline-flex; align-items: center; gap: 2px; }
.o6-aj-rot { font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; color: var(--portal-text-secondary, #475569); margin-top: 4px; }
.o6-aj-ajuda { font-size: 12px; color: var(--portal-text-secondary, #475569); line-height: 1.4; }
.o6-seg { display: flex; padding: 3px; gap: 3px; border-radius: 10px; background: var(--portal-bg-secondary, #f1f5f9); }
.o6-seg button { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 5px; padding: 7px 8px; border: none; border-radius: 8px; background: transparent; color: var(--portal-text-secondary, #475569); font: 700 12px inherit; cursor: pointer; transition: background .2s; }
.o6-seg button.on { background: var(--portal-bg-card, #fff); color: var(--portal-text, #111); box-shadow: 0 1px 3px rgba(0,0,0,.12); }
.o6-seg.pq button { padding: 5px 8px; font-size: 11.5px; }
.o6-grade { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; }
.o6-grade button { padding: 7px 4px; border-radius: 8px; border: 1px solid var(--portal-border, #e5e7eb); background: transparent; color: var(--portal-text-secondary, #475569); font: 700 11.5px inherit; cursor: pointer; }
.o6-grade button.on { border-color: #3b82f6; color: #3b82f6; background: color-mix(in srgb, #3b82f6 8%, transparent); }
.o6-aj-linha { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 2px; }
.o6-mini-btn { display: inline-flex; align-items: center; gap: 5px; border: none; background: transparent; color: var(--portal-text-secondary, #475569); font: 700 11.5px inherit; cursor: pointer; padding: 4px 0; }
.o6-sino-linha { display: flex; align-items: center; gap: 10px; margin-top: 4px; padding-top: 10px; border-top: 1px solid var(--portal-border, #e5e7eb); }
.o6-sino { position: relative; flex: none; width: 38px; height: 38px; border-radius: 11px; border: 1px solid var(--portal-border, #e5e7eb); background: var(--portal-bg-secondary, #f8fafc); color: var(--portal-text, #111); display: flex; align-items: center; justify-content: center; cursor: pointer; animation: o6Pulo .5s cubic-bezier(.34,1.8,.5,1); }
.o6-sino span { position: absolute; top: -6px; right: -6px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: #f59e0b; color: #111; font-size: 10px; font-weight: 800; display: flex; align-items: center; justify-content: center; }
@keyframes o6Pulo { 30% { transform: scale(1.25) rotate(-12deg) } 60% { transform: scale(.95) rotate(8deg) } }
.o6-sino-lista { display: grid; gap: 5px; max-height: 220px; overflow-y: auto; }
@media (max-width: 640px) {
  .o6-ilha.exp, .o6-ilha.lista { width: calc(100vw - 16px); }
  .o6-ajustes { left: 12px; right: 12px; bottom: 12px; width: auto; } .o4-ilha.exp, .o4-ilha.lista { min-width: calc(100vw - 32px); } .o1-wrap, .o5-wrap { right: 12px; } }
`
