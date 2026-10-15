"use client";
// Enviar a OS ao Omie (José, 15/10/2026): pergunta antes, mostra o que vai acontecer,
// tela de carregamento com os passos e o tempo estimado, e o resultado no fim.
import { createPortal } from "react-dom";
import CronometroEstimado, { useSegundos, pctPeloTempo } from "@/components/comum/CronometroEstimado";

export type FaseEnvioOmie =
  | { fase: "confirmar" }
  | { fase: "enviando" }
  | { fase: "ok"; numeroOS: string; pedidos?: string; erroPecas?: string }
  | { fase: "erro"; mensagem: string }
  | { fase: "incerto" };

/** segundos estimados: salvar + criar a OS + cada pedido/remessa */
export const estimativaEnvioOmie = (qtdPedidos: number) => 10 + 20 + 15 * qtdPedidos;

function Enviando({ osId, ppvIds, interna }: { osId: string; ppvIds: string[]; interna: boolean }) {
  const s = useSegundos();
  const est = estimativaEnvioOmie(ppvIds.length);
  const passos = [
    { de: 0, txt: "Salvando a OS no portal" },
    { de: 6, txt: `Criando a OS ${osId} no Omie` },
    ...ppvIds.map((p, i) => ({ de: 28 + i * 15, txt: `${interna ? "Remessa" : "Pedido de venda"} das peças (${p})` })),
    { de: 28 + ppvIds.length * 15, txt: "Gravando os números no portal" },
  ];
  const atual = passos.filter((p) => s >= p.de).length - 1;
  return (
    <div style={{ padding: "28px 26px 22px", textAlign: "center" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/marcas/omie.png" alt="Omie" style={{ height: 28, objectFit: "contain", marginBottom: 12 }} />
      <div style={{ fontSize: 16, fontWeight: 800 }}>Enviando ao Omie</div>
      <div style={{ fontSize: 12.5, color: "#64748b", marginTop: 3 }}>Não feche esta janela.</div>
      <div style={{ height: 6, borderRadius: 3, background: "#e2e8f0", margin: "16px 0 14px", overflow: "hidden" }}>
        <div style={{ width: `${pctPeloTempo(s, est)}%`, height: "100%", background: "linear-gradient(90deg,#22d3ee,#0891b2)", transition: "width 1s linear" }} />
      </div>
      <div style={{ display: "grid", gap: 7, textAlign: "left", margin: "0 auto 14px", maxWidth: 320 }}>
        {passos.map((p, i) => (
          <div key={p.txt} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, color: i < atual ? "#0891b2" : i === atual ? "#0f172a" : "#94a3b8", fontWeight: i === atual ? 700 : 500 }}>
            <i className={`fas ${i < atual ? "fa-circle-check" : i === atual ? "fa-spinner fa-spin" : "fa-circle"}`} style={{ width: 14, fontSize: i > atual ? 6 : 13 }} />
            {p.txt}
          </div>
        ))}
      </div>
      <CronometroEstimado segundos={s} estimativa={est} cor="#0891b2" />
    </div>
  );
}

