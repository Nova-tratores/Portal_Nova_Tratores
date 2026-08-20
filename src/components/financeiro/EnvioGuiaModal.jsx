'use client'
// Modal central de ORIENTAÇÃO do envio rápido do boleto: aparece quando o envio
// automático não pôde acontecer (cliente sem preferência, e-mail do usuário não
// configurado, sem anexo, cliente prefere WhatsApp, ou erro no envio) e explica
// o que arrumar, passo a passo. `info` = { motivo, card, erro } | null.
import { X, AlertTriangle, MessageCircle, Paperclip, Settings, Send } from 'lucide-react'

const CONTEUDO = {
  sem_preferencia: {
    titulo: 'Cliente sem preferência de envio',
    Icon: AlertTriangle, cor: '#b45309', bg: '#fef3c7',
    resumo: 'Esse cliente ainda não tem cadastrado COMO quer receber o boleto (e-mail ou WhatsApp), então o envio automático não sabe pra onde mandar.',
    passos: [
      'Clique em "Abrir card" aqui embaixo.',
      'Desça até a seção "Preferência de envio do boleto".',
      'Escolha Email ou WhatsApp e, se for e-mail, informe o(s) endereço(s) do cliente.',
      'Volte ao kanban e clique de novo no botão verde de enviar.',
    ],
    acao: 'abrir_card', acaoLabel: 'Abrir card',
  },
  sem_config: {
    titulo: 'Seu e-mail de envio não está configurado',
    Icon: Settings, cor: '#b45309', bg: '#fef3c7',
    resumo: 'O boleto sai pelo SEU e-mail, e você ainda não configurou o seu (ou a senha de app parou de funcionar).',
    passos: [
      'Clique em "Configurar meu e-mail" aqui embaixo.',
      'Informe o seu e-mail e o provedor (Gmail, Outlook…).',
      'No Gmail, gere uma SENHA DE APP: Conta Google → Segurança → Verificação em 2 etapas → Senhas de app (16 dígitos). Não é a sua senha normal.',
      'Salve — o envio continua sozinho depois de salvar.',
    ],
    acao: 'config_email', acaoLabel: 'Configurar meu e-mail',
  },
  whatsapp: {
    titulo: 'Este cliente prefere WhatsApp',
    Icon: MessageCircle, cor: '#16a34a', bg: '#dcfce7',
    resumo: 'A preferência cadastrada é WhatsApp — o portal ainda não envia boleto por WhatsApp sozinho, então esse envio é manual.',
    passos: [
      'Baixe o boleto anexado no card.',
      'Envie pro cliente pelo WhatsApp normalmente.',
      'Volte aqui e clique em "Marcar como enviado" — o card pula pra Aguardando Cliente.',
    ],
    acao: 'marcar_enviado', acaoLabel: 'Marcar como enviado',
  },
  sem_arquivo: {
    titulo: 'Sem boleto anexado no card',
    Icon: Paperclip, cor: '#b45309', bg: '#fef3c7',
    resumo: 'Não tem boleto (nem nota fiscal) anexado nesse card — não há o que enviar ainda.',
    passos: [
      'Clique em "Abrir card".',
      'Anexe o boleto (e a NF, se tiver) nos campos de anexo.',
      'Volte e clique de novo no botão verde de enviar.',
    ],
    acao: 'abrir_card', acaoLabel: 'Abrir card',
  },
  erro: {
    titulo: 'O envio falhou',
    Icon: AlertTriangle, cor: '#dc2626', bg: '#fef2f2',
    resumo: 'Tentei enviar o e-mail mas deu erro. Veja a mensagem abaixo e siga os passos.',
    passos: [
      'Confira se o(s) e-mail(s) do cliente estão certos na preferência de envio.',
      'Confira sua configuração de e-mail (a senha de app pode ter expirado).',
      'Tente enviar de novo; se persistir, chame um admin.',
    ],
    acao: 'abrir_card', acaoLabel: 'Abrir card',
  },
}

export default function EnvioGuiaModal({ info, onClose, onAbrirCard, onConfigEmail, onMarcarEnviado }) {
  if (!info) return null
  const c = CONTEUDO[info.motivo] || CONTEUDO.erro
  const { Icon } = c
  const acoes = { abrir_card: onAbrirCard, config_email: onConfigEmail, marcar_enviado: onMarcarEnviado }
  const onAcao = c.acao ? acoes[c.acao] : null

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }} style={{ position: 'fixed', inset: 0, zIndex: 10500, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: '20px', width: '100%', maxWidth: '560px', boxShadow: '0 25px 60px rgba(0,0,0,.3)', overflow: 'hidden' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '18px 22px', background: c.bg, borderBottom: '1px solid var(--portal-border)' }}>
          <Icon size={22} color={c.cor} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: '17px', fontWeight: 800, color: c.cor }}>{c.titulo}</div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,.6)', border: 'none', borderRadius: '8px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: c.cor }}><X size={17} /></button>
        </div>

        <div style={{ padding: '20px 24px 24px' }}>
          {info.card?.nom_cliente && (
            <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--portal-text-secondary)', marginBottom: '10px' }}>
              Cliente: <span style={{ color: 'var(--portal-text)' }}>{info.card.nom_cliente}</span> — NF #{info.card.id}
            </div>
          )}
          <p style={{ fontSize: '14px', color: 'var(--portal-text)', lineHeight: 1.6, margin: '0 0 16px' }}>{c.resumo}</p>

          {info.erro && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: '13px', fontWeight: 600, padding: '10px 14px', borderRadius: '10px', marginBottom: '16px', wordBreak: 'break-word' }}>
              {info.erro}
            </div>
          )}

          <div style={{ background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)', borderRadius: '14px', padding: '16px 18px', marginBottom: '20px' }}>
            <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--portal-text-secondary)', marginBottom: '10px' }}>O que fazer, passo a passo</div>
            <ol style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {c.passos.map((p, i) => (
                <li key={i} style={{ fontSize: '13.5px', color: 'var(--portal-text)', lineHeight: 1.55 }}>{p}</li>
              ))}
            </ol>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            {onAcao && (
              <button onClick={onAcao} style={{ flex: 1, padding: '13px', borderRadius: '12px', border: 'none', background: c.cor, color: '#fff', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                {c.acao === 'marcar_enviado' && <Send size={16} />}{c.acaoLabel}
              </button>
            )}
            <button onClick={onClose} style={{ padding: '13px 20px', borderRadius: '12px', border: '1px solid var(--portal-border)', background: 'transparent', color: 'var(--portal-text-secondary)', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>Fechar</button>
          </div>
        </div>
      </div>
    </div>
  )
}
