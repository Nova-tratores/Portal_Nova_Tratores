"use client";

import { useState, useRef, useEffect } from "react";
import type { ProdutoSelecionado } from "@/lib/ppv/types";
import { formatarMoeda } from "@/lib/ppv/utils";
import { TIPOS_PEDIDO, MOTIVOS_SAIDA } from "@/lib/ppv/constants";
import { api } from "@/lib/ppv/api";
import { usePPV } from "@/lib/ppv/PPVContext";
import { useAuth } from "@/hooks/useAuth";
import ModalImportarKit from "@/components/orcamentos/ModalImportarKit";
import ModalProdutoEstoque from "./ModalProdutoEstoque";
import SelecionarUsuarioModal from "./SelecionarUsuarioModal";

interface Props {
  onVoltar: () => void;
  onBuscaCliente: () => void;
  onBuscaOS: () => void;
  onBuscaProduto: () => void;
  onSaved: () => void;
  clienteValue: string;
  osIdValue: string;
  osDisplayValue: string;
  produtoDisplay: string;
  onProdutoDisplayChange: (v: string) => void;
  // Dados da OS vinculada, pra auto-preencher (nonce muda a cada vínculo novo).
  osAutofill?: { nonce: number; tecnico: string; projeto: string; solicitacao: string } | null;
}

