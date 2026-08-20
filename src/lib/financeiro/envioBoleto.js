import { supabase } from '@/lib/supabase'
import { authHeaders } from '@/lib/auth/client'
import { montarParcelas, valorTotalCard, formatarBRL } from '@/lib/financeiro/parcelas'

// URLs dos boletos anexados no card
export function boletoUrls(card) {
  if (!card) return []
  const urls = []
  if (card.anexo_boleto) card.anexo_boleto.split(',').forEach(u => { const t = u.trim(); if (t) urls.push(t) })
  ;['anexo_boleto_2', 'anexo_boleto_3'].forEach(k => { const t = (card[k] || '').trim(); if (t && !urls.includes(t)) urls.push(t) })
  return urls
}

// URLs das notas fiscais (serviço + peça)
export function nfUrls(card) {
  if (!card) return []
  return [
    ...String(card.anexo_nf_servico || '').split(',').map(u => u.trim()).filter(Boolean),
    ...String(card.anexo_nf_peca || '').split(',').map(u => u.trim()).filter(Boolean),
  ]
}

// Resolve o CNPJ/CPF do cliente: usa o do card; se faltar, tenta pelo nome
export async function resolverCnpj(card) {
  let doc = (card?.cnpj_cliente || '').trim()
  if (!doc && card?.nom_cliente) {
    try {
      const r = await fetch(`/api/ppv/clientes?termo=${encodeURIComponent(card.nom_cliente)}`)
      const arr = r.ok ? await r.json() : []
      const m = arr.find(c => (c.nome || '').toLowerCase() === card.nom_cliente.toLowerCase()) || arr[0]
      doc = (m?.documento || '').trim()
    } catch { /* ignore */ }
  }
  return doc
}

// Tenta enviar o boleto automaticamente conforme a preferência salva em EnvioBoleto.
// Retorna { status, metodo, destinatarios, erro }:
//  - 'enviado'          → email disparado com sucesso
//  - 'erro'             → tentou enviar por email e falhou (erro)
//  - 'whatsapp_manual'  → cliente prefere WhatsApp (não tem envio automático)
//  - 'sem_preferencia'  → cliente sem preferência cadastrada
//  - 'sem_arquivo'      → não há boleto/NF anexados ainda
export async function tentarEnvioAutomaticoBoleto(card, remetente) {
  const doc = await resolverCnpj(card)
  if (!doc) return { status: 'sem_preferencia' }

  const { data: pref } = await supabase.from('EnvioBoleto').select('*').eq('cnpj_cpf', doc).maybeSingle()
  if (!pref || !pref.metodo) return { status: 'sem_preferencia' }

  if (pref.metodo === 'whatsapp') return { status: 'whatsapp_manual', metodo: 'whatsapp' }

  // método = email
  const destinatarios = String(pref.email || '').split(/[,;\s]+/).map(e => e.trim()).filter(Boolean)
  if (!destinatarios.length) return { status: 'sem_preferencia', metodo: 'email' }

  const bUrls = boletoUrls(card)
  const nUrls = nfUrls(card)
  if (!bUrls.length && !nUrls.length) return { status: 'sem_arquivo', metodo: 'email', destinatarios }

  try {
    const res = await fetch('/api/financeiro/enviar-boleto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({
        urls: bUrls,
        nfUrls: nUrls,
        destinatarios,
        cliente: card.nom_cliente || '',
        nf: [card.num_nf_servico && `S ${card.num_nf_servico}`, card.num_nf_peca && `P ${card.num_nf_peca}`].filter(Boolean).join(' / '),
        valor: valorTotalCard(card) != null ? formatarBRL(valorTotalCard(card)) : '',
        vencimento: card.vencimento_boleto || '',
        parcelas: montarParcelas(card),
        remetente: remetente || '',
      }),
    })
    const out = await res.json().catch(() => ({}))
    if (!res.ok) return { status: 'erro', metodo: 'email', destinatarios, erro: out.error || 'Falha no envio', semConfig: !!out.semConfig }
    return { status: 'enviado', metodo: 'email', destinatarios }
  } catch (e) {
    return { status: 'erro', metodo: 'email', destinatarios, erro: e.message }
  }
}

// Notifica um setor específico (financeiro | posvendas). Sem userId, inclui também
// quem disparou (usado pra avisar o financeiro do envio automático).
async function notificarSetor({ alvo, titulo, descricao, link, userId }) {
  try {
    await fetch('/api/financeiro/notificar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titulo, descricao: descricao || null, link: link || null, alvo, userId }),
    })
  } catch { /* ignore */ }
}

// Dispara o envio automático conforme a preferência e trata o resultado:
//  - SUCESSO (email): marca o card como "enviado ao cliente" (status aguardando_vencimento),
//    avisa o Pós-Vendas (deu certo) e o Financeiro (deu certo).
//  - ERRO: NÃO altera o status; avisa só o Pós-Vendas (precisa enviar manual).
//  - WhatsApp: NÃO altera o status; avisa o Pós-Vendas (envio manual).
// `card` deve já conter o boleto anexado (anexo_boleto).
export async function autoEnviarENotificar({ card, remetente, userId, audit }) {
  const r = await tentarEnvioAutomaticoBoleto(card, remetente)
  const cliente = card?.nom_cliente || 'cliente'
  const link = '/financeiro/kanban'

  if (r.status === 'enviado') {
    // marca como enviado ao cliente (mesmo status do botão manual)
    try {
      await supabase.from('Chamado_NF')
        .update({ status: 'aguardando_vencimento', tarefa: 'Aguardando Cliente', status_changed_at: new Date().toISOString() })
        .eq('id', card.id)
    } catch { /* ignore */ }
    const emails = r.destinatarios.join(', ')
    notificarSetor({ alvo: 'posvendas', titulo: `Boleto enviado automaticamente — ${cliente}`, descricao: `Email: ${emails}. Card movido para Aguardando Cliente.`, link })
    notificarSetor({ alvo: 'financeiro', titulo: `Boleto enviado automaticamente — ${cliente}`, descricao: `Email: ${emails}.`, link }) // sem userId → inclui quem gerou
    audit?.({ acao: 'enviar_email', detalhes: { auto: true, cliente, destinatarios: r.destinatarios, status: 'aguardando_vencimento' } })
  } else if (r.status === 'erro') {
    // semConfig = o PRÓPRIO usuário precisa configurar o e-mail dele — não é falha
    // do fluxo, então não espalha notificação pro setor.
    if (!r.semConfig) notificarSetor({ alvo: 'posvendas', titulo: `Falha no envio automático do boleto — ${cliente}`, descricao: `${r.erro || 'Erro desconhecido'}. Envie manualmente.`, link })
    audit?.({ acao: 'erro_envio', detalhes: { auto: true, cliente, erro: r.erro } })
  } else if (r.status === 'whatsapp_manual') {
    notificarSetor({ alvo: 'posvendas', titulo: `Boleto pronto — enviar por WhatsApp — ${cliente}`, descricao: 'Cliente prefere WhatsApp (envio manual).', link })
  }
  // sem_preferencia / sem_arquivo → não notifica (fluxo manual normal)
  return r
}
