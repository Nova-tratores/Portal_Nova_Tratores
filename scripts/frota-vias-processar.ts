// Carga do histórico das VIAS FORA DO MAPA (camada do /frota/mapa): roda o
// mesmo processamento do agendador diário (lib/frota/vias-fora-mapa-server)
// sobre um período longo, em rodadas, até não sobrar dia.
//
//   npx tsx --env-file=.env.local scripts/frota-vias-processar.ts                       (simula ontem-14 d)
//   npx tsx --env-file=.env.local scripts/frota-vias-processar.ts --desde=2026-01-01 --gravar
//   ... --ate=2026-03-31 --max-downloads=300 --forcar
//
// A primeira passada baixa a malha do OpenStreetMap de cada quadrante novo
// (Overpass, ~10–60 s cada) e guarda no bucket frota-vias-osm; as seguintes
// leem do Storage. Simular não grava trechos, mas GUARDA as malhas baixadas.
import { createClient } from '@supabase/supabase-js';
import { processarViasForaMapa } from '../src/lib/frota/vias-fora-mapa-server';

const arg = (nome: string) => process.argv.find((a) => a.startsWith(`--${nome}=`))?.split('=')[1];
const GRAVAR = process.argv.includes('--gravar');
const FORCAR = process.argv.includes('--forcar');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

(async () => {
  console.log(GRAVAR ? '== GRAVANDO ==' : '== SIMULAÇÃO (use --gravar para gravar) ==');
  let maxDownloads = Number(arg('max-downloads')) || 500;
  const tot = { ok: 0, pendentes: 0, trechos: 0, km: 0, baixados: 0 };
  let quedas = 0;
  for (let rodada = 1; rodada <= 200; rodada++) {
    let r;
    try {
      r = await processarViasForaMapa(supabase, {
      desde: arg('desde'), ate: arg('ate'),
      // simulando, o estado não é gravado: uma rodada só, com tudo
      limite: GRAVAR ? 150 : 100_000,
      maxDownloads, gravar: GRAVAR, forcar: FORCAR && rodada === 1,
      log: (m) => console.log(`  ${m}`),
      });
    } catch (e) {
      // queda de rede (fetch failed): espera e tenta de novo — o estado gravado no banco faz retomar
      if (++quedas > 30) throw e;
      console.log(`rodada ${rodada}: ${(e as Error).message} — tentando de novo em 2 min (${quedas}/30)`);
      await new Promise((res) => setTimeout(res, 120_000));
      continue;
    }
    tot.ok += r.ok; tot.pendentes += r.pendentes; tot.trechos += r.trechos; tot.km += r.kmFora; tot.baixados += r.baixados;
    maxDownloads -= r.baixados;
    console.log(`rodada ${rodada}: ${r.processados} dias (${r.ok} ok, ${r.pendentes} pendentes) · ${r.trechos} trechos · ${r.kmFora} km · ${r.baixados} malhas · faltam ${r.restantes}`);
    for (const e of r.erros) console.log(`  ! ${e}`);
    if (!GRAVAR || r.restantes === 0 || r.processados === 0) break;
    // sem malha nova possível e tudo que sobra é pendente: parar
    if (maxDownloads <= 0 && r.ok === 0) break;
  }
  console.log(`TOTAL: ${tot.ok} dias ok · ${tot.pendentes} pendentes · ${tot.trechos} trechos · ${Math.round(tot.km * 10) / 10} km fora do mapa · ${tot.baixados} malhas baixadas`);
})().catch((e) => { console.error(e); process.exit(1); });
