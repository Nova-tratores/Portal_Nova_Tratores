// Dashboard Agro dentro do portal: o que a página pode pedir ao banco. PURO.
// A rota usa a service role, então esta lista é a única barreira: tabela, função
// e método fora dela não passam, e `select` não pode embutir outra tabela.
export const TABELAS_LEITURA: ReadonlySet<string> = new Set([
  'lupa_maquinas', 'lupa_uso_solo', 'pecuaria', 'lavouras_temporarias', 'lavouras_permanentes',
  'municipio_pontos', 'municipio_relevo', 'hidrologia_municipio', 'temperatura_municipio',
  'tratores', 'renagro_registros',
]);
export const FUNCOES: ReadonlySet<string> = new Set([
  'lupa_distinct_maquinas', 'lupa_maquinas_municipio', 'lupa_rank_maquina',
  'distinct_culturas_temp', 'distinct_culturas_perm',
]);
/** Única escrita da página: a âncora do município no mapa. */
export const TABELA_ESCRITA = 'municipio_pontos';

export type Avaliacao = { ok: true; caminho: string; prefer?: string } | { ok: false; status: number; erro: string };

/** caminho = o que vem depois de /api/agro/painel/rest: ['v1','lupa_maquinas'] ou ['v1','rpc','x']. */
export function avaliarPedido(metodo: string, caminho: string[], params: URLSearchParams): Avaliacao {
  const negar = (erro: string): Avaliacao => ({ ok: false, status: 403, erro });
  if (caminho[0] !== 'v1') return negar('caminho não permitido');
  for (const v of params.getAll('select')) {
    if (v.includes('(') || v.includes(')')) return negar('select com tabela embutida não é permitido');
  }
  if (caminho[1] === 'rpc' && caminho.length === 3) {
    if (metodo !== 'POST' || !FUNCOES.has(caminho[2])) return negar('função não permitida');
    return { ok: true, caminho: `rpc/${caminho[2]}` };
  }
  if (caminho.length !== 2) return negar('caminho não permitido');
  const tabela = caminho[1];
  if (metodo === 'GET') return TABELAS_LEITURA.has(tabela) ? { ok: true, caminho: tabela } : negar('tabela não permitida');
  if (metodo === 'POST' && tabela === TABELA_ESCRITA) {
    return { ok: true, caminho: tabela, prefer: 'resolution=merge-duplicates,return=minimal' };
  }
  return negar('escrita não permitida');
}
