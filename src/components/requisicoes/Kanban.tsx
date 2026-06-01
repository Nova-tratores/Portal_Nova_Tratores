'use client';
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import CardCapaReq from './CardCapaReq';
import { supabase } from '@/lib/supabase';
import { Search, Calendar, Building2, X, Layout, UserCircle, Layers, SlidersHorizontal, Receipt, FileDown } from 'lucide-react';

const LISTA_FORNECEDORES_CADASTRADOS = ["Rodrigo Torneiro (Panda)"];

export default function Kanban({ requisicoes, onUpdate, onPrint, onCardFechado }: any) {
  // Dados compartilhados - buscados UMA vez, passados para todos os cards
  const [dadosCompartilhados, setDadosCompartilhados] = useState<{ fornecedores: any[], usuarios: any[], veiculos: any[] }>({ fornecedores: [], usuarios: [], veiculos: [] });

  useEffect(() => {
    const fetchDados = async () => {
      const [{ data: f }, { data: u }, { data: v }] = await Promise.all([
        supabase.from('Fornecedores').select('nome').order('nome'),
        supabase.from('financeiro_usu').select('nome, funcao, email').order('nome'),
        supabase.from('SupaPlacas').select('IdPlaca, NumPlaca').order('NumPlaca'),
      ]);
      setDadosCompartilhados({ fornecedores: f || [], usuarios: u || [], veiculos: v || [] });
    };
    fetchDados();
  }, []);
  const [filtroID, setFiltroID] = useState('');
  const [filtroTitulo, setFiltroTitulo] = useState('');
  const [filtroFornecedor, setFiltroFornecedor] = useState('');
  const [filtroMes, setFiltroMes] = useState('');
  const [filtroSolicitante, setFiltroSolicitante] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroNota, setFiltroNota] = useState('');
  const [filtroFornAguardando, setFiltroFornAguardando] = useState('');
  const [filtroTecnicoPedido, setFiltroTecnicoPedido] = useState('');
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

  const solicitantesParaFiltro = useMemo(() => {
    const nomes = requisicoes.map((r: any) => r.solicitante).filter(Boolean);
    return Array.from(new Set(nomes)).sort();
  }, [requisicoes]);

  const tiposParaFiltro = useMemo(() => {
    const excluir = ['boleto', 'dinheiro'];
    const tipos = requisicoes.map((r: any) => r.tipo).filter((t: string) => t && !excluir.includes(t.toLowerCase()));
    return Array.from(new Set(tipos)).sort();
  }, [requisicoes]);

  const fornecedoresParaFiltro = useMemo(() => {
    const doBanco = requisicoes.map((r: any) => r.fornecedor).filter(Boolean);
    return Array.from(new Set([...LISTA_FORNECEDORES_CADASTRADOS, ...doBanco])).sort();
  }, [requisicoes]);

  // Fornecedores por coluna de status (agrupa + conta)
  const contarFornecedoresPorStatus = (status: string) => {
    const lista = requisicoes
      .filter((r: any) => r.status === status && r.fornecedor)
      .map((r: any) => r.fornecedor);
    const contagem: Record<string, number> = {};
    lista.forEach((f: string) => { contagem[f] = (contagem[f] || 0) + 1; });
    return Object.entries(contagem)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([nome, qtd]) => ({ nome, qtd }));
  };
  const fornecedoresAguardando = useMemo(() => contarFornecedoresPorStatus('aguardando'), [requisicoes]);

  // Técnicos (solicitantes) que têm requisições na coluna "Pedido Realizado"
  const tecnicosPedido = useMemo(() => {
    const lista = requisicoes
      .filter((r: any) => r.status === 'pedido' && r.solicitante)
      .map((r: any) => r.solicitante);
    const contagem: Record<string, number> = {};
    lista.forEach((s: string) => { contagem[s] = (contagem[s] || 0) + 1; });
    return Object.entries(contagem)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([nome, qtd]) => ({ nome, qtd }));
  }, [requisicoes]);

  const mesesDisponiveis = useMemo(() => {
    const lista = requisicoes.map((r: any) => {
      if (!r.data) return null;
      const date = new Date(r.data);
      return {
        valor: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
        label: date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
      };
    }).filter(Boolean);
    return Array.from(new Map(lista.map((m: any) => [m.valor, m])).values());
  }, [requisicoes]);

  const filtradas = useMemo(() => {
    return requisicoes.filter((r: any) => {
      const matchID = filtroID ? r.id.toString().includes(filtroID) : true;
      const matchTitulo = filtroTitulo ? r.titulo?.toLowerCase().includes(filtroTitulo.toLowerCase()) : true;
      const matchForn = filtroFornecedor ? r.fornecedor === filtroFornecedor : true;
      const matchMes = filtroMes ? r.data?.startsWith(filtroMes) : true;
      const matchSolic = filtroSolicitante ? r.solicitante === filtroSolicitante : true;
      const matchTipo = filtroTipo ? r.tipo === filtroTipo : true;
      const matchNota = filtroNota ? (r.numero_nota || '').toLowerCase().includes(filtroNota.toLowerCase()) : true;
      return matchID && matchTitulo && matchForn && matchMes && matchSolic && matchTipo && matchNota;
    });
  }, [requisicoes, filtroID, filtroTitulo, filtroFornecedor, filtroMes, filtroSolicitante, filtroTipo, filtroNota]);

  const temFiltroAtivo = filtroID || filtroTitulo || filtroFornecedor || filtroMes || filtroSolicitante || filtroTipo || filtroNota;
  const limparFiltros = () => { setFiltroID(''); setFiltroTitulo(''); setFiltroFornecedor(''); setFiltroMes(''); setFiltroSolicitante(''); setFiltroTipo(''); setFiltroNota(''); setFiltroFornAguardando(''); setFiltroTecnicoPedido(''); };
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

  const pillBase = "px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap";
  const pillActive = "bg-red-600 text-white border-red-600";
  const pillInactive = "bg-white text-zinc-500 border-zinc-200 hover:border-red-300 hover:text-red-600";
  const inputInline = "bg-white text-zinc-800 text-[13px] rounded-full px-3 py-1.5 outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 transition-all placeholder:text-zinc-400 border border-zinc-200";
  const selectInline = `${inputInline} appearance-none cursor-pointer pr-7`;

  return (
    <div className="w-full bg-zinc-50 min-h-screen transition-all duration-700 pb-20">

      {/* BARRA DE FILTROS — inline compacta */}
      <div className="w-full px-6 pt-4 pb-2">
        <div className="flex items-center gap-2 flex-wrap">

          {/* Busca por ID */}
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-red-500 pointer-events-none"/>
            <input type="text" inputMode="numeric" placeholder="Nº ID" value={filtroID} onChange={e => setFiltroID(e.target.value.replace(/\D/g, ''))} className={`${inputInline} pl-8 w-[100px] text-center font-semibold`} />
            {filtroID && <button onClick={() => setFiltroID('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-red-500"><X size={12}/></button>}
          </div>

          {/* Busca por título */}
          <div className="relative flex-1 min-w-[200px] max-w-[320px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"/>
            <input type="text" placeholder="Buscar título..." value={filtroTitulo} onChange={e => setFiltroTitulo(e.target.value)} className={`${inputInline} pl-8 w-full`} />
          </div>

          {/* Separador */}
          <div className="w-px h-5 bg-zinc-200" />

          {/* Técnico */}
          <div className="relative">
            <UserCircle size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"/>
            <select value={filtroSolicitante} onChange={e => setFiltroSolicitante(e.target.value)} className={`${selectInline} pl-7 ${filtroSolicitante ? '!border-red-400 !bg-red-50 !text-red-700' : ''}`}>
              <option value="">Técnico</option>
              {solicitantesParaFiltro.map((s: any) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Tipo */}
          <div className="relative">
            <Layers size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"/>
            <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} className={`${selectInline} pl-7 ${filtroTipo ? '!border-red-400 !bg-red-50 !text-red-700' : ''}`}>
              <option value="">Tipo</option>
              {tiposParaFiltro.map((t: any) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Fornecedor */}
          <div className="relative">
            <Building2 size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"/>
            <select value={filtroFornecedor} onChange={e => setFiltroFornecedor(e.target.value)} className={`${selectInline} pl-7 ${filtroFornecedor ? '!border-red-400 !bg-red-50 !text-red-700' : ''}`}>
              <option value="">Fornecedor</option>
              {fornecedoresParaFiltro.map((f: any) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>

          {/* Período */}
          <div className="relative">
            <Calendar size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"/>
            <select value={filtroMes} onChange={e => setFiltroMes(e.target.value)} className={`${selectInline} pl-7 ${filtroMes ? '!border-red-400 !bg-red-50 !text-red-700' : ''}`}>
              <option value="">Período</option>
              {mesesDisponiveis.map((m: any) => <option key={m.valor} value={m.valor}>{m.label.toUpperCase()}</option>)}
            </select>
          </div>

          {/* Nº Nota */}
          <div className="relative">
            <Receipt size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"/>
            <input type="text" placeholder="Nº Nota" value={filtroNota} onChange={e => setFiltroNota(e.target.value)} className={`${inputInline} pl-8 w-[110px]`} />
          </div>

          {/* Contador + Limpar */}
          {temFiltroAtivo && (
            <>
              <span className="text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full">{resultCount}</span>
              <button onClick={limparFiltros} className={`${pillBase} ${pillActive}`}>
                <X size={12} /> Limpar
              </button>
            </>
          )}
        </div>
      </div>

      {/* GRADE KANBAN - COLUNAS COM DESIGNER SLIM */}
      <div className="px-6 mt-2">
        <div className="flex gap-4 overflow-x-auto pb-8 scrollbar-hide justify-center">
          {colunas.map((col) => {
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
            if (col.id === 'aguardando' && filtroFornAguardando) {
              items = items.filter((r: any) => r.fornecedor === filtroFornAguardando);
            }
            if (col.id === 'pedido' && filtroTecnicoPedido) {
              items = items.filter((r: any) => r.solicitante === filtroTecnicoPedido);
            }
            const isOver = colunaArrastando === col.id;

            return (
              <div 
                key={col.id} 
                onDragOver={(e) => handleDragOver(e, col.id)}
                onDragLeave={() => setColunaArrastando(null)}
                onDrop={(e) => handleDrop(e, col.id)}
                className={`flex-1 min-w-[280px] max-w-[380px] flex flex-col rounded-2xl transition-all duration-300 border ${
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
                  {col.id === 'pedido' && tecnicosPedido.length > 0 && (
                    <div className="mt-3 relative">
                      <UserCircle size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"/>
                      <select
                        value={filtroTecnicoPedido}
                        onChange={e => setFiltroTecnicoPedido(e.target.value)}
                        className={`w-full text-[11px] rounded-full pl-7 pr-7 py-1 outline-none border transition-all appearance-none cursor-pointer ${
                          filtroTecnicoPedido
                            ? 'border-red-300 bg-red-50/60 text-red-600 font-medium'
                            : 'border-zinc-100 bg-zinc-50/60 text-zinc-500 hover:border-zinc-200'
                        }`}
                      >
                        <option value="">Todos os técnicos ({tecnicosPedido.length})</option>
                        {tecnicosPedido.map((t) => (
                          <option key={t.nome} value={t.nome}>{t.nome} ({t.qtd})</option>
                        ))}
                      </select>
                      {filtroTecnicoPedido && (
                        <button
                          onClick={() => setFiltroTecnicoPedido('')}
                          className="absolute right-7 top-1/2 -translate-y-1/2 text-red-400 hover:text-red-600"
                          title="Limpar"
                        >
                          <X size={11} />
                        </button>
                      )}
                    </div>
                  )}
                  {col.id === 'aguardando' && fornecedoresAguardando.length > 0 && (
                    <div className="mt-3 flex flex-col gap-2">
                      <div className="relative">
                        <Building2 size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-orange-500 pointer-events-none"/>
                        <select
                          value={filtroFornAguardando}
                          onChange={e => setFiltroFornAguardando(e.target.value)}
                          className={`w-full text-[12px] rounded-full pl-7 pr-7 py-1.5 outline-none border transition-all appearance-none cursor-pointer ${
                            filtroFornAguardando
                              ? 'border-orange-400 bg-orange-50 text-orange-700 font-semibold'
                              : 'border-zinc-200 bg-white text-zinc-600 hover:border-orange-300'
                          }`}
                        >
                          <option value="">Todos os fornecedores ({fornecedoresAguardando.length})</option>
                          {fornecedoresAguardando.map((f) => (
                            <option key={f.nome} value={f.nome}>{f.nome} ({f.qtd})</option>
                          ))}
                        </select>
                        {filtroFornAguardando && (
                          <button
                            onClick={() => setFiltroFornAguardando('')}
                            className="absolute right-7 top-1/2 -translate-y-1/2 text-orange-500 hover:text-orange-700"
                            title="Limpar"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                      <button
                        onClick={() => gerarPdfCobranca(filtroFornAguardando || undefined)}
                        className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-orange-600 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-full py-1.5 px-3 transition-all cursor-pointer"
                        title={filtroFornAguardando ? `Gerar cobrança para ${filtroFornAguardando}` : 'Gerar cobrança para todos os fornecedores'}
                      >
                        <FileDown size={12} />
                        Cobrar NF/Boleto {filtroFornAguardando ? `(${filtroFornAguardando})` : '(todos)'}
                      </button>
                    </div>
                  )}
                </div>

                {/* ÁREA DOS CARDS */}
                <div className="p-4 space-y-4 flex-1 max-h-[72vh] overflow-y-auto scrollbar-hide">
                  {items.length > 0 ? (
                    <>
                      {items.slice(0, limitesPorColuna[col.id] || CARDS_POR_VEZ).map((req: any) => (
                        <CardCapaReq
                          key={req.id}
                          req={req}
                          onUpdate={onUpdate}
                          onPrint={onPrint}
                          dadosCompartilhados={dadosCompartilhados}
                          onCardFechado={onCardFechado}
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
    </div>
  );
}