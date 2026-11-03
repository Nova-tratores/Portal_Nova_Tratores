"use client";
// Select "Tipo de Atendimento" da OS com a lista do banco (/api/pos/tipos-atendimento)
// e, para quem tem pos:tipos_atendimento, o botão que abre o cadastro de tipos.
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { authHeaders } from "@/lib/auth/client";
import { TIPOS_PADRAO, montarLista, opcoesComAtual, validarNomeTipo, NOME_MAX, type TipoAtendimento } from "@/lib/pos/tipos-atendimento";

type Estado = { tipos: TipoAtendimento[]; podeGerenciar: boolean; migracaoFaltando: boolean };

// cache do módulo: os dois selects do drawer (criar/editar) dividem a mesma lista
let cache: Estado | null = null;
let pendente: Promise<Estado> | null = null;
const ouvintes = new Set<(e: Estado) => void>();

async function buscar(forcar = false): Promise<Estado> {
  if (cache && !forcar) return cache;
  if (pendente && !forcar) return pendente;
  pendente = (async () => {
    try {
      const r = await fetch("/api/pos/tipos-atendimento", { headers: await authHeaders() });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "erro");
      cache = { tipos: j.tipos, podeGerenciar: !!j.podeGerenciar, migracaoFaltando: !!j.migracaoFaltando };
    } catch {
      cache = cache || { tipos: montarLista(TIPOS_PADRAO.map((nome) => ({ id: null, nome }))), podeGerenciar: false, migracaoFaltando: false };
    }
    pendente = null;
    ouvintes.forEach((f) => f(cache!));
    return cache!;
  })();
  return pendente;
}

export default function TipoAtendimentoSelect({ value, onChange, disabled, style }: {
  value: string; onChange: (v: string) => void; disabled?: boolean; style?: CSSProperties;
}) {
  const [estado, setEstado] = useState<Estado | null>(cache);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    ouvintes.add(setEstado);
    buscar().then(setEstado);
    return () => { ouvintes.delete(setEstado); };
  }, []);

  const nomes = (estado?.tipos || montarLista(TIPOS_PADRAO.map((nome) => ({ id: null, nome })))).map((t) => t.nome);
  const opcoes = opcoesComAtual(nomes, value);

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} style={{ ...style, flex: 1, minWidth: 0 }}>
        {opcoes.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      {estado?.podeGerenciar && !disabled && (
        <button type="button" onClick={() => setAberto(true)} title="Cadastrar tipos de atendimento"
          style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 4, border: "1px dashed #0369A1", background: "#F0F9FF", color: "#0369A1", cursor: "pointer", fontSize: 12 }}>
          <i className="fas fa-plus" />
        </button>
      )}
      {aberto && estado && (
        <ModalTipos estado={estado} onFechar={() => setAberto(false)}
          onCriado={(nome) => { onChange(nome); }} />
      )}
    </div>
  );
}

function ModalTipos({ estado, onFechar, onCriado }: { estado: Estado; onFechar: () => void; onCriado: (nome: string) => void }) {
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const recarregar = useCallback(() => buscar(true), []);

  async function criar() {
    const e = validarNomeTipo(nome, estado.tipos.map((t) => t.nome));
    if (e) { setErro(e); return; }
    setSalvando(true); setErro("");
    try {
      const r = await fetch("/api/pos/tipos-atendimento", {
        method: "POST", headers: { ...(await authHeaders()), "Content-Type": "application/json" }, body: JSON.stringify({ nome }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Não foi possível salvar.");
      await recarregar();
      onCriado(j.tipo.nome);
      setNome("");
    } catch (err) { setErro(err instanceof Error ? err.message : "Erro"); }
    setSalvando(false);
  }

  async function remover(t: TipoAtendimento) {
    if (!t.id || !confirm(`Remover "${t.nome}" da lista? As OS que já usam esse tipo não mudam.`)) return;
    setErro("");
    try {
      const r = await fetch(`/api/pos/tipos-atendimento?id=${encodeURIComponent(t.id)}`, { method: "DELETE", headers: await authHeaders() });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Não foi possível remover.");
      await recarregar();
    } catch (err) { setErro(err instanceof Error ? err.message : "Erro"); }
  }

  return (
    <div onClick={onFechar} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--surface, #fefefe)", color: "var(--text, #111111)", borderRadius: 8, width: 420, maxWidth: "100%", padding: 18, boxShadow: "0 10px 30px rgba(0,0,0,.25)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <strong style={{ fontSize: 15 }}>Tipos de atendimento</strong>
          <button type="button" onClick={onFechar} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 16, color: "inherit" }}><i className="fas fa-times" /></button>
        </div>
        {estado.migracaoFaltando && (
          <div style={{ fontSize: 12, background: "#FEF3C7", color: "#92400E", padding: 8, borderRadius: 4, marginBottom: 10 }}>
            Falta aplicar <code>sql/pos-tipos-atendimento.sql</code> no banco — até lá não dá para cadastrar.
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12, maxHeight: 260, overflowY: "auto" }}>
          {estado.tipos.map((t) => (
            <div key={t.nome} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 8px", border: "1px solid var(--border, #e5e7eb)", borderRadius: 4, fontSize: 13 }}>
              <span>{t.nome}{t.fixo && <span style={{ marginLeft: 6, fontSize: 11, opacity: .6 }}>(fixo)</span>}</span>
              {!t.fixo && t.id && (
                <button type="button" onClick={() => remover(t)} title="Remover da lista"
                  style={{ border: "none", background: "none", color: "#DC2626", cursor: "pointer", fontSize: 12 }}>
                  <i className="fas fa-trash" />
                </button>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <input type="text" value={nome} maxLength={NOME_MAX} placeholder="Novo tipo (ex.: Garantia)" autoFocus
            disabled={estado.migracaoFaltando}
            onChange={(e) => { setNome(e.target.value); setErro(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); criar(); } }}
            style={{ flex: 1, padding: "7px 9px", border: "1px solid var(--border, #d1d5db)", borderRadius: 4, fontSize: 13 }} />
          <button type="button" onClick={criar} disabled={salvando || estado.migracaoFaltando || !nome.trim()}
            style={{ padding: "0 14px", borderRadius: 4, border: "none", background: "#0369A1", color: "#fefefe", fontWeight: 700, cursor: "pointer", fontSize: 13, opacity: salvando || !nome.trim() ? .6 : 1 }}>
            {salvando ? "Salvando..." : "Adicionar"}
          </button>
        </div>
        {erro && <div style={{ color: "#DC2626", fontSize: 12, marginTop: 8 }}>{erro}</div>}
        <div style={{ fontSize: 11, opacity: .7, marginTop: 10 }}>O tipo novo aparece na hora em todas as próximas OS. Remover só tira da lista — as OS antigas continuam com o nome.</div>
      </div>
    </div>
  );
}
