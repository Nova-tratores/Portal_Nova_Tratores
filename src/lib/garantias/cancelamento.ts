// Cancelar garantia por motivo que NÃO é duplicação (teste, aberta por engano,
// outro). Regras puras — a duplicação continua em /cancelar-duplicada.
// O motivo e o status de antes ficam no evento 'cancelada' da timeline
// (sem coluna nova): é de lá que a tela mostra o motivo e o "Desfazer" volta.

export const MOTIVOS_CANCELAMENTO = [
  { id: 'teste', label: 'Criada só para teste' },
  { id: 'engano', label: 'Aberta por engano' },
  { id: 'outro', label: 'Outro motivo' },
] as const;

export type MotivoCancelamento = (typeof MOTIVOS_CANCELAMENTO)[number]['id'];

export const PREFIXO_MOTIVO = 'Cancelada — ';

export function validarCancelamento(motivo: unknown, obs: unknown): { ok: true; motivo: MotivoCancelamento; obs: string } | { ok: false; erro: string } {
  const m = MOTIVOS_CANCELAMENTO.find((x) => x.id === motivo);
  if (!m) return { ok: false, erro: 'Escolha o motivo do cancelamento.' };
  const o = String(obs ?? '').trim().slice(0, 500);
  if (m.id === 'outro' && o.length < 5) return { ok: false, erro: 'Explique o motivo (pelo menos 5 letras).' };
  return { ok: true, motivo: m.id, obs: o };
}

export function detalheCancelamento(motivo: MotivoCancelamento, obs: string): string {
  const label = MOTIVOS_CANCELAMENTO.find((x) => x.id === motivo)?.label || motivo;
  return `${PREFIXO_MOTIVO}${label}${obs ? `: ${obs}` : ''}`;
}

/** último evento de cancelamento (não duplicação) — motivo e status para desfazer */
export function ultimoCancelamento<E extends { tipo: string; detalhe?: string | null; status_anterior?: string | null; created_at?: string | null }>(eventos: E[]): E | null {
  const lista = eventos
    .filter((e) => e.tipo === 'cancelada' && (e.detalhe || '').startsWith(PREFIXO_MOTIVO))
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  return lista[0] || null;
}

const STATUS_VOLTA = ['aberta', 'em_analise', 'bo_tecnico', 'enviada', 'info_pendente', 'aguardando_servico', 'ressarcimento_fabrica', 'aprovada', 'rejeitada'];

/** para qual status volta ao desfazer (sem evento confiável = Em análise) */
export function statusAoDesfazer(statusAnterior: string | null | undefined): string {
  return statusAnterior && STATUS_VOLTA.includes(statusAnterior) ? statusAnterior : 'em_analise';
}
