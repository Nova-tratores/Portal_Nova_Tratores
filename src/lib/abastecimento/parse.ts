// Parsers dos CSVs de abastecimento. Funções puras (sem Supabase) — o route
// de upload usa `parseCsvAbastecimento`, que detecta o formato:
//
// 1) "Análise de consumo" da operadora: separador ';', datas dd/MM/yyyy
//    HH:mm:ss, números BR ("1.542,17"), ~60 colunas. Mapeamento pelo NOME da
//    coluna (normalizado), então o import sobrevive a reordenação/colunas novas.
// 2) "Abastecimento Por Veículo" (DBTrans/cartão FREE): separador ',', blocos
//    por veículo (linha "ID/CARTAO ID" com a placa, depois "Data/Hora,Posto,...").
//    Tem menos colunas (sem CNPJ, departamento, OS...), mas traz motorista,
//    data, veículo, combustível, litros, valores e hodômetro.

import { corrigirDepartamento, corrigirPlaca, FILIAL_POR_FROTA } from './correcoes';
import type { ErroLinha, LinhaAbastecimento, ResultadoParse } from './tipos';

// ---------------------------------------------------------------------------
// Primitivos de parse
// ---------------------------------------------------------------------------

// Decodifica o buffer: tenta UTF-8 estrito; se tiver bytes inválidos, refaz
// como windows-1252 (cobre latin1, comum em exports de operadoras).
export function decodificarCsv(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let texto: string;
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    texto = new TextDecoder('windows-1252').decode(bytes);
  }
  // remove BOM (U+FEFF) do início, se houver
  return texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
}

