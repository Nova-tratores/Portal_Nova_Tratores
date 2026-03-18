"use client";

import { useState, useEffect, useCallback } from "react";

interface Encomenda {
  codigo: string;
  apelido: string;
  ultimoEvento?: {
    descricao: string;
    detalhe?: string;
    data: string;
    local: string;
  };
  status: "found" | "not_found" | "pending" | "error";
  loading?: boolean;
}

const STORAGE_KEY = "ppv_rastreios";

function loadSaved(): Encomenda[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveToDisk(list: Encomenda[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

const STATUS_MAP: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  found: { label: "Rastreado", color: "#047857", bg: "#ECFDF5", icon: "fa-check-circle" },
  not_found: { label: "Não encontrado", color: "#B91C1C", bg: "#FEF2F2", icon: "fa-times-circle" },
  pending: { label: "Aguardando", color: "#C2410C", bg: "#FFF7ED", icon: "fa-clock" },
  error: { label: "Erro", color: "#B91C1C", bg: "#FEF2F2", icon: "fa-exclamation-circle" },
};

export default function RastreioEncomendas() {
  const [encomendas, setEncomendas] = useState<Encomenda[]>([]);
  const [novoCodigo, setNovoCodigo] = useState("");
  const [novoApelido, setNovoApelido] = useState("");
  const [refreshingAll, setRefreshingAll] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    setEncomendas(loadSaved());
  }, []);

  // Persist on change
  useEffect(() => {
    if (encomendas.length > 0 || localStorage.getItem(STORAGE_KEY)) {
      saveToDisk(encomendas);
    }
  }, [encomendas]);

  const rastrear = useCallback(async (codigo: string): Promise<Partial<Encomenda>> => {
    try {
      const res = await fetch(`/api/ppv/rastreio?codigo=${encodeURIComponent(codigo)}`);
      const data = await res.json();

      if (data.error) {
        return { status: "error" };
      }

      if (data.status === "found" && data.eventoMaisRecente) {
        return {
          status: "found",
          ultimoEvento: {
            descricao: data.eventoMaisRecente.descricao || "",
            detalhe: data.eventoMaisRecente.detalhe || "",
            data: data.eventoMaisRecente.data || "",
            local: data.eventoMaisRecente.local || "",
          },
        };
      }

      return { status: "not_found" };
    } catch {
      return { status: "error" };
    }
  }, []);

  const adicionarEncomenda = useCallback(async () => {
    const codigo = novoCodigo.trim().toUpperCase();
    if (!codigo) return;

    // Check duplicate
    if (encomendas.some((e) => e.codigo === codigo)) return;

    const nova: Encomenda = {
      codigo,
      apelido: novoApelido.trim() || codigo,
      status: "pending",
      loading: true,
    };

    setEncomendas((prev) => [nova, ...prev]);
    setNovoCodigo("");
    setNovoApelido("");

    const result = await rastrear(codigo);
    setEncomendas((prev) =>
      prev.map((e) => (e.codigo === codigo ? { ...e, ...result, loading: false } : e))
    );
  }, [novoCodigo, novoApelido, encomendas, rastrear]);

  const atualizarUma = useCallback(async (codigo: string) => {
    setEncomendas((prev) =>
      prev.map((e) => (e.codigo === codigo ? { ...e, loading: true } : e))
    );
    const result = await rastrear(codigo);
    setEncomendas((prev) =>
      prev.map((e) => (e.codigo === codigo ? { ...e, ...result, loading: false } : e))
    );
  }, [rastrear]);

  const atualizarTodas = useCallback(async () => {
    setRefreshingAll(true);
    // Sequencial pra respeitar o rate limit (10/min)
    for (const enc of encomendas) {
      setEncomendas((prev) =>
        prev.map((e) => (e.codigo === enc.codigo ? { ...e, loading: true } : e))
      );
      const result = await rastrear(enc.codigo);
      setEncomendas((prev) =>
        prev.map((e) => (e.codigo === enc.codigo ? { ...e, ...result, loading: false } : e))
      );
    }
    setRefreshingAll(false);
  }, [encomendas, rastrear]);

  const remover = useCallback((codigo: string) => {
    setEncomendas((prev) => prev.filter((e) => e.codigo !== codigo));
  }, []);

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col gap-5 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl text-white" style={{ background: "#B91C1C" }}>
          <i className="fas fa-truck fa-lg" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Rastreio de Encomendas</h1>
          <p className="text-sm text-slate-500">Acompanhe suas entregas pelos Correios</p>
        </div>
        {encomendas.length > 0 && (
          <button
            onClick={atualizarTodas}
            disabled={refreshingAll}
            className="ml-auto flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
            style={{ background: "#B91C1C" }}
          >
            <i className={`fas fa-sync-alt ${refreshingAll ? "fa-spin" : ""}`} />
            {refreshingAll ? "Atualizando..." : "Atualizar Todas"}
          </button>
        )}
      </div>

      {/* Add form */}
      <div className="rounded-2xl border p-5" style={{ background: "#FFFAF5", borderColor: "#FDBA74" }}>
        <div className="mb-3 text-sm font-semibold text-slate-600">
          <i className="fas fa-plus-circle mr-2" style={{ color: "#EA580C" }} />
          Adicionar Rastreio
        </div>
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Código de rastreio (ex: BR123456789BR)"
            value={novoCodigo}
            onChange={(e) => setNovoCodigo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && adicionarEncomenda()}
            className="min-w-[280px] flex-1 rounded-xl border px-4 py-3 text-sm outline-none transition-all focus:ring-2"
            style={{ borderColor: "#FDBA74", background: "white" }}
          />
          <input
            type="text"
            placeholder="Apelido (opcional, ex: Peças Motor)"
            value={novoApelido}
            onChange={(e) => setNovoApelido(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && adicionarEncomenda()}
            className="min-w-[200px] flex-1 rounded-xl border px-4 py-3 text-sm outline-none transition-all focus:ring-2"
            style={{ borderColor: "#FDBA74", background: "white" }}
          />
          <button
            onClick={adicionarEncomenda}
            disabled={!novoCodigo.trim()}
            className="flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-40"
            style={{ background: "#B91C1C" }}
          >
            <i className="fas fa-plus" />
            Adicionar
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
        {encomendas.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed py-16" style={{ borderColor: "#FDBA74" }}>
            <i className="fas fa-box-open text-4xl" style={{ color: "#FDBA74" }} />
            <p className="text-base font-medium text-slate-400">Nenhum rastreio cadastrado</p>
            <p className="text-sm text-slate-400">Adicione um código de rastreio acima para começar</p>
          </div>
        )}

        {encomendas.map((enc) => {
          const st = STATUS_MAP[enc.status] || STATUS_MAP.error;
          return (
            <div
              key={enc.codigo}
              className="flex items-center gap-4 rounded-2xl border p-4 transition-all"
              style={{ background: "#FFFAF5", borderColor: "#FDBA74" }}
            >
              {/* Status badge */}
              <div
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
                style={{ background: st.bg, color: st.color }}
              >
                {enc.loading ? (
                  <i className="fas fa-spinner fa-spin" />
                ) : (
                  <i className={`fas ${st.icon}`} />
                )}
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-slate-800">{enc.apelido}</span>
                  <span
                    className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                    style={{ background: st.bg, color: st.color }}
                  >
                    {st.label}
                  </span>
                </div>
                <div className="mt-0.5 font-mono text-sm text-slate-500">{enc.codigo}</div>
                {enc.ultimoEvento && (
                  <div className="mt-1 text-sm text-slate-600">
                    <i className="fas fa-map-marker-alt mr-1" style={{ color: "#EA580C", fontSize: 11 }} />
                    {enc.ultimoEvento.descricao}
                    {enc.ultimoEvento.detalhe && ` — ${enc.ultimoEvento.detalhe}`}
                    <span className="ml-2 text-slate-400">
                      {enc.ultimoEvento.local} • {formatDate(enc.ultimoEvento.data)}
                    </span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-shrink-0 items-center gap-2">
                <button
                  onClick={() => atualizarUma(enc.codigo)}
                  disabled={enc.loading}
                  className="flex h-9 w-9 items-center justify-center rounded-lg transition-all hover:bg-orange-100 disabled:opacity-40"
                  title="Atualizar"
                >
                  <i className={`fas fa-sync-alt text-sm ${enc.loading ? "fa-spin" : ""}`} style={{ color: "#EA580C" }} />
                </button>
                <button
                  onClick={() => remover(enc.codigo)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg transition-all hover:bg-red-100"
                  title="Remover"
                >
                  <i className="fas fa-trash-alt text-sm" style={{ color: "#B91C1C" }} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
