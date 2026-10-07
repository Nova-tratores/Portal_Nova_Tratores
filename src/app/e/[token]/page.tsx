// Página PÚBLICA da etiqueta das Peças S/Estoque (Opa) — é para onde aponta o
// QR. Sem login: a chave aleatória do link é a credencial (pni_itens.token_publico,
// sql/pni-10). Lida no servidor com service role; mostra só o básico da peça —
// nada de preço, histórico ou quem cadastrou.

import type { Metadata } from 'next'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { textoAplicacoes, textoLocal } from '@/lib/opa-pecas/regras'
import { ROTULO_QUALIDADE, ROTULO_STATUS, type Aplicacao, type Qualidade, type Status } from '@/lib/opa-pecas/tipos'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Peça · Nova Tratores', robots: { index: false, follow: false } }

const BUCKET = 'pni-fotos'
const VALIDADE_FOTO_S = 60 * 60

interface Linha {
  codigo: string
  descricao: string | null
  codigo_fabricante: string | null
  quantidade: number
  qualidade: Qualidade
  status: Status
  nao_identificavel: boolean
  local_id: string | null
  local_tecnico: string | null
  deleted_at: string | null
  pni_fotos: { storage_path: string; ordem: number }[] | null
  pni_aplicacoes: Aplicacao[] | null
}

async function carregar(token: string) {
  if (!/^[0-9a-f]{32}$/.test(token)) return null
  const { data } = await supabaseAdmin
    .from('pni_itens')
    .select('codigo, descricao, codigo_fabricante, quantidade, qualidade, status, nao_identificavel, local_id, local_tecnico, deleted_at, pni_fotos(storage_path, ordem), pni_aplicacoes(id, tipo_maquina_id, marca_id)')
    .eq('token_publico', token)
    .maybeSingle<Linha>()
  if (!data) return null

  const fotos = [...(data.pni_fotos || [])].sort((a, b) => a.ordem - b.ordem).map((f) => f.storage_path)
  const [tipos, marcas, locais, assinadas] = await Promise.all([
    supabaseAdmin.from('maquina_tipos').select('id, nome'),
    supabaseAdmin.from('maquina_marcas').select('id, nome'),
    supabaseAdmin.from('pni_locais').select('id, nome'),
    fotos.length ? supabaseAdmin.storage.from(BUCKET).createSignedUrls(fotos, VALIDADE_FOTO_S) : Promise.resolve({ data: [] }),
  ])
  const mapa = (l: { id: string; nome: string }[] | null) => Object.fromEntries((l || []).map((x) => [x.id, x.nome]))
  return {
    item: data,
    aplicacao: textoAplicacoes({ aplicacoes: data.pni_aplicacoes || [], nao_identificavel: data.nao_identificavel },
      { tipos: mapa(tipos.data), marcas: mapa(marcas.data) }),
    local: textoLocal(data, mapa(locais.data)),
    fotos: (assinadas.data || []).map((f) => f.signedUrl).filter(Boolean) as string[],
  }
}

const COR = { fundo: '#F4F4F5', card: '#FFFFFF', borda: '#E4E4E7', texto: '#18181B', suave: '#52525B', fraco: '#71717A', laranja: '#EA580C' }

export default async function EtiquetaPublica({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const r = await carregar(token)

  const casca = (conteudo: React.ReactNode) => (
    <main style={{ minHeight: '100vh', background: COR.fundo, color: COR.texto, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', padding: '16px 16px 32px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Logo_Nova.png" alt="Nova Tratores" style={{ height: 30 }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: COR.fraco, letterSpacing: 0.6, textTransform: 'uppercase' }}>Peças S/Estoque</span>
        </div>
        {conteudo}
      </div>
    </main>
  )

  if (!r) {
    return casca(
      <div style={{ background: COR.card, border: `1px solid ${COR.borda}`, borderRadius: 14, padding: 24, textAlign: 'center', color: COR.suave }}>
        Etiqueta não encontrada. Confira se o QR está inteiro e tente de novo.
      </div>,
    )
  }

  const { item, aplicacao, local, fotos } = r
  const dados: [string, string][] = [
    ['Aplicação', aplicacao || 'Não informada'],
    ['Localização', local || 'Não informada'],
    ['Quantidade', `${item.quantidade} ${item.quantidade === 1 ? 'peça' : 'peças'}`],
    ['Estado', ROTULO_QUALIDADE[item.qualidade]],
    ...(item.codigo_fabricante ? [['Código existente', item.codigo_fabricante] as [string, string]] : []),
    ['Situação', item.deleted_at ? 'Excluída do cadastro' : ROTULO_STATUS[item.status]],
  ]

  return casca(
    <>
      <div style={{ background: COR.card, border: `1px solid ${COR.borda}`, borderRadius: 14, padding: 16 }}>
        <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 22 }}>{/^CAP-/i.test(item.codigo) ? 'Sem código' : item.codigo}</div>
        <div style={{ fontSize: 16, marginTop: 4, color: item.descricao ? COR.texto : COR.fraco }}>{item.descricao || 'Peça sem descrição'}</div>
      </div>

      {fotos.length > 0 && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollSnapType: 'x mandatory' }}>
          {fotos.map((u, i) => (
            <a key={i} href={u} target="_blank" rel="noreferrer" style={{ flex: '0 0 auto', scrollSnapAlign: 'start' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt={`Foto ${i + 1} da peça`} style={{ height: 220, maxWidth: '85vw', objectFit: 'cover', borderRadius: 12, border: `1px solid ${COR.borda}`, display: 'block' }} />
            </a>
          ))}
        </div>
      )}

      <div style={{ background: COR.card, border: `1px solid ${COR.borda}`, borderRadius: 14, overflow: 'hidden' }}>
        {dados.map(([rotulo, valor], i) => (
          <div key={rotulo} style={{ display: 'flex', gap: 12, padding: '11px 16px', borderTop: i ? `1px solid ${COR.borda}` : 'none', fontSize: 14.5 }}>
            <span style={{ width: 120, flexShrink: 0, color: COR.fraco, fontWeight: 600 }}>{rotulo}</span>
            <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{valor}</span>
          </div>
        ))}
      </div>

      <a href={`/opa/pecas/${encodeURIComponent(item.codigo)}`} style={{ textAlign: 'center', fontSize: 13.5, fontWeight: 700, color: COR.laranja, textDecoration: 'none', padding: 8 }}>
        Sou da equipe — abrir no portal
      </a>
    </>,
  )
}
