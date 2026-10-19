// =============================================================================
// INTELIGÊNCIA DE VENDAS — "propostas sem retorno há mais de N dias" (ideia 19
// e automação extra). Junta três fontes numa fila só, cada item com o motivo:
//   * propostas do portal (Formulario) em aberto
//   * negócios do CRM dos vendedores (negocios) em etapa aberta e parados
//   * retornos combinados nas visitas do CRM (data_proximo_contato) que passaram
//     sem nova visita na mesma propriedade
// Lib PURA.
// =============================================================================
import { dataISO, diasEntre } from './normalizar';
import type { FonteProposta } from './tipos';

export const ETAPAS_ABERTAS_CRM = ['prospeccao', 'andamento', 'solicitacao_proposta', 'apresentacao_proposta', 'contorno_objecoes'];
export const ROTULO_ETAPA_CRM: Record<string, string> = {
  prospeccao: 'Prospecção', andamento: 'Andamento', solicitacao_proposta: 'Solicitação da proposta',
  apresentacao_proposta: 'Apresentação da proposta', contorno_objecoes: 'Contorno de objeções',
};

export type Motivo = 'contato_vencido' | 'parada' | 'sem_proximo' | 'validade' | 'retorno_visita';
export const ROTULO_MOTIVO: Record<Motivo, string> = {
  contato_vencido: 'Contato combinado venceu',
  parada: 'Parada na mesma fase',
  sem_proximo: 'Sem próximo contato marcado',
  validade: 'Validade vencendo',
  retorno_visita: 'Retorno da visita não feito',
};

export interface ItemRetorno {
  origem: 'proposta' | 'negocio' | 'visita';
  id: number;
  cliente: string;
  cidade: string;
  vendedor: string;
  oque: string;
  valor: number;
  fase: string;
  desde: string; // ISO
  dias: number | null;
  idadeIncerta: boolean;
  motivo: Motivo;
  detalhe: string;
  gravidade: 1 | 2 | 3; // 3 = mais urgente
  proximoContato: string;
}

export interface FonteNegocio {
  id: number;
  vendedor_id: number | null;
  propriedade_id: number | null;
  status: string | null;
  valor: number | null;
  updated_at: string | null;
  created_at: string | null;
  data_fechamento_prevista: string | null;
  maquina_modelo: string | null;
  maquina_marca: string | null;
  notas: string | null;
  cidade: string | null;
}

export interface FonteVisitaRetorno {
  id: number;
  vendedor_id: number | null;
  propriedade_id: number | null;
  data_visita: string | null;
  data_proximo_contato: string | null;
  proximos_passos: string | null;
}

