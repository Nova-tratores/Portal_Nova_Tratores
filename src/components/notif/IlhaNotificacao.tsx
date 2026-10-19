'use client'
// Aviso de notificação em "ilha" (José, 19/10/2026 — escolhido na página de teste
// /meu-painel/notificacoes-teste, opção 6). Substitui os avisos laterais:
//  - aparece SÓ quando chega notificação, com as cores do tema do usuário;
//  - cada usuário arrasta para onde quiser (posição guardada no navegador);
//  - modo "some" (padrão): o aviso passa, some e fica só no sino;
//    modo "fica": depois do aviso fica uma pílula com o nº de não lidas (clique abre o sino).
// Os ajustes moram no cabeçalho do sino (<AjustesIlha />).
import { useEffect, useRef, useState } from 'react'
import { Bell, GripVertical, X, RotateCcw } from 'lucide-react'

export type ModoIlha = 'some' | 'fica'
interface PosIlha { x: number; y: number } // centro da ilha em fração da tela (0–1)
interface CfgIlha { modo: ModoIlha; pos: PosIlha }

export interface AvisoIlha {
  id: string
  titulo: string
  texto: string
  icone: React.ReactNode
  /** cor do módulo (rótulo e ícone) */
  cor?: string
  modulo?: string
  urgente?: boolean
}

const CHAVE = 'portal-ilha-notif'
const EVENTO = 'portal-ilha-notif-cfg'
const POS_PADRAO: PosIlha = { x: 0.5, y: 0.13 }
const LARG = 440
export const POSICOES_ILHA: { id: string; nome: string; pos: PosIlha }[] = [
  { id: 'te', nome: 'Topo esq.', pos: { x: 0.16, y: 0.13 } },
  { id: 'tc', nome: 'Topo meio', pos: POS_PADRAO },
  { id: 'td', nome: 'Topo dir.', pos: { x: 0.84, y: 0.13 } },
  { id: 'be', nome: 'Baixo esq.', pos: { x: 0.16, y: 0.92 } },
  { id: 'bc', nome: 'Baixo meio', pos: { x: 0.5, y: 0.92 } },
  { id: 'bd', nome: 'Baixo dir.', pos: { x: 0.84, y: 0.92 } },
]

function lerCfg(): CfgIlha {
  try {
    const c = JSON.parse(localStorage.getItem(CHAVE) || '{}') as Partial<CfgIlha>
    return { modo: c.modo === 'fica' ? 'fica' : 'some', pos: c.pos && typeof c.pos.x === 'number' && typeof c.pos.y === 'number' ? c.pos : POS_PADRAO }
  } catch { return { modo: 'some', pos: POS_PADRAO } }
}
function gravarCfg(c: CfgIlha) {
  try { localStorage.setItem(CHAVE, JSON.stringify(c)) } catch { /* sem storage */ }
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: c }))
}

/** Ajustes da ilha (compartilhados entre a ilha e o cabeçalho do sino). */
export function useCfgIlha(): [CfgIlha, (c: Partial<CfgIlha>) => void] {
  const [cfg, setCfg] = useState<CfgIlha>({ modo: 'some', pos: POS_PADRAO })
  useEffect(() => {
    void Promise.resolve().then(() => setCfg(lerCfg()))
    const ouvir = (e: Event) => setCfg((e as CustomEvent<CfgIlha>).detail)
    window.addEventListener(EVENTO, ouvir)
    return () => window.removeEventListener(EVENTO, ouvir)
  }, [])
  const mudar = (p: Partial<CfgIlha>) => { const novo = { ...lerCfg(), ...p }; setCfg(novo); gravarCfg(novo) }
  return [cfg, mudar]
}

