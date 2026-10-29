// =============================================================================
// Catálogo das TELAS (permissões v2) e das ROTAS do portal.
//
// Fonte que o script scripts/permissoes-v2-sync.ts grava em perm_telas e
// perm_tela_rotas. O id da tela é a chave que o código já usa
// ('pos', 'pos:faturar', 'financeiro:notas'): a hierarquia vem do ':'.
//
// Puro (sem banco) — usado pelo sync, pelos testes e pelo painel "quem tem acesso".
// =============================================================================
import { PAGINAS_AJUSTES } from '@/app/(portal)/ajustes/paginas';
import { PAGINAS_ESTOQUE } from '@/app/(portal)/estoque/paginas';
import { PAGINAS_FROTA } from '@/app/(portal)/frota/paginas';
import { PAGINAS_MARKETING } from '@/app/(portal)/marketing/paginas';
import { PAGINAS_IV } from '@/app/(portal)/inteligencia-vendas/paginas';
import { ACOES_POR_MODULO, grupoDoModulo } from './catalogo';
import { ACOES_EXPLICITAS, ACOES_SO_DEV } from './explicitas';

export type Nivel = 'ver' | 'editar' | 'gerir';
export const NIVEIS: Nivel[] = ['ver', 'editar', 'gerir'];
export const nivelNum = (n: string): number => (n === 'ver' ? 1 : n === 'editar' ? 2 : n === 'gerir' ? 3 : 0);

export interface TelaDef {
  id: string;
  nome: string;
  categoria_menu: string;
  explicita: boolean;
  /** Fiscal de Dev: Dev tem sempre; admin comum só com a tela concedida. */
  so_dev: boolean;
}

export type AcessoRota = 'tela' | 'livre' | 'admin' | 'dev';
export interface RotaDef {
  padrao: string;
  acesso: AcessoRota;
  tela_id?: string;
  /** A página também abre com qualquer uma destas telas (OU). */
  alternativas?: string[];
  nota?: string;
}

/** Módulos (telas-raiz). Mesma lista do Admin, mais lousa e cronograma, que faltavam lá. */
export const MODULOS_TELAS: { id: string; nome: string }[] = [
  { id: 'ajustes', nome: 'Ajustes' },
  { id: 'atividades', nome: 'Atividades (logs)' },
  { id: 'planta', nome: 'Planta Viva' },
  { id: 'avisos', nome: 'Avisos' },
  { id: 'back-nova', nome: 'Back Nova (externo)' },
  { id: 'cameras', nome: 'Vigia das Câmeras' },
  { id: 'clientes', nome: 'Pasta Clientes' },
  { id: 'conhecimento', nome: 'Base de conhecimento (escrever/aprovar)' },
  { id: 'consulta-estoque', nome: 'Visual Estoque' },
  { id: 'cronograma', nome: 'Cronograma (Central de Trabalho)' },
  { id: 'dashboard-agro', nome: 'Dashboard Agro' },
  { id: 'dre', nome: 'DRE Financeiro' },
  { id: 'estoque', nome: 'Consulta Estoque' },
  { id: 'feedbacks', nome: 'Feedbacks & CRM' },
  { id: 'financeiro', nome: 'Financeiro' },
  { id: 'fotos-tecnicos', nome: 'Fotos Técnicos' },
  { id: 'frota', nome: 'Frota' },
  { id: 'garantias', nome: 'Garantias' },
  { id: 'gestao-vendas', nome: 'Gestão de Vendas' },
  { id: 'lead', nome: 'Captura de Leads (celular)' },
  { id: 'lousa', nome: 'Lousa Virtual' },
  { id: 'mapa', nome: 'Mapeamento Técnico' },
  { id: 'marketing', nome: 'Marketing & Eventos' },
  { id: 'inteligencia-vendas', nome: 'Inteligência de Vendas' },
  { id: 'mecanicos', nome: 'Gestão Pós Vendas' },
  { id: 'opa', nome: 'Opa (Ocorrências)' },
  { id: 'opa-pecas', nome: 'Opa Peças — editar peças S/Estoque' },
  { id: 'orcamentos', nome: 'Orçamentos' },
  { id: 'painel-mecanicos', nome: 'Painel Mecânicos' },
  { id: 'painel-omie', nome: 'Painel Omie (relatórios)' },
  { id: 'pendencias', nome: 'Pendências da frota' },
  { id: 'pops', nome: 'POPs (procedimentos)' },
  { id: 'pos', nome: 'Pós-Vendas (OS)' },
  { id: 'ppv', nome: 'Peças (PPV)' },
  { id: 'propostas', nome: 'Proposta Comercial' },
  { id: 'requisicoes', nome: 'Requisições' },
  { id: 'revisoes', nome: 'Controle de Revisões' },
  { id: 'sat', nome: 'SAT Digital' },
  { id: 'supervisor-vendas', nome: 'Supervisor Vendas' },
  { id: 'tarefas', nome: 'Tarefas (Central de Trabalho)' },
  { id: 'tickets', nome: 'Central de Trabalho (Tickets)' },
  { id: 'tratorilson', nome: 'Tratorilson (Chat IA)' },
  { id: 'vendas-modelo', nome: 'Vendas por Modelo' },
  { id: 'war-room', nome: 'War Room' },
];

