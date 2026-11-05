// Grafias de um CPF/CNPJ como podem estar gravadas no banco.
// O espelho do Omie (portal_nt_clientes_cadastro_omie.cnpj_cpf) guarda o documento
// FORMATADO ("078.698.929-71", "08.000.359/0001-70"); algumas linhas vêm só com
// dígitos. Para buscar com `.in('cnpj_cpf', ...)` no banco, gera as duas formas.
export function variantesDocumento(documento: string | null | undefined): string[] {
  const d = String(documento || "").replace(/\D/g, "");
  if (d.length !== 11 && d.length !== 14) return d ? [d] : [];
  const formatado =
    d.length === 11
      ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
      : `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return [formatado, d];
}
