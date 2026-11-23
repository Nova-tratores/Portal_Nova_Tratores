// Vigia de atividade suspeita (11/2026). Regras PURAS: recebem o audit_log e o uso da API
// já lidos e devolvem os alertas. Só AVISA (decisão do usuário: começar sem travar ninguém).
//
// Três sinais:
//  1. Permissão mudou   — todo registro do sistema 'permissoes' feito por uma pessoa
//                          (nível, Diretor, categoria, módulos, conjuntos). Cada um vira um aviso.
//  2. Exportação em volume — muitas exportações/downloads da mesma pessoa em pouco tempo,
//                          um relatório muito grande de uma vez, ou muitas chamadas de
//                          download num dia (portal_uso_api).
//  3. Ação sensível em lote — a mesma ação de apagar/cancelar/reverter/estornar/liberar
//                          repetida muitas vezes seguidas pela mesma pessoa.
//
// Cada alerta tem uma `chave` estável: o servidor grava com UNIQUE(chave), então rodar de
// novo (a cada 15 min, olhando as últimas 26 h) não repete aviso.

/** Quem recebe o aviso (decisão do usuário, 23/11/2026: só o Henri — financeiro@novatratores.com.br).
 *  Vê a aba Alertas: esses + os Devs. */
export const DESTINATARIOS_VIGIA = [{ id: '8d43db92-0943-4c88-9a0b-b7f52a11ff55', nome: 'Henri Irneh' }];
export const podeVerAlertas = (u: { userId: string; isDev?: boolean }) =>
  !!u.isDev || DESTINATARIOS_VIGIA.some((d) => d.id === u.userId);

export type Evento = {
  id: number;
  user_id: string | null;
  user_nome: string | null;
  sistema: string | null;
  acao: string | null;
  entidade?: string | null;
  entidade_id?: string | null;
  entidade_label?: string | null;
  detalhes?: Record<string, unknown> | null;
  created_at: string;
};

export type UsoApi = { user_id: string; rota: string; dia: string; chamadas: number };

export type Gravidade = 'alta' | 'media';
export type TipoAlerta = 'permissao' | 'exportacao' | 'lote';

export type Alerta = {
  chave: string;
  tipo: TipoAlerta;
  gravidade: Gravidade;
  user_id: string | null;
  user_nome: string;
  titulo: string;
  descricao: string;
  quando: string;            // ISO do 1º evento
  detalhes: Record<string, unknown>;
};

/** Limites (ajustar aqui depois de ver as primeiras semanas). */
export const LIMITES = {
  exportJanelaMin: 60,       // exportações a até 60 min uma da outra contam juntas
  exportQtd: 10,             // 10 ou mais nessa sequência = aviso
  exportLinhas: 5000,        // um relatório com 5.000+ linhas/notas de uma vez = aviso
  downloadsDia: 150,         // chamadas de download/arquivo num dia, por pessoa
  loteJanelaMin: 30,         // ações sensíveis a até 30 min uma da outra contam juntas
  loteQtd: 15,               // 15 ou mais da mesma ação nessa sequência = aviso
};

const ZERO = '00000000-0000-0000-0000-000000000000';
/** Registro feito por robô/sistema (sem pessoa por trás) não é suspeito. */
export function ehSistema(e: Pick<Evento, 'user_id' | 'user_nome'>): boolean {
  if (!e.user_id || e.user_id === ZERO) return true;
  return /^(rob[oô]|sistema|agendador|confer[eê]ncia de permiss|cron|vigia|tratorilson)/i.test(String(e.user_nome || '').trim());
}

const ACOES_PERMISSAO = /^(permissoes_pessoa|permissoes_conjunto|nivel_alterado|permissoes_limpar_extras|papel_add|papel_remover)$/;
/** Exportar, baixar, imprimir, relatório, CSV/PDF/XML, demonstrativo. `acesso` nunca conta. */
export const RE_EXPORTACAO = /(export|csv|download|baixar_arquivo|baixou|imprimir|relatorio|demonstrativo|pdf|xml|planilha)/i;
/** Ação que apaga, desfaz ou libera algo. "faturar", "editar" e "mover_status" ficam de fora (uso normal em volume). */
export const RE_SENSIVEL = /(excluir|apagar|delet|remover|cancel|revert|estorn|desvincul|liberar|arquivar|descartar|zerar|ajuste-estoque|limpar)/i;
/** Rotas da API que entregam arquivo (contadas em portal_uso_api; rota já normalizada com [id]). */
export const RE_ROTA_DOWNLOAD = /(\/notas\/\[id\]\/arquivo|documentos\/arquivo|\/print|\/pdf|\/csv|\/xml|\/danfe|\/download|\/export)/i;
/** Rotas que batem no padrão mas não são download de documento (imagens da assinatura do e-mail). */
const RE_ROTA_NAO_DOWNLOAD = /(config-envio|assinatura|avatar|foto)/i;

