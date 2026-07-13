// Exporta o cadastro de serviços do Omie (conta NOVA) para um CSV editável.
// Fluxo de alteração em massa: exportar → editar o CSV no Excel → aplicar com
// scripts/servicos-omie-aplicar.ts (que compara e só altera o que mudou).
//
// Uso:  npx tsx scripts/servicos-omie-exportar.ts [saida.csv]
//       (default: scripts/servicos-omie.csv)
//
// CSV com ";" e vírgula decimal (abre direto no Excel pt-BR, UTF-8 com BOM).
// A coluna nCodServ é a chave — NÃO editar. As demais são editáveis.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OMIE_URL = 'https://app.omie.com.br/api/v1/servicos/servico/';

export function lerEnvLocal(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const linha of readFileSync(resolve(__dirname, '../.env.local'), 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

export interface ServicoOmie {
  cabecalho: {
    cCodigo: string; cDescricao: string; cIdTrib: string; nPrecoUnit: number;
    cCodLC116: string; cCodServMun: string; cCodCateg: string; nIdNBS: string;
    cTipoDesc: string; nAliqDesc: number; nValorDesc: number;
  };
  descricao: { cDescrCompleta: string };
  impostos: Record<string, string | number | boolean>;
  info: { inativo: 'S' | 'N' };
  intListar: { nCodServ: number; cCodIntServ: string };
}

export async function omieCall<T>(env: Record<string, string>, call: string, param: object): Promise<T> {
  const res = await fetch(OMIE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      call,
      app_key: env.OMIE_APP_KEY || env.OMIE_APP_KEY_NOVA,
      app_secret: env.OMIE_APP_SECRET || env.OMIE_APP_SECRET_NOVA,
      param: [param],
    }),
  });
  const json = await res.json();
  if (json.faultstring) throw new Error(`Omie [${call}]: ${json.faultstring}`);
  return json as T;
}

export async function listarTodosServicos(env: Record<string, string>): Promise<ServicoOmie[]> {
  const servicos: ServicoOmie[] = [];
  let pagina = 1;
  let totPaginas = 1;
  do {
    const r = await omieCall<{ nTotPaginas: number; cadastros?: ServicoOmie[] }>(
      env, 'ListarCadastroServico', { nPagina: pagina, nRegPorPagina: 50 },
    );
    totPaginas = r.nTotPaginas;
    servicos.push(...(r.cadastros || []));
    pagina++;
    if (pagina <= totPaginas) await new Promise((r2) => setTimeout(r2, 300)); // rate limit Omie
  } while (pagina <= totPaginas);
  return servicos;
}

// Colunas do CSV: [rótulo, extrator]. A ordem aqui define a ordem no arquivo.
export const COLUNAS: Array<[string, (s: ServicoOmie) => string | number]> = [
  ['nCodServ', (s) => s.intListar.nCodServ],
  ['inativo', (s) => s.info?.inativo ?? 'N'],
  ['cCodigo', (s) => s.cabecalho.cCodigo],
  ['cDescricao', (s) => s.cabecalho.cDescricao],
  ['cDescrCompleta', (s) => s.descricao?.cDescrCompleta ?? ''],
  ['nPrecoUnit', (s) => s.cabecalho.nPrecoUnit],
  ['cIdTrib', (s) => s.cabecalho.cIdTrib],
  ['cCodLC116', (s) => s.cabecalho.cCodLC116],
  ['cCodServMun', (s) => s.cabecalho.cCodServMun],
  ['cCodCateg', (s) => s.cabecalho.cCodCateg],
  ['nAliqISS', (s) => Number(s.impostos?.nAliqISS ?? 0)],
  ['cRetISS', (s) => String(s.impostos?.cRetISS ?? 'N')],
  ['nAliqPIS', (s) => Number(s.impostos?.nAliqPIS ?? 0)],
  ['cRetPIS', (s) => String(s.impostos?.cRetPIS ?? 'N')],
  ['nAliqCOFINS', (s) => Number(s.impostos?.nAliqCOFINS ?? 0)],
  ['cRetCOFINS', (s) => String(s.impostos?.cRetCOFINS ?? 'N')],
  ['nAliqCSLL', (s) => Number(s.impostos?.nAliqCSLL ?? 0)],
  ['cRetCSLL', (s) => String(s.impostos?.cRetCSLL ?? 'N')],
  ['nAliqIR', (s) => Number(s.impostos?.nAliqIR ?? 0)],
  ['cRetIR', (s) => String(s.impostos?.cRetIR ?? 'N')],
  ['nAliqINSS', (s) => Number(s.impostos?.nAliqINSS ?? 0)],
  ['cRetINSS', (s) => String(s.impostos?.cRetINSS ?? 'N')],
];

function celula(v: string | number): string {
  if (typeof v === 'number') return String(v).replace('.', ','); // decimal BR
  return /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

async function main() {
  const saida = resolve(process.argv[2] || resolve(__dirname, 'servicos-omie.csv'));
  const env = lerEnvLocal();

  console.log('Listando serviços do Omie (conta NOVA)...');
  const servicos = await listarTodosServicos(env);

  const linhas = [COLUNAS.map(([rotulo]) => rotulo).join(';')];
  for (const s of servicos) linhas.push(COLUNAS.map(([, fn]) => celula(fn(s))).join(';'));
  writeFileSync(saida, '﻿' + linhas.join('\r\n'), 'utf8'); // BOM p/ Excel abrir como UTF-8

  const inativos = servicos.filter((s) => s.info?.inativo === 'S').length;
  console.log(`OK: ${servicos.length} serviços exportados (${inativos} inativos) → ${saida}`);
}

if (require.main === module) {
  main().catch((e) => { console.error(e.message || e); process.exit(1); });
}
