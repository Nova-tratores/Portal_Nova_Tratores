// Gerador da Solicitação de Garantia (SG) no formato Mahindra.
// Lê o template em public/templates/sg-mahindra.xlsx, preenche as células
// com os dados da garantia e devolve um Buffer pronto para anexar/baixar.
//
// Em produção (Vercel), arquivos da pasta public/ não são empacotados no bundle
// serverless. Carregamos via fetch da URL pública; em dev, fallback pelo fs.

import * as XLSX from 'xlsx';
import path from 'path';
import { promises as fs } from 'fs';
import type { GarantiaDetalhe } from './types';

const TEMPLATE_PUBLIC_PATH = '/templates/sg-mahindra.xlsx';

// Formata "GAR-0034" + ano → "2026-034" (padrão SG Mahindra)
export function formatarNumeroSG(garantia: { numero: string; created_at: string }): string {
  const ano = new Date(garantia.created_at).getFullYear();
  const m = String(garantia.numero || '').match(/(\d+)/);
  const seq = m ? m[1].padStart(3, '0') : '000';
  return `${ano}-${seq}`;
}

// Nome do arquivo final: "SG 2026-034 NOME DO CLIENTE.xlsx"
export function nomeArquivoSG(garantia: { numero: string; created_at: string; cliente: string | null }): string {
  const numero = formatarNumeroSG(garantia);
  const cliente = (garantia.cliente || 'CLIENTE').toUpperCase().replace(/[\\\/:*?"<>|]/g, '').trim();
  return `SG ${numero} ${cliente}.xlsx`;
}

function fmtData(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR');
}

function setCell(sheet: XLSX.WorkSheet, ref: string, value: unknown) {
  if (value === null || value === undefined || value === '') return;
  if (typeof value === 'number') {
    sheet[ref] = { t: 'n', v: value };
  } else {
    sheet[ref] = { t: 's', v: String(value) };
  }
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
    Motivo?: string | null;          // diagnóstico
    ServicoRealizado?: string | null; // ação tomada
    DataInicio?: string | null;
  } | null;
}

async function carregarTemplate(baseUrl?: string): Promise<Buffer> {
  // 1) Em runtime serverless (Vercel), pega via fetch da URL pública
  if (baseUrl) {
    try {
      const res = await fetch(`${baseUrl}${TEMPLATE_PUBLIC_PATH}`);
      if (res.ok) {
        return Buffer.from(await res.arrayBuffer());
      }
    } catch {
      /* cai pro fallback abaixo */
    }
  }
  // 2) Fallback dev: lê do disco direto
  const diskPath = path.join(process.cwd(), 'public', 'templates', 'sg-mahindra.xlsx');
  return fs.readFile(diskPath);
}

export async function gerarSGMahindra(
  { garantia, os, tecnico }: DadosSG,
  baseUrl?: string,
): Promise<Buffer> {
  const buf = await carregarTemplate(baseUrl);
  const wb = XLSX.read(buf, { type: 'buffer', cellStyles: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error('Template SG sem planilha principal.');

  // ── Cabeçalho: número da SG ─────────────────────────────────────────
  setCell(sheet, 'L2', formatarNumeroSG(garantia));

  // ── Cliente ─────────────────────────────────────────────────────────
  setCell(sheet, 'B11', garantia.cliente || os?.Os_Cliente);
  setCell(sheet, 'B13', os?.Cnpj_Cliente);
  setCell(sheet, 'B15', os?.Endereco_Cliente);
  setCell(sheet, 'B17', os?.Cidade_Cliente);

  // ── Trator ──────────────────────────────────────────────────────────
  setCell(sheet, 'C22', garantia.chassis);
  setCell(sheet, 'K22', garantia.modelo);
  const horimetro = tecnico?.Horimetro ? Number(tecnico.Horimetro) : null;
  if (horimetro && !isNaN(horimetro)) setCell(sheet, 'K24', horimetro);

  // ── Tipo de Garantia ────────────────────────────────────────────────
  // Padrão: "Produto em Garantia"
  setCell(sheet, 'C37', 'X');

  // ── Ocorrência ──────────────────────────────────────────────────────
  setCell(sheet, 'B45', fmtData(tecnico?.DataInicio || garantia.created_at));
  setCell(sheet, 'B47', os?.Serv_Solicitado);
  setCell(sheet, 'B49', tecnico?.Motivo);
  setCell(sheet, 'B53', tecnico?.ServicoRealizado);
  setCell(sheet, 'B55', garantia.garantista_obs);

  // ── OS e valores ────────────────────────────────────────────────────
  setCell(sheet, 'B58', garantia.id_ordem);
  const horas = garantia.garantista_horas ?? garantia.tecnico_horas;
  const km = garantia.garantista_km ?? garantia.tecnico_km;
  if (horas != null) setCell(sheet, 'B60', Number(horas));
  if (km != null) setCell(sheet, 'B62', Number(km));
  setCell(sheet, 'B63', garantia.pecas?.length || 0);

  // ── Peças utilizadas (linhas 71-83, máx ~13 peças) ──────────────────
  const pecas = garantia.pecas || [];
  const MAX_LINHAS = 13;
  for (let i = 0; i < Math.min(pecas.length, MAX_LINHAS); i++) {
    const p = pecas[i];
    const linha = 71 + i;
    setCell(sheet, `A${linha}`, p.cod_produto || '');
    setCell(sheet, `B${linha}`, p.descricao);
    setCell(sheet, `L${linha}`, Number(p.quantidade) || 1);
  }

  // ── Atualiza !ref ───────────────────────────────────────────────────
  // (xlsx atualiza automaticamente quando lemos com cellStyles, mas garante)
  if (!sheet['!ref']) sheet['!ref'] = 'A1:S156';

  const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.isBuffer(out) ? out : Buffer.from(out);
}
