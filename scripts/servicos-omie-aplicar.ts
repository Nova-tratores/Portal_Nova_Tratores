// Aplica em massa no Omie (conta NOVA) as alterações feitas no CSV gerado por
// scripts/servicos-omie-exportar.ts. Compara cada linha com o estado atual no
// Omie e chama AlterarCadastroServico SÓ para os serviços que mudaram,
// enviando o registro completo (atual + edições) para não perder campos.
//
// Uso:  npx tsx scripts/servicos-omie-aplicar.ts [arquivo.csv]            → dry-run (só mostra o diff)
//       npx tsx scripts/servicos-omie-aplicar.ts --aplicar [arquivo.csv]  → grava no Omie
//       (default: scripts/servicos-omie.csv)
//
// Coluna "inativo": a doc do Omie trata como leitura; o script tenta enviar e
// VERIFICA depois se pegou — se o Omie ignorar, avisa (aí é manual na tela).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { lerEnvLocal, listarTodosServicos, omieCall, type ServicoOmie } from './servicos-omie-exportar';

const PAUSA_MS = 350; // rate limit Omie

// Campos editáveis e onde vivem no registro do Omie
const CAMPOS_CABECALHO = ['cCodigo', 'cDescricao', 'cIdTrib', 'cCodLC116', 'cCodServMun', 'cCodCateg'] as const;
const CAMPOS_IMPOSTOS_TXT = ['cRetISS', 'cRetPIS', 'cRetCOFINS', 'cRetCSLL', 'cRetIR', 'cRetINSS'] as const;
const CAMPOS_IMPOSTOS_NUM = [
  'nAliqISS', 'nAliqPIS', 'nAliqCOFINS', 'nAliqCSLL', 'nAliqIR', 'nAliqINSS',
  'nAliqIbsMun', 'nAliqIbsUf', 'nAliqCbs', 'nPercReducaoIbsMun', 'nPercReducaoIbsUf', 'nPercReducaoCbs',
] as const;
// Reforma Tributária: campos texto que vivem em impostos (sem uppercase S/N)
const CAMPOS_REFORMA_TXT = ['cCstIbsCbs', 'cClassTrib', 'cIndOper'] as const;

function parseCsv(texto: string): Array<Record<string, string>> {
  const linhas = texto.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const parseLinha = (l: string): string[] => {
    const campos: string[] = [];
    let atual = '';
    let aspas = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (aspas) {
        if (c === '"' && l[i + 1] === '"') { atual += '"'; i++; }
        else if (c === '"') aspas = false;
        else atual += c;
      } else if (c === '"') aspas = true;
      else if (c === ';') { campos.push(atual); atual = ''; }
      else atual += c;
    }
    campos.push(atual);
    return campos;
  };
  const cab = parseLinha(linhas[0]);
  return linhas.slice(1).map((l) => {
    const vals = parseLinha(l);
    const row: Record<string, string> = {};
    cab.forEach((c, i) => { row[c] = (vals[i] ?? '').trim(); });
    return row;
  });
}

const num = (s: string) => parseFloat(String(s).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '')) || 0;
// nPrecoUnit no CSV vem como "193,5" ou "193.5" (sem milhar) — trata os dois
const numSimples = (s: string) => parseFloat(String(s).replace(',', '.')) || 0;

interface Mudanca { campo: string; de: string | number; para: string | number }

function diffLinha(row: Record<string, string>, atual: ServicoOmie): Mudanca[] {
  const m: Mudanca[] = [];
  for (const c of CAMPOS_CABECALHO) {
    const de = String(atual.cabecalho[c] ?? '');
    if (row[c] !== undefined && row[c] !== de) m.push({ campo: c, de, para: row[c] });
  }
  if (row.cDescrCompleta !== undefined && row.cDescrCompleta !== String(atual.descricao?.cDescrCompleta ?? '')) {
    m.push({ campo: 'cDescrCompleta', de: atual.descricao?.cDescrCompleta ?? '', para: row.cDescrCompleta });
  }
  if (row.nPrecoUnit !== undefined && numSimples(row.nPrecoUnit) !== Number(atual.cabecalho.nPrecoUnit ?? 0)) {
    m.push({ campo: 'nPrecoUnit', de: Number(atual.cabecalho.nPrecoUnit ?? 0), para: numSimples(row.nPrecoUnit) });
  }
  for (const c of CAMPOS_IMPOSTOS_NUM) {
    const de = Number(atual.impostos?.[c] ?? 0);
    if (row[c] !== undefined && numSimples(row[c]) !== de) m.push({ campo: c, de, para: numSimples(row[c]) });
  }
  for (const c of CAMPOS_IMPOSTOS_TXT) {
    const de = String(atual.impostos?.[c] ?? 'N');
    if (row[c] !== undefined && row[c].toUpperCase() !== de) m.push({ campo: c, de, para: row[c].toUpperCase() });
  }
  for (const c of CAMPOS_REFORMA_TXT) {
    const de = String(atual.impostos?.[c] ?? '');
    if (row[c] !== undefined && row[c] !== de) m.push({ campo: c, de, para: row[c] });
  }
  const inativoDe = atual.info?.inativo ?? 'N';
  if (row.inativo !== undefined && row.inativo.toUpperCase() !== inativoDe) {
    m.push({ campo: 'inativo', de: inativoDe, para: row.inativo.toUpperCase() });
  }
  return m;
}

