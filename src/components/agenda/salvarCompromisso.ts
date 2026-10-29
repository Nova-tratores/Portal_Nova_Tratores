'use client'
// AGENDA — gravar um compromisso (usado pela /agenda e pelo "+" da Minha semana na dashboard).
// Tipo "Reunião" num compromisso NOVO cria a reunião de verdade (módulo Reuniões: pauta, ata, ações),
// que já aparece na agenda pela fonte das reuniões — não grava compromisso em dobro (José, 29/10/2026).
import { authHeaders } from '@/lib/auth/client'
import type { RascunhoEvento } from './Janelas'
import { contarUsoTipo } from './TipoIcone'

async function chamar(url: string, metodo: string, corpo: unknown) {
  const res = await fetch(url, {
    method: metodo, cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(corpo),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j.error || `Falha (${res.status})`)
  return j
}

export const corpoEvento = (r: RascunhoEvento) => ({
  titulo: r.titulo, descricao: r.descricao, local: r.local, diaInteiro: r.diaInteiro, diaIni: r.diaIni, horaIni: r.horaIni,
  diaFim: r.diaFim, horaFim: r.horaFim, participantes: r.participantes, cor: r.cor, tipo: r.tipo,
  recorrencia: r.freq ? { freq: r.freq, ate: r.ate || null } : null,
})

async function criarComoReuniao(r: RascunhoEvento, eu: string) {
  if (r.diaInteiro) throw new Error('Reunião precisa de horário: desmarque "Dia inteiro".')
  if (r.freq) throw new Error('Para reunião que se repete, crie uma Série em Reuniões.')
  if (r.diaFim !== r.diaIni) throw new Error('A reunião começa e termina no mesmo dia.')
  const [h1, m1] = r.horaIni.split(':').map(Number), [h2, m2] = r.horaFim.split(':').map(Number)
  const duracao = h2 * 60 + m2 - (h1 * 60 + m1)
  if (duracao <= 0) throw new Error('O fim tem de ser depois do início.')
  const descricao = [r.descricao.trim(), r.local.trim() ? `Local: ${r.local.trim()}` : ''].filter(Boolean).join('\n\n')
  await chamar('/api/reunioes', 'POST', {
    dia: r.diaIni, hora: r.horaIni, titulo: r.titulo.trim(), descricao: descricao || null,
    participantes: r.participantes.filter((p) => p !== eu), duracao_min: duracao,
  })
}

/** Grava e devolve a frase do aviso. Lança Error com a mensagem para mostrar no formulário. */
export async function salvarCompromisso(r: RascunhoEvento, eu: string): Promise<string> {
  if (!r.id && r.tipo === 'reuniao') {
    await criarComoReuniao(r, eu)
    contarUsoTipo(r.tipo)
    return 'Reunião criada em Reuniões e na agenda'
  }
  if (r.id) await chamar(`/api/agenda/eventos/${r.id}`, 'PATCH', { acao: 'editar', ...corpoEvento(r) })
  else { await chamar('/api/agenda/eventos', 'POST', corpoEvento(r)); contarUsoTipo(r.tipo) }
  window.dispatchEvent(new Event('central-trabalho-mudou'))
  return r.id ? 'Compromisso atualizado' : r.participantes.length ? 'Compromisso salvo e convites enviados' : 'Compromisso salvo'
}
