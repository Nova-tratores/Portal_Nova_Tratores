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
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR');
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
}

function set(cell: ExcelJS.Cell, value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return;
  cell.value = value as ExcelJS.CellValue;
}

export async function gerarSGMahindra(
  { garantia, os, tecnico }: DadosSG,
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
  set(sheet.getCell('B15'), os?.Endereco_Cliente);
  set(sheet.getCell('B17'), os?.Cidade_Cliente);

  // ── Trator ──────────────────────────────────────────────────────────
  set(sheet.getCell('C22'), garantia.chassis);
  set(sheet.getCell('K22'), garantia.modelo);
  const horimetro = tecnico?.Horimetro ? Number(tecnico.Horimetro) : null;
  if (horimetro && !isNaN(horimetro)) set(sheet.getCell('K24'), horimetro);

  // ── Tipo de Garantia ────────────────────────────────────────────────
  // Padrão: marca "Produto em Garantia"
  set(sheet.getCell('C37'), 'X');

  // ── Ocorrência ──────────────────────────────────────────────────────
  set(sheet.getCell('B45'), fmtData(tecnico?.DataInicio || garantia.created_at));
  set(sheet.getCell('B47'), os?.Serv_Solicitado);
  set(sheet.getCell('B49'), tecnico?.Motivo);
  set(sheet.getCell('B53'), tecnico?.ServicoRealizado);
  set(sheet.getCell('B55'), garantia.garantista_obs);

  // ── OS e valores ────────────────────────────────────────────────────
  set(sheet.getCell('B58'), garantia.id_ordem);
  const horas = garantia.garantista_horas ?? garantia.tecnico_horas;
  const km = garantia.garantista_km ?? garantia.tecnico_km;
  if (horas != null) set(sheet.getCell('B60'), Number(horas));
  if (km != null) set(sheet.getCell('B62'), Number(km));
  set(sheet.getCell('B63'), garantia.pecas?.length || 0);

  // ── Peças utilizadas (linhas 71-83) ─────────────────────────────────
  const pecas = garantia.pecas || [];
  const MAX_LINHAS = 13;
  for (let i = 0; i < Math.min(pecas.length, MAX_LINHAS); i++) {
    const p = pecas[i];
    const linha = 71 + i;
    set(sheet.getCell(`A${linha}`), p.cod_produto || '');
    set(sheet.getCell(`B${linha}`), p.descricao);
    set(sheet.getCell(`L${linha}`), Number(p.quantidade) || 1);
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
