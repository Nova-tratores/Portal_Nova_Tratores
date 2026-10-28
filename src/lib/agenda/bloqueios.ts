// AGENDA PESSOAL — regras puras dos bloqueios ("indisponível"). Testadas em __tests__.
// Fuso -03:00 fixo, como a agenda da sala (reaproveita os helpers de lá).
import { ABRE, FECHA, PASSO_MIN, isoDe, addDias, minutos, localDe, type Reserva } from '@/lib/salas/regras'

export interface Bloqueio { id: string; user_id: string; inicio: string; fim: string; motivo: string | null }
export interface Indisponivel { usuario_id: string; nome: string }

export const DIAS_MAX = 62

type Validacao<T> = { ok: true; campos: T } | { ok: false; erro: string }

/**
 * Pedido de bloqueio. Dois jeitos:
 *  - horário: { dia, inicio:'HH:MM', fim:'HH:MM' } (06:00–22:00, de 15 em 15 min)
 *  - dia inteiro: { dia_inteiro: true, de:'YYYY-MM-DD', ate:'YYYY-MM-DD' } (férias, viagem — até 62 dias)
 */
export function validarBloqueio(body: Record<string, unknown>, agora: { dia: string; hora: string }): Validacao<{ inicio: string; fim: string; motivo: string | null }> {
  const motivo = String(body.motivo ?? '').trim() || null
  if (motivo && motivo.length > 200) return { ok: false, erro: 'Motivo: no máximo 200 caracteres.' }
  const dataOk = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d)
  if (body.dia_inteiro) {
    const de = String(body.de ?? ''), ate = String(body.ate ?? body.de ?? '')
    if (!dataOk(de) || !dataOk(ate)) return { ok: false, erro: 'Escolha o dia (ou o período).' }
    if (ate < de) return { ok: false, erro: 'O fim do período é antes do começo.' }
    if (ate < agora.dia) return { ok: false, erro: 'Esse período já passou.' }
    const dias = (new Date(ate + 'T12:00:00Z').getTime() - new Date(de + 'T12:00:00Z').getTime()) / 86400000 + 1
    if (dias > DIAS_MAX) return { ok: false, erro: `Um bloqueio vai até ${DIAS_MAX} dias.` }
    return { ok: true, campos: { inicio: isoDe(de, '00:00'), fim: isoDe(addDias(ate, 1), '00:00'), motivo } }
  }
  const dia = String(body.dia ?? '')
  const ini = String(body.inicio ?? '').slice(0, 5), fim = String(body.fim ?? '').slice(0, 5)
  if (!dataOk(dia)) return { ok: false, erro: 'Escolha o dia.' }
  if (!/^\d{2}:\d{2}$/.test(ini) || !/^\d{2}:\d{2}$/.test(fim)) return { ok: false, erro: 'Informe o horário de início e de fim.' }
  const a = minutos(ini), b = minutos(fim)
  if (a % PASSO_MIN || b % PASSO_MIN) return { ok: false, erro: `Use horários de ${PASSO_MIN} em ${PASSO_MIN} minutos.` }
  if (b <= a) return { ok: false, erro: 'O fim tem de ser depois do início.' }
  if (a < minutos(ABRE) || b > minutos(FECHA)) return { ok: false, erro: `Horário entre ${ABRE} e ${FECHA} (para o dia todo, marque "Dia inteiro").` }
  if (dia < agora.dia || (dia === agora.dia && fim <= agora.hora)) return { ok: false, erro: 'Esse horário já passou.' }
  return { ok: true, campos: { inicio: isoDe(dia, ini), fim: isoDe(dia, fim), motivo } }
}

/** "Indisponível nesse horário: Larissa e Vinicius." */
export function mensagemIndisponiveis(lista: Indisponivel[]): string {
  const nomes = [...new Set(lista.map((p) => (p.nome || 'alguém').split(' ')[0]))]
  if (!nomes.length) return ''
  const txt = nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`
  return `${nomes.length === 1 ? 'Está indisponível' : 'Estão indisponíveis'} nesse horário: ${txt}`
}

/**
 * Corta um intervalo de vários dias em pedaços por dia (para a grade semanal,
 * que desenha um bloco por coluna). Cada pedaço fica dentro do seu dia.
 */
export function fatiarPorDia(inicio: string, fim: string): { dia: string; inicio: string; fim: string }[] {
  const a = localDe(inicio), b = localDe(fim)
  const out: { dia: string; inicio: string; fim: string }[] = []
  let d = a.dia
  for (let i = 0; i <= DIAS_MAX + 1 && d <= b.dia; i++, d = addDias(d, 1)) {
    const ini = d === a.dia ? inicio : isoDe(d, '00:00')
    const f = d === b.dia ? fim : isoDe(addDias(d, 1), '00:00')
    if (new Date(f).getTime() > new Date(ini).getTime()) out.push({ dia: d, inicio: ini, fim: d === b.dia ? fim : isoDe(d, '23:59') })
  }
  return out
}

/** Bloqueio → blocos no formato da grade (cinza, um por dia). */
export function bloqueioNaGrade(b: Bloqueio, eu: string): Reserva[] {
  return fatiarPorDia(b.inicio, b.fim).map((p, i) => ({
    id: `b:${b.id}:${i}`, sala_id: '', inicio: p.inicio, fim: p.fim, titulo: b.motivo || 'Indisponível', descricao: null,
    responsavel_id: eu, criado_por: eu, reuniao_id: null, status: 'ativa', cor: '#64748b',
  }))
}
