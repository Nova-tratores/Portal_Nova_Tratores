// Gerador da Solicitação de Garantia (SG) no formato Mahindra.
// Usa ExcelJS para preservar logo, formatação, células mescladas e estilos
// do template original. Lê o template em public/templates/sg-mahindra.xlsx.
//
// Em produção (Vercel), arquivos da pasta public/ não são empacotados no
// bundle serverless — carregamos via fetch da URL pública e caímos pro fs
// como fallback em desenvolvimento.

import ExcelJS from 'exceljs';
import path from 'path';
import { promises as fs } from 'fs';
import type { GarantiaDetalhe } from './types';

const TEMPLATE_PUBLIC_PATH = '/templates/sg-mahindra.xlsx';

// Formata "ANO-NNN" (ex.: "2026-035")
export function formatarNumeroSG(garantia: {
  numero: string;
  created_at: string;
  numero_externo?: string | null;
}): string {
  if (garantia.numero_externo) return garantia.numero_externo;
  const ano = new Date(garantia.created_at).getFullYear();
  const m = String(garantia.numero || '').match(/(\d+)/);
  const seq = m ? m[1].padStart(3, '0') : '000';
  return `${ano}-${seq}`;
}

// Nome do arquivo final: "SG 2026-035 NOME DO CLIENTE.xlsx"
export function nomeArquivoSG(garantia: {
  numero: string;
  created_at: string;
  cliente: string | null;
  numero_externo?: string | null;
}): string {
  const numero = formatarNumeroSG(garantia);
  const cliente = (garantia.cliente || 'CLIENTE')
    .toUpperCase()
    .replace(/[\\\/:*?"<>|]/g, '')
    .trim();
  return `SG ${numero} ${cliente}.xlsx`;
}

function fmtData(iso: string | null | undefined): string {
  if (!iso) return '';
  // Já formatada DD/MM/YYYY? devolve direto
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(iso)) return iso;
  // ISO date (YYYY-MM-DD ou YYYY-MM-DDTHH:MM): extrai partes sem passar pelo
  // Date — evita shift de timezone (em BR, new Date('2026-01-14') vira 13/01).
  const isoMatch = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, ano, mes, dia] = isoMatch;
    return `${dia}/${mes}/${ano}`;
  }
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR');
}

// Mesma lógica usada em revisoes/page.tsx
function fmtDataCurta(valor: string | null | undefined): string {
  if (!valor) return '';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(valor)) {
    const [d, m] = valor.split('/');
    return `${d}/${m}`;
  }
  const isoMatch = valor.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, , mes, dia] = isoMatch;
    return `${dia}/${mes}`;
  }
  const d = new Date(valor);
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

async function carregarTemplate(baseUrl?: string): Promise<Buffer> {
  if (baseUrl) {
    try {
      const res = await fetch(`${baseUrl}${TEMPLATE_PUBLIC_PATH}`);
      if (res.ok) return Buffer.from(await res.arrayBuffer());
    } catch {
      /* fallback */
    }
  }
  const diskPath = path.join(process.cwd(), 'public', 'templates', 'sg-mahindra.xlsx');
  return fs.readFile(diskPath);
}

export type TipoGarantiaSG =
  | 'pre_venda'
  | 'produto_garantia'
  | 'garantia_especial'
  | 'garantia_pecas';

export interface TratorDB {
  Modelo?: string | null;
  Chassis?: string | null;
  Numero_Motor?: string | null;
  Entrega?: string | null;
  '50h Data'?: string | null;
  '300h Data'?: string | null;
  '600h Data'?: string | null;
  '900h Data'?: string | null;
  '1200h Data'?: string | null;
  '1500h Data'?: string | null;
  '1800h Data'?: string | null;
  '2100h Data'?: string | null;
}

export interface RequisicaoSG {
  cod_produto: string; // ex: "REQ-123" (ou descrição quando match por título)
  titulo: string | null;
  obs: string | null;
  recibo_fornecedor: string | null;
  fornecedor: string | null;
  valor_cobrado_cliente: number | null;
}

export interface FotoBuffer {
  buffer: Buffer;
  ext: 'jpeg' | 'png';
}

// Mapa de fotos do tecnico → ranges do template
// Estrutura: [campo Ordem_Servico_Tecnicos, range do template]
export const MAPA_FOTOS_SG: { campo: string; range: string }[] = [
  // Fotos do trator no local
  { campo: 'FotoFrente', range: 'A93:G102' },
  { campo: 'FotoTraseira', range: 'H93:N102' },
  // Plaqueta com número de série + Horímetro
  { campo: 'FotoChassis', range: 'A104:G113' },
  { campo: 'FotoHorimetro', range: 'H104:N113' },
  // Fotos da falha
  { campo: 'FotoFalha1', range: 'A115:G124' },
  { campo: 'FotoFalha2', range: 'H115:N124' },
  { campo: 'FotoFalha3', range: 'A125:G134' },
  { campo: 'FotoFalha4', range: 'H125:N134' },
  // Peças novas
  { campo: 'FotoPecaNova1', range: 'A136:G145' },
  { campo: 'FotoPecaNova2', range: 'H136:N145' },
  // Peças instaladas
  { campo: 'FotoPecaInstalada1', range: 'A147:G156' },
  { campo: 'FotoPecaInstalada2', range: 'H147:N156' },
];

