/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// INTELIGÊNCIA DE VENDAS — empresas rurais NOVAS da região (ideia 16).
//
// Lê os dados abertos do CNPJ da Receita (compartilhamento público, sai 1x por
// mês), sem guardar os arquivos: baixa cada zip em fluxo, filtra e descarta.
//   Estabelecimentos0..9.zip (~5 GB) → ativos, nos municípios da loja, CNAE
//   principal de agricultura/pecuária/apoio (01xx, 02xx) e abertos nos
//   últimos N meses
//   Empresas0..9.zip (~1,3 GB) → razão social e porte dos que passaram
// e grava em iv_cnpj (origem 'receita'). Precisa de sql/inteligencia-vendas.sql.
//
// Uso:  npx tsx scripts/iv-cnpj-novos.ts [--mes 2026-10] [--meses 24] [--gravar]
//       sem --gravar só mostra quantos acharia (simulação).
// Demora: 30–60 min dependendo da internet.
// =============================================================================
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import readline from 'node:readline';
import { createRequire } from 'node:module';

// unzipper não tem tipos publicados.
const unzipper: any = createRequire(import.meta.url)('unzipper');

const BASE = 'https://arquivos.receitafederal.gov.br/public.php/dav/files/gn672Ad4CF8N6TK/Dados/Cadastros/CNPJ';
const args = process.argv.slice(2);
const arg = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const GRAVAR = args.includes('--gravar');
const MESES = Number(arg('--meses') || 24);

function env(k: string): string {
  const txt = readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
  const m = txt.match(new RegExp(`^${k}=(.*)$`, 'm'));
  return (m?.[1] || process.env[k] || '').replace(/["\r]/g, '').trim();
}
const SUPA = env('NEXT_PUBLIC_SUPABASE_URL');
const KEY = env('SUPABASE_SERVICE_ROLE_KEY');

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

async function ultimoMes(): Promise<string> {
  const r = await fetch(`${BASE}/`, { method: 'PROPFIND', headers: { Depth: '1' } });
  const meses = [...(await r.text()).matchAll(/CNPJ\/(\d{4}-\d{2})\//g)].map((m) => m[1]).sort();
  if (!meses.length) throw new Error('Não achei os meses no compartilhamento da Receita');
  return meses[meses.length - 1];
}

/** Linhas de um CSV dentro de um zip remoto (latin1, ';', aspas). */
async function* linhasDoZip(url: string): AsyncGenerator<string[]> {
  const r = await fetch(url);
  if (!r.ok || !r.body) throw new Error(`${url}: HTTP ${r.status}`);
  const entrada = Readable.fromWeb(r.body as any).pipe(unzipper.ParseOne());
  entrada.setEncoding('latin1');
  const rl = readline.createInterface({ input: entrada, crlfDelay: Infinity });
  for await (const linha of rl) {
    if (!linha) continue;
    yield linha.slice(1, -1).split('";"');
  }
}

async function main() {
  const mes = arg('--mes') || await ultimoMes();
  const corte = new Date(Date.now() - MESES * 30.44 * 86_400_000).toISOString().slice(0, 10).replace(/-/g, '');
  const lista = JSON.parse(readFileSync(path.join(process.cwd(), 'docs/agro/municipios-nova.json'), 'utf8')).municipios as { ibge: number; nome: string }[];
  const alvo = new Map(lista.map((m) => [norm(m.nome), m.ibge]));
  console.log(`Receita ${mes} · ${alvo.size} municípios · abertos desde ${corte} · ${GRAVAR ? 'GRAVANDO' : 'simulação'}`);

  // Código de município da Receita (SIAFI) → IBGE, pelo nome.
  const munReceita = new Map<string, { ibge: number; nome: string }>();
  for await (const c of linhasDoZip(`${BASE}/${mes}/Municipios.zip`)) {
    const ib = alvo.get(norm(c[1]));
    if (ib) munReceita.set(c[0], { ibge: ib, nome: c[1] });
  }
  const cnaes = new Map<string, string>();
  for await (const c of linhasDoZip(`${BASE}/${mes}/Cnaes.zip`)) cnaes.set(c[0], c[1]);
  console.log(`municípios casados: ${munReceita.size}/${alvo.size}`);

  const achados = new Map<string, any>(); // cnpj_basico → registro
  for (let i = 0; i < 10; i++) {
    let n = 0;
    for await (const c of linhasDoZip(`${BASE}/${mes}/Estabelecimentos${i}.zip`)) {
      n++;
      if (c[19] !== 'SP' && c[19] !== 'PR') continue;
      const mun = munReceita.get(c[20]);
      if (!mun || c[5] !== '02') continue; // 02 = ativa
      if (!/^0[12]/.test(c[11])) continue;
      if ((c[10] || '') < corte) continue;
      const cnpj = `${c[0]}${c[1]}${c[2]}`;
      achados.set(c[0], {
        cnpj, nome_fantasia: c[4] || null, cnae_codigo: c[11], cnae_descricao: cnaes.get(c[11]) || null,
        cnaes_secundarios: c[12] ? c[12].split(',').map((x) => ({ codigo: x, descricao: cnaes.get(x) || null })) : [],
        data_inicio: `${c[10].slice(0, 4)}-${c[10].slice(4, 6)}-${c[10].slice(6, 8)}`, situacao: 'ATIVA',
        municipio: mun.nome, uf: c[19], municipio_ibge: mun.ibge,
        telefone: c[21] && c[22] ? `(${c[21]}) ${c[22]}` : null, origem: 'receita',
      });
    }
    console.log(`Estabelecimentos${i}: ${n.toLocaleString('pt-BR')} lidos · ${achados.size} achados até aqui`);
  }

  const PORTE: Record<string, string> = { '01': 'Micro empresa', '03': 'Empresa de pequeno porte', '05': 'Demais', '00': 'Não informado' };
  for (let i = 0; i < 10 && achados.size; i++) {
    for await (const c of linhasDoZip(`${BASE}/${mes}/Empresas${i}.zip`)) {
      const a = achados.get(c[0]);
      if (a) { a.razao_social = c[1]; a.porte = PORTE[c[5]] || c[5] || null; }
    }
    console.log(`Empresas${i}: ok`);
  }

  const regs = [...achados.values()].map((a) => ({ ...a, consultado_em: new Date().toISOString() }));
  console.log(`Total: ${regs.length} empresas rurais abertas nos últimos ${MESES} meses`);
  if (!GRAVAR) { console.log(regs.slice(0, 10)); return; }
  for (let i = 0; i < regs.length; i += 200) {
    const r = await fetch(`${SUPA}/rest/v1/iv_cnpj?on_conflict=cnpj`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(regs.slice(i, i + 200)),
    });
    if (!r.ok) throw new Error(`gravar: ${r.status} ${await r.text()}`);
  }
  console.log('Gravado em iv_cnpj.');
}

main().catch((e) => { console.error(e); process.exit(1); });
