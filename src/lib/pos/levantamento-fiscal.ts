// Levantamento dos impostos usados de fato nas OS faturadas com NFS-e — parte PURA.
// Agrupa os itens de serviço por COMBINAÇÃO dos campos fiscais (os mesmos dos
// modelos: NBS, CST, ISS, retenções, IBPT, IBS/CBS…) e mostra quantas OS, itens e
// clientes usam cada uma. Serve para criar os modelos a partir do que já se usa
// na Omie (a mais comum é a candidata a "Padrão"; as outras, a modelos de clientes).
import { CAMPOS_FISCAIS, valorNoItem, type CamposFiscais, type ItemServicoOmie } from './modelo-fiscal';

export interface OSLevantada {
  nCodOS: number;
  cNumOS: string;
  dataFat: string;      // YYYY-MM-DD
  codCli: number;
  valor: number;
  itens: ItemServicoOmie[];
}
export interface ClienteInfo { nome: string; documento: string }

export interface ClienteNaCombinacao { codCli: number; nome: string; documento: string; qtdOS: number }
export interface Combinacao {
  chave: string;
  campos: CamposFiscais;   // só os campos com valor (o que a Omie tinha)
  qtdOS: number;
  qtdItens: number;
  valor: number;           // soma do valor das OS (uma OS com 2 combinações conta nas duas)
  clientes: ClienteNaCombinacao[];
  ultimaFat: string;
  exemplos: string[];      // nº de OS
}
export interface ResultadoLevantamento {
  totalOS: number;
  totalItens: number;
  periodo: { de: string; ate: string } | null;
  combinacoes: Combinacao[];
  porCampo: Record<string, Array<{ valor: string | number; qtdItens: number }>>;
  camposSemDado: string[]; // campos que a Omie nunca devolveu preenchidos
}

/** Campos fiscais de um item (só os preenchidos) + a chave estável da combinação. */
export function combinacaoDoItem(item: ItemServicoOmie): { chave: string; campos: CamposFiscais } {
  const campos: CamposFiscais = {};
  for (const c of CAMPOS_FISCAIS) {
    const v = valorNoItem(item, c.chave);
    if (v !== null && v !== '') campos[c.chave] = v;
  }
  const chave = CAMPOS_FISCAIS.map((c) => `${c.chave}=${campos[c.chave] ?? ''}`).join('|');
  return { chave, campos };
}

export function agruparCombinacoes(oss: OSLevantada[], clientes: Map<number, ClienteInfo>): ResultadoLevantamento {
  const mapa = new Map<string, Combinacao & { _os: Set<number>; _cli: Map<number, Set<number>> }>();
  const porCampo = new Map<string, Map<string, { valor: string | number; qtdItens: number }>>();
  let totalItens = 0;
  const datas = oss.map((o) => o.dataFat).filter(Boolean).sort();

  for (const os of oss) {
    for (const item of os.itens || []) {
      totalItens++;
      const { chave, campos } = combinacaoDoItem(item);
      let c = mapa.get(chave);
      if (!c) {
        c = { chave, campos, qtdOS: 0, qtdItens: 0, valor: 0, clientes: [], ultimaFat: '', exemplos: [], _os: new Set(), _cli: new Map() };
        mapa.set(chave, c);
      }
      c.qtdItens++;
      if (!c._os.has(os.nCodOS)) {
        c._os.add(os.nCodOS);
        c.valor += os.valor || 0;
        if (os.dataFat > c.ultimaFat) c.ultimaFat = os.dataFat;
        if (c.exemplos.length < 5) c.exemplos.push(os.cNumOS);
      }
      if (!c._cli.has(os.codCli)) c._cli.set(os.codCli, new Set());
      c._cli.get(os.codCli)!.add(os.nCodOS);

      for (const [k, v] of Object.entries(campos)) {
        if (!porCampo.has(k)) porCampo.set(k, new Map());
        const m = porCampo.get(k)!;
        const id = String(v);
        m.set(id, { valor: v, qtdItens: (m.get(id)?.qtdItens || 0) + 1 });
      }
    }
  }

  const combinacoes: Combinacao[] = [...mapa.values()].map(({ _os, _cli, ...c }) => ({
    ...c,
    qtdOS: _os.size,
    valor: Math.round(c.valor * 100) / 100,
    clientes: [..._cli.entries()].map(([codCli, set]) => ({
      codCli, qtdOS: set.size,
      nome: clientes.get(codCli)?.nome || `Cliente ${codCli}`,
      documento: clientes.get(codCli)?.documento || '',
    })).sort((a, b) => b.qtdOS - a.qtdOS),
  })).sort((a, b) => b.qtdOS - a.qtdOS || b.qtdItens - a.qtdItens);

  const porCampoObj: ResultadoLevantamento['porCampo'] = {};
  for (const [k, m] of porCampo) porCampoObj[k] = [...m.values()].sort((a, b) => b.qtdItens - a.qtdItens);

  return {
    totalOS: oss.length,
    totalItens,
    periodo: datas.length ? { de: datas[0], ate: datas[datas.length - 1] } : null,
    combinacoes,
    porCampo: porCampoObj,
    camposSemDado: CAMPOS_FISCAIS.filter((c) => !porCampo.has(c.chave)).map((c) => c.chave),
  };
}

/** "dd/mm/aaaa" → "aaaa-mm-dd" ("" se inválida). */
export function dataOmieParaISO(d: unknown): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(d ?? '').trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

/** As N mais recentes por data de faturamento (empate: nº da OS maior primeiro). */
export function maisRecentes(oss: OSLevantada[], n: number): OSLevantada[] {
  return [...oss].sort((a, b) => (b.dataFat.localeCompare(a.dataFat)) || (b.nCodOS - a.nCodOS)).slice(0, n);
}
