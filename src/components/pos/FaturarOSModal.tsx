"use client";
// Janela de faturamento da OS (emite NFS-e no Omie) — molde do FaturarModal do PPV,
// com o que a OS precisa a mais: forma de pagamento → parcelas, pedidos de peças
// para faturar junto e a conferência do valor que vai na nota (o do OMIE).
// Nada é emitido até o "Sim, faturar". A prévia usa o ValidarOS do Omie (não emite).
// Passos (José, 13/10/2026): 1) o que faturar — OS + pedido, só a OS ou só o
// pedido de peças; 2) dados (forma de pagamento, impostos, pedidos); 3) "Tem
// certeza?". A OS só vai para Concluída quando a OS e os pedidos estão faturados.
import { Fragment, useEffect, useMemo, useState } from "react";
import { authHeaders } from "@/lib/auth/client";
import ConferenciaOmie from "@/components/comum/ConferenciaOmie";
import CronometroEstimado, { useSegundos, pctPeloTempo } from "@/components/comum/CronometroEstimado";
import { parcelasDoPagamento } from "@/lib/pagamento/parcelas";
import { validarCampos, type CamposFiscais } from "@/lib/pos/modelo-fiscal";
import CamposFiscaisEditor, { paraTela, type ValoresTela } from "./CamposFiscaisEditor";

