"use client";
import { useState, useEffect, useCallback, useRef, type CSSProperties, type MouseEvent as RMouseEvent } from "react";
import CarrinhosPanel from "./CarrinhosPanel";

interface Peca { id: number; code: string; name: string; reference: string; qtd: number | null; unit: string | null; compravel?: boolean; figura?: any; figura_id?: string; modelos?: string[] }

// Ícone + cor de cada sistema. O catálogo tem dezenas de nomes diferentes (e em
// caixa alta, conforme a marca), então casa por palavra-chave em vez de uma
// lista fixa — assim vale pra Mahindra, KUHN, Tatu, Ventura e Valtra igual.
function estiloSistema(nome: string): { icone: string; cor: string } {
  const n = (nome || "").toLowerCase();
  const tem = (...ks: string[]) => ks.some((k) => n.includes(k));
  if (tem("motor", "diesel", "combust", "injec", "injeç")) return { icone: "fa-gear", cor: "#dc2626" };
  if (tem("elétr", "eletr", "bateria", "farol", "chicote")) return { icone: "fa-bolt", cor: "#ca8a04" };
  if (tem("câmbio", "cambio", "transmiss", "tdp", "marcha")) return { icone: "fa-gears", cor: "#2563eb" };
  if (tem("hidrául", "hidraul", "bomba")) return { icone: "fa-oil-can", cor: "#7c3aed" };
  if (tem("freio")) return { icone: "fa-circle-stop", cor: "#be123c" };
  if (tem("direç", "direc", "volante", "coluna")) return { icone: "fa-arrows-left-right", cor: "#65a30d" };
  if (tem("eixo", "diferencial", "cardan", "rodagem", "roda", "pneu")) return { icone: "fa-life-ring", cor: "#0891b2" };
  if (tem("lataria", "cabina", "cabine", "capô", "capo", "chassis", "assento", "toldo")) return { icone: "fa-car-side", cor: "#0d9488" };
  if (tem("ferramenta", "adesivo", "etiqueta")) return { icone: "fa-screwdriver-wrench", cor: "#9333ea" };
  if (tem("embreagem")) return { icone: "fa-compact-disc", cor: "#c2410c" };
  if (tem("refrig", "radiador", "arrefec")) return { icone: "fa-snowflake", cor: "#0369a1" };
  if (tem("pneumát", "pneumat")) return { icone: "fa-wind", cor: "#0284c7" };
  return { icone: "fa-cube", cor: "#64748b" };
}
interface Figura { id: string; code: string; name: string; secao: string; thumb_url: string | null; image_url: string | null; hotspots?: { reference: string; x: number; y: number }[]; pecas?: Peca[] }
interface Secao { secao: string; ordem: number; figuras: number; thumb?: string | null }
const zoomBtn: CSSProperties = { width: 34, height: 34, borderRadius: 9, border: "1px solid #e2e8f0", background: "rgba(255,255,255,0.95)", color: "#334155", fontSize: 18, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.12)", lineHeight: 1 };
const fsBtn: CSSProperties = { padding: "8px 14px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 7 };
interface Modelo { slug: string; nome: string; image_url: string | null; figuras?: number; marca?: string | null; tipo?: string | null; familia?: string | null; manual_url?: string | null; manual_nome?: string | null }
interface Marca { slug: string; nome: string; logo_url: string | null; modelos: number; tipos: string[] }
// Linha de produto: agrupa as variantes num card só (ex.: PST DUO tem 62 variantes de chassi/versão).
interface Familia { nome: string; marca: string; tipo: string | null; image_url: string | null; variantes: Modelo[] }

// Mascote do assistente (mecânico Nova Tratores). Se não existir no storage, cai no ícone.

// Quando embutido no fluxo de adicionar peças, recebe onSelecionarPeca; senão, copia o código.
export default function CatalogoNovo({ onSelecionarPeca, userName, modeloInicialSlug, travado }: { onSelecionarPeca?: (p: { code: string; name: string }) => void; userName?: string; modeloInicialSlug?: string; travado?: boolean }) {
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [marcaSel, setMarcaSel] = useState<Marca | null>(null);
  const [tipoSel, setTipoSel] = useState<string>(""); // "" = todos os tipos
  const [familiaSel, setFamiliaSel] = useState<Familia | null>(null);
  const [modeloSel, setModeloSel] = useState<Modelo | null>(null);
  const [secoes, setSecoes] = useState<Secao[]>([]);
  const [secaoAtual, setSecaoAtual] = useState<string>("");
  const [figuras, setFiguras] = useState<Figura[]>([]);
  const [figura, setFigura] = useState<Figura | null>(null);
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<Peca[]>([]);
  const [loading, setLoading] = useState(false);
  const [refHover, setRefHover] = useState<string | null>(null);
  const [pecaSel, setPecaSel] = useState<Peca | null>(null); // peça aberta pela bolinha (painel sob a imagem)
  const [qtdSel, setQtdSel] = useState(1);
  const [imgDim, setImgDim] = useState<{ w: number; h: number }>({ w: 1, h: 1 });
  // Modo edição das bolinhas (só Ventura, temporário): arrastar posições e salvar
  const [editando, setEditando] = useState(false);
  const [hsEdit, setHsEdit] = useState<{ reference: string; x: number; y: number }[]>([]);
  const [arrastando, setArrastando] = useState<number | null>(null); // índice da bolinha a arrastar
  const [salvando, setSalvando] = useState(false);
  const imgBoxRef = useRef<HTMLDivElement | null>(null);
  const marcaAtual = modeloSel?.marca || marcaSel?.nome || "";
  const podeEditar = /ventura/i.test(marcaAtual);
  // Deep-link do catálogo (só standalone, não no drawer): a URL reflete a navegação.
  const urlInicialRef = useRef(typeof window !== "undefined" ? window.location.search : "");
  const [urlPronto, setUrlPronto] = useState(!!onSelecionarPeca); // embutido não sincroniza
  const [toast, setToast] = useState("");
  const [imgErro, setImgErro] = useState<Record<string, boolean>>({});
  // Carrinho (só no modo avulso — sem onSelecionarPeca)
  const [cart, setCart] = useState<{ code: string; name: string; qty: number }[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [cliQ, setCliQ] = useState("");
  const [cliRes, setCliRes] = useState<any[]>([]);
  const [cliSel, setCliSel] = useState<any | null>(null);
  const [criando, setCriando] = useState(false);
  // Carrinhos salvos (Fase 1)
  const [carrinhosOpen, setCarrinhosOpen] = useState(false);
  const [nomeCarrinho, setNomeCarrinho] = useState("");
  // Cliente do carrinho: já cadastrado (busca no Omie) ou avulso (digitado).
  const [cliModo, setCliModo] = useState<"cadastrado" | "novo">("cadastrado");
  const [cliNovo, setCliNovo] = useState("");
  // Nome do cliente que vale pro carrinho, venha da busca ou digitado.
  const clienteNome = cliModo === "novo" ? cliNovo.trim() : (cliSel?.nome || "");
  const [servicoCarrinho, setServicoCarrinho] = useState("");
  const [salvandoCarrinho, setSalvandoCarrinho] = useState(false);
  // Carrinho salvo "ativo": ao adicionar peças, grava direto nele (via API)
  const [carrinhoAtivo, setCarrinhoAtivo] = useState<{ id: string; nome: string } | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const leftPanelRef = useRef<HTMLDivElement | null>(null);
  const imgElRef = useRef<HTMLImageElement | null>(null);
  const pendingHighlight = useRef<string | null>(null);

  // Zoom + arrastar (pan) da imagem da figura.
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  // Menu de gerar PDF
  const [pdfMenu, setPdfMenu] = useState(false);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  // Diálogo de tamanho da imagem antes de imprimir (molde A4 com escala arrastável)
  const [printDlg, setPrintDlg] = useState<{ comPecas: boolean } | null>(null);
  const [printScale, setPrintScale] = useState(0.78); // fração da largura útil da folha (até 2.5x)
  const [printRot, setPrintRot] = useState(0);        // 0 / 90 / 180 / 270
  const [printPos, setPrintPos] = useState({ x: 0.5, y: 0.45 }); // centro da imagem (fração da folha)
  const a4Ref = useRef<HTMLDivElement | null>(null);
  const posDrag = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);
  // Tela cheia + desenho (caneta com cores) + zoom
  const [fullscreen, setFullscreen] = useState(false);
  // Tela cheia: alterna entre consultar peças (bolinhas) e desenhar com a caneta.
  const [fsModo, setFsModo] = useState<"pecas" | "caneta">("pecas");
  const [fsPeca, setFsPeca] = useState<Peca | null>(null);
  // Painel de peças recolhível: escondido, o desenho ganha a tela toda.
  const [painelAberto, setPainelAberto] = useState(false);
  // Dica piscando na aba das peças — some assim que o usuário abre a primeira vez.
  const [jaAbriuPainel, setJaAbriuPainel] = useState(false);
  const [fsZoom, setFsZoom] = useState(1);
  const [penColor, setPenColor] = useState("#dc2626");
  const [copiado, setCopiado] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fsImgRef = useRef<HTMLImageElement | null>(null);
  const desenhando = useRef(false);

  const CORES = ["#dc2626", "#2563eb", "#16a34a", "#f59e0b", "#7c3aed", "#000000", "#ffffff"];

  const ajustarCanvas = useCallback(() => {
    const img = fsImgRef.current, cv = canvasRef.current;
    if (!img || !cv) return;
    cv.width = img.clientWidth; cv.height = img.clientHeight;
  }, []);
  // Converte a posição do mouse para coordenadas do buffer do canvas (robusto ao zoom).
  const pontoCanvas = (e: RMouseEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current!;
    const r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (cv.width / r.width), y: (e.clientY - r.top) * (cv.height / r.height) };
  };
  const iniciarTraco = useCallback((e: RMouseEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    desenhando.current = true;
    const p = pontoCanvas(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }, []);
  const traco = useCallback((e: RMouseEvent<HTMLCanvasElement>) => {
    if (!desenhando.current) return;
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const p = pontoCanvas(e);
    ctx.strokeStyle = penColor; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }, [penColor]);
  const terminarTraco = useCallback(() => { desenhando.current = false; }, []);
  const limparDesenho = useCallback(() => {
    const cv = canvasRef.current; if (!cv) return;
    cv.getContext("2d")?.clearRect(0, 0, cv.width, cv.height);
  }, []);
  const copiarCodigo = useCallback((code: string) => {
    navigator.clipboard?.writeText(code).then(() => { setCopiado(code); setTimeout(() => setCopiado(null), 1400); }).catch(() => {});
  }, []);

  // Arrastar a imagem no molde A4 para posicioná-la na folha.
  const arrastarPos = useCallback((e: RMouseEvent<HTMLDivElement>) => {
    if (!posDrag.current || !a4Ref.current) return;
    const r = a4Ref.current.getBoundingClientRect();
    const d = posDrag.current;
    const nx = d.px + (e.clientX - d.mx) / r.width;
    const ny = d.py + (e.clientY - d.my) / r.height;
    setPrintPos({ x: Math.min(1, Math.max(0, nx)), y: Math.min(1, Math.max(0, ny)) });
  }, []);

  // Reseta os ajustes de impressão sempre que o diálogo abre.
  useEffect(() => {
    if (printDlg) { setPrintScale(0.78); setPrintRot(0); setPrintPos({ x: 0.5, y: 0.45 }); }
  }, [printDlg]);

  // PDF do desenho feito na tela cheia (imagem + traços da caneta).
  const gerarPdfDesenho = useCallback(async (acao: "imprimir" | "baixar") => {
    if (!figura?.image_url) return;
    setGerandoPdf(true);
    try {
      const resp = await fetch(figura.image_url);
      const blob = await resp.blob();
      const baseUrl: string = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.onerror = rej; fr.readAsDataURL(blob); });
      const baseImg = new Image();
      baseImg.src = baseUrl;
      await baseImg.decode();
      const W = imgDim.w || baseImg.naturalWidth || 1, H = imgDim.h || baseImg.naturalHeight || 1;
      const tmp = document.createElement("canvas");
      tmp.width = W; tmp.height = H;
      const tctx = tmp.getContext("2d");
      if (!tctx) throw new Error("sem contexto");
      tctx.drawImage(baseImg, 0, 0, W, H);
      if (canvasRef.current && canvasRef.current.width > 0) tctx.drawImage(canvasRef.current, 0, 0, W, H);
      const dataUrl = tmp.toDataURL("image/png");
      const { default: JsPDF } = await import("jspdf");
      const doc = new JsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 10;
      const maxW = pageW - margin * 2;
      const ratio = H / W;
      let iw = maxW; let ih = iw * ratio;
      const maxH = pageH - margin * 2;
      if (ih > maxH) { ih = maxH; iw = ih / ratio; }
      doc.addImage(dataUrl, "PNG", margin + (maxW - iw) / 2, margin, iw, ih);
      const nome = `${(figura.code || "figura").replace(/[^\w.-]+/g, "_")}-desenho.pdf`;
      if (acao === "imprimir") { doc.autoPrint(); const u = doc.output("bloburl"); const w = window.open(u, "_blank"); if (!w) { doc.save(nome); setToast("Pop-up bloqueado — baixei o PDF."); setTimeout(() => setToast(""), 2500); } }
      else doc.save(nome);
    } catch { setToast("Erro ao gerar o PDF."); setTimeout(() => setToast(""), 2000); }
    setGerandoPdf(false);
  }, [figura, imgDim]);

  // Auto-scroll: leva a linha da peça `ref` para o centro do painel DIREITO (lista),
  // scrollando só esse container (nunca a página/modal). Usado ao passar o mouse
  // numa bolinha ou ao clicar nela. Vale para todos os catálogos (é o mesmo componente).
  const scrollParaRef = useCallback((ref: string) => {
    const cont = listScrollRef.current;
    const row = rowRefs.current[ref];
    if (!cont || !row) return;
    const cRect = cont.getBoundingClientRect();
    const rRect = row.getBoundingClientRect();
    const delta = (rRect.top - cRect.top) - (cont.clientHeight / 2 - row.clientHeight / 2);
    cont.scrollTo({ top: cont.scrollTop + delta, behavior: "smooth" });
  }, []);

  // Reseta zoom/pan sempre que abre outra figura.
  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }); setPdfMenu(false); }, [figura?.id]);

  // Roda do mouse: Ctrl (ou ⌘) = zoom; sem modificador = rolar a página normalmente.
  useEffect(() => {
    const el = imgBoxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (editando) return;
      if (!e.ctrlKey && !e.metaKey) return; // deixa rolar (scroll) o painel
      e.preventDefault();
      const fator = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      setZoom((z) => {
        const nz = Math.min(6, Math.max(1, z * fator));
        if (nz === 1) setPan({ x: 0, y: 0 });
        return nz;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [editando, figura?.id]);

  // Gera PDF da figura (com ou sem a lista de peças da direita).
  // acao: "imprimir" abre na máquina de impressão; "baixar" só faz download.
  // opts: scale (largura da imagem / largura útil), rot (0/90/180/270), pos (centro em fração da folha).
  const gerarPdf = useCallback(async (comPecas: boolean, acao: "imprimir" | "baixar",
    opts: { scale?: number; rot?: number; pos?: { x: number; y: number } } = {}) => {
    if (!figura?.image_url) return;
    const scale = Math.min(2.5, Math.max(0.1, opts.scale ?? 0.78));
    const rot = ((opts.rot ?? 0) % 360 + 360) % 360;
    const pos = opts.pos ?? { x: 0.5, y: 0.45 };
    setGerandoPdf(true);
    try {
      const [{ default: JsPDF }, autoMod] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
      const autoTable = ((autoMod as unknown) as { default: (doc: unknown, opts: unknown) => void }).default;
      const resp = await fetch(figura.image_url);
      const blob = await resp.blob();
      const dataUrl: string = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.onerror = rej; fr.readAsDataURL(blob); });

      const im = new Image(); im.src = dataUrl; await im.decode();
      const ratio = (im.naturalHeight || 1) / (im.naturalWidth || 1);

      const doc = new JsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const K = 0.88; // mesma fração usada no molde da prévia (largura útil / folha)

      // Compõe a FOLHA A4 inteira numa canvas — o que aparece no molde é exatamente o que sai.
      const CW = 2000, CH = Math.round(CW * pageH / pageW);
      const cv = document.createElement("canvas"); cv.width = CW; cv.height = CH;
      const ctx = cv.getContext("2d");
      if (!ctx) throw new Error("sem contexto");
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, CW, CH);
      ctx.textBaseline = "top"; ctx.fillStyle = "#1e1e1e"; ctx.font = "700 32px Arial, sans-serif";
      ctx.fillText(`${figura.code || ""}  ${figura.name || ""}`.trim(), CW * 0.05, CH * 0.02);
      if (modeloSel?.nome) { ctx.fillStyle = "#777"; ctx.font = "22px Arial, sans-serif"; ctx.fillText(String(modeloSel.nome), CW * 0.05, CH * 0.042); }
      const iw = CW * K * scale, ih = iw * ratio;
      ctx.save(); ctx.translate(pos.x * CW, pos.y * CH); ctx.rotate((rot * Math.PI) / 180); ctx.drawImage(im, -iw / 2, -ih / 2, iw, ih); ctx.restore();
      doc.addImage(cv.toDataURL("image/png"), "PNG", 0, 0, pageW, pageH);

      if (comPecas) {
        const rows = (figura.pecas || []).map((p) => [p.reference, p.code, p.name, `${p.qtd ?? ""} ${p.unit ?? ""}`.trim()]);
        const iwmm = pageW * K * scale, ihmm = iwmm * ratio;
        const bboxH = (rot === 90 || rot === 270) ? iwmm : ihmm;
        const startY = Math.max(30, Math.min(pos.y * pageH + bboxH / 2 + 5, pageH - 40));
        autoTable(doc, { startY, head: [["Ref", "Código", "Nome", "Qtd"]], body: rows, styles: { fontSize: 8, cellPadding: 1.5 }, headStyles: { fillColor: [220, 38, 38] }, margin: { left: 12, right: 12 } });
      }
      const nome = `${(figura.code || "figura").replace(/[^\w.-]+/g, "_")}.pdf`;
      if (acao === "imprimir") {
        doc.autoPrint();
        const url = doc.output("bloburl");
        const w = window.open(url, "_blank");
        if (!w) { doc.save(nome); setToast("Pop-up bloqueado — baixei o PDF."); setTimeout(() => setToast(""), 2500); }
      } else {
        doc.save(nome);
      }
    } catch {
      setToast("Erro ao gerar o PDF."); setTimeout(() => setToast(""), 2000);
    }
    setGerandoPdf(false);
    setPdfMenu(false);
  }, [figura, modeloSel]);

  const addToCart = useCallback((p: { code: string; name: string }, qty = 1) => {
    // Carrinho salvo ativo → grava direto nele (persistido).
    if (carrinhoAtivo) {
      fetch(`/api/carrinhos/${carrinhoAtivo.id}/itens`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codigo: p.code, descricao: p.name, qtd: qty, quem: userName || "" }) }).catch(() => {});
      setToast(`Adicionado a "${carrinhoAtivo.nome}": ${p.code}`); setTimeout(() => setToast(""), 1500);
      return;
    }
    setCart((prev) => {
      const i = prev.findIndex((x) => x.code === p.code);
      if (i >= 0) { const c = [...prev]; c[i] = { ...c[i], qty: c[i].qty + qty }; return c; }
      return [...prev, { code: p.code, name: p.name, qty }];
    });
    setToast(`No carrinho: ${qty > 1 ? `${qty}× ` : ""}${p.code}`); setTimeout(() => setToast(""), 1400);
  }, [carrinhoAtivo, userName]);

  // Salva o carrinho em memória como um carrinho persistido novo.
  const salvarCarrinho = useCallback(async () => {
    if (cart.length === 0) { setToast("Carrinho vazio."); setTimeout(() => setToast(""), 1600); return; }
    setSalvandoCarrinho(true);
    try {
      const r = await fetch("/api/carrinhos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // O nome do cliente entra no nome do carrinho: é assim que se acha
          // depois na lista ("Revisão 6060 P2 — João da Silva").
          nome: [nomeCarrinho.trim() || (modeloSel?.nome ? `Carrinho ${modeloSel.nome}` : "Carrinho"), clienteNome]
            .filter(Boolean).join(" — "),
          cliente: clienteNome, modelo: modeloSel?.nome || "", modelo_slug: modeloSel?.slug || "",
          servico: servicoCarrinho.trim(), criadoPor: userName || "",
          itens: cart.map((c) => ({ codigo: c.code, descricao: c.name, qtd: c.qty })),
        }),
      });
      if (r.ok) {
        setToast("Carrinho salvo!"); setTimeout(() => setToast(""), 1800);
        setCart([]); setNomeCarrinho(""); setServicoCarrinho(""); setCartOpen(false);
      } else setToast("Erro ao salvar carrinho.");
    } catch { setToast("Erro de conexão."); }
    setSalvandoCarrinho(false);
    setTimeout(() => setToast(""), 2000);
  }, [cart, nomeCarrinho, servicoCarrinho, cliSel, modeloSel, userName]);
  const setQty = (code: string, q: number) => setCart((prev) => prev.map((x) => (x.code === code ? { ...x, qty: Math.max(1, q) } : x)));
  const removeFromCart = (code: string) => setCart((prev) => prev.filter((x) => x.code !== code));

  // busca de cliente (no carrinho)
  useEffect(() => {
    if (!cartOpen) return;
    const q = cliQ.trim();
    if (q.length < 2) { setCliRes([]); return; }
    const t = setTimeout(async () => { try { const r = await fetch(`/api/ppv/clientes?termo=${encodeURIComponent(q)}`); setCliRes(r.ok ? await r.json() : []); } catch { setCliRes([]); } }, 300);
    return () => clearTimeout(t);
  }, [cliQ, cartOpen]);

  const criarDoc = useCallback(async (tipoDoc: "ppv" | "orcamento") => {
    if (!cliSel) { setToast("Escolha o cliente."); setTimeout(() => setToast(""), 2200); return; }
    if (cart.length === 0) return;
    setCriando(true);
    try {
      const r = await fetch("/api/catalogo/criar-doc", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: tipoDoc, items: cart.map((c) => ({ codigo: c.code, descricao: c.name, quantidade: c.qty })), cliente: cliSel, userName: userName || "" }),
      });
      const j = await r.json();
      if (r.ok) {
        setToast(tipoDoc === "ppv" ? `PPV ${j.id || ""} criado!` : `Orçamento ${j.numero || ""} criado!`);
        setCart([]); setCliSel(null); setCliQ(""); setCartOpen(false);
      } else setToast(j.error || "Erro ao criar.");
    } catch { setToast("Erro de conexão."); }
    setCriando(false);
    setTimeout(() => setToast(""), 3500);
  }, [cliSel, cart, userName]);

  // Navegação: marcas → linhas de produto → variantes → sistemas → figura.
  // "sistemas" junta o que eram duas telas (lista de sistemas + figuras do
  // sistema): agora os sistemas ficam numa barra lateral fixa e as figuras
  // aparecem ao lado, sem precisar voltar pra trocar de sistema.
  const vista = busca.trim().length >= 2 ? "busca"
    : figura ? "figura"
    : modeloSel ? "sistemas"
    : familiaSel ? "variantes"
    : marcaSel ? "modelos"
    : "marcas";
  const mq = modeloSel ? `&modelo=${encodeURIComponent(modeloSel.nome)}` : "";

  useEffect(() => {
    fetch("/api/catalogo?acao=modelos").then((r) => r.json()).then((d) => {
      const lista: Modelo[] = Array.isArray(d) ? d : [];
      setModelos(lista);
    }).catch(() => {});
    fetch("/api/catalogo?acao=marcas").then((r) => r.json()).then((d) => {
      const lista: Marca[] = Array.isArray(d) ? d : [];
      setMarcas(lista);
      if (lista.length === 1) setMarcaSel(lista[0]); // uma marca só → entra direto
    }).catch(() => {});
  }, []);

  // Modelos irmãos ficam lado a lado: agrupa pela "família" (o texto antes do número —
  // ACCURA, STRONGER, GRAIN MAX…) e dentro dela ordena pelo número (1200 < 1600 < 12000).
  // Nos Mahindra, que começam por número, a família é vazia e vale o próprio número.
  const familia = (nome: string) => {
    let p = (nome.match(/^[^\d]*/) || [""])[0].trim().toUpperCase();
    // Nome sem número nenhum (STRONGER HD): tira o sufixo curto pra cair na mesma
    // linha do irmão numerado (STRONGER 3200 HD).
    if (!/\d/.test(nome)) p = p.replace(/\s+\S{1,3}$/, "");
    return p.replace(/[\s\-–/]+$/, "");
  };
  const ordenar = (lista: Modelo[]) =>
    [...lista].sort((a, b) => {
      const ta = a.tipo || "", tb = b.tipo || "";
      if (ta !== tb) return ta.localeCompare(tb, "pt");           // implementos juntos, autopropelidos juntos
      const fa = familia(a.nome), fb = familia(b.nome);
      if (fa !== fb) return fa.localeCompare(fb, "pt");
      return a.nome.localeCompare(b.nome, "pt", { numeric: true });
    });

  // Modelos da marca escolhida, respeitando o filtro de tipo
  const modelosDaMarca = modelos.filter((m) => m.marca === marcaSel?.nome);
  const tiposDaMarca = [...new Set(modelosDaMarca.map((m) => m.tipo).filter(Boolean))] as string[];
  const modelosVisiveis = ordenar(tipoSel ? modelosDaMarca.filter((m) => m.tipo === tipoSel) : modelosDaMarca);
  // Na tela inicial as marcas ficam abertas (modelos à mostra), com o filtro de tipo valendo pra todas.
  const tiposTodos = [...new Set(modelos.map((m) => m.tipo).filter(Boolean))].sort() as string[];
  const porTipo = (lista: Modelo[]) => (tipoSel ? lista.filter((m) => m.tipo === tipoSel) : lista);

  // Agrupa por LINHA DE PRODUTO (KAPINA CITRUS, ACCURA, PST DUO…): as versões ficam
  // dentro do card, não espalhadas pela tela. A linha vem da coluna "familia" quando
  // existir; senão é o prefixo do nome (o que vem antes do número — a mesma "família"
  // que já usamos pra ordenar). Modelo sozinho na linha mantém o nome completo no card.
  const agrupar = (lista: Modelo[]): Familia[] => {
    const mapa = new Map<string, Familia>();
    for (const m of ordenar(lista)) {
      const chave = (m.familia || familia(m.nome) || m.nome).trim().toUpperCase();
      if (!mapa.has(chave)) mapa.set(chave, { nome: m.familia || m.nome, marca: m.marca || "", tipo: m.tipo || null, image_url: null, variantes: [] });
      const f = mapa.get(chave)!;
      f.variantes.push(m);
      if (!f.image_url && m.image_url) f.image_url = m.image_url;
    }
    // Com mais de uma versão, o card passa a chamar-se pela linha (ex.: "KAPINA CITRUS").
    return [...mapa.values()].map((f) =>
      f.variantes.length > 1 && !f.variantes[0].familia
        ? { ...f, nome: familia(f.variantes[0].nome) || f.nome }
        : f
    );
  };

  // carrega seções do trator selecionado
  useEffect(() => {
    if (!modeloSel) { setSecoes([]); return; }
    fetch(`/api/catalogo?acao=secoes&modelo=${encodeURIComponent(modeloSel.nome)}`).then((r) => r.json()).then((d) => {
      const lista = Array.isArray(d) ? d : [];
      setSecoes(lista);
      // Com a barra lateral, a área da direita ficaria vazia esperando um clique:
      // já abre o 1º sistema.
      if (lista.length > 0) abrirSecao(lista[0].secao);
    }).catch(() => {});
    // abrirSecao é estável (useCallback com [mq]); incluir causaria refetch em loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modeloSel]);

  const abrirSecao = useCallback(async (s: string) => {
    setSecaoAtual(s); setFigura(null); setLoading(true);
    try {
      const r = await fetch(`/api/catalogo?acao=figuras&secao=${encodeURIComponent(s)}${mq}`);
      setFiguras(r.ok ? await r.json() : []);
    } catch { setFiguras([]); }
    setLoading(false);
  }, [mq]);

  const abrirFigura = useCallback(async (id: string) => {
    setLoading(true); setRefHover(null); setPecaSel(null); setEditando(false);
    try {
      const r = await fetch(`/api/catalogo/figura/${id}`);
      const f = r.ok ? await r.json() : null;
      setFigura(f);
      if (f && !secaoAtual) setSecaoAtual(f.secao);
    } catch { setFigura(null); }
    setLoading(false);
  }, [secaoAtual]);

  // Restaura a navegação a partir da URL (uma vez, quando marcas/modelos já carregaram).
  useEffect(() => {
    if (onSelecionarPeca || urlPronto) return;
    if (!marcas.length || !modelos.length) return;
    const p = new URLSearchParams(urlInicialRef.current);
    const q = p.get("q"), mc = p.get("marca"), mSlug = p.get("modelo"), sec = p.get("secao"), fig = p.get("fig");
    if (q && q.length >= 2) { setBusca(q); }
    else {
      if (mc) { const m = marcas.find((x) => x.slug === mc); if (m) setMarcaSel(m); }
      if (mSlug) {
        const m = modelos.find((x) => x.slug === mSlug);
        if (m) { setModeloSel(m); if (!mc) setMarcaSel(marcas.find((x) => x.nome === m.marca) || null); }
      }
      if (sec) setSecaoAtual(sec);
      if (fig) abrirFigura(fig);
    }
    setUrlPronto(true);
  }, [onSelecionarPeca, urlPronto, marcas, modelos, abrirFigura]);

  // Mantém a URL em sincronia com a navegação (marca › modelo › seção › figura › busca).
  useEffect(() => {
    if (onSelecionarPeca || !urlPronto) return;
    const p = new URLSearchParams();
    if (busca.trim().length >= 2) p.set("q", busca.trim());
    else {
      if (marcaSel) p.set("marca", marcaSel.slug);
      if (modeloSel) p.set("modelo", modeloSel.slug);
      if (secaoAtual) p.set("secao", secaoAtual);
      if (figura) p.set("fig", figura.id);
    }
    const qs = p.toString();
    const alvo = "/ppv/catalogo" + (qs ? "?" + qs : "");
    if (window.location.pathname + window.location.search !== alvo) {
      window.history.replaceState(null, "", alvo);
    }
  }, [onSelecionarPeca, urlPronto, busca, marcaSel, modeloSel, secaoAtual, figura]);

  // ---- Modo edição das bolinhas (Ventura) ----
  // Ao entrar, junta as bolinhas existentes com as peças SEM bolinha (estacionadas no topo,
  // em fila, para arrastar para o lugar). Posições em pixels da imagem (mesmo espaço dos hotspots).
  const iniciarEdicao = useCallback(() => {
    if (!figura) return;
    const existentes = new Map((figura.hotspots || []).map((h) => [h.reference, { reference: h.reference, x: h.x, y: h.y }]));
    const refs = [...new Set((figura.pecas || []).map((p) => p.reference))];
    const semBolinha = refs.filter((r) => !existentes.has(r));
    const W = imgDim.w || 1000;
    semBolinha.forEach((r, i) => {
      // estaciona numa fila no topo (a cada ~5% da largura), em pixels da imagem
      existentes.set(r, { reference: r, x: Math.round(W * 0.04 + (i % 18) * W * 0.05), y: Math.round((imgDim.h || 700) * (0.03 + Math.floor(i / 18) * 0.05)) });
    });
    setHsEdit([...existentes.values()]);
    setEditando(true); setPecaSel(null); setRefHover(null); setZoom(1); setPan({ x: 0, y: 0 });
  }, [figura, imgDim]);

  const moverBolinha = useCallback((clientX: number, clientY: number) => {
    if (arrastando == null || !imgBoxRef.current) return;
    const rect = imgBoxRef.current.getBoundingClientRect();
    const px = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * imgDim.w;
    const py = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)) * imgDim.h;
    setHsEdit((prev) => prev.map((h, i) => (i === arrastando ? { ...h, x: Math.round(px), y: Math.round(py) } : h)));
  }, [arrastando, imgDim]);

  const salvarHotspots = useCallback(async () => {
    if (!figura) return;
    setSalvando(true);
    try {
      const r = await fetch("/api/catalogo/hotspots", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ figuraId: figura.id, hotspots: hsEdit }),
      });
      if (r.ok) {
        setFigura((f) => (f ? { ...f, hotspots: hsEdit } : f));
        setEditando(false);
        setToast("Bolinhas salvas!"); setTimeout(() => setToast(""), 2000);
      } else setToast("Erro ao salvar.");
    } catch { setToast("Erro de conexão."); }
    setSalvando(false);
  }, [figura, hsEdit]);

  // busca (debounce) — dentro do trator selecionado
  useEffect(() => {
    const q = busca.trim();
    if (q.length < 2) { setResultados([]); return; }
    const t = setTimeout(async () => {
      try { const r = await fetch(`/api/catalogo?acao=busca&q=${encodeURIComponent(q)}${mq}`); setResultados(r.ok ? await r.json() : []); } catch { setResultados([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [busca, mq]);

  const addPeca = useCallback((p: { code: string; name: string }, qty = 1) => {
    if (onSelecionarPeca) {
      for (let i = 0; i < qty; i++) onSelecionarPeca(p); // o lançamento soma a linha repetida
      setToast(`Adicionado: ${qty > 1 ? `${qty}× ` : ""}${p.code}`); setTimeout(() => setToast(""), 2200);
    } else addToCart(p, qty); // modo avulso → carrinho
  }, [onSelecionarPeca, addToCart]);

  // Bolinha clicada → abre a peça no painel sob a imagem (e realça a linha da lista)
  const abrirPecaDaBolinha = useCallback((ref: string) => {
    const p = (figura?.pecas || []).find((x) => x.reference === ref) || null;
    setRefHover(ref);
    setPecaSel(p);
    setQtdSel(p?.qtd && p.qtd > 0 ? p.qtd : 1); // já vem com a quantidade que o desenho pede
    scrollParaRef(ref);
  }, [figura, scrollParaRef]);

  // Rola o painel da imagem (esquerda) para centralizar a bolinha `ref`.
  const scrollImagemParaRef = useCallback((ref: string) => {
    const h = (figura?.hotspots || []).find((x) => x.reference === ref);
    const panel = leftPanelRef.current, img = imgElRef.current;
    if (!h || !panel || !img) return;
    const pr = panel.getBoundingClientRect(), ir = img.getBoundingClientRect();
    const yFrac = h.y / (imgDim.h || 1);
    const alvo = panel.scrollTop + (ir.top - pr.top) + yFrac * ir.height - panel.clientHeight / 2;
    panel.scrollTo({ top: Math.max(0, alvo), behavior: "smooth" });
  }, [figura, imgDim.h]);

  // Clique numa peça da lista: destaca a bolinha na imagem. Se a peça não tiver
  // posição nesta figura, procura a mesma (mesmo código) em outra figura e vai pra lá.
  const selecionarPecaDaLista = useCallback(async (p: Peca) => {
    const temAqui = (figura?.hotspots || []).some((h) => h.reference === p.reference);
    if (temAqui) {
      setZoom(1); setPan({ x: 0, y: 0 });
      abrirPecaDaBolinha(p.reference);
      setTimeout(() => scrollImagemParaRef(p.reference), 80);
      return;
    }
    try {
      const r = await fetch(`/api/catalogo?acao=busca&q=${encodeURIComponent(p.code)}${mq}`);
      const res: { code?: string; reference: string; figura?: { id: string } | null }[] = r.ok ? await r.json() : [];
      const outra = res.find((x) => (x.code || "").toUpperCase() === (p.code || "").toUpperCase() && x.figura && x.figura.id !== figura?.id);
      if (outra?.figura) {
        pendingHighlight.current = outra.reference;
        await abrirFigura(outra.figura.id);
      } else {
        abrirPecaDaBolinha(p.reference);
        setToast("Peça sem posição no desenho."); setTimeout(() => setToast(""), 1600);
      }
    } catch { /* silencioso */ }
  }, [figura, mq, abrirPecaDaBolinha, scrollImagemParaRef, abrirFigura]);

  // Ao entrar noutra figura com destaque pendente (navegação entre figuras), realça a peça lá.
  useEffect(() => {
    if (!figura || !pendingHighlight.current) return;
    const ref = pendingHighlight.current;
    pendingHighlight.current = null;
    const p = (figura.pecas || []).find((x) => x.reference === ref) || null;
    setRefHover(ref); setPecaSel(p); setZoom(1); setPan({ x: 0, y: 0 });
    setTimeout(() => { scrollImagemParaRef(ref); scrollParaRef(ref); }, 140);
  }, [figura, scrollImagemParaRef, scrollParaRef]);

  const corSecao: Record<string, string> = { Motor: "#dc2626", "Transmissão": "#2563eb", "Sistema Hidráulico": "#7c3aed", "Eixo Dianteiro": "#0891b2", "Elétrica": "#ca8a04", Lataria: "#0d9488", Freio: "#be123c", Embreagem: "#9333ea", "Diferencial": "#0369a1", "Direção": "#65a30d" };

  const voltar = () => {
    if (figura) setFigura(null);
    // o sistema agora é uma seleção na barra lateral, não um nível: voltar do
    // modelo vai direto pra lista de modelos.
    else if (travado) return; // link público: trava no modelo
    else if (modeloSel) { setModeloSel(null); if (!familiaSel && marcas.length > 1) setMarcaSel(null); } // sem variantes → volta pra tela inicial
    else if (familiaSel) { setFamiliaSel(null); if (marcas.length > 1) setMarcaSel(null); }
    else if (marcaSel && marcas.length > 1) setMarcaSel(null);
  };
  const irParaMarcas = () => { if (travado) return; setMarcaSel(null); setTipoSel(""); setFamiliaSel(null); setModeloSel(null); setSecaoAtual(""); setFigura(null); };

  // Link público: pula direto pro modelo do carrinho.
  useEffect(() => {
    if (!modeloInicialSlug || modeloSel || !modelos.length) return;
    const m = modelos.find((x) => x.slug === modeloInicialSlug);
    if (m) { setModeloSel(m); setMarcaSel(marcas.find((x) => x.nome === m.marca) || null); }
  }, [modeloInicialSlug, modelos, marcas, modeloSel]);

  const abrirModelo = (m: Modelo) => {
    if (!marcaSel) setMarcaSel(marcas.find((mc) => mc.nome === m.marca) || null);
    setModeloSel(m); setSecaoAtual(""); setFigura(null);
  };

  // Linha com uma variante só abre direto no modelo; com várias, mostra a lista.
  const abrirFamilia = (f: Familia) => {
    if (!marcaSel) setMarcaSel(marcas.find((mc) => mc.nome === f.marca) || null);
    if (f.variantes.length === 1) { setModeloSel(f.variantes[0]); setSecaoAtual(""); setFigura(null); return; }
    setFamiliaSel(f);
  };

  const cardFamilia = (f: Familia) => {
    const n = f.variantes.length;
    const figuras = f.variantes.reduce((a, m) => a + (m.figuras || 0), 0);
    const temManual = f.variantes.some((m) => m.manual_url);
    return (
      <button key={f.nome} className="cat-card" onClick={() => abrirFamilia(f)} style={{ padding: 0, borderRadius: 14, border: "1px solid #e9ecf1", background: "#fff", cursor: "pointer", overflow: "hidden", textAlign: "left" }}>
        <div style={{ height: 240, background: "linear-gradient(180deg,#fbfcfe,#eef2f7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 14, position: "relative" }}>
          {f.tipo && <span style={{ position: "absolute", top: 10, left: 10, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: .6, padding: "3px 9px", borderRadius: 999, background: "#0f172a", color: "#fff", opacity: .82 }}>{f.tipo}</span>}
          {temManual && <span title="Tem manual de instrução" style={{ position: "absolute", top: 10, right: 10, width: 24, height: 24, borderRadius: 7, background: "#dc2626", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}><i className="fas fa-book" /></span>}
          {n > 1 && <span style={{ position: "absolute", bottom: 10, right: 10, fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 999, background: "#fff", color: "#dc2626", border: "1px solid #fecaca" }}>{n} versões</span>}
          {f.image_url && !imgErro[`fam:${f.nome}`] ? <img src={f.image_url} alt={f.nome} onError={() => setImgErro((s) => ({ ...s, [`fam:${f.nome}`]: true }))} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : <i className="fas fa-tractor" style={{ fontSize: 46, color: "#cbd5e1" }} />}
        </div>
        <div style={{ padding: "16px 18px", borderTop: "1px solid #f0f2f6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 700, color: "#0f172a" }}>{f.nome}</div>
            <div style={{ fontSize: 13.5, color: "#94a3b8", marginTop: 3 }}>{n > 1 ? `${n} versões · ${figuras} figuras` : `${figuras} figuras`}</div>
          </div>
          <i className="fas fa-chevron-right" style={{ fontSize: 13, color: "#cbd5e1" }} />
        </div>
      </button>
    );
  };

  // Card de modelo (usado na tela inicial e dentro da marca)
  // Chips de tipo (Todos / Trator / Implemento / Autopropelido)
  const chipsTipo = (tipos: string[], universo: Modelo[]) => (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
      {["", ...tipos].map((t) => {
        const ativo = tipoSel === t;
        const n = t ? universo.filter((m) => m.tipo === t).length : universo.length;
        return (
          <button key={t || "todos"} onClick={() => setTipoSel(t)}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 20px", borderRadius: 999, border: `2px solid ${ativo ? "#dc2626" : "#e3e8ef"}`, background: ativo ? "#dc2626" : "#fff", color: ativo ? "#fff" : "#475569", fontSize: 16, fontWeight: 400, cursor: "pointer", transition: "all .12s" }}>
            {t || "Todos"}
            <span style={{ fontSize: 13.5, fontWeight: 400, padding: "2px 10px", borderRadius: 999, background: ativo ? "rgba(255,255,255,.22)" : "#f1f5f9", color: ativo ? "#fff" : "#94a3b8" }}>{n}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f7f8fa", borderRadius: 14, overflow: "hidden", color: "#0f172a", fontFamily: "'Inter','Segoe UI',system-ui,sans-serif" }}>
      <style>{`
        .cat-card{transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease;box-shadow:0 1px 2px rgba(16,24,40,.05);}
        .cat-card:hover{transform:translateY(-4px);box-shadow:0 14px 30px rgba(16,24,40,.13);border-color:var(--cor,#d3dae5);}
        .cat-card:hover .cat-img img{transform:scale(1.08);}
        .cat-sis{transition:background .15s ease,padding-left .15s ease;}
        .cat-sis:hover{padding-left:16px;background:#f8fafc;}
        @keyframes catPisca{0%,100%{opacity:1;transform:translateY(-50%) scale(1);}50%{opacity:.55;transform:translateY(-50%) scale(1.06);}}
        .cat-dica{animation:catPisca 1.1s ease-in-out infinite;}
        .cat-back:hover{background:#eef1f6 !important;color:#0f172a !important;}
        .cat-add{transition:filter .15s,transform .08s;}
        .cat-add:hover{filter:brightness(1.08);}
        .cat-add:active{transform:scale(.92);}
        .cat-input:focus{border-color:#dc2626 !important;box-shadow:0 0 0 3px rgba(220,38,38,.12);}
        .cat-row:hover{background:#f8fafc;}
        .cat-crumb{cursor:pointer;transition:color .12s,background .12s;}
        .cat-crumb:hover{filter:brightness(.97);}
        @keyframes catPula{0%,100%{transform:translateY(0);}50%{transform:translateY(-6px);}}
        .cat-pula{animation:catPula 1.4s ease-in-out infinite;}
        .cat-crumb:hover{color:#dc2626;text-decoration:underline;}
        .cat-scroll::-webkit-scrollbar{width:9px;height:9px;}
        .cat-scroll::-webkit-scrollbar-thumb{background:#d7dde6;border-radius:8px;}
        .cat-scroll::-webkit-scrollbar-thumb:hover{background:#c2cad6;}
      `}</style>

      {/* Barra superior: busca + breadcrumb */}
      <div style={{ padding: "13px 18px", borderBottom: "1px solid #e9ecf1", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", background: "#fff" }}>
        <div style={{ position: "relative", flex: "1 1 300px", maxWidth: 480 }}>
          <i className="fas fa-search" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#9aa4b2", fontSize: 13 }} />
          <input className="cat-input" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={modeloSel ? `Buscar em ${modeloSel.nome}…` : "Buscar por marca, modelo, peça ou código…"}
            style={{ width: "100%", padding: "11px 14px 11px 38px", borderRadius: 10, border: "1px solid #e3e8ef", fontSize: 14, boxSizing: "border-box", outline: "none", background: "#f8fafc", transition: "border-color .15s, box-shadow .15s" }} />
          {busca && <button onClick={() => setBusca("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", border: "none", background: "transparent", cursor: "pointer", color: "#9aa4b2" }}><i className="fas fa-times" /></button>}
        </div>
        {vista !== "busca" && (
          <div style={{ fontSize: 13, color: "#64748b", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {(secaoAtual || figura || modeloSel || familiaSel || (marcaSel && marcas.length > 1)) && <button className="cat-pula" onClick={voltar} style={{ display: "flex", alignItems: "center", gap: 9, border: "none", background: "#0f172a", color: "#fff", borderRadius: 11, padding: "11px 20px", cursor: "pointer", fontSize: 16.5, fontWeight: 400, boxShadow: "0 4px 14px rgba(15,23,42,.28)" }}><i className="fas fa-arrow-left" style={{ fontSize: 15 }} /> Voltar</button>}
            <button className="cat-crumb" onClick={irParaMarcas} style={{ display: "flex", alignItems: "center", gap: 9, border: "2px solid #dc2626", background: "#fff5f5", color: "#dc2626", borderRadius: 11, padding: "10px 18px", fontSize: 16.5, fontWeight: 400, cursor: travado ? "default" : "pointer" }}>
              <i className="fas fa-bars" style={{ fontSize: 15 }} /> Catálogo menu
            </button>
            {!onSelecionarPeca && (
              <button onClick={() => setCarrinhosOpen(true)} title="Meus carrinhos" className="cat-pula"
                style={{ display: "flex", alignItems: "center", gap: 9, border: "none", background: "linear-gradient(135deg,#ef4444,#dc2626)", color: "#fff", borderRadius: 11, padding: "11px 20px", cursor: "pointer", fontSize: 16.5, fontWeight: 400, boxShadow: "0 5px 16px rgba(220,38,38,.38)" }}>
                <i className="fas fa-cart-shopping" style={{ fontSize: 16 }} /> Meus carrinhos
              </button>
            )}
            {!travado && marcaSel && <><span style={{ color: "#cbd5e1" }}>›</span><span className="cat-crumb" onClick={() => { setFamiliaSel(null); setModeloSel(null); setSecaoAtual(""); setFigura(null); }}>{marcaSel.nome}</span></>}
            {!travado && familiaSel && <><span style={{ color: "#cbd5e1" }}>›</span><span className="cat-crumb" onClick={() => { setModeloSel(null); setSecaoAtual(""); setFigura(null); }}>{familiaSel.nome}</span></>}
            {modeloSel && <><span style={{ color: "#cbd5e1" }}>›</span><span className="cat-crumb" onClick={() => { setSecaoAtual(""); setFigura(null); }}>{modeloSel.nome}</span></>}
            {secaoAtual && <><span style={{ color: "#cbd5e1" }}>›</span><span className="cat-crumb" onClick={() => setFigura(null)}>{secaoAtual}</span></>}
            {figura && <><span style={{ color: "#cbd5e1" }}>›</span><span style={{ fontWeight: 400, color: "#0f172a", fontSize: 16 }}>{figura.code} · {figura.name}</span></>}
          </div>
        )}
      </div>

      {/* Banner: adicionando a um carrinho salvo */}
      {carrinhoAtivo && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 18px", background: "#fff7ed", borderBottom: "1px solid #fed7aa", color: "#9a3412", fontSize: 13 }}>
          <i className="fas fa-cart-plus" />
          <span style={{ flex: 1 }}>Adicionando peças ao carrinho <b>{carrinhoAtivo.nome}</b>. Clique numa peça pra incluir.</span>
          <button onClick={() => setCarrinhosOpen(true)} style={{ border: "1px solid #fed7aa", background: "#fff", color: "#9a3412", borderRadius: 8, padding: "6px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Ver carrinho</button>
          <button onClick={() => setCarrinhoAtivo(null)} style={{ border: "none", background: "transparent", color: "#9a3412", cursor: "pointer", fontSize: 13 }} title="Concluir"><i className="fas fa-check" /> Concluir</button>
        </div>
      )}

      <div className="cat-scroll" style={{ flex: 1, overflow: "auto", position: "relative" }}>
        {loading && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(247,248,250,0.72)", zIndex: 5, fontSize: 13, color: "#64748b" }}><i className="fas fa-circle-notch fa-spin" style={{ marginRight: 8, color: "#dc2626" }} /> Carregando…</div>}

        {/* ===== BUSCA ===== */}
        {vista === "busca" && (
          <div style={{ padding: 18 }}>
            {/* A busca também acha MARCA e MODELO, não só peça/código */}
            {(() => {
              const q = busca.trim().toLowerCase();
              const marcasAch = marcas.filter((m) => m.nome.toLowerCase().includes(q));
              const modelosAch = modelos.filter((m) => (m.nome || "").toLowerCase().includes(q) || (m.familia || "").toLowerCase().includes(q)).slice(0, 12);
              if (!marcasAch.length && !modelosAch.length) return null;
              return (
                <div style={{ marginBottom: 18 }}>
                  {marcasAch.length > 0 && (
                    <>
                      <div style={{ fontSize: 12.5, color: "#94a3b8", marginBottom: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: .5 }}>Marcas</div>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                        {marcasAch.map((mc) => (
                          <button key={mc.slug} onClick={() => { setBusca(""); setMarcaSel(mc); }}
                            style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderRadius: 12, border: "1px solid #e9ecf1", background: "#fff", cursor: "pointer" }}>
                            {mc.logo_url && <img src={mc.logo_url} alt={mc.nome} style={{ height: 30, maxWidth: 90, objectFit: "contain" }} />}
                            <span style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>{mc.nome}</span>
                            <span style={{ fontSize: 12.5, color: "#94a3b8" }}>{mc.modelos} modelos</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  {modelosAch.length > 0 && (
                    <>
                      <div style={{ fontSize: 12.5, color: "#94a3b8", marginBottom: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: .5 }}>Modelos</div>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        {modelosAch.map((m) => (
                          <button key={m.slug} onClick={() => { setBusca(""); abrirModelo(m); }}
                            style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderRadius: 12, border: "1px solid #e9ecf1", background: "#fff", cursor: "pointer" }}>
                            {m.image_url && <img src={m.image_url} alt={m.nome} style={{ height: 34, width: 48, objectFit: "contain" }} />}
                            <span style={{ textAlign: "left" }}>
                              <span style={{ display: "block", fontSize: 15, fontWeight: 700, color: "#0f172a" }}>{m.nome}</span>
                              <span style={{ display: "block", fontSize: 12, color: "#94a3b8" }}>{m.marca || ""}{m.figuras ? ` · ${m.figuras} figuras` : ""}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })()}
            <div style={{ fontSize: 15, color: "#475569", marginBottom: 12, fontWeight: 600 }}>{resultados.length} peça(s) para “{busca.trim()}”{modeloSel ? ` em ${modeloSel.nome}` : ""}</div>
            {resultados.length === 0 ? (
              <div style={{ padding: 48, textAlign: "center", color: "#94a3b8" }}><i className="fas fa-magnifying-glass" style={{ fontSize: 26, display: "block", marginBottom: 10, color: "#cbd5e1" }} />Nenhuma peça encontrada.</div>
            ) : (
              <div style={{ background: "#fff", border: "1px solid #e9ecf1", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 2px rgba(16,24,40,.04)" }}>
                {/* Cabeçalho: deixa explícito o que é código e o que é descrição */}
                <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "10px 16px", background: "#f8fafc", borderBottom: "2px solid #e2e8f0", fontSize: 12, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: .8 }}>
                  <span style={{ width: 168, flexShrink: 0 }}>Código</span>
                  <span style={{ flex: 1 }}>Descrição</span>
                  <span style={{ width: 70, textAlign: "right" }}>Qtd</span>
                  <span style={{ width: 38 }} />
                </div>
                {resultados.map((p) => (
                  <div key={p.id} className="cat-row" style={{ display: "flex", alignItems: "flex-start", gap: 16, padding: "14px 16px", borderBottom: "1px solid #f1f4f8", transition: "background .12s" }}>
                    {/* CÓDIGO — monoespaçado e destacado, coluna fixa */}
                    <code style={{ width: 168, flexShrink: 0, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 15, fontWeight: 800, letterSpacing: .5, color: "#dc2626", background: "#fef2f2", border: "1px solid #fecaca", padding: "7px 10px", borderRadius: 8, textAlign: "center" }}>{p.code}</code>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* DESCRIÇÃO */}
                      <div style={{ fontSize: 17, fontWeight: 600, color: "#0f172a", lineHeight: 1.3 }}>{p.name}</div>
                      {p.figura && <button onClick={() => { setBusca(""); abrirFigura(p.figura_id!); }} style={{ border: "none", background: "transparent", padding: 0, marginTop: 3, cursor: "pointer", fontSize: 13, color: "#2563eb", fontWeight: 600, textAlign: "left" }}>{p.figura.secao} · {p.figura.code} {p.figura.name} →</button>}
                      {/* Máquinas que usam a peça — a mesma figura serve vários modelos */}
                      {p.modelos && p.modelos.length > 0 && (
                        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 9, alignItems: "center" }}>
                          <span style={{ fontSize: 12, color: "#0f172a", fontWeight: 800, textTransform: "uppercase", letterSpacing: .5 }}>
                            <i className="fas fa-tractor" style={{ color: "#2563eb", marginRight: 5 }} />Usada em
                          </span>
                          {p.modelos.slice(0, 8).map((nm) => (
                            <span key={nm} style={{ fontSize: 13.5, fontWeight: 700, color: "#1d4ed8", background: "#eff6ff", border: "1.5px solid #bfdbfe", borderRadius: 999, padding: "4px 12px" }}>{nm}</span>
                          ))}
                          {p.modelos.length > 8 && (
                            <span title={p.modelos.join(", ")} style={{ fontSize: 13.5, fontWeight: 800, color: "#fff", background: "#2563eb", borderRadius: 999, padding: "4px 11px", cursor: "help" }}>+{p.modelos.length - 8}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <span style={{ width: 70, textAlign: "right", fontSize: 15, fontWeight: 600, color: "#334155", whiteSpace: "nowrap" }}>{p.qtd} {p.unit}</span>
                    <button className="cat-add" onClick={() => addPeca({ code: p.code, name: p.name })} title={onSelecionarPeca ? "Adicionar ao lançamento" : "Adicionar ao carrinho"}
                      style={{ border: "none", background: "#dc2626", color: "#fff", borderRadius: 8, width: 38, height: 38, fontSize: 15, cursor: "pointer", flexShrink: 0 }}><i className="fas fa-plus" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== TELA INICIAL: marcas abertas, com os modelos à mostra ===== */}
        {vista === "marcas" && (
          <div style={{ padding: 18 }}>
            {tiposTodos.length > 1 && chipsTipo(tiposTodos, modelos)}

            {/* Trator primeiro: é o que mais se procura no dia a dia. Marcas que
                têm trator sobem; entre iguais, mantém a ordem alfabética. */}
            {[...marcas].sort((a, b) => {
              const tem = (m: Marca) => (m.tipos || []).some((t) => /trator/i.test(t)) ? 0 : 1;
              return tem(a) - tem(b) || a.nome.localeCompare(b.nome, "pt-BR");
            }).map((mc) => {
              const lista = ordenar(porTipo(modelos.filter((m) => m.marca === mc.nome)));
              if (lista.length === 0) return null; // marca sem modelo neste tipo
              return (
                <div key={mc.slug} style={{ marginBottom: 26 }}>
                  {/* Cabeçalho da marca (clicável = ver só ela) */}
                  <div onClick={() => setMarcaSel(mc)} title={`Ver só ${mc.nome}`}
                    style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderRadius: 12, background: "#fff", border: "1px solid #e9ecf1", marginBottom: 14, cursor: "pointer", boxShadow: "0 1px 2px rgba(16,24,40,.05)" }}>
                    {mc.logo_url && !imgErro[`marca:${mc.slug}`] && (
                      <img src={mc.logo_url} alt={mc.nome} onError={() => setImgErro((s) => ({ ...s, [`marca:${mc.slug}`]: true }))} style={{ height: 56, maxWidth: 190, objectFit: "contain" }} />
                    )}
                    <div>
                      <div style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", lineHeight: 1.15 }}>{mc.nome}</div>
                      <div style={{ fontSize: 12.5, color: "#94a3b8", fontWeight: 600, marginTop: 2 }}>
                        {lista.length} {lista.length === 1 ? "modelo" : "modelos"}
                        {tipoSel ? ` · ${tipoSel}` : mc.tipos.length ? ` · ${mc.tipos.join(" · ")}` : ""}
                      </div>
                    </div>
                    <i className="fas fa-chevron-right" style={{ marginLeft: "auto", fontSize: 12, color: "#cbd5e1" }} />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))", gap: 20 }}>
                    {agrupar(lista).map(cardFamilia)}
                  </div>
                </div>
              );
            })}
            {marcas.length === 0 && <div style={{ padding: 30, color: "#94a3b8" }}>Nenhuma marca com catálogo.</div>}
          </div>
        )}

        {/* ===== MODELOS DA MARCA (com filtro por tipo) ===== */}
        {vista === "modelos" && marcaSel && (
          <div style={{ padding: 18 }}>
            {/* Cabeçalho da marca */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 18px", borderRadius: 14, background: "#fff", border: "1px solid #e9ecf1", marginBottom: 16 }}>
              {marcaSel.logo_url && !imgErro[`marca:${marcaSel.slug}`] && (
                <img src={marcaSel.logo_url} alt={marcaSel.nome} onError={() => setImgErro((s) => ({ ...s, [`marca:${marcaSel.slug}`]: true }))} style={{ height: 64, maxWidth: 210, objectFit: "contain" }} />
              )}
              <div>
                <div style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", lineHeight: 1.15 }}>{marcaSel.nome}</div>
                <div style={{ fontSize: 12.5, color: "#94a3b8", marginTop: 2 }}>{modelosVisiveis.length} de {modelosDaMarca.length} modelos</div>
              </div>
            </div>

            {/* Filtro por tipo — só aparece se a marca tiver mais de um */}
            {tiposDaMarca.length > 1 && chipsTipo(tiposDaMarca, modelosDaMarca)}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))", gap: 20 }}>
              {agrupar(modelosVisiveis).map(cardFamilia)}
              {modelosVisiveis.length === 0 && <div style={{ padding: 30, color: "#94a3b8" }}>Nenhum modelo neste tipo.</div>}
            </div>
          </div>
        )}

        {/* ===== VARIANTES DE UMA LINHA (ex.: as 62 PST DUO, por chassi/versão) ===== */}
        {vista === "variantes" && familiaSel && (
          <div style={{ padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 18px", borderRadius: 14, background: "#fff", border: "1px solid #e9ecf1", marginBottom: 16 }}>
              <div style={{ width: 96, height: 68, borderRadius: 10, overflow: "hidden", background: "linear-gradient(180deg,#fbfcfe,#eef2f7)", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #eef1f6", flexShrink: 0 }}>
                {familiaSel.image_url ? <img src={familiaSel.image_url} alt={familiaSel.nome} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : <i className="fas fa-tractor" style={{ fontSize: 26, color: "#cbd5e1" }} />}
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#dc2626", letterSpacing: 1.2, textTransform: "uppercase" }}>{familiaSel.marca}{familiaSel.tipo ? ` · ${familiaSel.tipo}` : ""}</div>
                <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.15, color: "#0f172a" }}>{familiaSel.nome}</div>
                <div style={{ fontSize: 12.5, color: "#94a3b8", marginTop: 3 }}>{familiaSel.variantes.length} versões — escolha a do cliente (chassi / configuração)</div>
              </div>
            </div>

            <div style={{ background: "#fff", border: "1px solid #e9ecf1", borderRadius: 12, overflow: "hidden" }}>
              {familiaSel.variantes.map((m) => (
                <button key={m.slug} className="cat-row" onClick={() => abrirModelo(m)}
                  style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", padding: "12px 15px", border: "none", borderBottom: "1px solid #f1f4f8", background: "transparent", cursor: "pointer" }}>
                  <i className="fas fa-file-lines" style={{ color: "#cbd5e1", fontSize: 14 }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{m.nome}</span>
                  {m.manual_url && <i className="fas fa-book" title="Tem manual" style={{ color: "#dc2626", fontSize: 12 }} />}
                  <span style={{ fontSize: 12, color: "#94a3b8", whiteSpace: "nowrap" }}>{m.figuras || 0} figuras</span>
                  <i className="fas fa-chevron-right" style={{ fontSize: 11, color: "#cbd5e1" }} />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ===== SISTEMAS DO TRATOR ===== */}
        {vista === "sistemas" && modeloSel && (
          <div style={{ padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 18, padding: 18, borderRadius: 14, background: "#fff", border: "1px solid #e9ecf1", marginBottom: 20, position: "relative", overflow: "hidden", boxShadow: "0 1px 2px rgba(16,24,40,.05)" }}>
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: "#dc2626" }} />
              <div style={{ width: 120, height: 84, borderRadius: 10, overflow: "hidden", background: "linear-gradient(180deg,#fbfcfe,#eef2f7)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #eef1f6", marginLeft: 6 }}>
                {modeloSel.image_url && !imgErro[modeloSel.slug] ? <img src={modeloSel.image_url} alt={modeloSel.nome} onError={() => setImgErro((s) => ({ ...s, [modeloSel.slug]: true }))} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : <i className="fas fa-tractor" style={{ fontSize: 32, color: "#cbd5e1" }} />}
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#dc2626", letterSpacing: 1.2, textTransform: "uppercase" }}>{modeloSel.marca || "Trator"}</div>
                <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.15, color: "#0f172a" }}>{modeloSel.nome}</div>
                <div style={{ fontSize: 12.5, color: "#94a3b8", marginTop: 3 }}>{secoes.reduce((a, s) => a + s.figuras, 0)} figuras · {secoes.length} sistemas</div>
              </div>
              {/* Manual de instrução — ao lado da foto, quando o modelo tem */}
              {modeloSel.manual_url && (
                <a href={modeloSel.manual_url} target="_blank" rel="noopener noreferrer"
                  title={modeloSel.manual_nome || "Abrir o manual de instrução (PDF)"}
                  style={{
                    marginLeft: "auto", marginRight: 6, display: "flex", alignItems: "center", gap: 9,
                    padding: "11px 18px", borderRadius: 11, border: "none",
                    background: "linear-gradient(135deg,#ef4444,#dc2626)", color: "#fff",
                    fontSize: 13.5, fontWeight: 700, textDecoration: "none",
                    boxShadow: "0 4px 12px rgba(220,38,38,.28)", flexShrink: 0,
                  }}>
                  <i className="fas fa-book" style={{ fontSize: 15 }} />
                  <span style={{ lineHeight: 1.2 }}>
                    Manual de instrução
                    <span style={{ display: "block", fontSize: 10.5, fontWeight: 500, opacity: 0.85 }}>Abrir o PDF</span>
                  </span>
                </a>
              )}
            </div>

            {/* Barra lateral de sistemas + figuras ao lado */}
            <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
              <div style={{ width: 310, flexShrink: 0, background: "#fff", border: "1px solid #e9ecf1", borderRadius: 16, padding: 12, position: "sticky", top: 12, maxHeight: "calc(100vh - 150px)", overflowY: "auto" }}>
                <div style={{ fontSize: 13, fontWeight: 400, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1.2, padding: "8px 12px 12px" }}>Sistemas</div>
                {secoes.map((s) => {
                  const { icone, cor } = estiloSistema(s.secao);
                  const on = secaoAtual === s.secao;
                  return (
                    <button key={s.secao} className="cat-sis" onClick={() => abrirSecao(s.secao)}
                      style={{
                        display: "flex", alignItems: "center", gap: 14, width: "100%", textAlign: "left",
                        padding: "14px 13px", marginBottom: 4, borderRadius: 12, cursor: "pointer",
                        border: "none", background: on ? cor + "14" : "transparent",
                        borderLeft: `4px solid ${on ? cor : "transparent"}`,
                      }}>
                      <span style={{ width: 42, height: 42, borderRadius: 11, background: cor + "1a", color: cor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                        <i className={`fas ${icone}`} />
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 17, fontWeight: 400, color: on ? cor : "#334155", lineHeight: 1.3 }}>{s.secao}</span>
                        <span style={{ display: "block", fontSize: 14, color: "#94a3b8", marginTop: 2 }}>{s.figuras} figura{s.figuras !== 1 ? "s" : ""}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                {!secaoAtual ? (
                  <div style={{ padding: 60, textAlign: "center", color: "#94a3b8", background: "#fff", borderRadius: 16, border: "1px solid #e9ecf1" }}>
                    <i className="fas fa-hand-point-left" style={{ fontSize: 30, display: "block", marginBottom: 12, color: "#cbd5e1" }} />
                    <span style={{ fontSize: 17, fontWeight: 400 }}>Escolha um sistema ao lado</span>
                  </div>
                ) : (
                  <>
                    {(() => { const { icone, cor } = estiloSistema(secaoAtual); return (
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
                        <span style={{ width: 44, height: 44, borderRadius: 12, background: cor + "1a", color: cor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19 }}>
                          <i className={`fas ${icone}`} />
                        </span>
                        <span>
                          <span style={{ display: "block", fontSize: 23, fontWeight: 400, color: "#0f172a", lineHeight: 1.2 }}>{secaoAtual}</span>
                          <span style={{ display: "block", fontSize: 14.5, color: "#94a3b8" }}>{figuras.length} figura{figuras.length !== 1 ? "s" : ""}</span>
                        </span>
                      </div>
                    ); })()}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 18 }}>
                      {figuras.map((f) => {
                        const { cor } = estiloSistema(secaoAtual);
                        return (
                          <button key={f.id} className="cat-card" onClick={() => abrirFigura(f.id)} style={{ padding: 0, borderRadius: 14, border: "1px solid #e9ecf1", background: "#fff", cursor: "pointer", overflow: "hidden", textAlign: "left", ["--cor" as string]: cor }}>
                            <div className="cat-img" style={{ height: 190, background: "linear-gradient(180deg,#fbfcfe,#eef2f7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 14, overflow: "hidden" }}>
                              {f.thumb_url || f.image_url ? <img src={f.thumb_url || f.image_url || ""} alt={f.name} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", transition: "transform .25s ease" }} /> : <i className="fas fa-image" style={{ fontSize: 26, color: "#cbd5e1" }} />}
                            </div>
                            <div style={{ padding: "14px 16px", borderTop: "1px solid #f0f2f6" }}>
                              <div style={{ fontSize: 13.5, fontWeight: 400, color: cor, letterSpacing: 0.4, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{f.code}</div>
                              <div style={{ fontSize: 16.5, fontWeight: 400, lineHeight: 1.35, color: "#0f172a", marginTop: 4 }}>{f.name}</div>
                            </div>
                          </button>
                        );
                      })}
                      {figuras.length === 0 && !loading && <div style={{ padding: 30, color: "#94a3b8", gridColumn: "1/-1" }}>Nenhuma figura neste sistema.</div>}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ===== DETALHE DA FIGURA (vista explodida + peças) ===== */}
        {vista === "figura" && figura && (
          <div style={{ display: "flex", gap: 0, height: "100%", flexWrap: "wrap", background: "#fff" }}>
            <div ref={leftPanelRef} style={{ flex: "1 1 360px", minWidth: 300, padding: 18, borderRight: "1px solid #eef0f3", overflowY: "auto", scrollbarGutter: "stable", maxHeight: "100%", display: "flex", flexDirection: "column" }}>
              <div style={{ marginBottom: 12, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#dc2626", letterSpacing: 0.5 }}>{figura.code}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>{figura.name}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  {/* Gerar PDF (com ou sem a lista de peças) */}
                  {figura.image_url && !editando && (
                    <div style={{ position: "relative" }}>
                      <button onClick={() => setPdfMenu((o) => !o)} disabled={gerandoPdf} title="Baixar esta figura em PDF"
                        style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 13px", borderRadius: 9, border: "1.5px solid #fecaca", background: "#fff5f5", color: "#dc2626", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                        <i className={`fas ${gerandoPdf ? "fa-spinner fa-spin" : "fa-file-pdf"}`} /> {gerandoPdf ? "Gerando..." : "Gerar PDF"}
                        {!gerandoPdf && <i className="fas fa-chevron-down" style={{ fontSize: 9 }} />}
                      </button>
                      {pdfMenu && !gerandoPdf && (
                        <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 40, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, boxShadow: "0 12px 30px rgba(0,0,0,0.14)", overflow: "hidden", minWidth: 210 }}>
                          {([
                            { titulo: "Imprimir", icon: "fa-print", acao: "imprimir" as const },
                            { titulo: "Baixar", icon: "fa-download", acao: "baixar" as const },
                          ]).map((grp, gi) => (
                            <div key={grp.acao} style={{ borderTop: gi > 0 ? "1px solid #eef0f3" : "none" }}>
                              <div style={{ padding: "8px 13px 4px", fontSize: 10.5, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, display: "flex", alignItems: "center", gap: 7 }}>
                                <i className={`fas ${grp.icon}`} /> {grp.titulo}
                              </div>
                              <button onClick={() => { if (grp.acao === "imprimir") { setPrintDlg({ comPecas: true }); setPdfMenu(false); } else gerarPdf(true, "baixar"); }} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "9px 15px", border: "none", background: "transparent", cursor: "pointer", fontSize: 13, color: "#0f172a", textAlign: "left" }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                                <i className="fas fa-list" style={{ color: "#dc2626", width: 15 }} /> Com peças
                              </button>
                              <button onClick={() => { if (grp.acao === "imprimir") { setPrintDlg({ comPecas: false }); setPdfMenu(false); } else gerarPdf(false, "baixar"); }} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "9px 15px", border: "none", background: "transparent", cursor: "pointer", fontSize: 13, color: "#0f172a", textAlign: "left" }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                                <i className="fas fa-image" style={{ color: "#64748b", width: 15 }} /> Só o desenho
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {/* Editar bolinhas — só Ventura, enquanto ajustamos as posições */}
                  {podeEditar && figura.image_url && !editando && (
                    <button onClick={iniciarEdicao} title="Ajustar a posição das bolinhas" style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 13px", borderRadius: 9, border: "1.5px solid #c7d2fe", background: "#eef2ff", color: "#4338ca", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                      <i className="fas fa-crosshairs" /> Editar bolinhas
                    </button>
                  )}
                </div>
              </div>
              {/* Aviso: catálogo Ventura em ajuste das bolinhas */}
              {podeEditar && !editando && (
                <div style={{ marginBottom: 10, borderRadius: 10, border: "1px solid #fde68a", background: "#fffbeb", padding: "9px 13px", display: "flex", alignItems: "flex-start", gap: 9, fontSize: 12.5, color: "#92400e", lineHeight: 1.4 }}>
                  <i className="fas fa-triangle-exclamation" style={{ marginTop: 2, color: "#d97706" }} />
                  <span><b>Catálogo Ventura em ajuste:</b> algumas bolinhas ainda estão fora de posição (as por acertar ficam enfileiradas no topo do desenho). Estamos a colocá-las no lugar. A <b>lista de peças à direita está completa e correta</b> — use-a como referência.</span>
                </div>
              )}
              <div ref={imgBoxRef}
                onMouseMove={(e) => { if (editando) { moverBolinha(e.clientX, e.clientY); return; } if (panRef.current) { const d = panRef.current; setPan({ x: d.px + (e.clientX - d.x), y: d.py + (e.clientY - d.y) }); } }}
                onMouseUp={() => { if (editando) setArrastando(null); else panRef.current = null; }}
                onMouseLeave={() => { if (editando) setArrastando(null); else panRef.current = null; }}
                style={{ position: "relative", width: "100%", flex: 1, minHeight: 360, background: "linear-gradient(180deg,#fbfcfe,#f1f4f8)", borderRadius: 12, overflow: "hidden", border: editando ? "2px solid #6366f1" : "1px solid #eef1f6", display: "flex", alignItems: "center", justifyContent: "center", cursor: arrastando != null ? "grabbing" : (!editando && zoom > 1 ? "grab" : "default"), userSelect: "none" }}>
                {figura.image_url ? (
                  <>
                    {/* Wrapper com zoom/pan — a imagem e as bolinhas escalam juntas */}
                    {/* fit-content: o container encolhe junto com a imagem, senão as
                        bolinhas (posicionadas em %) sairiam do lugar ao centralizar. */}
                    <div style={{ width: "fit-content", maxWidth: "100%", margin: "0 auto", position: "relative", transformOrigin: "center center", transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transition: panRef.current ? "none" : "transform .1s ease", willChange: "transform" }}>
                      <img ref={imgElRef} src={figura.image_url} alt={figura.name} draggable={false}
                        onMouseDown={(e) => { if (!editando && zoom > 1) { e.preventDefault(); panRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }; } }}
                        onLoad={(e) => setImgDim({ w: (e.target as HTMLImageElement).naturalWidth || 1, h: (e.target as HTMLImageElement).naturalHeight || 1 })}
                        // cabe inteira na tela: limita pela ALTURA disponível, não só pela largura
                        style={{ maxWidth: "100%", maxHeight: "calc(100vh - 210px)", width: "auto", display: "block" }} />
                      {/* MODO NORMAL: bolinhas clicáveis */}
                      {!editando && (figura.hotspots || []).map((h, i) => {
                        const ativo = refHover === h.reference;
                        return (
                          <button key={`${h.reference}-${i}`} onClick={() => abrirPecaDaBolinha(h.reference)}
                            onMouseEnter={() => { setRefHover(h.reference); scrollParaRef(h.reference); }} onMouseLeave={() => !pecaSel && setRefHover(null)}
                            style={{ position: "absolute", left: `${(h.x / imgDim.w) * 100}%`, top: `${(h.y / imgDim.h) * 100}%`, transform: `translate(-50%,-50%) scale(${1 / zoom})`, width: ativo ? 38 : 30, height: ativo ? 38 : 30, borderRadius: "50%", border: "2.5px solid #fff", background: ativo ? "#dc2626" : "rgba(37,99,235,0.92)", color: "#fff", fontSize: ativo ? 16 : 13, fontWeight: 400, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 7px rgba(0,0,0,0.45)", transition: "all .12s", zIndex: ativo ? 3 : 2 }}>{h.reference}</button>
                        );
                      })}
                      {/* Ficha da peça LOGO ABAIXO da bolinha em foco */}
                      {!editando && (() => {
                        const ref = pecaSel?.reference || refHover;
                        if (!ref) return null;
                        const h = (figura.hotspots || []).find((x) => x.reference === ref);
                        const p = (figura.pecas || []).find((x) => x.reference === ref);
                        if (!h || !p) return null;
                        const esquerda = (h.x / imgDim.w) * 100;
                        return (
                          <div style={{
                            position: "absolute", left: `${Math.min(Math.max(esquerda, 16), 84)}%`, top: `calc(${(h.y / imgDim.h) * 100}% + ${26 / zoom}px)`,
                            transform: `translateX(-50%) scale(${1 / zoom})`, transformOrigin: "top center", zIndex: 9,
                            background: "#0f172a", color: "#fff", borderRadius: 14, padding: "16px 20px", minWidth: 330, maxWidth: 460,
                            boxShadow: "0 16px 40px rgba(0,0,0,.42)", border: "2px solid #dc2626", pointerEvents: "none",
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                              <span style={{ display: "inline-flex", width: 38, height: 38, borderRadius: "50%", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 400, background: "#dc2626", color: "#fff", flexShrink: 0 }}>{p.reference}</span>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 12, color: "#94a3b8", textTransform: "uppercase", letterSpacing: .9 }}>Código</div>
                                <code style={{ fontSize: 24, fontWeight: 400, color: "#fca5a5", fontFamily: "ui-monospace, Menlo, monospace", letterSpacing: .6, lineHeight: 1.2 }}>{p.code}</code>
                              </div>
                            </div>
                            <div style={{ fontSize: 12, color: "#94a3b8", textTransform: "uppercase", letterSpacing: .9 }}>Descrição</div>
                            <div style={{ fontSize: 21, fontWeight: 400, color: "#fff", lineHeight: 1.35 }}>{p.name}</div>
                            {p.qtd ? <div style={{ fontSize: 16, color: "#cbd5e1", marginTop: 8 }}>o desenho pede {p.qtd}{p.unit ? ` ${p.unit}` : ""}</div> : null}
                          </div>
                        );
                      })()}
                      {/* MODO EDIÇÃO: bolinhas arrastáveis */}
                      {editando && hsEdit.map((h, i) => (
                        <div key={`e-${h.reference}-${i}`} onMouseDown={(e) => { e.preventDefault(); setArrastando(i); }}
                          title={`Ref ${h.reference} — arraste para o número`}
                          style={{ position: "absolute", left: `${(h.x / imgDim.w) * 100}%`, top: `${(h.y / imgDim.h) * 100}%`, transform: "translate(-50%,-50%)", width: 22, height: 22, borderRadius: "50%", border: "2px solid #fff", background: arrastando === i ? "#4338ca" : "#dc2626", color: "#fff", fontSize: 11, fontWeight: 800, cursor: "grab", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 6px rgba(0,0,0,0.5)", zIndex: arrastando === i ? 6 : 5 }}>{h.reference}</div>
                      ))}
                    </div>
                    {/* Controles de zoom (fora do wrapper, não escalam) */}
                    {!editando && (
                      <div style={{ position: "absolute", top: 8, right: 8, zIndex: 5, display: "flex", flexDirection: "column", gap: 6 }}>
                        <button title="Aproximar" onClick={() => setZoom((z) => Math.min(6, z * 1.25))} style={zoomBtn}>+</button>
                        <button title="Afastar" onClick={() => setZoom((z) => { const nz = Math.max(1, z / 1.25); if (nz === 1) setPan({ x: 0, y: 0 }); return nz; })} style={zoomBtn}>−</button>
                        <button title="Tamanho original" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} style={{ ...zoomBtn, fontSize: 13 }}>1:1</button>
                        <button title="Tela cheia (desenhar)" onClick={() => { setFsZoom(1); setFullscreen(true); }} style={{ ...zoomBtn, fontSize: 13 }}><i className="fas fa-expand" /></button>
                      </div>
                    )}
                  </>
                ) : <div style={{ padding: 50, color: "#cbd5e1" }}><i className="fas fa-image" style={{ fontSize: 36 }} /></div>}
              </div>

              {/* Barra do modo edição */}
              {editando && (
                <div style={{ marginTop: 10, borderRadius: 10, border: "1.5px solid #c7d2fe", background: "#eef2ff", padding: "10px 13px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12.5, color: "#4338ca", fontWeight: 600, flex: 1 }}>
                    <i className="fas fa-crosshairs" style={{ marginRight: 6 }} />Arraste cada bolinha para o número. As sem posição estão em fila no topo.
                  </span>
                  <button onClick={() => setEditando(false)} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", color: "#475569", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Cancelar</button>
                  <button disabled={salvando} onClick={salvarHotspots} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#4338ca", color: "#fff", fontSize: 12.5, fontWeight: 800, cursor: "pointer", opacity: salvando ? 0.6 : 1 }}>{salvando ? "Salvando…" : "Salvar posições"}</button>
                </div>
              )}

              {/* Peça em foco: passar o mouse na bolinha já mostra a tira; clicar
                  fixa (aí dá pra escolher quantidade e adicionar). */}
              {/* Tira do rodapé (qtd + adicionar) só no CLIQUE: no hover ela
                  empurrava o layout, movia a bolinha e criava tremedeira. No
                  hover fica só a ficha flutuante acima (que não mexe no layout). */}
              {(() => { const pecaTira = pecaSel; return pecaTira && (
                <div style={{ position: "sticky", bottom: 0, zIndex: 8, marginTop: 12, borderRadius: 12, border: "1.5px solid #fecaca", background: "#fff7f7", padding: "13px 15px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", boxShadow: "0 -6px 18px rgba(0,0,0,0.10)" }}>
                  <span style={{ display: "inline-flex", width: 38, height: 38, borderRadius: "50%", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 500, background: "#dc2626", color: "#fff", flexShrink: 0 }}>{pecaTira.reference}</span>
                  <div style={{ flex: "1 1 180px", minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: "#94a3b8", textTransform: "uppercase", letterSpacing: .6, fontWeight: 400 }}>Descrição</div>
                    <div style={{ fontSize: 19, fontWeight: 400, color: "#0f172a", lineHeight: 1.3 }}>{pecaTira.name}</div>
                    <div style={{ fontSize: 15, marginTop: 6, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, color: "#94a3b8", textTransform: "uppercase", letterSpacing: .6 }}>Código</span>
                      <code style={{ fontWeight: 500, color: "#dc2626", fontFamily: "ui-monospace, Menlo, monospace", fontSize: 17, letterSpacing: .5 }}>{pecaTira.code}</code>
                      {pecaTira.qtd ? <span style={{ color: "#64748b", fontWeight: 400 }}>· o desenho pede {pecaTira.qtd}{pecaTira.unit ? ` ${pecaTira.unit}` : ""}</span> : null}
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <button onClick={() => setQtdSel((q) => Math.max(1, q - 1))} style={{ width: 32, height: 32, border: "1px solid #e2e8f0", background: "#fff", borderRadius: 8, cursor: "pointer", fontSize: 15, color: "#475569" }}>−</button>
                    <input value={qtdSel} onChange={(e) => setQtdSel(Math.max(1, parseInt(e.target.value) || 1))}
                      style={{ width: 52, textAlign: "center", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 0", fontSize: 16, fontWeight: 400 }} />
                    <button onClick={() => setQtdSel((q) => q + 1)} style={{ width: 32, height: 32, border: "1px solid #e2e8f0", background: "#fff", borderRadius: 8, cursor: "pointer", fontSize: 15, color: "#475569" }}>+</button>
                  </div>

                  <button className="cat-add" onClick={() => { addPeca({ code: pecaTira.code, name: pecaTira.name }, qtdSel); setPecaSel(null); }}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 22px", border: "none", borderRadius: 10, background: "#dc2626", color: "#fff", fontSize: 16, fontWeight: 400, cursor: "pointer" }}>
                    <i className="fas fa-plus" /> {onSelecionarPeca ? "Adicionar ao lançamento" : "Adicionar ao carrinho"}
                  </button>
                  <button onClick={() => { setPecaSel(null); setRefHover(null); }} title="Fechar"
                    style={{ width: 32, height: 32, border: "none", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, cursor: "pointer" }}><i className="fas fa-times" /></button>
                </div>
              ); })()}
            </div>

            {/* Aba pra trazer o painel de volta quando ele está recolhido */}
            {!painelAberto && (
              <>
                {/* Dica: pisca até o usuário abrir a lista pela primeira vez */}
                {!jaAbriuPainel && (
                  <div className="cat-dica" style={{ position: "absolute", right: 76, top: "50%", transform: "translateY(-50%)", zIndex: 21, background: "#dc2626", color: "#fff", padding: "12px 18px", borderRadius: 12, fontSize: 16, boxShadow: "0 8px 24px rgba(220,38,38,.4)", display: "flex", alignItems: "center", gap: 10, pointerEvents: "none", whiteSpace: "nowrap" }}>
                    <i className="fas fa-hand-point-right" style={{ fontSize: 18 }} />
                    Clique aqui para ver a lista de peças
                  </div>
                )}
                <button onClick={() => { setPainelAberto(true); setJaAbriuPainel(true); }} title="Mostrar as peças"
                  className={jaAbriuPainel ? "" : "cat-dica"}
                  style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)", zIndex: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "22px 13px", border: "2px solid #dc2626", borderRight: "none", borderRadius: "14px 0 0 14px", background: "#fff", color: "#dc2626", cursor: "pointer", boxShadow: "-6px 0 20px rgba(16,24,40,.16)" }}>
                  <i className="fas fa-chevron-left" style={{ fontSize: 18 }} />
                  <span style={{ writingMode: "vertical-rl", fontSize: 16, letterSpacing: 1.4, color: "#0f172a" }}>PEÇAS ({(figura.pecas || []).length})</span>
                </button>
              </>
            )}

            <div style={{ flex: painelAberto ? "1 1 380px" : "0 0 0px", minWidth: painelAberto ? 340 : 0, width: painelAberto ? undefined : 0, overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: "100%", transition: "flex-basis .2s ease, min-width .2s ease" }}>
              <div style={{ display: "flex", alignItems: "center", padding: "13px 16px", fontSize: 13, fontWeight: 400, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6, borderBottom: "1px solid #eef0f3", background: "#fafbfc", position: "sticky", top: 0, zIndex: 1 }}>
                <span style={{ width: 44 }}>Ref</span><span style={{ width: 180 }}>Código</span><span style={{ flex: 1 }}>Nome</span><span style={{ width: 56 }}>Qtd</span>
                <button onClick={() => setPainelAberto(false)} title="Esconder as peças"
                  style={{ width: 34, height: 34, border: "none", background: "#f1f5f9", color: "#475569", borderRadius: 8, cursor: "pointer", flexShrink: 0 }}>
                  <i className="fas fa-chevron-right" />
                </button>
              </div>
              <div ref={listScrollRef} className="cat-scroll" style={{ overflow: "auto", flex: 1 }}>
                {(figura.pecas || []).map((p) => {
                  const ativo = refHover === p.reference;
                  return (
                    <div key={p.id} ref={(el) => { rowRefs.current[p.reference] = el; }} onMouseEnter={() => setRefHover(p.reference)} onMouseLeave={() => { if (!pecaSel) setRefHover(null); }}
                      onClick={() => selecionarPecaDaLista(p)} title="Clique para destacar no desenho"
                      style={{ display: "flex", alignItems: "center", padding: "13px 16px", borderBottom: "1px solid #f3f5f8", background: ativo ? "#fff7ed" : "transparent", transition: "background .12s", cursor: "pointer" }}>
                      <span style={{ width: 44 }}><span style={{ display: "inline-flex", width: 28, height: 28, borderRadius: "50%", alignItems: "center", justifyContent: "center", fontSize: 13.5, fontWeight: 400, background: ativo ? "#dc2626" : "#eef2f7", color: ativo ? "#fff" : "#475569" }}>{p.reference}</span></span>
                      <span style={{ width: 180, display: "flex", alignItems: "center", gap: 6 }}>
                        <code style={{ fontSize: 16.5, fontWeight: 400, color: "#dc2626", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", letterSpacing: .3 }}>{p.code}</code>
                        <button onClick={(e) => { e.stopPropagation(); copiarCodigo(p.code); }} title="Copiar código"
                          style={{ border: "none", background: "transparent", cursor: "pointer", color: copiado === p.code ? "#16a34a" : "#94a3b8", fontSize: 14, padding: 2, flexShrink: 0 }}>
                          <i className={`fas ${copiado === p.code ? "fa-check" : "fa-copy"}`} />
                        </button>
                      </span>
                      <span style={{ flex: 1, fontSize: 16.5, paddingRight: 8, color: "#0f172a", lineHeight: 1.35, fontWeight: 400 }}>{p.name}</span>
                      <span style={{ width: 56, fontSize: 15, color: "#64748b" }}>{p.qtd} {p.unit}</span>
                      <button className="cat-add" onClick={(e) => { e.stopPropagation(); addPeca({ code: p.code, name: p.name }); }} title={onSelecionarPeca ? "Adicionar ao lançamento" : "Adicionar ao carrinho"} style={{ width: 36, height: 36, border: "none", background: "#dc2626", color: "#fff", borderRadius: 8, cursor: "pointer", flexShrink: 0, fontSize: 14 }}><i className="fas fa-plus" /></button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Botão flutuante do carrinho (modo avulso) */}
      {!onSelecionarPeca && cart.length > 0 && !cartOpen && (
        <button className="cat-add" onClick={() => setCartOpen(true)} style={{ position: "absolute", bottom: 18, right: 18, zIndex: 40, display: "flex", alignItems: "center", gap: 9, padding: "13px 19px", borderRadius: 13, border: "none", background: "linear-gradient(135deg,#ef4444,#dc2626)", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", boxShadow: "0 8px 22px rgba(220,38,38,0.40)" }}>
          <i className="fas fa-cart-shopping" /> Carrinho <span style={{ background: "#fff", color: "#dc2626", borderRadius: 20, padding: "2px 9px", fontSize: 12, fontWeight: 800 }}>{cart.reduce((s, i) => s + i.qty, 0)}</span>
        </button>
      )}

      {/* Gaveta do carrinho */}
      {!onSelecionarPeca && cartOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 4500, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onClick={() => setCartOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,0.55)" }} />
          <div style={{ position: "relative", width: 780, maxWidth: "96%", maxHeight: "92vh", background: "#fff", borderRadius: 18, boxShadow: "0 30px 70px rgba(0,0,0,0.35)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #eef0f3", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 22, fontWeight: 400 }}><i className="fas fa-cart-shopping" style={{ color: "#dc2626", marginRight: 10 }} />Carrinho ({cart.reduce((s, i) => s + i.qty, 0)} {cart.reduce((s, i) => s + i.qty, 0) === 1 ? "peça" : "peças"})</div>
              <button onClick={() => setCartOpen(false)} style={{ border: "none", background: "#f1f5f9", borderRadius: 10, width: 40, height: 40, cursor: "pointer", color: "#475569", fontSize: 18 }}><i className="fas fa-times" /></button>
            </div>

            <div style={{ flex: 1, overflow: "auto", padding: "8px 0" }}>
              {cart.length === 0 ? <div style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 17 }}>Carrinho vazio.</div> : cart.map((it) => (
                <div key={it.code} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 24px", borderBottom: "1px solid #f5f7fa" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 17, fontWeight: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</div>
                    <code style={{ fontSize: 15, fontWeight: 400, color: "#dc2626", fontFamily: "ui-monospace, Menlo, monospace" }}>{it.code}</code>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <button onClick={() => setQty(it.code, it.qty - 1)} style={{ width: 34, height: 34, border: "1px solid #e2e8f0", background: "#fff", borderRadius: 8, cursor: "pointer", fontSize: 17 }}>−</button>
                    <input value={it.qty} onChange={(e) => setQty(it.code, parseInt(e.target.value) || 1)} style={{ width: 52, textAlign: "center", border: "1px solid #e2e8f0", borderRadius: 8, padding: "7px 0", fontSize: 16 }} />
                    <button onClick={() => setQty(it.code, it.qty + 1)} style={{ width: 34, height: 34, border: "1px solid #e2e8f0", background: "#fff", borderRadius: 8, cursor: "pointer", fontSize: 17 }}>+</button>
                  </div>
                  <button onClick={() => removeFromCart(it.code)} style={{ border: "none", background: "transparent", color: "#cbd5e1", cursor: "pointer", padding: 4 }} title="Remover"><i className="fas fa-trash" /></button>
                </div>
              ))}
            </div>

            <div style={{ borderTop: "1px solid #eef0f3", padding: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 400, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>Cliente</div>
              {/* Cadastrado (busca no Omie) x avulso (digitado na hora) */}
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                {([["cadastrado", "fa-address-book", "Já cadastrado"], ["novo", "fa-user-pen", "Não cadastrado"]] as const).map(([m, ic, lb]) => (
                  <button key={m} onClick={() => { setCliModo(m as "cadastrado" | "novo"); if (m === "novo") { setCliSel(null); setCliRes([]); } else setCliNovo(""); }}
                    style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px", borderRadius: 10, cursor: "pointer", fontSize: 16, fontWeight: 400,
                      border: `2px solid ${cliModo === m ? "#dc2626" : "#e2e8f0"}`, background: cliModo === m ? "#fff5f5" : "#fff", color: cliModo === m ? "#dc2626" : "#64748b" }}>
                    <i className={`fas ${ic}`} /> {lb}
                  </button>
                ))}
              </div>
              {cliModo === "novo" ? (
                <input value={cliNovo} onChange={(e) => setCliNovo(e.target.value)} placeholder="Nome do cliente"
                  style={{ width: "100%", padding: "13px 14px", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 17, boxSizing: "border-box", outline: "none", marginBottom: 12 }} />
              ) : cliSel ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, background: "#f0fdf4", border: "1px solid #bbf7d0", marginBottom: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 18, fontWeight: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cliSel.nome}</div>
                    <div style={{ fontSize: 14.5, color: "#64748b" }}>{cliSel.documento}{cliSel.cidade ? ` · ${cliSel.cidade}` : ""}</div>
                  </div>
                  <button onClick={() => { setCliSel(null); setCliQ(""); }} style={{ border: "none", background: "transparent", color: "#dc2626", cursor: "pointer", fontSize: 15, fontWeight: 400 }}>Trocar</button>
                </div>
              ) : (
                <div style={{ position: "relative", marginBottom: 12 }}>
                  <input value={cliQ} onChange={(e) => setCliQ(e.target.value)} placeholder="Buscar cliente (nome ou CNPJ)…" style={{ width: "100%", padding: "13px 14px", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 17, boxSizing: "border-box", outline: "none" }} />
                  {cliRes.length > 0 && (
                    <div style={{ position: "absolute", bottom: "100%", left: 0, right: 0, marginBottom: 4, maxHeight: 200, overflow: "auto", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, boxShadow: "0 -6px 20px rgba(0,0,0,0.12)", zIndex: 5 }}>
                      {cliRes.map((c, i) => (
                        <button key={i} onClick={() => { setCliSel(c); setCliRes([]); }} style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent", padding: "9px 12px", cursor: "pointer", borderBottom: "1px solid #f1f5f9" }}>
                          <div style={{ fontSize: 16, fontWeight: 400 }}>{c.nome}</div>
                          <div style={{ fontSize: 14, color: "#94a3b8" }}>{c.documento}{c.cidade ? ` · ${c.cidade}` : ""}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button disabled={criando || cart.length === 0 || !clienteNome} onClick={() => criarDoc("orcamento")} style={{ flex: 1, padding: "15px", borderRadius: 10, border: "2px solid #ea580c", background: "#fff", color: "#ea580c", fontWeight: 400, fontSize: 17, cursor: "pointer", opacity: criando || !clienteNome ? 0.5 : 1 }}><i className="fas fa-file-invoice" /> Orçamento</button>
                <button disabled={criando || cart.length === 0 || !clienteNome} onClick={() => criarDoc("ppv")} style={{ flex: 1, padding: "15px", borderRadius: 10, border: "none", background: "#dc2626", color: "#fff", fontWeight: 400, fontSize: 17, cursor: "pointer", opacity: criando || !clienteNome ? 0.5 : 1 }}><i className="fas fa-box" /> PPV</button>
              </div>
              <div style={{ fontSize: 14, color: "#94a3b8", marginTop: 10, textAlign: "center" }}>Os preços são puxados do Omie ao criar o documento.</div>

              {/* Salvar como carrinho */}
              <div style={{ marginTop: 14, borderTop: "1px dashed #e2e8f0", paddingTop: 14 }}>
                <div style={{ fontSize: 17, fontWeight: 400, color: "#334155", marginBottom: 10 }}><i className="fas fa-bookmark" style={{ color: "#dc2626", marginRight: 8 }} /> Salvar como carrinho</div>
                <input value={nomeCarrinho} onChange={(e) => setNomeCarrinho(e.target.value)} placeholder={modeloSel ? `Nome (ex.: Revisão ${modeloSel.nome})` : "Nome do carrinho"}
                  style={{ width: "100%", padding: "13px 14px", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 17, boxSizing: "border-box", outline: "none", marginBottom: 10 }} />
                <input value={servicoCarrinho} onChange={(e) => setServicoCarrinho(e.target.value)} placeholder="Serviço (opcional)"
                  style={{ width: "100%", padding: "13px 14px", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 17, boxSizing: "border-box", outline: "none", marginBottom: 10 }} />
                <div style={{ fontSize: 14.5, color: "#94a3b8", marginBottom: 10 }}>Cliente: {clienteNome || "—"}{modeloSel ? ` · Modelo: ${modeloSel.nome}` : ""}</div>
                <button disabled={salvandoCarrinho || cart.length === 0} onClick={salvarCarrinho}
                  style={{ width: "100%", padding: "15px", borderRadius: 10, border: "2px solid #dc2626", background: "#fff", color: "#dc2626", fontWeight: 400, fontSize: 17, cursor: "pointer", opacity: salvandoCarrinho || cart.length === 0 ? 0.5 : 1 }}>
                  <i className="fas fa-cart-shopping" /> {salvandoCarrinho ? "Salvando..." : "Salvar carrinho"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={{ position: "absolute", bottom: 18, left: "50%", transform: "translateX(-50%)", background: "#0f172a", color: "#fff", padding: "10px 18px", borderRadius: 11, fontSize: 13, fontWeight: 600, zIndex: 50, boxShadow: "0 8px 24px rgba(15,23,42,0.3)", display: "flex", alignItems: "center", gap: 8 }}><i className="fas fa-circle-check" style={{ color: "#4ade80" }} /> {toast}</div>}

      {/* Painel de carrinhos salvos */}
      {carrinhosOpen && (
        <CarrinhosPanel userName={userName}
          onEditarPecas={(c) => { setCarrinhoAtivo({ id: c.id, nome: c.nome }); setCarrinhosOpen(false); setToast(`Editando "${c.nome}" — clique nas peças pra adicionar.`); setTimeout(() => setToast(""), 2500); }}
          onClose={() => setCarrinhosOpen(false)} />
      )}

      {/* Diálogo: tamanho da imagem antes de imprimir */}
      {printDlg && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setPrintDlg(null); }}
          style={{ position: "fixed", inset: 0, zIndex: 4000, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ width: 420, maxWidth: "94vw", background: "#fff", borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}><i className="fas fa-print" style={{ color: "#dc2626", marginRight: 8 }} /> Ajustar impressão</div>
              <button onClick={() => setPrintDlg(null)} style={{ border: "none", background: "transparent", fontSize: 22, color: "#94a3b8", cursor: "pointer", lineHeight: 1 }}>&times;</button>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>Arraste a imagem para posicionar na folha, ajuste o tamanho e gire se precisar.{printDlg.comPecas ? " A lista de peças entra abaixo da imagem." : ""}</div>
              {/* Molde A4 */}
              {(() => {
                const A4W = 300; const A4H = Math.round(A4W * 297 / 210);
                const contentW = A4W * (1 - 2 * 0.06);
                const ratio = (imgDim.h || 1) / (imgDim.w || 1);
                const iw = contentW * printScale;
                const ih = iw * ratio;
                const cx = printPos.x * A4W, cy = printPos.y * A4H;
                return (
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <div ref={a4Ref}
                      onMouseMove={arrastarPos}
                      onMouseUp={() => (posDrag.current = null)}
                      onMouseLeave={() => (posDrag.current = null)}
                      style={{ position: "relative", width: A4W, height: A4H, background: "#fff", border: "1px solid #cbd5e1", boxShadow: "0 6px 20px rgba(0,0,0,0.10)", borderRadius: 4, overflow: "hidden" }}>
                      {figura?.image_url && (
                        <img src={figura.image_url} alt="" draggable={false}
                          onMouseDown={(e) => { e.preventDefault(); posDrag.current = { mx: e.clientX, my: e.clientY, px: printPos.x, py: printPos.y }; }}
                          style={{ position: "absolute", left: cx - iw / 2, top: cy - ih / 2, width: iw, height: ih, objectFit: "fill", transform: `rotate(${printRot}deg)`, transformOrigin: "center center", cursor: "grab", userSelect: "none" }} />
                      )}
                    </div>
                  </div>
                );
              })()}
              {/* Controles: girar, centralizar, tamanho */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                <button onClick={() => setPrintRot((r) => (r + 90) % 360)} title="Girar 90°"
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 9, border: "1px solid #e2e8f0", background: "#fff", color: "#334155", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  <i className="fas fa-rotate-right" /> Girar
                </button>
                <button onClick={() => setPrintPos({ x: 0.5, y: 0.45 })} title="Centralizar na folha"
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 9, border: "1px solid #e2e8f0", background: "#fff", color: "#334155", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  <i className="fas fa-arrows-to-dot" /> Centralizar
                </button>
                <div style={{ flex: 1, minWidth: 160, display: "flex", alignItems: "center", gap: 8 }}>
                  <i className="fas fa-magnifying-glass-minus" style={{ color: "#94a3b8", fontSize: 12 }} />
                  <input type="range" min={15} max={250} value={Math.round(printScale * 100)} onChange={(e) => setPrintScale(parseInt(e.target.value) / 100)} style={{ flex: 1 }} />
                  <i className="fas fa-magnifying-glass-plus" style={{ color: "#94a3b8", fontSize: 15 }} />
                  <span style={{ width: 46, textAlign: "right", fontSize: 13, fontWeight: 700, color: "#475569" }}>{Math.round(printScale * 100)}%</span>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 20px", borderTop: "1px solid #f1f5f9" }}>
              <button onClick={() => setPrintDlg(null)} style={{ padding: "10px 18px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", color: "#475569", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Cancelar</button>
              <button onClick={() => { const cp = printDlg.comPecas; const o = { scale: printScale, rot: printRot, pos: printPos }; setPrintDlg(null); gerarPdf(cp, "baixar", o); }} disabled={gerandoPdf}
                style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", color: "#334155", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}>
                <i className="fas fa-download" /> Baixar
              </button>
              <button onClick={() => { const cp = printDlg.comPecas; const o = { scale: printScale, rot: printRot, pos: printPos }; setPrintDlg(null); gerarPdf(cp, "imprimir", o); }} disabled={gerandoPdf}
                style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "#dc2626", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}>
                <i className="fas fa-print" /> Imprimir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tela cheia com caneta para desenhar sobre o desenho */}
      {fullscreen && figura?.image_url && (
        <div style={{ position: "fixed", inset: 0, zIndex: 5000, background: "rgba(15,23,42,0.94)", display: "flex", flexDirection: "column" }}>
          {/* Barra de ferramentas */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,0.12)", flexWrap: "wrap" }}>
            {/* Modo: as bolinhas e o canvas de desenho disputam o mouse, então
                alterna entre consultar peças e desenhar. */}
            <div style={{ display: "flex", gap: 6, background: "rgba(255,255,255,0.08)", padding: 4, borderRadius: 10 }}>
              {([["pecas", "fa-circle-dot", "Peças"], ["caneta", "fa-pen", "Caneta"]] as const).map(([m, ic, lb]) => (
                <button key={m} onClick={() => setFsModo(m as "pecas" | "caneta")}
                  style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 15px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 14.5, fontWeight: 400,
                    background: fsModo === m ? "#dc2626" : "transparent", color: fsModo === m ? "#fff" : "#cbd5e1" }}>
                  <i className={`fas ${ic}`} /> {lb}
                </button>
              ))}
            </div>
            {fsModo === "caneta" && (
              <>
                <div style={{ display: "flex", gap: 8 }}>
                  {CORES.map((c) => (
                    <button key={c} onClick={() => setPenColor(c)} title={c}
                      style={{ width: 26, height: 26, borderRadius: "50%", background: c, cursor: "pointer", border: penColor === c ? "3px solid #fff" : "2px solid rgba(255,255,255,0.35)", boxShadow: penColor === c ? "0 0 0 2px #dc2626" : "none" }} />
                  ))}
                </div>
                <button onClick={limparDesenho} style={fsBtn}><i className="fas fa-eraser" /> Limpar</button>
              </>
            )}
            {/* Zoom */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 6 }}>
              <button title="Afastar" onClick={() => setFsZoom((z) => Math.max(1, +(z / 1.25).toFixed(3)))} style={{ ...fsBtn, padding: "6px 12px", fontSize: 16 }}>−</button>
              <span style={{ color: "#cbd5e1", fontSize: 12, width: 40, textAlign: "center" }}>{Math.round(fsZoom * 100)}%</span>
              <button title="Aproximar" onClick={() => setFsZoom((z) => Math.min(6, +(z * 1.25).toFixed(3)))} style={{ ...fsBtn, padding: "6px 12px", fontSize: 16 }}>+</button>
            </div>
            <div style={{ flex: 1 }} />
            <button onClick={() => gerarPdfDesenho("baixar")} disabled={gerandoPdf} style={fsBtn}><i className="fas fa-download" /> Baixar PDF</button>
            <button onClick={() => gerarPdfDesenho("imprimir")} disabled={gerandoPdf} style={{ ...fsBtn, background: "rgba(255,255,255,0.16)" }}><i className="fas fa-print" /> Imprimir</button>
            <button onClick={() => { limparDesenho(); setFullscreen(false); }} style={{ ...fsBtn, background: "#dc2626", border: "none" }}><i className="fas fa-times" /> Fechar</button>
          </div>
          {/* Imagem + canvas de desenho (com zoom) */}
          <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "flex-start", justifyContent: "center", overflow: "auto", padding: 16 }}>
            <div style={{ transform: `scale(${fsZoom})`, transformOrigin: "top center", transition: "transform .1s ease" }}>
              <div style={{ position: "relative", lineHeight: 0 }}>
                <img ref={fsImgRef} src={figura.image_url} alt={figura.name} draggable={false} onLoad={ajustarCanvas}
                  style={{ maxWidth: "92vw", maxHeight: "80vh", display: "block", userSelect: "none" }} />
                <canvas ref={canvasRef}
                  onMouseDown={iniciarTraco} onMouseMove={traco} onMouseUp={terminarTraco} onMouseLeave={terminarTraco}
                  style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", cursor: fsModo === "caneta" ? "crosshair" : "default", pointerEvents: fsModo === "caneta" ? "auto" : "none" }} />
                {/* Bolinhas: passar o mouse já mostra a tira da peça embaixo */}
                {fsModo === "pecas" && (figura.hotspots || []).map((h, i) => {
                  const ativo = refHover === h.reference;
                  return (
                    <button key={i}
                      onMouseEnter={() => { setRefHover(h.reference); const p = (figura.pecas || []).find((x) => x.reference === h.reference); if (p) setFsPeca(p); }}
                      onMouseLeave={() => setRefHover(null)}
                      onClick={() => { const p = (figura.pecas || []).find((x) => x.reference === h.reference); if (p) { setPecaSel(p); setFsPeca(p); } }}
                      style={{ position: "absolute", left: `${(h.x / imgDim.w) * 100}%`, top: `${(h.y / imgDim.h) * 100}%`, transform: `translate(-50%,-50%) scale(${1 / fsZoom})`, width: ativo ? 40 : 32, height: ativo ? 40 : 32, borderRadius: "50%", border: "2.5px solid #fff", background: ativo ? "#dc2626" : "rgba(37,99,235,0.92)", color: "#fff", fontSize: ativo ? 17 : 14, fontWeight: 400, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.5)", transition: "all .12s", zIndex: ativo ? 3 : 2 }}>
                      {h.reference}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Tira da peça — aparece ao passar o mouse na bolinha */}
          {fsModo === "pecas" && fsPeca && (
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.14)", background: "rgba(15,23,42,0.98)", padding: "16px 22px", display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
              <span style={{ display: "inline-flex", width: 46, height: 46, borderRadius: "50%", alignItems: "center", justifyContent: "center", fontSize: 19, fontWeight: 400, background: "#dc2626", color: "#fff", flexShrink: 0 }}>{fsPeca.reference}</span>
              <div style={{ minWidth: 200 }}>
                <div style={{ fontSize: 12.5, color: "#94a3b8", textTransform: "uppercase", letterSpacing: .8 }}>Código</div>
                <code style={{ fontSize: 23, fontWeight: 400, color: "#f87171", fontFamily: "ui-monospace, Menlo, monospace", letterSpacing: .6 }}>{fsPeca.code}</code>
              </div>
              <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                <div style={{ fontSize: 12.5, color: "#94a3b8", textTransform: "uppercase", letterSpacing: .8 }}>Descrição</div>
                <div style={{ fontSize: 22, fontWeight: 400, color: "#fff", lineHeight: 1.3 }}>{fsPeca.name}</div>
              </div>
              {fsPeca.qtd ? (
                <div>
                  <div style={{ fontSize: 12.5, color: "#94a3b8", textTransform: "uppercase", letterSpacing: .8 }}>Quantidade</div>
                  <div style={{ fontSize: 20, fontWeight: 400, color: "#fff" }}>{fsPeca.qtd}{fsPeca.unit ? ` ${fsPeca.unit}` : ""}</div>
                </div>
              ) : null}
              <button className="cat-add" onClick={() => addPeca({ code: fsPeca.code, name: fsPeca.name })}
                style={{ display: "flex", alignItems: "center", gap: 9, padding: "13px 24px", border: "none", borderRadius: 10, background: "#dc2626", color: "#fff", fontSize: 16.5, fontWeight: 400, cursor: "pointer" }}>
                <i className="fas fa-plus" /> {onSelecionarPeca ? "Adicionar ao lançamento" : "Adicionar ao carrinho"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
