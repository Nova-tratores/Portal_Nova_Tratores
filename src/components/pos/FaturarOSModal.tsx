"use client";
// Janela de faturamento da OS (emite NFS-e no Omie) — molde do FaturarModal do PPV,
// com o que a OS precisa a mais: forma de pagamento → parcelas, pedidos de peças
// para faturar junto e a conferência do valor que vai na nota (o do OMIE).
// Nada é emitido até o "Sim, faturar". A prévia usa o ValidarOS do Omie (não emite).
// Passos (José, 13/10/2026): 1) o que faturar — OS + pedido, só a OS ou só o
// pedido de peças; 2) dados (forma de pagamento, impostos, pedidos); 3) "Tem
// certeza?". A OS só vai para Concluída quando a OS e os pedidos estão faturados.
import { useEffect, useMemo, useState } from "react";
import { authHeaders } from "@/lib/auth/client";
import { parcelasDoPagamento } from "@/lib/pagamento/parcelas";
import { validarCampos, type CamposFiscais } from "@/lib/pos/modelo-fiscal";
import CamposFiscaisEditor, { paraTela, type ValoresTela } from "./CamposFiscaisEditor";

interface PPVPrevia {
  id: string; pedidoOmie: string; tipo: string; status: string; empresa: string;
  faturadoEm: string | null; valor: number; motivoFora: string | null;
}
interface Previa {
  ok: boolean; erro?: string;
  os?: { id: string; cliente: string; numeroOmie: string; status: string };
  totalOmie?: number; valorPortal?: number; divergente?: boolean;
  servicos?: Array<{ descricao: string; quantidade: number; valorUnitario: number }>;
  formaPagamento?: string | null; opcoesPagamento?: string[]; hoje?: string;
  validacao?: { ok: boolean; msg: string | null };
  ppvs?: PPVPrevia[]; podeFaturarPecas?: boolean;
  liquidoOmie?: number; retidoOmie?: number;
  impostos?: {
    disponivel: boolean;
    modelo: { id: string; nome: string; origem: "cliente" | "padrao"; campos: CamposFiscais } | null;
    modelos: Array<{ id: string; nome: string; padrao: boolean; campos: CamposFiscais }>;
    atuais: Record<string, string | number | null | "varia">;
    qtdItens: number; podeGerenciar: boolean; documento: string;
  };
}
interface Resultado {
  success?: boolean; tipo?: string; mensagem?: string; error?: string; nfseNumero?: string | null; concluida?: boolean;
  pecas?: Array<{ id: string; pedidoOmie?: string; ok: boolean; erro?: string | null; nf?: string | null }>;
}
type Escopo = "ambos" | "os" | "pedido";
type Etapa = "escolher" | "previa" | "confirmar";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const FASES_ANTES_DA_EXECUCAO = /^(Orçamento|Execução)/i;

