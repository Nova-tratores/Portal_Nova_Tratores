// Regras PURAS: a OS de serviço é COMERCIAL (rendimento real do serviço) ou
// NÃO COMERCIAL (garantia, campanha/comissão, seguro, ação promocional).
//
// Pedido do José (20/10/2026): o Serviços do Dashboard de Vendas deve mostrar
// por padrão só o comercial; os não comerciais ficam num quadro à parte e uma
// caixinha (desmarcada) soma tudo de volta. Levantamento 2025–2026 (NFS-e,
// R$ 1,06 mi): garantia ~R$ 189 mil, campanhas ~R$ 29 mil, seguro ~R$ 6 mil.
//
// A OS INTEIRA recebe uma classe (numa OS de garantia a hora trabalhada e o
// deslocamento também são da garantia). Ordem das regras, a 1ª que casar vale:
//   campanha  — item na categoria 1.02.02 "Recebimento de Campanhas (Bancos,
//               Fábricas)": comissões e repasses, não é serviço de oficina;
//   garantia  — item na categoria 1.01.01 "Serv Prest Garantia", ou contrato
//               "<Fábrica>-pgo" (Mahindra-pgo, Kuhn-pgo…: a fábrica paga);
//   seguro    — cliente é seguradora/corretora de seguros;
//   promocao  — contrato "Cortesia…" ou descrição "…promoção…";
//   comercial — o resto.
// Ajuste manual (os_classificacao com origem 'manual') vence a regra.

export type ClasseServico = 'comercial' | 'garantia' | 'campanha' | 'seguro' | 'promocao';

export const CLASSES_NAO_COMERCIAIS: ClasseServico[] = ['garantia', 'campanha', 'seguro', 'promocao'];

export const ROTULO_CLASSE: Record<ClasseServico, string> = {
  comercial: 'Serviço comercial',
  garantia: 'Garantia (fábrica paga)',
  campanha: 'Campanhas e comissões',
  seguro: 'Seguro',
  promocao: 'Ação promocional / cortesia',
};

export const CATEGORIA_GARANTIA = '1.01.01';
export const CATEGORIA_CAMPANHA = '1.02.02';

export interface ItemParaClasse {
  categoria?: string | null;
  contrato?: string | null;
  descricao?: string | null;
}

export interface Classificacao {
  classe: ClasseServico;
  /** Por que caiu nessa classe (mostrado na tela). */
  motivo: string;
}

const RE_PGO = /-\s*pgo\b/i;
const RE_SEGURO = /\bsegur(o|os|adora|adoras)\b/i;
// INSS "Instituto Nacional do Seguro Social" não é seguradora.
const RE_SEGURO_SOCIAL = /seguro social/i;
const RE_CORTESIA = /\bcortesia\b/i;
const RE_PROMOCAO = /promo[çc][aã]o|promocional/i;

export function ehNaoComercial(classe: ClasseServico | null | undefined): boolean {
  return !!classe && classe !== 'comercial';
}

/** Classe de uma OS a partir dos itens dela e do nome do cliente. */
export function classificarOS(itens: ItemParaClasse[], clienteNome?: string | null): Classificacao {
  if (itens.some((i) => String(i.categoria ?? '').trim() === CATEGORIA_CAMPANHA)) {
    return { classe: 'campanha', motivo: 'categoria 1.02.02 (Recebimento de Campanhas)' };
  }
  if (itens.some((i) => String(i.categoria ?? '').trim() === CATEGORIA_GARANTIA)) {
    return { classe: 'garantia', motivo: 'categoria 1.01.01 (Serv Prest Garantia)' };
  }
  const contratoPgo = itens.map((i) => String(i.contrato ?? '').trim()).find((c) => RE_PGO.test(c));
  if (contratoPgo) return { classe: 'garantia', motivo: `contrato "${contratoPgo}" (fábrica paga)` };
  if (RE_SEGURO.test(String(clienteNome ?? '')) && !RE_SEGURO_SOCIAL.test(String(clienteNome ?? ''))) {
    return { classe: 'seguro', motivo: `cliente seguradora (${String(clienteNome).trim()})` };
  }
  const cortesia = itens.map((i) => String(i.contrato ?? '').trim()).find((c) => RE_CORTESIA.test(c));
  if (cortesia) return { classe: 'promocao', motivo: `contrato "${cortesia}"` };
  if (itens.some((i) => RE_PROMOCAO.test(String(i.descricao ?? '')))) {
    return { classe: 'promocao', motivo: 'descrição de serviço promocional' };
  }
  return { classe: 'comercial', motivo: '' };
}

export interface PartesClasse {
  comercial: number;
  garantia: number;
  campanha: number;
  seguro: number;
  promocao: number;
}

export const partesVazias = (): PartesClasse => ({ comercial: 0, garantia: 0, campanha: 0, seguro: 0, promocao: 0 });

/** Soma do que NÃO é comercial. */
export function totalNaoComercial(p: PartesClasse): number {
  return p.garantia + p.campanha + p.seguro + p.promocao;
}
