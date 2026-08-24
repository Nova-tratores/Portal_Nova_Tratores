'use client'
// Cores de gráfico que respeitam o tema do portal.
//
// POR QUE ISTO PRECISA EXISTIR: o modo escuro do portal funciona por seletor de
// ATRIBUTO sobre style inline (globals.css: `div[style*="background: #fff"]`…).
// Isso alcança <div>, mas não alcança atributo de SVG (stroke/fill dos eixos e
// da grade) nem o `contentStyle` do <Tooltip> do Recharts, que é uma div com
// estilo próprio. Resultado: hoje NENHUM gráfico do projeto funciona no escuro
// — e o tooltip sai branco sobre branco em todos eles.
//
// O tema é escrito imperativamente em `document.documentElement`
// (PortalLayout.tsx:232,241,251), então não basta ler uma vez: sem
// MutationObserver os gráficos só repintariam depois de um reload.
//
// Vive em lib/charts (não em lib/financeiro) de propósito: o buraco é global e
// estoque/frota/DRE devem herdar isto quando forem mexidos.

import { useEffect, useState } from 'react'

export type ModoTema = 'claro' | 'escuro'

export interface ChartTheme {
  modo: ModoTema
  /** linhas de grade — hairline, quase sussurro */
  grade: string
  /** ticks e rótulos de eixo */
  eixo: string
  /** texto de destaque dentro do gráfico */
  tinta: string
  tintaMuted: string
  tooltipBg: string
  tooltipBorda: string
  /** cor de série única (evolução mensal, ranking de fornecedor) */
  serie: string
  /** barra do mês em curso / valores de-enfatizados */
  serieFraca: string
}

const CLARO: ChartTheme = {
  modo: 'claro',
  grade: '#eef1f5',
  eixo: '#8a94a6',
  tinta: '#0f172a',
  tintaMuted: '#64748b',
  tooltipBg: '#ffffff',
  tooltipBorda: '#e2e8f0',
  serie: '#2563eb',
  serieFraca: '#bfdbfe',
}

const ESCURO: ChartTheme = {
  modo: 'escuro',
  grade: '#2b2b31',
  eixo: '#9aa3b2',
  tinta: '#f1f5f9',
  tintaMuted: '#94a3b8',
  tooltipBg: '#1f1f24',
  tooltipBorda: '#3a3a42',
  serie: '#60a5fa',
  serieFraca: '#1e3a5f',
}

function lerModo(): ModoTema {
  if (typeof document === 'undefined') return 'claro'
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr === 'dark') return 'escuro'
  if (attr === 'light') return 'claro'
  // fallback: a classe que o PortalLayout também aplica no wrapper
  return document.querySelector('.portal-dark') ? 'escuro' : 'claro'
}

export function useChartTheme(): ChartTheme {
  // começa no claro pra bater com o servidor; o efeito corrige antes da pintura
  const [modo, setModo] = useState<ModoTema>('claro')

  useEffect(() => {
    setModo(lerModo())
    const alvo = document.documentElement
    const obs = new MutationObserver(() => setModo(lerModo()))
    obs.observe(alvo, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])

  return modo === 'escuro' ? ESCURO : CLARO
}
