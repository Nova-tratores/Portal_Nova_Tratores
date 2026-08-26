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

// Nome da frota no rodapé do relatório DBTrans -> filial_nome usado no portal
// (mesmo texto que a operadora grava, pro filtro de filial não duplicar).
export const FILIAL_POR_FROTA: Record<string, string> = {
  'CASTRO PECAS': 'CASTRO PECAS E MAQUINAS AGRICOLAS LTDA',
};

// Correções de departamento POR MOTORISTA: quando o "Centro de custo veículo"
// do cartão não bate com o departamento real da pessoa. Reatribui pelo nome do
// motorista (normalizado), independentemente do veículo/cartão usado.
//   chave = nome normalizado (minúsculo, sem acento, um espaço) -> departamento
// Casos reais (07/2026):
//  - Joaquim Fernando Leme abastece com cartão de DIRETORIA, mas é COMERCIAL.
export const CORRECOES_DEPARTAMENTO_POR_MOTORISTA: Record<string, string> = {
  'joaquim fernando leme': 'COMERCIAL',
};

// Nome comparável: minúsculo, sem acento, espaços colapsados
// ("  Joaquim  Fernando  LEME " -> "joaquim fernando leme").
function normalizarNome(s: string): string {
  let semAcento = '';
  for (const ch of s.normalize('NFD')) {
    const cp = ch.codePointAt(0) || 0;
    if (cp >= 0x0300 && cp <= 0x036f) continue; // remove acentos (combining marks)
    semAcento += ch;
  }
  return semAcento.toLowerCase().replace(/\s+/g, ' ').trim();
}

// Devolve o departamento corrigido para um motorista. Sobrescreve o valor do
// CSV quando há regra para o motorista; senão mantém o que veio (ou null).
export function corrigirDepartamento(
  departamento: string | null,
  motoristaNome: string | null,
): string | null {
  if (!motoristaNome) return departamento;
  return CORRECOES_DEPARTAMENTO_POR_MOTORISTA[normalizarNome(motoristaNome)] ?? departamento;
}

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
