// Importa CSVs/XLS de abastecimento direto no Supabase (mesma lógica do route
// /api/abastecimento/upload, sem passar pela API). Aceita os dois formatos
// que o parser reconhece (operadora e relatório DBTrans "Por Veículo").
// Arquivos .xls/.xlsx são convertidos pra CSV em memória; células numéricas
// vêm formatadas em US com "$" ($5.07, $163,848) e são normalizadas pra BR.
//
// Uso:  npx tsx scripts/importar-abastecimento-csv.ts [--dry-run] arquivo1.csv arquivo2.xls ...
//
// --dry-run: só parseia e mostra o resumo (nada é gravado).

import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { decodificarCsv, normalizarPlaca, parseCsvAbastecimento } from '../src/lib/abastecimento/parse';
import type { LinhaAbastecimento } from '../src/lib/abastecimento/tipos';

// Converte a 1ª planilha do .xls/.xlsx pra texto CSV no dialeto que o parser
// espera (números BR). Células "$5.07"/"$163,848" (formato US) viram "5,07"/"163848".
function xlsParaCsv(caminho: string): string {
  const wb = XLSX.readFile(caminho);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const grade: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
  return grade
    .map((row) =>
      row
        .map((cel) => {
          let s = String(cel ?? '');
          if (/^\(?-?\$/.test(s)) s = s.replace(/[$()]/g, '').replace(/,/g, '').replace('.', ',');
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(','),
    )
    .join('\n');
}

const CHUNK = 500;

function lerEnvLocal(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const linha of readFileSync(resolve(__dirname, '../.env.local'), 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const arquivos = args.filter((a) => a !== '--dry-run');
  if (!arquivos.length) {
    console.error('Uso: npx tsx scripts/importar-abastecimento-csv.ts [--dry-run] arquivo.csv ...');
    process.exit(1);
  }

  const env = lerEnvLocal();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  // frota (Placas.NumPlaca = "TIPO-PLACA") para resolver id_placa
  const { data: placasFrota, error: errPlacas } = await supabase.from('Placas').select('IdPlaca, NumPlaca');
  if (errPlacas) throw new Error(`Erro ao ler Placas: ${errPlacas.message}`);
  const mapaFrota = new Map<string, number>();
  for (const p of placasFrota || []) {
    const partes = String(p.NumPlaca || '').split(/[-–]/);
    const placa = normalizarPlaca(partes[1] || partes[0]);
    if (placa) mapaFrota.set(placa, p.IdPlaca);
  }

  for (const caminho of arquivos) {
    const nome = basename(caminho);
    console.log(`\n=== ${nome} ===`);
    const texto = /\.xlsx?$/i.test(caminho) ? xlsParaCsv(caminho) : decodificarCsv(readFileSync(caminho));
    const { linhas, erros, duplicadasArquivo } = parseCsvAbastecimento(texto);
    const totalLinhas = linhas.length + erros.length + duplicadasArquivo;

    const desconhecidas = new Map<string, number>();
    for (const l of linhas) {
      l.id_placa = mapaFrota.get(l.placa) ?? null;
      if (l.id_placa == null) desconhecidas.set(l.placa, (desconhecidas.get(l.placa) || 0) + 1);
    }

    const datas = linhas.map((l) => l.data_transacao).sort();
    console.log(`linhas válidas: ${linhas.length} | erros: ${erros.length} | dup no arquivo: ${duplicadasArquivo}`);
    console.log(`período: ${datas[0]} → ${datas[datas.length - 1]}`);
    const porComb = new Map<string, number>();
    const porPlaca = new Map<string, number>();
    for (const l of linhas) {
      porComb.set(l.combustivel || '?', (porComb.get(l.combustivel || '?') || 0) + 1);
      porPlaca.set(l.placa, (porPlaca.get(l.placa) || 0) + 1);
    }
    console.log('por combustível:', Object.fromEntries(porComb));
    console.log(`veículos (${porPlaca.size}):`, Object.fromEntries(porPlaca));
    if (desconhecidas.size) console.log('placas fora da tabela Placas:', Object.fromEntries(desconhecidas));
    if (erros.length) {
      console.log('erros (até 10):');
      for (const e of erros.slice(0, 10)) console.log(`  linha ${e.linha}: ${e.motivo}`);
    }
    if (dryRun) continue;

    // lote + inserts com dedup (ON CONFLICT DO NOTHING pela chave placa+data+litros)
    const { data: lote, error: errLote } = await supabase
      .from('abastecimento_lotes')
      .insert({ arquivo_nome: nome, enviado_por: 'importar-abastecimento-csv (script)', total_linhas: totalLinhas, erros: erros.length })
      .select('id')
      .single();
    if (errLote || !lote) throw new Error(`Erro ao criar lote: ${errLote?.message}`);

    let novos = 0;
    for (let i = 0; i < linhas.length; i += CHUNK) {
      const chunk = linhas.slice(i, i + CHUNK).map((l: LinhaAbastecimento) => ({ ...l, lote_id: lote.id }));
      const { data, error } = await supabase
        .from('abastecimentos')
        .upsert(chunk, { onConflict: 'placa,data_transacao,litros', ignoreDuplicates: true })
        .select('id');
      if (error) {
        await supabase.from('abastecimento_lotes').delete().eq('id', lote.id);
        throw new Error(`Erro ao inserir (lote ${lote.id} desfeito): ${error.message}`);
      }
      novos += data?.length || 0;
    }
    await supabase
      .from('abastecimento_lotes')
      .update({ novos, duplicados: linhas.length - novos + duplicadasArquivo, periodo_min: datas[0], periodo_max: datas[datas.length - 1] })
      .eq('id', lote.id);
    console.log(`✔ lote ${lote.id}: ${novos} novos, ${linhas.length - novos + duplicadasArquivo} duplicados`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
