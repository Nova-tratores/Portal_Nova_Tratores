// Mensagens do botão "Buscar no Omie" da pasta do cliente. PURO (sem banco):
// traduz o erro técnico do Omie/rede para uma frase que a pessoa entende e
// diz o que fazer. Usado pela rota /api/clientes/buscar-nota.

export interface FalhaNota {
  ok: false
  /** frase principal, curta: o que aconteceu */
  erro: string
  /** o que a pessoa pode fazer agora */
  dica: string
  /** texto técnico original (mostrado pequeno, para o T.I.) */
  tecnico?: string
}

export function falha(erro: string, dica: string, tecnico?: string): FalhaNota {
  return { ok: false, erro, dica, ...(tecnico ? { tecnico } : {}) }
}

/** Erro lançado pela chamada ao Omie (faultstring) ou pela rede → mensagem clara. */
export function explicarErroOmie(msg: string, oQue: 'NFS-e' | 'NF-e'): FalhaNota {
  const m = String(msg || '').trim()
  const t = m.toLowerCase()
  if (/consumo redundante|redundant/.test(t)) {
    return falha('O Omie bloqueou por pedido repetido.', 'Espere 1 minuto e clique em "Buscar no Omie" de novo.', m)
  }
  if (/limite|too many|429|bloquead/.test(t)) {
    return falha('O Omie está com muitas consultas agora (limite atingido).', 'Espere alguns minutos e tente de novo.', m)
  }
  if (/n[ãa]o (foi )?(encontrad|cadastrad|existe)|not found|inexistente/.test(t)) {
    return falha(`O Omie não encontrou a ${oQue} deste documento.`, `Confira no Omie se a ${oQue} foi emitida. Se foi emitida por fora, anexe o PDF à mão.`, m)
  }
  if (/fetch failed|econn|enotfound|etimedout|timeout|network|socket|503|502|504/.test(t)) {
    return falha('Não foi possível falar com o Omie (fora do ar ou sem internet no servidor).', 'Tente de novo em alguns minutos.', m)
  }
  if (/app_key|app_secret|autentica|unauthorized|401|403/.test(t)) {
    return falha('O portal não conseguiu entrar no Omie (chave de acesso).', 'Avise o T.I. — a chave do Omie no servidor pode ter mudado.', m)
  }
  return falha(`O Omie devolveu um erro ao buscar a ${oQue}.`, 'Tente de novo. Se continuar, avise o T.I. com o texto técnico abaixo.', m)
}

/** NF-e de peças sem DANFE: rejeitada/denegada na SEFAZ ou ainda processando. */
export function explicarNfeSemDanfe(status: string, motivo: string): FalhaNota {
  const s = String(status || '').trim()
  const mot = String(motivo || '').trim()
  const tecnico = [s && `status ${s}`, mot].filter(Boolean).join(' — ') || undefined
  if (/rejeit|denega|cancel/i.test(`${s} ${mot}`)) {
    return falha(`A NF-e foi ${/denega/i.test(`${s} ${mot}`) ? 'denegada' : /cancel/i.test(`${s} ${mot}`) ? 'cancelada' : 'rejeitada'} pela SEFAZ${mot ? `: ${mot}` : '.'}`,
      'Corrija e reemita a nota no Omie. Se ela foi emitida por fora, anexe o PDF à mão.', tecnico)
  }
  return falha('A NF-e ainda não tem o PDF (DANFE) no Omie.', 'A SEFAZ pode estar processando. Tente de novo em alguns minutos.', tecnico)
}
