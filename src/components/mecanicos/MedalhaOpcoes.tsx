'use client'
// Ícones das ligas como medalha metálica com motivo de trator (José, 19/10/2026: "eu quero o ícone assim
// [selo metálico], mas faz algo relativo a tratores, pra gente ver"). Opções na página de teste.
import { useId } from 'react'

export type EstiloMedalha = 'engrenagem' | 'pneu' | 'selo'
type Metal = { nome: string; a: string; b: string; c: string; texto: string; borda: string }
export const METAIS: Metal[] = [
  { nome: 'FERRO', a: '#e5e7eb', b: '#6b7280', c: '#9ca3af', texto: '#374151', borda: '#4b5563' },
  { nome: 'BRONZE', a: '#f6d2ad', b: '#9a5b2b', c: '#d39462', texto: '#5b3415', borda: '#7c4a22' },
  { nome: 'PRATA', a: '#fbfdff', b: '#8f9bab', c: '#cbd5e1', texto: '#3f4a5a', borda: '#6b7787' },
  { nome: 'OURO', a: '#fff1b8', b: '#b7860b', c: '#e9be3c', texto: '#6b4a00', borda: '#8f6a05' },
  { nome: 'DIAMANTE', a: '#e0fbff', b: '#3b82c4', c: '#8be3f2', texto: '#0c4a6e', borda: '#2563a8' },
]
const ROMANO = ['', 'I', 'II', 'III', 'IV', 'V']

/** Silhueta de trator (rodado grande atrás, cabine, capô, escapamento, roda dianteira). */
function Trator({ cor }: { cor: string }) {
  return (
    <g fill={cor}>
      <rect x="-13" y="-17" width="15" height="15" rx="2" />
      <rect x="-10" y="-14.5" width="9" height="7" rx="1" fill="rgba(255,255,255,.35)" />
      <rect x="0" y="-8" width="17" height="8" rx="2" />
      <rect x="12" y="-14" width="2.4" height="7" rx="1" />
      <circle cx="-8" cy="4" r="10" /><circle cx="-8" cy="4" r="4.5" fill="rgba(255,255,255,.35)" />
      <circle cx="12" cy="6.5" r="6" /><circle cx="12" cy="6.5" r="2.5" fill="rgba(255,255,255,.35)" />
    </g>
  )
}

