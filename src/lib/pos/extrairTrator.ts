/**
 * Extrai o chassis do trator a partir dos campos texto da Ordem_Servico.
 * Procura primeiro por padrão "Chassis: XXXX", depois por qualquer token
 * alfanumérico longo (17 chars típicos de VIN/chassis).
 */
export function extrairChassis(os: {
  Projeto?: string | null;
  Serv_Solicitado?: string | null;
}): string | null {
  const fontes = [os.Projeto, os.Serv_Solicitado].filter(Boolean).join('\n');
  if (!fontes) return null;

  const matchLabel = fontes.match(/Chassis?[:\s]+([A-Z0-9]{6,})/i);
  if (matchLabel?.[1]) return matchLabel[1].toUpperCase();

  const matchVin = fontes.match(/\b([A-Z0-9]{17})\b/i);
  if (matchVin?.[1]) return matchVin[1].toUpperCase();

  return null;
}

/**
 * Extrai o nível de revisão em horas a partir do campo `Revisao`
 * (ex.: "Revisão de 300 horas para modelo 6075" → 300).
 */
export function extrairHorasRevisao(revisao: string | null | undefined): number | null {
  if (!revisao) return null;
  const m = revisao.match(/(\d+)\s*horas?/i);
  return m ? Number(m[1]) : null;
}
