// Ler a nota anexada na requisição — regras PURAS (testadas em __tests__/ler-nota.test.ts).
// A chave de acesso da NF-e (44 dígitos) diz CNPJ, modelo, série e número sem IA nenhuma,
// e o dígito verificador (módulo 11) recusa chave lida errada. A IA só entra para foto
// sem chave legível; o servidor confere tudo com as notas de entrada do Omie.

export interface DadosNota {
  chave: string | null;
  cnpj: string | null;      // só dígitos
  nome: string | null;
  numero: string | null;    // sem zeros à esquerda
  serie: string | null;
  data: string | null;      // YYYY-MM-DD
  valor: number | null;
}

/** CNPJs da própria empresa (Nova Tratores e Castro): aparecem como DESTINATÁRIO, nunca são o fornecedor. */
export const CNPJS_PROPRIOS = new Set(['31463139000103', '23268241000111']);

export const NOTA_VAZIA: DadosNota = { chave: null, cnpj: null, nome: null, numero: null, serie: null, data: null, valor: null };

/** Dígito verificador da chave (módulo 11, pesos 2..9 da direita para a esquerda). */
export function chaveValida(chave: string): boolean {
  const c = String(chave || '').replace(/\D/g, '');
  if (c.length !== 44) return false;
  let soma = 0, peso = 2;
  for (let i = 42; i >= 0; i--) { soma += Number(c[i]) * peso; peso = peso === 9 ? 2 : peso + 1; }
  const resto = soma % 11;
  const dv = resto < 2 ? 0 : 11 - resto;
  return dv === Number(c[43]);
}

/** cUF(2) AAMM(4) CNPJ(14) modelo(2) série(3) nNF(9) tpEmis(1) cNF(8) DV(1). */
export function dadosDaChave(chave: string): Pick<DadosNota, 'chave' | 'cnpj' | 'numero' | 'serie'> | null {
  const c = String(chave || '').replace(/\D/g, '');
  if (!chaveValida(c)) return null;
  return { chave: c, cnpj: c.slice(6, 20), serie: String(Number(c.slice(22, 25))), numero: String(Number(c.slice(25, 34))) };
}

/** Acha a primeira chave VÁLIDA no texto (aceita a chave quebrada em grupos de 4). */
export function chaveNoTexto(texto: string): string | null {
  const s = String(texto || '');
  const candidatos = new Set<string>();
  for (const m of s.matchAll(/(?:\d[\s.]?){44}/g)) candidatos.add(m[0].replace(/\D/g, ''));
  const corrido = s.replace(/\D+/g, ' ');
  for (const m of corrido.matchAll(/\d{44}/g)) candidatos.add(m[0]);
  for (const c of candidatos) if (chaveValida(c)) return c;
  return null;
}

/** "1.234,56" → 1234.56 */
function numeroBR(s: string): number | null {
  const n = Number(String(s).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Texto da DANFE (PDF) → o que dá para tirar com segurança: chave, valor total e data de emissão. */
export function extrairDoTextoDanfe(texto: string): DadosNota {
  const t = String(texto || '').replace(/\s+/g, ' ');
  const out: DadosNota = { ...NOTA_VAZIA };
  const chave = chaveNoTexto(t);
  if (chave) Object.assign(out, dadosDaChave(chave));
  const vt = t.match(/VALOR\s+TOTAL\s+DA\s+NOTA[^\d]{0,40}([\d.]+,\d{2})/i);
  if (vt) out.valor = numeroBR(vt[1]);
  const de = t.match(/(?:DATA\s+(?:DA\s+)?EMISS[AÃ]O)[^\d]{0,30}(\d{2})\/(\d{2})\/(\d{4})/i);
  if (de) out.data = `${de[3]}-${de[2]}-${de[1]}`;
  return out;
}

/** Junta o que a IA leu com regras de sanidade: CNPJ com 14 dígitos, chave só se válida, valor > 0. */
export function limparLeituraIA(bruto: Record<string, unknown>): DadosNota {
  const dig = (v: unknown) => String(v ?? '').replace(/\D/g, '');
  const out: DadosNota = { ...NOTA_VAZIA };
  const chave = dig(bruto.chave);
  const pelaChave = chave ? dadosDaChave(chave) : null;
  if (pelaChave) Object.assign(out, pelaChave);
  const cnpj = dig(bruto.cnpj);
  // a IA às vezes pega o destinatário (a própria Nova/Castro): descarta
  if (!out.cnpj && (cnpj.length === 14 || cnpj.length === 11) && !CNPJS_PROPRIOS.has(cnpj)) out.cnpj = cnpj;
  if (out.cnpj && CNPJS_PROPRIOS.has(out.cnpj)) out.cnpj = null;
  const num = dig(bruto.numero).replace(/^0+/, '');
  if (!out.numero && num && num.length <= 9) out.numero = num;
  const nome = String(bruto.nome ?? '').trim();
  if (nome && !/nova tratores|castro m[aá]quinas/i.test(nome)) out.nome = nome.slice(0, 120);
  const d = String(bruto.data ?? '').match(/(\d{4})-(\d{2})-(\d{2})|(\d{2})\/(\d{2})\/(\d{4})/);
  if (d) out.data = d[1] ? `${d[1]}-${d[2]}-${d[3]}` : `${d[6]}-${d[5]}-${d[4]}`;
  const v = typeof bruto.valor === 'number' ? bruto.valor : numeroBR(String(bruto.valor ?? '')) ?? Number(bruto.valor);
  if (Number.isFinite(v) && (v as number) > 0) out.valor = Math.round((v as number) * 100) / 100;
  return out;
}

export const PROMPT_LER_NOTA = `Você lê documentos fiscais brasileiros (DANFE de NF-e, NFS-e, cupom fiscal, recibo).
Responda APENAS um JSON: {"chave": "", "cnpj": "", "nome": "", "numero": "", "data": "AAAA-MM-DD", "valor": 0}
- chave: os 44 dígitos da chave de acesso, se aparecer (sem espaços). Se não der para ler TODOS os dígitos, deixe vazio.
- cnpj e nome: do EMITENTE (quem vendeu — na DANFE fica no quadro "IDENTIFICAÇÃO DO EMITENTE", em cima à esquerda e no canhoto "RECEBEMOS DE …").
  NUNCA o destinatário: Nova Tratores (31.463.139/0001-03) ou Castro (23.268.241/0001-11) são quem COMPROU.
- numero: o número COMPLETO da nota, sem pontos e sem zeros à esquerda (ex.: "Nº 000.043.811" → "43811").
- data: data de emissão. valor: VALOR TOTAL DA NOTA, em número (ex.: 1234.56).
- Campo que não der para ler com certeza: deixe vazio ("" ou 0). Não invente.`;
