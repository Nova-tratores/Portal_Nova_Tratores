// Organograma — telas que cada tarefa pede × acesso real de quem faz a tarefa. Pura (client-safe).
// É só comparação: nada aqui muda permissão.
import { permite } from '@/lib/permissoes/explicitas';
import type { TarefaOrg } from './tarefas';

export type NivelTela = 'ver' | 'editar';
export interface TelaMarcada { tela: string; nivel: NivelTela }
/** separaEditar = o módulo tem a ação "editar" (POS, PPV…); nos outros, quem abre a tela já mexe. */
export interface TelaOpcao { id: string; nome: string; separaEditar: boolean }
export interface AcessoPessoa { perms: string[]; isAdmin: boolean; isDev: boolean }

export type NivelReal = 'nenhum' | 'ver' | 'editar' | 'acessa';
export type Situacao = 'ok' | 'falta' | 'falta_editar' | 'a_mais' | 'nao_separa' | 'sem_login';

export const NOME_NIVEL_REAL: Record<NivelReal, string> = { nenhum: 'sem acesso', ver: 'só ver', editar: 'editar', acessa: 'abre a tela' };
export const NOME_SITUACAO: Record<Situacao, string> = {
  ok: 'De acordo', falta: 'Falta acesso', falta_editar: 'Falta poder editar', a_mais: 'Pode editar além do pedido',
  nao_separa: 'Tela não separa ver de editar', sem_login: 'Sem login no portal',
};

export function nivelReal(a: AcessoPessoa, tela: TelaOpcao): NivelReal {
  const [mod, ...resto] = tela.id.split(':');
  const acao = resto.join(':') || undefined;
  if (!permite(a.perms, a.isAdmin, mod, acao, a.isDev)) return 'nenhum';
  if (!tela.separaEditar) return 'acessa';
  return permite(a.perms, a.isAdmin, mod, 'editar', a.isDev) ? 'editar' : 'ver';
}

export function situacao(pede: NivelTela, tem: NivelReal): Situacao {
  if (tem === 'nenhum') return 'falta';
  if (tem === 'acessa') return pede === 'ver' ? 'nao_separa' : 'ok';
  if (pede === 'editar') return tem === 'editar' ? 'ok' : 'falta_editar';
  return tem === 'editar' ? 'a_mais' : 'ok';
}

export interface LinhaAcesso {
  pessoa: string; tela: string; pede: NivelTela; tarefas: string[]; tem: NivelReal | null; situacao: Situacao;
}

/** Uma linha por pessoa × tela. Se duas tarefas pedem níveis diferentes, vale o maior. */
export function compararAcessos(
  porPessoa: Map<string, TarefaOrg[]>, telas: TelaOpcao[], acessos: Record<string, AcessoPessoa>,
): LinhaAcesso[] {
  const porId = new Map(telas.map((t) => [t.id, t]));
  const out: LinhaAcesso[] = [];
  for (const [pessoa, tarefas] of porPessoa) {
    const pedidos = new Map<string, { pede: NivelTela; tarefas: string[] }>();
    for (const t of tarefas) for (const m of t.telas || []) {
      const p = pedidos.get(m.tela) || { pede: 'ver' as NivelTela, tarefas: [] };
      if (m.nivel === 'editar') p.pede = 'editar';
      p.tarefas.push(t.acao);
      pedidos.set(m.tela, p);
    }
    for (const [tela, p] of pedidos) {
      const def = porId.get(tela);
      const a = acessos[pessoa];
      if (!def || !a) { out.push({ pessoa, tela, ...p, tem: null, situacao: 'sem_login' }); continue; }
      const tem = nivelReal(a, def);
      out.push({ pessoa, tela, ...p, tem, situacao: situacao(p.pede, tem) });
    }
  }
  return out;
}