/** Uma medalha. liga = 0 Ferro … 4 Diamante; sub = 1…5 (ou null no Diamante). */
export function Medalha({ liga, sub, estilo, tamanho = 120 }: { liga: number; sub: number | null; estilo: EstiloMedalha; tamanho?: number }) {
  const m = METAIS[Math.max(0, Math.min(4, liga))]
  const id = useId().replace(/:/g, '')
  const g = `g${id}`, g2 = `h${id}`, arco = `a${id}`, arco2 = `b${id}`
  // borda: engrenagem (dentes retos), pneu (garras em V) ou selo (ondas)
  const borda = (() => {
    if (estilo === 'engrenagem') {
      const d: string[] = []; const n = 20
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, a1 = a0 + (Math.PI * 2) / n * 0.5
        const p = (r: number, a: number) => `${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`
        d.push(`${i ? 'L' : 'M'}${p(50, a0)} L${p(57, a0 + 0.04)} L${p(57, a1 - 0.04)} L${p(50, a1)}`)
      }
      return <path d={`${d.join(' ')} Z`} fill={`url(#${g})`} stroke={m.borda} strokeWidth="1.2" />
    }
    if (estilo === 'pneu') {
      const garras = Array.from({ length: 22 }, (_, i) => {
        const a = (i / 22) * 360
        return <path key={i} d="M-3.2,-58 L3.2,-58 L5,-50 L-1,-50 Z" transform={`rotate(${a}) ${i % 2 ? 'scale(-1,1)' : ''}`} fill={m.borda} />
      })
      return <g><circle r="52" fill="#1f2937" /><circle r="51" fill="none" stroke="#111827" strokeWidth="2" />{garras}<circle r="46" fill={`url(#${g})`} stroke={m.borda} strokeWidth="1.2" /></g>
    }
    const pts: string[] = []; const n = 28
    for (let i = 0; i <= n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2, r = i % 2 ? 52 : 57; pts.push(`${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`) }
    return <polygon points={pts.join(' ')} fill={`url(#${g})`} stroke={m.borda} strokeWidth="1.2" strokeLinejoin="round" />
  })()
  const rInt = estilo === 'pneu' ? 40 : 44
  return (
    <svg viewBox="-60 -60 120 120" width={tamanho} height={tamanho} className="md" role="img" aria-label={`${m.nome}${sub ? ` ${ROMANO[sub]}` : ''}`}>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={m.a} /><stop offset=".45" stopColor={m.c} /><stop offset=".55" stopColor={m.b} /><stop offset="1" stopColor={m.a} /></linearGradient>
        <radialGradient id={g2} cx=".35" cy=".3" r=".9"><stop offset="0" stopColor={m.a} /><stop offset=".7" stopColor={m.c} /><stop offset="1" stopColor={m.b} /></radialGradient>
        <path id={arco} d={`M ${-rInt + 7},0 A ${rInt - 7},${rInt - 7} 0 0 1 ${rInt - 7},0`} />
        <path id={arco2} d={`M ${-rInt + 3},0 A ${rInt - 3},${rInt - 3} 0 0 0 ${rInt - 3},0`} />
      </defs>
      <g className={estilo === 'engrenagem' ? 'md-gira' : ''}>{borda}</g>
      <circle r={rInt} fill={`url(#${g2})`} stroke={m.borda} strokeWidth="1" />
      <circle r={rInt - 12} fill="none" stroke={m.borda} strokeOpacity=".45" strokeWidth="1" />
      {estilo !== 'selo' && <text fontSize="8.5" fontWeight="900" letterSpacing="1.5" fill={m.texto}><textPath href={`#${arco}`} startOffset="50%" textAnchor="middle">{m.nome}</textPath></text>}
      {estilo !== 'selo' && [-1, 1].map((s) => <text key={s} x={s * (rInt - 6)} y="3" fontSize="7" textAnchor="middle" fill={m.texto}>★</text>)}
      <g transform="translate(0,-2) scale(.95)"><Trator cor={m.texto} /></g>
      {sub != null
        ? <text y={rInt - 14} fontSize="11" fontWeight="900" textAnchor="middle" fill={m.texto}>{ROMANO[sub]}</text>
        : <text y={rInt - 14} fontSize="10" textAnchor="middle" fill={m.texto}>◆</text>}
      {estilo === 'selo' && (
        <g>
          <path d="M-46,18 L46,18 L42,26 L46,34 L-46,34 L-42,26 Z" fill={m.borda} />
          <path d="M-40,16 L40,16 L40,32 L-40,32 Z" fill={`url(#${g})`} stroke={m.borda} strokeWidth=".8" />
          <text y="27.5" fontSize="9" fontWeight="900" letterSpacing="1.2" textAnchor="middle" fill={m.texto}>{m.nome}</text>
        </g>
      )}
      <circle r="58" className="md-brilho" fill="url(#none)" />
    </svg>
  )
}

// ============================================================================
// 2ª leva de estilos (José 19/10: "faz outros estilos")
export type EstiloMedalha2 = 'escudo' | 'porca' | 'roda' | 'placa' | 'louros'