export default function FormNovoLancamento({
  onVoltar, onBuscaCliente, onBuscaOS, onBuscaProduto, onSaved,
  clienteValue, osIdValue, osDisplayValue, produtoDisplay, onProdutoDisplayChange, osAutofill,
}: Props) {
  const { tecnicos, productCache, showToast } = usePPV();
  const { userProfile } = useAuth();

  const [selectedProducts, setSelectedProducts] = useState<Record<string, ProdutoSelecionado>>({});
  const [kitModalOpen, setKitModalOpen] = useState(false);
  const [qtdProduto, setQtdProduto] = useState(1);
  const [detalheProd, setDetalheProd] = useState<{ codigo: string; descricao?: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [importandoKit, setImportandoKit] = useState(false);
  const [tipoPedido, setTipoPedido] = useState(TIPOS_PEDIDO[0].value);
  const [motivoSaida, setMotivoSaida] = useState(MOTIVOS_SAIDA[0].value);
  const [tecnico, setTecnico] = useState("");
  const [showVendedor, setShowVendedor] = useState(false); // seletor de vendedor (usuários do portal)
  const [projeto, setProjeto] = useState("");              // vem da OS vinculada; editado no pedido aberto
  const [usarProjetoOS, setUsarProjetoOS] = useState(true);
  const [observacao, setObservacao] = useState("");
  const [recentlyAdded, setRecentlyAdded] = useState<string | null>(null);
  const [removingItem, setRemovingItem] = useState<string | null>(null);
  const [clienteDoc, setClienteDoc] = useState("");
  const [clienteCidade, setClienteCidade] = useState("");
  const [tentouEnviar, setTentouEnviar] = useState(false);

  const cartRef = useRef<HTMLDivElement>(null);

  // Vinculou uma OS → puxa o que dá dela: técnico (se estiver na lista), projeto,
  // motivo "Saída Técnico (Com OS)" e a observação = "Solicitação do cliente".
  useEffect(() => {
    if (!osAutofill) return;
    setMotivoSaida("Saida Tecnico (Com OS)");
    if (osAutofill.solicitacao) setObservacao(osAutofill.solicitacao);
    if (osAutofill.projeto) { setProjeto(osAutofill.projeto); setUsarProjetoOS(false); }
    if (osAutofill.tecnico) {
      const t = tecnicos.find((x) => x.trim().toUpperCase() === osAutofill.tecnico.trim().toUpperCase());
      if (t) setTecnico(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [osAutofill?.nonce]);

  useEffect(() => {
    if (!clienteValue) { setClienteDoc(""); setClienteCidade(""); return; }
    api.buscarClientePorNome(clienteValue).then((res) => {
      setClienteDoc(res.documento || "");
      setClienteCidade(res.cidade || "");
    }).catch(() => { setClienteDoc(""); setClienteCidade(""); });
  }, [clienteValue]);

  function addProduct() {
    if (!produtoDisplay) { showToast("error", "Selecione um produto primeiro"); return; }
    const codigo = produtoDisplay.split(" - ")[0].trim();
    const q = qtdProduto;
    if (!codigo || isNaN(q)) { showToast("error", "Item inválido"); return; }
    const cached = productCache[codigo];
    if (!cached) { showToast("error", "Produto não encontrado no cache"); return; }
    setSelectedProducts((prev) => {
      const copy = { ...prev };
      if (copy[codigo]) {
        copy[codigo] = { ...copy[codigo], quantidade: copy[codigo].quantidade + q, subtotal: (copy[codigo].quantidade + q) * copy[codigo].preco };
      } else {
        copy[codigo] = { codigo, descricao: cached.descricao, preco: cached.preco, quantidade: q, subtotal: q * cached.preco, empresa: cached.empresa };
      }
      return copy;
    });
    setRecentlyAdded(codigo);
    setTimeout(() => setRecentlyAdded(null), 600);
    onProdutoDisplayChange("");
    setQtdProduto(1);
    setTimeout(() => { cartRef.current?.scrollTo({ top: cartRef.current.scrollHeight, behavior: "smooth" }); }, 100);
  }

  function updateQtd(codigo: string, newQtd: number) {
    if (newQtd < 1) return;
    setSelectedProducts((prev) => {
      const copy = { ...prev };
      if (copy[codigo]) copy[codigo] = { ...copy[codigo], quantidade: newQtd, subtotal: newQtd * copy[codigo].preco };
      return copy;
    });
  }

  function removeProduct(codigo: string) {
    setRemovingItem(codigo);
    setTimeout(() => {
      setSelectedProducts((prev) => { const copy = { ...prev }; delete copy[codigo]; return copy; });
      setRemovingItem(null);
    }, 250);
  }

  function importarKitItens(produtos: { codigo: string; descricao: string; quantidade: number; preco: number }[]) {
    if (produtos.length === 0) return;
    setImportandoKit(true);
    try {
      setSelectedProducts((prev) => {
        const copy = { ...prev };
        produtos.forEach((x) => {
          if (copy[x.codigo]) {
            copy[x.codigo] = { ...copy[x.codigo], quantidade: copy[x.codigo].quantidade + x.quantidade, subtotal: (copy[x.codigo].quantidade + x.quantidade) * copy[x.codigo].preco };
          } else {
            copy[x.codigo] = { codigo: x.codigo, descricao: x.descricao, preco: x.preco, quantidade: x.quantidade, subtotal: x.quantidade * x.preco };
          }
        });
        return copy;
      });
      showToast("success", `Kit importado com ${produtos.length} ${produtos.length === 1 ? "item" : "itens"}!`);
    } catch { showToast("error", "Erro ao importar kit"); }
    setImportandoKit(false);
  }

  const prodsList = Object.values(selectedProducts);
  const total = prodsList.reduce((s, p) => s + p.subtotal, 0);
  const prodCount = prodsList.length;

  const erroTecnico = tentouEnviar && !tecnico.trim();
  const erroCliente = tentouEnviar && !clienteValue.trim();
  const erroProdutos = tentouEnviar && prodCount === 0;

  async function handleSubmit() {
    setTentouEnviar(true);
    const erros: string[] = [];
    if (!tecnico.trim()) erros.push("Técnico");
    if (!clienteValue.trim()) erros.push("Cliente");
    if (prodCount === 0) erros.push("Produtos");
    if (erros.length > 0) { showToast("error", `Preencha os campos: ${erros.join(", ")}`); return; }

    setSubmitting(true);
    try {
      const data = await api.criarPedido({
        tipoPedido, motivoSaida, tecnico, cliente: clienteValue,
        observacao, osId: osIdValue, projeto, usarProjetoOS, valorTotal: total, produtosSelecionados: prodsList,
        userName: userProfile?.nome || "",
      });
      showToast("success", "Lançamento salvo!");
      if (data.id) {
        try {
          const pdfData = await api.gerarPDF(data.id);
          if (pdfData.html) {
            const w = window.open("", "_blank", "width=900,height=800");
            if (w) { w.document.write(pdfData.html); w.document.close(); setTimeout(() => { w.focus(); w.print(); }, 500); }
          }
        } catch { /* PDF opcional */ }
      }
      setSelectedProducts({}); setTipoPedido(TIPOS_PEDIDO[0].value); setMotivoSaida(MOTIVOS_SAIDA[0].value);
      setTecnico(""); setProjeto(""); setObservacao(""); setTentouEnviar(false); onSaved();
    } catch (e) { showToast("error", e instanceof Error ? e.message : "Erro ao salvar"); }
    setSubmitting(false);
  }

  // Estilo de campo com erro
  const errStyle = { border: "2px solid #EF4444", background: "#FFF5F5" };
  // Destaque SEM cor (borda forte + fundo neutro) — usado no Cliente, O.S. e Vendedor
  const destaqueNeutro = { border: "2px solid #334155", background: "#F8FAFC" };

  return (
    <div className="ppv-form-page">
      {/* ── Título ── */}
      <div className="ppv-form-header">
        <button type="button" onClick={onVoltar} className="ppv-form-back">
          <i className="fas fa-arrow-left" />
        </button>
        <span className="ppv-form-title">Novo Lançamento</span>
      </div>

      <div className="ppv-form-layout">
        {/* ════════ ESQUERDA: Formulário ════════ */}
        <div className="ppv-form-left">

          {/* ── Adicionar Produto + Importar Kit (no topo, lado a lado) ── */}
          <div className="ppv-form-section-title">
            <i className="fas fa-cube" /> Adicionar Produto
            {erroProdutos && <span className="ppv-form-error-msg" style={{ marginLeft: 12 }}>Adicione ao menos 1 produto</span>}
          </div>
          <div className="ppv-form-row" style={{ alignItems: "flex-end" }}>
            <div className="ppv-form-field" style={{ flex: 1, marginBottom: 0 }}>
              <div
                onClick={onBuscaProduto}
                className="ppv-form-picker"
                style={produtoDisplay ? { border: "2px solid var(--ppv-primary)", background: "#FEF2F2" } : erroProdutos ? errStyle : undefined}
              >
                {produtoDisplay ? (
                  <div className="ppv-form-picker-filled">
                    <i className="fas fa-cube" />
                    <div><div className="ppv-form-picker-name">{produtoDisplay}</div></div>
                  </div>
                ) : (
                  <div className="ppv-form-picker-empty">
                    <i className="fas fa-search" />
                    <span>Clique para buscar produto</span>
                  </div>
                )}
              </div>
            </div>
            <div className="ppv-form-field" style={{ width: 96, marginBottom: 0 }}>
              <span className="ppv-form-label">Qtd</span>
              <input
                type="number" value={qtdProduto}
                onChange={(e) => setQtdProduto(parseInt(e.target.value) || 1)}
                min={1} style={{ textAlign: "center", fontWeight: 700 }}
              />
            </div>
            <button type="button" onClick={addProduct} className="ppv-form-btn-primary" style={{ flex: "0 0 auto", padding: "12px 20px" }}>
              <i className="fas fa-plus" /> Adicionar
            </button>
            {/* Importar Kit — junto do adicionar produto */}
            <button type="button" onClick={() => setKitModalOpen(true)} disabled={importandoKit}
              title="Importar Kit de Revisão (revisão, manutenção ou quadriciclo)"
              style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 9, padding: "12px 16px", borderRadius: 4, border: "1.5px solid #99F6E4", background: "linear-gradient(135deg,#F0FDFA,#ECFEFF)", cursor: importandoKit ? "not-allowed" : "pointer", opacity: importandoKit ? 0.6 : 1, whiteSpace: "nowrap", color: "#0f766e", fontWeight: 700, fontSize: 14 }}>
              <span style={{ width: 30, height: 30, borderRadius: 4, background: "linear-gradient(135deg,#0d9488,#0f766e)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", flexShrink: 0 }}>
                {importandoKit ? <i className="fas fa-spinner fa-spin" style={{ fontSize: 13 }} /> : <i className="fas fa-tools" style={{ fontSize: 13 }} />}
              </span>
              {importandoKit ? "Importando..." : "Importar Kit"}
            </button>
          </div>

          <div className="ppv-form-divider" />

          {/* ── Cliente (topo, em destaque — o pedido começa por ele) ── */}
          <div className="ppv-form-field">
            <span className="ppv-form-label">
              Cliente <span className="ppv-form-required">*</span>
              {erroCliente && <span className="ppv-form-error-msg">Selecione um cliente</span>}
            </span>
            <div
              onClick={onBuscaCliente}
              className="ppv-form-picker"
              style={erroCliente ? errStyle : clienteValue ? destaqueNeutro : undefined}
            >
              {clienteValue ? (
                <div className="ppv-form-picker-filled">
                  <i className="fas fa-user" />
                  <div>
                    <div className="ppv-form-picker-name">{clienteValue}</div>
                    {(clienteDoc || clienteCidade) && (
                      <div className="ppv-form-picker-sub">
                        {clienteDoc}{clienteDoc && clienteCidade ? " — " : ""}{clienteCidade}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="ppv-form-picker-empty">
                  <i className="fas fa-search" />
                  <span>Clique aqui para buscar o cliente</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Ordem de Serviço (destacada, sem cor — ao vincular, puxa cliente/técnico/projeto/motivo/observação) ── */}
          <div className="ppv-form-field">
            <span className="ppv-form-label" style={{ fontWeight: 800 }}>Ordem de Serviço <span className="ppv-form-optional">(opcional — ao vincular, preenche cliente, técnico, projeto, motivo e observação)</span></span>
            <div
              onClick={onBuscaOS}
              className="ppv-form-picker"
              style={osDisplayValue ? destaqueNeutro : { border: "2px solid #94A3B8" }}
            >
              {osDisplayValue ? (
                <div className="ppv-form-picker-filled">
                  <i className="fas fa-clipboard-list" />
                  <div><div className="ppv-form-picker-name">{osDisplayValue}</div></div>
                </div>
              ) : (
                <div className="ppv-form-picker-empty">
                  <i className="fas fa-link" />
                  <span>Clique aqui para vincular uma O.S.</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Vendedor (mesmo seletor de usuários do portal usado no pedido aberto) ── */}
          <div className="ppv-form-field">
            <span className="ppv-form-label">
              Vendedor <span className="ppv-form-required">*</span>
              {erroTecnico && <span className="ppv-form-error-msg">Selecione um vendedor</span>}
            </span>
            <div
              onClick={() => setShowVendedor(true)}
              className="ppv-form-picker"
              style={erroTecnico ? errStyle : tecnico ? destaqueNeutro : undefined}
            >
              {tecnico ? (
                <div className="ppv-form-picker-filled">
                  <i className="fas fa-user-tie" />
                  <div><div className="ppv-form-picker-name">{tecnico}</div></div>
                </div>
              ) : (
                <div className="ppv-form-picker-empty">
                  <i className="fas fa-search" />
                  <span>Clique para escolher o vendedor</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Observações ── */}
          <div className="ppv-form-field">
            <span className="ppv-form-label">Observações <span className="ppv-form-optional">(opcional)</span></span>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Escreva aqui se precisar..."
              rows={2}
            />
          </div>

          {/* ── Separador ── */}
        </div>

        {/* ════════ DIREITA: Carrinho ════════ */}
        <div className="ppv-form-cart">
          {/* Header */}
          <div className="ppv-form-cart-header">
            <i className="fas fa-shopping-cart" />
            <span>Itens do Pedido</span>
            {prodCount > 0 && <span className="ppv-form-cart-badge">{prodCount}</span>}
          </div>

          {/* Lista */}
          <div ref={cartRef} className="ppv-form-cart-body">
            {prodCount === 0 ? (
              <div className="ppv-form-cart-empty">
                <i className="fas fa-box-open" />
                <p>Nenhum produto adicionado</p>
                <span>Busque produtos ou importe um kit de revisão</span>
              </div>
            ) : (
              prodsList.map((p) => (
                <div
                  key={p.codigo}
                  className="ppv-form-cart-item"
                  style={{
                    background: recentlyAdded === p.codigo ? "#F0FDF4" : undefined,
                    opacity: removingItem === p.codigo ? 0 : 1,
                  }}
                >
                  <div className="ppv-form-cart-item-info">
                    <div className="ppv-form-cart-item-code">
                      {/* Código como LINK claro: abre as informações do produto */}
                      <button type="button" onClick={() => setDetalheProd({ codigo: p.codigo, descricao: p.descricao })}
                        title="Ver informações do produto"
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: 0, border: "none", background: "transparent", cursor: "pointer", font: "inherit", color: "#dc2626", textDecoration: "underline", textDecorationStyle: "dotted", textDecorationColor: "#fca5a5", textUnderlineOffset: 3 }}>
                        {p.codigo}
                        <i className="fas fa-eye" style={{ fontSize: 11, color: "#f87171" }} />
                      </button>
                      {p.empresa && (() => {
                        const isPrimario = p.empresa.toLowerCase().includes("primari");
                        const label = isPrimario ? "CASTRO" : "NOVA";
                        return (
                          <span style={{
                            marginLeft: 6, fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                            background: isPrimario ? "#DBEAFE" : "#FEE2E2",
                            color: isPrimario ? "#2563EB" : "#DC2626",
                          }}>
                            {label}
                          </span>
                        );
                      })()}
                    </div>
                    <div className="ppv-form-cart-item-desc">{p.descricao}</div>
                    <div className="ppv-form-cart-item-price">{formatarMoeda(p.preco)} / un.</div>
                  </div>
                  <div className="ppv-form-cart-item-qty">
                    <button type="button" onClick={() => updateQtd(p.codigo, p.quantidade - 1)} disabled={p.quantidade <= 1}>−</button>
                    <input
                      type="number" value={p.quantidade}
                      onChange={(e) => updateQtd(p.codigo, parseInt(e.target.value) || 1)}
                      min={1}
                    />
                    <button type="button" onClick={() => updateQtd(p.codigo, p.quantidade + 1)}>+</button>
                  </div>
                  <div className="ppv-form-cart-item-subtotal">{formatarMoeda(p.subtotal)}</div>
                  <button type="button" onClick={() => removeProduct(p.codigo)} className="ppv-form-cart-item-remove">
                    <i className="fas fa-trash-alt" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="ppv-form-cart-footer">
            <div className="ppv-form-cart-total">
              <span>Total</span>
              <span className="ppv-form-cart-total-value">{formatarMoeda(total)}</span>
            </div>
            <button
              type="button" onClick={handleSubmit} disabled={submitting}
              className="ppv-form-btn-submit"
            >
              {submitting ? (
                <><i className="fas fa-spinner fa-spin" /> Salvando...</>
              ) : (
                <><i className="fas fa-check-circle" /> Finalizar Lançamento</>
              )}
            </button>
          </div>
        </div>
      </div>
      <ModalImportarKit open={kitModalOpen} onClose={() => setKitModalOpen(false)} onImportar={(produtos) => importarKitItens(produtos)} />
      <ModalProdutoEstoque open={!!detalheProd} codigo={detalheProd?.codigo || null} descricao={detalheProd?.descricao} onClose={() => setDetalheProd(null)} />
      <SelecionarUsuarioModal open={showVendedor} atual={tecnico} onClose={() => setShowVendedor(false)} onSelect={(nome) => setTecnico(nome)} />
    </div>
  );
}
