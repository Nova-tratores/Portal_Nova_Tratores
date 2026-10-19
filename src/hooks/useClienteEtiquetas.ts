import { useState, useEffect, useCallback } from 'react'
import { fetchAuth } from '@/lib/auth/client'

interface Etiqueta { id: number; nome: string; cor: string }

let _cache: Record<string, Etiqueta[]> | null = null
let _promise: Promise<Record<string, Etiqueta[]>> | null = null

function fetchMapa(): Promise<Record<string, Etiqueta[]>> {
  if (_cache) return Promise.resolve(_cache)
  if (_promise) return _promise
  _promise = fetchAuth('/api/clientes/etiquetas?modo=mapa')
    // sem sessão (401) não guarda o mapa vazio: a próxima montagem tenta de novo
    .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json() })
    .then(data => {
      const etqs: Etiqueta[] = data.etiquetas || []
      const mapaByCnpj: Record<string, Etiqueta[]> = {}
      for (const v of (data.mapa || [])) {
        const etq = etqs.find(e => e.id === v.etiqueta_id)
        if (etq) {
          if (!mapaByCnpj[v.cnpj_cpf]) mapaByCnpj[v.cnpj_cpf] = []
          mapaByCnpj[v.cnpj_cpf].push(etq)
        }
      }
      const lookup: Record<string, Etiqueta[]> = { ...mapaByCnpj }
      for (const cli of (data.clientes || [])) {
        const cnpj = (cli.cnpj_cpf || '').replace(/\D/g, '')
        const tags = mapaByCnpj[cnpj]
        if (tags) {
          if (cli.nome_fantasia) lookup[cli.nome_fantasia.toUpperCase()] = tags
          if (cli.razao_social) lookup[cli.razao_social.toUpperCase()] = tags
        }
      }
      _cache = lookup
      return lookup
    })
    .catch(() => { _promise = null; return {} })
  return _promise
}

export function useClienteEtiquetas() {
  const [byKey, setByKey] = useState<Record<string, Etiqueta[]>>(_cache || {})

  useEffect(() => {
    fetchMapa().then(lookup => setByKey(lookup))
  }, [])

  const getEtiquetas = useCallback((chave: string): Etiqueta[] => {
    if (!chave) return []
    const cnpjLimpo = chave.replace(/\D/g, '')
    if (/^\d{11,14}$/.test(cnpjLimpo)) return byKey[cnpjLimpo] || []
    return byKey[chave.toUpperCase()] || []
  }, [byKey])

  return { getEtiquetas }
}