export function Medalha2({ liga, sub, estilo, tamanho = 120 }: { liga: number; sub: number | null; estilo: EstiloMedalha2; tamanho?: number }) {
  const m = METAIS[Math.max(0, Math.min(4, liga))]
  const id = useId().replace(/:/g, '')
  const g = `g${id}`, g2 = `h${id}`, arco = `a${id}`
  const nivel = sub != null ? ROMANO[sub] : '◆'
  const defs = (
    <defs>
      <linearGradient id={g} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={m.a} /><stop offset=".45" stopColor={m.c} /><stop offset=".55" stopColor={m.b} /><stop offset="1" stopColor={m.a} /></linearGradient>
      <radialGradient id={g2} cx=".35" cy=".3" r=".9"><stop offset="0" stopColor={m.a} /><stop offset=".7" stopColor={m.c} /><stop offset="1" stopColor={m.b} /></radialGradient>
      <path id={arco} d="M -33,0 A 33,33 0 0 1 33,0" />
    </defs>
  )
  let corpo: React.ReactNode
  if (estilo === 'escudo') {
    corpo = <>
      <path d="M0,-57 L47,-43 L47,4 C47,31 24,49 0,58 C-24,49 -47,31 -47,4 L-47,-43 Z" fill={`url(#${g})`} stroke={m.borda} strokeWidth="1.6" />
      <path d="M0,-48 L39,-37 L39,3 C39,25 20,40 0,48 C-20,40 -39,25 -39,3 L-39,-37 Z" fill={`url(#${g2})`} stroke={m.borda} strokeOpacity=".5" />
      <text y="-27" fontSize="11" fontWeight="900" textAnchor="middle" fill={m.texto}>{nivel}</text>
      <g transform="translate(0,-2) scale(.95)"><Trator cor={m.texto} /></g>
      <path d="M-44,20 L44,20 L40,28 L44,36 L-44,36 L-40,28 Z" fill={m.borda} />
      <rect x="-38" y="18" width="76" height="16" rx="2" fill={`url(#${g})`} stroke={m.borda} strokeWidth=".8" />
      <text y="29.5" fontSize="8.5" fontWeight="900" letterSpacing="1.2" textAnchor="middle" fill={m.texto}>{m.nome}</text>
    </>
  } else if (estilo === 'porca') {
    const hex = Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 3) * i + Math.PI / 6; return `${(Math.cos(a) * 57).toFixed(2)},${(Math.sin(a) * 57).toFixed(2)}` }).join(' ')
    const hex2 = Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 3) * i + Math.PI / 6; return `${(Math.cos(a) * 50).toFixed(2)},${(Math.sin(a) * 50).toFixed(2)}` }).join(' ')
    corpo = <>
      <polygon points={hex} fill={`url(#${g})`} stroke={m.borda} strokeWidth="1.6" strokeLinejoin="round" />
      <polygon points={hex2} fill="none" stroke={m.borda} strokeOpacity=".45" />
      <circle r="41" fill={`url(#${g2})`} stroke={m.borda} strokeWidth="1.2" />
      <text fontSize="8" fontWeight="900" letterSpacing="1.4" fill={m.texto}><textPath href={`#${arco}`} startOffset="50%" textAnchor="middle">{m.nome}</textPath></text>
      <g transform="translate(0,-1) scale(.9)"><Trator cor={m.texto} /></g>
      <text y="31" fontSize="11" fontWeight="900" textAnchor="middle" fill={m.texto}>{nivel}</text>
    </>
  } else if (estilo === 'roda') {
    corpo = <>
      <circle r="57" fill="#1f2937" />
      <circle r="51" fill={`url(#${g})`} stroke={m.borda} strokeWidth="1.4" />
      <circle r="44" fill="none" stroke={m.borda} strokeOpacity=".5" strokeWidth="2" />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (Math.PI / 4) * i
        const hx = Array.from({ length: 6 }, (_, k) => { const b = (Math.PI / 3) * k; return `${(Math.cos(a) * 47.5 + Math.cos(b) * 3).toFixed(2)},${(Math.sin(a) * 47.5 + Math.sin(b) * 3).toFixed(2)}` }).join(' ')
        return <polygon key={i} points={hx} fill={m.b} stroke={m.borda} strokeWidth=".6" />
      })}
      <circle r="38" fill={`url(#${g2})`} stroke={m.borda} strokeWidth="1" />
      <text fontSize="7.5" fontWeight="900" letterSpacing="1.3" fill={m.texto}><textPath href={`#${arco}`} startOffset="50%" textAnchor="middle">{m.nome}</textPath></text>
      <g transform="translate(0,-1) scale(.85)"><Trator cor={m.texto} /></g>
      <text y="29" fontSize="10.5" fontWeight="900" textAnchor="middle" fill={m.texto}>{nivel}</text>
    </>
  } else if (estilo === 'placa') {
    corpo = <>
      <rect x="-57" y="-38" width="114" height="76" rx="12" fill={`url(#${g})`} stroke={m.borda} strokeWidth="1.6" />
      <rect x="-50" y="-31" width="100" height="62" rx="8" fill={`url(#${g2})`} stroke={m.borda} strokeOpacity=".5" />
      {[[-50, -31], [50, -31], [-50, 31], [50, 31]].map(([x, y], i) => <g key={i}><circle cx={x} cy={y} r="3.4" fill={m.b} stroke={m.borda} strokeWidth=".7" /><circle cx={x - 1} cy={y - 1} r="1" fill="rgba(255,255,255,.7)" /></g>)}
      <g transform="translate(-24,2) scale(.9)"><Trator cor={m.texto} /></g>
      <text x="22" y="-4" fontSize={m.nome.length > 6 ? 7.5 : 10} fontWeight="900" letterSpacing=".6" textAnchor="middle" fill={m.texto}>{m.nome}</text>
      <text x="22" y="17" fontSize="18" fontWeight="900" textAnchor="middle" fill={m.texto}>{nivel}</text>
    </>
  } else {
    // louros: a medalha no meio, ramos de trigo dos dois lados e as fitas embaixo
    // ramos nos dois lados, de cima (140°) até embaixo (245°), com a folha seguindo a curva
    const ramo = (lado: 1 | -1) => Array.from({ length: 7 }, (_, i) => {
      const grau = 135 + i * 18, a = (Math.PI / 180) * grau
      const x = Math.cos(a) * 49 * lado * -1 * -1 * (lado === 1 ? -1 : 1) * -1, y = -Math.sin(a) * 49
      const giro = lado === 1 ? 90 - grau : grau - 90
      return <ellipse key={i} cx={lado === 1 ? -Math.abs(x) : Math.abs(x)} cy={y} rx="3.6" ry="8" transform={`rotate(${giro} ${lado === 1 ? -Math.abs(x) : Math.abs(x)} ${y})`} fill={m.b} stroke={m.borda} strokeWidth=".5" />
    })
    corpo = <>
      <path d="M-14,30 L-26,58 L-18,52 L-12,59 L-4,34 Z" fill={m.borda} /><path d="M14,30 L26,58 L18,52 L12,59 L4,34 Z" fill={m.borda} />
      <g>{ramo(1)}{ramo(-1)}</g>
      <circle r="40" fill={`url(#${g})`} stroke={m.borda} strokeWidth="1.6" />
      <circle r="34" fill={`url(#${g2})`} stroke={m.borda} strokeOpacity=".5" />
      <text y="-19" fontSize="7.5" fontWeight="900" letterSpacing="1.2" textAnchor="middle" fill={m.texto}>{m.nome}</text>
      <g transform="translate(0,1) scale(.8)"><Trator cor={m.texto} /></g>
      <text y="27" fontSize="10" fontWeight="900" textAnchor="middle" fill={m.texto}>{nivel}</text>
    </>
  }
  return (
    <svg viewBox="-60 -60 120 120" width={tamanho} height={tamanho} className="md" role="img" aria-label={`${m.nome}${sub ? ` ${ROMANO[sub]}` : ''}`}>
      {defs}
      {corpo}
    </svg>
  )
}

