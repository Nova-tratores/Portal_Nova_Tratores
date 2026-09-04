// Agrupamento "por departamento" dos abastecimentos — função pura usada pelo
// PDF que reproduz a tabela dinâmica do Excel (Departamento → Placa →
// Motorista → data), com subtotais, resumo Cartão × Requisição e total por
// motorista. Recebe as linhas de /api/abastecimento/transacoes (limit=0).
//
// A rota de transações devolve o departamento CRU (cartão em MAIÚSCULAS,
// requisição em Title Case) — canonizamos aqui com normalizarDepartamento,
// senão "COMERCIAL" e "Comercial" viram dois grupos.

import type { TransacaoRow } from './tipos';
import { normalizarDepartamento } from './agregacoes';

export const SEM_DEPTO = 'Sem departamento';
export const SEM_MOTORISTA = 'Sem motorista';

export type FormaAbast = 'Cartão' | 'Requisição';

export interface LinhaDepto {
  data: string; // ISO original (data_transacao)
  forma: FormaAbast;
  valor: number;
  reqId?: number | null;
}
export interface MotoristaDepto { motorista: string; total: number; linhas: LinhaDepto[] }
export interface PlacaDepto { placa: string; total: number; motoristas: MotoristaDepto[] }
export interface DeptoGrupo {
  departamento: string;
  total: number;
  cartao: number;
  requisicao: number;
  placas: PlacaDepto[];
}
export interface MotoristaTotal { motorista: string; total: number }
export interface DeptoMotoristas { departamento: string; total: number; motoristas: MotoristaTotal[] }

export interface RelatorioDepartamento {
  departamentos: DeptoGrupo[];
  totalGeral: number;
  totalCartao: number;
  totalRequisicao: number;
  /** "TOTAL POR MOTORISTA": por departamento, somando todas as placas. */
  porMotorista: DeptoMotoristas[];
}

// Ordem alfabética (pt-BR, sem distinguir acento/caixa), "Sem …" por último.
function comparar(a: string, b: string, ultimo: string): number {
  if (a === ultimo && b !== ultimo) return 1;
  if (b === ultimo && a !== ultimo) return -1;
  return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
}

interface Acc { data: string; id: number; forma: FormaAbast; valor: number; reqId?: number | null }

export function agruparPorDepartamento(linhas: TransacaoRow[]): RelatorioDepartamento {
  // depto → placa → motorista → linhas
  const arvore = new Map<string, Map<string, Map<string, Acc[]>>>();

  for (const l of linhas) {
    const depto = normalizarDepartamento(l.departamento) ?? SEM_DEPTO;
    const placa = String(l.placa || '').trim() || '—';
    const motorista = String(l.motorista_nome || '').trim() || SEM_MOTORISTA;
    const forma: FormaAbast = l.origem === 'requisicao' ? 'Requisição' : 'Cartão';
    const valor = Number.isFinite(l.valor_total as number) ? (l.valor_total as number) : 0;

    let porPlaca = arvore.get(depto);
    if (!porPlaca) { porPlaca = new Map(); arvore.set(depto, porPlaca); }
    let porMotorista = porPlaca.get(placa);
    if (!porMotorista) { porMotorista = new Map(); porPlaca.set(placa, porMotorista); }
    let lista = porMotorista.get(motorista);
    if (!lista) { lista = []; porMotorista.set(motorista, lista); }
    lista.push({ data: l.data_transacao, id: l.id, forma, valor, reqId: l.req_id });
  }

  const departamentos: DeptoGrupo[] = [];
  const porMotoristaOut: DeptoMotoristas[] = [];
  let totalGeral = 0, totalCartao = 0, totalRequisicao = 0;

  const deptos = [...arvore.keys()].sort((a, b) => comparar(a, b, SEM_DEPTO));
  for (const depto of deptos) {
    const porPlaca = arvore.get(depto)!;
    const grupo: DeptoGrupo = { departamento: depto, total: 0, cartao: 0, requisicao: 0, placas: [] };
    const somaMotorista = new Map<string, number>();

    const placas = [...porPlaca.keys()].sort((a, b) => comparar(a, b, '—'));
    for (const placa of placas) {
      const porMot = porPlaca.get(placa)!;
      const pl: PlacaDepto = { placa, total: 0, motoristas: [] };
      const motoristas = [...porMot.keys()].sort((a, b) => comparar(a, b, SEM_MOTORISTA));
      for (const mot of motoristas) {
        const acc = porMot.get(mot)!;
        acc.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : a.id - b.id));
        const m: MotoristaDepto = {
          motorista: mot,
          total: 0,
          linhas: acc.map((x) => ({ data: x.data, forma: x.forma, valor: x.valor, reqId: x.reqId })),
        };
        for (const x of acc) {
          m.total += x.valor;
          if (x.forma === 'Cartão') grupo.cartao += x.valor; else grupo.requisicao += x.valor;
        }
        pl.total += m.total;
        somaMotorista.set(mot, (somaMotorista.get(mot) || 0) + m.total);
        pl.motoristas.push(m);
      }
      grupo.total += pl.total;
      grupo.placas.push(pl);
    }

    departamentos.push(grupo);
    totalGeral += grupo.total;
    totalCartao += grupo.cartao;
    totalRequisicao += grupo.requisicao;

    porMotoristaOut.push({
      departamento: depto,
      total: grupo.total,
      motoristas: [...somaMotorista.entries()]
        .sort((a, b) => comparar(a[0], b[0], SEM_MOTORISTA))
        .map(([motorista, total]) => ({ motorista, total })),
    });
  }

  return { departamentos, totalGeral, totalCartao, totalRequisicao, porMotorista: porMotoristaOut };
}
