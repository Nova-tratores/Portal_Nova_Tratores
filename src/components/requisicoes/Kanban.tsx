'use client';
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import CardCapaReq from './CardCapaReq';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/useIsMobile';
import { normalizarNomePessoa } from '@/lib/texto';
import { Search, Calendar, Building2, X, Layout, UserCircle, Layers, SlidersHorizontal, Receipt, FileDown, Info, Plus, FolderOpen, FolderPlus, RotateCcw, Car, Filter, ArrowLeft, Check, Tag, ArrowLeftRight } from 'lucide-react';
import CompararReqs from './CompararReqs';

const LISTA_FORNECEDORES_CADASTRADOS = ["Rodrigo Torneiro (Panda)"];

export default function Kanban({ requisicoes, onUpdate, onPrint, onCardFechado, idDestaque = null, podeEditar = true, podeMoverFase = true, podeImprimir = true, podeExcluir = true }: any) {
  const isMobile = useIsMobile();
  // No celular mostramos UMA fase por vez, escolhida por botão (o kanban de colunas não cabe).
  const [faseMobile, setFaseMobile] = useState('pedido');
  // No celular os filtros (data/filtro/grupos/comparar) ficam num painel que abre/fecha.
  const [mobileFiltros, setMobileFiltros] = useState(false);
  // Dados compartilhados - buscados UMA vez, passados para todos os cards
  const [dadosCompartilhados, setDadosCompartilhados] = useState<{ fornecedores: any[], usuarios: any[], veiculos: any[] }>({ fornecedores: [], usuarios: [], veiculos: [] });

  // Deep-link (?req=<id>): garante que o card destacado esteja MONTADO — a
  // coluna pagina com slice, então sem isto um card antigo nem renderizaria.
  const priorizarDestaque = (lista: any[]) => {
    if (idDestaque == null) return lista;
    const i = lista.findIndex((r: any) => String(r.id) === String(idDestaque));
    if (i <= 0) return lista;
    return [lista[i], ...lista.slice(0, i), ...lista.slice(i + 1)];
  };

  useEffect(() => {
    const fetchDados = async () => {
      const [{ data: f }, { data: u }, { data: v }] = await Promise.all([
        supabase.from('Fornecedores').select('nome').order('nome'),
        supabase.from('financeiro_usu').select('nome, funcao, email').eq('ativo', true).order('nome'),
        supabase.from('SupaPlacas').select('IdPlaca, NumPlaca').order('NumPlaca'),
      ]);
      setDadosCompartilhados({ fornecedores: f || [], usuarios: u || [], veiculos: v || [] });
    };
    fetchDados();
  }, []);
  const [filtroBusca, setFiltroBusca] = useState('');
  const [filtroData, setFiltroData] = useState('');
  // Filtro único faceteado: cada critério é { campo, valor, label }.
  // Mesmo campo com vários valores = OU; campos diferentes = E.
  const [filtros, setFiltros] = useState<{ campo: string; valor: string; label: string }[]>([]);
  const [filtroMenu, setFiltroMenu] = useState(false);
  const [filtroCampo, setFiltroCampo] = useState<string | null>(null);
  const [filtroValorBusca, setFiltroValorBusca] = useState('');
  const filtroMenuRef = useRef<HTMLDivElement>(null);
  const grupoMenuRef = useRef<HTMLDivElement>(null);
  const [grupoMenu, setGrupoMenu] = useState(false);

  // ── Grupos (coletivos) de requisições ──
  const { userProfile } = useAuth();
  const usuarioAtual = userProfile?.nome || '';
  const [grupos, setGrupos] = useState<any[]>([]);
  const [grupoFiltro, setGrupoFiltro] = useState<number | null>(null);
  const [showCriar, setShowCriar] = useState(false);
  const [showGerenciar, setShowGerenciar] = useState(false);
  const [novoGrupoNome, setNovoGrupoNome] = useState('');
  const [salvandoGrupo, setSalvandoGrupo] = useState(false);
  const [renomeandoId, setRenomeandoId] = useState<number | null>(null);
  const [renomeandoNome, setRenomeandoNome] = useState('');

  // Deep-link: /requisicoes?grupo=<id> abre o kanban já filtrado por esse grupo.
  // 100% aditivo: só age uma vez, e apenas se o parâmetro existir na URL.
  const aplicouGrupoUrl = useRef(false);
  useEffect(() => {
    if (aplicouGrupoUrl.current || grupos.length === 0) return;
    const g = new URLSearchParams(window.location.search).get('grupo');
    if (g && grupos.some((x: any) => x.id === Number(g))) setGrupoFiltro(Number(g));
    aplicouGrupoUrl.current = true;
  }, [grupos]);
  const [grupoHist, setGrupoHist] = useState<any>(null);

  const recarregarGrupos = useCallback(async () => {
    try {
      const res = await fetch('/api/pos/requisicoes/grupos');
      if (res.ok) setGrupos(await res.json());
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { recarregarGrupos(); }, [recarregarGrupos]);

  const gruposAbertos = useMemo(() => grupos.filter((g: any) => g.status === 'aberto'), [grupos]);
  const gruposFechados = useMemo(() => grupos.filter((g: any) => g.status !== 'aberto'), [grupos]);
  const grupoAtivo = useMemo(() => grupos.find((g: any) => g.id === grupoFiltro) || null, [grupos, grupoFiltro]);

  const criarGrupo = useCallback(async () => {
    const nome = novoGrupoNome.trim();
    if (!nome) return;
    setSalvandoGrupo(true);
    try {
      const res = await fetch('/api/pos/requisicoes/grupos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, criado_por: usuarioAtual }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) { setNovoGrupoNome(''); setShowCriar(false); await recarregarGrupos(); }
      else { alert('Não consegui criar o grupo: ' + (j.error || res.status) + '\n\nSe a mensagem falar de "relation ... does not exist", ainda falta rodar o SQL das tabelas.'); }
    } catch (e) { alert('Erro ao criar o grupo: ' + (e instanceof Error ? e.message : String(e))); }
    setSalvandoGrupo(false);
  }, [novoGrupoNome, usuarioAtual, recarregarGrupos]);

  const mudarStatusGrupo = useCallback(async (id: number, status: string) => {
    try {
      await fetch('/api/pos/requisicoes/grupos', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status, usuario: usuarioAtual }),
      });
      if (grupoFiltro === id && status !== 'aberto') setGrupoFiltro(null);
      await recarregarGrupos();
    } catch { /* ignore */ }
  }, [usuarioAtual, recarregarGrupos, grupoFiltro]);

  const renomearGrupo = useCallback(async (id: number, nome: string) => {
    if (!nome.trim()) return;
    try {
      await fetch('/api/pos/requisicoes/grupos', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, nome: nome.trim(), usuario: usuarioAtual }),
      });
      setRenomeandoId(null); setRenomeandoNome('');
      await recarregarGrupos();
    } catch { /* ignore */ }
  }, [usuarioAtual, recarregarGrupos]);
  const [colunaArrastando, setColunaArrastando] = useState<string | null>(null);
  const [limitesPorColuna, setLimitesPorColuna] = useState<Record<string, number>>({});
  const CARDS_POR_VEZ = 20;

  const colunas = [
    { id: 'pedido', titulo: 'Pedido Realizado', cor: 'bg-red-500' },
    { id: 'completa', titulo: 'Atualizada por Técnico', cor: 'bg-cyan-500' },
    { id: 'aguardando', titulo: 'Aguardando Fornecedor', cor: 'bg-orange-400' },
    { id: 'financeiro', titulo: 'Enviado Financeiro', cor: 'bg-indigo-600' },
  ];

  const handleDragOver = (e: React.DragEvent, idColuna: string) => {
    e.preventDefault();
    setColunaArrastando(idColuna);
  };

  const handleDrop = (e: React.DragEvent, novoStatus: string) => {
    e.preventDefault();
    setColunaArrastando(null);
    if (!podeMoverFase) return; // sem permissão de mover de fase
    const idRequisicao = e.dataTransfer.getData("idRequisicao");
    if (idRequisicao) {
      const updates: any = { status: novoStatus };
      if (novoStatus === 'financeiro') {
        updates.enviado_financeiro_data = new Date().toISOString().slice(0, 10);
      }
      onUpdate(Number(idRequisicao), updates);
    }
    setColunaArrastando(null);
  };

  // Mapa email -> nome (para pesquisar técnico pelo nome, mesmo que guardado como email)
  const nomePorEmail = useMemo(() => {
    const m: Record<string, string> = {};
    (dadosCompartilhados?.usuarios || []).forEach((u: any) => { if (u.email) m[u.email.trim().toLowerCase()] = u.nome; });
    return m;
  }, [dadosCompartilhados?.usuarios]);
  const nomeSolicitante = useCallback((s: string) => {
    if (s && s.includes('@')) return nomePorEmail[s.trim().toLowerCase()] || s;
    return s || '';
  }, [nomePorEmail]);

  // ── Filtro único faceteado ──
  // Mapa IdPlaca -> NumPlaca (o campo veiculo guarda o Id)
  const placaPorId = useMemo(() => {
    const m: Record<string, string> = {};
    (dadosCompartilhados?.veiculos || []).forEach((v: any) => { m[String(v.IdPlaca)] = v.NumPlaca; });
    return m;
  }, [dadosCompartilhados?.veiculos]);
  const veiculoLabel = useCallback((val: string) => placaPorId[String(val)] || val, [placaPorId]);

  const STATUS_LABEL: Record<string, string> = {
    pedido: 'Pedido Realizado', completa: 'Atualizada por Técnico',
    aguardando: 'Aguardando Fornecedor', financeiro: 'Enviado Financeiro',
  };

  const CAMPOS_FILTRO = useMemo(() => ([
    { key: 'solicitante', label: 'Solicitante', Icon: UserCircle },
    { key: 'tipo', label: 'Tipo', Icon: Tag },
    { key: 'veiculo', label: 'Veículo', Icon: Car },
    { key: 'fornecedor', label: 'Fornecedor', Icon: Building2 },
    { key: 'status', label: 'Fase', Icon: Layout },
  ]), []);

  // Valor "bruto" de cada campo numa requisição (o que é comparado no filtro).
  // Solicitante é NORMALIZADO (Title Case): "NICOLAS DARIO" e "Nicolas Dario"
  // são a mesma pessoa — sem isso o facet mostrava o nome duplicado, um pra
  // cada caixa em que foi digitado.
  const valorCampo = useCallback((r: any, campo: string): string => {
    if (campo === 'solicitante') return normalizarNomePessoa(nomeSolicitante(r.solicitante)) || '';
    if (campo === 'veiculo') return String(r.veiculo ?? '').trim();
    return String(r[campo] ?? '').trim();
  }, [nomeSolicitante]);
  // Rótulo exibível de um valor
  const rotuloValor = useCallback((campo: string, valor: string): string => {
    if (campo === 'veiculo') return veiculoLabel(valor);
    if (campo === 'status') return STATUS_LABEL[valor] || valor;
    return valor;
  }, [veiculoLabel]);

  // Opções distintas (com contagem) por campo, a partir das requisições ativas
  const opcoesPorCampo = useMemo(() => {
    const base = requisicoes.filter((r: any) => r.status !== 'lixeira');
    const out: Record<string, { valor: string; label: string; qtd: number }[]> = {};
    for (const c of CAMPOS_FILTRO) {
      const cont: Record<string, number> = {};
      for (const r of base) {
        const v = valorCampo(r, c.key);
        if (!v) continue;
        cont[v] = (cont[v] || 0) + 1;
      }
      out[c.key] = Object.entries(cont)
        .map(([valor, qtd]) => ({ valor, label: rotuloValor(c.key, valor), qtd }))
        .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
    }
    return out;
  }, [requisicoes, CAMPOS_FILTRO, valorCampo, rotuloValor]);

  const temFiltroCampo = useCallback((campo: string, valor: string) => filtros.some(f => f.campo === campo && f.valor === valor), [filtros]);
  const alternarFiltro = useCallback((campo: string, valor: string, label: string) => {
    setFiltros(prev => prev.some(f => f.campo === campo && f.valor === valor)
      ? prev.filter(f => !(f.campo === campo && f.valor === valor))
      : [...prev, { campo, valor, label }]);
  }, []);
  const removerFiltro = useCallback((campo: string, valor: string) => {
    setFiltros(prev => prev.filter(f => !(f.campo === campo && f.valor === valor)));
  }, []);

  // Fecha o menu ao clicar fora
  useEffect(() => {
    if (!filtroMenu) return;
    const onDoc = (e: MouseEvent) => {
      if (filtroMenuRef.current && !filtroMenuRef.current.contains(e.target as Node)) {
        setFiltroMenu(false); setFiltroCampo(null); setFiltroValorBusca('');
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [filtroMenu]);

  useEffect(() => {
    if (!grupoMenu) return;
    const onDoc = (e: MouseEvent) => {
      if (grupoMenuRef.current && !grupoMenuRef.current.contains(e.target as Node)) setGrupoMenu(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [grupoMenu]);

  const filtradas = useMemo(() => {
    const q = filtroBusca.trim().toLowerCase();
    const idsGrupo = grupoAtivo ? new Set((grupoAtivo.membros || []).map((x: any) => Number(x))) : null;
    // Agrupa os critérios por campo: mesmo campo = OU; campos diferentes = E.
    const porCampo: Record<string, Set<string>> = {};
    for (const f of filtros) { (porCampo[f.campo] ||= new Set()).add(f.valor); }
    const campos = Object.keys(porCampo);
    return requisicoes.filter((r: any) => {
      if (idsGrupo && !idsGrupo.has(Number(r.id))) return false;
      // Filtro faceteado
      for (const campo of campos) {
        if (!porCampo[campo].has(valorCampo(r, campo))) return false;
      }
      const matchData = filtroData ? (r.data || '').startsWith(filtroData) : true;
      if (!q) return matchData;
      const alvo = [
        String(r.id || ''),
        r.titulo || '',
        r.fornecedor || '',
        r.numero_nota || '',
        r.solicitante || '',
        nomeSolicitante(r.solicitante),
        r.tipo || '',
      ].join(' ').toLowerCase();
      return matchData && alvo.includes(q);
    });
  }, [requisicoes, filtroBusca, filtroData, nomeSolicitante, grupoAtivo, filtros, valorCampo]);

  const temFiltroAtivo = filtroBusca || filtroData || filtros.length > 0;
  const limparFiltros = () => { setFiltroBusca(''); setFiltroData(''); setFiltros([]); };
  const resultCount = filtradas.filter((r: any) => r.status !== 'lixeira').length;

  const gerarPdfCobranca = async (fornecedor?: string) => {
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    const margin = 20;
    const pageWidth = doc.internal.pageSize.getWidth();

    // Filtrar requisições da coluna aguardando
    let aguardando = filtradas.filter((r: any) => r.status === 'aguardando');
    if (fornecedor) aguardando = aguardando.filter((r: any) => r.fornecedor === fornecedor);

    // Agrupar por fornecedor
    const porFornecedor: Record<string, any[]> = {};
    for (const r of aguardando) {
      const f = r.fornecedor || 'Sem fornecedor';
      if (!porFornecedor[f]) porFornecedor[f] = [];
      porFornecedor[f].push(r);
    }

    const hora = new Date().getHours();
    const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
    const dataHoje = new Date().toLocaleDateString('pt-BR');
    let firstPage = true;

    for (const [nomeForn, reqs] of Object.entries(porFornecedor)) {
      if (!firstPage) doc.addPage();
      firstPage = false;

      let y = margin;

      // Header
      doc.setFillColor(220, 38, 38);
      doc.rect(0, 0, pageWidth, 22, 'F');
      doc.setTextColor(255);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('NOVA TRATORES MAQUINAS AGRICOLAS LTDA', margin, 14);

      y = 32;
      doc.setTextColor(0);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`Data: ${dataHoje}`, margin, y);
      doc.text(`Fornecedor: ${nomeForn}`, margin, y + 5);
      y += 16;

      // Saudação
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      const texto = `${saudacao},`;
      doc.text(texto, margin, y);
      y += 8;

      const intro = `Gostaríamos de solicitar o envio das Notas Fiscais e respectivos boletos referentes às requisições abaixo listadas. Pedimos a gentileza de providenciar o mais breve possível para que possamos dar andamento ao processo financeiro.`;
      const splitIntro = doc.splitTextToSize(intro, pageWidth - margin * 2);
      doc.setFontSize(10);
      doc.text(splitIntro, margin, y);
      y += splitIntro.length * 5 + 8;

      // Tabela de requisições
      doc.setFillColor(245, 245, 245);
      doc.rect(margin, y, pageWidth - margin * 2, 8, 'F');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(80);
      doc.text('ID', margin + 3, y + 5.5);
      doc.text('TITULO', margin + 25, y + 5.5);
      doc.text('VALOR', pageWidth - margin - 3, y + 5.5, { align: 'right' });
      y += 10;

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30);
      for (const r of reqs) {
        if (y > 260) { doc.addPage(); y = margin; }
        doc.setFontSize(9);
        doc.text(`#${r.id}`, margin + 3, y + 4);
        const tituloTrunc = (r.titulo || '').substring(0, 60) + ((r.titulo || '').length > 60 ? '...' : '');
        doc.text(tituloTrunc, margin + 25, y + 4);
        doc.text(`R$ ${r.valor_despeza || '0,00'}`, pageWidth - margin - 3, y + 4, { align: 'right' });
        doc.setDrawColor(230);
        doc.line(margin, y + 7, pageWidth - margin, y + 7);
        y += 9;
      }

      y += 10;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const encerramento = 'Desde já agradecemos a atenção e ficamos no aguardo do retorno.';
      doc.text(encerramento, margin, y);
      y += 12;

      doc.setFont('helvetica', 'bold');
      doc.text('Atenciosamente,', margin, y);
      y += 6;
      doc.setFont('helvetica', 'normal');
      doc.text('Nova Tratores Máquinas Agrícolas Ltda.', margin, y);
      y += 5;
      doc.setFontSize(9);
      doc.setTextColor(120);
      doc.text('Departamento de Compras / Pós-Vendas', margin, y);
    }

    const nomeArquivo = fornecedor
      ? `Cobranca_NF_${fornecedor.replace(/\s/g, '_')}_${dataHoje.replace(/\//g, '-')}.pdf`
      : `Cobranca_NF_Fornecedores_${dataHoje.replace(/\//g, '-')}.pdf`;
    doc.save(nomeArquivo);
  };

  // ── Comparar duas requisições ──
  // No modo comparação o clique no card SELECIONA em vez de abrir; ao juntar
  // duas, a tela lado a lado abre sozinha.
  const [modoComparar, setModoComparar] = useState(false);
  const [escolhidas, setEscolhidas] = useState<any[]>([]);
  const [comparando, setComparando] = useState<[any, any] | null>(null);

  const escolherParaComparar = useCallback((req: any) => {
    setEscolhidas(prev => {
      if (prev.some(r => String(r.id) === String(req.id))) return prev.filter(r => String(r.id) !== String(req.id));
      const nova = [...prev, req].slice(-2);
      if (nova.length === 2) setComparando([nova[0], nova[1]]);
      return nova;
    });
  }, []);

  const sairDaComparacao = () => { setModoComparar(false); setEscolhidas([]); setComparando(null); };

  const pillBase = "px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap";
  const pillActive = "bg-red-600 text-white border-red-600";
  const pillInactive = "bg-white text-zinc-500 border-zinc-200 hover:border-red-300 hover:text-red-600";
  const inputInline = "bg-white text-zinc-800 text-[13px] rounded-full px-3 py-1.5 outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 transition-all placeholder:text-zinc-400 border border-zinc-200";
  const selectInline = `${inputInline} appearance-none cursor-pointer pr-7`;

  return (
    <div className="w-full bg-zinc-50 min-h-screen transition-all duration-700 pb-20">

      {/* BARRA DE FILTROS — inline compacta */}
      <div className="w-full px-3 md:px-6 pt-3 md:pt-4 pb-2">
        <div className="flex items-center gap-2 flex-wrap">

          {/* BUSCA UNIFICADA (pesquisa em vários campos) — largura total no celular */}
          <div className="relative w-full md:flex-1 md:w-auto min-w-0 md:min-w-[260px] md:max-w-[460px] group">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-red-500 pointer-events-none"/>
            <input
              type="text"
              placeholder="Pesquisar requisição..."
              value={filtroBusca}
              onChange={e => setFiltroBusca(e.target.value)}
              className={`${inputInline} pl-9 pr-8 w-full ${filtroBusca ? '!border-red-400 !bg-red-50' : ''}`}
            />
            {filtroBusca
              ? <button onClick={() => setFiltroBusca('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-red-500"><X size={13}/></button>
              : <Info size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-300 pointer-events-none"/>
            }
            {/* Tooltip ao passar o rato — mostra os campos pesquisáveis */}
            <div className="absolute left-0 top-full mt-1.5 z-30 hidden group-hover:block pointer-events-none">
              <div className="bg-zinc-900 text-white text-[11px] leading-relaxed rounded-lg px-3 py-2 shadow-xl whitespace-nowrap">
                <p className="font-bold text-red-300 mb-0.5">Pesquise por:</p>
                <p>Nº ID · Título · Fornecedor · Nº da Nota · Solicitante · Tipo</p>
              </div>
            </div>
          </div>

          {/* Botão "Filtros" — só no celular: abre/fecha o painel abaixo */}
          {isMobile && (() => {
            const nAtivos = filtros.length + (filtroData ? 1 : 0) + (grupoFiltro != null ? 1 : 0);
            return (
              <button onClick={() => setMobileFiltros(v => !v)}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-full border text-sm font-semibold transition-all ${mobileFiltros || nAtivos ? 'border-red-300 bg-red-50 text-red-600' : 'border-zinc-200 bg-white text-zinc-600'}`}>
                <SlidersHorizontal size={14} /> Filtros
                {nAtivos > 0 && <span className="text-[10px] font-bold px-1.5 rounded-full bg-red-600 text-white">{nAtivos}</span>}
              </button>
            );
          })()}

          {/* No PC (md:contents) os controles fluem direto na barra; no celular viram
              um painel (fundo/borda só no mobile) que só aparece com "Filtros" aberto. */}
          <div className={`w-full md:w-auto ${mobileFiltros ? 'flex' : 'hidden'} md:contents flex-wrap items-center gap-2 mt-1 md:mt-0 p-3 md:p-0 bg-white md:bg-transparent rounded-2xl border border-zinc-200 md:border-0`}>

          {/* Separador */}
          <div className="w-px h-5 bg-zinc-200 hidden md:block" />

          {/* Data exata */}
          <div className="relative shrink-0" title="Pesquisar por data exata">
            <Calendar size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none z-10"/>
            <input
              type="date"
              value={filtroData}
              onChange={e => setFiltroData(e.target.value)}
              className={`${inputInline} pl-7 pr-2 ${filtroData ? '!border-red-400 !bg-red-50 !text-red-700' : ''}`}
            />
            {filtroData && <button onClick={() => setFiltroData('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-red-500 bg-white"><X size={12}/></button>}
          </div>

          {/* Separador */}
          <div className="w-px h-5 bg-zinc-200 hidden md:block" />

          {/* FILTRO ÚNICO (faceteado): Solicitante · Tipo · Veículo · Fornecedor · Fase */}
          <div className="relative shrink-0" ref={filtroMenuRef}>
            <button
              onClick={() => { setFiltroMenu(v => !v); setFiltroCampo(null); setFiltroValorBusca(''); }}
              className={`${pillBase} ${filtros.length > 0 || filtroMenu ? pillActive : pillInactive}`}
              title="Filtrar por solicitante, tipo, veículo, fornecedor ou fase"
            >
              <Filter size={13} /> Filtro
              {filtros.length > 0 && (
                <span className={`ml-0.5 text-[10px] font-bold px-1.5 rounded-full ${filtros.length > 0 ? 'bg-white/25' : 'bg-zinc-100 text-zinc-500'}`}>{filtros.length}</span>
              )}
            </button>

            {filtroMenu && (
              <div className="absolute left-0 top-full mt-1.5 z-40 w-72 bg-white rounded-xl shadow-2xl border border-zinc-200 overflow-hidden">
                {!filtroCampo ? (
                  <div className="py-1.5">
                    <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400">Filtrar por</div>
                    {CAMPOS_FILTRO.map(c => {
                      const nAtivos = filtros.filter(f => f.campo === c.key).length;
                      return (
                        <button key={c.key} onClick={() => { setFiltroCampo(c.key); setFiltroValorBusca(''); }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-zinc-700 hover:bg-red-50 hover:text-red-600 transition-colors">
                          <c.Icon size={14} className="text-zinc-400" />
                          <span className="flex-1 text-left font-medium">{c.label}</span>
                          {nAtivos > 0 && <span className="text-[10px] font-bold bg-red-100 text-red-600 px-1.5 rounded-full">{nAtivos}</span>}
                          <span className="text-zinc-300">›</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col max-h-[340px]">
                    <div className="flex items-center gap-2 px-2 py-2 border-b border-zinc-100">
                      <button onClick={() => { setFiltroCampo(null); setFiltroValorBusca(''); }} className="p-1 text-zinc-400 hover:text-red-500"><ArrowLeft size={15} /></button>
                      <span className="text-[13px] font-bold text-zinc-700">{CAMPOS_FILTRO.find(c => c.key === filtroCampo)?.label}</span>
                    </div>
                    <div className="p-2 border-b border-zinc-100">
                      <input autoFocus value={filtroValorBusca} onChange={e => setFiltroValorBusca(e.target.value)}
                        placeholder="Buscar..." className="w-full text-[13px] bg-zinc-50 border border-zinc-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-red-400" />
                    </div>
                    <div className="overflow-y-auto py-1">
                      {(() => {
                        const opcoes = (opcoesPorCampo[filtroCampo] || []).filter(o => o.label.toLowerCase().includes(filtroValorBusca.trim().toLowerCase()));
                        if (opcoes.length === 0) return <div className="px-3 py-6 text-center text-[12px] text-zinc-400">Nada encontrado</div>;
                        return opcoes.map(o => {
                          const ativo = temFiltroCampo(filtroCampo!, o.valor);
                          return (
                            <button key={o.valor} onClick={() => alternarFiltro(filtroCampo!, o.valor, o.label)}
                              className={`w-full flex items-center gap-2 px-3 py-2 text-[13px] transition-colors ${ativo ? 'bg-red-50 text-red-600 font-semibold' : 'text-zinc-700 hover:bg-zinc-50'}`}>
                              <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${ativo ? 'bg-red-600 border-red-600' : 'border-zinc-300'}`}>
                                {ativo && <Check size={11} className="text-white" />}
                              </span>
                              <span className="flex-1 text-left truncate">{o.label}</span>
                              <span className="text-[10px] font-bold text-zinc-400">{o.qtd}</span>
                            </button>
                          );
                        });
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Chips dos filtros ativos */}
          {filtros.map(f => {
            const campoLabel = CAMPOS_FILTRO.find(c => c.key === f.campo)?.label || f.campo;
            return (
              <span key={`${f.campo}:${f.valor}`} className="inline-flex items-center gap-1.5 text-[12px] font-semibold bg-red-50 text-red-700 border border-red-200 rounded-full pl-2.5 pr-1.5 py-1">
                <span className="text-red-400 font-bold text-[10px] uppercase">{campoLabel}</span>
                {f.label}
                <button onClick={() => removerFiltro(f.campo, f.valor)} className="text-red-400 hover:text-red-600"><X size={12} /></button>
              </span>
            );
          })}

          {/* Separador */}
          <div className="w-px h-5 bg-zinc-200 hidden md:block" />

          {/* GRUPOS (coletivos de requisições) */}
          {/* Grupos num dropdown só — antes eram N pílulas soltas poluindo a barra */}
          <div className="relative shrink-0" ref={grupoMenuRef}>
            <button
              onClick={() => setGrupoMenu(v => !v)}
              title="Filtrar por grupo, criar ou gerenciar grupos"
              className={`${pillBase} ${grupoFiltro != null || grupoMenu ? pillActive : pillInactive}`}
            >
              <Layers size={13} /> {grupoFiltro != null ? (gruposAbertos.find((g: any) => g.id === grupoFiltro)?.nome || 'Grupos') : 'Grupos'}
              {grupoFiltro != null
                ? <X size={12} className="ml-0.5" onClick={(e) => { e.stopPropagation(); setGrupoFiltro(null); }} />
                : gruposAbertos.length > 0 && <span className="ml-0.5 text-[10px] font-bold px-1.5 rounded-full bg-zinc-100 text-zinc-500">{gruposAbertos.length}</span>}
            </button>

            {grupoMenu && (
              <div className="absolute left-0 top-full mt-1.5 z-40 w-72 bg-white rounded-xl shadow-2xl border border-zinc-200 overflow-hidden">
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400">Filtrar por grupo</div>
                <div className="max-h-[300px] overflow-y-auto pb-1">
                  {gruposAbertos.length === 0 ? (
                    <div className="px-3 py-2 text-[13px] text-zinc-400 italic">Nenhum grupo aberto</div>
                  ) : gruposAbertos.map((g: any) => {
                    const ativo = grupoFiltro === g.id;
                    return (
                      <button key={g.id} onClick={() => { setGrupoFiltro(ativo ? null : g.id); setGrupoMenu(false); }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-[13px] transition-colors ${ativo ? 'bg-red-50 text-red-600' : 'text-zinc-700 hover:bg-zinc-50'}`}>
                        <FolderOpen size={14} className={ativo ? 'text-red-500' : 'text-zinc-400'} />
                        <span className="flex-1 text-left font-medium truncate">{g.nome}</span>
                        <span className={`text-[10px] font-bold px-1.5 rounded-full ${ativo ? 'bg-red-100 text-red-600' : 'bg-zinc-100 text-zinc-500'}`}>{(g.membros || []).length}</span>
                        {ativo && <X size={13} />}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2 p-2 border-t border-zinc-100 bg-zinc-50/60">
                  <button onClick={() => { setGrupoMenu(false); setNovoGrupoNome(''); setShowCriar(true); }}
                    className="flex-1 text-[12px] font-bold px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 flex items-center justify-center gap-1.5">
                    <Plus size={14} /> Novo grupo
                  </button>
                  <button onClick={() => { setGrupoMenu(false); setShowGerenciar(true); }}
                    className="flex-1 text-[12px] font-semibold px-3 py-2 rounded-lg border border-zinc-300 text-zinc-600 hover:border-zinc-500 flex items-center justify-center gap-1.5">
                    <SlidersHorizontal size={13} /> Gerenciar{grupos.length > 0 ? ` (${grupos.length})` : ''}
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => (modoComparar ? sairDaComparacao() : setModoComparar(true))}
            title="Escolher duas requisições e ver lado a lado"
            className={`${pillBase} shrink-0 ${modoComparar ? pillActive : 'bg-white text-zinc-600 border-zinc-200 hover:border-red-300 hover:text-red-600'}`}
          >
            <ArrowLeftRight size={12} /> Comparar
          </button>

          {/* Contador + Limpar */}
          {temFiltroAtivo && (
            <>
              <span className="text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full shrink-0">{resultCount}</span>
              <button onClick={limparFiltros} className={`${pillBase} ${pillActive} shrink-0`}>
                <X size={12} /> Limpar
              </button>
            </>
          )}
          </div>{/* fim fileira de controles secundários (mobile) */}
        </div>

        {/* Barra do modo comparação */}
        {modoComparar && (
          <div className="mt-2 flex items-center gap-3 flex-wrap bg-amber-50 border border-amber-200 rounded-xl px-4 py-2">
            <span className="text-[13px] font-bold text-amber-800 flex items-center gap-1.5"><ArrowLeftRight size={14} /> Modo comparação</span>
            <span className="text-[12px] text-amber-700">
              {escolhidas.length === 0 ? 'Clique em duas requisições, em qualquer coluna.'
                : escolhidas.length === 1 ? `#${escolhidas[0].id} escolhida — falta a segunda.`
                : `#${escolhidas[0].id} × #${escolhidas[1].id}`}
            </span>
            <div className="ml-auto flex items-center gap-2">
              {escolhidas.length === 2 && (
                <button onClick={() => setComparando([escolhidas[0], escolhidas[1]])} className="text-[11px] font-semibold text-white bg-amber-600 px-2.5 py-1 rounded-full hover:bg-amber-700">Ver lado a lado</button>
              )}
              {escolhidas.length > 0 && (
                <button onClick={() => setEscolhidas([])} className="text-[11px] font-semibold text-zinc-600 bg-white border border-zinc-200 px-2.5 py-1 rounded-full hover:border-zinc-400">Limpar escolha</button>
              )}
              <button onClick={sairDaComparacao} className="text-zinc-400 hover:text-red-500"><X size={14} /></button>
            </div>
          </div>
        )}

        {/* Banner do grupo ativo */}
        {grupoAtivo && (
          <div className="mt-2 flex items-center gap-3 flex-wrap bg-red-50 border border-red-200 rounded-xl px-4 py-2">
            <span className="text-[13px] font-bold text-red-700 flex items-center gap-1.5"><FolderOpen size={14} /> {grupoAtivo.nome}</span>
            <span className="text-[11px] text-red-500">{(grupoAtivo.membros || []).length} requisição(ões) neste grupo</span>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => setGrupoHist(grupoAtivo)} className="text-[11px] font-semibold text-zinc-600 bg-white border border-zinc-200 px-2.5 py-1 rounded-full hover:border-zinc-400">Histórico</button>
              <button onClick={() => mudarStatusGrupo(grupoAtivo.id, 'concluido')} className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full hover:bg-emerald-100">Concluir grupo</button>
              <button onClick={() => mudarStatusGrupo(grupoAtivo.id, 'cancelado')} className="text-[11px] font-semibold text-zinc-600 bg-white border border-zinc-200 px-2.5 py-1 rounded-full hover:border-red-300 hover:text-red-600">Cancelar grupo</button>
              <button onClick={() => setGrupoFiltro(null)} className="text-zinc-400 hover:text-red-500"><X size={14} /></button>
            </div>
          </div>
        )}
      </div>

      {/* Modal CRIAR grupo */}
      {showCriar && (
        <div className="fixed inset-0 z-[9200] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowCriar(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-6 py-5 border-b border-zinc-100">
              <div className="w-11 h-11 rounded-xl bg-red-600 text-white flex items-center justify-center"><FolderPlus size={20} /></div>
              <div>
                <h3 className="text-lg font-bold text-zinc-900">Novo grupo</h3>
                <p className="text-[12px] text-zinc-400">Junte requisições com o mesmo propósito</p>
              </div>
            </div>
            <div className="p-6">
              <label className="text-[12px] font-bold text-zinc-500 uppercase tracking-wider mb-2 block">Nome do grupo</label>
              <input autoFocus value={novoGrupoNome} onChange={e => setNovoGrupoNome(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') criarGrupo(); if (e.key === 'Escape') setShowCriar(false); }}
                placeholder="Ex.: Peças da colheita 2026" className="w-full text-[15px] text-zinc-900 bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none focus:border-red-500 focus:bg-white" />
              <div className="flex gap-3 mt-5">
                <button onClick={() => setShowCriar(false)} className="flex-1 py-3 rounded-xl border border-zinc-200 text-zinc-600 text-sm font-semibold hover:bg-zinc-50">Cancelar</button>
                <button onClick={criarGrupo} disabled={!novoGrupoNome.trim() || salvandoGrupo} className="flex-1 py-3 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-40 flex items-center justify-center gap-2">
                  {salvandoGrupo ? 'Criando...' : <><Plus size={16} /> Criar grupo</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal GERENCIAR grupos (todos) */}
      {showGerenciar && (
        <div className="fixed inset-0 z-[9000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => { setShowGerenciar(false); setRenomeandoId(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-100">
              <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2"><SlidersHorizontal size={20} /> Gerenciar grupos</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => { setNovoGrupoNome(''); setShowCriar(true); }} className="text-[13px] font-bold text-white bg-red-600 px-3 py-1.5 rounded-lg hover:bg-red-700 flex items-center gap-1.5"><Plus size={15} /> Novo grupo</button>
                <button onClick={() => { setShowGerenciar(false); setRenomeandoId(null); }} className="text-zinc-400 hover:text-red-500"><X size={20} /></button>
              </div>
            </div>
            <div className="overflow-y-auto p-4 flex flex-col gap-2.5">
              {grupos.length === 0 ? (
                <p className="text-sm text-zinc-400 text-center py-10">Nenhum grupo ainda. Clique em <b>Novo grupo</b> pra criar o primeiro.</p>
              ) : grupos.map((g: any) => (
                <div key={g.id} className="flex items-center gap-3 border border-zinc-200 rounded-xl px-4 py-3">
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 ${g.status === 'aberto' ? 'bg-red-50 text-red-600' : g.status === 'concluido' ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>{g.status === 'aberto' ? 'Aberto' : g.status === 'concluido' ? 'Concluído' : 'Cancelado'}</span>
                  <div className="flex-1 min-w-0">
                    {renomeandoId === g.id ? (
                      <input autoFocus value={renomeandoNome} onChange={e => setRenomeandoNome(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') renomearGrupo(g.id, renomeandoNome); if (e.key === 'Escape') setRenomeandoId(null); }}
                        onBlur={() => renomearGrupo(g.id, renomeandoNome)}
                        className="w-full text-sm font-semibold text-zinc-800 bg-zinc-50 border border-red-300 rounded-lg px-2 py-1 outline-none" />
                    ) : (
                      <div className="text-[15px] font-semibold text-zinc-800 truncate flex items-center gap-2">
                        {g.nome}
                        <button onClick={() => { setRenomeandoId(g.id); setRenomeandoNome(g.nome); }} title="Renomear" className="text-zinc-300 hover:text-red-500"><SlidersHorizontal size={12} /></button>
                      </div>
                    )}
                    <div className="text-[12px] text-zinc-400">{(g.membros || []).length} requisição(ões) · criado por {g.criado_por || '—'}</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => { setGrupoFiltro(g.id); setShowGerenciar(false); }} title="Ver no kanban" className="text-[12px] font-semibold text-zinc-600 bg-white border border-zinc-200 px-2.5 py-1.5 rounded-lg hover:border-red-300 hover:text-red-600 flex items-center gap-1"><FolderOpen size={13} /> Ver</button>
                    <button onClick={() => setGrupoHist(g)} title="Histórico" className="text-[12px] font-semibold text-zinc-500 bg-white border border-zinc-200 px-2.5 py-1.5 rounded-lg hover:border-zinc-400">Histórico</button>
                    {g.status === 'aberto' ? (
                      <>
                        <button onClick={() => mudarStatusGrupo(g.id, 'concluido')} title="Concluir" className="text-[12px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-lg hover:bg-emerald-100">Concluir</button>
                        <button onClick={() => mudarStatusGrupo(g.id, 'cancelado')} title="Cancelar" className="text-[12px] font-semibold text-zinc-600 bg-white border border-zinc-200 px-2.5 py-1.5 rounded-lg hover:border-red-300 hover:text-red-600">Cancelar</button>
                      </>
                    ) : (
                      <button onClick={() => mudarStatusGrupo(g.id, 'aberto')} title="Reabrir" className="text-[12px] font-semibold text-red-600 bg-red-50 border border-red-200 px-2.5 py-1.5 rounded-lg hover:bg-red-100 flex items-center gap-1"><RotateCcw size={13} /> Reabrir</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal de histórico do grupo */}
      {grupoHist && (
        <div className="fixed inset-0 z-[9100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setGrupoHist(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
              <div>
                <h3 className="text-base font-bold text-zinc-800 flex items-center gap-2"><Layers size={17} /> {grupoHist.nome}</h3>
                <p className="text-[11px] text-zinc-400">Histórico do grupo</p>
              </div>
              <button onClick={() => setGrupoHist(null)} className="text-zinc-400 hover:text-red-500"><X size={18} /></button>
            </div>
            <div className="overflow-y-auto p-4 flex flex-col gap-2">
              {(!Array.isArray(grupoHist.historico) || grupoHist.historico.length === 0) ? (
                <p className="text-sm text-zinc-400 text-center py-8">Sem histórico.</p>
              ) : [...grupoHist.historico].reverse().map((h: any, i: number) => (
                <div key={i} className="flex items-start gap-2 border border-zinc-100 rounded-lg px-3 py-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-zinc-700">
                      <span className="font-semibold">{h.usuario || '—'}</span>{' '}
                      <span className="text-zinc-500">{h.acao}</span>
                      {h.req_id ? <span className="text-zinc-500"> a requisição <span className="font-semibold text-red-600">#{h.req_id}</span></span> : null}
                      {h.detalhe ? <span className="text-zinc-500"> — {h.detalhe}</span> : null}
                    </div>
                    <div className="text-[10px] text-zinc-400">{h.em ? new Date(h.em).toLocaleString('pt-BR') : ''}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* GRADE KANBAN - COLUNAS COM DESIGNER SLIM */}
      <div className="px-3 md:px-6 mt-2">
        {/* CELULAR: seletor de fase por botão (mostra uma fase por vez) */}
        {isMobile && (
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-3 -mx-3 px-3">
            {colunas.map((col) => {
              const n = filtradas.filter((r: any) => r.status === col.id).length;
              const ativo = faseMobile === col.id;
              return (
                <button key={col.id} onClick={() => setFaseMobile(col.id)}
                  className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold border transition-all ${
                    ativo ? 'bg-red-600 border-red-600 text-white shadow-sm' : 'bg-white border-zinc-200 text-zinc-600'
                  }`}>
                  <span className={`w-2 h-2 rounded-full ${col.cor}`}></span>
                  {col.titulo}
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${ativo ? 'bg-white/25 text-white' : 'bg-zinc-100 text-zinc-500'}`}>{n}</span>
                </button>
              );
            })}
          </div>
        )}
        {/* No PC as colunas ficam lado a lado; no celular renderiza só a fase escolhida */}
        <div className="flex flex-col md:flex-row gap-4 md:overflow-x-auto pb-8 scrollbar-hide justify-start md:justify-center">
          {(isMobile ? colunas.filter((c) => c.id === faseMobile) : colunas).map((col) => {
            let items = filtradas.filter((r: any) => r.status === col.id);
            if (col.id === 'financeiro') {
              items = [...items].sort((a: any, b: any) => {
                const da = a.enviado_financeiro_data || a.data || '';
                const db = b.enviado_financeiro_data || b.data || '';
                return db.localeCompare(da);
              });
            }
            if (col.id === 'aguardando') {
              items = [...items].sort((a: any, b: any) => {
                const da = a.data || '';
                const db = b.data || '';
                return db.localeCompare(da);
              });
            }
            const isOver = colunaArrastando === col.id;

            return (
              <div 
                key={col.id} 
                onDragOver={(e) => handleDragOver(e, col.id)}
                onDragLeave={() => setColunaArrastando(null)}
                onDrop={(e) => handleDrop(e, col.id)}
                className={`w-full md:flex-1 md:min-w-[280px] md:max-w-[380px] flex flex-col rounded-2xl transition-all duration-300 border ${
                  isOver ? 'bg-red-50/50 border-red-200' : 'bg-transparent border-transparent'
                }`}
              >
                {/* TÍTULOS DAS FASES */}
                <div className="py-4 px-6 bg-white/95 backdrop-blur-sm rounded-t-2xl border-b border-zinc-200">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xs font-medium text-zinc-600 uppercase tracking-[0.2em]">
                      {col.titulo}
                    </h3>
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs font-medium text-zinc-400">{items.length}</span>
                      <div className={`w-2 h-2 rounded-full ${col.cor}`}></div>
                    </div>
                  </div>
                  {col.id === 'aguardando' && items.length > 0 && (() => {
                    // Fornecedores atualmente no filtro único (se houver)
                    const fornSel = filtros.filter(f => f.campo === 'fornecedor').map(f => f.label);
                    const alvo = fornSel.length === 1 ? fornSel[0] : undefined;
                    return (
                      <div className="mt-3">
                        <button
                          onClick={() => gerarPdfCobranca(alvo)}
                          className="w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold text-orange-600 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-full py-1.5 px-3 transition-all cursor-pointer"
                          title={alvo ? `Gerar cobrança para ${alvo}` : 'Gerar cobrança (usa o filtro de fornecedor, se houver)'}
                        >
                          <FileDown size={12} />
                          Cobrar NF/Boleto {fornSel.length ? `(${fornSel.length === 1 ? fornSel[0] : `${fornSel.length} forn.`})` : '(todos)'}
                        </button>
                      </div>
                    );
                  })()}
                </div>

                {/* ÁREA DOS CARDS — no celular SEM scroll próprio (rola a página inteira);
                    no PC cada coluna tem seu scroll de até 72vh. */}
                <div className="p-4 space-y-4 flex-1 md:max-h-[72vh] md:overflow-y-auto scrollbar-hide">
                  {items.length > 0 ? (
                    <>
                      {priorizarDestaque(items).slice(0, limitesPorColuna[col.id] || CARDS_POR_VEZ).map((req: any) => (
                        <CardCapaReq
                          key={req.id}
                          req={req}
                          onUpdate={onUpdate}
                          onPrint={onPrint}
                          dadosCompartilhados={dadosCompartilhados}
                          onCardFechado={onCardFechado}
                          abrirAoMontar={idDestaque != null && String(req.id) === String(idDestaque)}
                          podeEditar={podeEditar}
                          podeMoverFase={podeMoverFase}
                          podeImprimir={podeImprimir}
                          podeExcluir={podeExcluir}
                          grupos={grupos}
                          usuarioAtual={usuarioAtual}
                          onGruposChange={recarregarGrupos}
                          onExpandirGrupo={(id: number) => setGrupoFiltro(id)}
                          modoComparar={modoComparar}
                          escolhidoParaComparar={escolhidas.some((r: any) => String(r.id) === String(req.id))}
                          onEscolherComparar={escolherParaComparar}
                        />
                      ))}
                      {items.length > (limitesPorColuna[col.id] || CARDS_POR_VEZ) && (
                        <button
                          onClick={() => setLimitesPorColuna(prev => ({ ...prev, [col.id]: (prev[col.id] || CARDS_POR_VEZ) + CARDS_POR_VEZ }))}
                          className="w-full py-4 rounded-xl border border-dashed border-zinc-200 text-xs font-bold text-zinc-500 uppercase tracking-widest hover:bg-zinc-50 hover:text-zinc-900 transition-all"
                        >
                          Carregar mais ({items.length - (limitesPorColuna[col.id] || CARDS_POR_VEZ)} restantes)
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="py-12 border border-dashed border-zinc-200 rounded-2xl flex flex-col items-center justify-center gap-2 opacity-10">
                      <Layout size={18} className="text-zinc-900" />
                      <span className="text-xs font-bold uppercase tracking-[0.4em] text-zinc-900">Livre</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {comparando && (
        <CompararReqs
          a={comparando[0]}
          b={comparando[1]}
          dadosCompartilhados={dadosCompartilhados}
          onFechar={() => setComparando(null)}
          onTrocar={() => { setComparando(null); setEscolhidas([]); }}
        />
      )}
    </div>
  );
}