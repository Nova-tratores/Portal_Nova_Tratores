'use client'
// Tile de semaforo de saude financeira (usado na Home do DRE).
// Recebe UM sinal de calcularSaudeFinanceira e mostra: luz de status
// (verde/amarelo/vermelho/cinza), valor grande, sub-detalhe e a seta de
// TENDENCIA DE SAUDE (melhorando/piorando/estavel) - a seta reflete a
// trajetoria da SAUDE, nao o sinal cru do numero (por isso "piora" e' sempre
// vermelho pra baixo, mesmo quando o valor -juros- subiu).
import Link from 'next/link'

// Paleta por status (mesma familia do corMap da Analise DRE).
const COR = {
  bom:      { border: 'border-emerald-300', bg: 'bg-emerald-50',  hover: 'hover:border-emerald-500', dot: 'bg-emerald-500', txt: 'text-emerald-900', sub: 'text-emerald-700', luz: '🟢' },
  atencao:  { border: 'border-amber-300',   bg: 'bg-amber-50',    hover: 'hover:border-amber-500',   dot: 'bg-amber-500',   txt: 'text-amber-900',   sub: 'text-amber-700',   luz: '🟡' },
  ruim:     { border: 'border-red-300',     bg: 'bg-red-50',      hover: 'hover:border-red-500',     dot: 'bg-red-500',     txt: 'text-red-900',     sub: 'text-red-700',     luz: '🔴' },
  sem_dado: { border: 'border-slate-200',   bg: 'bg-slate-50',    hover: 'hover:border-slate-400',   dot: 'bg-slate-300',   txt: 'text-slate-500',   sub: 'text-slate-400',   luz: '⚪' },
}

// Seta de tendencia da SAUDE (nao do valor cru).
const TEND = {
  melhora:  { seta: '▲', cls: 'text-emerald-700', txt: 'melhorando' },
  piora:    { seta: '▼', cls: 'text-red-700',     txt: 'piorando' },
  estavel:  { seta: '→', cls: 'text-slate-500',   txt: 'estavel' },
}

function fmtValor(valor, unidade) {
  if (valor === null || valor === undefined || !isFinite(valor)) return '--'
  const v = Number(valor)
  if (unidade === 'dias') return Math.round(v) + 'd'
  if (unidade === 'pct') return v.toFixed(1) + '%'
  if (unidade === 'ratio') return v.toFixed(2) + '×'
  // BRL (abreviado k/M, igual aos KPIs da Home)
  const s = v < 0 ? '-' : '', a = Math.abs(v)
  if (a >= 1e6) return s + 'R$ ' + (a / 1e6).toFixed(1).replace('.', ',') + 'M'
  if (a >= 1e3) return s + 'R$ ' + Math.round(a / 1e3) + 'k'
  return s + 'R$ ' + Math.round(a)
}

export default function TileSemaforo({ sinal }) {
  const c = COR[sinal.status] || COR.sem_dado
  const t = sinal.tendencia ? TEND[sinal.tendencia] : null

  return (
    <Link
      href={sinal.href}
      className={`${c.bg} border-2 ${c.border} ${c.hover} hover:shadow rounded-xl p-4 transition block`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className={`text-xs uppercase tracking-wide font-extrabold ${c.txt} flex items-center gap-1.5`}>
          <span className={`inline-block w-2.5 h-2.5 rounded-full ${c.dot}`} aria-hidden="true"></span>
          {sinal.label}
        </div>
        {t && (
          <span className={`text-xs font-bold ${t.cls}`} title={`Tendencia: ${t.txt}`}>
            {t.seta} {t.txt}
          </span>
        )}
      </div>
      <div className={`text-3xl font-extrabold mt-2 ${c.txt}`}>
        {fmtValor(sinal.valor, sinal.unidade)}
      </div>
      <div className={`text-xs mt-2 ${c.sub}`}>{sinal.sub}</div>
    </Link>
  )
}
