"use client";
// ============================================================================
// "Item de Orçamento" — detalhe/edição de UM item do Pedido de Venda (espelho da
// tela do Omie). Abre pelo código azul do produto ou pelo botão "Descrição
// Produto". Layout idêntico ao preview aprovado.
//  - Dados do Produto (DB-first, por SKU): cmc/preço/família/vendas/última
//    entrada/histórico + CFOP/custo de garantia.
//  - Abas fiscais (ICMS/ICMS ST/IPI/PIS/COFINS): lidas/salvas na tabela
//    produto_fiscal — EDITÁVEIS NO PORTAL, antes de enviar ao Omie. Ao salvar,
//    se o pedido já existe no Omie (não faturado), aplica lá também.
//  - Família: altera no Omie + banco.
// Todas as chamadas usam authHeaders() (as rotas exigem login).
// ============================================================================
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { authHeaders } from "@/lib/auth/client";

type Conta = "NOVA" | "CASTRO";

interface FiscalBlocos {
  cfop: string;
  icms: { cst: string; origem: string; modalidade: string; aliquota: number; base: number; percRedBase: number };
  icmsSt: { cst: string; modalidade: string; aliquota: number; aliqOpProp: number; base: number; margem: number; percRedBaseOp: number; percRedBaseSt: number; cest: string };
  ipi: { cst: string; enquadramento: string; aliquota: number; base: number };
  pis: { cst: string; aliquota: number; base: number };
  cofins: { cst: string; aliquota: number; base: number };
}
interface OpcaoFiscal { codigo: string; descricao: string }
interface ListasFiscais {
  cfop: OpcaoFiscal[]; origem_icms: OpcaoFiscal[]; cst_icms: OpcaoFiscal[]; mod_bc_icms: OpcaoFiscal[];
  cst_ipi: OpcaoFiscal[]; enq_ipi: OpcaoFiscal[]; cst_pis: OpcaoFiscal[]; cst_cofins: OpcaoFiscal[];
}
interface ProdutoDados {
  codigoProduto: number; codigo: string; descricao: string; descricaoDetalhada: string | null; ncm: string | null;
  familia: string | null; codigoFamilia: number | null; cmc: number | null; estoque: number | null;
  valorVenda: number | null; valorEstoque: number | null; vendasQtde: number; vendasValor: number;
  ultimaEntrada: { data: string; nf: string; qtd: number; vu: number; vt: number; fornecedor: string } | null;
  ultimaVendaValor: number | null;
  historicoVendas: Array<{ numero: string; data: string; qtd: number; vu: number; vt: number; cliente?: string; vendedor?: string }>;
  caracteristicas: string;
  cfopGarantia: string[] | null;
  ultimoCustoGarantia: number | null;
}

const brl = (x: number | null | undefined) =>
  x == null ? "—" : x.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const ABAS = [
  { id: "dados", label: "Dados do Produto" },
  { id: "icms", label: "ICMS" },
  { id: "icmsst", label: "ICMS ST" },
  { id: "ipi", label: "IPI" },
  { id: "pis", label: "PIS" },
  { id: "cofins", label: "COFINS" },
  { id: "familia", label: "Família" },
] as const;
type AbaId = (typeof ABAS)[number]["id"];

