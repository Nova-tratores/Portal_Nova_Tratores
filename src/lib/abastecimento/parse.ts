// Parser do CSV de "análise de consumo" da operadora de cartão-frota.
// Funções puras (sem Supabase) — o route de upload usa `parseCsvAbastecimento`.
//
// Formato real do arquivo: separador ';', datas dd/MM/yyyy HH:mm:ss, números
// BR ("1.542,17"), ~60 colunas. O mapeamento é feito pelo NOME da coluna
// (normalizado), então o import sobrevive a reordenação/colunas novas.

import { corrigirDepartamento, corrigirPlaca } from './correcoes';
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

// "dd/MM/yyyy HH:mm:ss" (hora opcional) -> "yyyy-MM-ddTHH:mm:ss-03:00".
// Offset fixo -03:00 (Brasil sem horário de verão) pra chave de dedup ser
// determinística independente do timezone do servidor.
export function parseDataBR(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  const [, dd, MM, yyyy, hh = '00', mi = '00', ss = '00'] = m;
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

// Lança Error com mensagem amigável se o cabeçalho não tiver as colunas
// obrigatórias (arquivo de outro tipo/relatório).
export function parseCsvAbastecimento(csvTexto: string): ResultadoParse {
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
