'use client'
// POPs — "a OS dispara este POP": quando uma OS do tipo escolhido entra na fase
// escolhida, o portal cria a execução para o técnico da OS, com a referência
// "OS-0852 · <chassi>" (a aba Execuções acha o histórico da máquina pelo chassi).
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Pause, Play, Plus, Trash2, Wrench } from 'lucide-react'
import UserSelect from '@/components/tickets/UserSelect'
import { COR_POPS, botao, botaoClaro, br, campo, cartao, chamar, chip, rotulo, vazio } from './comum'

interface Gatilho { id: string; tipo_servico: string; fase: string; responsavel_padrao_id: string; ativo: boolean }
interface Disparo { gatilho_id: string; os_id: string; ticket_id: string | null; erro: string | null; criado_em: string }
interface Resp {
  gatilhos: Gatilho[]; disparos: Disparo[]; opcoes: { tipos: string[]; fases: string[] }
  migracaoFaltando?: boolean; aviso?: string
}

export default function PainelGatilhosOS({ popId }: { popId: string }) {
  const [d, setD] = useState<Resp | null>(null)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [tipo, setTipo] = useState('')
  const [fase, setFase] = useState('Execução')
  const [resp, setResp] = useState('')
  const [versao, setVersao] = useState(0)

  useEffect(() => {
    let vivo = true
    chamar<Resp>(`/api/pops/${popId}/gatilhos-os`)
      .then((r) => { if (vivo) { setD(r); setErro('') } })
      .catch((e) => { if (vivo) setErro((e as Error).message) })
    return () => { vivo = false }
  }, [popId, versao])

  const chamarApi = useCallback(async (method: string, json?: unknown, qs = '') => {
    setOcupado(true); setErro('')
    try { await chamar(`/api/pops/${popId}/gatilhos-os${qs}`, { method, json }); setVersao((v) => v + 1) }
    catch (e) { setErro((e as Error).message) } finally { setOcupado(false) }
  }, [popId])

  if (!d) return <div style={cartao}>{erro ? <span style={{ color: '#dc2626' }}>{erro}</span> : <div style={vazio}>Carregando…</div>}</div>

  const podeCriar = !!tipo && !!fase && !!resp && !d.migracaoFaltando
  return (
    <div style={{ ...cartao, display: 'grid', gap: 10 }}>
      <strong style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Wrench size={15} /> Disparar pela OS (POS)</strong>
      <div style={{ fontSize: 13, color: 'var(--portal-text-secondary,#555)' }}>
        Quando uma OS do tipo escolhido entra na fase escolhida, o portal cria a execução deste POP para o <strong>técnico da OS</strong>,
        com o número da OS e o chassi como referência. Cada OS gera uma execução só, mesmo que volte para a fase.
      </div>
      {d.migracaoFaltando && <div style={{ fontSize: 13, color: '#b45309', fontWeight: 700 }}>{d.aviso}</div>}

      {!d.gatilhos.length ? <div style={vazio}>Nenhuma regra. Crie abaixo.</div> : (
        <div style={{ display: 'grid', gap: 6 }}>
          {d.gatilhos.map((g) => (
            <div key={g.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '8px 0', borderTop: '1px solid var(--portal-border,#e5e7eb)', opacity: g.ativo ? 1 : .55 }}>
              <span style={{ fontWeight: 700, flex: '1 1 260px' }}>OS de <strong>{g.tipo_servico}</strong> entrou em <strong>{g.fase}</strong></span>
              <span style={{ fontSize: 12, color: 'var(--portal-text-muted,#888)' }}>
                {d.disparos.filter((x) => x.gatilho_id === g.id && x.ticket_id).length} execução(ões) recente(s)
              </span>
              {!g.ativo && <span style={chip('#6b7280', 'rgba(107,114,128,.14)')}>pausada</span>}
              <button disabled={ocupado} onClick={() => chamarApi('PATCH', { gatilho_id: g.id, ativo: !g.ativo })} style={botaoClaro()}>
                {g.ativo ? <><Pause size={13} /> Pausar</> : <><Play size={13} /> Retomar</>}
              </button>
              <button disabled={ocupado} onClick={() => { if (confirm('Remover esta regra? As execuções já criadas ficam.')) chamarApi('DELETE', undefined, `?gatilho_id=${g.id}`) }}
                style={{ ...botaoClaro(), color: '#dc2626' }}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}

      {!d.migracaoFaltando && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', borderTop: '1px solid var(--portal-border,#e5e7eb)', paddingTop: 10 }}>
          <div>
            <label style={rotulo}>Tipo de serviço da OS</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={{ ...campo, width: 'auto' }}>
              <option value="">Escolha…</option>
              {d.opcoes.tipos.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={rotulo}>Quando entrar na fase</label>
            <select value={fase} onChange={(e) => setFase(e.target.value)} style={{ ...campo, width: 'auto' }}>
              {d.opcoes.fases.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div style={{ flex: '1 1 240px' }}>
            <label style={rotulo}>Se o técnico da OS não usa o portal, vai para</label>
            <UserSelect value={resp} onChange={(id) => setResp(id)} barraBusca />
          </div>
          <button disabled={!podeCriar || ocupado} onClick={() => chamarApi('POST', { tipo_servico: tipo, fase, responsavel_padrao_id: resp })}
            style={{ ...botao(COR_POPS), opacity: podeCriar ? 1 : .5 }}><Plus size={14} /> Criar regra</button>
        </div>
      )}

      {d.disparos.length > 0 && (
        <details>
          <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>Últimas OS que dispararam ({d.disparos.length})</summary>
          <div style={{ display: 'grid', gap: 4, marginTop: 6, fontSize: 13 }}>
            {d.disparos.map((x) => (
              <div key={`${x.gatilho_id}|${x.os_id}`} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700 }}>{x.os_id}</span>
                <span style={{ color: 'var(--portal-text-muted,#888)' }}>{br(x.criado_em.slice(0, 10))}</span>
                {x.ticket_id
                  ? <Link href={`/pops/executar/${x.ticket_id}`} style={{ color: COR_POPS, fontWeight: 700 }}>abrir execução</Link>
                  : <span style={{ color: '#dc2626' }}>não criou{x.erro ? `: ${x.erro}` : ''}</span>}
              </div>
            ))}
          </div>
        </details>
      )}
      {erro && <div style={{ fontSize: 13, color: '#dc2626', fontWeight: 700 }}>{erro}</div>}
    </div>
  )
}