interface PPVPrevia {
  id: string; pedidoOmie: string; tipo: string; status: string; empresa: string;
  faturadoEm: string | null; valor: number; motivoFora: string | null;
  itens?: Array<{ codigo: string; descricao: string; quantidade: number; valorUnitario: number; total: number }>;
}
interface Previa {
  ok: boolean; erro?: string;
  os?: { id: string; cliente: string; numeroOmie: string; status: string };
  totalOmie?: number; valorPortal?: number; divergente?: boolean;
  servicos?: Array<{ descricao: string; detalhe?: string; quantidade: number; valorUnitario: number; desconto: number; total: number }>;
  pecasPortal?: number;
  formaPagamento?: string | null; opcoesPagamento?: string[]; hoje?: string;
  validacao?: { ok: boolean; msg: string | null };
  ppvs?: PPVPrevia[]; podeFaturarPecas?: boolean;
  liquidoOmie?: number; retidoOmie?: number;
  impostos?: {
    disponivel: boolean;
    modelo: { id: string; nome: string; origem: "cliente" | "padrao"; campos: CamposFiscais } | null;
    modelos: Array<{ id: string; nome: string; padrao: boolean; campos: CamposFiscais; descricao?: string | null; clientes?: string[] }>;
    orgaoPublico?: boolean;
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
  // portal × Omie conferidos (e alinhados) antes de qualquer faturamento
  const [conferido, setConferido] = useState(false);
  // depois de faturar: tela esperando a prefeitura/SEFAZ gerarem as notas
  const [aguardando, setAguardando] = useState(false);
  // confirmou que quer faturar órgão público com modelo diferente do dele
  const [cienteModelo, setCienteModelo] = useState(false);

  useEffect(() => {
    // o bloco só monta esta janela quando ela abre: o estado já nasce limpo
    if (!open || !conferido) return;
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
  }, [open, osId, conferido]);

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
  if (!conferido) return <ConferenciaOmie alvo={{ tipo: "os", osId }} onOk={() => setConferido(true)} onCancelar={onClose} />;

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
          body: JSON.stringify({ ppvIds: pecasJunto.map((p) => p.id), forma }),
        });
        const j = await r.json().catch(() => ({}));
        const pecas = (j.pecas || []).filter((p: { id: string }) => pecasJunto.some((x) => x.id === p.id));
        setResultado(j.ok ? { tipo: "pedido", pecas, concluida: !!j.concluida } : { tipo: "erro", mensagem: j.mensagem || j.error || "Não foi possível faturar o pedido." });
        if (j.ok) { onFaturado(); if (pecas.some((p: { ok: boolean }) => p.ok)) setAguardando(true); }
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
      if (j.tipo === "faturada") setAguardando(true);
    } catch {
      setResultado({ tipo: "desconhecido", mensagem: "Sem resposta do servidor. NÃO tente de novo agora: o portal confere no Omie e atualiza esta OS." });
      onFaturado();
    }
    setFaturando(false);
  };

  // parcelas das peças com a MESMA forma (José, 14/10/2026: a forma vale para os dois valores)
  const totalPecas = pecasJunto.reduce((t, p) => t + (Number(p.valor) || 0), 0);
  const planoPecas = forma && totalPecas > 0 && previa?.hoje ? parcelasDoPagamento(forma, totalPecas, previa.hoje) : null;
  const totalServico = comOS ? (previa?.totalOmie || 0) : 0;
  const totalGeral = totalServico + totalPecas;
  const linhasParcelas = (() => {
    const a = comOS ? plano?.parcelas || [] : [], b = planoPecas?.parcelas || [];
    const n = Math.max(a.length, b.length);
    return Array.from({ length: n }, (_, i) => ({ n: i + 1, venc: (a[i] || b[i])?.dDtVenc || "", servico: a[i]?.nValor || 0, pecas: b[i]?.nValor || 0 }));
  })();
  // Prefeitura / órgão público com modelo errado: avisa e explica (José, 14/10/2026)
  const alertaModelo = (() => {
    const imp = previa?.impostos;
    if (!comOS || !imp?.disponivel) return null;
    const escolhido = imp.modelos.find((m) => m.id === modeloId);
    const doCliente = imp.modelo?.origem === "cliente" ? imp.modelo : null;
    const porqueDe = (nome: string) => /ret[ée]m iss/i.test(nome)
      ? "Essa prefeitura retém o ISS na fonte. Se a nota sair sem a retenção, o valor e as parcelas ficam errados, a prefeitura paga a menos (ou recusa a nota) e ela precisa ser cancelada e emitida de novo."
      : /ret[ée]m ir/i.test(nome)
        ? "Essa prefeitura retém 1,5% de IR na fonte. Sem a retenção na nota, o valor a receber fica errado e a prefeitura não aceita a nota como está."
        : /sem reten/i.test(nome)
          ? "Essa prefeitura NÃO retém impostos. Com um modelo que retém, a nota sai com descontos que não deveriam existir e o cliente paga a menos."
          : "Órgão público tem regra própria de retenção (ISS e/ou IR na fonte). Com o modelo errado a nota pode ser rejeitada ou sair com valor errado.";
    if (doCliente && modeloId !== doCliente.id) {
      const cidades = imp.modelos.find((m) => m.id === doCliente.id)?.clientes || [];
      return { titulo: `Este cliente usa o modelo "${doCliente.nome}"${cidades.length ? ` (${cidades.join(", ")})` : ""} e você escolheu ${escolhido ? `"${escolhido.nome}"` : "nenhum modelo"}.`, porque: `Pode dar erro: ${porqueDe(doCliente.nome)}` };
    }
    if (imp.orgaoPublico && !doCliente && !/prefeitura/i.test(escolhido?.nome || "")) {
      return { titulo: `${previa?.os?.cliente || "Este cliente"} parece ser um órgão público, mas está com ${escolhido ? `o modelo "${escolhido.nome}"` : "nenhum modelo"}.`, porque: `Pode dar erro: ${porqueDe("")} Escolha o modelo de prefeitura certo e marque "usar sempre para este cliente".` };
    }
    return null;
  })();
  const podeContinuar = (escopo === "pedido" ? podeEmitir && !!forma : podeEmitir) && (!alertaModelo || cienteModelo);

  const COR = "#0369A1";
  const btn: React.CSSProperties = { padding: "12px 18px", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
  const caixa = (cor: "verm" | "ambar" | "verde" | "cinza"): React.CSSProperties => ({
    borderRadius: 10, padding: "12px 14px", fontSize: 13, lineHeight: 1.55, marginBottom: 12,
    background: { verm: "#fef2f2", ambar: "#fffbeb", verde: "#f0fdf4", cinza: "#f8fafc" }[cor],
    border: `1px solid ${{ verm: "#fecaca", ambar: "#fcd34d", verde: "#bbf7d0", cinza: "#e2e8f0" }[cor]}`,
    color: { verm: "#7f1d1d", ambar: "#92400e", verde: "#14532d", cinza: "#334155" }[cor],
  });
  const secao = (num: number, icone: string, t: string, extra?: React.ReactNode) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "22px 0 10px" }}>
      <span style={{ width: 26, height: 26, borderRadius: 8, background: "#e0f2fe", color: COR, fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{num}</span>
      <i className={`fas ${icone}`} style={{ color: "#64748b", fontSize: 13 }} />
      <span style={{ fontSize: 14, fontWeight: 800, color: "#0f172a", flex: 1 }}>{t}</span>
      {extra}
    </div>
  );
  let nSecao = 0;

  return (
    <div onClick={() => !faturando && !aguardando && onClose()} style={{ position: "fixed", inset: 0, zIndex: 68000, background: "rgba(15,23,42,.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "4vh 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fefefe", color: "#1e293b", borderRadius: 16, width: "100%", maxWidth: 680, boxShadow: "0 30px 70px rgba(0,0,0,.35)", overflow: "hidden" }}>
        {faturando && <FaturandoTela comOS={comOS} comPecas={pecasJunto.length > 0} />}
        {/* cabeçalho */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 22px", background: "linear-gradient(135deg, #e0f2fe, #fefefe 70%)", borderBottom: "1px solid #e2e8f0" }}>
          <span style={{ width: 44, height: 44, borderRadius: 12, background: COR, color: "#fefefe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, boxShadow: "0 6px 14px rgba(3,105,161,.3)" }}><i className="fas fa-file-invoice-dollar" /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 800 }}>Faturar no Omie{previa?.os ? ` · OS nº ${previa.os.numeroOmie}` : ""}</div>
            {previa?.os && <div style={{ fontSize: 12.5, color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{previa.os.cliente} · {previa.os.id} · fase: {previa.os.status}</div>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <span style={{ height: 36, padding: "0 10px", borderRadius: 10, background: "#fefefe", border: "1px solid #e2e8f0", display: "flex", alignItems: "center" }}><img src="/marcas/nfse.png" alt="NFS-e" style={{ height: 20, width: "auto" }} /></span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <span style={{ height: 36, padding: "0 10px", borderRadius: 10, background: "#fefefe", border: "1px solid #e2e8f0", display: "flex", alignItems: "center" }}><img src="/marcas/omie.png" alt="Omie" style={{ height: 18, width: "auto" }} /></span>
          </div>
          <button onClick={onClose} disabled={faturando || aguardando} title="Fechar" style={{ background: "#fefefe", border: "1px solid #e2e8f0", borderRadius: 10, width: 36, height: 36, cursor: "pointer", color: "#475569", fontSize: 18 }}>×</button>
        </div>

        <div style={{ padding: "18px 22px 22px" }}>
          {carregando && <div style={{ padding: 30, textAlign: "center", color: "#64748b", fontSize: 13.5 }}><i className="fas fa-spinner fa-spin" style={{ color: COR, marginRight: 8 }} />Preparando o faturamento…</div>}

          {/* ---------- depois de faturar: aguardando as notas ---------- */}
          {resultado && aguardando && (
            <AguardandoNotas osId={osId} comOS={resultado.tipo === "faturada"} ppvIds={(resultado.pecas || []).filter((p) => p.ok).map((p) => p.id)}
              numeroOS={previa?.os?.numeroOmie || ""} concluida={!!resultado.concluida} onFechar={onClose} />
          )}

          {/* ---------- resultado (erro / desconhecido / já faturada) ---------- */}
          {resultado && !aguardando && (
            <>
              {resultado.tipo === "faturada" || resultado.tipo === "ja_faturada" ? (
                <div style={caixa("verde")}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}><i className="fas fa-check-circle" /> {resultado.tipo === "ja_faturada" ? "A OS já estava faturada no Omie — o portal registrou." : "OS faturada."}</div>
                  <div style={{ fontWeight: 700 }}>{resultado.concluida ? "A OS foi para Concluída." : "A OS vai para Concluída quando o pedido de peças também for faturado."}</div>
                </div>
              ) : resultado.tipo === "pedido" ? (
                <div style={caixa(resultado.pecas?.every((p) => p.ok) ? "verde" : "ambar")}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}><i className="fas fa-boxes" /> Pedido de peças</div>
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
                    <div key={p.id}>{p.ok ? "✔" : "✖"} {p.id}{p.pedidoOmie ? ` (PV ${p.pedidoOmie.replace(/^0+(?=\d)/, "")})` : ""}: {p.ok ? (p.nf ? `NF-e ${p.nf}` : "enviado à SEFAZ") : p.erro}</div>
                  ))}
                  {!resultado.pecas!.every((p) => p.ok) && <div style={{ marginTop: 6 }}>Os pedidos que falharam podem ser faturados de novo pelo bloco de faturamento da OS.</div>}
                </div>
              )}
              <button onClick={onClose} style={{ ...btn, width: "100%", background: "#334155", color: "#fefefe" }}>Fechar</button>
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
              <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>O que você quer faturar agora?</div>
              <div style={{ fontSize: 14, color: "#64748b", marginBottom: 16 }}>A OS só vai para Concluída quando a nota de serviço e a de peças estiverem emitidas.</div>
              {([
                ["ambos", "fa-layer-group", "Serviço + peças", `NFS-e da OS nº ${previa.os?.numeroOmie} e NF-e de ${elegiveis.map((p) => p.pedidoOmie ? `PV ${p.pedidoOmie.replace(/^0+(?=\d)/, "")}` : p.id).join(", ")}.`, (previa.totalOmie || 0) + elegiveis.reduce((t, p) => t + (Number(p.valor) || 0), 0)],
                ["os", "fa-screwdriver-wrench", "Só a nota de serviço", "Emite só a NFS-e. A OS espera o pedido de peças ser faturado.", previa.totalOmie || 0],
                ["pedido", "fa-boxes-stacked", "Só a nota de peças", "Emite só a NF-e das peças. A OS espera a nota de serviço.", elegiveis.reduce((t, p) => t + (Number(p.valor) || 0), 0)],
              ] as const).map(([v, icone, rotulo, dica, valor]) => (
                <button key={v} type="button" onClick={() => escolher(v)}
                  style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", textAlign: "left", padding: "18px 20px", marginBottom: 12, borderRadius: 12, border: v === "ambos" ? `2px solid ${COR}` : "1px solid #cbd5e1", background: v === "ambos" ? "#f0f9ff" : "#fefefe", cursor: "pointer", fontFamily: "inherit" }}>
                  {void icone}
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 17, fontWeight: 800, color: "#0f172a" }}>{rotulo}{v === "ambos" && <span style={{ marginLeft: 8, fontSize: 10.5, padding: "2px 8px", borderRadius: 999, background: "#dcfce7", color: "#15803d", verticalAlign: "middle" }}>recomendado</span>}</span>
                    <span style={{ display: "block", fontSize: 14, color: "#64748b", marginTop: 4 }}>{dica}</span>
                  </span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", whiteSpace: "nowrap" }}>{brl(valor)}</span>
                </button>
              ))}
              <button onClick={onClose} style={{ ...btn, width: "100%", background: "#f1f5f9", color: "#334155", marginTop: 4 }}>Cancelar</button>
            </>
          )}

          {/* ---------- passo 3: tem certeza? ---------- */}
          {!resultado && previa?.ok && etapa === "confirmar" && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <span style={{ width: 42, height: 42, borderRadius: 12, background: "#fef3c7", color: "#b45309", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}><i className="fas fa-triangle-exclamation" /></span>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 800 }}>Tem certeza?</div>
                  <div style={{ fontSize: 12.5, color: "#64748b" }}>São notas fiscais reais. Cancelar depois só pelo Omie.</div>
                </div>
              </div>
              <ResumoNotas comOS={comOS} numeroOS={previa.os?.numeroOmie || ""} totalServico={totalServico} pecas={pecasJunto} forma={forma} totalGeral={totalGeral} />
              <div style={caixa(escopo === "ambos" || (escopo === "os" && !elegiveis.length) ? "verde" : "ambar")}>
                {escopo === "ambos" || (escopo === "os" && !elegiveis.length)
                  ? "Depois de faturar, a OS vai para Concluída."
                  : escopo === "os"
                    ? "A OS só vai para Concluída quando o pedido de peças também for faturado."
                    : "A OS só vai para Concluída quando a nota de serviço também for emitida."}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={faturar} disabled={faturando}
                  style={{ ...btn, flex: 1, background: COR, color: "#fefefe", cursor: faturando ? "wait" : "pointer", boxShadow: "0 6px 14px rgba(3,105,161,.3)" }}>
                  {faturando ? <><i className="fas fa-spinner fa-spin" /> Faturando… (não feche)</> : <><i className="fas fa-bolt" /> Sim, faturar {brl(totalGeral)}</>}
                </button>
                <button onClick={() => setEtapa("previa")} disabled={faturando} style={{ ...btn, background: "#f1f5f9", color: "#334155" }}>Voltar</button>
              </div>
            </>
          )}

          {/* ---------- passo 2: dados ---------- */}
          {!resultado && previa?.ok && etapa === "previa" && (
            <>
              {comOS && FASES_ANTES_DA_EXECUCAO.test(previa.os?.status || "") && (
                <div style={caixa("ambar")}><i className="fas fa-triangle-exclamation" /> A OS ainda está em <strong>{previa.os?.status}</strong>. Confira se o serviço já foi feito antes de faturar.</div>
              )}

              {comOS && <>
              {secao(++nSecao, "fa-screwdriver-wrench", "Nota de serviço (NFS-e)", <span style={{ fontSize: 15, fontWeight: 800 }}>{brl(previa.totalOmie || 0)}</span>)}
              <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 90px 100px", gap: 8, padding: "8px 14px", background: "#f8fafc", fontSize: 10.5, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: .4 }}>
                  <span>Serviço</span><span style={{ textAlign: "right" }}>Qtd × valor</span><span style={{ textAlign: "right" }}>Desconto</span><span style={{ textAlign: "right" }}>Total</span>
                </div>
                {(previa.servicos || []).map((s, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 120px 90px 100px", gap: 8, padding: "10px 14px", fontSize: 13, borderTop: "1px solid #f1f5f9", alignItems: "center" }}>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontWeight: 600 }}>{s.descricao || "Serviço"}</span>
                      {s.detalhe && <span style={{ display: "block", fontSize: 11.5, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.detalhe}</span>}
                    </span>
                    <span style={{ textAlign: "right", color: "#64748b", fontVariantNumeric: "tabular-nums" }}>{s.valorUnitario <= 0.01 ? "—" : `${String(s.quantidade).replace(".", ",")} × ${brl(s.valorUnitario)}`}</span>
                    <span style={{ textAlign: "right", color: s.desconto > 0 ? "#b45309" : "#cbd5e1", fontVariantNumeric: "tabular-nums" }}>{s.desconto > 0 ? `− ${brl(s.desconto)}` : "—"}</span>
                    <span style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{s.valorUnitario <= 0.01 ? "—" : brl(s.total ?? s.quantidade * s.valorUnitario)}</span>
                  </div>
                ))}
                {(previa.retidoOmie || 0) > 0 && (
                  <div style={{ display: "flex", padding: "8px 14px", fontSize: 12.5, color: "#64748b", borderTop: "1px solid #f1f5f9" }}>
                    <span style={{ flex: 1 }}>Impostos retidos</span><span>− {brl(previa.retidoOmie || 0)}</span>
                  </div>
                )}
              </div>
              {previa.divergente && (
                <div style={{ ...caixa("ambar"), marginTop: 10 }}>
                  <div style={{ fontWeight: 700 }}><i className="fas fa-scale-unbalanced" /> O serviço no portal soma {brl(previa.valorPortal || 0)}, mas a nota sai com {brl(previa.totalOmie || 0)} (o valor do Omie).</div>
                  <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, fontWeight: 700, cursor: "pointer" }}>
                    <input type="checkbox" checked={conferiValor} onChange={(e) => setConferiValor(e.target.checked)} style={{ width: 16, height: 16 }} /> Conferi: pode sair com {brl(previa.totalOmie || 0)}
                  </label>
                </div>
              )}

              {previa.impostos?.disponivel && (
                <>
                  {secao(++nSecao, "fa-percent", "Impostos dos serviços", (
                    <button type="button" onClick={() => setVerImpostos((v) => !v)} style={{ background: "none", border: "none", color: COR, fontWeight: 700, cursor: "pointer", fontSize: 12.5, fontFamily: "inherit" }}>
                      {verImpostos ? "Esconder campos" : `Ver/ajustar campos (${Object.keys(validacaoImpostos.campos).length})`}
                    </button>
                  ))}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                    <select value={modeloId} onChange={(e) => trocarModelo(e.target.value)}
                      style={{ flex: "1 1 260px", height: 40, padding: "0 12px", borderRadius: 10, border: "1px solid #cbd5e1", fontSize: 13.5, background: "#fefefe", color: "#1e293b", marginBottom: 0, fontFamily: "inherit" }}>
                      <option value="">Sem modelo (cadastro da Omie)</option>
                      {previa.impostos.modelos.map((m) => <option key={m.id} value={m.id}>{m.nome}{m.clientes?.length ? ` (${m.clientes.join(", ")})` : ""}{m.padrao ? " · padrão" : ""}</option>)}
                    </select>
                    <span style={{ fontSize: 12, padding: "4px 10px", borderRadius: 999, background: "#f1f5f9", color: "#475569", fontWeight: 600 }}>
                      {previa.impostos.modelo && modeloId === previa.impostos.modelo.id
                        ? (previa.impostos.modelo.origem === "cliente" ? "modelo deste cliente" : "modelo padrão")
                        : modeloId ? "escolhido agora" : "sem modelo"}
                      {qtdAjustes > 0 && <strong style={{ color: "#b45309" }}> · {qtdAjustes} ajuste(s)</strong>}
                    </span>
                  </div>
                  {verImpostos && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 11.5, color: "#64748b", marginBottom: 6 }}>
                        Vale para os {previa.impostos.qtdItens} item(ns) de serviço da OS. Campo vazio = fica o que está no cadastro da Omie.
                      </div>
                      <CamposFiscaisEditor valores={valores} onChange={setValores} base={modeloId ? baseModelo : null} atuais={previa.impostos.atuais} />
                    </div>
                  )}
                  {alertaModelo && (
                    <div style={{ ...caixa("verm"), marginTop: 10, marginBottom: 0 }}>
                      <div style={{ fontWeight: 800, marginBottom: 4 }}><i className="fas fa-landmark" /> {alertaModelo.titulo}</div>
                      <div>{alertaModelo.porque}</div>
                      <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, fontWeight: 700, cursor: "pointer" }}>
                        <input type="checkbox" checked={cienteModelo} onChange={(e) => setCienteModelo(e.target.checked)} style={{ width: 16, height: 16, margin: 0 }} /> Entendi o risco e quero faturar com este modelo
                      </label>
                    </div>
                  )}
                  {validacaoImpostos.erros.length > 0 && <div style={{ ...caixa("verm"), marginTop: 8 }}>{validacaoImpostos.erros.join(" ")}</div>}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", marginTop: 8 }}>
                    {previa.impostos.podeGerenciar && modeloId && !(previa.impostos.modelo?.origem === "cliente" && previa.impostos.modelo.id === modeloId) && (
                      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, cursor: "pointer", color: "#334155" }}>
                        <input type="checkbox" checked={salvarParaCliente} onChange={(e) => setSalvarParaCliente(e.target.checked)} style={{ width: 15, height: 15, margin: 0 }} />
                        Usar sempre &quot;{modeloAtual?.nome}&quot; para este cliente
                      </label>
                    )}
                    {previa.impostos.podeGerenciar && (
                      <a href="/pos/modelos-fiscais" target="_blank" rel="noreferrer" style={{ fontSize: 12, color: COR, marginLeft: "auto" }}>Gerenciar modelos fiscais ↗</a>
                    )}
                  </div>
                </>
              )}
              </>}

              {escopo !== "os" && (previa.ppvs || []).length > 0 && (
                <>
                  {secao(++nSecao, "fa-boxes-stacked", "Nota de peças (NF-e)", totalPecas > 0 ? <span style={{ fontSize: 15, fontWeight: 800 }}>{brl(totalPecas)}</span> : null)}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {(previa.ppvs || []).map((p) => {
                      const bloqueado = !!p.motivoFora || !previa.podeFaturarPecas;
                      const marcado = ppvsMarcados.has(p.id);
                      return (
                        <Fragment key={p.id}>
                        <label style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 14px", borderRadius: 12, border: marcado ? `1.5px solid ${COR}` : "1px solid #e2e8f0", background: marcado ? "#f0f9ff" : "#fefefe", opacity: bloqueado ? 0.6 : 1, cursor: bloqueado ? "default" : "pointer" }}>
                          <input type="checkbox" disabled={bloqueado} checked={marcado} style={{ width: 17, height: 17, margin: 0, flexShrink: 0 }}
                            onChange={(e) => setPpvsMarcados((prev) => { const n = new Set(prev); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n; })} />
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: "block", fontSize: 13.5, fontWeight: 700 }}>{p.id}{p.pedidoOmie ? <span style={{ fontWeight: 500, color: "#64748b" }}> · pedido {p.pedidoOmie.replace(/^0+(?=\d)/, "")}</span> : null}</span>
                            <span style={{ display: "block", fontSize: 11.5, color: "#64748b" }}>
                              {p.empresa || "Nova Tratores"}
                              {p.motivoFora && ` — ${p.motivoFora}`}
                              {!p.motivoFora && !previa.podeFaturarPecas && " — sem permissão de faturar PPV"}
                            </span>
                          </span>
                          <span style={{ fontSize: 14, fontWeight: 800, whiteSpace: "nowrap" }}>{brl(Number(p.valor) || 0)}</span>
                        </label>
                        {(p.itens || []).length > 0 && (
                          <div style={{ margin: "-2px 0 4px 30px", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden", opacity: marcado ? 1 : 0.65 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 100px", gap: 8, padding: "7px 12px", background: "#f8fafc", fontSize: 10.5, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: .4 }}>
                              <span>Peça</span><span style={{ textAlign: "right" }}>Qtd × valor</span><span style={{ textAlign: "right" }}>Total</span>
                            </div>
                            {(p.itens || []).map((it) => (
                              <div key={it.codigo} style={{ display: "grid", gridTemplateColumns: "1fr 120px 100px", gap: 8, padding: "8px 12px", fontSize: 12.5, borderTop: "1px solid #f1f5f9", alignItems: "center" }}>
                                <span style={{ minWidth: 0 }}>
                                  <span style={{ display: "block", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.descricao || it.codigo}</span>
                                  <span style={{ display: "block", fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>{it.codigo}</span>
                                </span>
                                <span style={{ textAlign: "right", color: "#64748b", fontVariantNumeric: "tabular-nums" }}>{String(it.quantidade).replace(".", ",")} × {brl(it.valorUnitario)}</span>
                                <span style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{brl(it.total)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        </Fragment>
                      );
                    })}
                  </div>
                </>
              )}

              {secao(++nSecao, "fa-calendar-days", "Forma de pagamento", <span style={{ fontSize: 11.5, color: "#64748b" }}>vale para {comOS && pecasJunto.length ? "serviço e peças" : comOS ? "o serviço" : "as peças"}</span>)}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {(previa.opcoesPagamento || []).map((op) => (
                  <button key={op} type="button" onClick={() => setForma(op)}
                    style={{ padding: "9px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: forma === op ? `1.5px solid ${COR}` : "1px solid #cbd5e1", background: forma === op ? COR : "#fefefe", color: forma === op ? "#fefefe" : "#334155", boxShadow: forma === op ? "0 4px 10px rgba(3,105,161,.25)" : "none" }}>
                    {op}
                  </button>
                ))}
              </div>
              {!forma && <div style={{ fontSize: 12.5, color: "#b45309", marginTop: 8 }}><i className="fas fa-hand-pointer" /> Escolha a forma de pagamento combinada com o cliente.</div>}
              {forma && linhasParcelas.length > 0 && (
                <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden", marginTop: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr 1fr 1fr", gap: 8, padding: "8px 14px", background: "#f8fafc", fontSize: 10.5, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: .4 }}>
                    <span>Parcela</span><span>Vencimento</span><span style={{ textAlign: "right" }}>Serviço</span><span style={{ textAlign: "right" }}>Peças</span><span style={{ textAlign: "right" }}>Total</span>
                  </div>
                  {linhasParcelas.map((l) => (
                    <div key={l.n} style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr 1fr 1fr", gap: 8, padding: "9px 14px", fontSize: 13, borderTop: "1px solid #f1f5f9", fontVariantNumeric: "tabular-nums" }}>
                      <span style={{ fontWeight: 700 }}>{l.n}ª</span><span>{l.venc}</span>
                      <span style={{ textAlign: "right", color: "#475569" }}>{l.servico ? brl(l.servico) : "—"}</span>
                      <span style={{ textAlign: "right", color: "#475569" }}>{l.pecas ? brl(l.pecas) : "—"}</span>
                      <span style={{ textAlign: "right", fontWeight: 800 }}>{brl(l.servico + l.pecas)}</span>
                    </div>
                  ))}
                  <div style={{ padding: "8px 14px", fontSize: 11.5, color: "#64748b", borderTop: "1px solid #f1f5f9", background: "#fcfcfd" }}>
                    Vencimentos contados a partir de hoje. Cada nota leva as suas parcelas.
                    {(previa.retidoOmie || 0) > 0 && ` Serviço sobre o líquido (${brl(previa.totalOmie || 0)} − ${brl(previa.retidoOmie || 0)} retidos).`}
                    {mexeRetencao && " Os impostos escolhidos podem mudar as retenções: a Omie recalcula o líquido do serviço."}
                  </div>
                </div>
              )}

              {comOS && !previa.validacao?.ok && (
                <div style={{ ...caixa(temImpostos ? "ambar" : "verm"), marginTop: 14 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>O Omie recusou a validação desta OS como ela está hoje</div>
                  {previa.validacao?.msg}
                  {temImpostos
                    ? " — os impostos acima serão aplicados e a Omie valida de novo antes de emitir; se continuar recusando, nada é emitido."
                    : " — corrija no Omie (ou aplique um modelo fiscal acima) e abra esta janela de novo."}
                </div>
              )}

              {secao(++nSecao, "fa-receipt", "Resumo das notas")}
              <ResumoNotas comOS={comOS} numeroOS={previa.os?.numeroOmie || ""} totalServico={totalServico} pecas={pecasJunto} forma={forma} totalGeral={totalGeral} />

              <div style={{ display: "flex", gap: 8, marginTop: 6, position: "sticky", bottom: 0, background: "#fefefe", paddingTop: 8 }}>
                <button onClick={() => setEtapa("confirmar")} disabled={!podeContinuar}
                  style={{ ...btn, flex: 1, background: podeContinuar ? COR : "#94a3b8", color: "#fefefe", cursor: podeContinuar ? "pointer" : "not-allowed" }}>
                  Continuar <i className="fas fa-arrow-right" style={{ marginLeft: 6 }} />
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

/** Resumo: nota de serviço, nota(s) de peças e a soma das duas. */
function ResumoNotas({ comOS, numeroOS, totalServico, pecas, forma, totalGeral }: {
  comOS: boolean; numeroOS: string; totalServico: number; pecas: PPVPrevia[]; forma: string | null; totalGeral: number;
}) {
  const linha = (icone: string, cor: string, titulo: string, sub: string, valor: number, chave: string) => (
    <div key={chave} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderTop: "1px solid #f1f5f9" }}>
      <span style={{ width: 44, height: 44, borderRadius: 12, background: `color-mix(in srgb, ${cor} 12%, #fefefe)`, color: cor, border: `1px solid color-mix(in srgb, ${cor} 25%, #fefefe)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 19 }}>
        <i className={`fas ${icone}`} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 15.5, fontWeight: 700 }}>{titulo}</span>
        <span style={{ display: "block", fontSize: 13, color: "#64748b" }}>{sub}</span>
      </span>
      <span style={{ fontSize: 17, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{brl(valor)}</span>
    </div>
  );
  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden", marginBottom: 12 }}>
      {comOS && linha("fa-file-invoice", "#0369A1", "NFS-e · nota de serviço", `OS nº ${numeroOS}${forma ? ` · ${forma}` : ""}`, totalServico, "os")}
      {pecas.map((p) => linha("fa-file-invoice-dollar", "#e8730c", "NF-e · nota de peças", `${p.id}${p.pedidoOmie ? ` · pedido ${p.pedidoOmie.replace(/^0+(?=\d)/, "")}` : ""}${forma ? ` · ${forma}` : ""}`, Number(p.valor) || 0, p.id))}
      <div style={{ display: "flex", alignItems: "center", padding: "16px", background: "#f0f9ff", borderTop: "2px solid #bae6fd" }}>
        <span style={{ flex: 1, fontSize: 15.5, fontWeight: 800, color: "#0c4a6e" }}>Total a faturar{comOS && pecas.length ? <span style={{ fontWeight: 600, color: "#0369A1" }}> · serviço + peças</span> : null}</span>
        <span style={{ fontSize: 22, fontWeight: 800, color: "#0369A1", fontVariantNumeric: "tabular-nums" }}>{brl(totalGeral)}</span>
      </div>
    </div>
  );
}

/** Depois de faturar: espera a prefeitura (NFS-e) e a SEFAZ (NF-e) gerarem as notas e traz para o portal. */
function AguardandoNotas({ osId, comOS, ppvIds, numeroOS, concluida, onFechar }: {
  osId: string; comOS: boolean; ppvIds: string[]; numeroOS: string; concluida: boolean; onFechar: () => void;
}) {
  type Situacao = { estado: "aguardando" | "ok" | "erro"; numero?: string; msg?: string };
  const [nfse, setNfse] = useState<Situacao>({ estado: comOS ? "aguardando" : "ok" });
  const [nfes, setNfes] = useState<Record<string, Situacao>>(() => Object.fromEntries(ppvIds.map((id) => [id, { estado: "aguardando" } as Situacao])));
  const [segundos, setSegundos] = useState(0);
  const [rodada, setRodada] = useState(0);
  const tudo = nfse.estado !== "aguardando" && Object.values(nfes).every((s) => s.estado !== "aguardando");

  useEffect(() => {
    if (tudo) return;
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [tudo]);
  // confere a cada 20 s (a 1ª depois de 8 s): NFS-e pela OS, NF-e por pedido
  useEffect(() => {
    if (tudo) return;
    let vivo = true;
    const t = setTimeout(async () => {
      try {
        const h = await authHeaders();
        if (comOS && nfse.estado === "aguardando") {
          const r = await fetch(`/api/pos/ordens/${encodeURIComponent(osId)}/faturar?reconciliar=1&forcar=1`, { headers: h });
          const j = await r.json().catch(() => ({}));
          if (vivo && j?.status === "nfse_autorizada") setNfse({ estado: "ok", numero: j.nfseNumero || "" });
          else if (vivo && j?.status === "nfse_rejeitada") setNfse({ estado: "erro", msg: j.erro || "rejeitada pela prefeitura" });
        }
        for (const id of Object.keys(nfes)) {
          if (nfes[id].estado !== "aguardando") continue;
          const r = await fetch(`/api/ppv/nf-sefaz?id=${encodeURIComponent(id)}`, { headers: h });
          const j = await r.json().catch(() => ({}));
          if (vivo && j?.faturado && j?.numero && !j?.canceladaEm) setNfes((x) => ({ ...x, [id]: { estado: "ok", numero: String(j.numero).replace(/^0+/, "") } }));
          else if (vivo && j?.denegada) setNfes((x) => ({ ...x, [id]: { estado: "erro", msg: "denegada pela SEFAZ" } }));
        }
      } catch { /* tenta na próxima */ }
      if (vivo) setRodada((n) => n + 1);
    }, rodada === 0 ? 8000 : 20000);
    return () => { vivo = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rodada, tudo]);

  const mmss = `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`;
  const linha = (icone: string, titulo: string, orgao: string, s: Situacao) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 12, border: "1px solid #e2e8f0", background: s.estado === "ok" ? "#f0fdf4" : s.estado === "erro" ? "#fef2f2" : "#fefefe" }}>
      <span style={{ width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0,
        background: s.estado === "ok" ? "#22c55e" : s.estado === "erro" ? "#ef4444" : "#e0f2fe", color: s.estado === "aguardando" ? "#0369A1" : "#fefefe" }}>
        <i className={`fas ${s.estado === "ok" ? "fa-check" : s.estado === "erro" ? "fa-xmark" : icone}`} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13.5, fontWeight: 700 }}>{titulo}</span>
        <span style={{ display: "block", fontSize: 12, color: s.estado === "erro" ? "#b91c1c" : "#64748b" }}>
          {s.estado === "ok" ? `Nota nº ${s.numero || "—"} emitida e trazida para o portal` : s.estado === "erro" ? s.msg : `Aguardando ${orgao} gerar a nota…`}
        </span>
      </span>
      {s.estado === "aguardando" && <i className="fas fa-spinner fa-spin" style={{ color: "#0369A1" }} />}
    </div>
  );
  return (
    <div>
      <style>{`@keyframes notaPulsa { 0%,100% { transform: scale(1); opacity: 1 } 50% { transform: scale(1.06); opacity: .85 } }`}</style>
      <div style={{ textAlign: "center", padding: "6px 0 18px" }}>
        <div style={{ width: 70, height: 70, margin: "0 auto 12px", borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28,
          background: tudo ? "#dcfce7" : "#e0f2fe", color: tudo ? "#15803d" : "#0369A1", animation: tudo ? undefined : "notaPulsa 1.8s ease-in-out infinite" }}>
          <i className={`fas ${tudo ? "fa-circle-check" : "fa-building-columns"}`} />
        </div>
        <div style={{ fontSize: 18, fontWeight: 800 }}>{tudo ? "Notas emitidas" : "Faturado! Aguardando as notas"}</div>
        <div style={{ fontSize: 13, color: "#64748b", marginTop: 4, lineHeight: 1.5 }}>
          {tudo ? "As notas já estão no portal." : <>A prefeitura e a SEFAZ estão gerando as notas. Quando saírem, eu trago para o portal.<br />Esperando há {mmss}</>}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {comOS && linha("fa-screwdriver-wrench", `NFS-e · serviço (OS nº ${numeroOS})`, "a prefeitura (sistema nacional)", nfse)}
        {ppvIds.map((id) => linha("fa-boxes-stacked", `NF-e · peças (${id})`, "a SEFAZ", nfes[id]))}
      </div>
      <div style={{ fontSize: 12.5, color: "#475569", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 12px", marginTop: 14, lineHeight: 1.5 }}>
        {concluida ? <><i className="fas fa-check" style={{ color: "#15803d" }} /> A OS foi para <b>Concluída</b>.</> : <><i className="fas fa-circle-info" /> A OS vai para Concluída quando todas as notas estiverem emitidas.</>}
        {!tudo && " Pode fechar esta janela: você recebe um aviso no sino quando cada nota sair."}
      </div>
      <button onClick={onFechar} style={{ marginTop: 14, width: "100%", padding: "12px 18px", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", background: tudo ? "#15803d" : "#334155", color: "#fefefe" }}>
        {tudo ? "Concluir" : "Fechar e continuar em segundo plano"}
      </button>
    </div>
  );
}

/** Enquanto fatura: Omie → NFS-e/NF-e com os passos andando (José, 14/10/2026). */
function FaturandoTela({ comOS, comPecas }: { comOS: boolean; comPecas: boolean }) {
  const passos = [
    ...(comOS ? ["Aplicando os impostos dos serviços", "Gravando as parcelas", "Validando a OS no Omie", "Emitindo a NFS-e"] : []),
    ...(comPecas ? ["Gravando as parcelas do pedido de peças", "Emitindo a NF-e das peças"] : []),
  ];
  // tempo típico: OS ~75 s (impostos, parcelas, conferências e a emissão) + pedido ~35 s
  const estimativa = (comOS ? 75 : 0) + (comPecas ? 35 : 0) || 40;
  const segundos = useSegundos();
  const pct = pctPeloTempo(segundos, estimativa);
  const passo = Math.min(passos.length - 1, Math.floor((segundos / estimativa) * passos.length));
  const COR = "#0369A1";
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 68010, background: "rgba(15,23,42,.55)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <style>{`
        @keyframes fatCorre { 0% { left: -40% } 100% { left: 100% } }
        @keyframes fatGira { to { transform: rotate(360deg) } }
        .fat-fio { position: relative; width: 110px; height: 4px; border-radius: 4px; background: color-mix(in srgb, ${COR} 18%, transparent); overflow: hidden; }
        .fat-fio::after { content: ""; position: absolute; top: 0; left: -40%; width: 40%; height: 100%; border-radius: 4px; background: ${COR}; animation: fatCorre 1.1s ease-in-out infinite; }
        .fat-logo { width: 78px; height: 64px; border-radius: 16px; background: #fefefe; border: 1px solid #e2e8f0; box-shadow: 0 6px 16px rgba(15,23,42,.08); display: flex; align-items: center; justify-content: center; }
      `}</style>
      <div style={{ width: 460, maxWidth: "100%", background: "#fefefe", borderRadius: 18, overflow: "hidden", boxShadow: "0 30px 70px rgba(15,23,42,.4)" }}>
        <div style={{ padding: "26px 28px 20px", background: "linear-gradient(135deg, #e0f2fe, #fefefe 70%)", borderBottom: "1px solid #eef1f4" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <div className="fat-logo" title="Omie"><img src="/marcas/omie.png" alt="Omie" style={{ maxWidth: 56, maxHeight: 26 }} /></div>
            <div className="fat-fio" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <div className="fat-logo" title={comOS ? "NFS-e" : "NF-e"}>{comOS ? <img src="/marcas/nfse.png" alt="NFS-e" style={{ maxWidth: 56, maxHeight: 30 }} /> : <b style={{ fontSize: 18, color: "#e8730c" }}>NF-e</b>}</div>
          </div>
          <div style={{ marginTop: 18, textAlign: "center", fontSize: 17, fontWeight: 800, color: "#1e293b" }}>Faturando no Omie</div>
          <div style={{ marginTop: 4, textAlign: "center", fontSize: 12.5, color: "#64748b" }}>Não feche esta janela.</div>
        </div>
        <div style={{ padding: "18px 28px 6px", display: "flex", flexDirection: "column", gap: 11 }}>
          {passos.map((p, i) => (
            <div key={p} style={{ display: "flex", alignItems: "center", gap: 11, fontSize: 13.5, color: i < passo ? "#334155" : i === passo ? "#1e293b" : "#94a3b8", fontWeight: i === passo ? 700 : 500 }}>
              <span style={{ width: 24, height: 24, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11,
                border: i < passo ? "2px solid #22c55e" : i === passo ? `2px solid color-mix(in srgb, ${COR} 25%, transparent)` : "2px solid #e2e8f0",
                borderTopColor: i === passo ? COR : undefined, background: i < passo ? "#22c55e" : "transparent", color: "#fefefe",
                animation: i === passo ? "fatGira .8s linear infinite" : undefined }}>
                {i < passo && <i className="fas fa-check" />}
              </span>
              {p}
            </div>
          ))}
        </div>
        <div style={{ margin: "14px 28px 24px", height: 6, borderRadius: 6, background: "#eef2f6", overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", borderRadius: 6, background: `linear-gradient(90deg, ${COR}, #22c55e)`, transition: "width .6s ease" }} />
        </div>
        <div style={{ margin: "-10px 28px 22px" }}><CronometroEstimado segundos={segundos} estimativa={estimativa} cor={COR} /></div>
      </div>
    </div>
  );
}