// ============================================================================
// 3ª leva: mais realista (José 19/10: "tem algo mais realista") — metal escovado (textura), bisel com luz
// (feSpecularLighting), trator e letras em alto-relevo, brilho e sombra.
export type EstiloMedalha3 = 'real-selo' | 'real-engrenagem' | 'real-escudo'

/** Trator detalhado (pneu com garras, cabine com janela, capô com grade, escapamento, para-lama). */
function TratorDetalhado({ cor, luz }: { cor: string; luz: string }) {
  const garras = Array.from({ length: 14 }, (_, i) => <rect key={i} x="-1.6" y="-14.4" width="3.2" height="3.4" rx=".6" transform={`translate(-9,6) rotate(${i * (360 / 14)})`} fill={cor} />)
  const garrasF = Array.from({ length: 10 }, (_, i) => <rect key={i} x="-1.1" y="-8.6" width="2.2" height="2.2" rx=".4" transform={`translate(14,9.5) rotate(${i * 36})`} fill={cor} />)
  return (
    <g>
      {/* escapamento */}
      <rect x="10.5" y="-21" width="2.6" height="10" rx="1" fill={cor} /><rect x="10" y="-22.5" width="3.6" height="2" rx=".8" fill={cor} />
      {/* cabine */}
      <path d="M-17,-2 L-17,-22 Q-17,-24 -15,-24 L1,-24 Q3,-24 3,-22 L3,-2 Z" fill={cor} />
      <path d="M-14,-9 L-14,-21 L0,-21 L0,-9 Z" fill={luz} opacity=".55" />
      <path d="M-7.5,-21 L-7.5,-9" stroke={cor} strokeWidth="1.2" />
      {/* capô com grade */}
      <path d="M2,-11 L21,-9 Q23,-8.7 23,-6.5 L23,2 L2,2 Z" fill={cor} />
      {[7, 11, 15, 19].map((x) => <rect key={x} x={x} y="-7.5" width="1.2" height="7" rx=".5" fill={luz} opacity=".45" />)}
      {/* chassi */}
      <rect x="-12" y="0" width="30" height="5" rx="1.5" fill={cor} />
      {/* para-lama traseiro */}
      <path d="M-24,2 A15,15 0 0 1 6,2 L3,2 A12,12 0 0 0 -21,2 Z" fill={cor} />
      {/* roda traseira */}
      {garras}
      <circle cx="-9" cy="6" r="11.6" fill={cor} />
      <circle cx="-9" cy="6" r="7.2" fill={luz} opacity=".5" />
      <circle cx="-9" cy="6" r="3.4" fill={cor} />
      {Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 3) * i; return <circle key={i} cx={-9 + Math.cos(a) * 5.3} cy={6 + Math.sin(a) * 5.3} r=".9" fill={cor} /> })}
      {/* roda dianteira */}
      {garrasF}
      <circle cx="14" cy="9.5" r="6.8" fill={cor} />
      <circle cx="14" cy="9.5" r="3.8" fill={luz} opacity=".5" />
      <circle cx="14" cy="9.5" r="1.6" fill={cor} />
    </g>
  )
}

