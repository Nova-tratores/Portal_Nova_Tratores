// Exportação CSV do módulo Abastecimento (mesmo padrão do exportarCSV do
// dashboard de estoque: separador ';', BOM p/ Excel BR, decimal com vírgula).

import type { RankingItem, TransacaoRow } from './tipos';

function celula(v: string | number | null | undefined): string {
  if (v == null) return '';
  const s = typeof v === 'number' ? v.toLocaleString('pt-BR', { maximumFractionDigits: 4 }) : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function baixarCsv(nomeArquivo: string, linhas: (string | number | null | undefined)[][]) {
  const bom = String.fromCharCode(0xfeff); // p/ Excel abrir como UTF-8
  const texto = bom + linhas.map((l) => l.map(celula).join(';')).join('\r\n');
  const blob = new Blob([texto], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(url);
}

function fmtDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
// requisição só tem a DATA (sem hora real da bomba)
function fmtDataLinha(l: TransacaoRow): string {
  return l.origem === 'requisicao'
    ? new Date(l.data_transacao).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    : fmtDataHora(l.data_transacao);
}

export function gerarCsvTransacoes(opts: {
  periodo: { de: string; ate: string };
  linhas: TransacaoRow[];
}) {
  baixarCsv(`abastecimentos_${opts.periodo.de}_a_${opts.periodo.ate}.csv`, [
    ['Data/Hora', 'Origem', 'Placa', 'Modelo', 'Departamento', 'Motorista', 'Posto', 'Combustível', 'Litros', 'R$/L', 'Sem desconto (R$)', 'Total pago (R$)', 'Economia (R$)', 'Hodômetro', 'OS', 'Filial'],
    ...opts.linhas.map((l) => [
      fmtDataLinha(l),
      l.origem === 'requisicao' ? `Requisição #${l.req_id}` : 'Cartão',
      l.placa,
      l.modelo_veiculo,
      l.departamento,
      l.motorista_nome || 'Sem motorista',
      l.posto_nome,
      l.combustivel,
      l.litros,
      l.valor_unitario,
      l.valor_original,
      l.valor_total,
      l.valor_economizado,
      l.hodometro,
      l.ordem_servico,
      l.filial_nome,
    ]),
  ]);
}

export function gerarCsvConsolidado(opts: {
  tipo: 'veiculo' | 'motorista';
  periodo: { de: string; ate: string };
  itens: RankingItem[];
}) {
  const porVeiculo = opts.tipo === 'veiculo';
  const somaValor = opts.itens.reduce((s, i) => s + i.valor, 0);
  baixarCsv(`abastecimento_por_${opts.tipo}_${opts.periodo.de}_a_${opts.periodo.ate}.csv`, [
    [porVeiculo ? 'Placa' : 'Motorista', ...(porVeiculo ? ['Modelo'] : []), 'Abastecimentos', 'Litros', 'Preço médio/L', 'Total (R$)', '% do total'],
    ...opts.itens.map((i) => [
      i.chave,
      ...(porVeiculo ? [i.detalhe] : []),
      i.transacoes,
      i.litros,
      i.litros > 0 ? i.valor / i.litros : null,
      i.valor,
      somaValor > 0 ? (i.valor / somaValor) * 100 : null,
    ]),
  ]);
}