// "1.542,17" -> 1542.17 | "" -> null. Aceita negativos e "R$ ".
export function parseNumeroBR(s: string | null | undefined): number | null {
  if (s == null) return null;
  const limpo = String(s).replace(/R\$\s?/g, '').replace(/\s/g, '');
  if (!limpo) return null;
  const n = Number(limpo.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// "dd/MM/yyyy HH:mm:ss" (hora opcional, ano com 2 ou 4 dígitos) ->
// "yyyy-MM-ddTHH:mm:ss-03:00". Offset fixo -03:00 (Brasil sem horário de
// verão) pra chave de dedup ser determinística independente do timezone
// do servidor.
export function parseDataBR(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{2})\/(\d{2})\/(\d{4}|\d{2})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  const [, dd, MM, ano, hh = '00', mi = '00', ss = '00'] = m;
  const yyyy = ano.length === 2 ? `20${ano}` : ano;
  const mes = Number(MM), dia = Number(dd);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return `${yyyy}-${MM}-${dd}T${hh}:${mi}:${ss}-03:00`;
}

// Placa comparável: maiúscula, só letras/números ("ABC-1234" e "abc 1234" -> "ABC1234").
export function normalizarPlaca(s: string | null | undefined): string {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Nome de coluna comparável: minúsculo, sem acento, só letras/números
// ("Data/ Hora transação" -> "datahoratransacao").
function normalizarCabecalho(s: string): string {
  let semAcento = '';
  for (const ch of s.normalize('NFD')) {
    const cp = ch.codePointAt(0) || 0;
    if (cp >= 0x0300 && cp <= 0x036f) continue; // remove acentos (combining marks)
    semAcento += ch;
  }
  return semAcento.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Split de CSV com aspas: campo entre "..." pode conter ';', quebra de linha
// e "" (aspas escapadas). Retorna as linhas como arrays de células.
export function splitCsv(texto: string, sep = ';'): string[][] {
  const linhas: string[][] = [];
  let linha: string[] = [];
  let celula = '';
  let emAspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (emAspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { celula += '"'; i++; }
        else emAspas = false;
      } else celula += c;
    } else if (c === '"') {
      emAspas = true;
    } else if (c === sep) {
      linha.push(celula); celula = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(celula); celula = '';
      linhas.push(linha); linha = [];
    } else {
      celula += c;
    }
  }
  if (celula !== '' || linha.length) { linha.push(celula); linhas.push(linha); }
  // descarta linhas totalmente vazias (fim de arquivo etc.)
  return linhas.filter((l) => l.some((cel) => cel.trim() !== ''));
}

// ---------------------------------------------------------------------------
// Mapeamento das colunas do relatório da operadora
// ---------------------------------------------------------------------------

// campo interno -> nome normalizado da coluna no CSV
const COLUNAS: Record<string, string> = {
  filial_cnpj: 'cnpjfilial',
  filial_nome: 'nomefilial',
  placa: 'placa',
  modelo_veiculo: 'modeloveiculo',
  nome_veiculo: 'nomeveiculo',
  tipo_frota: 'tipodefrota',
  departamento: 'centrodecustoveiculo',
  motorista_cpf: 'cpfmotorista',
  motorista_nome: 'nomemotorista',
  data_transacao: 'datahoratransacao',
  data_postagem: 'datapostagem',
  autorizacao: 'nautorizacao',
  nota_fiscal: 'notafiscal',
  posto_cnpj: 'cnpjec',
  posto_nome: 'nomeec',
  posto_bandeira: 'bandeiraec',
  posto_uf: 'ufec',
  posto_cidade: 'cidadeec',
  combustivel: 'mercadoria',
  litros: 'qtdmercadoria',
  valor_unitario: 'valorunitmercadoria',
  valor_original: 'valortotaloriginal',
  valor_total: 'valortotalcomdesconto',
  valor_economizado: 'valortotaleconomizado',
  hodometro_anterior: 'hodometroanteriordigmotorista',
  hodometro: 'hodometrotransacaodigmotorista',
  horimetro_anterior: 'horimetroanteriordigmotorista',
  horimetro: 'horimetrotransacaodigmotorista',
  desvio_descricao: 'descricaodesvionatransacao',
  ordem_servico: 'ordemservicodigmotorista',
  capacidade_tanque: 'capacidadetanque',
};

const OBRIGATORIAS = ['placa', 'data_transacao', 'litros', 'valor_total', 'combustivel'];

const SEM_MOTORISTA = 'veiculosemmotoristaassociado';

function texto(v: string | undefined): string | null {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
}

// ---------------------------------------------------------------------------
// Parser principal
// ---------------------------------------------------------------------------

// Detecta o formato e delega ao parser certo.
// Lança Error com mensagem amigável se não reconhecer o arquivo.
export function parseCsvAbastecimento(csvTexto: string): ResultadoParse {
  return ehRelatorioDbtrans(csvTexto) ? parseCsvDbtrans(csvTexto) : parseCsvOperadora(csvTexto);
}

export function parseCsvOperadora(csvTexto: string): ResultadoParse {
  const grade = splitCsv(csvTexto);
  if (grade.length < 2) throw new Error('Arquivo vazio ou sem linhas de dados.');

  // índice de cada campo pelo nome normalizado do cabeçalho
  const cab = grade[0].map(normalizarCabecalho);
  const idx: Record<string, number> = {};
  for (const [campo, nomeCsv] of Object.entries(COLUNAS)) {
    const i = cab.indexOf(nomeCsv);
    if (i >= 0) idx[campo] = i;
  }
  const faltando = OBRIGATORIAS.filter((c) => idx[c] === undefined);
  if (faltando.length) {
    throw new Error(
      `CSV não parece ser o relatório de consumo da operadora — colunas obrigatórias ausentes: ${faltando.join(', ')}.`,
    );
  }

  const cel = (row: string[], campo: string): string | undefined =>
    idx[campo] !== undefined ? row[idx[campo]] : undefined;

  const linhas: LinhaAbastecimento[] = [];
  const erros: ErroLinha[] = [];
  const vistas = new Set<string>(); // dedup dentro do próprio arquivo
  let duplicadasArquivo = 0;

  for (let r = 1; r < grade.length; r++) {
    const row = grade[r];
    const numLinha = r + 1; // 1 = cabeçalho

    const placaCsv = normalizarPlaca(cel(row, 'placa'));
    const dataTransacao = parseDataBR(texto(cel(row, 'data_transacao')));
    const litros = parseNumeroBR(cel(row, 'litros'));

    if (!placaCsv) { erros.push({ linha: numLinha, motivo: 'Placa vazia' }); continue; }
    if (!dataTransacao) {
      erros.push({ linha: numLinha, motivo: `Data/hora da transação inválida: "${cel(row, 'data_transacao') || ''}"` });
      continue;
    }
    if (litros == null || litros <= 0) {
      erros.push({ linha: numLinha, motivo: `Quantidade de litros inválida: "${cel(row, 'litros') || ''}"` });
      continue;
    }

    // correções de placa (unificações/trocas de cartão) — ANTES da dedup
    const corr = corrigirPlaca(placaCsv, dataTransacao);
    const placa = corr.placa;

    const chave = `${placa}|${dataTransacao}|${litros.toFixed(3)}`;
    if (vistas.has(chave)) { duplicadasArquivo++; continue; }
    vistas.add(chave);

    const motoristaBruto = texto(cel(row, 'motorista_nome'));
    const motorista =
      motoristaBruto && normalizarCabecalho(motoristaBruto) === SEM_MOTORISTA ? null : motoristaBruto;

    linhas.push({
      placa,
      id_placa: null, // resolvido no upload (cruzamento com a tabela Placas)
      filial_cnpj: texto(cel(row, 'filial_cnpj')),
      filial_nome: texto(cel(row, 'filial_nome')),
      modelo_veiculo: corr.modelo ?? texto(cel(row, 'modelo_veiculo')),
      nome_veiculo: texto(cel(row, 'nome_veiculo')),
      tipo_frota: texto(cel(row, 'tipo_frota')),
      departamento: corrigirDepartamento(texto(cel(row, 'departamento')), motorista),
      motorista_cpf: texto(cel(row, 'motorista_cpf')),
      motorista_nome: motorista,
      data_transacao: dataTransacao,
      data_postagem: parseDataBR(texto(cel(row, 'data_postagem'))),
      autorizacao: texto(cel(row, 'autorizacao')),
      nota_fiscal: texto(cel(row, 'nota_fiscal')),
      posto_cnpj: texto(cel(row, 'posto_cnpj')),
      posto_nome: texto(cel(row, 'posto_nome')),
      posto_bandeira: texto(cel(row, 'posto_bandeira')),
      posto_uf: texto(cel(row, 'posto_uf')),
      posto_cidade: texto(cel(row, 'posto_cidade')),
      combustivel: texto(cel(row, 'combustivel')),
      litros,
      valor_unitario: parseNumeroBR(cel(row, 'valor_unitario')),
      valor_original: parseNumeroBR(cel(row, 'valor_original')),
      valor_total: parseNumeroBR(cel(row, 'valor_total')),
      valor_economizado: parseNumeroBR(cel(row, 'valor_economizado')),
      hodometro_anterior: parseNumeroBR(cel(row, 'hodometro_anterior')),
      hodometro: parseNumeroBR(cel(row, 'hodometro')),
      horimetro_anterior: parseNumeroBR(cel(row, 'horimetro_anterior')),
      horimetro: parseNumeroBR(cel(row, 'horimetro')),
      desvio_descricao: texto(cel(row, 'desvio_descricao')),
      // OS digitada pelo motorista: '0'/vazio = sem OS
      ordem_servico: (() => { const os = texto(cel(row, 'ordem_servico')); return os && os !== '0' ? os : null; })(),
      capacidade_tanque: parseNumeroBR(cel(row, 'capacidade_tanque')),
    });
  }

  return { linhas, erros, duplicadasArquivo };
}

// ---------------------------------------------------------------------------
// Formato 2: relatório "Abastecimento Por Veículo" (DBTrans / cartão FREE)
// ---------------------------------------------------------------------------

// Códigos de combustível da legenda do relatório -> nomes usados no portal
// (mesmos valores que a operadora grava, pro dashboard agrupar junto).
const COMBUSTIVEL_DBTRANS: Record<string, string> = {
  GC: 'Gasolina Comum',
  GA: 'Gasolina Aditivada',
  GP: 'Gasolina Premium',
  AC: 'Etanol',
  AA: 'Etanol Aditivado',
  FX: 'Flex',
  DC: 'Diesel',
  DA: 'Diesel Aditivado',
  D1: 'Diesel S10',
  D5: 'Diesel S50',
  SA: 'Diesel S10 Aditivado',
  GNV: 'GNV',
  AR: 'Arla',
};

// Linha de transação começa com "dd/MM/yy HH:mm" (ano com 2 ou 4 dígitos).
const RE_DATA_DBTRANS = /^\d{2}\/\d{2}\/\d{2,4}\s+\d{2}:\d{2}/;

export function ehRelatorioDbtrans(texto: string): boolean {
  // cabeçalho "Data/Hora,Posto,..." — admite colunas vazias entre eles
  return /^"?Data\/Hora"?,+"?Posto"?,/m.test(texto);
}

export function parseCsvDbtrans(csvTexto: string): ResultadoParse {
  const grade = splitCsv(csvTexto, ',');
  if (!grade.length) throw new Error('Arquivo vazio ou sem linhas de dados.');

  const linhas: LinhaAbastecimento[] = [];
  const erros: ErroLinha[] = [];
  const vistas = new Set<string>();
  let duplicadasArquivo = 0;

  // estado do bloco corrente
  let idxVeic: { placa: number; modelo: number; frota: number } | null = null; // aguardando linha de valores
  let placaAtual: string | null = null;
  let modeloAtual: string | null = null;
  let nomeVeicAtual: string | null = null;
  let veiculoNovo = false; // houve bloco ID desde o último cabeçalho "Data/Hora"?
  let idxTx: Record<string, number> | null = null;
  let frotaNome: string | null = null; // rodapé "Total Geral da Frota: NNNNN - NOME"

  for (let r = 0; r < grade.length; r++) {
    const row = grade[r];
    const numLinha = r + 1;
    // âncora = primeira célula não-vazia (alguns exports deslocam o bloco
    // "ID/CARTAO ID" algumas colunas pra direita)
    const c0 = (row.find((c) => c.trim() !== '') || '').trim();
    const c0n = normalizarCabecalho(c0);

    const mFrota = c0.match(/^Total Geral da Frota:\s*\d+\s*-\s*(.+)$/i);
    if (mFrota) { frotaNome = mFrota[1].trim(); continue; }

    // cabeçalho do bloco do veículo: "ID | Cod ID | Placa | ... | Modelo | Nº. de Frota"
    if (c0n === 'id' && row.some((c) => normalizarCabecalho(c) === 'placa')) {
      const cab = row.map(normalizarCabecalho);
      idxVeic = {
        placa: cab.indexOf('placa'),
        modelo: cab.indexOf('modelo'),
        // "Nº. de Frota" pode vir com mojibake — casa por substring
        frota: cab.findIndex((c) => c.includes('frota')),
      };
      continue;
    }
    if (idxVeic) {
      // primeira linha após o cabeçalho ID = dados do veículo
      placaAtual = normalizarPlaca(row[idxVeic.placa]) || null;
      modeloAtual = texto(row[idxVeic.modelo]);
      nomeVeicAtual = idxVeic.frota >= 0 ? texto(row[idxVeic.frota]) : null;
      veiculoNovo = true;
      idxVeic = null;
      continue;
    }

    // cabeçalho das transações: "Data/Hora | Posto | Fantasia | ... | Vol | Valor/L | Valor"
    // Cada cabeçalho abre um bloco novo — se não veio um bloco ID antes, o
    // veículo é desconhecido (exports sem a linha de placa NÃO herdam a anterior).
    if (c0n === 'datahora') {
      if (!veiculoNovo) { placaAtual = null; modeloAtual = null; nomeVeicAtual = null; }
      veiculoNovo = false;
      const cab = row.map(normalizarCabecalho);
      idxTx = {
        posto: cab.indexOf('fantasia'),
        motorista: cab.indexOf('apelido'),
        odo: cab.indexOf('odohor'),
        dist: cab.indexOf('dist'),
        comb: cab.indexOf('comb'),
        vol: cab.indexOf('vol'),
        valorL: cab.indexOf('valorl'),
        valor: cab.indexOf('valor'),
      };
      continue;
    }

    if (!RE_DATA_DBTRANS.test(c0)) continue; // linhas de totais/legenda/parâmetros

    if (!idxTx) { erros.push({ linha: numLinha, motivo: 'Abastecimento antes do cabeçalho do relatório' }); continue; }
    if (!placaAtual) {
      erros.push({ linha: numLinha, motivo: 'Bloco sem identificação do veículo (relatório exportado sem a linha de placa)' });
      continue;
    }

    const dataTransacao = parseDataBR(c0);
    const litros = parseNumeroBR(row[idxTx.vol]);
    if (!dataTransacao) { erros.push({ linha: numLinha, motivo: `Data/hora inválida: "${c0}"` }); continue; }
    if (litros == null || litros <= 0) {
      erros.push({ linha: numLinha, motivo: `Quantidade de litros inválida: "${row[idxTx.vol] || ''}"` });
      continue;
    }

    const corr = corrigirPlaca(placaAtual, dataTransacao);
    const placa = corr.placa;
    const chave = `${placa}|${dataTransacao}|${litros.toFixed(3)}`;
    if (vistas.has(chave)) { duplicadasArquivo++; continue; }
    vistas.add(chave);

    const hodometro = parseNumeroBR(row[idxTx.odo]);
    const dist = parseNumeroBR(row[idxTx.dist]);
    const combCod = (row[idxTx.comb] || '').trim().toUpperCase();
    const valorTotal = parseNumeroBR(row[idxTx.valor]);

    linhas.push({
      placa,
      id_placa: null, // resolvido no upload (cruzamento com a tabela Placas)
      filial_cnpj: null,
      filial_nome: null, // preenchido no fim (nome da frota vem no rodapé)
      modelo_veiculo: corr.modelo ?? modeloAtual,
      nome_veiculo: nomeVeicAtual,
      tipo_frota: null,
      departamento: corrigirDepartamento(null, texto(row[idxTx.motorista])),
      motorista_cpf: null,
      motorista_nome: texto(row[idxTx.motorista]),
      data_transacao: dataTransacao,
      data_postagem: null,
      autorizacao: null,
      nota_fiscal: null,
      posto_cnpj: null,
      posto_nome: texto(row[idxTx.posto]),
      posto_bandeira: null,
      posto_uf: null,
      posto_cidade: null,
      combustivel: COMBUSTIVEL_DBTRANS[combCod] ?? texto(combCod),
      litros,
      valor_unitario: parseNumeroBR(row[idxTx.valorL]),
      valor_original: valorTotal,
      valor_total: valorTotal,
      valor_economizado: null,
      // "Dist" = km desde o abastecimento anterior -> reconstrói o hodômetro anterior
      hodometro_anterior:
        hodometro != null && dist != null && dist > 0 && hodometro > dist ? hodometro - dist : null,
      hodometro,
      horimetro_anterior: null,
      horimetro: null,
      desvio_descricao: null,
      ordem_servico: null,
      capacidade_tanque: null,
    });
  }

  if (!linhas.length && !erros.length) {
    throw new Error('Relatório DBTrans sem linhas de abastecimento reconhecidas.');
  }

  // filial = nome da frota (rodapé), traduzido pro nome usado no portal
  const filial = frotaNome ? (FILIAL_POR_FROTA[frotaNome] ?? frotaNome) : null;
  if (filial) for (const l of linhas) l.filial_nome = filial;

  return { linhas, erros, duplicadasArquivo };
}
