// Provider de IA: OpenAI (GPT). Formato Chat Completions estilo OpenAI.
//
// .env.local:
//   OPENAI_API_KEY=sk-...         (chave da OpenAI — obrigatória)
//   OPENAI_MODEL=gpt-4o-mini      (opcional; padrão gpt-4o-mini)

function resolver() {
  return {
    provider: "openai" as const,
    url: "https://api.openai.com/v1/chat/completions",
    key: process.env.OPENAI_API_KEY || "",
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
  };
}

export function getIA() {
  return resolver();
}

// Chama o provider atual. body no formato OpenAI (messages, tools, etc.); o model é preenchido se faltar.
export async function chamarIA(body: any) {
  const ia = resolver();
  if (!ia.key) throw new Error("ia sem chave (configure OPENAI_API_KEY)");
  const r = await fetch(ia.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ia.key}` },
    body: JSON.stringify({ ...body, model: body.model || ia.model }),
  });
  if (!r.ok) throw new Error("ia " + r.status + " " + (await r.text()).slice(0, 200));
  return r.json();
}