const CSS = `
.io-ov{position:fixed;inset:0;z-index:70000;background:rgba(15,23,42,.55);overflow-y:auto;padding:14px;font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif;}
.io-card{background:#fff;max-width:1180px;margin:0 auto;border-radius:6px;box-shadow:0 12px 44px rgba(0,0,0,.28);overflow:hidden;display:flex;flex-direction:column;color:#3f3a34;}
.io-title{display:flex;align-items:center;gap:10px;padding:12px 22px;background:#f4f2ee;border-bottom:1px solid #e2ddd3;font-size:16px;font-weight:600;color:#5f574c;}
.io-tag{font-size:12px;font-weight:700;color:#7a4a00;background:#ffe7bd;border:1px solid #f0c886;border-radius:4px;padding:2px 8px;}
.io-tag.ro{color:#7f1d1d;background:#fee2e2;border-color:#fecaca;}
.io-x{margin-left:auto;background:#eceae5;border:none;border-radius:8px;width:32px;height:32px;cursor:pointer;color:#6b6259;font-size:19px;line-height:1;}
.io-body{padding:14px 22px 0;}
.io-l{display:block;font-size:12px;color:#6b6259;margin-bottom:4px;}
.io-ctl{position:relative;}
.io-ctl input,.io-ctl select{width:100%;height:31px;border:1px solid #cfc9bd;border-radius:3px;padding:0 9px;font-size:13px;font-family:inherit;color:#3f3a34;background:#fff;outline:none;}
.io-ctl input.num{text-align:right;}
.io-ctl.ro input,.io-rov{background:#e9e7e1;border:1px solid #d6d0c4;color:#4a453d;}
.io-rov{display:flex;align-items:center;height:31px;border-radius:3px;padding:0 9px;font-size:13.5px;font-weight:600;}
.io-ctl.search input{padding-right:32px;}
.io-ctl .app{position:absolute;right:1px;top:1px;bottom:1px;width:30px;border-left:1px solid #ded8cc;display:flex;align-items:center;justify-content:center;color:#8a8378;background:#f6f3ee;border-radius:0 3px 3px 0;cursor:pointer;}
.io-badges{display:flex;gap:6px;flex-wrap:wrap;margin:2px 0 4px;}
.io-badge{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;border-radius:3px;padding:3px 9px;}
.io-badge.g{background:#eaf7ef;border:1px solid #bfe6cd;color:#0f9d58;}
.io-badge.b{background:#eef3fb;border:1px solid #cfe0f2;color:#2f6fb0;}
.io-tabs{display:flex;align-items:flex-end;gap:2px;border-bottom:1px solid #e2ddd3;margin:14px 0;padding-top:3px;flex-wrap:wrap;}
.io-tab{padding:8px 15px;font-size:13px;cursor:pointer;white-space:nowrap;color:#7a7268;margin-bottom:-1px;border:1px solid transparent;border-top:2px solid transparent;border-radius:5px 5px 0 0;background:none;font-family:inherit;}
.io-tab.on{background:#fff;color:#e8730c;font-weight:600;border-color:#e2ddd3;border-bottom-color:#fff;border-top:2px solid #e8730c;}
.io-pane{min-height:220px;}
.io-grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:12px;}
.io-grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px 12px;margin-bottom:6px;max-width:820px;}
.io-listcard{display:flex;align-items:center;gap:11px;border:1px solid #d6d0c4;border-radius:5px;padding:9px 12px;background:#fff;margin-top:4px;}
.io-foot{display:grid;grid-template-columns:repeat(5,1fr) 1.2fr;border-top:1px solid #e2ddd3;margin-top:14px;}
.io-foot .cell{padding:14px 16px;}
.io-foot .fl{font-size:12px;color:#6b6259;margin-bottom:4px;}
.io-foot .fv{font-size:15px;font-weight:600;color:#3f3a34;}
.io-foot .fv.mut{color:#b7b0a3;}
.io-foot .cell.total{background:#f5edc9;border-left:1px solid #e6d9a3;}
.io-foot .cell.total .fv{font-size:17px;}
.io-actions{display:flex;align-items:center;gap:10px;padding:12px 22px;border-top:1px solid #e2ddd3;background:#faf9f7;flex-wrap:wrap;}
.io-btn{padding:9px 16px;border-radius:8px;border:none;font-size:13.5px;font-weight:700;cursor:pointer;}
.io-btn.pri{background:#e8730c;color:#fff;}
.io-btn.red{background:#dc2626;color:#fff;}
.io-btn.gray{background:#fff;color:#334155;border:1px solid #d1d5db;}
.io-ic{width:1em;height:1em;vertical-align:-.13em;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;color:#8a8378;}
`;

export interface ItemLista { codigo: string; descricao: string; conta: Conta; quantidade: number; preco: number }

