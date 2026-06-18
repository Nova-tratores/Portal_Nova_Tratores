// Provider de IA centralizado — escolhe OpenAI (GPT) ou Groq por variável de ambiente.
// Ambos usam o mesmo formato (Chat Completions estilo OpenAI), então o resto do código não muda.
//
// .env.local:
//   AI_PROVIDER=openai            (ou "groq"; se ausente, usa openai quando houver OPENAI_API_KEY)
//   OPENAI_API_KEY=sk-...         (chave da OpenAI)
//   OPENAI_MODEL=gpt-4o-mini      (opcional; padrão gpt-4o-mini)
//   GROQ_API_KEY=gsk_...          (fallback, se quiser voltar pro Groq)
//   GROQ_MODEL=llama-3.3-70b-versatile  (opcional)

function resolver() {
  const provider = (process.env.AI_PROVIDER || (process.env.OPENAI_API_KEY ? "openai" : "groq")).toLowerCase();
  if (provider === "openai") {
    return {
      provider: "openai" as const,
      url: "https://api.openai.com/v1/chat/completions",
      key: process.env.OPENAI_API_KEY || "",
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    };
  }
  return {
    provider: "groq" as const,
    url: "https://api.groq.com/openai/v1/chat/completions",
    key: process.env.GROQ_API_KEY || "",
    model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
  };
}

export function getIA() {
  return resolver();
}

// Chama o provider atual. body no formato OpenAI (messages, tools, etc.); o model é preenchido se faltar.
export async function chamarIA(body: any) {
  const ia = resolver();
  if (!ia.key) throw new Error("ia sem chave (configure OPENAI_API_KEY ou GROQ_API_KEY)");
  const r = await fetch(ia.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ia.key}` },
    body: JSON.stringify({ ...body, model: body.model || ia.model }),
  });
  if (!r.ok) throw new Error("ia " + r.status + " " + (await r.text()).slice(0, 200));
  return r.json();
}
