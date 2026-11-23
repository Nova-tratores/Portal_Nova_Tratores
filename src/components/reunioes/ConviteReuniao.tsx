'use client'
// Convite da reunião (José, 23/11/2026):
// - quem foi chamado vê "Vai participar?" com Aceitar / Recusar;
// - quem conduz/criou vê quem aceitou, recusou ou não respondeu, e um botão de WhatsApp por pessoa.
//   Sem celular no cadastro: o botão pede o número, grava no cadastro e abre a conversa.
// Sem sql/reunioes-convite.sql rodado, as presenças não trazem `resposta` e a parte de aceitar fica escondida.
import { useState } from 'react'
import { Check, X, MessageCircle } from 'lucide-react'
import type { UsuarioMin } from '@/lib/tickets/constantes'
import type { PresencaUI, ReuniaoUI } from './tipos'
import { chamar, primeiroNome } from './comum'

const COR = { aceito: '#059669', recusado: '#dc2626', nada: '#64748b' }

const botaoP = (cor: string, cheio = false): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5,
  border: `1px solid ${cheio ? cor : `color-mix(in srgb,${cor} 35%,var(--portal-border,#e2e8f0))`}`,
  background: cheio ? cor : 'var(--portal-surface,#fefefe)', color: cheio ? '#fefefe' : cor,
})