function montarPayload(row: Record<string, string>, atual: ServicoOmie, mudancas: Mudanca[]) {
  const cabecalho: Record<string, string | number> = {
    cCodigo: row.cCodigo ?? atual.cabecalho.cCodigo,
    cDescricao: row.cDescricao ?? atual.cabecalho.cDescricao,
    cIdTrib: row.cIdTrib ?? atual.cabecalho.cIdTrib,
    cCodLC116: row.cCodLC116 ?? atual.cabecalho.cCodLC116,
    cCodServMun: row.cCodServMun ?? atual.cabecalho.cCodServMun,
    cCodCateg: row.cCodCateg ?? atual.cabecalho.cCodCateg,
    nPrecoUnit: row.nPrecoUnit !== undefined ? numSimples(row.nPrecoUnit) : Number(atual.cabecalho.nPrecoUnit ?? 0),
  };
  const impostos: Record<string, string | number | boolean> = { ...(atual.impostos || {}) };
  for (const c of CAMPOS_IMPOSTOS_NUM) if (row[c] !== undefined) impostos[c] = numSimples(row[c]);
  for (const c of CAMPOS_IMPOSTOS_TXT) if (row[c] !== undefined) impostos[c] = row[c].toUpperCase();
  for (const c of CAMPOS_REFORMA_TXT) if (row[c] !== undefined) impostos[c] = row[c];

  const payload: Record<string, unknown> = {
    intEditar: { nCodServ: Number(row.nCodServ) },
    cabecalho,
    descricao: { cDescrCompleta: row.cDescrCompleta ?? atual.descricao?.cDescrCompleta ?? '' },
    impostos,
  };
  // "inativo" é read-only na doc; tenta mesmo assim quando foi alterado
  if (mudancas.some((mu) => mu.campo === 'inativo')) payload.info = { inativo: row.inativo.toUpperCase() };
  return payload;
}

async function main() {
  const args = process.argv.slice(2);
  const aplicar = args.includes('--aplicar');
  const arquivo = resolve(args.find((a) => a !== '--aplicar') || resolve(__dirname, 'servicos-omie.csv'));

  const env = lerEnvLocal();
  const rows = parseCsv(readFileSync(arquivo, 'utf8'));
  console.log(`CSV: ${rows.length} linhas. Buscando estado atual no Omie...`);

  const atuais = new Map((await listarTodosServicos(env)).map((s) => [s.intListar.nCodServ, s]));

  const pendentes: Array<{ row: Record<string, string>; atual: ServicoOmie; mudancas: Mudanca[] }> = [];
  for (const row of rows) {
    const atual = atuais.get(Number(row.nCodServ));
    if (!atual) { console.warn(`AVISO: nCodServ ${row.nCodServ} não existe no Omie — linha ignorada`); continue; }
    const mudancas = diffLinha(row, atual);
    if (mudancas.length) pendentes.push({ row, atual, mudancas });
  }

  if (!pendentes.length) { console.log('Nada mudou — nenhum serviço para alterar.'); return; }

  console.log(`\n${pendentes.length} serviço(s) com alterações:\n`);
  for (const p of pendentes) {
    console.log(`• ${p.atual.cabecalho.cCodigo} (${p.row.nCodServ}) — ${p.atual.cabecalho.cDescricao}`);
    for (const mu of p.mudancas) console.log(`    ${mu.campo}: "${mu.de}" → "${mu.para}"`);
  }

  if (!aplicar) {
    console.log('\nDRY-RUN: nada foi gravado. Rode com --aplicar para efetivar.');
    return;
  }

  console.log('\nAplicando no Omie...');
  let ok = 0;
  let falhas = 0;
  const inativosPendentes: string[] = [];
  for (const p of pendentes) {
    try {
      await omieCall(env, 'AlterarCadastroServico', montarPayload(p.row, p.atual, p.mudancas));
      ok++;
      console.log(`  OK  ${p.atual.cabecalho.cCodigo}`);
      if (p.mudancas.some((mu) => mu.campo === 'inativo')) inativosPendentes.push(p.row.nCodServ);
    } catch (e: unknown) {
      falhas++;
      console.error(`  ERRO ${p.atual.cabecalho.cCodigo}: ${e instanceof Error ? e.message : e}`);
    }
    await new Promise((r) => setTimeout(r, PAUSA_MS));
  }
  console.log(`\nConcluído: ${ok} alterado(s), ${falhas} falha(s).`);

  // Verifica se o Omie realmente aceitou mudar "inativo" (a doc diz que é leitura)
  if (inativosPendentes.length) {
    console.log('\nVerificando se o campo "inativo" foi aceito...');
    const depois = new Map((await listarTodosServicos(env)).map((s) => [String(s.intListar.nCodServ), s.info?.inativo ?? 'N']));
    const ignorados = inativosPendentes.filter((cod) => {
      const row = rows.find((r) => r.nCodServ === cod);
      return row && depois.get(cod) !== row.inativo.toUpperCase();
    });
    if (ignorados.length) {
      console.warn(`AVISO: o Omie IGNOROU a mudança de "inativo" em ${ignorados.length} serviço(s) (nCodServ: ${ignorados.join(', ')}).`);
      console.warn('Inativar/reativar não é suportado pela API — precisa ser feito na tela do Omie.');
    } else {
      console.log('OK: mudanças de "inativo" foram aceitas.');
    }
  }
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
