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
const ARQ_EVENTOS = "cameras/eventos.json"; // histórico separado do batimento
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
  const [config, status, eventosArq] = await Promise.all([
    lerJson(ARQ_CONFIG),
    lerJson(ARQ_STATUS),
    lerJson(ARQ_EVENTOS),
  ]);
  // Eventos: primeiro do BANCO (fonte oficial); JSON é a reserva
  let eventos: unknown[] = Array.isArray(eventosArq?.eventos) ? (eventosArq.eventos as unknown[]) : [];
  try {
    const { data: doBanco, error } = await supabase
      .from("cameras_eventos")
      .select("quando,canal,codigo,foto_url")
      .order("quando", { ascending: false })
      .limit(40);
    if (!error && doBanco) {
      eventos = doBanco.map((e) => ({
        quando: e.quando, canal: e.canal, codigo: e.codigo, fotoUrl: e.foto_url,
      }));
    }
  } catch { /* tabela ausente — fica no JSON */ }
  // no-store: nenhum navegador/proxy segura a lista de disparos antiga
  return NextResponse.json(
    { config, status: status ? { ...status, eventos } : null },
    { headers: { "Cache-Control": "no-store" } }
  );
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
// Canal 4 fica SÓ com a detecção do DVR (decisão do usuário 26/08 —
// sem IA de pessoa; a foto ainda vai pro log).
const FILTROS: Record<number, "trator" | "pessoa"> = { 5: "trator" };

const PERGUNTAS: Record<string, string> = {
  trator: "Responda APENAS 'sim' ou 'nao'. Há um TRATOR ou máquina agrícola (não vale carro, caminhonete, moto ou caminhão comum) visível nesta imagem de câmera de segurança?",
  pessoa: "Responda APENAS 'sim' ou 'nao'. Há uma PESSOA (ser humano em pé ou andando; não vale cachorro, carro ou sombra) visível nesta imagem de câmera de segurança?",
};

async function fotoTemAlvo(alvo: "trator" | "pessoa", fotoBase64: string): Promise<boolean | null> {
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
            { type: "text", text: PERGUNTAS[alvo] },
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
    // Canal com filtro de IA: só segue se a foto tiver o alvo.
    // Sem chave/sem resposta da IA, deixa passar como movimento comum.
    const alvoFiltro = body.evento?.canal ? FILTROS[Number(body.evento.canal)] : undefined;
    if (alvoFiltro && body.foto) {
      const tem = await fotoTemAlvo(alvoFiltro, String(body.foto));
      if (tem === false) return NextResponse.json({ ok: true, filtrado: true });
      if (tem === true) body.evento.codigo = alvoFiltro === "trator" ? "Trator" : "Pessoa";
    }

    // ── EVENTO: histórico vive em arquivo PRÓPRIO (eventos.json), só
    // tocado quando chega disparo — batimento não consegue mais zerar a
    // lista. Leitura com repique: falhou uma vez, tenta de novo.
    if (body.evento && body.evento.canal) {
      const canal = Number(body.evento.canal);
      const arq = (await lerJson(ARQ_EVENTOS)) ?? (await lerJson(ARQ_EVENTOS)) ?? {};
      const eventos = Array.isArray(arq.eventos) ? (arq.eventos as Record<string, unknown>[]) : [];

      // Foto do disparo → storage (público), com URL guardada no evento
      let fotoUrl: string | null = null;
      let fotoPath: string | null = null;
      if (body.foto) {
        try {
          const buf = Buffer.from(String(body.foto), "base64");
          if (buf.length > 0 && buf.length < 512000) {
            fotoPath = `cameras/fotos/${Date.now()}-c${canal}.jpg`;
            const { error } = await supabase.storage
              .from(BUCKET)
              .upload(fotoPath, buf, { contentType: "image/jpeg", upsert: true, cacheControl: "3600" });
            if (!error) {
              fotoUrl = supabase.storage.from(BUCKET).getPublicUrl(fotoPath).data.publicUrl;
            } else fotoPath = null;
          }
        } catch { /* sem foto — o disparo entra mesmo assim */ }
      }

      const codigoEv = String(body.evento.codigo || "VideoMotion");
      eventos.unshift({
        quando: new Date().toISOString(),
        canal,
        codigo: codigoEv,
        fotoUrl,
        fotoPath,
      });

      // BANCO (fonte oficial — planos futuros com os tratores usam daqui):
      // insert best-effort; se a tabela ainda não existir, o JSON segura.
      try {
        await supabase.from("cameras_eventos").insert({
          canal, codigo: codigoEv, foto_url: fotoUrl, foto_path: fotoPath,
        });
        // Limpeza: movimento comum some depois de 90 dias (foto junto);
        // TRATOR fica pra sempre.
        const corte = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
        const { data: velhos } = await supabase
          .from("cameras_eventos")
          .delete()
          .lt("quando", corte)
          .neq("codigo", "Trator")
          .select("foto_path");
        const fotosAntigas = (velhos || [])
          .map((v: { foto_path: string | null }) => v.foto_path)
          .filter((p: string | null): p is string => !!p && p.startsWith("cameras/fotos/"));
        if (fotosAntigas.length) {
          supabase.storage.from(BUCKET).remove(fotosAntigas).then(() => {}, () => {});
        }
      } catch { /* tabela ausente — rode sql de cameras_eventos */ }

      // Mantém as últimas MAX_EVENTOS e apaga as fotos que caíram fora
      const cortados = eventos.slice(MAX_EVENTOS);
      const fotosVelhas = cortados
        .map((e) => e.fotoPath)
        .filter((p): p is string => typeof p === "string" && p.startsWith("cameras/fotos/"));
      if (fotosVelhas.length) {
        supabase.storage.from(BUCKET).remove(fotosVelhas).then(() => {}, () => {});
      }
      await gravarJson(ARQ_EVENTOS, { eventos: eventos.slice(0, MAX_EVENTOS) });

      // Tempo real: quem estiver com o portal aberto vê a linha (e a foto)
      // pingar na hora — o toque agora é opcional (SIM Play cuida do som).
      try {
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
        await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/realtime/v1/api/broadcast`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            messages: [{
              topic: "vigia-cameras",
              event: "movimento",
              payload: { canal, codigo: String(body.evento.codigo || "VideoMotion"), fotoUrl },
            }],
          }),
        });
      } catch { /* realtime fora do ar — o polling cobre */ }
    }

    // Batimento: só o "estou vivo" + canais (nunca mexe no histórico)
    await gravarJson(ARQ_STATUS, {
      atualizadoEm: new Date().toISOString(),
      canais: Array.isArray(body.canais) ? body.canais : [],
    });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