export default function ConviteReuniao({ reuniaoId, presencas, usuarios, meuId, convite, encerrada, onMudou }: {
  reuniaoId: string
  presencas: PresencaUI[]
  usuarios: Record<string, UsuarioMin>
  meuId: string
  convite?: ReuniaoUI['convite']
  /** ata publicada ou cancelada: só mostra, não deixa responder */
  encerrada: boolean
  onMudou: () => void
}) {
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const [pedindo, setPedindo] = useState<string | null>(null)   // usuario_id cujo celular está sendo digitado
  const [numero, setNumero] = useState('')
  // números salvos agora (o resto vem do servidor; assim recarregar a reunião não apaga o que acabou de digitar)
  const [celulares, setCelulares] = useState<Record<string, string | null>>({})

  const temResposta = presencas.some((p) => 'resposta' in p)
  const eu = presencas.find((p) => p.usuario_id === meuId)
  const nome = (id: string) => usuarios[id]?.nome || '—'

  const responder = async (resposta: 'aceito' | 'recusado') => {
    setOcupado(true); setErro('')
    try { await chamar(`/api/reunioes/${reuniaoId}/acoes`, { json: { acao: 'responder', resposta } }); window.dispatchEvent(new Event('central-trabalho-mudou')); onMudou() }
    catch (e) { setErro(e instanceof Error ? e.message : 'Falha') } finally { setOcupado(false) }
  }

  const abrirZap = (cel: string, uid: string, janela?: Window | null) => {
    const url = `https://wa.me/${cel}?text=${encodeURIComponent(convite?.textos[uid] || '')}`
    if (janela) janela.location.href = url; else window.open(url, '_blank', 'noopener')
  }

  const salvarEAbrir = async (uid: string) => {
    // abre a aba ANTES do await: depois dele o navegador trata como pop-up e bloqueia
    const janela = window.open('', '_blank')
    setOcupado(true); setErro('')
    try {
      const j = await chamar<{ celular: string }>(`/api/reunioes/${reuniaoId}/acoes`, { json: { acao: 'salvar_celular', usuario_id: uid, celular: numero } })
      setCelulares((c) => ({ ...c, [uid]: j.celular })); setPedindo(null); setNumero('')
      abrirZap(j.celular, uid, janela)
    } catch (e) { janela?.close(); setErro(e instanceof Error ? e.message : 'Falha') } finally { setOcupado(false) }
  }

  const outros = presencas.filter((p) => p.usuario_id !== meuId)
  const conta = { aceito: 0, recusado: 0, nada: 0 }
  for (const p of outros) conta[p.resposta || 'nada']++

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* quem foi chamado responde */}
      {temResposta && eu && eu.papel !== 'condutor' && !encerrada && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 12,
          background: eu.resposta ? 'var(--portal-bg-secondary,#f8fafc)' : 'color-mix(in srgb,#2563eb 8%,var(--portal-surface,#fefefe))' }}>
          <span style={{ flex: '1 1 160px', fontSize: 14 }}>
            {eu.resposta === 'aceito' ? <>Você <b style={{ fontWeight: 500, color: COR.aceito }}>aceitou</b> o convite.</>
              : eu.resposta === 'recusado' ? <>Você <b style={{ fontWeight: 500, color: COR.recusado }}>recusou</b> o convite.</>
              : 'Você foi chamado para esta reunião. Vai participar?'}
          </span>
          {eu.resposta !== 'aceito' && <button disabled={ocupado} onClick={() => responder('aceito')} style={botaoP(COR.aceito, !eu.resposta)}><Check size={15} /> Aceitar</button>}
          {eu.resposta !== 'recusado' && <button disabled={ocupado} onClick={() => responder('recusado')} style={botaoP(COR.recusado)}><X size={15} /> Recusar</button>}
        </div>
      )}

      {/* quem conduz/criou acompanha e avisa pelo WhatsApp */}
      {convite && outros.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {temResposta && (
            <div style={{ fontSize: 13, color: 'var(--portal-text-muted,#64748b)' }}>
              <span style={{ color: COR.aceito }}>{conta.aceito} aceitaram</span> · <span style={{ color: COR.recusado }}>{conta.recusado} recusaram</span> · {conta.nada} sem resposta
            </div>
          )}
          {outros.map((p) => {
            const st = p.resposta || 'nada'
            const cel = celulares[p.usuario_id] || convite.celulares[p.usuario_id]
            return (
              <div key={p.usuario_id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 14 }}>
                <span style={{ flex: '1 1 120px', minWidth: 0 }}>{primeiroNome(nome(p.usuario_id))}{p.papel === 'secretario' && <span style={{ fontSize: 12, color: 'var(--portal-text-muted,#64748b)' }}> · secretário</span>}</span>
                {temResposta && (
                  <span style={{ fontSize: 12, padding: '2px 9px', borderRadius: 999, color: COR[st], background: `color-mix(in srgb,${COR[st]} 11%,transparent)` }}>
                    {st === 'aceito' ? 'Aceitou' : st === 'recusado' ? 'Recusou' : 'Sem resposta'}
                  </span>
                )}
                {!encerrada && (pedindo === p.usuario_id ? (
                  <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                    <input autoFocus value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="(15) 99999-1234" inputMode="tel"
                      onKeyDown={(e) => { if (e.key === 'Enter' && numero.trim()) salvarEAbrir(p.usuario_id); if (e.key === 'Escape') setPedindo(null) }}
                      style={{ height: 34, width: 150, padding: '0 10px', borderRadius: 9, border: '1px solid #16a34a', background: 'var(--portal-bg,#fefefe)', color: 'var(--portal-text,#0f172a)', fontFamily: 'inherit', fontSize: 13.5 }} />
                    <button disabled={ocupado || !numero.trim()} onClick={() => salvarEAbrir(p.usuario_id)} style={botaoP('#16a34a', true)}>Salvar e abrir</button>
                    <button onClick={() => setPedindo(null)} style={botaoP('#64748b')} aria-label="Cancelar"><X size={14} /></button>
                  </span>
                ) : (
                  <button onClick={() => cel ? abrirZap(cel, p.usuario_id) : (setPedindo(p.usuario_id), setNumero(''))}
                    title={cel ? 'Abrir a conversa com o convite já escrito' : 'Sem celular no cadastro: digite uma vez e fica salvo'} style={botaoP('#16a34a')}>
                    <MessageCircle size={14} /> {cel ? 'WhatsApp' : 'WhatsApp (pôr número)'}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      )}
      {erro && <div style={{ color: '#dc2626', fontSize: 13 }}>{erro}</div>}
    </div>
  )
}