const CHAVES_FORA_DO_ADMIN = [
  { id: 'ajustes:recebimentos', nome: 'Ajustes — Recebimentos (chave antiga; ainda abre /estoque/recebimentos)' },
];

export function catalogoTelas(): TelaDef[] {
  const out = new Map<string, TelaDef>();
  for (const m of MODULOS_TELAS) {
    out.set(m.id, { id: m.id, nome: m.nome, categoria_menu: grupoDoModulo(m.id), explicita: false, so_dev: false });
  }
  for (const [mod, acoes] of Object.entries(ACOES_POR_MODULO)) {
    const raiz = out.get(mod);
    for (const a of acoes) {
      const id = `${mod}:${a.id}`;
      out.set(id, {
        id,
        nome: `${raiz?.nome ?? mod} — ${a.label}`,
        categoria_menu: grupoDoModulo(mod),
        explicita: ACOES_EXPLICITAS.has(id),
        so_dev: ACOES_SO_DEV.has(id),
      });
    }
  }
  // Chaves que o código ainda aceita mas o Admin não lista mais.
  for (const t of CHAVES_FORA_DO_ADMIN) out.set(t.id, { ...t, categoria_menu: grupoDoModulo(t.id.split(':')[0]), explicita: false, so_dev: false });
  // Tela intermediária que existe só como prefixo (ex.: 'frota:veiculos' de 'frota:veiculos:editar').
  for (const id of [...out.keys()]) {
    const partes = id.split(':');
    for (let i = 1; i < partes.length; i++) {
      const pai = partes.slice(0, i).join(':');
      if (!out.has(pai)) out.set(pai, { id: pai, nome: pai, categoria_menu: grupoDoModulo(partes[0]), explicita: false, so_dev: false });
    }
  }
  return [...out.values()].sort((a, b) => a.id.localeCompare(b.id));
}

// ── Rotas ────────────────────────────────────────────────────────────────────
// Espelha o gate que cada página/layout faz HOJE (levantamento de 13/10/2026).
const RAIZ: Record<string, string> = {
  pos: '/pos', garantias: '/garantias', revisoes: '/revisoes', mecanicos: '/mecanicos', mapa: '/mapa-geral',
  'fotos-tecnicos': '/fotos-tecnicos', lousa: '/lousa', ppv: '/ppv', orcamentos: '/orcamentos',
  requisicoes: '/requisicoes', financeiro: '/financeiro', dre: '/dre-financeiro', propostas: '/propostas',
  feedbacks: '/feedbacks', clientes: '/clientes', 'supervisor-vendas': '/supervisor-vendas',
  'vendas-modelo': '/vendas-modelo', lead: '/lead', 'consulta-estoque': '/visual-estoque', estoque: '/estoque',
  pendencias: '/pendencias', atividades: '/atividades', 'dashboard-agro': '/dashboard-agro', tickets: '/tickets',
  tarefas: '/tarefas', 'war-room': '/war-room', planta: '/planta', 'gestao-vendas': '/gestao-vendas',
};
const ALTERNATIVAS_RAIZ: Record<string, string[]> = {
  tickets: ['tarefas', 'cronograma'],
  tarefas: ['tickets', 'cronograma'],
  pendencias: ['frota'],
  lead: ['marketing'],
  dre: ['financeiro'],
  'vendas-modelo': ['financeiro', 'dre:vendas-modelo'],
};

const LIVRES: [string, string][] = [
  ['/dashboard', ''], ['/split', ''], ['/meu-painel', ''], ['/agenda-tecnicos', ''], ['/sat', ''],
  ['/avisos', 'criar/editar/excluir pedem avisos:*'], ['/opa', ''], ['/opa/pecas', 'verificação, separação e concluídas pedem opa-pecas'],
  ['/pops', 'papéis por área em pops_area_papeis'], ['/conhecimento', 'escrever/aprovar pedem conhecimento:*'],
  ['/painel-omie', 'ponte: o app externo confere portal_permissoes'], ['/crm', ''],
  ['/cronograma', 'páginas fora do layout da Central — sem gate'],
  ['/clientes/relatorios', ''], ['/clientes/projeto', ''], ['/requisicoes/imprimir', ''],
  ['/ppv/catalogo', ''], ['/ppv/etiquetas', ''],
  ...['configuracoes', 'dashboard', 'historico-pagar', 'historico-receber', 'historico-rh', 'home-financeiro',
    'home-pecas', 'home-posvendas', 'kanban-financeiro', 'kanban-pecas', 'kanban', 'logs', 'rastreio',
    'relatorio-pagar', 'vencidos'].map((s) => [`/financeiro/${s}`, 'sub-página do Financeiro sem gate'] as [string, string]),
];
const SO_ADMIN = ['/admin', '/agendamentos', '/conferencia-custos', '/tratorilson', '/tickets/compras/config', '/war-room/config'];
const SO_DEV = ['/dev', '/ideias'];