const nome = (e: Pick<Evento, 'user_nome' | 'user_id'>) => String(e.user_nome || '').trim() || String(e.user_id || 'Sem nome');
const ms = (iso: string) => new Date(iso).getTime();
const hora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Sequências: eventos ordenados no tempo, cada um a até `janelaMin` do anterior. */
export function sequencias<T extends { created_at: string }>(lista: T[], janelaMin: number): T[][] {
  const ord = [...lista].sort((a, b) => ms(a.created_at) - ms(b.created_at));
  const out: T[][] = [];
  for (const e of ord) {
    const atual = out[out.length - 1];
    if (atual && ms(e.created_at) - ms(atual[atual.length - 1].created_at) <= janelaMin * 60000) atual.push(e);
    else out.push([e]);
  }
  return out;
}

function agrupar<T>(lista: T[], chave: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of lista) { const k = chave(x); const l = m.get(k); if (l) l.push(x); else m.set(k, [x]); }
  return m;
}

// ---------------------------------------------------------------- 1. permissão

function textoPermissao(e: Evento): { descricao: string; alta: boolean } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- detalhes vêm de rotas diferentes (formatos variados)
  const d = (e.detalhes || {}) as Record<string, any>;
  const alvo = String(e.entidade_label || '').trim() || 'outra pessoa';
  const partes: string[] = [];
  let alta = false;
  if (d.nivel?.para) {
    partes.push(`nível de ${d.nivel.de} para ${d.nivel.para}`);
    if (d.nivel.para === 'admin' || d.nivel.para === 'dev') alta = true;
  }
  if (d.diretor) partes.push(d.diretor.para ? 'virou Diretor' : 'deixou de ser Diretor');
  if (d.categoria) partes.push(`categoria ${d.categoria.de || '—'} → ${d.categoria.para || '—'}`);
  const ganha: string[] = Array.isArray(d.ganha) ? d.ganha : Array.isArray(d.modulos?.ganha) ? d.modulos.ganha : [];
  const perde: string[] = Array.isArray(d.perde) ? d.perde : Array.isArray(d.modulos?.perde) ? d.modulos.perde : [];
  if (ganha.length) partes.push(`ganhou ${ganha.length > 4 ? `${ganha.length} acessos` : ganha.join(', ')}`);
  if (perde.length) partes.push(`perdeu ${perde.length > 4 ? `${perde.length} acessos` : perde.join(', ')}`);
  if (!partes.length) partes.push(String(e.acao || 'mudança').replace(/_/g, ' '));
  const propria = !!e.user_id && e.entidade_id === e.user_id;
  if (propria) alta = true;
  const para = propria ? 'nos próprios acessos' : `de ${alvo}`;
  return { descricao: `Mudou permissões ${para}: ${partes.join('; ')}.`, alta };
}

export function alertasPermissao(eventos: Evento[]): Alerta[] {
  return eventos
    .filter((e) => e.sistema === 'permissoes' && ACOES_PERMISSAO.test(String(e.acao || '')) && !ehSistema(e))
    .map((e) => {
      const { descricao, alta } = textoPermissao(e);
      return {
        chave: `perm:${e.id}`, tipo: 'permissao', gravidade: alta ? 'alta' : 'media',
        user_id: e.user_id, user_nome: nome(e),
        titulo: `Permissão alterada por ${nome(e)}`, descricao: `${descricao} (${hora(e.created_at)})`,
        quando: e.created_at, detalhes: { evento_id: e.id, acao: e.acao, alvo: e.entidade_id, ...(e.detalhes || {}) },
      } satisfies Alerta;
    });
}

// ---------------------------------------------------------------- 2. exportação

export function ehExportacao(e: Evento): boolean {
  const acao = String(e.acao || '');
  if (!acao || acao === 'acesso') return false;
  return RE_EXPORTACAO.test(acao);
}

function linhasDoEvento(e: Evento): number {
  const d = (e.detalhes || {}) as Record<string, unknown>;
  // só contagens de linhas: 'total' costuma ser valor em R$ (demonstrativo do cliente)
  const nums = ['notas', 'linhas'].map((k) => Number(d[k])).filter((n) => Number.isFinite(n) && Number.isInteger(n));
  return nums.length ? Math.max(...nums) : 0;
}

