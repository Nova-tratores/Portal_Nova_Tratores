// =============================================================================
// PENDÊNCIAS do veículo + CHECKLIST PRÉ-VENDA — funções puras, usadas pelo
// servidor (lista de veículos) e pelo cliente (Ficha), pra régua ser UMA só.
//
//  - pendenciasDoVeiculo: o que falta arrumar → pinta o card de VERMELHO
//  - checklistPreVenda:   o que tirar/resolver ANTES de vender (rastreador,
//                         seguro, acessórios instalados, multas...)
// =============================================================================

export interface DadosPendencia {
  status: string;
  ativo: boolean;
  pendencia_vinculo: boolean;
  renavam: string | null;
  chassi: string | null;
  proprietario: string | null;
  tem_crlv: boolean;          // existe documento tipo 'crlv' anexado
  docs_vencendo: number;      // vencidos ou vencendo em ≤30 dias
  multas_abertas: number;
}

/** O que falta neste veículo (vazio = card normal; 1+ = card vermelho). */
export function pendenciasDoVeiculo(d: DadosPendencia): string[] {
  // vendido/inativo é HISTÓRICO — não cobra pendência de quem já saiu da frota
  if (d.status === 'vendido' || !d.ativo) return [];
  const p: string[] = [];
  if (d.pendencia_vinculo) p.push('Cadastro incompleto — só apareceu no abastecimento (complete a ficha)');
  if (!d.renavam?.trim()) p.push('Sem RENAVAM');
  if (!d.chassi?.trim()) p.push('Sem chassi');
  if (!d.proprietario?.trim()) p.push('Sem proprietário');
  if (!d.tem_crlv) p.push('Sem CRLV anexado');
  if (d.docs_vencendo > 0) p.push(`${d.docs_vencendo} documento(s) vencido(s) ou vencendo em 30 dias`);
  if (d.multas_abertas > 0) p.push(`${d.multas_abertas} multa(s) em aberto`);
  return p;
}

export interface DadosPreVenda {
  tem_rastreador: boolean;
  equipamentos: string[] | null;   // acessórios instalados ("tunagem")
  seguradora: string | null;
  numero_apolice: string | null;
  tem_seguro_vigente: boolean;     // documento tipo 'seguro' com vigência no futuro
  multas_abertas: number;
  responsavel_atual: string | null;
}

/** O que tirar/resolver antes de entregar o carro vendido. */
export function checklistPreVenda(d: DadosPreVenda): string[] {
  const c: string[] = [];
  if (d.tem_rastreador) c.push('Rastreador Rota Exata instalado — solicitar remoção ou transferência de titularidade');
  for (const e of d.equipamentos || []) {
    if (e?.trim()) c.push(`Remover/negociar: ${e.trim()}`);
  }
  if (d.tem_seguro_vigente || d.numero_apolice?.trim() || d.seguradora?.trim()) {
    c.push(`Apólice de seguro ativa${d.seguradora ? ` (${d.seguradora})` : ''} — cancelar ou transferir`);
  }
  if (d.multas_abertas > 0) {
    c.push(`${d.multas_abertas} multa(s) em aberto — resolver antes da transferência no Detran`);
  }
  if (d.responsavel_atual?.trim()) {
    c.push(`Responsável atual (${d.responsavel_atual}) — o período é encerrado automaticamente ao confirmar`);
  }
  return c;
}
