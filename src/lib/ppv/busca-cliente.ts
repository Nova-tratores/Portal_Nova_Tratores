// Busca de cliente sem acento nos dois sentidos — regras PURAS (client-safe).
// O cadastro do Omie quase sempre vem sem acento, mas há nomes gravados com
// acento ("João", "Sebastião"). O ilike não ignora acento, então:
//  1) o termo vai sem acento (acha "OSORIO" digitando "OSÓRIO");
//  2) uma 2ª consulta troca cada letra que pode ter acento por "_" e o JS
//     confere o resultado sem acento (acha "João" digitando "Joao").

export const tirarAcento = (s: unknown) =>
  String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Padrão do ilike com curinga nas letras que podem ter acento; null quando não vale a pena. */
export function padraoSemAcento(termo: string): string | null {
  const t = tirarAcento(termo).replace(/[,()*%\_]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!/[aeiouc]/.test(t)) return null;
  const fixas = t.replace(/[aeiouc\s]/g, '').length;
  if (fixas < 3) return null; // curto demais ("ana" = "___") pega o cadastro inteiro
  return t.replace(/[aeiouc]/g, '_').replace(/ /g, '%');
}

/** Confere sem acento: todas as palavras do termo aparecem no nome, razão ou documento. */
export function casaSemAcento(row: Record<string, unknown>, termo: string): boolean {
  const alvo = tirarAcento(`${row.nome_fantasia ?? ''} ${row.razao_social ?? ''} ${row.cnpj_cpf ?? ''}`);
  const palavras = tirarAcento(termo).split(/\s+/).filter(Boolean);
  return palavras.length > 0 && palavras.every((p) => alvo.includes(p));
}
