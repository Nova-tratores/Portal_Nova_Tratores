// Regras puras (sem banco/Omie) da REMESSA de peças de GARANTIA — Vinicius, 13/11/2026.
// Antes toda remessa saía em 5.910 (bonificação) com o ICMS que o cenário "VENDA" punha (CST 51).
// Peça trocada em garantia (Convênio ICMS 129/06): CFOP 5.949 dentro de SP, 6.949 para fora;
// frete "transporte próprio por conta do remetente"; ICMS no CST 60 (peça com ST já recolhido,
// a mesma regra das peças do pedido de venda — garantirCst60). Com CST 60 não há benefício
// fiscal, então o "Código do Benefício Fiscal" (codigo_benef) fica VAZIO.

/** as duas empresas (Nova e Castro) ficam em SP */
export const UF_EMITENTE = 'SP';
/** NF-e modFrete 3 = Transporte próprio por conta do remetente */
export const FRETE_GARANTIA = '3';
export const CST_GARANTIA = '60';
/** com CST 60 não há benefício fiscal a informar */
export const BENEFICIO_GARANTIA = '';

export function cfopRemessaGarantia(ufCliente: string | null | undefined): string {
  const uf = String(ufCliente || '').trim().toUpperCase();
  return !uf || uf === UF_EMITENTE ? '5.949' : '6.949';
}

export interface ItemRemessaLido {
  nCodIt?: number;
  nCodProd?: number;
  nQtde?: number;
  nValUnit?: number;
  cCFOP?: string;
  ICMS?: { cSitTrib?: string };
  infAdicItem?: { codigo_benef?: string };
}

/** campos fiscais que o item de remessa de garantia leva (no IncluirRemessa e no AlterarRemessa) */
export function fiscalItemGarantia(ufCliente: string | null | undefined) {
  return {
    cCFOP: cfopRemessaGarantia(ufCliente),
    ICMS: { cSitTrib: CST_GARANTIA, nAliq: 0, nBC: 0, nValor: 0 },
    infAdicItem: { codigo_benef: BENEFICIO_GARANTIA },
  };
}

/** o que está diferente do esperado num item já gravado no Omie (vazio = certo) */
export function divergenciasItemGarantia(item: ItemRemessaLido, ufCliente: string | null | undefined): string[] {
  const out: string[] = [];
  const cfop = cfopRemessaGarantia(ufCliente);
  if (String(item.cCFOP || '').trim() !== cfop) out.push(`CFOP ${item.cCFOP || 'vazio'} (deveria ser ${cfop})`);
  if (String(item.ICMS?.cSitTrib || '').trim() !== CST_GARANTIA) out.push(`CST do ICMS ${item.ICMS?.cSitTrib || 'vazio'} (deveria ser ${CST_GARANTIA})`);
  if (String(item.infAdicItem?.codigo_benef || '').trim() !== BENEFICIO_GARANTIA) out.push('código de benefício fiscal preenchido (deveria ficar vazio no CST 60)');
  return out;
}

export function freteCerto(cTpFrete: unknown): boolean {
  return String(cTpFrete ?? '').trim() === FRETE_GARANTIA;
}
