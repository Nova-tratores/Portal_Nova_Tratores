'use client'
// Regra de juros por empresa no NAVEGADOR (09/11/2026): a mesma regra salva em financeiro_regra_juros vale
// para a tela Contas do cliente e para o Caixa › Vencidos (multa uma vez + juros pro-rata). Uma leitura por
// carregamento da página; sem a migration ou sem resposta, cai no padrão (multa 2 % + 1 % a.m.).
import { useEffect, useState } from 'react'
import { fetchAuth } from '@/lib/auth/client'
import { REGRA_PADRAO, normalizarRegra, type RegraJuros } from './divida'

export type RegrasEmpresa = Record<'NOVA' | 'CASTRO', RegraJuros>
const PADRAO: RegrasEmpresa = { NOVA: { ...REGRA_PADRAO }, CASTRO: { ...REGRA_PADRAO } }

let promessa: Promise<RegrasEmpresa> | null = null

export function lerRegrasJuros(forcar = false): Promise<RegrasEmpresa> {
  if (!promessa || forcar) {
    promessa = fetchAuth('/api/financeiro/contas-cliente/regra')
      .then((r) => r.json())
      .then((j) => (j?.ok && j.regras ? { NOVA: normalizarRegra(j.regras.NOVA), CASTRO: normalizarRegra(j.regras.CASTRO) } : PADRAO))
      .catch(() => { promessa = null; return PADRAO })
  }
  return promessa
}

/** Regras de NOVA e CASTRO; `carregada` = já veio do servidor (antes disso vale o padrão). */
export function useRegrasJuros(): { regras: RegrasEmpresa; carregada: boolean } {
  const [estado, setEstado] = useState<{ regras: RegrasEmpresa; carregada: boolean }>({ regras: PADRAO, carregada: false })
  useEffect(() => {
    let vivo = true
    lerRegrasJuros().then((regras) => { if (vivo) setEstado({ regras, carregada: true }) })
    return () => { vivo = false }
  }, [])
  return estado
}

/** Chave da regra a partir da empresa em qualquer grafia ('nova', 'NOVA', 'Castro Pecas'…). */
export const contaDaRegra = (conta: string | null | undefined): 'NOVA' | 'CASTRO' =>
  String(conta || '').trim().toUpperCase().startsWith('CASTRO') ? 'CASTRO' : 'NOVA'
