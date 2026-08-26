'use client'
// Hooks de dados do Gestão de Vendas — chamam /api/gestao-vendas/* com o token
// da sessão (a autorização real acontece no servidor).

import { useCallback, useEffect, useState } from 'react'
import { authHeaders } from '@/lib/auth/client'
import { vendaIdFor, type LinhaAjuste } from '@/lib/gestao-vendas/calculos'
import type {
  AjusteVenda,
  CampoCusto,
  CustoMensalVendedor,
  PedidoVendaRelatorio,
  VendaEnriquecida,
  Vendedor,
} from '@/lib/gestao-vendas/tipos'
import { useGv } from './GvProvider'

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: await authHeaders() })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
  return json as T
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
  return json as T
}

// ---------- vendas + ajustes + vendedores do mês ----------

export type MesData = {
  vendas: VendaEnriquecida[]
  ajustes: AjusteVenda[]
  vendedores: Vendedor[]
}

// contaOverride: 'TODAS' busca as duas lojas de uma vez (usado em Vendas do Mês)
export function useGvMes(contaOverride?: 'NOVA' | 'CASTRO' | 'TODAS') {
  const { mes, ano, conta: contaSel } = useGv()
  const conta = contaOverride ?? contaSel
  const [data, setData] = useState<MesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    getJson<MesData>(`/api/gestao-vendas/mes?mes=${mes}&ano=${ano}&conta=${conta}`)
      .then((d) => {
        if (cancelled) return
        setData(d)
        setLoading(false)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
        setData(null)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [mes, ano, conta])

  const vendas = data?.vendas ?? []
  const vendedores = data?.vendedores ?? []

  // vendas × ajustes → linhas (chave composta venda_id)
  const mapAjustes = new Map<string, AjusteVenda>()
  for (const a of data?.ajustes ?? []) mapAjustes.set(a.venda_id, a)
  const linhas: LinhaAjuste[] = vendas.map((v) => {
    const chave = vendaIdFor(v)
    return { venda: v, venda_id_chave: chave, ajuste: mapAjustes.get(chave) ?? null }
  })

  const aplicarAjusteSalvo = useCallback((ajuste: AjusteVenda) => {
    setData((atual) => {
      if (!atual) return atual
      const outros = atual.ajustes.filter((a) => a.venda_id !== ajuste.venda_id)
      return { ...atual, ajustes: [...outros, ajuste] }
    })
  }, [])

  // troca a lista de vendedores localmente (após adicionar/sincronizar sem recarregar o mês)
  const aplicarVendedores = useCallback((novos: Vendedor[]) => {
    setData((atual) => (atual ? { ...atual, vendedores: novos } : atual))
  }, [])

  return { vendas, vendedores, linhas, loading, error, aplicarAjusteSalvo, aplicarVendedores }
}

// ---------- gestão da lista de vendedores ----------

export async function adicionarVendedorApi(
  nome: string,
  email?: string,
): Promise<{ vendedor: Vendedor; vendedores: Vendedor[] }> {
  return postJson('/api/gestao-vendas/vendedores', { nome, email })
}

// lista os candidatos vindos do Omie que ainda não estão salvos (não grava nada)
export async function listarCandidatosOmieApi(): Promise<{ candidatos: string[] }> {
  return postJson('/api/gestao-vendas/vendedores', { listarOmie: true })
}

// adiciona em lote os nomes escolhidos na seleção do Omie
export async function adicionarVendedoresEmLoteApi(nomes: string[]): Promise<{
  criados: number
  nomes: string[]
  vendedores: Vendedor[]
}> {
  return postJson('/api/gestao-vendas/vendedores', { nomes })
}

export type SalvarAjusteBody = {
  id?: number | null
  venda_id: string
  data_pedido?: string | null
  mes: number
  ano: number
  cliente?: string | null
  familia?: string | null
  categoria?: string | null
  departamento?: string | null
  produto_descricao?: string | null
  valor_venda: number
  cmc_total: number
  cmc_override?: number | null
  vendedor?: string | null
  custos_extras?: number
  desconto?: number
  comissao_override_pct?: number | null
  comissao_pct_base?: number
  data_pagamento_comissao_override?: string | null
}

export async function salvarAjusteApi(conta: string, body: SalvarAjusteBody): Promise<AjusteVenda> {
  const { ajuste } = await postJson<{ ajuste: AjusteVenda }>('/api/gestao-vendas/ajustes', {
    ...body,
    conta_omie: conta,
  })
  return ajuste
}

// ---------- custos mensais ----------

export function useGvCustos() {
  const { mes, ano, conta } = useGv()
  const [custos, setCustos] = useState<CustoMensalVendedor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)

  const reload = useCallback(() => setVersao((v) => v + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    getJson<{ custos: CustoMensalVendedor[] }>(
      `/api/gestao-vendas/custos?mes=${mes}&ano=${ano}&conta=${conta}`,
    )
      .then((d) => {
        if (cancelled) return
        setCustos(d.custos)
        setLoading(false)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
        setCustos([])
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [mes, ano, conta, versao])

  const salvar = useCallback(
    async (nome: string, valores: Partial<Record<CampoCusto, number>>) => {
      const { custo } = await postJson<{ custo: CustoMensalVendedor }>(
        '/api/gestao-vendas/custos',
        { nome, mes, ano, conta_omie: conta, valores },
      )
      setCustos((atual) => [...atual.filter((r) => r.nome !== nome), custo])
      return custo
    },
    [mes, ano, conta],
  )

  const copiarMesAnterior = useCallback(async () => {
    const { copiados } = await postJson<{ copiados: number }>('/api/gestao-vendas/custos', {
      copiarDe: true,
      mes,
      ano,
      conta_omie: conta,
    })
    if (copiados > 0) reload()
    return copiados
  }, [mes, ano, conta, reload])

  return { custos, loading, error, salvar, copiarMesAnterior }
}

// ---------- pedidos faturados (relatório geral) ----------

export function useGvPedidos() {
  const { mes, ano } = useGv()
  const [pedidos, setPedidos] = useState<PedidoVendaRelatorio[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    getJson<{ pedidos: PedidoVendaRelatorio[] }>(
      `/api/gestao-vendas/pedidos-relatorio?mes=${mes}&ano=${ano}`,
    )
      .then((d) => {
        if (cancelled) return
        setPedidos(d.pedidos)
        setLoading(false)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
        setPedidos([])
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [mes, ano])

  return { pedidos, loading, error }
}

// ---------- cards por família (dashboard) ----------

export type FamiliaCard = {
  nome: string
  venda: number
  cmc: number
  qtd: number
  vendaMesAnt: number
  vendaAnoAnt: number
}

export function useGvFamilias() {
  const { mes, ano, conta } = useGv()
  const [dados, setDados] = useState<{ familias: FamiliaCard[]; total: FamiliaCard } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    getJson<{ familias: FamiliaCard[]; total: FamiliaCard }>(
      `/api/gestao-vendas/familias?mes=${mes}&ano=${ano}&conta=${conta}`,
    )
      .then((d) => {
        if (cancelled) return
        setDados(d)
        setLoading(false)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
        setDados(null)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [mes, ano, conta])

  return { dados, loading, error }
}

export function cmcDoPedido(p: PedidoVendaRelatorio): number {
  if (!Array.isArray(p.itens_enriquecidos)) return 0
  return p.itens_enriquecidos.reduce(
    (s, it) => s + Number(it.custo_unitario ?? 0) * Number(it.quantidade ?? 0),
    0,
  )
}

export function pedidoAtivo(p: PedidoVendaRelatorio): boolean {
  const c = (p.cancelada ?? '').toUpperCase()
  const d = (p.devolvido ?? '').toUpperCase()
  return c !== 'SIM' && d !== 'SIM'
}
