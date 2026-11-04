// Frota > Manutenções — regras puras do relatório detalhado (tela e PDF).
// A view vw_frota_manutencoes só traz o título; o detalhe de cada serviço vem
// da fonte: Requisicao.obs ("itens ou serviços"), solicitante e OS; nas da
// Rota Exata/portal, observacao + tipo (Corretiva/Preventiva) + status.
import type { ManutencaoView } from './tipos';

export type DetalheServico = {
  detalhe: string | null;   // o que foi feito (texto livre da fonte)
  extras: string[];         // "Solicitante: X", "OS 123", "Preventiva"…
};

export type ServicoRelatorio = ManutencaoView & DetalheServico & { referencia: string };

export type ReqDetalhe = { id: string | number; obs: string | null; solicitante: string | null; ordem_servico: string | null; status: string | null };
export type ManutDetalhe = { id: string; descricao: string | null; observacao: string | null; tipo: string | null; status: string | null };

const limpo = (s: string | null | undefined) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t || null;
};

export const ROTULO_ORIGEM: Record<string, string> = {
  rotaexata: 'Rota Exata',
  manual: 'Portal',
  requisicao: 'Requisição',
};

/** Junta o detalhe da fonte a cada linha da view. */
export function enriquecer(
  linhas: ManutencaoView[],
  reqs: ReqDetalhe[],
  manuts: ManutDetalhe[],
): ServicoRelatorio[] {
  const porReq = new Map(reqs.map((r) => [String(r.id), r]));
  const porManut = new Map(manuts.map((m) => [String(m.id), m]));
  return linhas.map((m) => {
    const extras: string[] = [];
    let detalhe: string | null = null;
    if (m.origem === 'requisicao') {
      const r = porReq.get(String(m.id));
      detalhe = limpo(r?.obs);
      if (limpo(r?.solicitante)) extras.push(`Solicitante: ${limpo(r?.solicitante)}`);
      if (limpo(r?.ordem_servico)) extras.push(`OS ${limpo(r?.ordem_servico)}`);
      return { ...m, detalhe, extras, referencia: `Req #${m.id}` };
    }
    const x = porManut.get(String(m.id));
    const obs = limpo(x?.observacao);
    // a view já mostra COALESCE(descricao, observacao): só repete a obs se for outra coisa
    if (obs && obs !== limpo(m.descricao)) detalhe = obs;
    if (limpo(m.tipo)) extras.push(limpo(m.tipo)!);
    if (limpo(m.status)) extras.push(limpo(m.status)!);
    return { ...m, detalhe, extras, referencia: ROTULO_ORIGEM[m.origem] || 'Portal' };
  });
}

/** Filtro de período por data (YYYY-MM-DD). Sem data fica de fora quando há período. */
export function noPeriodo(data: string | null, de: string, ate: string): boolean {
  if (!de && !ate) return true;
  if (!data) return false;
  const d = data.slice(0, 10);
  if (de && d < de) return false;
  if (ate && d > ate) return false;
  return true;
}

/** Ordena do mais recente pro mais antigo (sem data por último). */
export function ordenarPorData<T extends { data: string | null }>(itens: T[]): T[] {
  return [...itens].sort((a, b) => {
    if (!a.data && !b.data) return 0;
    if (!a.data) return 1;
    if (!b.data) return -1;
    return b.data.localeCompare(a.data);
  });
}

/** Soma por origem (para o rodapé do relatório). */
export function totaisPorOrigem(itens: { origem: string; valor_total: number | null }[]) {
  const out: Record<string, { n: number; total: number }> = {};
  for (const i of itens) {
    const o = (out[i.origem] ||= { n: 0, total: 0 });
    o.n += 1;
    o.total += Number(i.valor_total) || 0;
  }
  return out;
}
