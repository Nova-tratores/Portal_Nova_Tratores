'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { authHeaders } from '@/lib/auth/client'
import { useAuth } from '@/hooks/useAuth'
import { montarParcelas } from '@/lib/financeiro/parcelas'
import { MessageCircle, Mail, Check, Pencil, Send, Plus, X } from 'lucide-react'
import ConfigEmailEnvioModal from '@/components/financeiro/ConfigEmailEnvioModal'

// Junta os boletos anexados do card numa lista de URLs
function boletoUrls(card) {
  if (!card) return []
  const urls = []
  if (card.anexo_boleto) card.anexo_boleto.split(',').forEach(u => { const t = u.trim(); if (t) urls.push(t) })
  ;['anexo_boleto_2', 'anexo_boleto_3'].forEach(k => { const t = (card[k] || '').trim(); if (t && !urls.includes(t)) urls.push(t) })
  return urls
}

// Mostra/registra a preferência de envio do boleto de um cliente (WhatsApp ou Email),
// permite vários emails e envia o boleto por email (mesmo esquema do Controle Revisão).
// NÃO altera o status do card — o "Enviado ao cliente" é manual.
export default function PreferenciaEnvioBoleto({ card, cnpj: cnpjProp, nome: nomeProp }) {
  const { userProfile } = useAuth()
  const cnpj = cnpjProp ?? card?.cnpj_cliente
  const nome = nomeProp ?? card?.nom_cliente

  const [cnpjResolvido, setCnpjResolvido] = useState((cnpj || '').trim())
  const [pref, setPref] = useState(null)        // registro existente em EnvioBoleto
  const [metodo, setMetodo] = useState('')      // 'whatsapp' | 'email'
  const [whatsappNum, setWhatsappNum] = useState('')
  const [emails, setEmails] = useState([''])    // lista de emails (vários por cliente)
  const [editando, setEditando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [aviso, setAviso] = useState(null)      // {tipo:'ok'|'erro', msg}
  const [configEmailOpen, setConfigEmailOpen] = useState(false)   // modal "configurar meu e-mail"
  const [emailsPendentes, setEmailsPendentes] = useState(null)    // reenvia após configurar
  const [meuEmailEnvio, setMeuEmailEnvio] = useState('') // "De:" (remetente do usuário)

  // Busca o e-mail de envio configurado pelo usuário (para mostrar "De:").
  const carregarMeuEmail = async () => {
    try {
      const r = await fetch('/api/financeiro/config-envio', { headers: { ...(await authHeaders()) } })
      const c = await r.json()
      if (c && !c.error) setMeuEmailEnvio(c.email_envio || '')
    } catch {}
  }
  useEffect(() => { carregarMeuEmail() }, [])

  const splitEmails = (s) => String(s || '').split(/[,;\s]+/).map(e => e.trim()).filter(Boolean)
  const urls = boletoUrls(card)
  // Links das notas fiscais (serviço e peça)
  const nfUrls = [
    ...String(card?.anexo_nf_servico || '').split(',').map(u => u.trim()).filter(Boolean),
    ...String(card?.anexo_nf_peca || '').split(',').map(u => u.trim()).filter(Boolean),
  ]

  // ----- WhatsApp (wa.me) -----
  const formatVenc = (d) => {
    const s = String(d || '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return d || ''
    const [a, m, dia] = s.split('-')
    return `${dia}/${m}/${a}`
  }
  // número só com dígitos + DDI 55 (Brasil) quando faltar
  const waNumero = (num) => {
    let d = String(num || '').replace(/\D/g, '')
    if (!d) return ''
    if (!d.startsWith('55') && d.length <= 11) d = '55' + d
    return d
  }
  // Converte uma URL pública do bucket 'anexos' em link ASSINADO com validade (60 dias).
  // Se não for desse bucket (ou falhar), mantém a URL original.
  const VALIDADE_LINK = 60 * 24 * 60 * 60 // 60 dias em segundos
  const assinarLink = async (publicUrl) => {
    try {
      const marker = '/object/public/anexos/'
      const idx = publicUrl.indexOf(marker)
      if (idx === -1) return publicUrl
      const path = decodeURIComponent(publicUrl.substring(idx + marker.length).split('?')[0])
      const { data } = await supabase.storage.from('anexos').createSignedUrl(path, VALIDADE_LINK)
      return data?.signedUrl || publicUrl
    } catch { return publicUrl }
  }

  const montarMensagem = (bUrls, nUrls) => {
    const saud = new Date().getHours() < 12 ? 'Bom dia' : 'Boa tarde'
    const nf = [card?.num_nf_servico && `S ${card.num_nf_servico}`, card?.num_nf_peca && `P ${card.num_nf_peca}`].filter(Boolean).join(' / ')
    const valor = card?.valor_servico != null && card?.valor_servico !== '' ? Number(card.valor_servico).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : ''
    const venc = formatVenc(card?.vencimento_boleto)
    const linhas = [
      `${saud}${nome ? `, ${nome}` : ''}!`,
      '',
      `Segue o boleto${nf ? ` referente à NF ${nf}` : ''} da Nova Tratores.`,
    ]
    if (valor) linhas.push(`Valor: ${valor}`)
    if (venc) linhas.push(`Vencimento: ${venc}`)
    if (bUrls.length) { linhas.push(''); linhas.push(bUrls.length > 1 ? 'Boletos:' : 'Boleto:'); bUrls.forEach(u => linhas.push(u)) }
    if (nUrls.length) { linhas.push(''); linhas.push(nUrls.length > 1 ? 'Notas fiscais:' : 'Nota fiscal:'); nUrls.forEach(u => linhas.push(u)) }
    linhas.push('')
    linhas.push('Qualquer dúvida, estamos à disposição.')
    linhas.push(`${userProfile?.nome || ''} - Nova Tratores`.trim())
    return linhas.join('\n')
  }

  const abrirWhats = async (num) => {
    const numero = waNumero(num)
    if (!numero) { alert('Informe um número de WhatsApp válido (com DDD).'); return }
    // abre a janela já no clique (evita bloqueio de pop-up) e preenche depois de assinar os links
    const win = window.open('', '_blank')
    const [bAssinados, nAssinados] = await Promise.all([
      Promise.all(urls.map(assinarLink)),
      Promise.all(nfUrls.map(assinarLink)),
    ])
    const alvo = `https://wa.me/${numero}?text=${encodeURIComponent(montarMensagem(bAssinados, nAssinados))}`
    if (win) win.location.href = alvo
    else window.open(alvo, '_blank')
  }

  useEffect(() => {
    let ativo = true
    const run = async () => {
      setCarregando(true)
      let doc = (cnpj || '').trim()
      if (!doc && nome) {
        try {
          const r = await fetch(`/api/ppv/clientes?termo=${encodeURIComponent(nome)}`)
          const arr = r.ok ? await r.json() : []
          const m = arr.find(c => (c.nome || '').toLowerCase() === nome.toLowerCase()) || arr[0]
          doc = (m?.documento || '').trim()
        } catch { /* ignore */ }
      }
      if (!ativo) return
      setCnpjResolvido(doc)
      if (!doc) { setPref(null); setEditando(false); setCarregando(false); return }
      const { data } = await supabase.from('EnvioBoleto').select('*').eq('cnpj_cpf', doc).maybeSingle()
      if (!ativo) return
      setPref(data || null)
      if (data) {
        setMetodo(data.metodo || (data.email ? 'email' : 'whatsapp'))
        setWhatsappNum(data.whatsapp || '')
        setEmails(data.email ? splitEmails(data.email) : [''])
        setEditando(false)
      } else {
        setMetodo(''); setWhatsappNum(''); setEmails(['']); setEditando(true)
      }
      setCarregando(false)
    }
    run()
    return () => { ativo = false }
  }, [cnpj, nome])

  const salvar = async () => {
    if (!cnpjResolvido) return
    if (!metodo) { alert('Escolha WhatsApp ou Email.'); return }
    const emailsLimpos = emails.map(e => e.trim()).filter(Boolean)
    if (metodo === 'whatsapp' && !whatsappNum.trim()) { alert('Informe o número de WhatsApp.'); return }
    if (metodo === 'email' && emailsLimpos.length === 0) { alert('Informe ao menos um email.'); return }
    setSalvando(true)
    const row = {
      cnpj_cpf: cnpjResolvido,
      cliente_nome: nome || pref?.cliente_nome || null,
      metodo,
      whatsapp: metodo === 'whatsapp' ? whatsappNum.trim() : (pref?.whatsapp || null),
      email: emailsLimpos.length ? emailsLimpos.join(', ') : (metodo === 'email' ? null : pref?.email || null),
      updated_at: new Date().toISOString(),
      updated_by: userProfile?.id || null,
    }
    const { data, error } = await supabase.from('EnvioBoleto').upsert(row, { onConflict: 'cnpj_cpf' }).select().maybeSingle()
    setSalvando(false)
    if (error) { alert('Erro ao salvar preferência: ' + error.message); return }
    setPref(data || row); setEditando(false); setAviso({ tipo: 'ok', msg: 'Preferência salva.' })
  }

  // Envia o boleto por email — NÃO mexe no status do card
  const enviarBoleto = async (listaEmails) => {
    const destinatarios = (listaEmails || []).map(e => e.trim()).filter(Boolean)
    if (destinatarios.length === 0) { alert('Adicione ao menos um email.'); return }
    if (urls.length === 0 && nfUrls.length === 0) { alert('Não há boleto nem nota fiscal anexados neste card para enviar.'); return }
    setEnviando(true); setAviso(null)
    try {
      const res = await fetch('/api/financeiro/enviar-boleto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          urls,
          nfUrls,
          destinatarios,
          cliente: nome || '',
          nf: [card?.num_nf_servico && `S ${card.num_nf_servico}`, card?.num_nf_peca && `P ${card.num_nf_peca}`].filter(Boolean).join(' / '),
          valor: card?.valor_servico != null ? Number(card.valor_servico).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '',
          vencimento: card?.vencimento_boleto || '',
          parcelas: montarParcelas(card),
          remetente: userProfile?.nome || '',
        }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) {
        // Usuário ainda não configurou o e-mail dele → pede na hora e reenvia depois.
        if (out.semConfig) { setEmailsPendentes(destinatarios); setConfigEmailOpen(true); return }
        throw new Error(out.error || 'Falha no envio')
      }
      setAviso({ tipo: 'ok', msg: `Boleto enviado para ${destinatarios.join(', ')}.` })
    } catch (e) {
      setAviso({ tipo: 'erro', msg: e.message })
    } finally { setEnviando(false) }
  }

  const wrap = { background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }
  const titulo = { fontSize: '13px', fontWeight: 700, color: 'var(--portal-text-secondary)', letterSpacing: '1px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }
  const inputBase = { flex: 1, padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--portal-border)', outline: 'none', background: 'var(--portal-bg-card)', color: 'var(--portal-text)', fontSize: '15px', boxSizing: 'border-box' }

  if (carregando) {
    return <div style={wrap}><div style={titulo}><Send size={15} /> Preferência de envio do boleto</div><p style={{ fontSize: 13, color: 'var(--portal-text-secondary)', margin: 0 }}>Carregando…</p></div>
  }

  if (!cnpjResolvido) {
    return (
      <div style={wrap}>
        <div style={titulo}><Send size={15} /> Preferência de envio do boleto</div>
        <p style={{ fontSize: 13, color: 'var(--portal-text-secondary)', margin: 0 }}>Não foi possível identificar o CNPJ/CPF deste cliente para vincular a preferência.</p>
      </div>
    )
  }

  const avisoBox = aviso && (
    <div style={{ fontSize: 13, padding: '10px 12px', borderRadius: 10, background: aviso.tipo === 'ok' ? '#f0fdf4' : '#fef2f2', color: aviso.tipo === 'ok' ? '#15803d' : '#b91c1c', border: `1px solid ${aviso.tipo === 'ok' ? '#bbf7d0' : '#fecaca'}` }}>{aviso.msg}</div>
  )

  const btnMetodo = (val, Icon, label, cor) => {
    const ativo = metodo === val
    return (
      <button type="button" onClick={() => { setMetodo(val); if (val === 'email' && emails.filter(Boolean).length === 0) setEmails(pref?.email ? splitEmails(pref.email) : ['']) }}
        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', borderRadius: '12px', cursor: 'pointer', fontSize: '14px', fontWeight: 600, border: `1.5px solid ${ativo ? cor : 'var(--portal-border)'}`, background: ativo ? `${cor}14` : 'var(--portal-bg-card)', color: ativo ? cor : 'var(--portal-text-secondary)', transition: '0.15s' }}>
        <Icon size={17} /> {label}
      </button>
    )
  }

  const btnEnviarEmail = (lista) => (urls.length > 0 || nfUrls.length > 0) && (
    <button type="button" onClick={() => enviarBoleto(lista)} disabled={enviando}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: enviando ? '#9ca3af' : '#2563eb', color: '#fff', border: 'none', borderRadius: '10px', padding: '12px 18px', cursor: enviando ? 'default' : 'pointer', fontSize: '14px', fontWeight: 600 }}>
      <Send size={16} /> {enviando ? 'Enviando…' : `Enviar boleto por email${lista.filter(Boolean).length > 1 ? ` (${lista.filter(Boolean).length})` : ''}`}
    </button>
  )

  const btnEnviarWhats = (num) => (
    <button type="button" onClick={() => abrirWhats(num)}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '10px', padding: '12px 18px', cursor: 'pointer', fontSize: '14px', fontWeight: 600 }}>
      <MessageCircle size={16} /> Enviar pelo WhatsApp
    </button>
  )

  // Modal "meu e-mail de envio" — renderizado em TODOS os blocos (o botão
  // Configurar/enviar pode ser clicado em qualquer estado do componente).
  const configModal = (
    <ConfigEmailEnvioModal
      open={configEmailOpen}
      emailInicial={userProfile?.email || ''}
      onClose={() => setConfigEmailOpen(false)}
      onSaved={() => {
        setConfigEmailOpen(false)
        carregarMeuEmail()
        const alvo = emailsPendentes
        setEmailsPendentes(null)
        if (alvo) enviarBoleto(alvo)
      }}
    />
  )

  // Visualização (registrado e não editando)
  if (pref && !editando) {
    const isWa = pref.metodo === 'whatsapp'
    const cor = isWa ? '#16a34a' : '#2563eb'
    const listaEmails = splitEmails(pref.email)
    return (
      <div style={wrap}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={titulo}><Send size={15} /> Preferência de envio do boleto</div>
          <button type="button" onClick={() => setEditando(true)} title="Editar preferência" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent', border: '1px solid var(--portal-border)', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', color: 'var(--portal-text-secondary)', fontSize: '12px', fontWeight: 600 }}>
            <Pencil size={13} /> Editar
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: `${cor}14`, color: cor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {isWa ? <MessageCircle size={20} /> : <Mail size={20} />}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, color: 'var(--portal-text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{isWa ? 'WhatsApp' : 'Email'}</div>
            {isWa
              ? <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--portal-text)' }}>{pref.whatsapp || '—'}</div>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{listaEmails.length ? listaEmails.map((e, i) => <div key={i} style={{ fontSize: 15, fontWeight: 600, color: 'var(--portal-text)', wordBreak: 'break-all' }}>{e}</div>) : <span style={{ color: 'var(--portal-text-secondary)' }}>—</span>}</div>}
          </div>
        </div>
        {!isWa && (
          <div style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)', display: 'flex', flexDirection: 'column', gap: 3, padding: '10px 12px', background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span><b style={{ color: 'var(--portal-text)' }}>De:</b> {meuEmailEnvio || <span style={{ color: '#dc2626', fontWeight: 600 }}>não configurado</span>}</span>
              <button type="button" onClick={() => { setEmailsPendentes(null); setConfigEmailOpen(true); }}
                style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, background: 'transparent', border: '1px solid var(--portal-border)', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', color: 'var(--portal-text-secondary)', fontSize: 11.5, fontWeight: 700 }}>
                <Pencil size={12} /> {meuEmailEnvio ? 'Alterar' : 'Configurar'}
              </button>
            </div>
            <div style={{ wordBreak: 'break-all' }}><b style={{ color: 'var(--portal-text)' }}>Para:</b> {listaEmails.join(', ') || '—'}</div>
          </div>
        )}
        {avisoBox}
        {isWa ? btnEnviarWhats(pref.whatsapp) : btnEnviarEmail(listaEmails)}
        {configModal}
      </div>
    )
  }

  // Registro / edição
  return (
    <div style={wrap}>
      <div style={titulo}><Send size={15} /> Preferência de envio do boleto</div>
      <p style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)', margin: 0 }}>Como o cliente prefere receber o boleto?</p>
      <div style={{ display: 'flex', gap: '10px' }}>
        {btnMetodo('whatsapp', MessageCircle, 'WhatsApp', '#16a34a')}
        {btnMetodo('email', Mail, 'Email', '#2563eb')}
      </div>

      {metodo === 'whatsapp' && (
        <input type="tel" value={whatsappNum} onChange={e => setWhatsappNum(e.target.value)} placeholder="(00) 00000-0000" style={inputBase} />
      )}

      {metodo === 'email' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {emails.map((em, i) => (
            <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input type="email" value={em} onChange={e => { const arr = [...emails]; arr[i] = e.target.value; setEmails(arr) }} placeholder="email@cliente.com" style={inputBase} />
              {emails.length > 1 && (
                <button type="button" onClick={() => setEmails(emails.filter((_, j) => j !== i))} title="Remover" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 10, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: '#dc2626', cursor: 'pointer', flexShrink: 0 }}><X size={16} /></button>
              )}
            </div>
          ))}
          <button type="button" onClick={() => setEmails([...emails, ''])} style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent', border: '1px dashed var(--portal-border)', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer', color: 'var(--portal-text-secondary)', fontSize: '13px', fontWeight: 600 }}>
            <Plus size={14} /> Adicionar email
          </button>
        </div>
      )}

      {avisoBox}

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {metodo && (
          <button type="button" onClick={salvar} disabled={salvando} style={{ display: 'flex', alignItems: 'center', gap: '7px', background: salvando ? '#9ca3af' : '#dc2626', color: '#fff', border: 'none', borderRadius: '10px', padding: '12px 18px', cursor: salvando ? 'default' : 'pointer', fontSize: '14px', fontWeight: 600 }}>
            <Check size={16} /> {salvando ? 'Salvando…' : 'Salvar preferência'}
          </button>
        )}
        {metodo === 'email' && btnEnviarEmail(emails)}
        {metodo === 'whatsapp' && btnEnviarWhats(whatsappNum)}
        {pref && (
          <button type="button" onClick={() => { setEditando(false); setMetodo(pref.metodo || ''); setWhatsappNum(pref.whatsapp || ''); setEmails(pref.email ? splitEmails(pref.email) : ['']) }} style={{ background: 'transparent', border: 'none', color: 'var(--portal-text-secondary)', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}>
            Cancelar
          </button>
        )}
      </div>

      {configModal}
    </div>
  )
}
