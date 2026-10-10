'use client'
// POPs — histórico de versões (changelog, quem enviou/aprovou) + diff simples de
// passos entre uma versão e a anterior (pela `chave`, que atravessa as versões).
import { useEffect, useState } from 'react'
import { diffPassos, type MudancaPasso, type PassoComparavel, type EstadoVersao } from '@/lib/pops/regras'
import { COR_POPS, EstadoChip, botaoClaro, br, cartao, chamar, chip, primeiroNome, type UsuarioMapa } from './comum'

export interface VersaoResumo {
  id: string; numero: number; estado: EstadoVersao; changelog: string
  submetido_por: string | null; submetido_em: string | null; aprovado_por: string | null; publicado_em: string | null; obsoleto_em: string | null; criado_em: string
}

const COR_MUDANCA: Record<MudancaPasso['tipo'], [string, string, string]> = {
  adicionado: ['#047857', 'rgba(5,150,105,.12)', 'Adicionado'],
  removido: ['#b91c1c', 'rgba(220,38,38,.10)', 'Removido'],
  alterado: ['#b45309', 'rgba(217,119,6,.12)', 'Alterado'],
  movido: ['#4b5563', 'rgba(107,114,128,.12)', 'Mudou de posição'],
}
const NOME_CAMPO: Record<string, string> = { tipo: 'tipo', titulo: 'título', ajuda: 'ajuda', obrigatorio: 'obrigatório', config: 'configuração', midia_path: 'mídia' }

async function passosDe(popId: string, versaoId: string): Promise<PassoComparavel[]> {
  const r = await chamar<{ passos: PassoComparavel[] }>(`/api/pops/${popId}?versao=${versaoId}`)
  return r.passos
}

function Diff({ popId, atual, anterior }: { popId: string; atual: VersaoResumo; anterior: VersaoResumo }) {
  const [mud, setMud] = useState<MudancaPasso[] | null>(null)
  const [soReais, setSoReais] = useState(true)
  const [erro, setErro] = useState('')
  useEffect(() => {
    Promise.all([passosDe(popId, anterior.id), passosDe(popId, atual.id)])
      .then(([a, b]) => setMud(diffPassos(a, b))).catch((e) => setErro((e as Error).message))
  }, [popId, atual.id, anterior.id])
  if (erro) return <div style={{ color: '#dc2626', fontSize: 13 }}>{erro}</div>
  if (!mud) return <div style={{ fontSize: 13, color: 'var(--portal-text-muted,#888)' }}>Comparando…</div>
  const lista = soReais ? mud.filter((m) => m.tipo !== 'movido') : mud
  return (
    <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
      <div style={{ fontSize: 12, color: 'var(--portal-text-muted,#888)', display: 'flex', gap: 10, alignItems: 'center' }}>
        Passos: v{anterior.numero} → v{atual.numero}
        <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input type="checkbox" checked={!soReais} onChange={(e) => setSoReais(!e.target.checked)} /> mostrar mudanças de posição
        </label>
      </div>
      {!lista.length && <div style={{ fontSize: 13 }}>Nenhum passo mudou{soReais && mud.length ? ' (só posição)' : ''}.</div>}
      {lista.map((m, i) => {
        const [cor, fundo, rot] = COR_MUDANCA[m.tipo]
        const p = 'depois' in m ? m.depois : m.antes
        return (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 13, flexWrap: 'wrap' }}>
            <span style={chip(cor, fundo)}>{rot}</span>
            <span><strong>{p.ordem}.</strong> {m.tipo === 'alterado' && m.antes.titulo !== m.depois.titulo
              ? <><s style={{ color: '#9ca3af' }}>{m.antes.titulo}</s> → {m.depois.titulo}</> : p.titulo}</span>
            {m.tipo === 'alterado' && <span style={{ color: 'var(--portal-text-muted,#888)' }}>({m.campos.map((c) => NOME_CAMPO[c] || c).join(', ')})</span>}
            {m.tipo === 'movido' && <span style={{ color: 'var(--portal-text-muted,#888)' }}>(era o {m.antes.ordem})</span>}
          </div>
        )
      })}
    </div>
  )
}

export default function HistoricoVersoes({ popId, versoes, usuarios }: { popId: string; versoes: VersaoResumo[]; usuarios: UsuarioMapa }) {
  const [aberta, setAberta] = useState<string | null>(null)
  const ordem = [...versoes].sort((a, b) => b.numero - a.numero)
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {ordem.map((v) => {
        const anterior = ordem.find((x) => x.numero < v.numero)
        const nome = (u: string | null) => primeiroNome(u ? usuarios[u]?.nome : null)
        return (
          <div key={v.id} style={{ ...cartao, padding: 14 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <EstadoChip estado={v.estado} numero={v.numero} />
              <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted,#888)' }}>
                criada {br(v.criado_em?.slice(0, 10))}
                {v.submetido_por && <> · enviada por {nome(v.submetido_por)} em {br(v.submetido_em?.slice(0, 10))}</>}
                {v.aprovado_por && <> · aprovada por {nome(v.aprovado_por)} em {br(v.publicado_em?.slice(0, 10))}</>}
                {v.obsoleto_em && <> · substituída em {br(v.obsoleto_em.slice(0, 10))}</>}
              </span>
              <span style={{ flex: 1 }} />
              <a href={`/pops/${popId}?versao=${v.id}`} style={{ fontSize: 13, color: COR_POPS, fontWeight: 700 }}>ver</a>
              {anterior && (
                <button onClick={() => setAberta(aberta === v.id ? null : v.id)} style={botaoClaro()}>
                  {aberta === v.id ? 'Fechar comparação' : `Comparar com v${anterior.numero}`}
                </button>
              )}
            </div>
            {v.changelog && <div style={{ marginTop: 8, fontSize: 14, whiteSpace: 'pre-wrap', color: 'var(--portal-text,#111)' }}>{v.changelog}</div>}
            {aberta === v.id && anterior && <Diff popId={popId} atual={v} anterior={anterior} />}
          </div>
        )
      })}
    </div>
  )
}
