// Achar o CNPJ de uma empresa pelo NOME (José, 16/11/2026: "se não tiver, conseguir cadastrar um lá na hora,
// pesquisando o cpf ou cnpj pelo nome, fazer uma pesquisa ali na hora com dados da internet").
// A Receita não busca por nome; o servidor pesquisa "<nome> cnpj" num buscador da internet, tira os CNPJs que
// aparecem nos resultados (cnpj.biz, consultascnpj, cnpja…) e confirma cada um na BrasilAPI. Aqui ficam as regras
// puras: validar o dígito, extrair do texto e ordenar pelo que mais aparece / mais parece com o nome digitado.
// CPF de pessoa não se acha pela internet (e não deve): fornecedor pessoa física é digitado à mão.

export const soDigitos = (s: string | null | undefined) => String(s || '').replace(/\D/g, '');

/** dígitos verificadores do CNPJ conferem? (rejeita 00000000000000 e afins) */
export function cnpjValido(cnpj: string): boolean {
  const d = soDigitos(cnpj);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((s, p, i) => s + p * Number(base[i]), 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(d.slice(0, 12));
  const d2 = calc(d.slice(0, 12) + d1);
  return d.endsWith(`${d1}${d2}`);
}

/** CPF com dígitos certos? (só para validar o que a pessoa digitou) */
export function cpfValido(cpf: string): boolean {
  const d = soDigitos(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

export function formatarDocumento(doc: string): string {
  const d = soDigitos(doc);
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return doc || '';
}

/** CNPJs válidos citados no texto, do que mais aparece para o que menos (empate = ordem em que apareceu) */
export function extrairCnpjs(texto: string, limite = 8): string[] {
  const contagem = new Map<string, { n: number; primeiro: number }>();
  // formatado (12.345.678/0001-90) ou corrido (12345678000190, comum nas URLs dos sites de consulta)
  const re = /(?<!\d)(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})(?!\d)/g;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(texto))) {
    const d = soDigitos(m[1]);
    if (!cnpjValido(d)) continue;
    const atual = contagem.get(d);
    if (atual) atual.n++;
    else contagem.set(d, { n: 1, primeiro: i++ });
  }
  return [...contagem.entries()]
    .sort((a, b) => b[1].n - a[1].n || a[1].primeiro - b[1].primeiro)
    .slice(0, limite)
    .map(([d]) => d);
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const PALAVRAS_FRACAS = new Set(['ltda', 'me', 'epp', 'eireli', 'sa', 's/a', 'de', 'da', 'do', 'das', 'dos', 'e', 'cia', 'comercio', 'servicos']);
const palavras = (s: string) => semAcento(s).split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !PALAVRAS_FRACAS.has(w));

/** 0–1: quanto do nome digitado aparece na razão social / fantasia / cidade do candidato */
export function parecenca(busca: string, ...campos: (string | null | undefined)[]): number {
  const alvo = palavras(busca);
  if (!alvo.length) return 0;
  const tem = new Set(campos.flatMap((c) => palavras(c || '')));
  return alvo.filter((w) => tem.has(w)).length / alvo.length;
}

export type CandidatoCnpj = {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  situacao: string;
  cidade: string;
  uf: string;
  atividade: string;
  abertura: string;
  telefone: string;
  email: string;
  cep: string;
  endereco: string;
  numero: string;
  bairro: string;
  /** já existe no cadastro de fornecedores do portal */
  ja_cadastrado?: { id: number | string; nome: string } | null;
  parecenca?: number;
};

/** ativos primeiro, depois quem mais parece com o nome digitado; mantém a ordem da busca no empate */
export function ordenarCandidatos(busca: string, lista: CandidatoCnpj[]): CandidatoCnpj[] {
  return lista
    .map((c, i) => ({ c: { ...c, parecenca: parecenca(busca, c.razao_social, c.nome_fantasia, c.cidade) }, i }))
    .sort((a, b) => {
      const ativoA = /ativa/i.test(a.c.situacao) ? 1 : 0;
      const ativoB = /ativa/i.test(b.c.situacao) ? 1 : 0;
      return ativoB - ativoA || (b.c.parecenca || 0) - (a.c.parecenca || 0) || a.i - b.i;
    })
    .map((x) => x.c);
}

/** resposta da BrasilAPI (/api/cnpj/v1) → candidato */
export function candidatoDaBrasilApi(j: Record<string, unknown>): CandidatoCnpj {
  const t = (k: string) => (j[k] == null ? '' : String(j[k]).trim());
  const fone = soDigitos(t('ddd_telefone_1') || t('ddd_telefone_2'));
  return {
    cnpj: soDigitos(t('cnpj')),
    razao_social: t('razao_social').toUpperCase(),
    nome_fantasia: t('nome_fantasia').toUpperCase(),
    situacao: t('descricao_situacao_cadastral') || t('situacao_cadastral'),
    cidade: t('municipio'),
    uf: t('uf'),
    atividade: t('cnae_fiscal_descricao'),
    abertura: t('data_inicio_atividade'),
    telefone: fone.length >= 10 ? `(${fone.slice(0, 2)}) ${fone.slice(2, -4)}-${fone.slice(-4)}` : '',
    email: t('email').toLowerCase(),
    cep: soDigitos(t('cep')),
    endereco: [t('descricao_tipo_de_logradouro'), t('logradouro')].filter(Boolean).join(' '),
    numero: t('numero'),
    bairro: t('bairro'),
  };
}
