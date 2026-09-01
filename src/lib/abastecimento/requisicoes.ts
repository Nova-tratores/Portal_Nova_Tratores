// Requisições de abastecimento (Veicular/Trator/Quadri) unidas à tela de
// Abastecimento NA LEITURA (24/07/2026): nada é escrito na tabela
// `abastecimentos` — o cartão-frota continua sendo a única fonte dela.
// Unir na leitura evita contagem dupla e a sincronização de edição/lixeira.
//
// Só requisição que JÁ FOI PRO FINANCEIRO conta (status='financeiro' —
// decisão do usuário, 24/07/2026): em aberto ('pedido'/'completa'/
// 'aguardando') o valor ainda não é confirmado. Como é leitura ao vivo,
// as antigas que já estavam no financeiro entram sozinhas, sem backfill.
//
// Regras herdadas do resto do portal:
// - valor_despeza e litros_combustivel são TEXTO em formatos BR e US
//   misturados — parse ingênuo infla 100x (mesma regra do parseValorReq /
//   frota_parse_valor, que já causou 2 bugs reais).
// - hodometro digitado: só os dígitos interessam, inteiro plausível
//   (mesma régua da tela Custos do Frota).
// - Trator/Quadri não têm placa: entram com a pseudo-placa 'TRATOR'/'QUADRI'
//   (mesmo espírito das placas avulsas da operadora, CLI0002/TRA0001) e o
//   chassis/modelo da requisição vai na coluna de modelo.
// - A requisição só tem a DATA (sem hora): data_transacao vira meio-dia de
//   Brasília — por isso essas linhas ficam FORA do heatmap dia×hora e da
//   auditoria de intervalos (análises que dependem da hora real da bomba).

import type { SupabaseClient } from '@supabase/supabase-js';

export const TIPOS_REQ_ABASTECIMENTO = [
  'Veicular Abastecimento',
  'Trator Abastecimento',
  'Quadri Abastecimento',
] as const;

export const PLACA_TRATOR = 'TRATOR';
export const PLACA_QUADRI = 'QUADRI';

// Linha crua da tabela Requisicao (só as colunas que interessam aqui).
export interface ReqAbastRow {
  id: number;
  tipo: string;
  data: string | null; // 'YYYY-MM-DD'
  status: string | null;
  veiculo: string | number | null; // SupaPlacas.IdPlaca (só no Veicular)
  hodometro: string | null;
  litros_combustivel: string | null;
  combustivel?: string | null; // opcional: coluna nova (20/08/2026), reqs antigas não têm
  valor_despeza: string | null;
  fornecedor: string | null;
  solicitante: string | null;
  setor: string | null;
  empresa: string | null;
  Chassis_Modelo: string | null;
  ordem_servico: string | null;
}

// Linha normalizada: compatível tanto com TransacaoRow (aba Transações)
// quanto com LinhaDash (agregações do dashboard).
export interface ReqAbastecimento {
  req_id: number;
  req_tipo: string;
  data_transacao: string;
  placa: string;
  id_placa: number | null;
  modelo_veiculo: string | null;
  departamento: string | null; // setor da requisição
  filial_nome: string | null; // empresa
  motorista_nome: string | null; // solicitante
  posto_nome: string | null; // fornecedor
  posto_cidade: string | null;
  combustivel: string | null; // coluna nova (20/08/2026) — reqs antigas ficam "Não informado"
  litros: number;
  valor_unitario: number | null;
  valor_total: number | null;
  hodometro: number | null;
  capacidade_tanque: number | null;
  ordem_servico: string | null;
  origem: 'requisicao';
}

