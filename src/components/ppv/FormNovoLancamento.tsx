"use client";

import { useState, useRef, useEffect } from "react";
import type { ProdutoSelecionado } from "@/lib/ppv/types";
import { formatarMoeda } from "@/lib/ppv/utils";
import { TIPOS_PEDIDO, MOTIVOS_SAIDA } from "@/lib/ppv/constants";
import { api } from "@/lib/ppv/api";
import { usePPV } from "@/lib/ppv/PPVContext";

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
}

export default function FormNovoLancamento({
  onVoltar, onBuscaCliente, onBuscaOS, onBuscaProduto, onSaved,
  clienteValue, osIdValue, osDisplayValue, produtoDisplay, onProdutoDisplayChange,
}: Props) {
  const { tecnicos, opcoesRevisao, productCache, showToast } = usePPV();

  const [selectedProducts, setSelectedProducts] = useState<Record<string, ProdutoSelecionado>>({});
  const [revTrator, setRevTrator] = useState("");
  const [revHoras, setRevHoras] = useState("");
  const [horasOpcoes, setHorasOpcoes] = useState<string[]>([]);
  const [qtdProduto, setQtdProduto] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [importandoKit, setImportandoKit] = useState(false);
  const [tipoPedido, setTipoPedido] = useState(TIPOS_PEDIDO[0].value);
  const [motivoSaida, setMotivoSaida] = useState(MOTIVOS_SAIDA[0].value);
  const [tecnico, setTecnico] = useState("");
  const [observacao, setObservacao] = useState("");
  const [recentlyAdded, setRecentlyAdded] = useState<string | null>(null);
  const [removingItem, setRemovingItem] = useState<string | null>(null);
  const [clienteDoc, setClienteDoc] = useState("");
  const [clienteCidade, setClienteCidade] = useState("");
  const [tentouEnviar, setTentouEnviar] = useState(false);

  const cartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!clienteValue) { setClienteDoc(""); setClienteCidade(""); return; }
    api.buscarClientePorNome(clienteValue).then((res) => {
      setClienteDoc(res.documento || "");
      setClienteCidade(res.cidade || "");
    }).catch(() => { setClienteDoc(""); setClienteCidade(""); });
  }, [clienteValue]);

  function atualizarHoras(trator: string) {
    setRevTrator(trator);
    setRevHoras("");
    setHorasOpcoes(trator && opcoesRevisao[trator] ? opcoesRevisao[trator] : []);
  }

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

  async function importarKit() {
    if (!revTrator || !revHoras) { showToast("error", "Selecione Modelo e Horas"); return; }
    setImportandoKit(true);
    try {
      const itens = await api.buscarKitRevisao(revTrator, revHoras);
      setSelectedProducts((prev) => {
        const copy = { ...prev };
        itens.forEach((x) => {
          if (copy[x.codigo]) {
            copy[x.codigo] = { ...copy[x.codigo], quantidade: copy[x.codigo].quantidade + x.quantidade, subtotal: (copy[x.codigo].quantidade + x.quantidade) * copy[x.codigo].preco };
          } else {
            copy[x.codigo] = { codigo: x.codigo, descricao: x.descricao, preco: x.preco, quantidade: x.quantidade, subtotal: x.quantidade * x.preco };
          }
        });
        return copy;
      });
      showToast("success", `Kit importado com ${itens.length} itens!`);
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
        observacao, osId: osIdValue, valorTotal: total, produtosSelecionados: prodsList,
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
      setTecnico(""); setObservacao(""); setTentouEnviar(false); onSaved();
    } catch (e) { showToast("error", e instanceof Error ? e.message : "Erro ao salvar"); }
    setSubmitting(false);
  }

  // Estilo de campo com erro
  const errStyle = { border: "2px solid #EF4444", background: "#FFF5F5" };

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

          {/* ── Linha 1: Tipo e Motivo ── */}
          <div className="ppv-form-row">
            <div className="ppv-form-field" style={{ flex: 1 }}>
              <span className="ppv-form-label">Tipo do Pedido</span>
              <select value={tipoPedido} onChange={(e) => setTipoPedido(e.target.value)}>
                {TIPOS_PEDIDO.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="ppv-form-field" style={{ flex: 1 }}>
              <span className="ppv-form-label">Motivo da Saída</span>
              <select value={motivoSaida} onChange={(e) => setMotivoSaida(e.target.value)}>
                {MOTIVOS_SAIDA.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>

          {/* ── Linha 2: Técnico ── */}
          <div className="ppv-form-field">
            <span className="ppv-form-label">
              Técnico <span className="ppv-form-required">*</span>
              {erroTecnico && <span className="ppv-form-error-msg">Selecione um técnico</span>}
            </span>
            <select
              value={tecnico}
              onChange={(e) => setTecnico(e.target.value)}
              style={erroTecnico ? errStyle : undefined}
            >
              <option value="">-- Selecione o técnico --</option>
              {tecnicos.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* ── Linha 3: Cliente ── */}
          <div className="ppv-form-field">
            <span className="ppv-form-label">
              Cliente <span className="ppv-form-required">*</span>
              {erroCliente && <span className="ppv-form-error-msg">Selecione um cliente</span>}
            </span>
            <div
              onClick={onBuscaCliente}
              className="ppv-form-picker"
              style={erroCliente ? errStyle : clienteValue ? { border: "2px solid #10B981", background: "#F0FDF4" } : undefined}
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

          {/* ── Linha 4: O.S. ── */}
          <div className="ppv-form-field">
            <span className="ppv-form-label">Ordem de Serviço <span className="ppv-form-optional">(opcional)</span></span>
            <div
              onClick={onBuscaOS}
              className="ppv-form-picker"
              style={osDisplayValue ? { border: "2px solid #10B981", background: "#F0FDF4" } : undefined}
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

          {/* ── Linha 5: Observações ── */}
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
          <div className="ppv-form-divider" />

          {/* ── Kit de Revisão ── */}
          <div className="ppv-form-section-title"><i className="fas fa-tools" /> Kit de Revisão</div>
          <div className="ppv-form-row" style={{ alignItems: "flex-end" }}>
            <div className="ppv-form-field" style={{ flex: 1 }}>
              <span className="ppv-form-label">Modelo</span>
              <select value={revTrator} onChange={(e) => atualizarHoras(e.target.value)}>
                <option value="">-- Selecione --</option>
                {Object.keys(opcoesRevisao).sort().map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="ppv-form-field" style={{ width: 130 }}>
              <span className="ppv-form-label">Horas</span>
              <select value={revHoras} onChange={(e) => setRevHoras(e.target.value)} disabled={horasOpcoes.length === 0}>
                <option value="">--</option>
                {horasOpcoes.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <button
              type="button" onClick={importarKit}
              disabled={importandoKit || !revTrator || !revHoras}
              className="ppv-form-btn-secondary"
            >
              {importandoKit ? <i className="fas fa-spinner fa-spin" /> : <><i className="fas fa-download" /> Importar Kit</>}
            </button>
          </div>

          {/* ── Separador ── */}
          <div className="ppv-form-divider" />

          {/* ── Adicionar Produto ── */}
          <div className="ppv-form-section-title">
            <i className="fas fa-cube" /> Adicionar Produto
            {erroProdutos && <span className="ppv-form-error-msg" style={{ marginLeft: 12 }}>Adicione ao menos 1 produto</span>}
          </div>
          {/* Busca produto */}
          <div className="ppv-form-field">
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

          {/* Qtd + Botão adicionar — sempre visíveis */}
          <div className="ppv-form-row" style={{ alignItems: "flex-end" }}>
            <div className="ppv-form-field" style={{ width: 100 }}>
              <span className="ppv-form-label">Qtd</span>
              <input
                type="number" value={qtdProduto}
                onChange={(e) => setQtdProduto(parseInt(e.target.value) || 1)}
                min={1} style={{ textAlign: "center", fontWeight: 700 }}
              />
            </div>
            <button type="button" onClick={addProduct} className="ppv-form-btn-primary" style={{ flex: 1 }}>
              <i className="fas fa-plus" /> Adicionar ao Carrinho
            </button>
          </div>
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
                      {p.codigo}
                      {p.empresa && (() => {
                        const isPrimario = p.empresa.toLowerCase().includes("primari");
                        const label = isPrimario ? "CASTRO" : "NOVA";
                        return (
                          <span style={{
                            marginLeft: 6, fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 8,
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
    </div>
  );
}