export default function ItemOrcamentoModal({
  open, ppvId, pedidoOmie, conta, codigo, descricao, quantidade, preco, userName, onClose, showToast, itens, onIrPara,
}: {
  open: boolean;
  ppvId: string | null;
  pedidoOmie?: string;
  conta: Conta;
  codigo: string | null;
  descricao?: string;
  quantidade?: number;
  preco?: number;
  userName?: string;
  onClose: () => void;
  showToast: (tipo: "success" | "error", msg: string) => void;
  itens?: ItemLista[];                       // todos os itens do pedido (p/ navegar)
  onIrPara?: (item: ItemLista) => void;      // troca o item exibido sem fechar
}) {
  const [aba, setAba] = useState<AbaId>("dados");
  const [dados, setDados] = useState<ProdutoDados | null>(null);
  const [dadosLoading, setDadosLoading] = useState(false);
  const [fiscal, setFiscal] = useState<FiscalBlocos | null>(null);
  const [fiscalExiste, setFiscalExiste] = useState(false);
  const [listas, setListas] = useState<ListasFiscais | null>(null);
  const [familias, setFamilias] = useState<Array<{ codigo_familia: number; nome: string }>>([]);
  const [familiaSel, setFamiliaSel] = useState("");
  const [aplicandoFam, setAplicandoFam] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [obs, setObs] = useState("");
  // Marca quando o usuário mexeu no fiscal mas ainda NÃO salvou. Enquanto não
  // salvar, o bloco de imposto NÃO vai pro Omie (o Omie recalcula pelo Cenário).
  const [fiscalDirty, setFiscalDirty] = useState(false);

  // Dados do produto (DB-first, por SKU)
  useEffect(() => {
    if (!open || !codigo) return;
    let cancelado = false;
    setDados(null); setDadosLoading(true);
    (async () => {
      try {
        const r = await fetch(`/api/estoque/produto-dados?conta=${conta}&codigo=${encodeURIComponent(codigo)}`, { headers: { ...(await authHeaders()) } });
        const j = await r.json();
        if (cancelado) return;
        if (r.ok) setDados(j); else console.error("[ItemOrcamento] produto-dados:", j?.error);
      } catch (e) { if (!cancelado) console.error("[ItemOrcamento] produto-dados:", e); }
      finally { if (!cancelado) setDadosLoading(false); }
    })();
    return () => { cancelado = true; };
  }, [open, codigo, conta]);

  // Perfil fiscal do produto (tabela produto_fiscal) — depende do codigoProduto resolvido
  const codigoProduto = dados?.codigoProduto || 0;
  useEffect(() => {
    if (!open || !codigoProduto) { setFiscal(null); return; }
    let cancelado = false;
    (async () => {
      try {
        const r = await fetch(`/api/ppv/produto-fiscal?conta=${conta}&codigoProduto=${codigoProduto}`, { headers: { ...(await authHeaders()) } });
        const j = await r.json();
        if (cancelado) return;
        if (r.ok) {
          setFiscalExiste(!!j.existe);
          setFiscalDirty(false); // acabou de carregar do banco: nada pendente
          setFiscal({ cfop: j.cfop, icms: j.icms, icmsSt: j.icmsSt, ipi: j.ipi, pis: j.pis, cofins: j.cofins });
        } else console.error("[ItemOrcamento] produto-fiscal:", j?.error);
      } catch (e) { if (!cancelado) console.error("[ItemOrcamento] produto-fiscal:", e); }
    })();
    return () => { cancelado = true; };
  }, [open, codigoProduto, conta]);

  const carregarFamilias = useCallback(async () => {
    try {
      const r = await fetch(`/api/ajustes/familias?conta=${conta}`, { headers: { ...(await authHeaders()) } });
      const j = await r.json();
      setFamilias(j?.familias || []);
    } catch (e) { console.error("[ItemOrcamento] listar famílias:", e); }
  }, [conta]);
  useEffect(() => { if (open) { setAba("dados"); setConfirmar(false); setObs(""); carregarFamilias(); } }, [open, carregarFamilias]);

  // Listas de códigos fiscais (dropdowns) — do banco, uma vez por abertura.
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const r = await fetch(`/api/ppv/fiscal-listas`, { headers: { ...(await authHeaders()) } });
        const j = await r.json();
        if (r.ok) setListas(j); else console.error("[ItemOrcamento] fiscal-listas:", j?.error);
      } catch (e) { console.error("[ItemOrcamento] fiscal-listas:", e); }
    })();
  }, [open]);
  useEffect(() => { setFamiliaSel(dados?.codigoFamilia != null ? String(dados.codigoFamilia) : ""); }, [dados]);

  if (!open || typeof document === "undefined" || !codigo) return null;

  const setCampo = (bloco: keyof FiscalBlocos, campo: string, raw: string, numerico: boolean) => {
    setFiscalDirty(true);
    setFiscal((prev) => {
      if (!prev) return prev;
      const val = numerico ? (parseFloat(raw.replace(",", ".")) || 0) : raw;
      return { ...prev, [bloco]: { ...(prev[bloco] as unknown as Record<string, unknown>), [campo]: val } } as FiscalBlocos;
    });
  };
  const setCfop = (raw: string) => { setFiscalDirty(true); setFiscal((p) => (p ? { ...p, cfop: raw } : p)); };

  // Fecha avisando se há fiscal alterado e não salvo (senão não vai pro Omie).
  const fecharComAviso = () => {
    if (fiscalDirty && !window.confirm("Você alterou o fiscal deste produto mas ainda NÃO salvou.\n\nSe sair sem salvar, esses impostos NÃO serão enviados ao Omie (o Omie vai recalcular pelo Cenário Fiscal).\n\nSair mesmo assim?")) return;
    onClose();
  };

  const salvar = async () => {
    if (!fiscal || !codigoProduto) return;
    setSalvando(true);
    try {
      const r = await fetch(`/api/ppv/produto-fiscal`, {
        method: "PATCH", headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ conta, codigoProduto, codigo, fiscal, userName, ppvId: pedidoOmie ? ppvId : undefined }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Falha ao salvar o fiscal.");
      setFiscalExiste(true);
      setFiscalDirty(false);
      showToast("success", "Fiscal do produto salvo." + (j.avisoOmie ? "" : (pedidoOmie ? " Aplicado no pedido do Omie." : "")));
      if (j.avisoOmie) showToast("error", `Salvo no banco, mas não apliquei no Omie: ${j.avisoOmie}`);
      setConfirmar(false);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Erro ao salvar.");
    }
    setSalvando(false);
  };

  const aplicarFamilia = async () => {
    if (!codigoProduto || !familiaSel) return;
    setAplicandoFam(true);
    try {
      const r = await fetch(`/api/ajustes/familias/produto`, {
        method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ conta, codigo_produto: codigoProduto, codigo_familia: Number(familiaSel) }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.erro || j?.error || "Falha ao alterar a família.");
      showToast("success", `Família alterada para "${j.familia_nome}" (Omie + banco).`);
      setDados((d) => (d ? { ...d, familia: j.familia_nome, codigoFamilia: j.codigo_familia } : d));
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Erro ao alterar família.");
    }
    setAplicandoFam(false);
  };

  const desc = descricao || dados?.descricao || "";
  const qtd = quantidade ?? 0;
  const precoUnit = preco ?? dados?.valorVenda ?? 0;
  const mercadoria = qtd * precoUnit;
  const ipiV = fiscal ? (fiscal.ipi.base || mercadoria) * (fiscal.ipi.aliquota / 100) : 0;
  const stV = fiscal ? (fiscal.icmsSt.base || mercadoria) * (fiscal.icmsSt.aliquota / 100) : 0;
  const totalItem = mercadoria + ipiV + stV;
  const abaFiscal = aba !== "dados" && aba !== "familia";

  // Navegação entre os itens do pedido (sem fechar a tela).
  const lista = itens || [];
  const idxAtual = lista.findIndex((x) => x.codigo === codigo);
  const podeNavegar = !!onIrPara && lista.length > 1 && idxAtual >= 0;
  const irPara = (delta: number) => {
    if (!onIrPara || idxAtual < 0) return;
    const alvo = lista[idxAtual + delta];
    if (!alvo) return;
    if (fiscalDirty && !window.confirm("Você alterou o fiscal deste produto mas ainda NÃO salvou.\n\nSe trocar de item agora, a alteração é perdida (e não vai pro Omie).\n\nTrocar mesmo assim?")) return;
    onIrPara(alvo);
  };
  const navBtn = (dis: boolean): React.CSSProperties => ({ height: 30, padding: "0 12px", borderRadius: 3, border: "1px solid #e2e2e2", background: dis ? "#f5f5f5" : "#fff", color: dis ? "#cbd5e1" : "#334155", fontSize: 13, fontWeight: 600, cursor: dis ? "not-allowed" : "pointer", lineHeight: 1, flexShrink: 0, whiteSpace: "nowrap" });

  const Sprite = (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <symbol id="io-i-link" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></symbol>
      <symbol id="io-i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></symbol>
      <symbol id="io-i-cart" viewBox="0 0 24 24"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></symbol>
      <symbol id="io-i-in" viewBox="0 0 24 24"><path d="M12 3v12" /><polyline points="7 10 12 15 17 10" /><path d="M4 21h16" /></symbol>
      <symbol id="io-i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></symbol>
    </svg>
  );

  return createPortal(
    <div className="io-ov" onClick={fecharComAviso}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {Sprite}
      <div className="io-card" onClick={(e) => e.stopPropagation()}>
        <div className="io-title">
          Item de Orçamento
          {ppvId && <span className="io-tag">PPV {ppvId} · {conta}</span>}
          {abaFiscal && !fiscalExiste && !fiscalDirty && <span className="io-tag ro">Fiscal padrão — ajuste e salve</span>}
          {fiscalDirty && <span className="io-tag ro" style={{ background: "#fef2f2", borderColor: "#fecaca", color: "#b91c1c", fontWeight: 700 }}>Não salvo — não vai pro Omie</span>}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            {podeNavegar && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button onClick={() => irPara(-1)} disabled={idxAtual <= 0} title="Item anterior" style={navBtn(idxAtual <= 0)}>‹ Anterior</button>
                <span style={{ fontSize: 12.5, color: "#64748b", minWidth: 46, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{idxAtual + 1} / {lista.length}</span>
                <button onClick={() => irPara(1)} disabled={idxAtual >= lista.length - 1} title="Próximo item" style={navBtn(idxAtual >= lista.length - 1)}>Próximo item ›</button>
              </div>
            )}
            <button className="io-x" onClick={fecharComAviso} style={{ marginLeft: 4 }}>×</button>
          </div>
        </div>

        <div className="io-body">
          {/* Cabeçalho */}
          <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 360px", gap: 14, marginBottom: 12 }}>
            <div style={{ width: 80, height: 70, borderRadius: 6, background: "#e8730c", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, textAlign: "center", padding: 6 }}>{codigo}</div>
            <div>
              <label className="io-l">Produto <svg className="io-ic"><use href="#io-i-link" /></svg></label>
              <div className="io-ctl search"><input value={desc} readOnly style={{ background: "#dbeafe" }} /><span className="app"><svg className="io-ic"><use href="#io-i-search" /></svg></span></div>
            </div>
            <div>
              <label className="io-l">CFOP</label>
              <div className="io-ctl">
                <select value={fiscal?.cfop || ""} onChange={(e) => setCfop(e.target.value)} disabled={!fiscal}>
                  <option value="">—</option>
                  {fiscal?.cfop && !(listas?.cfop || []).some((o) => o.codigo === fiscal.cfop) && <option value={fiscal.cfop}>{fiscal.cfop}</option>}
                  {(listas?.cfop || []).map((o) => <option key={o.codigo} value={o.codigo}>{o.codigo} - {o.descricao}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.4fr", gap: 14, marginBottom: 6 }}>
            <div><label className="io-l">Quantidade</label><div className="io-ctl ro"><input className="num" value={qtd.toLocaleString("pt-BR", { minimumFractionDigits: 4 })} readOnly /></div></div>
            <div><label className="io-l">Local de Estoque</label><div className="io-ctl"><input value="Estoque Balcão" readOnly /></div></div>
            <div />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr 1fr", gap: 14, marginBottom: 4 }}>
            <div><label className="io-l">Preço Unitário de Venda</label><div className="io-ctl ro"><input className="num" value={precoUnit.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} readOnly /></div></div>
            <div><label className="io-l">Tabela de Preço</label><div className="io-ctl ro"><input value="Preço de Venda do Cadastro do Produto" readOnly /></div></div>
            <div><label className="io-l">% do Desconto</label><div className="io-ctl ro"><input className="num" value="0,00" readOnly /></div></div>
          </div>
          <div className="io-badges">
            <span className="io-badge g">CMC (custo unit.): <b>{brl(dados?.cmc)}</b></span>
            <span className="io-badge b"><svg className="io-ic" style={{ color: "#2f6fb0" }}><use href="#io-i-cart" /></svg> Preço da última venda: <b>{brl(dados?.ultimaVendaValor)}</b></span>
          </div>

          {/* Abas */}
          <div className="io-tabs">
            {ABAS.map((a) => (
              <button key={a.id} className={`io-tab ${aba === a.id ? "on" : ""}`} onClick={() => setAba(a.id)}>{a.label}</button>
            ))}
          </div>

          {/* Painéis */}
          <div className="io-pane">
            {aba === "dados" && <PainelDados dados={dados} loading={dadosLoading} codigo={codigo} />}
            {abaFiscal && !fiscal && <div style={{ padding: 20, color: "#8a8378", fontSize: 13.5 }}>Carregando fiscal…</div>}
            {aba === "icms" && fiscal && <PainelICMS f={fiscal} set={setCampo} setCfop={setCfop} listas={listas} />}
            {aba === "icmsst" && fiscal && <PainelICMSST f={fiscal} set={setCampo} listas={listas} />}
            {aba === "ipi" && fiscal && <PainelIPI f={fiscal} set={setCampo} listas={listas} />}
            {aba === "pis" && fiscal && <PainelPisCofins bloco="pis" titulo="PIS" f={fiscal} set={setCampo} listas={listas} />}
            {aba === "cofins" && fiscal && <PainelPisCofins bloco="cofins" titulo="COFINS" f={fiscal} set={setCampo} listas={listas} />}
            {aba === "familia" && <PainelFamilia dados={dados} familias={familias} familiaSel={familiaSel} setFamiliaSel={setFamiliaSel} aplicar={aplicarFamilia} aplicando={aplicandoFam} />}
          </div>

          {/* Observações (faixa amarela) */}
          <div style={{ margin: "10px 0 4px", background: "#fff7d6", border: "1px solid #ecd98a", borderLeft: "5px solid #c98a00", borderRadius: 5, padding: 12 }}>
            <div style={{ color: "#7a5a00", fontWeight: 800, fontSize: 13.5, marginBottom: 6 }}>Observações</div>
            <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} placeholder="Observação deste produto…" style={{ width: "100%", border: "1px solid #e0c968", borderRadius: 4, background: "#fffdf0", color: "#5a4600", fontSize: 13.5, padding: 9, resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>
        </div>

        {/* Rodapé de totais */}
        <div className="io-foot">
          <div className="cell"><div className="fl">Valor da Mercadoria</div><div className="fv">{brl(mercadoria)}</div></div>
          <div className="cell"><div className="fl">Valor do Desconto</div><div className="fv mut">{brl(0)}</div></div>
          <div className="cell"><div className="fl">IPI</div><div className={`fv ${ipiV ? "" : "mut"}`}>{brl(ipiV)}</div></div>
          <div className="cell"><div className="fl">ICMS ST + FCP ST</div><div className={`fv ${stV ? "" : "mut"}`}>{brl(stV)}</div></div>
          <div className="cell"><div className="fl">Total do Item</div><div className="fv">{brl(totalItem)}</div></div>
          <div className="cell total"><div className="fl">Total do Item</div><div className="fv">{brl(totalItem)}</div></div>
        </div>

        {/* Ações */}
        <div className="io-actions">
          {aba === "dados" ? (
            <span style={{ fontSize: 12.5, color: "#8a8378" }}>Dados do produto (somente leitura).</span>
          ) : aba === "familia" ? (
            <span style={{ fontSize: 12.5, color: "#8a8378" }}>A família é salva pelo botão “Aplicar família” acima.</span>
          ) : !fiscal ? (
            <span style={{ fontSize: 12.5, color: "#8a8378" }}>Carregando fiscal…</span>
          ) : !confirmar ? (
            <button className="io-btn pri" onClick={() => setConfirmar(true)}>Salvar fiscal do produto</button>
          ) : (
            <>
              <span style={{ fontSize: 13, color: "#7f1d1d", fontWeight: 700 }}>{pedidoOmie ? "Salva no banco e aplica no pedido do Omie. Confirmar?" : "Salvar o fiscal deste produto?"}</span>
              <button className="io-btn red" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Sim, salvar"}</button>
              <button className="io-btn gray" onClick={() => setConfirmar(false)} disabled={salvando}>Cancelar</button>
            </>
          )}
          <div style={{ flex: 1 }} />
          <button className="io-btn gray" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---- Campos fiscais ----
function CampoFiscal({ label, value, onChange }: { label: string; value: string | number; onChange?: (v: string) => void }) {
  const so = !onChange;
  return (
    <div>
      <label className="io-l">{label}</label>
      <div className={`io-ctl ${so ? "ro" : ""}`}><input value={String(value)} onChange={(e) => onChange?.(e.target.value)} disabled={so} /></div>
    </div>
  );
}

// Dropdown de código fiscal (mostra "código - descrição", guarda só o código).
function CampoSelect({ label, value, opcoes, onChange }: { label: string; value: string; opcoes?: OpcaoFiscal[]; onChange: (v: string) => void }) {
  const ops = opcoes || [];
  const temAtual = !value || ops.some((o) => o.codigo === value);
  return (
    <div>
      <label className="io-l">{label}</label>
      <div className="io-ctl">
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {!temAtual && <option value={value}>{value}</option>}
          {ops.map((o) => <option key={o.codigo} value={o.codigo}>{o.codigo} - {o.descricao}</option>)}
        </select>
      </div>
    </div>
  );
}

function PainelICMS({ f, set, setCfop, listas }: { f: FiscalBlocos; set: (b: keyof FiscalBlocos, c: string, v: string, n: boolean) => void; setCfop: (v: string) => void; listas: ListasFiscais | null }) {
  const c = f.icms;
  return (
    <div className="io-grid3">
      <CampoSelect label="CFOP" value={f.cfop} opcoes={listas?.cfop} onChange={setCfop} />
      <CampoSelect label="Situação Tributária do ICMS (CST)" value={c.cst} opcoes={listas?.cst_icms} onChange={(v) => set("icms", "cst", v, false)} />
      <CampoSelect label="Origem da Mercadoria" value={c.origem} opcoes={listas?.origem_icms} onChange={(v) => set("icms", "origem", v, false)} />
      <CampoSelect label="Modalidade Base de Cálculo" value={c.modalidade} opcoes={listas?.mod_bc_icms} onChange={(v) => set("icms", "modalidade", v, false)} />
      <CampoFiscal label="Alíquota do ICMS (%)" value={c.aliquota} onChange={(v) => set("icms", "aliquota", v, true)} />
      <CampoFiscal label="Base de Cálculo" value={c.base} onChange={(v) => set("icms", "base", v, true)} />
      <CampoFiscal label="% Redução Base" value={c.percRedBase} onChange={(v) => set("icms", "percRedBase", v, true)} />
    </div>
  );
}

function PainelICMSST({ f, set, listas }: { f: FiscalBlocos; set: (b: keyof FiscalBlocos, c: string, v: string, n: boolean) => void; listas: ListasFiscais | null }) {
  const c = f.icmsSt;
  return (
    <div className="io-grid3">
      <CampoSelect label="CST ICMS ST" value={c.cst} opcoes={listas?.cst_icms} onChange={(v) => set("icmsSt", "cst", v, false)} />
      <CampoSelect label="Modalidade Base ICMS ST" value={c.modalidade} opcoes={listas?.mod_bc_icms} onChange={(v) => set("icmsSt", "modalidade", v, false)} />
      <CampoFiscal label="CEST" value={c.cest} onChange={(v) => set("icmsSt", "cest", v, false)} />
      <CampoFiscal label="Alíquota ICMS ST (%)" value={c.aliquota} onChange={(v) => set("icmsSt", "aliquota", v, true)} />
      <CampoFiscal label="Alíquota Op. Própria (%)" value={c.aliqOpProp} onChange={(v) => set("icmsSt", "aliqOpProp", v, true)} />
      <CampoFiscal label="Base ICMS ST" value={c.base} onChange={(v) => set("icmsSt", "base", v, true)} />
      <CampoFiscal label="Margem Valor Agregado (%)" value={c.margem} onChange={(v) => set("icmsSt", "margem", v, true)} />
      <CampoFiscal label="% Redução Base Op." value={c.percRedBaseOp} onChange={(v) => set("icmsSt", "percRedBaseOp", v, true)} />
      <CampoFiscal label="% Redução Base ST" value={c.percRedBaseSt} onChange={(v) => set("icmsSt", "percRedBaseSt", v, true)} />
    </div>
  );
}

function PainelIPI({ f, set, listas }: { f: FiscalBlocos; set: (b: keyof FiscalBlocos, c: string, v: string, n: boolean) => void; listas: ListasFiscais | null }) {
  const c = f.ipi;
  return (
    <div className="io-grid3">
      <CampoSelect label="Situação Tributária do IPI (CST)" value={c.cst} opcoes={listas?.cst_ipi} onChange={(v) => set("ipi", "cst", v, false)} />
      <CampoSelect label="Enquadramento Legal do IPI" value={c.enquadramento} opcoes={listas?.enq_ipi} onChange={(v) => set("ipi", "enquadramento", v, false)} />
      <CampoFiscal label="Alíquota do IPI (%)" value={c.aliquota} onChange={(v) => set("ipi", "aliquota", v, true)} />
      <CampoFiscal label="Base de Cálculo" value={c.base} onChange={(v) => set("ipi", "base", v, true)} />
    </div>
  );
}

function PainelPisCofins({ bloco, titulo, f, set, listas }: { bloco: "pis" | "cofins"; titulo: string; f: FiscalBlocos; set: (b: keyof FiscalBlocos, c: string, v: string, n: boolean) => void; listas: ListasFiscais | null }) {
  const c = f[bloco];
  const opsCst = bloco === "pis" ? listas?.cst_pis : listas?.cst_cofins;
  return (
    <div className="io-grid3">
      <CampoSelect label={`Situação Tributária do ${titulo} (CST)`} value={c.cst} opcoes={opsCst} onChange={(v) => set(bloco, "cst", v, false)} />
      <CampoFiscal label={`Alíquota do ${titulo} (%)`} value={c.aliquota} onChange={(v) => set(bloco, "aliquota", v, true)} />
      <CampoFiscal label="Base de Cálculo" value={c.base} onChange={(v) => set(bloco, "base", v, true)} />
    </div>
  );
}

function PainelFamilia({ dados, familias, familiaSel, setFamiliaSel, aplicar, aplicando }: {
  dados: ProdutoDados | null; familias: Array<{ codigo_familia: number; nome: string }>;
  familiaSel: string; setFamiliaSel: (v: string) => void; aplicar: () => void; aplicando: boolean;
}) {
  return (
    <div style={{ maxWidth: 460 }}>
      <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: .5, color: "#e8730c", marginBottom: 10 }}>
        Família <span style={{ fontWeight: 700, textTransform: "none", letterSpacing: 0, color: "#c0392b", fontSize: 11 }}>altera no Omie</span>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label className="io-l">Família atual</label>
        <div className="io-ctl ro"><input value={dados?.familia || "—"} readOnly /></div>
      </div>
      <label className="io-l">Aplicar nova família</label>
      <div style={{ display: "flex", gap: 8 }}>
        <div className="io-ctl" style={{ flex: 1 }}>
          <select value={familiaSel} onChange={(e) => setFamiliaSel(e.target.value)}>
            <option value="">— selecione —</option>
            {familias.map((ff) => <option key={ff.codigo_familia} value={ff.codigo_familia}>{ff.nome}</option>)}
          </select>
        </div>
        <button onClick={aplicar} disabled={aplicando || !familiaSel} style={{ padding: "0 16px", height: 31, border: "none", borderRadius: 3, background: familiaSel ? "#0f9d58" : "#a7d3ba", color: "#fff", fontSize: 13, fontWeight: 700, cursor: familiaSel ? "pointer" : "not-allowed" }}>{aplicando ? "Aplicando…" : "Aplicar família"}</button>
      </div>
    </div>
  );
}

function PainelDados({ dados, loading, codigo }: { dados: ProdutoDados | null; loading: boolean; codigo: string }) {
  if (loading) return <div style={{ padding: 20, color: "#8a8378" }}>Carregando dados do produto…</div>;
  const fld = (label: string, valor: React.ReactNode, cls?: string) => (
    <div>
      <label className="io-l">{label}</label>
      <div className="io-rov" style={cls === "g" ? { color: "#0f9d58" } : cls === "r" ? { color: "#c0392b" } : cls === "b" ? { color: "#2f6fb0" } : undefined}>{valor}</div>
    </div>
  );
  // Campo em destaque (sem cor): caixa com borda, rótulo em maiúsculas e valor maior/negrito.
  const destaque = (label: string, valor: React.ReactNode) => (
    <div style={{ border: "1px solid #d6d0c4", borderRadius: 4, background: "#faf9f7", padding: "8px 12px" }}>
      <div style={{ fontSize: 11, color: "#8a8378", fontWeight: 600, textTransform: "uppercase", letterSpacing: .4, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#1f1f1f" }}>{valor}</div>
    </div>
  );
  return (
    <div>
      {/* Destaque: Estoque · Valor de Custo · Valor de Venda · Código */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 12 }}>
        {destaque("Estoque", dados?.estoque ?? "—")}
        {destaque("Valor de Custo (CMC)", brl(dados?.cmc))}
        {destaque("Valor de Venda", brl(dados?.valorVenda))}
        {destaque("Código", dados?.codigo || codigo)}
      </div>
      {/* Demais informações */}
      <div className="io-grid4">
        {fld("Código Omie", dados?.codigoProduto || "—")}
        {fld("NCM", dados?.ncm || "—")}
        {fld("Vendas (qtde)", dados?.vendasQtde ?? "—")}
        {fld("Vendas (R$)", brl(dados?.vendasValor), "g")}
      </div>

      {dados?.descricaoDetalhada && (
        <div style={{ marginBottom: 12 }}>
          <label className="io-l">Descrição detalhada</label>
          <div style={{ fontSize: 13, color: "#3a3a3a", lineHeight: 1.5, background: "#f8f8f6", border: "1px solid #e6e4de", borderRadius: 4, padding: 10 }}>{dados.descricaoDetalhada}</div>
        </div>
      )}

      {dados?.caracteristicas && (
        <div style={{ marginBottom: 12 }}>
          <label className="io-l">Onde encontrar / Características</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {dados.caracteristicas.split("•").map((c, i) => c.trim() && (
              <span key={i} style={{ background: "#fff", border: "1px solid #d6d0c4", borderRadius: 3, padding: "5px 10px", fontSize: 12.5 }}>{c.trim()}</span>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <label className="io-l"><svg className="io-ic"><use href="#io-i-in" /></svg> Última entrada do produto (compra)</label>
        {dados?.ultimaEntrada ? (
          <div className="io-listcard" style={{ borderLeft: "3px solid #0f9d58" }}>
            <span style={{ width: 32, height: 32, borderRadius: "50%", background: "#eaf7ef", color: "#0f9d58", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><svg className="io-ic" style={{ width: 15, height: 15, color: "#0f9d58" }}><use href="#io-i-in" /></svg></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dados.ultimaEntrada.fornecedor || "Fornecedor não identificado"}</div>
              <div style={{ fontSize: 11.5, color: "#8a8378" }}>Entrada · NF {dados.ultimaEntrada.nf || "—"} · {dados.ultimaEntrada.data}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: "#0f9d58" }}>{brl(dados.ultimaEntrada.vu)}</div>
              <div style={{ fontSize: 11.5, color: "#8a8378" }}>{dados.ultimaEntrada.qtd} un · custo NF</div>
            </div>
          </div>
        ) : <div style={{ fontSize: 12.5, color: "#8a8378" }}>Sem entradas registradas.</div>}
      </div>

      <div>
        <label className="io-l"><svg className="io-ic"><use href="#io-i-clock" /></svg> Histórico — últimas vendas (pra quem foi)</label>
        {dados && dados.historicoVendas.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {dados.historicoVendas.map((v, i) => (
              <div key={i} className="io-listcard" style={{ borderLeft: "3px solid #2f6fb0", marginTop: 0 }}>
                <span style={{ width: 32, height: 32, borderRadius: "50%", background: "#eef3fb", color: "#2f6fb0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><svg className="io-ic" style={{ width: 15, height: 15, color: "#2f6fb0" }}><use href="#io-i-cart" /></svg></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.cliente || "Cliente não identificado"}</div>
                  <div style={{ fontSize: 11.5, color: "#8a8378" }}>Pedido {v.numero} · {v.data}{v.vendedor ? ` · Vendedor: ${v.vendedor}` : ""}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>{brl(v.vt)}</div>
                  <div style={{ fontSize: 11.5, color: "#8a8378" }}>{v.qtd} un</div>
                </div>
              </div>
            ))}
          </div>
        ) : <div style={{ fontSize: 12.5, color: "#8a8378" }}>Sem vendas registradas.</div>}
      </div>
    </div>
  );
}
