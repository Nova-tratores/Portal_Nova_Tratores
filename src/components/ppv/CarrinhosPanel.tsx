"use client";

import { useEffect, useState, useCallback } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";

interface Carrinho { id: string; nome: string; cliente: string; modelo: string; modelo_slug: string; servico: string; status: string; criado_por?: string; criado_em: string; atualizado_em: string; expira_em: string; total_itens?: number; marca?: string | null }

// ── Exportar pro Zeitten (site de onde o catálogo foi extraído) ──
// O carrinho de lá não tem API: é estado do navegador. Mas a tela do carrinho
// tem "Realizar pedido rápido", que aceita os componentes em massa. Então aqui
// só geramos "código<TAB>quantidade" pra colar lá — sem senha, sem automação
// frágil. Os códigos batem 1:1 porque o catálogo veio do próprio Zeitten.
const ZEITTEN_BU = "31463139000103"; // Nova Tratores (CNPJ sem pontuação)
const ZEITTEN_MARCAS: Record<string, string> = { Mahindra: "mahindra" };
const zeittenUrl = (marca?: string | null) => {
  const org = marca ? ZEITTEN_MARCAS[marca] : null;
  return org ? `https://zeitten.com/pt/${org}/business-units/${ZEITTEN_BU}/cart` : null;
};
interface Item { id: string; codigo: string; descricao: string; qtd: number; cadastrado: boolean }
interface Hist { id: string; quem: string; acao: string; detalhe: string; quando: string }

const ACAO_LABEL: Record<string, string> = {
  criar: "Criou o carrinho", add_item: "Adicionou peça", rem_item: "Removeu peça",
  editar: "Editou os dados", fechar: "Fechou o carrinho", reabrir: "Reabriu o carrinho",
  excluir: "Moveu para a lixeira", gerar_ppv: "Gerou PPV", gerar_orcamento: "Gerou orçamento",
};

function fmtData(iso?: string) {
  if (!iso) return "";
  try { return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); } catch { return String(iso); }
}
function diasRestantes(expira?: string) {
  if (!expira) return null;
  const ms = new Date(expira).getTime() - Date.now();
  return Math.ceil(ms / 86400000);
}