export default function FaturarOSModal({ open, osId, onClose, onFaturado }: {
  open: boolean;
  osId: string;
  onClose: () => void;
  onFaturado: () => void; // recarrega o drawer (a OS vai pra Concluída no servidor)
}) {
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [forma, setForma] = useState<string | null>(null);
  const [ppvsMarcados, setPpvsMarcados] = useState<Set<string>>(new Set());
  const [conferiValor, setConferiValor] = useState(false);
  const [faturando, setFaturando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  // impostos dos serviços: modelo escolhido + valores da tela (modelo + ajustes desta OS)
  const [modeloId, setModeloId] = useState("");
  const [valores, setValores] = useState<ValoresTela>({});
  const [verImpostos, setVerImpostos] = useState(false);
  const [salvarParaCliente, setSalvarParaCliente] = useState(false);
  const [etapa, setEtapa] = useState<Etapa>("escolher");
  const [escopo, setEscopo] = useState<Escopo>("os");

  useEffect(() => {
    // o bloco só monta esta janela quando ela abre: o estado já nasce limpo
    if (!open) return;
    let cancel = false;
    (async () => {
      try {
        const r = await fetch(`/api/pos/ordens/${encodeURIComponent(osId)}/faturar/simular`, { method: "POST", headers: await authHeaders() });
        const j: Previa = await r.json().catch(() => ({ ok: false, erro: "Resposta inválida do servidor." }));
        if (cancel) return;
        if (!r.ok && !j.erro) j.erro = (j as unknown as { error?: string }).error || `Erro ${r.status}`;
        setPrevia(j);
        setForma(j.formaPagamento || null); // sem escolha na cobrança = nada marcado (obriga escolher)
        const elegiveis = (j.ppvs || []).filter((p) => !p.motivoFora && j.podeFaturarPecas).map((p) => p.id);
        setPpvsMarcados(new Set(elegiveis));
        if (!elegiveis.length) { setEscopo("os"); setEtapa("previa"); }
        if (j.impostos?.modelo) { setModeloId(j.impostos.modelo.id); setValores(paraTela(j.impostos.modelo.campos)); }
      } catch {
        if (!cancel) setPrevia({ ok: false, erro: "Falha de conexão ao preparar o faturamento." });
      }
      if (!cancel) setCarregando(false);
    })();
    return () => { cancel = true; };
  }, [open, osId]);

  // parcelas sobre o LÍQUIDO (total − retidos). Se os impostos mudarem as retenções,
  // a Omie recalcula e o servidor refaz as parcelas sobre o valor novo.
  const baseParcelas = previa?.liquidoOmie || previa?.totalOmie || 0;
  const plano = useMemo(
    () => (previa?.ok && forma && baseParcelas && previa.hoje ? parcelasDoPagamento(forma, baseParcelas, previa.hoje) : null),
    [previa, forma, baseParcelas],
  );
  const modeloAtual = previa?.impostos?.modelos.find((m) => m.id === modeloId) || null;
  const baseModelo = useMemo(() => paraTela(modeloAtual?.campos), [modeloAtual]);
  const validacaoImpostos = useMemo(() => validarCampos(valores), [valores]);
  const qtdAjustes = Object.keys({ ...baseModelo, ...valores }).filter((k) => String(baseModelo[k] ?? "").trim() !== String(valores[k] ?? "").trim()).length;
  const temImpostos = Object.keys(validacaoImpostos.campos).length > 0;
  const mexeRetencao = Object.keys(validacaoImpostos.campos).some((k) => /^cRetem|^nAliq(ISS|IRRF|PIS|COFINS|CSLL|INSS)$/.test(k));

  if (!open) return null;

  const elegiveis = (previa?.ppvs || []).filter((p) => !p.motivoFora && !!previa?.podeFaturarPecas);
  const pecasJunto = escopo === "os" ? [] : (previa?.ppvs || []).filter((p) => ppvsMarcados.has(p.id));
  const comOS = escopo !== "pedido";
  const escolher = (e: Escopo) => {
    setEscopo(e);
    setPpvsMarcados(new Set(e === "os" ? [] : elegiveis.map((p) => p.id)));
    setEtapa("previa");
  };
  // ValidarOS recusando a OS de hoje só trava quando não há impostos a aplicar
  // (ex.: falta o CST — o modelo corrige e o servidor valida de novo antes de emitir)
  const podeEmitir = !faturando && !!previa?.ok && (escopo === "pedido"
    ? pecasJunto.length > 0
    : !!plano && (!previa.divergente || conferiValor) && validacaoImpostos.erros.length === 0 && (!!previa.validacao?.ok || temImpostos)
      && (escopo === "os" || pecasJunto.length > 0));

  const trocarModelo = (id: string) => {
    if (qtdAjustes && !confirm("Trocar de modelo descarta os ajustes feitos nesta OS. Continuar?")) return;
    setModeloId(id);
    setValores(paraTela(previa?.impostos?.modelos.find((m) => m.id === id)?.campos));
    setSalvarParaCliente(false);
  };

  const faturar = async () => {
    if (!previa?.ok) return;
    if (escopo === "pedido") {
      setFaturando(true);
      try {
        const r = await fetch(`/api/pos/ordens/${encodeURIComponent(osId)}/faturar/pecas`, {
          method: "POST", headers: { ...(await authHeaders()), "Content-Type": "application/json" },
          body: JSON.stringify({ ppvIds: pecasJunto.map((p) => p.id) }),
        });
        const j = await r.json().catch(() => ({}));
        const pecas = (j.pecas || []).filter((p: { id: string }) => pecasJunto.some((x) => x.id === p.id));
        setResultado(j.ok ? { tipo: "pedido", pecas, concluida: !!j.concluida } : { tipo: "erro", mensagem: j.mensagem || j.error || "Não foi possível faturar o pedido." });
        if (j.ok) onFaturado();
      } catch {
        setResultado({ tipo: "desconhecido", mensagem: "Sem resposta do servidor. Confira o pedido no PPV antes de tentar de novo." });
        onFaturado();
      }
      setFaturando(false);
      return;
    }
    if (!plano) return;
    setFaturando(true);
    try {
      const r = await fetch(`/api/pos/ordens/${encodeURIComponent(osId)}/faturar`, {
        method: "POST",
        headers: { ...(await authHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify({
          forma, ppvIds: pecasJunto.map((p) => p.id), totalConfirmado: previa.totalOmie,
          impostos: { modeloId: modeloId || null, campos: validacaoImpostos.campos, salvarParaCliente },
        }),
      });
      const j: Resultado = await r.json().catch(() => ({}));
      if (!j.tipo && !j.error && !j.mensagem) {
        // conexão caiu no meio (proxy): pode ter faturado — o servidor confere sozinho
        setResultado({ tipo: "desconhecido", mensagem: "A conexão caiu enquanto o Omie processava. NÃO tente de novo: o portal confere no Omie em alguns minutos e atualiza esta OS." });
      } else {
        setResultado(j);
      }
      if (j.tipo === "faturada" || j.tipo === "ja_faturada" || j.tipo === "desconhecido") onFaturado();
    } catch {
      setResultado({ tipo: "desconhecido", mensagem: "Sem resposta do servidor. NÃO tente de novo agora: o portal confere no Omie e atualiza esta OS." });
      onFaturado();
    }
    setFaturando(false);
  };

  const btn: React.CSSProperties = { padding: "11px 16px", borderRadius: 4, border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer" };
  const caixa = (cor: "verm" | "ambar" | "verde" | "cinza"): React.CSSProperties => ({
    borderRadius: 4, padding: "12px 14px", fontSize: 13, lineHeight: 1.5, marginBottom: 12,
    background: { verm: "#fef2f2", ambar: "#fffbeb", verde: "#f0fdf4", cinza: "#f8fafc" }[cor],
    border: `1px solid ${{ verm: "#fecaca", ambar: "#fcd34d", verde: "#bbf7d0", cinza: "#e2e8f0" }[cor]}`,
    color: { verm: "#7f1d1d", ambar: "#92400e", verde: "#14532d", cinza: "#334155" }[cor],
  });
  const titulo = (t: string) => <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: "#64748b", margin: "14px 0 6px" }}>{t}</div>;

  return (
    <div onClick={() => !faturando && onClose()} style={{ position: "fixed", inset: 0, zIndex: 68000, background: "rgba(0,0,0,.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "6vh 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", color: "#1e293b", borderRadius: 4, width: "100%", maxWidth: 560, boxShadow: "0 24px 60px rgba(0,0,0,.3)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid #eef0f3" }}>
          <i className="fas fa-file-invoice-dollar" style={{ color: "#0369A1" }} />
          <div style={{ flex: 1, fontSize: 16, fontWeight: 700 }}>Faturar no Omie{previa?.os ? ` · OS nº ${previa.os.numeroOmie}` : ""}</div>
          <button onClick={onClose} disabled={faturando} style={{ background: "#f1f5f9", border: "none", borderRadius: 4, width: 30, height: 30, cursor: "pointer", color: "#475569", fontSize: 17 }}>×</button>
        </div>

        <div style={{ padding: "16px 18px 18px" }}>
          {carregando && <div style={{ padding: 20, textAlign: "center", color: "#64748b", fontSize: 13 }}><i className="fas fa-spinner fa-spin" /> Conferindo a OS no Omie…</div>}

          {/* ---------- resultado ---------- */}
          {resultado && (
            <>
              {resultado.tipo === "faturada" || resultado.tipo === "ja_faturada" ? (
                <div style={caixa("verde")}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}><i className="fas fa-check-circle" /> {resultado.tipo === "ja_faturada" ? "A OS já estava faturada no Omie — o portal registrou." : "OS faturada. A nota foi para a prefeitura."}</div>
                  <div>{resultado.nfseNumero ? `NFS-e nº ${resultado.nfseNumero}.` : "Agora é aguardar a nota do sistema nacional: o bloco Omie mostra o andamento e você recebe uma notificação quando ela sair (ou se for rejeitada)."}</div>
                  <div style={{ marginTop: 4, fontWeight: 700 }}>{resultado.concluida ? "A OS foi para Concluída." : "A OS vai para Concluída quando o pedido de peças também for faturado."}</div>
                </div>
              ) : resultado.tipo === "pedido" ? (
                <div style={caixa(resultado.pecas?.every((p) => p.ok) ? "verde" : "ambar")}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}><i className="fas fa-boxes" /> Pedido de peças faturado</div>
                  <div style={{ fontWeight: 700 }}>{resultado.concluida ? "A OS e os pedidos estão faturados — a OS foi para Concluída." : "A OS vai para Concluída quando a OS também for faturada."}</div>
                </div>
              ) : resultado.tipo === "desconhecido" ? (
                <div style={caixa("ambar")}><div style={{ fontWeight: 700, marginBottom: 4 }}><i className="fas fa-hourglass-half" /> Conferindo no Omie</div>{resultado.mensagem}</div>
              ) : (
                <div style={caixa("verm")}><div style={{ fontWeight: 700, marginBottom: 4 }}><i className="fas fa-exclamation-circle" /> Não foi faturada</div>{resultado.mensagem || resultado.error}</div>
              )}
              {(resultado.pecas || []).length > 0 && (
                <div style={caixa(resultado.pecas!.every((p) => p.ok) ? "cinza" : "ambar")}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Pedidos de peças</div>
                  {resultado.pecas!.map((p) => (
                    <div key={p.id}>{p.ok ? "✔" : "✖"} {p.id}{p.pedidoOmie ? ` (PV ${p.pedidoOmie})` : ""}: {p.ok ? (p.nf ? `NF-e ${p.nf}` : "enviado à SEFAZ") : p.erro}</div>
                  ))}
                  {!resultado.pecas!.every((p) => p.ok) && <div style={{ marginTop: 6 }}>A OS continua faturada. Os pedidos que falharam podem ser faturados de novo pelo bloco de faturamento da OS.</div>}
                </div>
              )}
              <button onClick={onClose} style={{ ...btn, width: "100%", background: "#334155", color: "#fff" }}>Fechar</button>
            </>
          )}

          {/* ---------- erro da prévia ---------- */}
          {!resultado && previa && !previa.ok && (
            <>
              <div style={caixa("verm")}><div style={{ fontWeight: 700, marginBottom: 4 }}>Não dá para faturar agora</div>{previa.erro}</div>
              <button onClick={onClose} style={{ ...btn, width: "100%", background: "#f1f5f9", color: "#334155" }}>Fechar</button>
            </>
          )}

          {/* ---------- passo 1: o que faturar ---------- */}
          {!resultado && previa?.ok && etapa === "escolher" && (
            <>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{previa.os?.cliente}</div>
              <div style={{ fontSize: 12.5, color: "#64748b", marginBottom: 12 }}>O que você quer faturar agora?</div>
              {([
                ["ambos", "fa-layer-group", "Ordem de serviço + pedido de peças", `NFS-e da OS nº ${previa.os?.numeroOmie} e NF-e de ${elegiveis.map((p) => p.pedidoOmie ? `PV ${p.pedidoOmie}` : p.id).join(", ")}. A OS vai para Concluída.`],
                ["os", "fa-screwdriver-wrench", "Só a ordem de serviço", "Emite só a NFS-e. A OS fica aguardando o pedido de peças ser faturado para ir para Concluída."],
                ["pedido", "fa-boxes", "Só o pedido de peças", "Emite só a NF-e das peças. A OS fica aguardando o faturamento dela para ir para Concluída."],
              ] as const).map(([v, icone, rotulo, dica]) => (
                <button key={v} type="button" onClick={() => escolher(v)}
                  style={{ display: "flex", alignItems: "flex-start", gap: 12, width: "100%", textAlign: "left", padding: "12px 14px", marginBottom: 8, borderRadius: 8, border: "1.5px solid #cbd5e1", background: "#fff", cursor: "pointer", fontFamily: "inherit" }}>
                  <span style={{ width: 34, height: 34, borderRadius: 8, background: "#ecfeff", color: "#0891A8", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><i className={`fas ${icone}`} /></span>
                  <span style={{ flex: 1 }}>
                    <span style={{ display: "block", fontSize: 14, fontWeight: 800, color: "#0f172a" }}>{rotulo}</span>
                    <span style={{ display: "block", fontSize: 12.5, color: "#64748b", marginTop: 2 }}>{dica}</span>
                  </span>
                  <i className="fas fa-chevron-right" style={{ color: "#94a3b8", marginTop: 10 }} />
                </button>
              ))}
              <button onClick={onClose} style={{ ...btn, width: "100%", background: "#f1f5f9", color: "#334155", marginTop: 4 }}>Cancelar</button>
            </>
          )}

          {/* ---------- passo 3: tem certeza? ---------- */}
          {!resultado && previa?.ok && etapa === "confirmar" && (
            <>
              <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>Tem certeza?</div>
              <div style={caixa("cinza")}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Vai emitir no Omie:</div>
                {comOS && <div>• <strong>NFS-e</strong> da OS nº {previa.os?.numeroOmie} — {brl(previa.totalOmie || 0)}{forma ? ` · ${forma}` : ""}</div>}
                {pecasJunto.map((p) => <div key={p.id}>• <strong>NF-e</strong> das peças {p.pedidoOmie ? `PV ${p.pedidoOmie}` : p.id} — {brl(p.valor)}</div>)}
                <div style={{ marginTop: 8, fontSize: 12.5 }}>São notas fiscais reais: cancelar depois só pelo Omie.</div>
              </div>
              <div style={caixa(escopo === "ambos" || (escopo === "os" && !elegiveis.length) ? "verde" : "ambar")}>
                {escopo === "ambos" || (escopo === "os" && !elegiveis.length)
                  ? "Depois de faturar, a OS vai para Concluída."
                  : escopo === "os"
                    ? "A OS só vai para Concluída quando o pedido de peças também for faturado."
                    : "A OS só vai para Concluída quando a ordem de serviço também for faturada."}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={faturar} disabled={faturando}
                  style={{ ...btn, flex: 1, background: "#0369A1", color: "#fff", cursor: faturando ? "wait" : "pointer" }}>
                  {faturando ? "Faturando… (não feche)" : "Sim, faturar"}
                </button>
                <button onClick={() => setEtapa("previa")} disabled={faturando} style={{ ...btn, background: "#f1f5f9", color: "#334155" }}>Voltar</button>
              </div>
            </>
          )}

          {/* ---------- passo 2: dados ---------- */}
          {!resultado && previa?.ok && etapa === "previa" && (
            <>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{previa.os?.cliente}</div>
              <div style={{ fontSize: 12.5, color: "#64748b" }}>OS {previa.os?.id} · fase atual: {previa.os?.status}</div>
              {comOS && FASES_ANTES_DA_EXECUCAO.test(previa.os?.status || "") && (
                <div style={{ ...caixa("ambar"), marginTop: 10 }}>⚠ A OS ainda está em <strong>{previa.os?.status}</strong>. Confira se o serviço já foi feito antes de faturar.</div>
              )}

              {comOS && <>
              {titulo("Serviços na nota (Omie)")}
              <div style={{ border: "1px solid #e2e8f0", borderRadius: 4 }}>
                {(previa.servicos || []).map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, padding: "7px 10px", fontSize: 12.5, borderTop: i ? "1px solid #f1f5f9" : "none" }}>
                    <span style={{ flex: 1 }}>{s.descricao || "Serviço"}</span>
                    <span style={{ color: "#64748b" }}>{s.quantidade} × {brl(s.valorUnitario)}</span>
                  </div>
                ))}
                <div style={{ display: "flex", padding: "8px 10px", fontWeight: 800, fontSize: 14, borderTop: "1px solid #e2e8f0", background: "#f8fafc" }}>
                  <span style={{ flex: 1 }}>Total da NFS-e</span><span>{brl(previa.totalOmie || 0)}</span>
                </div>
              </div>
              {previa.divergente && (
                <div style={{ ...caixa("ambar"), marginTop: 10 }}>
                  O valor da OS no <strong>portal</strong> é {brl(previa.valorPortal || 0)}, mas a nota sai com o valor do <strong>Omie</strong> ({brl(previa.totalOmie || 0)}).
                  <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, fontWeight: 700, cursor: "pointer" }}>
                    <input type="checkbox" checked={conferiValor} onChange={(e) => setConferiValor(e.target.checked)} /> Conferi: pode sair com {brl(previa.totalOmie || 0)}
                  </label>
                </div>
              )}

              {previa.impostos?.disponivel && (
                <>
                  {titulo("Impostos dos serviços")}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", fontSize: 12.5 }}>
                    <select value={modeloId} onChange={(e) => trocarModelo(e.target.value)}
                      style={{ padding: "6px 8px", borderRadius: 4, border: "1px solid #cbd5e1", fontSize: 12.5, background: "#fff", color: "#1e293b" }}>
                      <option value="">Sem modelo (cadastro da Omie)</option>
                      {previa.impostos.modelos.map((m) => <option key={m.id} value={m.id}>{m.nome}{m.padrao ? " (padrão)" : ""}</option>)}
                    </select>
                    <span style={{ color: "#64748b" }}>
                      {previa.impostos.modelo && modeloId === previa.impostos.modelo.id
                        ? (previa.impostos.modelo.origem === "cliente" ? "modelo deste cliente" : "modelo padrão")
                        : modeloId ? "escolhido agora" : ""}
                      {qtdAjustes > 0 && <strong style={{ color: "#b45309" }}> · {qtdAjustes} ajuste(s) nesta OS</strong>}
                    </span>
                    <button type="button" onClick={() => setVerImpostos((v) => !v)}
                      style={{ marginLeft: "auto", background: "none", border: "none", color: "#0369A1", fontWeight: 700, cursor: "pointer", fontSize: 12.5 }}>
                      {verImpostos ? "Esconder campos" : `Ver/ajustar campos (${Object.keys(validacaoImpostos.campos).length})`}
                    </button>
                  </div>
                  {verImpostos && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 11.5, color: "#64748b", marginBottom: 6 }}>
                        Vale para os {previa.impostos.qtdItens} item(ns) de serviço da OS. Campo vazio = fica o que está no cadastro da Omie.
                      </div>
                      <CamposFiscaisEditor valores={valores} onChange={setValores} base={modeloId ? baseModelo : null} atuais={previa.impostos.atuais} />
                    </div>
                  )}
                  {validacaoImpostos.erros.length > 0 && <div style={{ ...caixa("verm"), marginTop: 8 }}>{validacaoImpostos.erros.join(" ")}</div>}
                  {previa.impostos.podeGerenciar && modeloId && !(previa.impostos.modelo?.origem === "cliente" && previa.impostos.modelo.id === modeloId) && (
                    <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, marginTop: 6, cursor: "pointer" }}>
                      <input type="checkbox" checked={salvarParaCliente} onChange={(e) => setSalvarParaCliente(e.target.checked)} />
                      Usar sempre o modelo &quot;{modeloAtual?.nome}&quot; para este cliente
                    </label>
                  )}
                  {previa.impostos.podeGerenciar && (
                    <a href="/pos/modelos-fiscais" target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 6, fontSize: 12, color: "#0369A1" }}>Gerenciar modelos fiscais ↗</a>
                  )}
                </>
              )}

              {titulo("Forma de pagamento")}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {(previa.opcoesPagamento || []).map((op) => (
                  <button key={op} type="button" onClick={() => setForma(op)}
                    style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: forma === op ? "1px solid #0369A1" : "1px solid #cbd5e1", background: forma === op ? "#0369A1" : "#fff", color: forma === op ? "#fff" : "#334155" }}>
                    {op}
                  </button>
                ))}
              </div>
              {!forma && <div style={{ fontSize: 12, color: "#b45309", marginTop: 6 }}>Escolha a forma de pagamento combinada com o cliente.</div>}
              {plano && (
                <div style={{ fontSize: 12.5, color: "#334155", marginTop: 8 }}>
                  {plano.parcelas.map((p) => (
                    <div key={p.nParcela}>{p.nParcela}ª parcela · {p.dDtVenc} · <strong>{brl(p.nValor)}</strong></div>
                  ))}
                  <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 2 }}>
                    Vencimentos contados a partir de hoje.
                    {(previa.retidoOmie || 0) > 0 && ` Sobre o líquido: ${brl(previa.totalOmie || 0)} − ${brl(previa.retidoOmie || 0)} retidos.`}
                    {mexeRetencao && " Os impostos escolhidos podem mudar as retenções: a Omie recalcula o líquido e as parcelas saem sobre o valor novo."}
                  </div>
                </div>
              )}

              </>}

              {escopo !== "os" && (previa.ppvs || []).length > 0 && (
                <>
                  {titulo(escopo === "pedido" ? "Pedidos de peças para faturar" : "Pedidos de peças desta OS")}
                  {(previa.ppvs || []).map((p) => {
                    const bloqueado = !!p.motivoFora || !previa.podeFaturarPecas;
                    return (
                      <label key={p.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, padding: "5px 0", opacity: bloqueado ? 0.6 : 1, cursor: bloqueado ? "default" : "pointer" }}>
                        <input type="checkbox" disabled={bloqueado} checked={ppvsMarcados.has(p.id)}
                          onChange={(e) => setPpvsMarcados((prev) => { const n = new Set(prev); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n; })} />
                        <span>
                          <strong>{escopo === "pedido" ? "Faturar" : "Faturar também"}</strong> {p.id}{p.pedidoOmie ? ` · PV ${p.pedidoOmie}` : ""} · {p.empresa || "Nova Tratores"} · {brl(p.valor)}
                          {p.motivoFora && <span style={{ color: "#64748b" }}> — {p.motivoFora}</span>}
                          {!p.motivoFora && !previa.podeFaturarPecas && <span style={{ color: "#64748b" }}> — sem permissão de faturar PPV</span>}
                        </span>
                      </label>
                    );
                  })}
                </>
              )}

              {comOS && !previa.validacao?.ok && (
                <div style={{ ...caixa(temImpostos ? "ambar" : "verm"), marginTop: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>O Omie recusou a validação desta OS como ela está hoje</div>
                  {previa.validacao?.msg}
                  {temImpostos
                    ? " — os impostos acima serão aplicados e a Omie valida de novo antes de emitir; se continuar recusando, nada é emitido."
                    : " — corrija no Omie (ou aplique um modelo fiscal acima) e abra esta janela de novo."}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button onClick={() => setEtapa("confirmar")} disabled={!podeEmitir}
                  style={{ ...btn, flex: 1, background: podeEmitir ? "#0369A1" : "#94a3b8", color: "#fff", cursor: podeEmitir ? "pointer" : "not-allowed" }}>
                  Continuar
                </button>
                {elegiveis.length > 0
                  ? <button onClick={() => setEtapa("escolher")} style={{ ...btn, background: "#f1f5f9", color: "#334155" }}>Voltar</button>
                  : <button onClick={onClose} style={{ ...btn, background: "#f1f5f9", color: "#334155" }}>Cancelar</button>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
