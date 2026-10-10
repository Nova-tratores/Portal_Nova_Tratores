'use client'
// POPs — execução: o controle de resposta de UM passo (pensado para o celular:
// botões grandes, foto direto da câmera, faixa conferida enquanto digita).
// Quem chama decide salvar/avançar; aqui só se monta o valor.
import { useRef, useState } from 'react'
import { Camera, Check, Loader2, Trash2, X } from 'lucide-react'
import { foraDaFaixa, type ConfigPasso, type TipoPasso } from '@/lib/pops/regras'
import { comprimir } from '@/lib/opa-pecas/fotos'
import CanvasAssinatura, { type CanvasAssinaturaRef } from '@/components/assinatura/CanvasAssinatura'
import { chamar } from '../comum'

export interface PassoExec {
  id: string
  ordem: number
  tipo: TipoPasso
  titulo: string
  ajuda: string
  obrigatorio: boolean
  config: ConfigPasso
  midia_url: string | null
}
export interface RespostaLocal { valor: Record<string, unknown>; fotos: string[] }

interface Props {
  passo: PassoExec
  resposta: RespostaLocal | undefined
  urls: Record<string, string>        // path → URL (assinada ou local)
  ticketId: string
  meuNome: string
  bloqueado: boolean
  onSalvar: (valor: Record<string, unknown>, fotos: string[], avancar: boolean) => Promise<boolean>
  onUrlLocal: (path: string, url: string) => void
}

const grande = (cor: string, ativo = false): React.CSSProperties => ({
  flex: 1, minHeight: 64, borderRadius: 14, fontSize: 20, fontWeight: 900, cursor: 'pointer',
  border: `3px solid ${cor}`, background: ativo ? cor : 'var(--portal-surface,#fff)', color: ativo ? '#fefefe' : cor,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
})
const botaoAcao: React.CSSProperties = {
  width: '100%', minHeight: 56, borderRadius: 14, border: 'none', background: '#0f766e', color: '#fefefe',
  fontSize: 18, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
}
const entrada: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', fontSize: 22, padding: '14px 16px', borderRadius: 12,
  border: '2px solid var(--portal-border,#d1d5db)', background: 'var(--portal-bg,#fff)', color: 'var(--portal-text,#111)',
}

async function subir(ticketId: string, passoId: string, corpo: Blob, tipo: string): Promise<string> {
  const up = await chamar<{ path: string; signedUrl: string }>(`/api/pops/execucoes/${ticketId}`, {
    json: { acao: 'upload_url', passo_id: passoId, content_type: tipo },
  })
  const r = await fetch(up.signedUrl, { method: 'PUT', body: corpo, headers: { 'Content-Type': tipo } })
  if (!r.ok) throw new Error('A foto não subiu — confira a internet e tente de novo.')
  return up.path
}

