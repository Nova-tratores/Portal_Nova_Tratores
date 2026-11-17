// Grupos de requisições: quem pode concluir/cancelar e o aviso de grupo parado (José, 17/11/2026).
//  - "só quem criou finaliza … ou Dev também deve conseguir concluir"
//  - "se ficar 30 dias sem atualização informa o usuário sobre o grupo"
// Regras puras (testadas); o robô das requisições (lembretes-server.ts) avisa no sino de quem criou.

export type HistGrupo = { acao: string; usuario: string; em: string; detalhe?: string; req_id?: number };
export type GrupoParado = { id: number; nome: string; status: string; criado_por?: string | null; created_at?: string | null; historico?: HistGrupo[] | null };

export const DIAS_GRUPO_PARADO = 30;
/** evento que o robô grava ao avisar; não conta como "atualização" do grupo */
export const ACAO_AVISO_PARADO = 'aviso: grupo parado';

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** quem criou o grupo (nome ou e-mail gravado em criado_por) é a mesma pessoa do login? */
export function ehQuemCriou(criadoPor: string | null | undefined, eu: { nome?: string | null; email?: string | null }): boolean {
  const c = semAcento(String(criadoPor || ''));
  if (!c) return false;
  return [eu.nome, eu.email].some((x) => !!x && semAcento(String(x)) === c);
}

/** concluir/cancelar: quem criou ou Dev. Grupo antigo sem criador registrado: qualquer um (não trava para sempre). */
export function podeFinalizarGrupo(criadoPor: string | null | undefined, eu: { nome?: string | null; email?: string | null; isDev?: boolean }): boolean {
  if (eu.isDev) return true;
  if (!String(criadoPor || '').trim()) return true;
  return ehQuemCriou(criadoPor, eu);
}

/** última atividade real do grupo (criação ou qualquer evento que não seja o aviso do robô) */
export function ultimaAtividade(g: GrupoParado): string | null {
  const datas = (g.historico || []).filter((h) => h.acao !== ACAO_AVISO_PARADO).map((h) => h.em).filter(Boolean);
  if (g.created_at) datas.push(g.created_at);
  return datas.sort().pop() || null;
}

/** grupo aberto há 30+ dias sem atualização e sem aviso nos últimos 30 dias → avisar quem criou */
export function precisaAvisarParado(g: GrupoParado, agora: Date, dias = DIAS_GRUPO_PARADO): { avisar: boolean; diasParado: number } {
  if (g.status !== 'aberto') return { avisar: false, diasParado: 0 };
  const ult = ultimaAtividade(g);
  if (!ult) return { avisar: false, diasParado: 0 };
  const diasParado = Math.floor((agora.getTime() - new Date(ult).getTime()) / 86400000);
  if (diasParado < dias) return { avisar: false, diasParado };
  const ultAviso = (g.historico || []).filter((h) => h.acao === ACAO_AVISO_PARADO).map((h) => h.em).sort().pop();
  if (ultAviso && agora.getTime() - new Date(ultAviso).getTime() < dias * 86400000) return { avisar: false, diasParado };
  return { avisar: true, diasParado };
}