// Texto em BR ("1.304,60") ou US ("1304.60"): se tem vírgula, ponto é milhar
// e vírgula é decimal; senão, ponto é o decimal.
export function parseValorMisto(v: unknown): number | null {
  if (v == null) return null;
  let s = String(v).trim().replace(/[^\d.,-]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

// Hodômetro digitado ("353.602", "436473", "12.500 km") — é inteiro, então só
// os dígitos interessam; fora da faixa plausível é erro de digitação.
export function parseHodometroReq(v: unknown): number | null {
  const n = Number(String(v ?? '').replace(/\D/g, ''));
  return Number.isFinite(n) && n > 100 && n < 2_000_000 ? n : null;
}

const str = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  return s === '' || s === '0' ? null : s;
};

export interface VeiculoResolvido {
  placa: string;
  modelo: string | null;
}

// Normaliza UMA requisição; null = não vira abastecimento (ainda não foi pro
// financeiro, sem data, sem litros e sem valor). `porIdPlaca` resolve
// Requisicao.veiculo (SupaPlacas.IdPlaca) -> placa/modelo do Frota.
export function normalizarReqAbastecimento(
  r: ReqAbastRow,
  porIdPlaca: Map<string, VeiculoResolvido>,
): ReqAbastecimento | null {
  if (String(r.status || '').toLowerCase() !== 'financeiro') return null;
  const data = String(r.data || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return null;

  const litros = parseValorMisto(r.litros_combustivel);
  const valor = parseValorMisto(r.valor_despeza);
  const litrosOk = litros != null && litros > 0 ? litros : 0;
  const valorOk = valor != null && valor > 0 ? valor : null;
  if (litrosOk <= 0 && valorOk == null) return null;

  const ehTrator = r.tipo === 'Trator Abastecimento';
  const ehQuadri = r.tipo === 'Quadri Abastecimento';

  let placa: string;
  let modelo: string | null;
  let hodometro: number | null = null;
  if (ehTrator || ehQuadri) {
    placa = ehTrator ? PLACA_TRATOR : PLACA_QUADRI;
    modelo = str(r.Chassis_Modelo);
    // hodometro aqui é HORÍMETRO — não entra na conta de km
  } else {
    const veic = r.veiculo != null ? porIdPlaca.get(String(r.veiculo)) : undefined;
    placa = veic?.placa || '(sem placa)';
    modelo = veic?.modelo ?? null;
    hodometro = parseHodometroReq(r.hodometro);
  }

  return {
    req_id: Number(r.id),
    req_tipo: r.tipo,
    data_transacao: `${data}T12:00:00-03:00`,
    placa,
    id_placa: null,
    modelo_veiculo: modelo,
    departamento: str(r.setor),
    filial_nome: str(r.empresa),
    motorista_nome: str(r.solicitante),
    posto_nome: str(r.fornecedor),
    posto_cidade: null,
    combustivel: str(r.combustivel),
    litros: litrosOk,
    valor_unitario: valorOk != null && litrosOk > 0 ? valorOk / litrosOk : null,
    valor_total: valorOk,
    hodometro,
    capacidade_tanque: null,
    ordem_servico: str(r.ordem_servico),
    origem: 'requisicao',
  };
}

const COLS_REQ =
  'id, tipo, data, status, veiculo, hodometro, litros_combustivel, combustivel, valor_despeza, fornecedor, solicitante, setor, empresa, Chassis_Modelo, ordem_servico';

// Busca e normaliza as requisições de abastecimento do período (datas
// inclusivas, 'YYYY-MM-DD'; vazio = sem corte).
export async function buscarReqsAbastecimento(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  de: string,
  ate: string,
): Promise<ReqAbastecimento[]> {
  // mapa SupaPlacas.IdPlaca -> placa/modelo (mesmo vínculo do FormReq/Frota)
  const porIdPlaca = new Map<string, VeiculoResolvido>();
  const { data: veic } = await supabase
    .from('frota_veiculos')
    .select('placa, modelo, supa_placa_id')
    .not('supa_placa_id', 'is', null);
  for (const v of veic || []) {
    porIdPlaca.set(String(v.supa_placa_id), { placa: String(v.placa), modelo: v.modelo || null });
  }

  const montarQuery = (cols: string, off: number) => {
    let q = supabase
      .from('Requisicao')
      .select(cols)
      .in('tipo', [...TIPOS_REQ_ABASTECIMENTO])
      .order('data', { ascending: false })
      .order('id', { ascending: false }) // desempate estável: sem ele, .range() repete/pula linhas na virada de 1000 (data tem muitos valores iguais)
      .range(off, off + 999);
    if (de) q = q.gte('data', de);
    if (ate) q = q.lte('data', ate);
    return q;
  };

  // Fallback pré-migration: sem a coluna combustivel (sql/add-requisicao-
  // combustivel.sql), o select nomeado derrubaria a tela toda — refaz sem ela.
  let cols = COLS_REQ;
  const out: ReqAbastecimento[] = [];
  for (let off = 0; off < 20_000; off += 1000) {
    let { data, error } = await montarQuery(cols, off);
    if (error && cols.includes(' combustivel,') && /combustivel/i.test(error.message)) {
      cols = cols.replace(' combustivel,', '');
      ({ data, error } = await montarQuery(cols, off));
    }
    if (error) throw new Error(`Requisicao: ${error.message}`);
    for (const r of (data || []) as unknown as ReqAbastRow[]) {
      const norm = normalizarReqAbastecimento(r, porIdPlaca);
      if (norm) out.push(norm);
    }
    if (!data || data.length < 1000) break;
  }
  return out;
}