export default function RespostaPasso({ passo, resposta, urls, ticketId, meuNome, bloqueado, onSalvar, onUrlLocal }: Props) {
  const c = passo.config || {}
  const v = resposta?.valor || {}
  const [numero, setNumero] = useState(v.numero !== undefined ? String(v.numero).replace('.', ',') : '')
  const [texto, setTexto] = useState(String(v.texto ?? ''))
  const [nome, setNome] = useState(String(v.nome ?? (c.quem === 'cliente' ? '' : meuNome)))
  const [tracou, setTracou] = useState(false)
  const [subindo, setSubindo] = useState(false)
  const [erro, setErro] = useState('')
  const quadro = useRef<CanvasAssinaturaRef | null>(null)
  const fotos = resposta?.fotos || []

  const salvar = async (valor: Record<string, unknown>, fs: string[] = [], avancar = true) => {
    setErro('')
    return onSalvar(valor, fs, avancar)
  }

  if (passo.tipo === 'instrucao') {
    return <button style={botaoAcao} onClick={() => onSalvar({}, [], true)}><Check size={20} /> Entendi, próximo</button>
  }

  if (passo.tipo === 'check') {
    const sim = v.sim === true, nao = v.sim === false
    return (
      <div style={{ display: 'flex', gap: 12 }}>
        <button disabled={bloqueado} style={grande('#059669', sim)} onClick={() => salvar({ sim: true })}><Check size={22} /> Sim</button>
        <button disabled={bloqueado} style={grande('#b91c1c', nao)} onClick={() => salvar({ sim: false })}><X size={22} /> Não</button>
      </div>
    )
  }

  if (passo.tipo === 'selecao') {
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        {(c.opcoes || []).map((o) => (
          <button key={o} disabled={bloqueado} style={{ ...grande('#0f766e', v.opcao === o), flex: 'none' }} onClick={() => salvar({ opcao: o })}>{o}</button>
        ))}
      </div>
    )
  }

  if (passo.tipo === 'numero') {
    const n = Number(numero.replace(',', '.'))
    const valido = numero.trim() !== '' && Number.isFinite(n)
    const fora = valido && foraDaFaixa(c, n)
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input inputMode="decimal" value={numero} disabled={bloqueado} onChange={(e) => setNumero(e.target.value.replace(/[^\d.,-]/g, ''))}
            style={{ ...entrada, borderColor: fora ? '#d97706' : undefined }} placeholder="0" autoFocus />
          {c.unidade && <span style={{ fontSize: 20, fontWeight: 800 }}>{c.unidade}</span>}
        </div>
        {(c.min !== undefined || c.max !== undefined) && (
          <div style={{ fontSize: 15, color: fora ? '#b45309' : 'var(--portal-text-muted,#888)', fontWeight: fora ? 800 : 500 }}>
            {fora ? '⚠ Fora da faixa ' : 'Faixa '}{c.min ?? '—'} a {c.max ?? '—'}{c.unidade ? ` ${c.unidade}` : ''}
            {fora && ' — confira; se estiver certo, salve: quem pediu será avisado.'}
          </div>
        )}
        <button disabled={!valido || bloqueado} style={{ ...botaoAcao, opacity: valido ? 1 : .5 }} onClick={() => salvar({ numero: n })}>
          <Check size={20} /> Salvar e seguir
        </button>
      </div>
    )
  }

  if (passo.tipo === 'texto') {
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <textarea value={texto} disabled={bloqueado} onChange={(e) => setTexto(e.target.value)} rows={4} maxLength={4000}
          style={{ ...entrada, fontSize: 17, resize: 'vertical' }} placeholder="Escreva aqui" />
        <button disabled={(!texto.trim() && passo.obrigatorio) || bloqueado} style={{ ...botaoAcao, opacity: texto.trim() || !passo.obrigatorio ? 1 : .5 }}
          onClick={() => (texto.trim() ? salvar({ texto: texto.trim() }) : onSalvar({}, [], true))}>
          <Check size={20} /> {texto.trim() ? 'Salvar e seguir' : 'Pular (opcional)'}
        </button>
      </div>
    )
  }

  if (passo.tipo === 'foto') {
    const min = Math.max(1, c.min_fotos ?? 1), max = c.max_fotos ?? 5
    const tirar = async (arquivo: File) => {
      setSubindo(true); setErro('')
      try {
        const { grande: jpeg } = await comprimir(arquivo)
        const path = await subir(ticketId, passo.id, jpeg, 'image/jpeg')
        onUrlLocal(path, URL.createObjectURL(jpeg))
        const novas = [...fotos, path]
        await salvar({}, novas, novas.length >= min && novas.length >= max)
      } catch (e) { setErro((e as Error).message) } finally { setSubindo(false) }
    }
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(96px,1fr))', gap: 8 }}>
          {fotos.map((f) => (
            <div key={f} style={{ position: 'relative' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urls[f]} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 10, background: '#e5e7eb' }} />
              {!bloqueado && (
                <button aria-label="Tirar foto" onClick={() => salvar({}, fotos.filter((x) => x !== f), false)}
                  style={{ position: 'absolute', top: 4, right: 4, border: 'none', borderRadius: 8, background: 'rgba(0,0,0,.6)', color: '#fefefe', padding: 4, cursor: 'pointer' }}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
        <div style={{ fontSize: 15, color: fotos.length >= min ? '#047857' : 'var(--portal-text-secondary,#555)', fontWeight: 700 }}>
          {fotos.length} foto(s) · mínimo {min}{max > min ? `, até ${max}` : ''}
        </div>
        {!bloqueado && fotos.length < max && (
          <label style={{ ...botaoAcao, cursor: subindo ? 'wait' : 'pointer' }}>
            {subindo ? <><Loader2 size={20} className="girar" /> Enviando…</> : <><Camera size={22} /> Tirar foto</>}
            <input type="file" accept="image/*" capture="environment" hidden disabled={subindo}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) tirar(f); e.target.value = '' }} />
          </label>
        )}
        {fotos.length >= min && !bloqueado && (
          <button style={{ ...botaoAcao, background: 'var(--portal-surface,#fff)', color: '#0f766e', border: '2px solid #0f766e' }} onClick={() => onSalvar({}, fotos, true)}>
            Próximo passo
          </button>
        )}
        {erro && <div style={{ color: '#b91c1c', fontWeight: 700 }}>{erro}</div>}
      </div>
    )
  }

  // assinatura
  const doCliente = c.quem === 'cliente'
  const assinar = async () => {
    if (!nome.trim()) { setErro('Escreva o nome de quem assina.'); return }
    setSubindo(true); setErro('')
    try {
      let imagem_path: string | undefined
      if (doCliente) {
        const b = await quadro.current?.blob()
        if (!b) { setErro('Peça para o cliente assinar no quadro.'); setSubindo(false); return }
        imagem_path = await subir(ticketId, passo.id, b, 'image/png')
        onUrlLocal(imagem_path, URL.createObjectURL(b))
      }
      await salvar({ nome: nome.trim(), ...(imagem_path ? { imagem_path } : {}) })
    } catch (e) { setErro((e as Error).message) } finally { setSubindo(false) }
  }
  const jaAssinou = String(v.nome || '').trim()
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {jaAssinou && (
        <div style={{ fontSize: 15, color: '#047857', fontWeight: 700 }}>
          ✓ Assinado por {jaAssinou}
          {typeof v.imagem_path === 'string' && urls[v.imagem_path] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={urls[v.imagem_path]} alt="assinatura" style={{ display: 'block', maxHeight: 90, marginTop: 6, background: '#fff', borderRadius: 8 }} />
          )}
        </div>
      )}
      {!bloqueado && (
        <>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder={doCliente ? 'Nome do cliente' : 'Seu nome'} style={{ ...entrada, fontSize: 18 }} />
          {doCliente ? (
            <>
              <CanvasAssinatura ref={quadro} temTraco={tracou} onTraco={setTracou} altura={200} />
              <button style={{ ...botaoAcao, background: 'var(--portal-surface,#fff)', color: '#374151', border: '1px solid #d1d5db', minHeight: 44, fontSize: 15 }}
                onClick={() => quadro.current?.limpar()}>Limpar</button>
            </>
          ) : (
            <div style={{ fontSize: 14, color: 'var(--portal-text-secondary,#555)' }}>Ao confirmar, fica registrado que você ({meuNome}) executou este passo.</div>
          )}
          <button disabled={subindo || (doCliente && !tracou)} style={{ ...botaoAcao, opacity: subindo || (doCliente && !tracou) ? .5 : 1 }} onClick={assinar}>
            {subindo ? 'Salvando…' : <><Check size={20} /> {doCliente ? 'Confirmar assinatura do cliente' : 'Confirmo'}</>}
          </button>
        </>
      )}
      {erro && <div style={{ color: '#b91c1c', fontWeight: 700 }}>{erro}</div>}
    </div>
  )
}