export function catalogoRotas(): RotaDef[] {
  const r = new Map<string, RotaDef>();
  const tela = (padrao: string, tela_id: string, alternativas: string[] = [], nota?: string) =>
    r.set(padrao, { padrao, acesso: 'tela', tela_id, ...(alternativas.length ? { alternativas } : {}), ...(nota ? { nota } : {}) });

  for (const [mod, padrao] of Object.entries(RAIZ)) tela(padrao, mod, ALTERNATIVAS_RAIZ[mod] ?? []);
  tela('/reunioes', 'tickets', ['tarefas', 'cronograma'], 'Reuniões: qualquer módulo da Central');

  for (const p of PAGINAS_ESTOQUE) tela(p.href, `estoque:${p.key}`);
  for (const p of PAGINAS_AJUSTES) tela(p.href, p.key);
  for (const p of PAGINAS_FROTA) tela(p.href, p.key);
  for (const p of PAGINAS_MARKETING) tela(p.href, p.key);
  for (const p of PAGINAS_IV) tela(p.href, p.key);
  for (const a of ACOES_POR_MODULO.dre) tela(`/dre-financeiro/${a.id}`, `dre:${a.id}`, ['financeiro']);
  for (const a of ACOES_POR_MODULO['consulta-estoque']) tela(`/visual-estoque/${a.id}`, `consulta-estoque:${a.id}`);
  for (const a of ACOES_POR_MODULO.feedbacks) tela(`/feedbacks/${a.id}`, `feedbacks:${a.id}`);
  // Telas novas do Feedbacks (23/10/2026, lib/feedbacks/telas.ts): mesmas chaves das antigas
  tela('/feedbacks/painel', 'feedbacks:relatorios');
  tela('/feedbacks/tratores', 'feedbacks:atendimento', ['feedbacks:crm', 'feedbacks:rfm', 'feedbacks:agenda']);
  tela('/feedbacks/robo', 'feedbacks:oportunidades');
  tela('/feedbacks/clientes', 'feedbacks:clientes', ['feedbacks:atendimento']);

  // Exceções conferidas página a página
  tela('/frota/veiculos', 'frota:dashboard', [], 'Hoje e Veículos dividem a chave');
  tela('/frota/checklist', 'frota:checklists');
  tela('/estoque/cruzamento-familia', 'estoque', [], 'a página checa só o módulo');
  tela('/estoque/config-compras', 'estoque:config-compras', ['estoque:sugestao-compra']);
  tela('/estoque/recebimentos', 'estoque:recebimentos', ['ajustes:recebimentos']);
  tela('/ajustes/encerramentos', 'ajustes:pedidos');
  tela('/ajustes/pedidos-antigos', 'ajustes:pedidos');
  tela('/ajustes/relatorio-contagem', 'ajustes:inventario');
  tela('/pos/modelos-fiscais', 'pos:modelos_fiscais');
  tela('/ppv/unidades', 'ppv:rastreio_liberar');
  tela('/ppv/liberacao', 'ppv:rastreio_liberar', ['ppv:adicionar_item']);
  for (const s of ['verificacao', 'separacao', 'concluidas']) tela(`/opa/pecas/${s}`, 'opa-pecas', [], 'e cadastro ativo em financeiro_usu');
  tela('/financeiro/novo-chamado-nf', 'financeiro:criar_chamado');
  tela('/financeiro/novo-chamado-rh', 'financeiro:criar_chamado');
  tela('/financeiro/novo-pagar-receber', 'financeiro:criar_lancamento');
  tela('/financeiro/notas', 'financeiro:notas');

  for (const [padrao, nota] of LIVRES) r.set(padrao, { padrao, acesso: 'livre', ...(nota ? { nota } : {}) });
  for (const padrao of SO_ADMIN) r.set(padrao, { padrao, acesso: 'admin' });
  for (const padrao of SO_DEV) r.set(padrao, { padrao, acesso: 'dev' });
  return [...r.values()].sort((a, b) => a.padrao.localeCompare(b.padrao));
}

/** Rota cadastrada que casa com o caminho (prefixo mais longo). */
export function rotaDoCaminho(pathname: string, rotas: RotaDef[]): RotaDef | null {
  const caminho = pathname.split('?')[0].replace(/\/+$/, '') || '/';
  let melhor: RotaDef | null = null;
  for (const r of rotas) {
    if (caminho === r.padrao || caminho.startsWith(r.padrao + '/')) {
      if (!melhor || r.padrao.length > melhor.padrao.length) melhor = r;
    }
  }
  return melhor;
}
