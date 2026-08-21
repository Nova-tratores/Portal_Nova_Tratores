"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";

// Página embutida no Chatwoot como "Dashboard App" (iframe na lateral do contato).
// Recebe o contato via postMessage, permite buscar um cliente do portal e
// vinculá-lo ao contato (salvo nos atributos personalizados do Chatwoot).

type Cliente = {
  cod_cli: number | string;
  empresa: number | string;
  razao_social?: string;
  nome_fantasia?: string;
  cnpj_cpf?: string;
  cidade?: string;
  estado?: string;
  telefone?: string;
  email?: string;
};

type Contact = {
  id: number | string;
  name?: string;
  phone_number?: string;
  custom_attributes?: Record<string, unknown>;
};

const GREEN = "#00a884";

export default function ChatwootAppPage() {
  const [secret, setSecret] = useState("");
  const [accountId, setAccountId] = useState<string | number | null>(null);
  const [contact, setContact] = useState<Contact | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: "ok" | "err"; msg: string } | null>(
    null
  );

  // Cliente atualmente vinculado (lido dos atributos do contato)
  const linked = useMemo(() => {
    const ca = contact?.custom_attributes || {};
    const label = ca["cliente_portal"];
    return typeof label === "string" && label ? label : null;
  }, [contact]);

  // 1) Lê o secret da URL e pede o contexto do contato ao Chatwoot
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSecret(params.get("secret") || "");

    const onMessage = (e: MessageEvent) => {
      if (typeof e.data !== "string") return;
      let payload: { event?: string; data?: Record<string, unknown> };
      try {
        payload = JSON.parse(e.data);
      } catch {
        return;
      }
      if (payload.event === "appContext") {
        const d = (payload.data || {}) as Record<string, unknown>;
        const conv = d["conversation"] as Record<string, unknown> | undefined;
        const meta = conv?.["meta"] as Record<string, unknown> | undefined;
        const c =
          (d["contact"] as Contact | undefined) ||
          (meta?.["sender"] as Contact | undefined) ||
          null;
        if (c) setContact(c);
        const acc =
          (d["currentAccount"] as Record<string, unknown> | undefined)?.["id"] ??
          (conv?.["account_id"] as string | number | undefined) ??
          null;
        if (acc != null) setAccountId(acc as string | number);
      }
    };

    window.addEventListener("message", onMessage);
    // avisa o Chatwoot que queremos os dados
    window.parent.postMessage("chatwoot-dashboard-app:fetch-info", "*");
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // 2) Busca de clientes (dispara ao digitar, com pequeno atraso)
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/clientes/buscar?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setResults(data.clientes || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  // 3) Vincula o cliente escolhido ao contato
  async function vincular(cliente: Cliente) {
    if (!contact?.id) {
      setStatus({ type: "err", msg: "Contato não identificado." });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/chatwoot/vincular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: contact.id,
          accountId,
          secret,
          cliente,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao vincular");
      const nome = cliente.nome_fantasia || cliente.razao_social || "";
      setContact((prev) =>
        prev
          ? {
              ...prev,
              custom_attributes: {
                ...(prev.custom_attributes || {}),
                cliente_portal: `${cliente.cod_cli} - ${nome}`,
              },
            }
          : prev
      );
      setQuery("");
      setResults([]);
      setStatus({ type: "ok", msg: "Cliente vinculado com sucesso!" });
    } catch (e: unknown) {
      setStatus({
        type: "err",
        msg: e instanceof Error ? e.message : "Erro ao vincular",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <span style={styles.title}>Cliente do Portal</span>
        {contact?.name && <span style={styles.contact}>{contact.name}</span>}
      </div>

      {linked ? (
        <div style={styles.linkedBox}>
          <div style={styles.linkedLabel}>Vinculado a</div>
          <div style={styles.linkedName}>{linked}</div>
        </div>
      ) : (
        <div style={styles.hint}>Nenhum cliente vinculado ainda.</div>
      )}

      <input
        style={styles.input}
        placeholder="Buscar cliente (nome ou CNPJ)…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={!contact}
      />

      {loading && <div style={styles.muted}>Buscando…</div>}

      <div style={styles.results}>
        {results.map((c) => (
          <button
            key={`${c.cod_cli}-${c.empresa}`}
            style={styles.result}
            onClick={() => vincular(c)}
            disabled={saving}
          >
            <div style={styles.resultName}>
              {c.nome_fantasia || c.razao_social || `Cliente ${c.cod_cli}`}
            </div>
            <div style={styles.resultMeta}>
              {[c.cnpj_cpf, [c.cidade, c.estado].filter(Boolean).join("/")]
                .filter(Boolean)
                .join(" • ")}
            </div>
          </button>
        ))}
      </div>

      {status && (
        <div
          style={{
            ...styles.status,
            color: status.type === "ok" ? GREEN : "#d92d20",
          }}
        >
          {status.msg}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    padding: 12,
    color: "#111b21",
    fontSize: 14,
  },
  header: { display: "flex", flexDirection: "column", marginBottom: 10 },
  title: { fontWeight: 600, fontSize: 15 },
  contact: { color: "#667781", fontSize: 12 },
  linkedBox: {
    background: "#d9fdd3",
    borderRadius: 8,
    padding: "8px 10px",
    marginBottom: 10,
  },
  linkedLabel: { fontSize: 11, color: "#667781" },
  linkedName: { fontWeight: 600 },
  hint: { color: "#667781", fontSize: 12, marginBottom: 10 },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "9px 11px",
    borderRadius: 8,
    border: "1px solid #d1d7db",
    outline: "none",
    fontSize: 14,
  },
  muted: { color: "#667781", fontSize: 12, marginTop: 8 },
  results: { marginTop: 8, display: "flex", flexDirection: "column", gap: 6 },
  result: {
    textAlign: "left",
    background: "#fff",
    border: "1px solid #e9edef",
    borderRadius: 8,
    padding: "8px 10px",
    cursor: "pointer",
  },
  resultName: { fontWeight: 600, fontSize: 13 },
  resultMeta: { color: "#667781", fontSize: 12 },
  status: { marginTop: 10, fontSize: 13, fontWeight: 500 },
};