const valorBR = (s: unknown): number => {
  const t = String(s ?? '').trim();
  if (!t) return 0;
  const n = /,\d{1,2}$/.test(t) ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t.replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/** A data que mais se repete em criado_em, se repetida 10+ vezes = data do backfill da migração. */
export function dataDoBackfill(propostas: FonteProposta[]): string {
  const c = new Map<string, number>();
  for (const p of propostas) if (p.criado_em) c.set(p.criado_em, (c.get(p.criado_em) || 0) + 1);
  let melhor = '', n = 0;
  for (const [k, v] of c) if (v > n) { melhor = k; n = v; }
  return n >= 10 ? melhor : '';
}

export function montarFila(e: {
  propostas: FonteProposta[];
  negocios: FonteNegocio[];
  visitas: FonteVisitaRetorno[];
  nomePropriedade: (id: number | null) => { nome: string; cidade: string };
  nomeVendedor: (id: number | null) => string;
  hoje: string;
  diasParada?: number;
}): ItemRetorno[] {
  const { hoje } = e;
  const limite = e.diasParada ?? 15;
  const backfill = dataDoBackfill(e.propostas);
  const out: ItemRetorno[] = [];

  for (const p of e.propostas) {
    if (!p.em_aberto || p.status === 'Lixeira') continue;
    const desde = dataISO(p.status_desde || p.criado_em);
    const dias = diasEntre(desde, hoje);
    const prox = dataISO(p.proximo_contato);
    const val = dataISO(p.validade);
    const base = {
      origem: 'proposta' as const, id: p.id, cliente: String(p.Cliente || ''), cidade: String(p.Cidade || ''),
      vendedor: String(p.vendedor_nome || ''), oque: [p.Marca, p.Modelo].filter(Boolean).join(' '),
      valor: valorBR(p.Valor_Total), fase: String(p.status || ''), desde, dias,
      idadeIncerta: !!backfill && (p.status_desde === backfill || (!p.status_desde && p.criado_em === backfill)),
      proximoContato: prox,
    };
    if (prox && prox < hoje) {
      const atraso = diasEntre(prox, hoje) ?? 0;
      out.push({ ...base, motivo: 'contato_vencido', detalhe: `Contato marcado para ${br(prox)} (${atraso} dia(s) atrás)`, gravidade: 3 });
    } else if (val && val >= hoje && (diasEntre(hoje, val) ?? 99) <= 5) {
      out.push({ ...base, motivo: 'validade', detalhe: `Validade termina em ${br(val)}`, gravidade: 3 });
    } else if (dias != null && dias > limite) {
      out.push({ ...base, motivo: 'parada', detalhe: `${base.idadeIncerta ? 'Desde 21/08 ou antes' : `Há ${dias} dias`} em "${base.fase}"`, gravidade: dias > 45 ? 3 : 2 });
    } else if (!prox) {
      out.push({ ...base, motivo: 'sem_proximo', detalhe: 'Nenhum próximo contato marcado', gravidade: 1 });
    }
  }

  for (const n of e.negocios) {
    if (!ETAPAS_ABERTAS_CRM.includes(String(n.status))) continue;
    const desde = dataISO(n.updated_at || n.created_at);
    const dias = diasEntre(desde, hoje);
    if (dias == null || dias <= limite) continue;
    const prop = e.nomePropriedade(n.propriedade_id);
    out.push({
      origem: 'negocio', id: n.id, cliente: prop.nome || String(n.notas || '').slice(0, 60), cidade: prop.cidade || String(n.cidade || ''),
      vendedor: e.nomeVendedor(n.vendedor_id), oque: [n.maquina_marca, n.maquina_modelo].filter(Boolean).join(' ') || String(n.notas || '').slice(0, 60),
      valor: Number(n.valor) || 0, fase: ROTULO_ETAPA_CRM[String(n.status)] || String(n.status), desde, dias, idadeIncerta: false,
      motivo: 'parada', detalhe: `Negócio sem movimento há ${dias} dias no CRM`, gravidade: dias > 45 ? 3 : 2,
      proximoContato: dataISO(n.data_fechamento_prevista),
    });
  }

  // Retorno combinado na visita: vale só a ÚLTIMA visita de cada propriedade.
  const ultima = new Map<number, FonteVisitaRetorno>();
  for (const v of e.visitas) {
    if (v.propriedade_id == null) continue;
    const atual = ultima.get(v.propriedade_id);
    if (!atual || String(v.data_visita) > String(atual.data_visita)) ultima.set(v.propriedade_id, v);
  }
  for (const v of ultima.values()) {
    const prox = dataISO(v.data_proximo_contato);
    if (!prox || prox >= hoje) continue;
    const prop = e.nomePropriedade(v.propriedade_id);
    const atraso = diasEntre(prox, hoje) ?? 0;
    out.push({
      origem: 'visita', id: v.id, cliente: prop.nome, cidade: prop.cidade, vendedor: e.nomeVendedor(v.vendedor_id),
      oque: String(v.proximos_passos || '').slice(0, 80), valor: 0, fase: 'Visita', desde: dataISO(v.data_visita),
      dias: diasEntre(dataISO(v.data_visita), hoje), idadeIncerta: false, motivo: 'retorno_visita',
      detalhe: `Retorno combinado para ${br(prox)} (${atraso} dia(s) atrás)`, gravidade: atraso > 15 ? 3 : 2, proximoContato: prox,
    });
  }

  return out.sort((a, b) => b.gravidade - a.gravidade || b.valor - a.valor || (b.dias ?? 0) - (a.dias ?? 0));
}

function br(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

export function resumoPorVendedor(itens: ItemRetorno[]): { vendedor: string; itens: number; urgentes: number; valor: number }[] {
  const m = new Map<string, { vendedor: string; itens: number; urgentes: number; valor: number }>();
  for (const i of itens) {
    const k = i.vendedor || 'Sem vendedor';
    const r = m.get(k) || { vendedor: k, itens: 0, urgentes: 0, valor: 0 };
    r.itens++;
    if (i.gravidade === 3) r.urgentes++;
    r.valor += i.valor;
    m.set(k, r);
  }
  return [...m.values()].sort((a, b) => b.urgentes - a.urgentes || b.valor - a.valor);
}
