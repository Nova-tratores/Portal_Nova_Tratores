import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { autenticar } from "@/lib/auth/server";

// Vigia das câmeras (script na loja que escuta o DVR Intelbras):
// - GET  (usuário do portal): status + configuração
// - POST (usuário do portal): salva a configuração (canais/toque/volume…)
// - PUT  (o script, com token): batimento + eventos disparados
// Tudo guardado como JSON no bucket público `anexos`, pasta cameras/
// (o script lê a config pela URL pública — sem chave nenhuma na loja).
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ""
);

const BUCKET = "anexos";
const ARQ_CONFIG = "cameras/config.json";
const ARQ_STATUS = "cameras/status.json";
const TOKEN_VIGIA = process.env.CAMERAS_TOKEN || "vigia-nt-6049";
const MAX_EVENTOS = 40;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function lerJson(caminho: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(caminho);
  if (error || !data) return null;
  try { return JSON.parse(await data.text()); } catch { return null; }
}

async function gravarJson(caminho: string, obj: unknown) {
  const buf = Buffer.from(JSON.stringify(obj, null, 1));
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(caminho, buf, { contentType: "application/json", upsert: true, cacheControl: "0" });
  if (error) throw new Error(error.message);
}

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const [config, status] = await Promise.all([lerJson(ARQ_CONFIG), lerJson(ARQ_STATUS)]);
  return NextResponse.json({ config, status });
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  try {
    const body = await req.json();
    const canais = Array.isArray(body.canais)
      ? body.canais.map((c: unknown) => Number(c)).filter((c: number) => c >= 1 && c <= 16)
      : [9];
    const config = {
      ativo: body.ativo === true, // alto-falante do PC da loja (padrão: desligado)
      canais: canais.length ? canais : [4, 5],
      som: ["dingdong", "campainha", "alerta", "sino"].includes(body.som) ? body.som : "dingdong",
      volume: Math.max(0, Math.min(100, Number(body.volume) || 80)),
      cooldownSeg: Math.max(5, Math.min(600, Number(body.cooldownSeg) || 30)),
      horario: body.horario && Number.isFinite(Number(body.horario.de)) && Number.isFinite(Number(body.horario.ate))
        ? { de: Number(body.horario.de), ate: Number(body.horario.ate) }
        : null,
      atualizadoEm: new Date().toISOString(),
      por: auth.email || "",
    };
    await gravarJson(ARQ_CONFIG, config);
    return NextResponse.json({ ok: true, config });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Canais com FILTRO DE IA: o evento chega com foto e a IA de visão só
// deixa passar se o alvo aparecer. Canal 5 (Lavador) = só TRATOR.
const FILTROS: Record<number, "trator"> = { 5: "trator" };

async function fotoTemTrator(fotoBase64: string): Promise<boolean | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null; // sem chave → sem como filtrar
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        max_tokens: 3,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "Responda APENAS 'sim' ou 'nao'. Há um TRATOR ou máquina agrícola (não vale carro, caminhonete, moto ou caminhão comum) visível nesta imagem de câmera de segurança?" },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${fotoBase64}`, detail: "low" } },
          ],
        }],
      }),
    });
    const j = await r.json();
    const resposta = String(j?.choices?.[0]?.message?.content || "").toLowerCase();
    return resposta.includes("sim");
  } catch {
    return null; // OpenAI fora do ar → não bloqueia
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.token !== TOKEN_VIGIA) {
      return NextResponse.json({ error: "token inválido" }, { status: 401 });
    }
    // Canal com filtro de IA: só segue se a foto tiver o alvo (trator).
    // Sem chave/sem resposta da IA, deixa passar como movimento comum.
    if (body.evento?.canal && FILTROS[Number(body.evento.canal)] === "trator" && body.foto) {
      const tem = await fotoTemTrator(String(body.foto));
      if (tem === false) return NextResponse.json({ ok: true, filtrado: true });
      if (tem === true) body.evento.codigo = "Trator";
    }
    const atual = (await lerJson(ARQ_STATUS)) || {};
    const eventos = Array.isArray(atual.eventos) ? (atual.eventos as unknown[]) : [];
    if (body.evento && body.evento.canal) {
      eventos.unshift({
        quando: new Date().toISOString(),
        canal: Number(body.evento.canal),
        codigo: String(body.evento.codigo || "VideoMotion"),
      });
      // Avisa quem está com o portal aberto AGORA (som individual no
      // navegador de cada um) — Supabase Realtime broadcast.
      try {
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
        await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/realtime/v1/api/broadcast`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            messages: [{
              topic: "vigia-cameras",
              event: "movimento",
              payload: { canal: Number(body.evento.canal), codigo: String(body.evento.codigo || "VideoMotion") },
            }],
          }),
        });
      } catch { /* realtime fora do ar — o polling de 60s cobre */ }
    }
    // (Sem notificação no sino — decisão do usuário 26/08: o log ao vivo
    // no modal + o toque em tempo real já cobrem.)
    const status = {
      atualizadoEm: new Date().toISOString(),
      canais: Array.isArray(body.canais) ? body.canais : atual.canais || [],
      eventos: eventos.slice(0, MAX_EVENTOS),
    };
    await gravarJson(ARQ_STATUS, status);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