export function Medalha3({ liga, sub, estilo, tamanho = 140 }: { liga: number; sub: number | null; estilo: EstiloMedalha3; tamanho?: number }) {
  const m = METAIS[Math.max(0, Math.min(4, liga))]
  const id = useId().replace(/:/g, '')
  const k = (s: string) => `${s}${id}`
  const nivel = sub != null ? ROMANO[sub] : '◆'
  // forma externa por estilo
  const externa = (() => {
    if (estilo === 'real-engrenagem') {
      const d: string[] = []; const n = 22
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, a1 = a0 + (Math.PI * 2) / n * 0.48
        const p = (r: number, a: number) => `${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`
        d.push(`${i ? 'L' : 'M'}${p(51, a0)} L${p(58, a0 + 0.035)} L${p(58, a1 - 0.035)} L${p(51, a1)}`)
      }
      return `${d.join(' ')} Z`
    }
    if (estilo === 'real-escudo') return 'M0,-58 L49,-43 L49,5 C49,33 25,50 0,59 C-25,50 -49,33 -49,5 L-49,-43 Z'
    const pts: string[] = []; const n = 32
    for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2, r = i % 2 ? 53 : 58.5; pts.push(`${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`) }
    return `M${pts.join(' L')} Z`
  })()
  const interna = estilo === 'real-escudo' ? 'M0,-49 L40,-37 L40,4 C40,27 20,41 0,49 C-20,41 -40,27 -40,4 L-40,-37 Z' : null
  const rMiolo = 43
  return (
    <svg viewBox="-64 -64 128 128" width={tamanho} height={tamanho} className="md md-real" role="img" aria-label={`${m.nome}${sub ? ` ${ROMANO[sub]}` : ''}`}>
      <defs>
        {/* metal: faixas de reflexo como num metal polido */}
        <linearGradient id={k('m')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={m.a} /><stop offset=".22" stopColor={m.c} /><stop offset=".38" stopColor={m.a} />
          <stop offset=".55" stopColor={m.b} /><stop offset=".72" stopColor={m.c} /><stop offset=".86" stopColor={m.a} /><stop offset="1" stopColor={m.b} />
        </linearGradient>
        <radialGradient id={k('r')} cx=".38" cy=".3" r=".85"><stop offset="0" stopColor={m.a} /><stop offset=".55" stopColor={m.c} /><stop offset="1" stopColor={m.b} /></radialGradient>
        <linearGradient id={k('aro')} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={m.b} /><stop offset=".5" stopColor={m.a} /><stop offset="1" stopColor={m.b} /></linearGradient>
        {/* bisel: luz especular vinda de cima à esquerda */}
        <filter id={k('bis')} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="1.6" result="b" />
          <feSpecularLighting in="b" surfaceScale="3.2" specularConstant=".85" specularExponent="18" lightingColor="#ffffff" result="s"><fePointLight x="-70" y="-90" z="110" /></feSpecularLighting>
          <feComposite in="s" in2="SourceAlpha" operator="in" result="si" />
          <feComposite in="SourceGraphic" in2="si" operator="arithmetic" k1="0" k2="1" k3=".9" k4="0" />
        </filter>
        {/* metal escovado: textura fina de riscos */}
        <filter id={k('esc')} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency=".9 .015" numOctaves="2" seed={liga + 3} result="t" />
          <feColorMatrix in="t" type="matrix" values="0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 .5  0 0 0 .22 0" result="tm" />
          <feComposite in="tm" in2="SourceAlpha" operator="in" result="ti" />
          <feBlend in="SourceGraphic" in2="ti" mode="overlay" />
        </filter>
        {/* alto-relevo do trator e das letras */}
        <filter id={k('rel')} x="-20%" y="-20%" width="140%" height="140%">
          <feOffset in="SourceAlpha" dx=".8" dy="1" result="o" /><feFlood floodColor="#ffffff" floodOpacity=".55" /><feComposite in2="o" operator="in" result="claro" />
          <feOffset in="SourceAlpha" dx="-.6" dy="-.7" result="o2" /><feFlood floodColor="#000000" floodOpacity=".45" /><feComposite in2="o2" operator="in" result="escuro" />
          <feMerge><feMergeNode in="claro" /><feMergeNode in="escuro" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id={k('somb')} x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#0f172a" floodOpacity=".35" /></filter>
        <path id={k('arco')} d={`M ${-rMiolo + 8},0 A ${rMiolo - 8},${rMiolo - 8} 0 0 1 ${rMiolo - 8},0`} />
        <clipPath id={k('clip')}><path d={externa} /></clipPath>
      </defs>
      <g filter={`url(#${k('somb')})`}>
        {/* forma de fora com metal escovado + bisel */}
        <g filter={`url(#${k('bis')})`}><path d={externa} fill={`url(#${k('m')})`} stroke={m.borda} strokeWidth="1.2" strokeLinejoin="round" filter={`url(#${k('esc')})`} /></g>
        {/* aro */}
        {interna
          ? <g filter={`url(#${k('bis')})`}><path d={interna} fill={`url(#${k('r')})`} stroke={`url(#${k('aro')})`} strokeWidth="3" /></g>
          : <g filter={`url(#${k('bis')})`}><circle r={rMiolo + 3} fill={`url(#${k('aro')})`} /><circle r={rMiolo} fill={`url(#${k('r')})`} stroke={m.borda} strokeOpacity=".6" strokeWidth=".8" /></g>}
        {!interna && <circle r={rMiolo - 14} fill="none" stroke={m.borda} strokeOpacity=".35" strokeWidth=".8" />}
        {/* letras e trator em relevo */}
        <g filter={`url(#${k('rel')})`}>
          {interna
            ? <text y="-29" fontSize="9" fontWeight="900" letterSpacing="1.6" textAnchor="middle" fill={m.texto}>{m.nome}</text>
            : <text fontSize="8.5" fontWeight="900" letterSpacing="1.8" fill={m.texto}><textPath href={`#${k('arco')}`} startOffset="50%" textAnchor="middle">{m.nome}</textPath></text>}
          {!interna && [-1, 1].map((s) => <text key={s} x={s * (rMiolo - 7)} y="3.5" fontSize="7.5" textAnchor="middle" fill={m.texto}>★</text>)}
          <g transform="translate(0,-1) scale(.92)"><TratorDetalhado cor={m.texto} luz={m.a} /></g>
          <text y={interna ? 33 : rMiolo - 11} fontSize="11" fontWeight="900" textAnchor="middle" fill={m.texto}>{nivel}</text>
        </g>
        {/* brilho de vidro por cima */}
        <g clipPath={`url(#${k('clip')})`}><ellipse cx="-16" cy="-30" rx="46" ry="20" transform="rotate(-25 -16 -30)" fill="#ffffff" opacity=".16" /></g>
      </g>
    </svg>
  )
}

export const ESTILO_MD = `
.md { overflow: visible; filter: drop-shadow(0 4px 8px rgba(15,23,42,.18)); transition: transform .35s cubic-bezier(.3,1.5,.5,1) }
.md:hover { transform: scale(1.08) rotate(-4deg) }
.md .md-gira { transform-origin: center; transform-box: fill-box } .md:hover .md-gira { animation: mdGira 4s linear infinite } @keyframes mdGira { to { transform: rotate(360deg) } }
.md-brilho { fill: none; stroke: rgba(255,255,255,0); }
`
