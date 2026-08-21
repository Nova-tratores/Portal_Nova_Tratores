// Pool de conexões IMAP por usuário — abrir conexão (TLS + login) custa 1–3s;
// reaproveitar deixa a caixa de e-mail do portal quase instantânea.
// A conexão fica viva por até 4 min sem uso e é derrubada/recriada sozinha.
import { ImapFlow } from "imapflow";

const IDLE_MS = 4 * 60 * 1000;

interface Entrada {
  client: ImapFlow;
  timer: ReturnType<typeof setTimeout> | null;
  conectando: Promise<void> | null;
}

const pool = new Map<string, Entrada>();

function derrubar(chave: string) {
  const e = pool.get(chave);
  if (!e) return;
  pool.delete(chave);
  if (e.timer) clearTimeout(e.timer);
  try { e.client.logout().catch(() => { e.client.close(); }); } catch { /* já caiu */ }
}

function agendarIdle(chave: string) {
  const e = pool.get(chave);
  if (!e) return;
  if (e.timer) clearTimeout(e.timer);
  e.timer = setTimeout(() => derrubar(chave), IDLE_MS);
}

/** Devolve uma conexão IMAP viva (reaproveitada quando possível). */
export async function pegarImap(
  userId: string,
  cfg: { smtp_host: string; email_envio: string },
  senha: string,
): Promise<ImapFlow> {
  const chave = `${userId}:${cfg.email_envio}`;
  let e = pool.get(chave);

  if (e) {
    if (e.conectando) await e.conectando.catch(() => { /* cai no recria */ });
    if (e.client.usable) { agendarIdle(chave); return e.client; }
    derrubar(chave);
  }

  const client = new ImapFlow({
    host: String(cfg.smtp_host).replace(/^smtp/i, "imap"), port: 993, secure: true,
    auth: { user: cfg.email_envio, pass: senha },
    logger: false,
    // mantém a sessão respirando (NOOP) pra não cair por inatividade
    emitLogs: false,
  });
  client.on("close", () => derrubar(chave));
  client.on("error", () => derrubar(chave));

  e = { client, timer: null, conectando: client.connect() };
  pool.set(chave, e);
  try {
    await e.conectando;
  } catch (err) {
    derrubar(chave);
    throw err;
  }
  e.conectando = null;
  agendarIdle(chave);
  return client;
}

/** Executa uma operação com a conexão do pool; se a sessão morreu no meio,
 *  reconecta UMA vez e tenta de novo. */
export async function comImap<T>(
  userId: string,
  cfg: { smtp_host: string; email_envio: string },
  senha: string,
  fn: (client: ImapFlow) => Promise<T>,
): Promise<T> {
  const client = await pegarImap(userId, cfg, senha);
  try {
    return await fn(client);
  } catch (err) {
    const msg = String((err as Error)?.message || err).toLowerCase();
    const caiu = !client.usable || msg.includes("connection") || msg.includes("socket") || msg.includes("closed");
    if (!caiu) throw err;
    derrubar(`${userId}:${cfg.email_envio}`);
    const novo = await pegarImap(userId, cfg, senha);
    return await fn(novo);
  }
}
