// Correções de placa aplicadas NO UPLOAD, antes da dedup — assim CSVs novos
// da operadora com a placa antiga caem na placa certa e não duplicam nada.
//
// Casos reais (07/2026):
//  - FCP0G08 e GIH0I50 são o MESMO veículo (S10) → unificar como GIH0I50.
//  - O cartão da EPX5253 (CAPTIVA) abastecia outro carro até 06/2026:
//    FRS3H46 (ETIOS). De 07/2026 em diante é a CAPTIVA mesmo.
//
// Para linhas JÁ importadas: excluir o lote e reenviar o CSV (preenche também
// departamento/OS/capacidade), ou rodar o bloco de UPDATE em
// sql/abastecimento-departamento.sql.

export interface CorrecaoPlaca {
  de: string; // placa que vem no CSV (normalizada)
  para: string; // placa que deve valer
  modelo?: string; // sobrescreve o modelo, se informado
  ate?: string; // ISO: correção vale só até esta data/hora (inclusive)
}

export const CORRECOES_PLACA: CorrecaoPlaca[] = [
  { de: 'FCP0G08', para: 'GIH0I50' },
  { de: 'EPX5253', para: 'FRS3H46', modelo: 'ETIOS', ate: '2026-06-30T23:59:59-03:00' },
];

// Devolve a placa/modelo corrigidos para uma transação (datas em ISO com offset,
// comparáveis por época).
export function corrigirPlaca(
  placa: string,
  dataTransacaoIso: string,
): { placa: string; modelo?: string } {
  for (const c of CORRECOES_PLACA) {
    if (c.de !== placa) continue;
    if (c.ate && new Date(dataTransacaoIso).getTime() > new Date(c.ate).getTime()) continue;
    return { placa: c.para, modelo: c.modelo };
  }
  return { placa };
}