export default function IlhaNotificacao({ avisos, naoLidas, onAbrir, onFechar, onAbrirSino, onFoiProSino }: {
  avisos: AvisoIlha[]
  /** não lidas do sino (pílula do modo "fica") */
  naoLidas: number
  onAbrir: (id: string) => void
  onFechar: (id: string) => void
  onAbrirSino: () => void
  /** o aviso sumiu da tela (o sino pode dar um pulinho) */
  onFoiProSino?: () => void
}) {
  const [cfg, mudar] = useCfgIlha()
  const [arrastando, setArrastando] = useState(false)
  const [pos, setPos] = useState<PosIlha | null>(null) // durante o arraste
  const [tela, setTela] = useState({ w: 1280, h: 800 })

  useEffect(() => {
    const medir = () => setTela({ w: window.innerWidth, h: window.innerHeight })
    void Promise.resolve().then(medir)
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [])

  // aviso saiu da tela → sino
  const tinha = useRef(false)
  useEffect(() => {
    const tem = avisos.length > 0
    if (tinha.current && !tem) onFoiProSino?.()
    tinha.current = tem
  }, [avisos.length, onFoiProSino])

  // arrastar pela alça
  useEffect(() => {
    if (!arrastando) return
    const mover = (e: PointerEvent) => setPos({ x: Math.min(1, Math.max(0, e.clientX / window.innerWidth)), y: Math.min(1, Math.max(0, e.clientY / window.innerHeight)) })
    const soltar = (e: PointerEvent) => {
      setArrastando(false)
      mudar({ pos: { x: Math.min(1, Math.max(0, e.clientX / window.innerWidth)), y: Math.min(1, Math.max(0, e.clientY / window.innerHeight)) } })
      setPos(null)
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
    return () => { window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', soltar) }
  }, [arrastando]) // eslint-disable-line react-hooks/exhaustive-deps

  const atual = avisos[0]
  const mostra = !!atual
  const pilula = cfg.modo === 'fica' && !mostra
  const visivel = mostra || pilula || arrastando
  if (!visivel) return null

  const p = pos || cfg.pos
  const metade = Math.min(LARG, tela.w - 16) / 2 + 8
  const left = Math.min(tela.w - metade, Math.max(metade, p.x * tela.w))
  const embaixo = p.y > 0.55
  const ancora: React.CSSProperties = embaixo
    ? { left, bottom: Math.max(8, (1 - p.y) * tela.h - 22) }
    : { left, top: Math.max(76, p.y * tela.h - 22) }
  const urgente = !!atual?.urgente

  return (
    <div className={`ilha-notif print-hidden ${mostra ? 'exp' : ''} ${urgente ? 'urg' : ''} ${arrastando ? 'arrastando' : ''}`} style={ancora} role="status" aria-live="polite">
      <style>{CSS_ILHA}</style>
      <button className="ilha-alca" title="Arraste para colocar onde quiser" onPointerDown={(e) => { e.preventDefault(); setArrastando(true) }}><GripVertical size={15} /></button>
      {mostra && atual ? (
        <div className="ilha-aviso" key={atual.id} onClick={() => onAbrir(atual.id)}>
          <span className="ilha-ico" style={{ color: atual.cor || 'var(--portal-text-secondary)', background: `color-mix(in srgb, ${atual.cor || '#64748b'} 13%, transparent)` }}>{atual.icone}</span>
          <div className="ilha-txt">
            {(atual.modulo || urgente) && <div className="ilha-mod" style={{ color: urgente ? '#dc2626' : atual.cor }}>{[atual.modulo, urgente ? 'pede sua ação' : ''].filter(Boolean).join(' · ')}</div>}
            <div className="ilha-tit"><span className="ilha-tit-txt">{atual.titulo}</span>{avisos.length > 1 && <span className="ilha-mais">+{avisos.length - 1}</span>}</div>
            {atual.texto && <div className="ilha-desc">{atual.texto}</div>}
          </div>
          <button className="ilha-x" title="Fechar (continua no sino)" onClick={(e) => { e.stopPropagation(); onFechar(atual.id) }}><X size={13} /></button>
          <div className="ilha-tempo" key={`t${atual.id}`} />
        </div>
      ) : (
        <button className="ilha-mini" onClick={onAbrirSino} title="Abrir as notificações">
          <Bell size={14} /> {naoLidas > 0 ? `${naoLidas > 99 ? '99+' : naoLidas} não lida${naoLidas > 1 ? 's' : ''}` : 'Tudo em dia'}
        </button>
      )}
    </div>
  )
}

/** Ajustes no cabeçalho do sino: modo e posição da ilha. */
export function AjustesIlha() {
  const [cfg, mudar] = useCfgIlha()
  const atual = POSICOES_ILHA.find((p) => Math.abs(p.pos.x - cfg.pos.x) < 0.01 && Math.abs(p.pos.y - cfg.pos.y) < 0.01)?.id
  return (
    <div className="ilha-ajustes">
      <style>{CSS_ILHA}</style>
      <div className="ilha-aj-lin">
        <span className="ilha-aj-rot">Aviso na tela</span>
        <div className="ilha-seg">
          <button className={cfg.modo === 'some' ? 'on' : ''} onClick={() => mudar({ modo: 'some' })} title="O aviso aparece, some e fica só aqui no sino">Aparece e some</button>
          <button className={cfg.modo === 'fica' ? 'on' : ''} onClick={() => mudar({ modo: 'fica' })} title="Depois do aviso fica uma pílula com o número de não lidas">Fica na tela</button>
        </div>
      </div>
      <div className="ilha-aj-lin">
        <span className="ilha-aj-rot">Onde aparece</span>
        <div className="ilha-grade">
          {POSICOES_ILHA.map((p) => <button key={p.id} className={atual === p.id ? 'on' : ''} onClick={() => mudar({ pos: p.pos })}>{p.nome}</button>)}
        </div>
      </div>
      <div className="ilha-aj-ajuda">
        Ou arraste o aviso pela alça <GripVertical size={11} /> para qualquer lugar.
        {!atual && <button className="ilha-reset" onClick={() => mudar({ pos: POS_PADRAO })}><RotateCcw size={11} /> padrão</button>}
      </div>
    </div>
  )
}

const CSS_ILHA = `
.ilha-notif { position: fixed; z-index: 10050; transform: translateX(-50%); display: flex; align-items: stretch; gap: 2px; background: var(--portal-bg-card); color: var(--portal-text); border: 1px solid var(--portal-border); border-radius: 999px; padding: 6px 12px 6px 4px; max-width: calc(100vw - 16px); box-shadow: 0 12px 34px rgba(15,23,42,.18); overflow: hidden; animation: ilhaEntra .45s cubic-bezier(.34,1.4,.5,1); transition: border-radius .4s, padding .4s, width .4s; }
.ilha-notif.exp { border-radius: 20px; padding: 10px 10px 10px 4px; width: 440px; }
.ilha-notif.urg { border-color: #ef4444; box-shadow: 0 0 0 2px color-mix(in srgb, #ef4444 40%, transparent), 0 12px 34px rgba(220,38,38,.22); }
.ilha-notif.arrastando { transition: none; cursor: grabbing; box-shadow: 0 18px 44px rgba(15,23,42,.3); }
@keyframes ilhaEntra { from { opacity: 0; transform: translateX(-50%) translateY(-10px) scale(.7) } }
.ilha-alca { flex: none; display: flex; align-items: center; border: none; background: transparent; color: var(--portal-text-muted); cursor: grab; padding: 0 2px; border-radius: 8px; touch-action: none; }
.ilha-alca:hover { color: var(--portal-text); background: var(--portal-bg-secondary); }
.ilha-aviso { flex: 1; min-width: 0; display: flex; align-items: center; gap: 11px; cursor: pointer; animation: ilhaFade .35s ease .12s both; }
@keyframes ilhaFade { from { opacity: 0; transform: translateY(-5px) } }
.ilha-ico { flex: none; width: 38px; height: 38px; border-radius: 12px; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.ilha-ico img { width: 100%; height: 100%; object-fit: cover; }
.ilha-txt { flex: 1; min-width: 0; }
.ilha-mod { font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .4px; }
.ilha-tit { font-size: 14px; font-weight: 800; display: flex; align-items: center; gap: 6px; min-width: 0; }
.ilha-tit-txt { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ilha-mais { flex: none; font-size: 10.5px; font-weight: 800; padding: 1px 6px; border-radius: 999px; background: var(--portal-bg-secondary); color: var(--portal-text-secondary); }
.ilha-desc { font-size: 12.5px; color: var(--portal-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ilha-x { flex: none; align-self: flex-start; border: none; background: transparent; color: var(--portal-text-muted); cursor: pointer; padding: 5px; border-radius: 7px; display: flex; }
.ilha-x:hover { background: var(--portal-bg-secondary); color: var(--portal-text); }
.ilha-tempo { position: absolute; left: 0; bottom: 0; height: 3px; background: #3b82f6; animation: ilhaTempo 6s linear forwards; }
.ilha-notif.urg .ilha-tempo { background: #ef4444; }
@keyframes ilhaTempo { from { width: 100% } to { width: 0 } }
.ilha-mini { display: flex; align-items: center; gap: 7px; border: none; background: transparent; color: var(--portal-text); font: 700 12.5px inherit; white-space: nowrap; cursor: pointer; padding: 2px 4px; }
.ilha-ajustes { display: grid; gap: 8px; padding: 10px 16px 12px; border-bottom: 1px solid var(--portal-border); background: var(--portal-bg-card); }
.ilha-aj-lin { display: flex; align-items: center; gap: 10px; }
.ilha-aj-rot { flex: none; width: 88px; font-size: 11px; font-weight: 700; color: var(--portal-text-secondary); }
.ilha-seg { flex: 1; display: flex; padding: 3px; gap: 3px; border-radius: 9px; background: var(--portal-bg-secondary); }
.ilha-seg button { flex: 1; padding: 5px 6px; border: none; border-radius: 7px; background: transparent; color: var(--portal-text-secondary); font: 700 11.5px inherit; cursor: pointer; white-space: nowrap; }
.ilha-seg button.on { background: var(--portal-bg-card); color: var(--portal-text); box-shadow: 0 1px 3px rgba(0,0,0,.12); }
.ilha-grade { flex: 1; display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
.ilha-grade button { padding: 4px 2px; border-radius: 7px; border: 1px solid var(--portal-border); background: transparent; color: var(--portal-text-secondary); font: 600 10.5px inherit; cursor: pointer; white-space: nowrap; }
.ilha-grade button.on { border-color: #3b82f6; color: #3b82f6; }
.ilha-aj-ajuda { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; font-size: 11px; color: var(--portal-text-muted); }
.ilha-reset { display: inline-flex; align-items: center; gap: 3px; margin-left: auto; border: none; background: transparent; color: var(--portal-text-secondary); font: 700 11px inherit; cursor: pointer; }
.sino-pulo { animation: sinoPulo .55s cubic-bezier(.34,1.8,.5,1); }
@keyframes sinoPulo { 30% { transform: scale(1.22) rotate(-12deg) } 60% { transform: scale(.95) rotate(8deg) } }
@media (max-width: 640px) { .ilha-notif.exp { width: calc(100vw - 16px); } .ilha-aj-rot { width: 70px; } }
`