export function alertasExportacao(eventos: Evento[], uso: UsoApi[] = []): Alerta[] {
  const out: Alerta[] = [];
  const exp = eventos.filter((e) => ehExportacao(e) && !ehSistema(e));
  // a) um relatório muito grande de uma vez
  for (const e of exp) {
    const n = linhasDoEvento(e);
    if (n >= LIMITES.exportLinhas) {
      out.push({
        chave: `exp-grande:${e.id}`, tipo: 'exportacao', gravidade: 'media', user_id: e.user_id, user_nome: nome(e),
        titulo: `Exportação grande por ${nome(e)}`,
        descricao: `${e.entidade_label || e.acao}: ${n.toLocaleString('pt-BR')} linhas de uma vez (${hora(e.created_at)}).`,
        quando: e.created_at, detalhes: { evento_id: e.id, acao: e.acao, sistema: e.sistema, linhas: n },
      });
    }
  }
  // b) muitas exportações seguidas
  for (const [, lista] of agrupar(exp, (e) => String(e.user_id))) {
    for (const seq of sequencias(lista, LIMITES.exportJanelaMin)) {
      if (seq.length < LIMITES.exportQtd) continue;
      const p = seq[0], u = seq[seq.length - 1];
      const tipos = [...agrupar(seq, (e) => `${e.sistema} · ${e.acao}`)].map(([k, l]) => `${k} (${l.length})`).slice(0, 5);
      out.push({
        chave: `exp-seq:${p.user_id}:${p.id}`, tipo: 'exportacao', gravidade: seq.length >= LIMITES.exportQtd * 3 ? 'alta' : 'media',
        user_id: p.user_id, user_nome: nome(p),
        titulo: `${seq.length} exportações seguidas por ${nome(p)}`,
        descricao: `Entre ${hora(p.created_at)} e ${hora(u.created_at)}: ${tipos.join(', ')}.`,
        quando: p.created_at, detalhes: { qtd: seq.length, de: p.created_at, ate: u.created_at, tipos, eventos: seq.map((e) => e.id).slice(0, 50) },
      });
    }
  }
  // c) downloads de arquivo num dia (uso da API)
  const dl = uso.filter((r) => RE_ROTA_DOWNLOAD.test(r.rota) && !RE_ROTA_NAO_DOWNLOAD.test(r.rota));
  for (const [k, lista] of agrupar(dl, (r) => `${r.user_id}|${r.dia}`)) {
    const total = lista.reduce((s, r) => s + (Number(r.chamadas) || 0), 0);
    if (total < LIMITES.downloadsDia) continue;
    const [user_id, dia] = k.split('|');
    const rotas = [...lista].sort((a, b) => b.chamadas - a.chamadas).slice(0, 4).map((r) => `${r.rota} (${r.chamadas})`);
    out.push({
      chave: `dl:${user_id}:${dia}`, tipo: 'exportacao', gravidade: total >= LIMITES.downloadsDia * 3 ? 'alta' : 'media',
      user_id, user_nome: user_id, // o servidor troca pelo nome
      titulo: `${total} downloads de arquivo num dia`,
      descricao: `Em ${dia.split('-').reverse().join('/')}: ${rotas.join(', ')}.`,
      quando: `${dia}T12:00:00-03:00`, detalhes: { dia, total, rotas },
    });
  }
  return out;
}

// ---------------------------------------------------------------- 3. lote sensível

export function ehSensivel(e: Evento): boolean {
  const acao = String(e.acao || '');
  if (!acao || acao === 'acesso' || ehExportacao(e)) return false;
  if (e.sistema === 'permissoes') return false; // já é o sinal 1
  return RE_SENSIVEL.test(acao);
}

export function alertasLote(eventos: Evento[]): Alerta[] {
  const out: Alerta[] = [];
  const sens = eventos.filter((e) => ehSensivel(e) && !ehSistema(e));
  for (const [, lista] of agrupar(sens, (e) => `${e.user_id}|${e.sistema}|${e.acao}`)) {
    for (const seq of sequencias(lista, LIMITES.loteJanelaMin)) {
      if (seq.length < LIMITES.loteQtd) continue;
      const p = seq[0], u = seq[seq.length - 1];
      const exemplos = seq.map((e) => e.entidade_label || e.entidade_id).filter(Boolean).slice(0, 5) as string[];
      out.push({
        chave: `lote:${p.user_id}:${p.sistema}:${p.acao}:${p.id}`, tipo: 'lote',
        gravidade: seq.length >= LIMITES.loteQtd * 3 ? 'alta' : 'media',
        user_id: p.user_id, user_nome: nome(p),
        titulo: `${seq.length}× "${String(p.acao).replace(/[_-]/g, ' ')}" seguidos por ${nome(p)}`,
        descricao: `${p.sistema}, entre ${hora(p.created_at)} e ${hora(u.created_at)}${exemplos.length ? `. Ex.: ${exemplos.join(', ')}` : ''}.`,
        quando: p.created_at,
        detalhes: { sistema: p.sistema, acao: p.acao, qtd: seq.length, de: p.created_at, ate: u.created_at, eventos: seq.map((e) => e.id).slice(0, 50) },
      });
    }
  }
  return out;
}

/** Todos os sinais de uma vez, do mais grave para o menos. */
export function detectar(eventos: Evento[], uso: UsoApi[] = []): Alerta[] {
  const todos = [...alertasPermissao(eventos), ...alertasExportacao(eventos, uso), ...alertasLote(eventos)];
  const vistos = new Set<string>();
  return todos
    .filter((a) => (vistos.has(a.chave) ? false : (vistos.add(a.chave), true)))
    .sort((a, b) => (a.gravidade === b.gravidade ? ms(a.quando) - ms(b.quando) : a.gravidade === 'alta' ? -1 : 1));
}
