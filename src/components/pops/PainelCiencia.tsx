'use client'
// POPs — ciência de leitura da versão publicada (para quem cuida do POP):
// exigir de um grupo de pessoas e ver quem já deu e quem falta.
import { useCallback, useEffect, useState } from 'react'
import { Check, Clock, Plus, X } from 'lucide-react'
import UserSelect from '@/components/tickets/UserSelect'
import type { UsuarioMin } from '@/lib/tickets/constantes'
import { COR_POPS, botao, botaoClaro, br, cartao, chamar, chip, vazio, type UsuarioMapa } from './comum'

interface Status {
  lista: { usuario_id: string; exigido_em: string; ciente_em: string | null }[]
  usuarios: UsuarioMapa; total: number; pendentes: number; espontaneas: number
}

export default function PainelCiencia({ popId, versaoId, numero }: { popId: string; versaoId: string; numero: number }) {
  const [st, setSt] = useState<Status | null>(null)
  const [novos, setNovos] = useState<UsuarioMin[]>([])
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  const carregar = useCallback(async () => {
    try { const r = await chamar<Status>(`/api/pops/ciencia?versao_id=${versaoId}`); setSt(r) } catch (e) { setErro((e as Error).message) }
  }, [versaoId])
  useEffect(() => { carregar() }, [carregar])

  const exigir = async () => {
    setEnviando(true); setErro(''); setAviso('')
    try {
      const r = await chamar<{ exigidos: number }>(`/api/pops/${popId}/acoes`, { json: { acao: 'exigir_ciencia', versao_id: versaoId, usuarios: novos.map((u) => u.id) } })
      setNovos([]); setAviso(`${r.exigidos} pessoa(s) avisada(s).`); await carregar()
    } catch (e) { setErro((e as Error).message) } finally { setEnviando(false) }
  }

  const jaNaLista = new Set([...(st?.lista.map((l) => l.usuario_id) || []), ...novos.map((u) => u.id)])
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ ...cartao, display: 'grid', gap: 10 }}>
        <div style={{ fontWeight: 800 }}>Pedir ciência da v{numero}</div>
        <div style={{ fontSize: 13, color: 'var(--portal-text-secondary,#555)' }}>
          Cada pessoa recebe um aviso e marca &quot;li e entendi&quot;. Fica registrado quem leu, qual versão e quando.
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {novos.map((u) => (
            <span key={u.id} style={chip(COR_POPS, 'rgba(15,118,110,.12)')}>
              {u.nome}
              <button aria-label="Tirar" onClick={() => setNovos(novos.filter((x) => x.id !== u.id))} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', display: 'flex', padding: 0 }}><X size={12} /></button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1 1 260px' }}>
            <UserSelect value="" barraBusca excluir={[...jaNaLista]} placeholder="Incluir pessoa…"
              onChange={(_, u) => { if (u) setNovos((l) => [...l, u]) }} />
          </div>
          <button disabled={!novos.length || enviando} onClick={exigir} style={{ ...botao(COR_POPS), opacity: novos.length ? 1 : .5 }}>
            <Plus size={14} /> {enviando ? 'Enviando…' : `Pedir ciência (${novos.length})`}
          </button>
        </div>
        {aviso && <div style={{ fontSize: 13, color: '#047857', fontWeight: 700 }}>{aviso}</div>}
        {erro && <div style={{ fontSize: 13, color: '#dc2626', fontWeight: 700 }}>{erro}</div>}
      </div>

      <div style={cartao}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
          <strong>Quem precisa ler</strong>
          {st && <span style={chip(st.pendentes ? '#b45309' : '#047857', st.pendentes ? 'rgba(217,119,6,.12)' : 'rgba(5,150,105,.12)')}>
            {st.total - st.pendentes} de {st.total} deram ciência
          </span>}
          {st && st.espontaneas > 0 && <span style={{ fontSize: 12, color: 'var(--portal-text-muted,#888)' }}>+{st.espontaneas} leram sem ser pedido</span>}
          <span style={{ flex: 1 }} />
          <button onClick={carregar} style={botaoClaro()}>Atualizar</button>
        </div>
        {!st ? <div style={vazio}>Carregando…</div> : !st.lista.length ? <div style={vazio}>Ninguém foi chamado a ler esta versão.</div> : (
          <div style={{ display: 'grid', gap: 4 }}>
            {[...st.lista].sort((a, b) => Number(!!a.ciente_em) - Number(!!b.ciente_em)).map((l) => (
              <div key={l.usuario_id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, padding: '6px 0', borderTop: '1px solid var(--portal-border,#e5e7eb)' }}>
                {l.ciente_em ? <Check size={15} style={{ color: '#059669' }} /> : <Clock size={15} style={{ color: '#d97706' }} />}
                <span style={{ flex: 1 }}>{st.usuarios[l.usuario_id]?.nome || l.usuario_id}</span>
                <span style={{ fontSize: 12, color: l.ciente_em ? '#047857' : '#b45309' }}>
                  {l.ciente_em ? `leu em ${br(l.ciente_em.slice(0, 10))}` : `pedido em ${br(l.exigido_em.slice(0, 10))} — falta`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