export default function EnviarOmieModal({ estado, osId, cliente, interna, ppvIds, onConfirmar, onFechar }: {
  estado: FaseEnvioOmie; osId: string; cliente: string; interna: boolean; ppvIds: string[];
  onConfirmar: () => void; onFechar: () => void;
}) {
  if (typeof document === "undefined") return null;
  const ocupado = estado.fase === "enviando";
  const mmss = (t: number) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
  const btn = (txt: string, acao: () => void, primario = false) => (
    <button type="button" onClick={acao} style={{ flex: primario ? 1.4 : 1, height: 42, borderRadius: 10, border: primario ? "none" : "1px solid #cbd5e1", background: primario ? "#0891b2" : "#fefefe", color: primario ? "#fefefe" : "#334155", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>{txt}</button>
  );

  return createPortal(
    <div onClick={() => !ocupado && onFechar()} style={{ position: "fixed", inset: 0, zIndex: 100050, background: "rgba(15,23,42,.55)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 460, background: "#fefefe", color: "#0f172a", borderRadius: 16, boxShadow: "0 24px 60px rgba(15,23,42,.35)", overflow: "hidden" }}>
        {estado.fase === "enviando" && <Enviando osId={osId} ppvIds={ppvIds} interna={interna} />}

        {estado.fase === "confirmar" && (
          <div style={{ padding: "20px 22px" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/marcas/omie.png" alt="Omie" style={{ height: 24, objectFit: "contain" }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 17, fontWeight: 800 }}>Enviar a {osId} ao Omie?</div>
                <div style={{ fontSize: 12.5, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cliente}</div>
              </div>
            </div>
            <div style={{ marginTop: 14, border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden", fontSize: 13 }}>
              <div style={{ display: "flex", gap: 10, padding: "9px 12px" }}>
                <i className="fas fa-screwdriver-wrench" style={{ color: "#0891b2", marginTop: 2, width: 14 }} />
                <span>A OS é criada no Omie{interna ? <> como <b>interna</b>: sem cobrança, conta INTERNO e recibo no lugar da NFS-e.</> : "."}</span>
              </div>
              <div style={{ display: "flex", gap: 10, padding: "9px 12px", borderTop: "1px solid #f1f5f9", background: "#f8fafc" }}>
                <i className="fas fa-box" style={{ color: "#e8730c", marginTop: 2, width: 14 }} />
                <span>{ppvIds.length
                  ? <>{ppvIds.join(", ")} {ppvIds.length > 1 ? "vão" : "vai"} como <b>{interna ? "remessa" : "pedido de venda"}</b> vinculado à OS.</>
                  : "Sem peças vinculadas."}</span>
              </div>
              <div style={{ display: "flex", gap: 10, padding: "9px 12px", borderTop: "1px solid #f1f5f9" }}>
                <i className="fas fa-floppy-disk" style={{ color: "#64748b", marginTop: 2, width: 14 }} />
                <span>A OS é salva antes de enviar.</span>
              </div>
            </div>
            <div style={{ marginTop: 12, fontSize: 12.5, color: "#475569", display: "flex", alignItems: "center", gap: 7 }}>
              <i className="fas fa-stopwatch" style={{ color: "#0891b2" }} /> Tempo estimado: <b>~{mmss(estimativaEnvioOmie(ppvIds.length))}</b>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              {btn("Cancelar", onFechar)}
              {btn("Enviar ao Omie", onConfirmar, true)}
            </div>
          </div>
        )}

        {(estado.fase === "ok" || estado.fase === "erro" || estado.fase === "incerto") && (
          <div style={{ padding: "26px 24px 20px", textAlign: "center" }}>
            <span style={{ width: 54, height: 54, borderRadius: 27, margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
              background: estado.fase === "ok" ? "#ecfeff" : estado.fase === "erro" ? "#fef2f2" : "#fffbeb", color: estado.fase === "ok" ? "#0891b2" : estado.fase === "erro" ? "#b91c1c" : "#b45309" }}>
              <i className={`fas ${estado.fase === "ok" ? "fa-check" : estado.fase === "erro" ? "fa-circle-xmark" : "fa-circle-question"}`} />
            </span>
            {estado.fase === "ok" && (<>
              <div style={{ fontSize: 18, fontWeight: 800 }}>OS nº {estado.numeroOS} no Omie</div>
              {estado.pedidos && <div style={{ fontSize: 13.5, color: "#475569", marginTop: 6 }}>{interna ? "Remessa de peças" : "Pedido de venda"}: <b>{estado.pedidos}</b></div>}
              {estado.erroPecas && <div style={{ fontSize: 12.5, color: "#b91c1c", marginTop: 10, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 9, padding: "8px 10px", textAlign: "left" }}><b>Peças:</b> {estado.erroPecas}</div>}
            </>)}
            {estado.fase === "erro" && (<>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Não foi enviada</div>
              <div style={{ fontSize: 13, color: "#475569", marginTop: 8, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{estado.mensagem}</div>
            </>)}
            {estado.fase === "incerto" && (<>
              <div style={{ fontSize: 18, fontWeight: 800 }}>O Omie demorou demais</div>
              <div style={{ fontSize: 13, color: "#475569", marginTop: 8, lineHeight: 1.5, textAlign: "left" }}>
                O envio pode ter sido concluído mesmo assim. Recarregue a página e veja se a OS recebeu o nº do Omie:<br />
                • Se recebeu, está tudo certo — não reenvie.<br />
                • Se não recebeu, envie de novo (não duplica: OS com nº é recusada).
              </div>
            </>)}
            <button type="button" onClick={onFechar} style={{ width: "100%", height: 42, marginTop: 18, borderRadius: 10, border: "none", background: "#0f172a", color: "#fefefe", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Fechar</button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
