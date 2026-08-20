"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { ProdutoBusca } from "@/lib/ppv/types";
import { api } from "@/lib/ppv/api";
import { usePPV } from "@/lib/ppv/PPVContext";
import CatalogoNovo from "@/components/ppv/CatalogoNovo";
import ModalProdutoEstoque from "@/components/ppv/ModalProdutoEstoque";

interface Props {
  open: boolean;
  mode: "main" | "modal" | "edit";
  onClose: () => void;
  onSelect: (codigo: string, descricao: string, preco: number, empresa?: string, qtd?: number) => void;
  onEditManual?: (id: number, codigo: string, descricao: string, preco: number) => void;
  /** Abre já na aba de catálogo (botão "Catálogo" do drawer). */
  abrirNoCatalogo?: boolean;
  /** Peça do catálogo não cadastrada → criar produto provisório (code + nome). */
  onCriarProvisorio?: (code: string, name: string) => void;
  /** Abrir o Importar Kit a partir daqui (só no contexto do pedido aberto). */
  onAbrirKit?: () => void;
}

export default function ModalBuscaProduto({ open, mode, onClose, onSelect, onEditManual, abrirNoCatalogo, onCriarProvisorio, onAbrirKit }: Props) {
  const { cacheProduct, showToast } = usePPV();
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<ProdutoBusca[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [mensagem, setMensagem] = useState("Digite para pesquisar produtos...");
  const [verCatalogo, setVerCatalogo] = useState(false);
  const [editandoPreco, setEditandoPreco] = useState<{ idx: number; valor: string } | null>(null);
  const [salvandoPreco, setSalvandoPreco] = useState(false);
  const [detalheProd, setDetalheProd] = useState<{ codigo: string; descricao?: string } | null>(null);
  const [maisUsados, setMaisUsados] = useState<{ codigo: string; descricao: string; preco: number; usos: number }[]>([]);
  const [addedFlash, setAddedFlash] = useState<string | null>(null); // feedback "adicionado" na linha
  // Fluxo do "Novo Item": clicar no produto pergunta a QUANTIDADE (dialog no
  // centro) e a confirmação de adicionado também sai no MEIO da tela.
  const [qtdDialog, setQtdDialog] = useState<ProdutoBusca | null>(null);
  const [qtdValor, setQtdValor] = useState("1");
  const [confirmacao, setConfirmacao] = useState<string | null>(null);
  const qtdInputRef = useRef<HTMLInputElement>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const precoInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setTermo("");
      setResultados([]);
      setVerCatalogo(!!abrirNoCatalogo);
      setMensagem("Digite para pesquisar produtos...");
      if (!abrirNoCatalogo) setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [open, abrirNoCatalogo]);

  // Produtos MAIS UTILIZADOS — aparecem antes de pesquisar qualquer coisa
  useEffect(() => {
    if (!open || mode === "edit" || maisUsados.length > 0) return;
    api.produtosMaisUsados()
      .then((d) => { setMaisUsados(d || []); (d || []).forEach((p) => cacheProduct(p.codigo, p.descricao, p.preco)); })
      .catch(() => {});
  }, [open, mode, maisUsados.length, cacheProduct]);

  const buscar = useCallback(async (searchTermo: string) => {
    if (searchTermo.trim().length < 2) {
      setResultados([]);
      setMensagem("Digite ao menos 2 caracteres...");
      return;
    }
    setBuscando(true);
    setMensagem("");
    try {
      const data = await api.buscarProdutos(searchTermo.trim());
      setResultados(data);
      data.forEach((p) => cacheProduct(p.codigo, p.descricao, p.preco, p.empresa));
      if (data.length === 0) setMensagem("Nenhum produto encontrado.");
    } catch {
      setMensagem("Erro na busca.");
    }
    setBuscando(false);
  }, [cacheProduct]);

  function handleChange(value: string) {
    setTermo(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => buscar(value), 400);
  }

  async function salvarPrecoEditado(idx: number) {
    if (!editandoPreco) return;
    const novoPreco = parseFloat(editandoPreco.valor.replace(",", "."));
    if (isNaN(novoPreco) || novoPreco < 0) {
      showToast("error", "Preço inválido.");
      return;
    }
    const p = resultados[idx];
    setSalvandoPreco(true);
    try {
      if (p.origem === "manuais" && p.id_manual) {
        await api.salvarProdutoManual({ id: String(p.id_manual), codigo: p.codigo, descricao: p.descricao, preco: novoPreco });
      } else {
        await api.editarPrecoProduto(p.codigo, novoPreco, p.empresa);
      }
      setResultados((prev) => prev.map((item, i) => i === idx ? { ...item, preco: novoPreco } : item));
      cacheProduct(p.codigo, p.descricao, novoPreco, p.empresa);
      showToast("success", `Preço de ${p.codigo} atualizado para R$ ${novoPreco.toFixed(2)}`);
      setEditandoPreco(null);
    } catch {
      showToast("error", "Erro ao salvar preço.");
    }
    setSalvandoPreco(false);
  }

  function handleClick(p: ProdutoBusca) {
    if (editandoPreco !== null) return;
    if (mode === "edit") {
      if (p.origem === "manuais" && p.id_manual) {
        onEditManual?.(p.id_manual, p.codigo, p.descricao, p.preco);
      } else {
        showToast("error", "Produtos de estoque nao podem ser editados manualmente.");
        return;
      }
      onClose();
      return;
    }
    if (mode === "modal") {
      // No pedido aberto: pergunta a quantidade antes de adicionar.
      setQtdDialog(p);
      setQtdValor("1");
      setTimeout(() => { qtdInputRef.current?.focus(); qtdInputRef.current?.select(); }, 100);
      return;
    }
    onSelect(p.codigo, p.descricao, p.preco, p.empresa);
    onClose();
  }

  function confirmarQtd() {
    if (!qtdDialog) return;
    const qtd = parseInt(qtdValor, 10);
    if (isNaN(qtd) || qtd < 1) { showToast("error", "Quantidade inválida."); return; }
    const p = qtdDialog;
    onSelect(p.codigo, p.descricao, p.preco, p.empresa, qtd);
    setQtdDialog(null);
    setAddedFlash(p.codigo);
    setTimeout(() => setAddedFlash(null), 1400);
    // Confirmação no MEIO da tela (não no canto)
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    setConfirmacao(`${qtd}× ${p.codigo} — ${p.descricao}`);
    confirmTimerRef.current = setTimeout(() => setConfirmacao(null), 1800);
  }

  function highlightMatch(text: string) {
    if (!termo.trim()) return text;
    const regex = new RegExp(`(${termo.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? <mark key={i} className="rounded bg-orange-200 px-0.5">{part}</mark> : part
    );
  }

  // Peça escolhida no catálogo: só adiciona se o código já for cadastrado (Omie tem
  // prioridade sobre manual). Se não existir, abre a criação provisória com aviso.
  async function selecionarPecaCatalogo(code: string, name: string) {
    const cod = (code || "").trim();
    if (!cod) return;
    try {
      const data = await api.buscarProdutos(cod);
      const exatos = (data || []).filter((p) => p.codigo.trim().toUpperCase() === cod.toUpperCase());
      const escolhido = exatos.find((p) => p.origem === "completos") || exatos[0];
      if (escolhido) {
        onSelect(escolhido.codigo, escolhido.descricao, escolhido.preco, escolhido.empresa);
        onClose();
      } else if (onCriarProvisorio) {
        onCriarProvisorio(cod, name);
      } else {
        setVerCatalogo(false);
        setTermo(cod);
        buscar(cod);
        showToast("error", "Peça não cadastrada no Omie.");
      }
    } catch {
      showToast("error", "Erro ao verificar a peça.");
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-red-900/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`flex flex-col rounded-lg bg-[#FFFAF5] shadow-2xl ${verCatalogo ? "h-[88vh] w-[1060px] max-w-[96vw]" : "h-[550px] w-[800px]"}`}>
        <div className="flex items-center justify-between rounded-t-lg border-b border-orange-200/60 bg-[#FFFAF5] px-10 py-5">
          <h2 className="text-xl font-bold text-slate-800">{mode === "edit" ? "Editar Produto Manual" : mode === "modal" ? "Novo Item" : "Pesquisar Produto"}</h2>
          <button onClick={onClose} className="border-none bg-transparent text-2xl text-slate-400 transition-colors hover:text-red-500">&times;</button>
        </div>
        {verCatalogo ? (
          <div className="flex flex-1 flex-col overflow-hidden p-3" style={{ minHeight: 0 }}>
            <div className="mb-2 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] leading-snug text-amber-800">
              <button onClick={() => setVerCatalogo(false)} className="mr-1 flex shrink-0 items-center gap-1.5 rounded-md border border-amber-400 bg-white px-2.5 py-1 text-[12px] font-bold text-amber-700 transition-colors hover:bg-amber-100">
                <i className="fas fa-arrow-left" /> Busca
              </button>
              <i className="fas fa-circle-info mt-0.5 text-amber-500" />
              <span>
                Só dá pra adicionar peças <b>já cadastradas no Omie</b>. Se a peça escolhida não existir, abre a tela pra
                <b> criar provisoriamente</b> — mas o ideal é sempre usar o produto oficial do Omie.
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <CatalogoNovo onSelecionarPeca={(p) => selecionarPecaCatalogo(p.code, p.name)} />
            </div>
          </div>
        ) : (
        <div className="flex-1 overflow-y-auto bg-[#FFFAF5] px-10 py-7">
          {/* Busca + atalhos com legenda (Catálogo × Kit) do lado */}
          <div className="mb-3 flex items-stretch gap-2.5">
            <div className="relative flex-1">
              <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-red-400" />
              <input
                ref={inputRef}
                type="text"
                value={termo}
                onChange={(e) => handleChange(e.target.value)}
                onKeyUp={(e) => e.key === "Enter" && buscar(termo)}
                placeholder="Codigo ou nome do produto..."
                className="w-full rounded-lg border-2 border-red-500 py-4 pl-11 pr-20 text-base font-[Poppins] focus:outline-none focus:ring-2 focus:ring-red-200"
              />
              <button
                onClick={() => buscar(termo)}
                disabled={buscando || termo.trim().length < 2}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-red-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {buscando ? <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" /> : "Buscar"}
              </button>
            </div>
            {mode !== "edit" && (
              <button onClick={() => setVerCatalogo(true)} title="Buscar a peça pela figura do catálogo"
                className="flex w-[86px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-orange-300 bg-white text-orange-600 transition-colors hover:bg-orange-50">
                <i className="fas fa-images text-lg" />
                <span className="text-[11px] font-bold">Catálogo</span>
              </button>
            )}
            {mode === "modal" && onAbrirKit && (
              <button onClick={onAbrirKit} title="Importar kit de revisão (modelo + horas)"
                className="flex w-[86px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-orange-300 bg-white text-orange-600 transition-colors hover:bg-orange-50">
                <i className="fas fa-cubes text-lg" />
                <span className="text-[11px] font-bold">Kit</span>
              </button>
            )}
          </div>

          {/* MAIS UTILIZADOS — aparece antes de pesquisar */}
          {termo.trim().length < 2 && !buscando && maisUsados.length > 0 && (
            <div className="mb-3">
              <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400"><i className="fas fa-fire mr-1 text-orange-400" /> Produtos mais utilizados</div>
              <div className="overflow-hidden rounded-lg border border-orange-200/60">
                {maisUsados.map((p) => (
                  <button key={p.codigo} type="button"
                    onClick={() => handleClick({ codigo: p.codigo, descricao: p.descricao, preco: p.preco, origem: "completos" } as ProdutoBusca)}
                    className={`flex w-full items-center gap-3 border-b border-slate-100 px-4 py-2.5 text-left transition-colors last:border-b-0 ${addedFlash === p.codigo ? "bg-emerald-50" : "bg-white hover:bg-orange-50"}`}>
                    <span className="w-[130px] shrink-0 truncate text-[13px] font-bold text-slate-800">{p.codigo}</span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-slate-600" title={p.descricao}>{p.descricao}</span>
                    <span className="shrink-0 text-[13px] font-semibold text-slate-700">R$ {p.preco.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                    <span className="shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-600" title="Quantas vezes já foi usado em pedidos">{p.usos}×</span>
                    {addedFlash === p.codigo && <span className="shrink-0 text-[11px] font-bold text-emerald-600"><i className="fas fa-check mr-1" />adicionado</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {resultados.length > 0 && (
            <div className="mb-2 text-[11px] text-slate-400">
              {resultados.length} resultado{resultados.length !== 1 && "s"} encontrado{resultados.length !== 1 && "s"}
            </div>
          )}

          {!(termo.trim().length < 2 && !buscando && maisUsados.length > 0) && (
          <div className="overflow-hidden rounded-lg border border-orange-200/60" style={{ maxHeight: 330, overflowY: "auto" }}>
            <table className="w-full border-collapse">
              <thead>
                <tr className="sticky top-0 z-10 bg-orange-50/50">
                  <th className="border-b border-orange-200/60 px-4 py-3 text-left text-[11px] font-bold uppercase text-slate-400">CODIGO <span className="ml-1 normal-case font-medium text-red-400">· clique p/ ver</span></th>
                  <th className="border-b border-orange-200/60 px-4 py-3 text-left text-[11px] font-bold uppercase text-slate-400">DESCRICAO</th>
                  <th className="border-b border-orange-200/60 px-4 py-3 text-right text-[11px] font-bold uppercase text-slate-400">PRECO</th>
                  <th className="border-b border-orange-200/60 px-4 py-3 text-center text-[11px] font-bold uppercase text-slate-400">EMPRESA</th>
                  <th className="border-b border-orange-200/60 px-4 py-3 text-center text-[11px] font-bold uppercase text-slate-400">ORIGEM</th>
                </tr>
              </thead>
              <tbody>
                {buscando ? (
                  <tr><td colSpan={5} className="p-5 text-center">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-red-600" />
                    <span className="ml-2 text-sm text-slate-500">Buscando produtos...</span>
                  </td></tr>
                ) : resultados.length > 0 ? (
                  resultados.map((p, idx) => (
                    <tr key={idx} onClick={() => handleClick(p)} className={`cursor-pointer border-b border-slate-100 transition-colors ${addedFlash === p.codigo ? "bg-emerald-50" : "hover:bg-orange-50"}`}>
                      <td className="px-4 py-3 text-[13px] font-bold text-slate-800">
                        {/* Clicar no CÓDIGO abre as informações do produto (não seleciona).
                            Estilo de LINK bem claro: sublinhado + ícone "olho". */}
                        <button type="button"
                          onClick={(e) => { e.stopPropagation(); setDetalheProd({ codigo: p.codigo, descricao: p.descricao }); }}
                          title="Ver informações do produto"
                          className="group inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 -mx-1 text-left text-red-600 underline decoration-red-300 decoration-dotted underline-offset-2 hover:bg-red-50 hover:decoration-red-600 hover:decoration-solid">
                          {highlightMatch(p.codigo)}
                          <i className="fas fa-eye text-[11px] text-red-400 group-hover:text-red-600" />
                        </button>
                      </td>
                      <td className="max-w-[280px] px-4 py-3 text-[13px] text-slate-700">
                        <div className="truncate" title={p.descricao}>{highlightMatch(p.descricao)}</div>
                      </td>
                      <td className="px-4 py-3 text-right text-[13px] font-semibold text-slate-800">
                        <div className="flex items-center justify-end gap-1.5">
                          {editandoPreco?.idx === idx ? (
                            <>
                              <span className="text-[11px] text-slate-400">R$</span>
                              <input
                                ref={precoInputRef}
                                type="text"
                                value={editandoPreco.valor}
                                onChange={(e) => setEditandoPreco({ idx, valor: e.target.value })}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") salvarPrecoEditado(idx);
                                  if (e.key === "Escape") setEditandoPreco(null);
                                }}
                                className="w-24 rounded border border-orange-300 px-2 py-1 text-right text-[13px] focus:outline-none focus:ring-1 focus:ring-orange-400"
                                autoFocus
                                disabled={salvandoPreco}
                              />
                              <button
                                onClick={(e) => { e.stopPropagation(); salvarPrecoEditado(idx); }}
                                disabled={salvandoPreco}
                                className="rounded p-1 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
                                title="Salvar"
                              >
                                <i className="fas fa-check text-[11px]" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setEditandoPreco(null); }}
                                disabled={salvandoPreco}
                                className="rounded p-1 text-slate-400 hover:bg-slate-100"
                                title="Cancelar"
                              >
                                <i className="fas fa-times text-[11px]" />
                              </button>
                            </>
                          ) : (
                            <>
                              <span>R$ {p.preco.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditandoPreco({ idx, valor: p.preco.toFixed(2).replace(".", ",") });
                                }}
                                className="ml-1 rounded p-1 text-slate-300 transition-colors hover:bg-orange-50 hover:text-orange-500"
                                title="Editar preço"
                              >
                                <i className="fas fa-pencil-alt text-[10px]" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {p.empresa ? (() => {
                          const isCastro = p.empresa.toLowerCase().includes("castro");
                          const label = isCastro ? "CASTRO" : "NOVA";
                          return (
                            <span className="rounded-full px-3 py-1.5 text-[13px] font-bold" style={{
                              background: isCastro ? "#DBEAFE" : "#FEE2E2",
                              color: isCastro ? "#2563EB" : "#DC2626",
                            }}>
                              {label}
                            </span>
                          );
                        })() : (
                          <span className="text-[12px] text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${p.origem === "manuais" ? "bg-emerald-100 text-emerald-600" : "bg-blue-100 text-blue-600"}`}>
                          {p.origem === "manuais" ? "MANUAL" : "ESTOQUE"}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={5} className="p-8 text-center">
                    <i className="fas fa-box-open mb-2 text-2xl text-slate-200" />
                    <div className="text-sm text-slate-400">{mensagem}</div>
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          )}
        </div>
        )}
      </div>

      {/* Informações do produto — mesmo popup do PPV aberto */}
      <ModalProdutoEstoque open={!!detalheProd} codigo={detalheProd?.codigo || null} descricao={detalheProd?.descricao} onClose={() => setDetalheProd(null)} />

      {/* ── Dialog de QUANTIDADE (centro da tela) ── */}
      {qtdDialog && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.45)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setQtdDialog(null); }}
        >
          <div style={{ background: "var(--portal-bg-card, #fff)", borderRadius: 14, padding: "22px 26px", width: 420, maxWidth: "92vw", boxShadow: "0 12px 40px rgba(0,0,0,0.35)", border: "1px solid var(--portal-border, #e5e7eb)" }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#EA580C", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Adicionar ao pedido</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--portal-text, #111)", marginBottom: 2 }}>{qtdDialog.codigo}</div>
            <div style={{ fontSize: 13, color: "var(--portal-text-secondary, #6b7280)", marginBottom: 14 }}>{qtdDialog.descricao}</div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--portal-text-secondary, #6b7280)", marginBottom: 6 }}>Quantidade</label>
            <input
              ref={qtdInputRef}
              type="number"
              min={1}
              inputMode="numeric"
              value={qtdValor}
              onChange={(e) => setQtdValor(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") confirmarQtd(); if (e.key === "Escape") setQtdDialog(null); }}
              style={{ width: "100%", fontSize: 22, fontWeight: 800, textAlign: "center", padding: "10px 12px", borderRadius: 10, border: "2px solid #EA580C", marginBottom: 14, background: "var(--portal-bg-secondary, #f9fafb)", color: "var(--portal-text, #111)", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setQtdDialog(null)} style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "1px solid var(--portal-border, #e5e7eb)", background: "transparent", color: "var(--portal-text-secondary, #6b7280)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                Cancelar
              </button>
              <button onClick={confirmarQtd} style={{ flex: 2, padding: "11px 0", borderRadius: 10, border: "none", background: "#EA580C", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
                Adicionar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirmação de ADICIONADO (centro da tela, some sozinha) ── */}
      {confirmacao && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1300, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{ background: "#14532d", color: "#fefefe", borderRadius: 14, padding: "20px 30px", maxWidth: "88vw", boxShadow: "0 12px 40px rgba(0,0,0,0.45)", textAlign: "center", border: "2px solid #22c55e" }}>
            <div style={{ fontSize: 30, marginBottom: 6 }}>✓</div>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 2 }}>Produto adicionado ao pedido</div>
            <div style={{ fontSize: 13.5, opacity: 0.9 }}>{confirmacao}</div>
          </div>
        </div>
      )}
    </div>
  );
}
