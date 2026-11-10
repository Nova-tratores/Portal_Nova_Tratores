// Tira as assinaturas em base64 de dentro de Ordem_Servico_Tecnicos (10/11/2026).
//
// O app do técnico gravava AssCliente/AssTecnico como data URI na própria linha (foto da assinatura com até
// 7 MB): 150 MB numa tabela de 452 linhas. Este script sobe cada uma para o storage (bucket `requisicoes`,
// pasta `os-tecnicos/<OS>/`, a mesma das fotos) e troca o valor pelo link público. Foto grande (> 400 KB)
// é reduzida para 1600 px / JPEG 80 antes de subir. As telas (portal e app) já aceitam link.
//
//   npx tsx --env-file=.env.local scripts/os-tecnicos-assinaturas-storage.ts            (simula)
//   npx tsx --env-file=.env.local scripts/os-tecnicos-assinaturas-storage.ts --gravar   (grava)
//
// Pode rodar de novo: só mexe no que ainda começa com "data:". Antes de gravar, relê a linha e confere que o
// valor não mudou (o técnico pode ter reenviado o relatório no meio).
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const GRAVAR = process.argv.includes("--gravar");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BUCKET = "requisicoes";
const CAMPOS = ["AssCliente", "AssTecnico"] as const;
const LIMITE_SEM_MEXER = 400_000;

function decodificar(dataUri: string): { mime: string; buf: Buffer } | null {
  const m = /^data:([^;,]+)(;base64)?,([\s\S]*)$/.exec(dataUri); // [\s\S] = a flag /s, que o target do projeto não aceita
  if (!m || !m[2]) return null;
  return { mime: m[1].toLowerCase(), buf: Buffer.from(m[3], "base64") };
}

async function preparar(mime: string, buf: Buffer): Promise<{ buf: Buffer; mime: string; ext: string }> {
  if (buf.length > LIMITE_SEM_MEXER) {
    try {
      const reduzida = await sharp(buf).rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
        .flatten({ background: "#ffffff" }).jpeg({ quality: 80 }).toBuffer();
      if (reduzida.length < buf.length) return { buf: reduzida, mime: "image/jpeg", ext: "jpg" };
    } catch { /* imagem que o sharp não lê: sobe como está */ }
  }
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  return { buf, mime, ext };
}

(async () => {
  console.log(GRAVAR ? "== GRAVANDO ==" : "== SIMULAÇÃO (use --gravar para gravar) ==");
  const ids: { IdOs: number; Ordem_Servico: string }[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase.from("Ordem_Servico_Tecnicos").select("IdOs, Ordem_Servico")
      .order("IdOs").range(de, de + 999);
    if (error) throw new Error(error.message);
    ids.push(...((data || []) as typeof ids));
    if (!data || data.length < 1000) break;
  }
  console.log(`${ids.length} relatórios`);

  let movidas = 0, antes = 0, depois = 0, falhas = 0;
  for (const { IdOs, Ordem_Servico } of ids) {
    const { data: linha, error } = await supabase.from("Ordem_Servico_Tecnicos")
      .select("AssCliente, AssTecnico").eq("IdOs", IdOs).maybeSingle();
    if (error || !linha) { console.log(`  #${IdOs}: erro ao ler (${error?.message || "sumiu"})`); falhas++; continue; }
    const novo: Record<string, string> = {};
    for (const campo of CAMPOS) {
      const v = String((linha as Record<string, unknown>)[campo] || "");
      if (!v.startsWith("data:")) continue;
      const d = decodificar(v);
      if (!d) { console.log(`  #${IdOs} ${campo}: data URI sem base64, pulado`); continue; }
      const p = await preparar(d.mime, d.buf);
      antes += v.length;
      const caminho = `os-tecnicos/${Ordem_Servico || `sem-os-${IdOs}`}/${campo}_migr_${IdOs}.${p.ext}`;
      const url = supabase.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl;
      depois += url.length;
      console.log(`  #${IdOs} ${Ordem_Servico} ${campo}: ${(v.length / 1024).toFixed(0)} KB na linha → arquivo ${(p.buf.length / 1024).toFixed(0)} KB`);
      if (!GRAVAR) { novo[campo] = url; continue; }
      const up = await supabase.storage.from(BUCKET).upload(caminho, p.buf, { upsert: true, contentType: p.mime });
      if (up.error) { console.log(`    falhou o upload: ${up.error.message}`); falhas++; continue; }
      novo[campo] = url;
    }
    if (!Object.keys(novo).length) continue;
    if (GRAVAR) {
      // relê: se o técnico reenviou no meio, não sobrescreve
      const { data: agora } = await supabase.from("Ordem_Servico_Tecnicos").select("AssCliente, AssTecnico").eq("IdOs", IdOs).maybeSingle();
      for (const campo of Object.keys(novo)) {
        if (String((agora as Record<string, unknown> | null)?.[campo] || "") !== String((linha as Record<string, unknown>)[campo] || "")) {
          console.log(`    #${IdOs} ${campo} mudou no meio, não gravado`); delete novo[campo];
        }
      }
      if (!Object.keys(novo).length) continue;
      const { error: e2 } = await supabase.from("Ordem_Servico_Tecnicos").update(novo).eq("IdOs", IdOs);
      if (e2) { console.log(`    falhou gravar a linha: ${e2.message}`); falhas++; continue; }
    }
    movidas += Object.keys(novo).length;
  }
  console.log(`\n${GRAVAR ? "Movidas" : "A mover"}: ${movidas} assinaturas · na tabela ${(antes / 1048576).toFixed(1)} MB → ${(depois / 1024).toFixed(0)} KB · falhas ${falhas}`);
})().catch((e) => { console.error(e); process.exit(1); });
