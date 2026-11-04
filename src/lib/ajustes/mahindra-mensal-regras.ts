// Regras puras do envio mensal do arquivo Mahindra (testadas em
// __tests__/mahindra-mensal-regras.test.ts). O servidor fica em ./mahindra-mensal.ts.

/** "AAAA-MM" do mês ANTERIOR ao dia dado, no fuso de Brasília. */
export function mesAnteriorSP(agora: Date = new Date()): string {
  const sp = new Date(agora.getTime() - 3 * 3600_000); // Brasília sem horário de verão
  const ano = sp.getUTCFullYear();
  const mes = sp.getUTCMonth(); // 0-11 = mês atual; o anterior, em 1-12, é este número
  return mes === 0 ? `${ano - 1}-12` : `${ano}-${String(mes).padStart(2, '0')}`;
}

/** Instante (UTC) em que o mês "AAAA-MM" fecha em Brasília = 1º dia do mês seguinte, 00:00 -03:00. */
export function fechamentoDoMes(mes: string): Date {
  const m = /^(\d{4})-(\d{2})$/.exec(mes);
  if (!m) throw new Error('mês inválido (use AAAA-MM)');
  const ano = Number(m[1]), n = Number(m[2]);
  const proxAno = n === 12 ? ano + 1 : ano;
  const proxMes = n === 12 ? 1 : n + 1;
  return new Date(Date.UTC(proxAno, proxMes - 1, 1, 3, 0, 0));
}

/**
 * Arquivo já gerado que serve para o envio: do mesmo mês e conta, gerado DEPOIS do
 * mês fechar (antes disso a posição e a venda ainda mudavam). O mais recente ganha.
 */
export function arquivoReaproveitavel<T extends { mes: string; conta_omie: string; criado_em: string }>(
  arquivos: T[], mes: string, conta: string,
): T | null {
  const corte = fechamentoDoMes(mes).getTime();
  const ok = arquivos
    .filter((a) => a.mes === mes && String(a.conta_omie).toUpperCase() === conta.toUpperCase())
    .filter((a) => new Date(a.criado_em).getTime() >= corte)
    .sort((a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime());
  return ok[0] || null;
}

/** "2026-10" → "outubro/2026". */
export function mesPorExtenso(mes: string): string {
  const nomes = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const m = /^(\d{4})-(\d{2})$/.exec(mes);
  if (!m) return mes;
  return `${nomes[Number(m[2]) - 1] || m[2]}/${m[1]}`;
}

/** Contas do parâmetro "contas" ("NOVA", "NOVA,CASTRO"…); só as que existem. Padrão NOVA. */
export function contasDoParametro(v: unknown): Array<'NOVA' | 'CASTRO'> {
  const lista = String(v ?? '').toUpperCase().split(/[,;\s]+/).filter(Boolean);
  const ok = [...new Set(lista)].filter((c): c is 'NOVA' | 'CASTRO' => c === 'NOVA' || c === 'CASTRO');
  return ok.length ? ok : ['NOVA'];
}