import type { GarantiaPeca } from './types';

interface DadosSG {
  garantia: GarantiaDetalhe;
  os: {
    Os_Cliente?: string | null;
    Cnpj_Cliente?: string | null;
    Endereco_Cliente?: string | null;
    Cidade_Cliente?: string | null;
    Serv_Solicitado?: string | null;
    Id_Ordem?: string | null;
  } | null;
  tecnico: {
    Chassis?: string | null;
    Horimetro?: string | null;
    Motivo?: string | null;
    ServicoRealizado?: string | null;
    DataInicio?: string | null;
  } | null;
  trator: TratorDB | null;
  cep: string | null;
  pecasUtilizadas: GarantiaPeca[];
  requisicoes: RequisicaoSG[];
  tipoGarantia: TipoGarantiaSG;
  fotos: Record<string, FotoBuffer>; // chave = nome do campo (ex: FotoChassis)
}

function set(cell: ExcelJS.Cell, value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return;
  cell.value = value as ExcelJS.CellValue;
}

// Extrai endereço/bairro/UF do campo livre `Endereco_Cliente`.
// Formato esperado: "FAZENDA SAO PAULO, S/N, FARTURA (SP)"
// Regra: se a 2ª parte parece número/sn ("S/N", "123", "123-A"), ela é parte
// do endereço (concatena em B15), não do bairro. Bairro fica vazio nesse caso.
export function parseEndereco(endereco: string | null | undefined): {
  endereco: string;
  bairro: string;
  uf: string;
} {
  if (!endereco) return { endereco: '', bairro: '', uf: '' };
  const partes = endereco.split(',').map((p) => p.trim()).filter(Boolean);
  let enderecoStr = partes[0] || '';
  let bairroStr = '';
  // UF: pega o último (XX) ou as 2 letras finais do último pedaço
  const ultimo = partes[partes.length - 1] || '';
  const ufMatch = ultimo.match(/\(([A-Z]{2})\)|\b([A-Z]{2})\b\s*$/);
  const uf = ufMatch ? (ufMatch[1] || ufMatch[2] || 'SP') : 'SP';
  // 2ª parte: pode ser número (S/N, 123) ou bairro
  if (partes.length >= 3) {
    const segunda = partes[1];
    const ehNumero = /^(s\/?n\.?|\d+[a-zA-Z]?(\s*-\s*[a-zA-Z0-9]+)?)$/i.test(segunda);
    if (ehNumero) {
      enderecoStr = `${enderecoStr}, ${segunda}`;
    } else {
      bairroStr = segunda;
    }
    // Partes entre a 2ª e a última (com UF) → bairro
    if (partes.length > 3 && !bairroStr) {
      bairroStr = partes.slice(2, -1).join(', ');
    }
  }
  return { endereco: enderecoStr, bairro: bairroStr, uf };
}

// Concatena datas curtas em uma string única ("07/04 / 04/05 / 11/05")
function concatenarDatas(...valores: (string | null | undefined)[]): string {
  return valores
    .map(fmtDataCurta)
    .filter(Boolean)
    .join(' / ');
}

// Strip "OS-" do id_ordem, devolve só o número ("OS-0383" → "383")
function soNumeroOS(idOrdem: string | null | undefined): string {
  if (!idOrdem) return '';
  const m = String(idOrdem).match(/(\d+)/);
  if (!m) return String(idOrdem);
  return String(parseInt(m[1], 10));
}

// Célula a marcar no template conforme tipo escolhido
function celulaTipoGarantia(tipo: TipoGarantiaSG): string {
  switch (tipo) {
    case 'pre_venda':
      return 'C35';
    case 'garantia_especial':
      return 'C39';
    case 'garantia_pecas':
      return 'C41';
    case 'produto_garantia':
    default:
      return 'C37';
  }
}