export default function CarrinhosPanel({ userName, onEditarPecas, onClose }: { userName?: string; onEditarPecas?: (c: Carrinho) => void; onClose: () => void }) {
  const isMobile = useIsMobile();
  const [aba, setAba] = useState<"aberto" | "fechado" | "lixeira">("aberto");
  const [lista, setLista] = useState<Carrinho[]>([]);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<{ carrinho: Carrinho; itens: Item[]; historico: Hist[] } | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  // Abas do detalhe: a tela empilhava tudo (dados, peças, gerar doc, ações,
  // histórico) e virava um paredão de informação.
  const [abaDet, setAbaDet] = useState<"pecas" | "documento" | "historico">("pecas");
  const [editForm, setEditForm] = useState<{ nome: string; cliente: string; modelo: string; servico: string } | null>(null);
  // Fase 2: gerar documentos + produto não cadastrado
  const [cliQ, setCliQ] = useState("");
  const [cliRes, setCliRes] = useState<{ nome: string; documento?: string; cidade?: string }[]>([]);
  const [cliSel, setCliSel] = useState<{ nome: string; documento?: string; endereco?: string; cidade?: string } | null>(null);
  const [gerando, setGerando] = useState(false);
  const [msg, setMsg] = useState("");
  const [criarProd, setCriarProd] = useState<Item | null>(null);
  const [prodPreco, setProdPreco] = useState("0.00");
  const [salvandoProd, setSalvandoProd] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [copiadoZeitten, setCopiadoZeitten] = useState(false);

  // Planilha no formato do "Pedido Rápido" do Zeitten. As colunas vêm do template
  // que eles fornecem: Código | Revisão | Observações | Número de Série | Quantidade.
  // Só Código e Quantidade são nossos; o resto vai vazio (são campos opcionais).
  const baixarPlanilhaZeitten = async (abrir: boolean) => {
    const itens = sel?.itens || [];
    if (!itens.length) return;
    const XLSX = await import("xlsx");
    const linhas = [
      ["Código", "Revisão", "Observações", "Número de Série", "Quantidade"],
      ...itens.map((i) => [i.codigo, "", "", "", i.qtd || 1]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pedido");
    const nome = `zeitten-${(sel?.carrinho.nome || "carrinho").replace(/[^\w\-]+/g, "-").slice(0, 40)}.xlsx`;
    XLSX.writeFile(wb, nome);
    setCopiadoZeitten(true);
    setTimeout(() => setCopiadoZeitten(false), 3000);
    const url = zeittenUrl(sel?.carrinho.marca);
    if (abrir && url) window.open(url, "_blank", "noopener");
  };
  // Incluir em documento aberto (padrão) × criar um novo do zero
  const [docMode, setDocMode] = useState<"novo" | "incluir">("incluir");
  const [codsCopiados, setCodsCopiados] = useState(false);
  const [tecnicos, setTecnicos] = useState<string[]>([]);
  const [tecnicoSel, setTecnicoSel] = useState("");
  const [incluirTipo, setIncluirTipo] = useState<"ppv" | "orcamento">("orcamento");
  const [docQ, setDocQ] = useState("");
  const [docRes, setDocRes] = useState<{ id: string; label: string; sub: string }[]>([]);
  const [incluindo, setIncluindo] = useState(false);

  const temNaoCadastrado = !!sel && sel.itens.some((i) => !i.cadastrado);

  useEffect(() => { fetch("/api/ppv/dados-iniciais").then((r) => r.json()).then((d) => setTecnicos(Array.isArray(d?.tecnicos) ? d.tecnicos : [])).catch(() => {}); }, []);
  // Peça sem cadastro NÃO trava mais o PPV (decisão do usuário, 18/08): ela
  // entra sem preço e ajusta-se depois no próprio pedido.

  // Lista docs existentes ao escolher "incluir" (PPV ou orçamento)
  useEffect(() => {
    if (docMode !== "incluir") return;
    const t = setTimeout(async () => {
      try {
        if (incluirTipo === "orcamento") {
          const r = await fetch(`/api/orcamentos?q=${encodeURIComponent(docQ)}`);
          const d = r.ok ? await r.json() : null;
          // A rota devolve { orcamentos: [...] } — não um array puro
          const lista = Array.isArray(d) ? d : (Array.isArray(d?.orcamentos) ? d.orcamentos : []);
          setDocRes(lista
            .filter((o: { status?: string; expirado?: boolean }) => !/aprovad|recusad|cancel|conclu|expirad/i.test(String(o.status || "")) && !o.expirado)
            .slice(0, 40).map((o: { id: string; numero?: string; cliente_nome?: string }) => ({ id: String(o.id), label: o.numero || `#${o.id}`, sub: `${o.cliente_nome || "—"}` })));
        } else {
          const r = await fetch(`/api/ppv/pedidos`);
          const d = r.ok ? await r.json() : [];
          const q = docQ.trim().toLowerCase();
          setDocRes((Array.isArray(d) ? d : [])
            .filter((p: { status?: string }) => !/conclu|cancel|fechad/i.test(String(p.status || "")))
            .filter((p: { id?: string; cliente?: string }) => !q || String(p.id).toLowerCase().includes(q) || String(p.cliente || "").toLowerCase().includes(q))
            .slice(0, 40).map((p: { id: string; cliente?: string; tecnico?: string }) => ({ id: String(p.id), label: `PPV ${p.id}`, sub: `${p.cliente || "—"}${p.tecnico ? ` · ${p.tecnico}` : ""}` })));
        }
      } catch { setDocRes([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [docMode, incluirTipo, docQ]);

  // Copia os códigos do carrinho (qtd × código — nome), um por linha
  const copiarCodigosCarrinho = () => {
    if (!sel || sel.itens.length === 0) return;
    const texto = sel.itens.map((i) => `${i.qtd}x ${i.codigo} — ${i.descricao}`).join("\n");
    navigator.clipboard?.writeText(texto).then(() => { setCodsCopiados(true); setTimeout(() => setCodsCopiados(false), 1600); }).catch(() => {});
  };

  // Baixa/imprime o carrinho em PDF (janela de impressão → salvar como PDF)
  const pdfCarrinhoSalvo = () => {
    if (!sel || sel.itens.length === 0) return;
    const w = window.open("", "_blank");
    if (!w) return;
    const c = sel.carrinho;
    const linhas = sel.itens.map((i, n) => `<tr><td>${n + 1}</td><td class="qtd">${i.qtd}</td><td class="cod">${i.codigo}</td><td>${i.descricao}</td></tr>`).join("");
    w.document.write(`<!DOCTYPE html><html><head><title>${c.nome}</title><style>
      body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:28px;}
      h1{font-size:20px;margin:0 0 3px;} .sub{color:#555;font-size:12px;margin-bottom:18px;}
      table{width:100%;border-collapse:collapse;font-size:13px;}
      th{background:#EA580C;color:#fff;text-align:left;padding:8px 10px;font-size:12px;}
      td{border-bottom:1px solid #ddd;padding:7px 10px;vertical-align:top;}
      .cod{font-family:Consolas,Menlo,monospace;white-space:nowrap;} .qtd{text-align:center;}
    </style></head><body>
      <h1>${c.nome}</h1>
      <div class="sub">${[c.cliente, c.modelo].filter(Boolean).join(" · ")}${c.cliente || c.modelo ? " · " : ""}${new Date().toLocaleDateString("pt-BR")} · ${sel.itens.reduce((s, i) => s + (i.qtd || 1), 0)} peça(s)</div>
      <table><thead><tr><th>#</th><th>Qtd</th><th>Código</th><th>Descrição</th></tr></thead><tbody>${linhas}</tbody></table>
      <script>window.onload=function(){window.print();}</script>
    </body></html>`);
    w.document.close();
  };

  // ── Modal do PPV (clicou num PPV aberto): "Novo Item" + peças do pedido + carrinho ──
  const [ppvModal, setPpvModal] = useState<{ id: string; label: string } | null>(null);
  const [ppvDet, setPpvDet] = useState<{ cliente?: string; clienteDocumento?: string; tecnico?: string; status?: string; observacao?: string; projeto?: string; produtos?: { codigo: string; descricao: string; quantidade: number; preco: number }[] } | null>(null);
  const [ppvCarregando, setPpvCarregando] = useState(false);
  const [prodQ, setProdQ] = useState("");
  const [prodRes, setProdRes] = useState<{ codigo: string; descricao: string; preco: number; empresa?: string }[]>([]);
  const [prodBuscando, setProdBuscando] = useState(false);
  const [addFlash, setAddFlash] = useState<string | null>(null);
  const [copiadoCod, setCopiadoCod] = useState<string | null>(null);
  const [addindo, setAddindo] = useState(false);

  const abrirPpvModal = async (d: { id: string; label: string }) => {
    setPpvModal(d); setPpvDet(null); setProdQ(""); setProdRes([]); setPpvCarregando(true);
    try { const r = await fetch(`/api/ppv/pedidos?id=${encodeURIComponent(d.id)}`); setPpvDet(r.ok ? await r.json() : null); } catch { setPpvDet(null); }
    setPpvCarregando(false);
  };

  // Busca de produto dentro do modal (igual ao "Novo Item" do PPV)
  useEffect(() => {
    if (!ppvModal) return;
    const q = prodQ.trim();
    if (q.length < 2) { setProdRes([]); return; }
    const t = setTimeout(async () => {
      setProdBuscando(true);
      try { const r = await fetch(`/api/ppv/produtos?termo=${encodeURIComponent(q)}`); setProdRes(r.ok ? await r.json() : []); } catch { setProdRes([]); }
      setProdBuscando(false);
    }, 350);
    return () => clearTimeout(t);
  }, [prodQ, ppvModal]);

  // Produto da busca → entra direto no PPV (qtd 1; clicar de novo soma +1)
  const addProdutoNoPpv = async (p: { codigo: string; descricao: string; preco: number }) => {
    if (!ppvModal || addindo) return;
    setAddindo(true);
    try {
      const r = await fetch("/api/ppv/movimentacoes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ppvModal.id, codigo: p.codigo, descricao: p.descricao, quantidade: 1, preco: p.preco, tecnico: ppvDet?.tecnico || "", tipoMovimento: "Saída", userName: userName || "" }),
      });
      if (r.ok) { setPpvDet(await r.json()); setAddFlash(p.codigo); setTimeout(() => setAddFlash(null), 1400); }
    } catch { /* segue */ }
    setAddindo(false);
  };

  // Item do carrinho → entra no PPV pelo criar-doc (resolve preço/variante RP-)
  const addItemCarrinhoNoPpv = async (i: { codigo: string; descricao: string; qtd: number }) => {
    if (!ppvModal || addindo) return;
    setAddindo(true);
    try {
      const r = await fetch("/api/catalogo/criar-doc", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "ppv", alvoId: ppvModal.id, items: [{ codigo: i.codigo, descricao: i.descricao, quantidade: i.qtd }], userName: userName || "" }),
      });
      if (r.ok) {
        setAddFlash(i.codigo); setTimeout(() => setAddFlash(null), 1400);
        try { const r2 = await fetch(`/api/ppv/pedidos?id=${encodeURIComponent(ppvModal.id)}`); if (r2.ok) setPpvDet(await r2.json()); } catch { /* mantém o que tem */ }
      }
    } catch { /* segue */ }
    setAddindo(false);
  };

  const copiarCod = (c: string) => {
    navigator.clipboard?.writeText(c).then(() => { setCopiadoCod(c); setTimeout(() => setCopiadoCod(null), 1400); }).catch(() => {});
  };

  const incluirEm = async (alvoId: string) => {
    if (!sel) return;
    setIncluindo(true); setMsg("");
    try {
      const items = sel.itens.map((i) => ({ codigo: i.codigo, descricao: i.descricao, quantidade: i.qtd }));
      const r = await fetch("/api/catalogo/criar-doc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo: incluirTipo, items, alvoId, tecnico: tecnicoSel, userName: userName || "" }) });
      const j = await r.json();
      if (r.ok) {
        const lbl = incluirTipo === "ppv" ? `PPV ${j.id}` : `Orçamento ${j.numero || j.id}`;
        setMsg(`Peças incluídas em ${lbl}.${j.semPreco ? ` — ⚠️ ${j.semPreco} sem preço.` : ""}`);
        await fetch(`/api/carrinhos/${sel.carrinho.id}/historico`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: incluirTipo === "ppv" ? "gerar_ppv" : "gerar_orcamento", detalhe: `Incluído em ${lbl}`, quem: userName || "" }) });
        abrir(sel.carrinho.id);
      } else setMsg(j.error || "Erro ao incluir.");
    } catch { setMsg("Erro ao incluir."); }
    setIncluindo(false);
  };

  const carregarLista = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch(`/api/carrinhos?status=${aba}`); setLista(r.ok ? await r.json() : []); } catch { setLista([]); }
    setLoading(false);
  }, [aba]);

  useEffect(() => { carregarLista(); }, [carregarLista]);

  const abrir = useCallback(async (id: string, previa?: any) => {
    // Mostra na hora o que a lista já sabe (nome, cliente, trator) e só depois
    // troca pelos dados completos — evita a tela em branco de "Carregando…".
    if (previa) {
      setSel({ carrinho: previa, itens: [], historico: [] } as any);
      setEditForm({ nome: previa.nome || "", cliente: previa.cliente || "", modelo: previa.modelo || "", servico: previa.servico || "" });
    }
    setAbaDet("pecas");
    setAbrindo(true);
    const r = await fetch(`/api/carrinhos/${id}`).finally(() => setAbrindo(false));
    if (r.ok) {
      const d = await r.json(); setSel(d);
      setEditForm({ nome: d.carrinho.nome || "", cliente: d.carrinho.cliente || "", modelo: d.carrinho.modelo || "", servico: d.carrinho.servico || "" });
      setCliQ(""); setMsg(""); setShareLink(""); setCopiado(false);
      // O carrinho guarda só o NOME do cliente. Pra saber se dá PPV, resolvemos
      // esse nome no cadastro do Omie e trazemos o documento (CNPJ/CPF).
      const nomeCli = d.carrinho.cliente ? String(d.carrinho.cliente).trim() : "";
      setCliSel(nomeCli ? { nome: nomeCli } : null);
      if (nomeCli) {
        try {
          const rc = await fetch(`/api/ppv/clientes?termo=${encodeURIComponent(nomeCli)}`);
          const cs: { nome: string; documento?: string; endereco?: string; cidade?: string }[] = rc.ok ? await rc.json() : [];
          const norm = (s: string) => String(s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
          const alvo = norm(nomeCli);
          const match = cs.find((c) => { const n = norm(c.nome); return n === alvo || n.startsWith(alvo) || alvo.startsWith(n); }) || (cs.length === 1 ? cs[0] : null);
          if (match?.documento) setCliSel(match);
        } catch { /* fica só com o nome */ }
      }
    }
  }, []);

  // Busca de cliente (pra gerar documento)
  useEffect(() => {
    const q = cliQ.trim();
    if (q.length < 2) { setCliRes([]); return; }
    const t = setTimeout(async () => { try { const r = await fetch(`/api/ppv/clientes?termo=${encodeURIComponent(q)}`); setCliRes(r.ok ? await r.json() : []); } catch { setCliRes([]); } }, 300);
    return () => clearTimeout(t);
  }, [cliQ]);

  const gerar = async (tipo: "ppv" | "orcamento" | "ambos") => {
    if (!sel) return;
    if (!cliSel?.nome) { setMsg("Escolha o cliente antes de gerar."); return; }
    setGerando(true); setMsg("");
    const items = sel.itens.map((i) => ({ codigo: i.codigo, descricao: i.descricao, quantidade: i.qtd }));
    const tipos: ("orcamento" | "ppv")[] = tipo === "ambos" ? ["orcamento", "ppv"] : [tipo];
    const partes: string[] = []; let semPrecoTotal = 0;
    try {
      for (const t of tipos) {
        const r = await fetch("/api/catalogo/criar-doc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo: t, items, cliente: cliSel, tecnico: tecnicoSel, userName: userName || "" }) });
        const j = await r.json();
        if (r.ok) {
          partes.push(t === "ppv" ? `PPV ${j.id || ""}` : `Orçamento ${j.numero || ""}`);
          semPrecoTotal = Math.max(semPrecoTotal, j.semPreco || 0);
          await fetch(`/api/carrinhos/${sel.carrinho.id}/historico`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: t === "ppv" ? "gerar_ppv" : "gerar_orcamento", detalhe: t === "ppv" ? `PPV ${j.id || ""}` : `Orçamento ${j.numero || ""}`, quem: userName || "" }) });
          // Criou o PPV → abre DIRETO o modal do pedido (o mesmo do Pré-Pedido de
          // Venda), já com as peças dentro, pra completar os dados por lá.
          if (t === "ppv" && j.id) {
            window.location.href = `/ppv?id=${encodeURIComponent(j.id)}`;
            return;
          }
        } else partes.push(`erro (${t})`);
      }
      setMsg(`Gerado: ${partes.join(" · ")}${semPrecoTotal ? ` — ⚠️ ${semPrecoTotal} peça(s) sem preço (não cadastradas no Omie).` : ""}`);
      abrir(sel.carrinho.id);
    } catch { setMsg("Erro ao gerar."); }
    setGerando(false);
  };

  const compartilhar = async () => {
    if (!sel) return;
    setShareLink(""); setCopiado(false);
    const r = await fetch(`/api/carrinhos/${sel.carrinho.id}/share`, { method: "POST" });
    const j = await r.json();
    // Link sempre no domínio de produção (pra poder enviar pra quem não tem acesso ao portal).
    const base = process.env.NEXT_PUBLIC_SITE_URL || "https://portal.novatratores.com";
    if (r.ok && j.token) setShareLink(`${base}/carrinho/${j.token}`);
  };
  const copiarLink = () => { navigator.clipboard?.writeText(shareLink).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1500); }).catch(() => {}); };

  const salvarProdutoManual = async () => {
    if (!criarProd) return;
    setSalvandoProd(true);
    try {
      const r = await fetch("/api/ppv/produtos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codigo: criarProd.codigo, descricao: criarProd.descricao || criarProd.codigo, preco: parseFloat(prodPreco || "0") }) });
      if (r.ok) { setCriarProd(null); setProdPreco("0.00"); if (sel) abrir(sel.carrinho.id); }
      else { const j = await r.json().catch(() => ({})); setMsg(j.error || "Erro ao criar produto."); }
    } catch { setMsg("Erro de conexão."); }
    setSalvandoProd(false);
  };

  const salvarEdicao = async () => {
    if (!sel || !editForm) return;
    await fetch(`/api/carrinhos/${sel.carrinho.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...editForm, quem: userName || "" }) });
    await abrir(sel.carrinho.id); carregarLista();
  };
  const removerItem = async (item: Item) => {
    if (!sel) return;
    await fetch(`/api/carrinhos/${sel.carrinho.id}/itens?itemId=${item.id}&codigo=${encodeURIComponent(item.codigo)}&quem=${encodeURIComponent(userName || "")}`, { method: "DELETE" });
    await abrir(sel.carrinho.id); carregarLista();
  };
  const mudarStatus = async (status: "aberto" | "fechado") => {
    if (!sel) return;
    await fetch(`/api/carrinhos/${sel.carrinho.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, quem: userName || "" }) });
    setSel(null); carregarLista();
  };
  const excluir = async () => {
    if (!sel || !confirm("Mover este carrinho para a lixeira?")) return;
    await fetch(`/api/carrinhos/${sel.carrinho.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "lixeira", quem: userName || "" }) });
    setSel(null); carregarLista();
  };
  const excluirDefinitivo = async () => {
    if (!sel || !confirm("Excluir DEFINITIVAMENTE? Não dá pra desfazer.")) return;
    await fetch(`/api/carrinhos/${sel.carrinho.id}`, { method: "DELETE" });
    setSel(null); carregarLista();
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 6000, background: "#fff", display: "flex" }}>
      <div style={{ width: "100vw", height: "100vh", background: "#fff", display: "flex", overflow: "hidden" }}>
        {/* Lista */}
        <div style={{ width: isMobile ? "100%" : 380, flexShrink: isMobile ? 1 : 0, borderRight: isMobile ? "none" : "1px solid #eef0f3", display: (isMobile && sel) ? "none" : "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ padding: "18px 20px", borderBottom: "1px solid #eef0f3" }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#0f172a", display: "flex", alignItems: "center", gap: 10 }}><i className="fas fa-cart-shopping" style={{ color: "#dc2626" }} /> Carrinhos</div>
            <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
              {(["aberto", "fechado", "lixeira"] as const).map((s) => (
                <button key={s} onClick={() => { setAba(s); setSel(null); }} style={{ flex: 1, padding: "10px 0", borderRadius: 9, border: "1px solid", borderColor: aba === s ? "#dc2626" : "#e2e8f0", background: aba === s ? "#fef2f2" : "#fff", color: aba === s ? "#dc2626" : "#64748b", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
                  {s === "aberto" ? "Abertos" : s === "fechado" ? "Fechados" : "Lixeira"}
                </button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading ? <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 17 }}>Carregando...</div>
              : lista.length === 0 ? <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 17 }}>Nenhum carrinho {aba === "aberto" ? "aberto" : aba === "fechado" ? "fechado" : "na lixeira"}.</div>
              : lista.map((c) => {
                const dias = diasRestantes(c.expira_em);
                return (
                  <button key={c.id} onClick={() => abrir(c.id, c)} style={{ display: "block", width: "100%", textAlign: "left", padding: "15px 20px", border: "none", borderBottom: "1px solid #f3f5f8", background: sel?.carrinho.id === c.id ? "#fff7ed" : "transparent", cursor: "pointer" }}>
                    <div style={{ fontSize: 19, fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.nome || "Carrinho"}</div>
                    <div style={{ fontSize: 16, color: "#64748b", marginTop: 3 }}>{c.cliente || "sem cliente"}{c.modelo ? ` · ${c.modelo}` : ""}</div>
                    <div style={{ fontSize: 15, color: "#94a3b8", marginTop: 4, display: "flex", gap: 8 }}>
                      <span>{c.total_itens || 0} peça(s)</span>
                      {aba === "aberto" && dias !== null && <span style={{ color: dias <= 2 ? "#dc2626" : "#94a3b8" }}>· {dias > 0 ? `${dias}d p/ fechar` : "expira hoje"}</span>}
                    </div>
                  </button>
                );
              })}
          </div>
        </div>

        {/* Detalhe */}
        <div style={{ flex: 1, display: (isMobile && !sel) ? "none" : "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 10 : 14, padding: isMobile ? "12px 14px" : "16px 22px", borderBottom: "1px solid #eef0f3" }}>
            {isMobile ? (
              // No celular o botão volta pra LISTA de carrinhos (não pro catálogo).
              <button onClick={() => setSel(null)} title="Voltar aos carrinhos"
                style={{ display: "flex", alignItems: "center", gap: 8, border: "1.5px solid #dc2626", background: "#fff5f5", color: "#dc2626", borderRadius: 10, padding: "9px 14px", fontSize: 14, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
                <i className="fas fa-arrow-left" style={{ fontSize: 13 }} /> Voltar
              </button>
            ) : (
              <button onClick={onClose} title="Voltar pro catálogo"
                style={{ display: "flex", alignItems: "center", gap: 8, border: "1.5px solid #EA580C", background: "#FFF7ED", color: "#EA580C", borderRadius: 10, padding: "10px 14px", cursor: "pointer", flexShrink: 0 }}>
                <i className="fas fa-arrow-left" style={{ fontSize: 13 }} />
                <i className="fas fa-home" style={{ fontSize: 17 }} />
              </button>
            )}
            <div style={{ flex: 1, minWidth: 0, fontSize: isMobile ? 17 : 22, fontWeight: isMobile ? 700 : 400, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sel ? (sel.carrinho.nome || "Carrinho") : "Selecione um carrinho"}</div>
            <button onClick={onClose} title="Fechar" style={{ width: 38, height: 38, borderRadius: 9, border: "none", background: "#f1f5f9", color: "#64748b", cursor: "pointer", fontSize: 18, flexShrink: 0 }}><i className="fas fa-times" /></button>
          </div>

          {/* Abas do detalhe */}
          {sel && (
            <div style={{ display: "flex", gap: 4, padding: isMobile ? "0 10px" : "0 22px", borderBottom: "2px solid #eef0f3", overflowX: isMobile ? "auto" : undefined, WebkitOverflowScrolling: "touch" }}>
              {([["pecas", "fa-boxes", `Lista de peças${sel.itens.length ? ` (${sel.itens.length})` : ""}`],
                 ["documento", "fa-file-invoice", "Incluir ou Criar Pedido"],
                 ["historico", "fa-clock-rotate-left", "Histórico"]] as const).map(([k, ic, lb]) => (
                <button key={k} onClick={() => setAbaDet(k as typeof abaDet)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: isMobile ? "12px 12px" : "13px 18px", border: "none", background: "transparent", cursor: "pointer", fontSize: isMobile ? 14 : 16, fontWeight: abaDet === k ? 600 : 400, whiteSpace: "nowrap", flexShrink: 0,
                    color: abaDet === k ? "#dc2626" : "#64748b", borderBottom: `3px solid ${abaDet === k ? "#dc2626" : "transparent"}`, marginBottom: -2 }}>
                  <i className={`fas ${ic}`} /> {lb}
                </button>
              ))}
            </div>
          )}

          {abrindo ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 18, gap: 10 }}><i className="fas fa-spinner fa-spin" /> Carregando…</div>
          ) : !sel ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#cbd5e1", fontSize: 18 }}>Escolha um carrinho à esquerda.</div>
          ) : (
            <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? 14 : 22 }}>
              {abaDet === "pecas" && (<>
              {/* Metadados editáveis */}
              {/* Em LISTA (um campo por linha); Trator/modelo e Serviço ficam ocultos
                  aqui — continuam editáveis na aba "Dados e ações". */}
              {editForm && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14, maxWidth: 760 }}>
                  {([["nome", "Nome do carrinho"], ["cliente", "Cliente"]] as const).map(([k, lab]) => (
                    <label key={k} style={{ fontSize: 15, color: "#64748b" }}>
                      {lab}
                      <input value={editForm[k]} onChange={(e) => setEditForm({ ...editForm, [k]: e.target.value })}
                        style={{ width: "100%", marginTop: 5, padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 17, outline: "none", boxSizing: "border-box" }} />
                    </label>
                  ))}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={salvarEdicao} style={{ padding: "10px 18px", borderRadius: 9, border: "none", background: "#dc2626", color: "#fff", fontSize: 16, fontWeight: 600, cursor: "pointer" }}>Salvar dados</button>
                    {onEditarPecas && sel.carrinho.status === "aberto" && (
                      <button onClick={() => onEditarPecas(sel.carrinho)} style={{ padding: "10px 18px", borderRadius: 9, border: "1px solid #e2e8f0", background: "#fff", color: "#334155", fontSize: 16, fontWeight: 600, cursor: "pointer" }}>
                        <i className="fas fa-plus" /> Adicionar peças pelo catálogo
                      </button>
                    )}
                  </div>
                </div>
              )}
              </>)}

              {abaDet === "pecas" && (<>
              {/* Itens */}
              <div style={{ fontSize: 17, fontWeight: 700, color: "#dc2626", margin: "8px 0 10px" }}>Peças ({sel.itens.length})</div>
              <div style={{ border: "1px solid #eef0f3", borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
                {sel.itens.length === 0 ? <div style={{ padding: 18, textAlign: "center", color: "#94a3b8", fontSize: 17 }}>Sem peças ainda.</div>
                  : sel.itens.map((it) => (
                    <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: "1px solid #f5f7fa" }}>
                      <code style={{ fontSize: 17, fontWeight: 700, color: "#dc2626", width: 150 }}>{it.codigo}</code>
                      <span style={{ flex: 1, fontSize: 17, color: "#0f172a", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.descricao}</span>
                      {!it.cadastrado && (
                        <button onClick={() => { setCriarProd(it); setProdPreco("0.00"); }}
                          title="Peça ainda NÃO cadastrada no Omie — entra sem preço no PPV/orçamento. Clique pra criar o produto agora (manual, provisório)."
                          style={{ border: "none", background: "transparent", color: "#f59e0b", cursor: "pointer", fontSize: 18, padding: 2, flexShrink: 0 }}>
                          <i className="fas fa-triangle-exclamation" />
                        </button>
                      )}
                      <span style={{ fontSize: 15, color: "#64748b", width: 34, textAlign: "center" }}>{it.qtd}x</span>
                      <button onClick={() => removerItem(it)} title="Remover" style={{ border: "none", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 15 }}><i className="fas fa-trash" /></button>
                    </div>
                  ))}
              </div>

              {/* Exportar pro Zeitten — discreto, numa linha só (instruções no tooltip) */}
              {sel.itens.length > 0 && zeittenUrl(sel.carrinho.marca) && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0 16px", fontSize: 14, color: "#64748b", flexWrap: "wrap" }}>
                  <i className="fas fa-arrow-up-right-from-square" style={{ color: "#94a3b8", fontSize: 13 }} />
                  <span>Zeitten ({sel.carrinho.marca}):</span>
                  <button onClick={() => baixarPlanilhaZeitten(true)}
                    title="Baixa a planilha com as peças e abre o Zeitten. Lá: Realizar Pedido Rápido → arraste o arquivo na área pontilhada → Adicionar ao carrinho."
                    style={{ border: "none", background: "transparent", color: "#0f172a", fontSize: 14, fontWeight: 600, cursor: "pointer", textDecoration: "underline", padding: 0 }}>
                    {copiadoZeitten ? "Planilha baixada!" : "Baixar planilha e abrir"}
                  </button>
                  <span style={{ color: "#cbd5e1" }}>·</span>
                  <button onClick={() => baixarPlanilhaZeitten(false)} title="Só baixar a planilha (sem abrir o Zeitten)"
                    style={{ border: "none", background: "transparent", color: "#64748b", fontSize: 14, fontWeight: 600, cursor: "pointer", textDecoration: "underline", padding: 0 }}>
                    Só baixar
                  </button>
                </div>
              )}
              </>)}

              {abaDet === "documento" && (<>
              {/* Adicionar as peças num documento ABERTO — sem cliente, sem "gerar novo" */}
              {sel.carrinho.status === "aberto" && (
                <div style={{ marginBottom: 18, border: "1px solid #eef0f3", borderRadius: 10, padding: "14px 16px" }}>
                  {/* Modo + tipo — controles compactos, sem cartões gigantes */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
                    <div style={{ display: "inline-flex", border: "1px solid #e2e8f0", borderRadius: 9, overflow: "hidden" }}>
                      {([["incluir", "Incluir em aberto"], ["novo", "Criar novo"]] as const).map(([m, lb]) => (
                        <button key={m} onClick={() => { setDocMode(m); setMsg(""); }}
                          style={{ padding: "8px 16px", border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer", background: docMode === m ? "#EA580C" : "#fff", color: docMode === m ? "#fff" : "#64748b" }}>
                          {lb}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: "inline-flex", gap: 6 }}>
                      {([["ppv", "fa-box", "Pré-Pedido de Venda"], ["orcamento", "fa-file-invoice", "Orçamento"]] as const).map(([tp, ic, lab]) => {
                        const on = incluirTipo === tp;
                        return (
                          <button key={tp} onClick={() => { setIncluirTipo(tp as "ppv" | "orcamento"); setMsg(""); }}
                            style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 9, cursor: "pointer", fontSize: 14, fontWeight: 600,
                              border: `1.5px solid ${on ? "#EA580C" : "#e2e8f0"}`, background: on ? "#FFF7ED" : "#fff", color: on ? "#EA580C" : "#64748b" }}>
                            <i className={`fas ${ic}`} style={{ fontSize: 12 }} /> {lab}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {temNaoCadastrado && (
                    <div style={{ fontSize: 14.5, color: "#b45309", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 12px", marginBottom: 12, lineHeight: 1.5 }}>
                      <i className="fas fa-circle-info" style={{ marginRight: 7 }} />
                      Estas peças ainda <b>não existem no Omie</b> e vão entrar <b>sem preço</b> (ajuste depois no documento):{" "}
                      <b style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>{sel.itens.filter((i) => !i.cadastrado).map((i) => i.codigo).join(", ")}</b>
                    </div>
                  )}
                  {docMode === "incluir" ? (
                    <>
                      {/* Documentos ABERTOS do tipo escolhido — clicar já inclui as peças (novo item) */}
                      <input value={docQ} onChange={(e) => setDocQ(e.target.value)} placeholder={incluirTipo === "ppv" ? "Buscar PPV aberto (ID ou cliente)…" : "Buscar orçamento aberto (nº ou cliente)…"} style={{ width: "100%", padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 15, marginBottom: 10, boxSizing: "border-box", outline: "none" }} />
                      <div style={{ border: "1px solid #eef0f3", borderRadius: 8, maxHeight: 280, overflowY: "auto" }}>
                        {docRes.length === 0 ? <div style={{ padding: 16, textAlign: "center", color: "#94a3b8", fontSize: 15 }}>Nenhum {incluirTipo === "ppv" ? "PPV" : "orçamento"} aberto encontrado.</div>
                          : docRes.map((d) => (
                            <button key={d.id} onClick={() => (incluirTipo === "ppv" ? abrirPpvModal(d) : incluirEm(d.id))} disabled={incluindo}
                              title={incluirTipo === "ppv" ? "Abrir o pedido pra incluir as peças (Novo Item)" : "Incluir as peças do carrinho neste orçamento"}
                              style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "11px 14px", border: "none", borderBottom: "1px solid #f5f7fa", background: "transparent", cursor: incluindo ? "wait" : "pointer" }}>
                              <span style={{ fontSize: 15, fontWeight: 700, color: "#EA580C", minWidth: 90 }}>{d.label}</span>
                              <span style={{ flex: 1, fontSize: 15, color: "#475569", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.sub}</span>
                              <span style={{ fontSize: 12.5, fontWeight: 700, color: "#16a34a", whiteSpace: "nowrap" }}><i className={`fas ${incluirTipo === "ppv" ? "fa-up-right-from-square" : "fa-plus"}`} /> {incluirTipo === "ppv" ? "Novo item" : "Incluir"}</span>
                            </button>
                          ))}
                      </div>
                    </>
                  ) : (
                    <>
                      {/* CRIAR NOVO do zero: cliente (busca) + técnico + criar */}
                      <div style={{ position: "relative", marginBottom: 8 }}>
                        {cliSel ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", border: "1px solid #e2e8f0", borderRadius: 8 }}>
                            <i className="fas fa-user" style={{ color: "#EA580C", fontSize: 13 }} />
                            <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>{cliSel.nome}</span>
                            <button onClick={() => { setCliSel(null); setCliQ(""); }} style={{ border: "none", background: "transparent", color: "#94a3b8", cursor: "pointer" }}><i className="fas fa-times" /></button>
                          </div>
                        ) : (
                          <>
                            <input value={cliQ} onChange={(e) => setCliQ(e.target.value)} placeholder="Buscar cliente (nome ou CNPJ)…" style={{ width: "100%", padding: "9px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 15, boxSizing: "border-box", outline: "none" }} />
                            {cliRes.length > 0 && (
                              <div style={{ position: "absolute", left: 0, right: 0, top: "calc(100% + 4px)", zIndex: 20, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", maxHeight: 220, overflowY: "auto" }}>
                                {cliRes.slice(0, 30).map((c, i) => (
                                  <button key={i} onClick={() => { setCliSel(c); setCliRes([]); setCliQ(""); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", border: "none", borderBottom: "1px solid #f5f7fa", background: "transparent", cursor: "pointer", fontSize: 14 }}>
                                    <div style={{ fontWeight: 600, color: "#0f172a" }}>{c.nome}</div>
                                    {(c.documento || c.cidade) && <div style={{ fontSize: 12.5, color: "#94a3b8" }}>{c.documento}{c.cidade ? ` · ${c.cidade}` : ""}</div>}
                                  </button>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                      <select value={tecnicoSel} onChange={(e) => setTecnicoSel(e.target.value)} style={{ width: "100%", padding: "9px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 15, marginBottom: 8, outline: "none", background: "#fff", cursor: "pointer" }}>
                        <option value="">Técnico (obrigatório para PPV)…</option>
                        {tecnicos.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <button disabled={gerando || sel.itens.length === 0 || !cliSel || (incluirTipo === "ppv" && !tecnicoSel)}
                        onClick={() => gerar(incluirTipo)}
                        style={{ padding: "10px 20px", borderRadius: 9, border: "none", background: "#EA580C", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", opacity: gerando || sel.itens.length === 0 || !cliSel ? 0.5 : 1 }}>
                        <i className="fas fa-check" style={{ marginRight: 7 }} />
                        {gerando ? "Criando…" : `Criar ${incluirTipo === "ppv" ? "Pré-Pedido de Venda" : "orçamento"}`}
                      </button>
                    </>
                  )}
                  <div style={{ fontSize: 13.5, color: "#94a3b8", marginTop: 10, textAlign: "center" }}>Os preços são puxados do Omie ao {docMode === "incluir" ? "incluir no" : "criar o"} documento.</div>
                  {msg && <div style={{ marginTop: 12, fontSize: 15, color: msg.startsWith("Erro") ? "#dc2626" : "#166534", background: msg.startsWith("Erro") ? "#fef2f2" : "#f0fdf4", padding: "10px 12px", borderRadius: 8 }}>{msg}</div>}
                </div>
              )}
              </>)}

              {abaDet === "pecas" && (<>
              {/* Ações do carrinho */}
              <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
                {sel.carrinho.status === "lixeira" ? (
                  <>
                    <button onClick={() => mudarStatus("aberto")} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #bbf7d0", background: "#f0fdf4", color: "#166534", fontSize: 16, fontWeight: 600, cursor: "pointer" }}><i className="fas fa-rotate-left" /> Restaurar</button>
                    <button onClick={excluirDefinitivo} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #fecaca", background: "#fff", color: "#dc2626", fontSize: 16, fontWeight: 600, cursor: "pointer" }}><i className="fas fa-trash" /> Excluir definitivamente</button>
                  </>
                ) : (
                  <>
                    {sel.carrinho.status === "aberto"
                      ? <button onClick={() => mudarStatus("fechado")} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#475569", fontSize: 16, fontWeight: 600, cursor: "pointer" }}><i className="fas fa-circle-check" /> Finalizar</button>
                      : <button onClick={() => mudarStatus("aberto")} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#475569", fontSize: 16, fontWeight: 600, cursor: "pointer" }}><i className="fas fa-box-open" /> Reabrir</button>}
                    {sel.carrinho.status === "aberto" && <button onClick={compartilhar} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #bfdbfe", background: "#eff6ff", color: "#2563eb", fontSize: 16, fontWeight: 600, cursor: "pointer" }}><i className="fas fa-share-nodes" /> Compartilhar link</button>}
                    <button onClick={copiarCodigosCarrinho} title="Copiar os códigos das peças (um por linha)" style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: codsCopiados ? "#16a34a" : "#475569", fontSize: 16, fontWeight: 600, cursor: "pointer" }}><i className={`fas ${codsCopiados ? "fa-check" : "fa-copy"}`} /> {codsCopiados ? "Copiado!" : "Copiar códigos"}</button>
                    <button onClick={pdfCarrinhoSalvo} title="Baixar o carrinho em PDF" style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#475569", fontSize: 16, fontWeight: 600, cursor: "pointer" }}><i className="fas fa-file-pdf" style={{ color: "#EA580C" }} /> Baixar PDF</button>
                    <button onClick={excluir} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #fecaca", background: "#fff", color: "#dc2626", fontSize: 16, fontWeight: 600, cursor: "pointer" }}><i className="fas fa-trash" /> Excluir</button>
                  </>
                )}
              </div>
              {shareLink && (
                <div style={{ marginBottom: 18, border: "1px solid #bfdbfe", background: "#eff6ff", borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ fontSize: 15, color: "#1e40af", marginBottom: 6 }}>Envie este link — a pessoa vê só este carrinho e o catálogo do modelo, e pode adicionar/remover peças (registrado no histórico):</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input value={shareLink} readOnly onFocus={(e) => e.currentTarget.select()} style={{ flex: 1, padding: "8px 10px", border: "1px solid #bfdbfe", borderRadius: 8, fontSize: 15, background: "#fff", boxSizing: "border-box" }} />
                    <button onClick={copiarLink} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#2563eb", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>{copiado ? "Copiado!" : "Copiar"}</button>
                  </div>
                </div>
              )}
              </>)}

              {abaDet === "historico" && (<>
              {/* Histórico */}
              <div style={{ fontSize: 17, fontWeight: 700, color: "#dc2626", marginBottom: 10 }}>Histórico</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {sel.historico.map((h) => (
                  <div key={h.id} style={{ display: "flex", gap: 10, fontSize: 16, lineHeight: 1.5 }}>
                    <span style={{ color: "#94a3b8", whiteSpace: "nowrap" }}>{fmtData(h.quando)}</span>
                    <span style={{ color: "#334155" }}><b>{ACAO_LABEL[h.acao] || h.acao}</b>{h.detalhe ? ` — ${h.detalhe}` : ""} <span style={{ color: "#94a3b8" }}>por {h.quem || "—"}</span></span>
                  </div>
                ))}
              </div>
              </>)}
            </div>
          )}
        </div>
      </div>

      {/* Mini-modal: criar produto manual (provisório) */}
      {criarProd && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setCriarProd(null); }}
          style={{ position: "fixed", inset: 0, zIndex: 7000, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
          <div style={{ width: 420, maxWidth: "94vw", background: "#fff", borderRadius: 14, padding: 20, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>Criar produto (provisório)</div>
            <div style={{ fontSize: 15, color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 10px", margin: "8px 0 14px" }}>
              Peça não cadastrada no Omie — criando um <b>produto manual</b> provisório. Depois peça o cadastro oficial no Omie.
            </div>
            <label style={{ fontSize: 15, color: "#64748b" }}>Código
              <input value={criarProd.codigo} readOnly style={{ width: "100%", marginTop: 4, padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 15, background: "#f8fafc", boxSizing: "border-box" }} />
            </label>
            <label style={{ fontSize: 15, color: "#64748b", display: "block", marginTop: 10 }}>Descrição
              <input value={criarProd.descricao} onChange={(e) => setCriarProd({ ...criarProd, descricao: e.target.value })} style={{ width: "100%", marginTop: 4, padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 15, boxSizing: "border-box" }} />
            </label>
            <label style={{ fontSize: 15, color: "#64748b", display: "block", marginTop: 10 }}>Preço de venda (R$)
              <input type="number" step="0.01" value={prodPreco} onChange={(e) => setProdPreco(e.target.value)} style={{ width: "100%", marginTop: 4, padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 15, boxSizing: "border-box" }} />
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button onClick={() => setCriarProd(null)} style={{ padding: "9px 16px", borderRadius: 9, border: "1px solid #e2e8f0", background: "#fff", color: "#475569", fontSize: 16, fontWeight: 600, cursor: "pointer" }}>Cancelar</button>
              <button onClick={salvarProdutoManual} disabled={salvandoProd} style={{ padding: "9px 18px", borderRadius: 9, border: "none", background: "#dc2626", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", opacity: salvandoProd ? 0.6 : 1 }}>{salvandoProd ? "Salvando..." : "Criar produto"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal do PPV: Novo Item (busca) + peças já no pedido + peças do carrinho */}
      {ppvModal && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setPpvModal(null); }}
          style={{ position: "fixed", inset: 0, zIndex: 5200, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ width: 1060, maxWidth: "97vw", maxHeight: "92vh", background: "#fff", borderRadius: 16, boxShadow: "0 30px 70px rgba(0,0,0,0.4)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Cabeçalho: PPV + dados do cliente */}
            <div style={{ padding: "16px 22px", borderBottom: "1px solid #eef0f3", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 19, fontWeight: 700, color: "#0f172a" }}><i className="fas fa-box" style={{ color: "#EA580C", marginRight: 9 }} />{ppvModal.label}</div>
                {ppvCarregando ? (
                  <div style={{ fontSize: 14, color: "#94a3b8", marginTop: 4 }}><i className="fas fa-circle-notch fa-spin" style={{ marginRight: 6 }} /> Carregando dados do pedido…</div>
                ) : ppvDet && (
                  <div style={{ fontSize: 15, color: "#EA580C", marginTop: 5, display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
                    <span><b style={{ color: "#9A3412" }}>Cliente:</b> {ppvDet.cliente || "—"}{ppvDet.clienteDocumento ? ` · ${ppvDet.clienteDocumento}` : ""}</span>
                    <span><b style={{ color: "#9A3412" }}>Técnico:</b> {ppvDet.tecnico || "—"}</span>
                    <span><b style={{ color: "#9A3412" }}>Status:</b> {ppvDet.status || "—"}</span>
                    {ppvDet.projeto && <span><b style={{ color: "#9A3412" }}>Projeto:</b> {ppvDet.projeto}</span>}
                    {ppvDet.observacao && <span style={{ flexBasis: "100%" }}><b style={{ color: "#9A3412" }}>Observação:</b> {ppvDet.observacao}</span>}
                  </div>
                )}
              </div>
              <button onClick={() => setPpvModal(null)} style={{ border: "none", background: "#f1f5f9", borderRadius: 8, width: 36, height: 36, cursor: "pointer", color: "#475569", flexShrink: 0 }}><i className="fas fa-times" /></button>
            </div>

            <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 0 }}>
              {/* ESQUERDA: Novo Item (busca) + peças já no pedido */}
              <div style={{ flex: "1.2 1 0", minWidth: 0, padding: 18, overflowY: "auto", borderRight: "1px solid #eef0f3" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}><i className="fas fa-plus" style={{ color: "#EA580C", marginRight: 6 }} /> Novo item — buscar produto</div>
                <div style={{ position: "relative", marginBottom: 10 }}>
                  <i className="fas fa-search" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#EA580C", fontSize: 13 }} />
                  <input autoFocus value={prodQ} onChange={(e) => setProdQ(e.target.value)} placeholder="Código ou nome do produto (cole o código do carrinho aqui)…"
                    style={{ width: "100%", padding: "12px 12px 12px 36px", borderRadius: 10, border: "2px solid #FED7AA", fontSize: 15, boxSizing: "border-box", outline: "none" }} />
                </div>
                {prodQ.trim().length >= 2 && (
                  <div style={{ border: "1px solid #eef0f3", borderRadius: 10, marginBottom: 16, maxHeight: 240, overflowY: "auto" }}>
                    {prodBuscando ? (
                      <div style={{ padding: 18, textAlign: "center", color: "#94a3b8" }}><i className="fas fa-circle-notch fa-spin" style={{ marginRight: 8, color: "#EA580C" }} /> Buscando…</div>
                    ) : prodRes.length === 0 ? (
                      <div style={{ padding: 18, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>Nenhum produto encontrado.</div>
                    ) : prodRes.map((p, i) => (
                      <button key={`${p.codigo}-${i}`} onClick={() => addProdutoNoPpv(p)} disabled={addindo}
                        title="Clique pra incluir 1 no pedido (clicar de novo soma +1)"
                        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "10px 13px", border: "none", borderBottom: "1px solid #f5f7fa", background: addFlash === p.codigo ? "#ecfdf5" : "transparent", cursor: addindo ? "wait" : "pointer" }}>
                        <code style={{ fontSize: 16.5, fontWeight: 700, color: "#EA580C", fontFamily: "ui-monospace, Menlo, monospace", flexShrink: 0 }}>{p.codigo}</code>
                        <span style={{ flex: 1, fontSize: 14, color: "#334155", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.descricao}</span>
                        <span style={{ fontSize: 13.5, fontWeight: 600, color: "#475569", whiteSpace: "nowrap" }}>R$ {Number(p.preco || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                        {addFlash === p.codigo ? <span style={{ fontSize: 12, fontWeight: 700, color: "#16a34a", whiteSpace: "nowrap" }}><i className="fas fa-check" /> adicionado</span> : <i className="fas fa-plus" style={{ color: "#16a34a" }} />}
                      </button>
                    ))}
                  </div>
                )}

                <div style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6, margin: "6px 0 8px" }}><i className="fas fa-boxes" style={{ marginRight: 6 }} /> Já no pedido ({(ppvDet?.produtos || []).length})</div>
                <div style={{ border: "1px solid #eef0f3", borderRadius: 10, overflow: "hidden" }}>
                  {(ppvDet?.produtos || []).length === 0 ? (
                    <div style={{ padding: 16, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>{ppvCarregando ? "Carregando…" : "Nenhuma peça no pedido ainda."}</div>
                  ) : (ppvDet?.produtos || []).map((p) => (
                    <div key={p.codigo} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 13px", borderBottom: "1px solid #f5f7fa", background: addFlash === p.codigo ? "#ecfdf5" : "#fff" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#475569", background: "#f1f5f9", borderRadius: 6, padding: "2px 8px", flexShrink: 0 }}>{p.quantidade}×</span>
                      <code style={{ fontSize: 16, fontWeight: 700, color: "#EA580C", fontFamily: "ui-monospace, Menlo, monospace", flexShrink: 0 }}>{p.codigo}</code>
                      <span style={{ flex: 1, fontSize: 13.5, color: "#334155", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.descricao}</span>
                      <span style={{ fontSize: 13, color: "#64748b", whiteSpace: "nowrap" }}>R$ {Number(p.preco || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* DIREITA: peças do carrinho (copiar código ou incluir direto) */}
              <div style={{ flex: "1 1 0", minWidth: 0, padding: 18, overflowY: "auto", background: "#fafbfc" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}><i className="fas fa-cart-shopping" style={{ color: "#EA580C", marginRight: 6 }} /> Peças do carrinho ({sel?.itens.length || 0})</div>
                <div style={{ border: "1px solid #eef0f3", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
                  {(sel?.itens || []).map((i) => (
                    <div key={i.codigo} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid #f5f7fa", background: addFlash === i.codigo ? "#ecfdf5" : "#fff" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#475569", background: "#f1f5f9", borderRadius: 6, padding: "2px 8px", flexShrink: 0 }}>{i.qtd}×</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <code style={{ fontSize: 16.5, fontWeight: 700, color: "#EA580C", fontFamily: "ui-monospace, Menlo, monospace", display: "block" }}>{i.codigo}</code>
                        <span style={{ fontSize: 13, color: "#64748b", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.descricao}</span>
                      </div>
                      <button onClick={() => copiarCod(i.codigo)} title="Copiar o código (cole na busca ao lado)"
                        style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 8, border: `1px solid ${copiadoCod === i.codigo ? "#6EE7B7" : "#e2e8f0"}`, background: copiadoCod === i.codigo ? "#ECFDF5" : "#fff", color: copiadoCod === i.codigo ? "#059669" : "#475569", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                        <i className={`fas ${copiadoCod === i.codigo ? "fa-check" : "fa-copy"}`} /> {copiadoCod === i.codigo ? "Copiado" : "Copiar"}
                      </button>
                      <button onClick={() => addItemCarrinhoNoPpv(i)} disabled={addindo} title="Incluir esta peça direto no pedido"
                        style={{ width: 32, height: 32, border: "none", background: "#EA580C", color: "#fff", borderRadius: 8, cursor: addindo ? "wait" : "pointer", flexShrink: 0, fontSize: 13 }}><i className="fas fa-plus" /></button>
                    </div>
                  ))}
                </div>
                <button onClick={() => { if (ppvModal) incluirEm(ppvModal.id); }} disabled={incluindo || !sel || sel.itens.length === 0}
                  style={{ width: "100%", marginTop: 12, padding: "13px", borderRadius: 10, border: "none", background: "#EA580C", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", opacity: incluindo ? 0.6 : 1 }}>
                  {incluindo ? <><i className="fas fa-spinner fa-spin" /> Incluindo…</> : <><i className="fas fa-plus" /> Incluir TODAS as peças do carrinho</>}
                </button>
                {msg && <div style={{ marginTop: 10, fontSize: 14, color: msg.startsWith("Erro") ? "#dc2626" : "#166534", background: msg.startsWith("Erro") ? "#fef2f2" : "#f0fdf4", padding: "9px 11px", borderRadius: 8 }}>{msg}</div>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
