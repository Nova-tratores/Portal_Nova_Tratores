// Move as fotos ANTIGAS do checklist de veículo do bucket público `requisicoes`
// (checklist/<id>/<item>.jpg) para o privado `frota-checklist`, troca o
// foto_url para a referência "frota-checklist/<caminho>" (itens do checklist e
// pendências que herdaram a foto) e apaga a cópia pública.
// Rodar só com portal e NT Mecânico já publicados (eles assinam a referência).
//   node scripts/frota-checklist-fotos-privadas.mjs           -> simula
//   node scripts/frota-checklist-fotos-privadas.mjs --gravar  -> faz
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)
  .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, '')]));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const GRAVAR = process.argv.includes('--gravar');
const MARCA = '/object/public/requisicoes/';

const itens = [];
for (let de = 0; ; de += 1000) {
  const { data, error } = await sb.from('veiculo_checklist_itens').select('id, foto_url')
    .like('foto_url', `%${MARCA}checklist/%`).order('id').range(de, de + 999);
  if (error) throw error;
  itens.push(...data);
  if (data.length < 1000) break;
}
console.log(`${itens.length} foto(s) de checklist no bucket público${GRAVAR ? '' : ' (simulação — use --gravar)'}`);

if (GRAVAR) {
  const { error: eb } = await sb.storage.createBucket('frota-checklist', { public: false });
  if (eb && !/already exists/i.test(eb.message)) console.log('bucket:', eb.message);
}

let movidas = 0, falhas = 0;
const apagar = [];
for (const it of itens) {
  const caminho = decodeURIComponent(it.foto_url.split(MARCA)[1].split('?')[0]);
  const ref = `frota-checklist/${caminho}`;
  if (!GRAVAR) { movidas++; continue; }
  const { data: arq, error: ed } = await sb.storage.from('requisicoes').download(caminho);
  if (ed) { falhas++; console.log('baixar', caminho, ed.message); continue; }
  const { error: eu } = await sb.storage.from('frota-checklist').upload(caminho, arq, { upsert: true, contentType: arq.type || 'image/jpeg' });
  if (eu) { falhas++; console.log('subir', caminho, eu.message); continue; }
  await sb.from('veiculo_checklist_itens').update({ foto_url: ref }).eq('id', it.id);
  await sb.from('frota_pendencias').update({ foto_url: ref }).eq('foto_url', it.foto_url);
  apagar.push(caminho);
  movidas++;
}
if (GRAVAR) {
  for (let i = 0; i < apagar.length; i += 100) {
    const { error } = await sb.storage.from('requisicoes').remove(apagar.slice(i, i + 100));
    if (error) console.log('apagar', error.message);
  }
}
console.log(`${GRAVAR ? 'movidas' : 'a mover'}: ${movidas} · falhas: ${falhas}${GRAVAR ? ` · públicas apagadas: ${apagar.length}` : ''}`);
