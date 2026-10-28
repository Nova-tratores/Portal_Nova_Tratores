// Respostas do /produtos/pedidovendafat/ do Omie (Validar/FaturarPedidoVenda): a recusa vem no CORPO, sem faultstring.
/** resposta do /pedidovendafat/ com cCodStatus diferente de "0" = recusou (vem SEM faultstring) */
export function statusOmieErro(r: Record<string, unknown> | null | undefined): boolean {
  const c = r?.cCodStatus;
  return c != null && String(c).trim() !== "" && String(c).trim() !== "0";
}
export function descricaoOmie(r: Record<string, unknown> | null | undefined): string {
  return String(r?.cDescStatus || "sem descrição").replace(/^Foram encontrados erros durante a validação d[ae]ss?a Pedido de Venda de Produto!\s*/i, "").trim();
}
