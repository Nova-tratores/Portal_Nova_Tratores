// Transcrição de áudio do WhatsApp (NovaZap) na OpenAI.
// Usada pelo Tratorilson (o áudio do cliente vira texto pra IA) e pela rota
// /api/assistente/novazap/transcrever (texto embaixo do áudio no NovaZap).

const TOKEN_PADRAO = "tratorilson-nt-6049";
/** limite da OpenAI é 25 MB; fica uma folga */
const LIMITE_BYTES = 24 * 1024 * 1024;

/** O Rails do NovaZap manda o mesmo token simples do Tratorilson. */
export function tokenValidoNovazap(token: string | null | undefined): boolean {
  return !!token && token === (process.env.TRATORILSON_TOKEN || TOKEN_PADRAO);
}

/** nome com extensão: a OpenAI decide o formato por ela (o zap manda .oga/.ogg) */
export function nomeDoArquivo(url: string): string {
  const cru = (url.split("?")[0].split("/").pop() || "audio.ogg").slice(-40);
  return /\.[a-z0-9]{2,4}$/i.test(cru) ? cru : "audio.ogg";
}

// Baixa o áudio e transcreve (gpt-4o-mini-transcribe, com reserva no whisper-1).
// Devolve "" em qualquer falha — quem chama segue sem o texto.
export async function transcreverAudio(url: string): Promise<string> {
  try {
    const key = process.env.OPENAI_API_KEY || "";
    if (!key || !url) return "";
    const a = await fetch(url);
    if (!a.ok) return "";
    const buf = await a.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > LIMITE_BYTES) return "";
    const nome = nomeDoArquivo(url);
    const pedir = async (modelo: string) => {
      const fd = new FormData();
      fd.append("file", new Blob([buf]), nome);
      fd.append("model", modelo);
      fd.append("language", "pt");
      // temperatura 0 evita o modelo "inventar" texto em trecho de silêncio
      fd.append("temperature", "0");
      const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: fd,
      });
      if (!r.ok) return "";
      const j = await r.json().catch(() => ({}));
      return String(j.text || "").trim();
    };
    return (await pedir("gpt-4o-mini-transcribe")) || (await pedir("whisper-1"));
  } catch {
    return "";
  }
}
