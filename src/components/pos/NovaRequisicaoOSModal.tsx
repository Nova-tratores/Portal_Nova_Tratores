"use client";
// "Criar requisição" dentro da OS (José, 14/10/2026): o MESMO formulário de Nova
// Requisição do módulo, já preenchido pela OS (Trator-Cliente, OS, cliente,
// chassis, horímetro, data e o técnico principal como solicitante). Criou → a
// janela mostra o PDF da requisição (o mesmo do módulo) pra imprimir.
import { useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import FormReq from "@/components/requisicoes/FormReq";
import { apagarRascunho } from "@/lib/rascunho/useRascunho";
import { fetchAuth } from "@/lib/auth/client";

export default function NovaRequisicaoOSModal({ osId, tecnico, userName, onClose, onCriada }: {
  osId: string; tecnico: string; userName: string; onClose: () => void; onCriada: (id: number) => void;
}) {
  const [criadaId, setCriadaId] = useState<number | null>(null);
  const chave = `requisicao:nova:${osId}`;

  const salvar = async (nova: Record<string, unknown>) => {
    nova.criado_por = userName;
    const grupos: number[] = Array.isArray(nova._grupos) ? (nova._grupos as number[]) : [];
    delete nova._grupos;
    const { data: ins, error } = await supabase.from("Requisicao").insert([nova]).select("id").single();
    if (error || !ins?.id) { alert("Erro ao criar requisição: " + (error?.message || "sem id")); return; }
    if (grupos.length) {
      await Promise.all(grupos.map((gid) => fetchAuth("/api/pos/requisicoes/grupos/membros", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grupo_id: gid, req_id: ins.id, acao: "add", usuario: userName }),
      }).catch(() => {})));
    }
    apagarRascunho(chave);
    setCriadaId(Number(ins.id));
    onCriada(Number(ins.id));
  };

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 100006, background: "rgba(15,23,42,.55)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
      <div style={{ width: criadaId ? 980 : 1060, maxWidth: "98vw", height: criadaId ? "92vh" : undefined, maxHeight: "92vh", display: "flex", flexDirection: "column", background: "#fefefe", borderRadius: 16, overflow: "hidden", boxShadow: "0 30px 80px rgba(0,0,0,.35)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
          <i className={criadaId ? "fas fa-circle-check" : "fas fa-cart-plus"} style={{ color: criadaId ? "#16a34a" : "#0d9488" }} />
          <b style={{ flex: 1, fontSize: 15, color: "#0f172a" }}>{criadaId ? `Requisição #${criadaId} criada — imprima abaixo` : `Nova requisição da ${osId}`}</b>
          {criadaId && (
            <>
              <button type="button" onClick={() => { const f = document.getElementById("req-pdf-os") as HTMLIFrameElement | null; f?.contentWindow?.print(); }}
                style={{ padding: "7px 14px", borderRadius: 9, border: "none", background: "#0d9488", color: "#fefefe", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}><i className="fas fa-print" /> Imprimir</button>
              <a href={`/requisicoes/imprimir/${criadaId}`} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: "#0369A1", fontWeight: 700 }}>abrir em outra aba ↗</a>
            </>
          )}
          <button type="button" onClick={onClose} title="Fechar" style={{ border: "none", background: "transparent", fontSize: 20, color: "#94a3b8", cursor: "pointer" }}>×</button>
        </div>
        {criadaId ? (
          <iframe id="req-pdf-os" src={`/requisicoes/imprimir/${criadaId}`} title={`Requisição ${criadaId}`} style={{ flex: 1, border: "none", width: "100%", background: "#fff" }} />
        ) : (
          <div style={{ overflowY: "auto", padding: 8 }}>
            <FormReq osInicial={osId} solicitanteInicial={tecnico} chaveRascunho={chave} onSave={salvar} />
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
