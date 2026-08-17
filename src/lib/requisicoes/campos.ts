// Normalização dos campos numéricos da requisição (litros e hodômetro).
// O usuário digita como quiser ("150", "150.5", "1.150,25", "12500 km") e,
// ao sair do campo, o valor vira o formato BR certo:
//  - litros:    sempre com 2 casas e vírgula → "150" vira "150,00"
//  - hodômetro: só dígitos com separador de milhar → "12500" vira "12.500"
// (a lib de abastecimento já lê esses formatos: parse BR/US de litros e
// hodômetro só-dígitos — ver src/lib/abastecimento/requisicoes.ts)

export function parseNumeroBR(v: string | number | null | undefined): number | null {
  let s = String(v ?? '').trim();
  if (!s) return null;
  if (s.includes(',')) {
    // formato BR: ponto é milhar, vírgula é decimal
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (!/\.\d{1,2}$/.test(s)) {
    // sem vírgula e sem cara de decimal US ("150.5") → pontos são milhar
    s = s.replace(/\./g, '');
  }
  const n = parseFloat(s.replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

// "150" → "150,00" · "150.5" → "150,50" · "1.150,25" → "1.150,25"
export function formatarLitros(v: string | number | null | undefined): string {
  const n = parseNumeroBR(v);
  if (n === null) return String(v ?? '').trim();
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// "12500" → "12.500" · "12.500 km" → "12.500" (quilometragem/horímetro inteiro)
export function formatarHodometro(v: string | number | null | undefined): string {
  const digitos = String(v ?? '').replace(/\D/g, '');
  if (!digitos) return '';
  return Number(digitos).toLocaleString('pt-BR');
}
