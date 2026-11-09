"use client";
// Nome da fase no cabeçalho do POS e do PPV + lápis para o pós-vendas renomear.
// Desde o controlador de fases (09/11/2026) cada quadro tem a sua lista: ao salvar, pergunta se muda no outro também.
import { useState } from "react";
import { aplicarDiferenca, diferenca, validarRenomear, type ModuloFases } from "@/lib/fases/quadro";
import { salvarFasesQuadro, useFasesQuadro } from "@/hooks/useFasesQuadro";

const NOME_MOD: Record<ModuloFases, string> = { pos: "POS", ppv: "PPV" };

export default function RotuloFase({ fase, className, modulo = "pos" }: { fase: string; className?: string; modulo?: ModuloFases }) {
  const e = useFasesQuadro();
  const outro: ModuloFases = modulo === "pos" ? "ppv" : "pos";
  const lista = e[modulo];
  const f = lista.find((x) => x.chave === fase);
  const nome = f?.rotulo || fase;
  const [editando, setEditando] = useState(false);
  const [perguntando, setPerguntando] = useState(false);
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);

  const abrir = (ev: React.MouseEvent) => { ev.stopPropagation(); setTexto(nome); setPerguntando(false); setEditando(true); };
  const fechar = () => { setEditando(false); setPerguntando(false); };

  const confirmar = () => {
    if (salvando) return;
    if (texto.trim() === nome) { fechar(); return; }
    const erro = validarRenomear(fase, texto, lista);
    if (erro) { alert(erro); return; }
    if (e[outro].some((x) => x.chave === fase)) setPerguntando(true);
    else void salvar(false);
  };

  const salvar = async (nosDois: boolean) => {
    setSalvando(true);
    const r = texto.trim();
    const nova = lista.map((x) => (x.chave !== fase ? x : r && r !== fase ? { chave: fase, rotulo: r } : { chave: fase }));
    const listas = { [modulo]: nova } as Record<ModuloFases, typeof nova>;
    if (nosDois) listas[outro] = aplicarDiferenca(e[outro], diferenca(lista, nova));
    const erro = await salvarFasesQuadro(listas);
    setSalvando(false);
    if (erro) { alert(erro); return; }
    fechar();
  };

  const btn: React.CSSProperties = { border: "none", background: "transparent", cursor: "pointer", fontSize: 14, padding: 2 };

  if (editando) {
    return (
      <span onClick={(ev) => ev.stopPropagation()} style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <input autoFocus value={texto} maxLength={60} disabled={salvando || perguntando}
          onChange={(ev) => setTexto(ev.target.value)}
          onKeyDown={(ev) => { if (ev.key === "Enter") confirmar(); if (ev.key === "Escape") fechar(); }}
          title={`Nome da fase "${fase}" no ${NOME_MOD[modulo]}. Vazio = volta ao nome original.`}
          style={{ fontSize: 14, padding: "3px 8px", borderRadius: 8, border: "1px solid var(--border, #cbd5e1)", background: "var(--surface, #fff)", color: "inherit", minWidth: 200, marginBottom: 0 }} />
        {!perguntando ? (
          <>
            <button type="button" onClick={confirmar} disabled={salvando} title="Salvar" style={{ ...btn, color: "#047857" }}>
              <i className={salvando ? "fas fa-spinner fa-spin" : "fas fa-check"} />
            </button>
            <button type="button" onClick={fechar} disabled={salvando} title="Cancelar" style={{ ...btn, color: "#94a3b8" }}>
              <i className="fas fa-xmark" />
            </button>
          </>
        ) : (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600 }}>
            Mudar no {NOME_MOD[outro]} também?
            <button type="button" disabled={salvando} onClick={() => void salvar(true)}
              style={{ border: "none", borderRadius: 7, padding: "4px 10px", background: "#0369a1", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
              {salvando ? <i className="fas fa-spinner fa-spin" /> : `Sim, nos dois`}
            </button>
            <button type="button" disabled={salvando} onClick={() => void salvar(false)}
              style={{ border: "1px solid var(--border, #cbd5e1)", borderRadius: 7, padding: "3px 10px", background: "transparent", color: "inherit", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
              Só no {NOME_MOD[modulo]}
            </button>
          </span>
        )}
      </span>
    );
  }
  return (
    <>
      <span className={className} title={nome !== fase ? `Fase "${fase}"` : undefined}>{nome}</span>
      {e.podeEditar && !!f && (
        <button type="button" onClick={abrir} title={`Renomear esta fase no ${NOME_MOD[modulo]}`}
          style={{ ...btn, color: "#94a3b8", fontSize: 12, padding: "2px 4px", marginLeft: 2 }}>
          <i className="fas fa-pen" />
        </button>
      )}
    </>
  );
}