export async function gerarSGMahindra(
  {
    garantia,
    os,
    tecnico,
    trator,
    cep,
    pecasUtilizadas,
    requisicoes,
    tipoGarantia,
    fotos,
  }: DadosSG,
  baseUrl?: string,
): Promise<Buffer> {
  const buf = await carregarTemplate(baseUrl);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const sheet = wb.worksheets[0];
  if (!sheet) throw new Error('Template SG sem planilha principal.');

  // ── Cabeçalho: número da SG ─────────────────────────────────────────
  set(sheet.getCell('L2'), formatarNumeroSG(garantia));

  // ── Cliente ─────────────────────────────────────────────────────────
  set(sheet.getCell('B11'), garantia.cliente || os?.Os_Cliente);
  set(sheet.getCell('B13'), os?.Cnpj_Cliente);
  const end = parseEndereco(os?.Endereco_Cliente);
  set(sheet.getCell('B15'), end.endereco);
  set(sheet.getCell('J15'), end.bairro);
  set(sheet.getCell('B17'), os?.Cidade_Cliente);
  set(sheet.getCell('I17'), end.uf);
  set(sheet.getCell('L17'), cep || '');

  // ── Trator (preferência: `tratores`, fallback: garantia/tecnico) ────
  const chassiCompleto =
    trator?.Chassis || tecnico?.Chassis || garantia.chassis || '';
  const modeloFull = trator?.Modelo || garantia.modelo || '';
  set(sheet.getCell('C22'), chassiCompleto);
  set(sheet.getCell('K22'), modeloFull);
  set(sheet.getCell('C24'), trator?.Numero_Motor || '');

  const horimetro = tecnico?.Horimetro ? Number(tecnico.Horimetro) : null;
  if (horimetro && !isNaN(horimetro)) set(sheet.getCell('K24'), horimetro);

  // Datas de revisão concatenadas
  set(
    sheet.getCell('C26'),
    concatenarDatas(trator?.['50h Data'], trator?.['300h Data'], trator?.['600h Data']),
  );
  set(sheet.getCell('K26'), fmtData(trator?.Entrega));
  set(
    sheet.getCell('C28'),
    concatenarDatas(trator?.['900h Data'], trator?.['1200h Data'], trator?.['1500h Data']),
  );
  set(
    sheet.getCell('K28'),
    concatenarDatas(trator?.['1800h Data'], trator?.['2100h Data']),
  );

  // ── Tipo de Garantia ────────────────────────────────────────────────
  set(sheet.getCell(celulaTipoGarantia(tipoGarantia)), 'X');

  // ── Ocorrência ──────────────────────────────────────────────────────
  set(sheet.getCell('B45'), fmtData(tecnico?.DataInicio || garantia.created_at));
  set(sheet.getCell('B47'), os?.Serv_Solicitado);
  set(sheet.getCell('B49'), tecnico?.Motivo);
  set(sheet.getCell('B53'), tecnico?.ServicoRealizado);
  // B55 (Observações) intencionalmente NÃO preenchida — pedido do usuário

  // ── OS e valores ────────────────────────────────────────────────────
  set(sheet.getCell('B58'), soNumeroOS(garantia.id_ordem));
  const horas = garantia.garantista_horas ?? garantia.tecnico_horas;
  const km = garantia.garantista_km ?? garantia.tecnico_km;
  if (horas != null) set(sheet.getCell('B60'), Number(horas));
  if (km != null) set(sheet.getCell('B62'), Number(km));

  // ── Peças utilizadas (linhas 71-83) ── recebe a lista já filtrada
  //    (sem requisições — essas vão para Serviços de Terceiros abaixo)
  set(sheet.getCell('B63'), pecasUtilizadas.length);

  const MAX_LINHAS_PECAS = 13;
  for (let i = 0; i < Math.min(pecasUtilizadas.length, MAX_LINHAS_PECAS); i++) {
    const p = pecasUtilizadas[i];
    const linha = 71 + i;
    set(sheet.getCell(`A${linha}`), p.cod_produto || '');
    set(sheet.getCell(`B${linha}`), p.descricao);
    set(sheet.getCell(`L${linha}`), Number(p.quantidade) || 1);
  }

  // ── Serviços de Terceiros (linha 84 = título "SERVIÇOS DE TERCEIROS",
  //    linha 85 = cabeçalho DESCRIÇÃO | Nº NF | HORAS | VALOR,
  //    linhas 86+ = dados).
  // Descrição: prefere `obs` (observação) da requisição → fallback no titulo.
  // Nº NF: se `recibo_fornecedor` parece URL (recibo de foto), usa
  //        `fornecedor` (texto curto tipo "LANDICO"). Senão, usa o recibo.
  // Valor: `valor_cobrado_cliente`.
  const MAX_LINHAS_TERCEIROS = 6;
  for (let i = 0; i < Math.min(requisicoes.length, MAX_LINHAS_TERCEIROS); i++) {
    const r = requisicoes[i];
    const linha = 86 + i;
    const descricao = r.obs || r.titulo || r.cod_produto;
    set(sheet.getCell(`A${linha}`), descricao);
    // Nº NF só preenche se for um número/string curta de fato (não URL de
    // recibo em foto). Sem NF cadastrada → célula vazia.
    const recibo = r.recibo_fornecedor || '';
    const reciboParecesUrl = /^https?:\/\//i.test(recibo);
    const nf = !reciboParecesUrl ? recibo : '';
    set(sheet.getCell(`K${linha}`), nf);
    if (r.valor_cobrado_cliente != null && !isNaN(Number(r.valor_cobrado_cliente))) {
      set(sheet.getCell(`N${linha}`), Number(r.valor_cobrado_cliente));
    }
  }

  // ── Imagens (best-effort) ───────────────────────────────────────────
  for (const { campo, range } of MAPA_FOTOS_SG) {
    const f = fotos[campo];
    if (!f) continue;
    try {
      const imageId = wb.addImage({
        buffer: f.buffer as unknown as ExcelJS.Buffer,
        extension: f.ext,
      });
      sheet.addImage(imageId, range);
    } catch (err) {
      console.warn(`Falha ao inserir imagem ${campo}:`, err);
    }
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
