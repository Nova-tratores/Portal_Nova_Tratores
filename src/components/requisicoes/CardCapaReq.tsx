'use client';
import React, { useState, useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import {
  Calendar, UserCircle, Briefcase,
  HardHat, ClipboardList, Printer, Trash2,
  Receipt, Paperclip, Building2, Tag, BadgeCheck, Clock, Banknote
} from 'lucide-react';
import HistoricoModal from './HistoricoModal';
import DialogoImprimirReq from './DialogoImprimirReq';
import { anexosDaReq } from '@/lib/requisicoes/anexos';
import { useIsMobile } from '@/hooks/useIsMobile';
import { IconeQuadrado } from './visualReq';
import { brl, diasAberta, FASES_ABERTAS, normalizarStatus, normalizarTipo, valorReq, visualTipo } from '@/lib/requisicoes/inteligencia';
import { SeloCobranca, temCobranca } from '@/components/pos/CobrancaRequisicao';

// Carrega CardReq completo só quando o modal abre
const CardReq = dynamic(() => import('./CardReq'), { ssr: false });

export default function CardCapaReq({ req, onUpdate, onPrint, dadosCompartilhados, onCardFechado, podeEditar = true, podeMoverFase = true, podeImprimir = true, podeExcluir = true, grupos = [], usuarioAtual = '', onGruposChange, onExpandirGrupo, abrirAoMontar = false, modoComparar = false, escolhidoParaComparar = false, onEscolherComparar, notaAchada = false, onVerNotaAchada }: any) {
  // abrirAoMontar: deep-link (?req=<id> na URL) — outros módulos (ex.: Frota >
  // Manutenções) linkam direto pra requisição e o card já abre expandido.
  const isMobile = useIsMobile();
  const [modalAberto, setModalAberto] = useState(!!abrirAoMontar);
  useEffect(() => { if (abrirAoMontar) setModalAberto(true); }, [abrirAoMontar]);
  const [histAberto, setHistAberto] = useState(false);

  // Sem permissão de editar: bloqueia a escrita do CardReq (única via é onUpdate).
  // Silencioso (no-op) pra não gerar alerta em writes automáticos ao abrir o card.
  const onUpdateCardReq = podeEditar ? onUpdate : () => {};

  const veioDoApp = req.origem === 'app_tecnico' || req.obs?.includes('[APPSHEET_ID:');
  const tipoNome = normalizarTipo(req.tipo || req.ReqTipo);
  const visual = visualTipo(tipoNome);
  const aberta = (FASES_ABERTAS as string[]).includes(normalizarStatus(req.status));
  // dias parada: calculado uma vez por render (a tela já relê sozinha)
  const dias = diasAberta(req, new Date());
  const cobravel = temCobranca(req);

  // Subtítulo contextual baseado no tipo
  const subtituloContextual = useMemo(() => {
    const tipo = (req.tipo || req.ReqTipo || '').toLowerCase();
    const veiculos = dadosCompartilhados?.veiculos || [];
    if (['veicular abastecimento', 'veicular manutenção'].includes(tipo) && req.veiculo) {
      const v = veiculos.find((x: any) => String(x.IdPlaca) === String(req.veiculo));
      const litros = req.litros_combustivel ? ` · ${req.litros_combustivel}L` : '';
      return v ? (v.NumPlaca + litros) : null;
    }
    if (['trator abastecimento', 'quadri abastecimento'].includes(tipo) && req.litros_combustivel) {
      return `${req.litros_combustivel}L`;
    }
    if (tipo === 'ferramenta') {
      return req.quem_ferramenta || req.ferramenta_quem || null;
    }
    if ((req.setor || '').toLowerCase().includes('trator') && (req.setor || '').toLowerCase().includes('cliente')) {
      return req.cliente || null;
    }
    return null;
  }, [req, dadosCompartilhados?.veiculos]);

  // Traduz email->nome usando dados locais
  const nomeExibicao = useMemo(() => {
    const usuarios = dadosCompartilhados?.usuarios || [];
    if (req.solicitante && req.solicitante.includes('@')) {
      const usuario = usuarios.find((u: any) => u.email === req.solicitante.trim());
      return usuario?.nome || req.solicitante;
    }
    return req.solicitante;
  }, [req.solicitante, dadosCompartilhados?.usuarios]);

  const handleTrash = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Mover esta requisição para a lixeira?")) {
      onUpdate(req.id, { status: 'lixeira' });
    }
  };

  // Igual ao botão do modal: se tiver anexo, pergunta o que entra; senão imprime direto.
  const [dlgImprimir, setDlgImprimir] = useState(false);
  const imprimir = (folhas: { label: string; dataUrl: string }[] = []) => {
    onPrint({ ...req, solicitante: nomeExibicao, impresso_por: 'MANUAL' }, folhas);
  };
  const handlePrintClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // No celular abre a página dedicada /imprimir (o window.print() da página sai como
    // "print da tela" no mobile). No PC segue o fluxo normal (com diálogo de anexos).
    if (isMobile) { window.open(`/requisicoes/imprimir/${req.id}`, '_blank'); return; }
    if (anexosDaReq(req).length === 0) { imprimir(); return; }
    setDlgImprimir(true);
  };

  return (
    <>
      {/* CAPA DO CARD NO QUADRO — visual novo (Estilo POS NewPortal) */}
      <div
        draggable={podeMoverFase && !modoComparar}
        onDragStart={(e) => { if (podeMoverFase && !modoComparar) e.dataTransfer.setData("idRequisicao", req.id.toString()); }}
        onClick={() => (modoComparar ? onEscolherComparar?.(req) : setModalAberto(true))}
        className={`rq-card rq-req clicavel ${modoComparar ? '' : podeMoverFase ? 'cursor-grab active:cursor-grabbing' : ''}`}
        style={{
          ['--c' as any]: visual.cor,
          ...(escolhidoParaComparar ? { borderColor: '#D97706', boxShadow: '0 0 0 2px #fde68a' } : {}),
        }}
      >
        <div className="rq-req-topo">
          <IconeQuadrado icone={visual.icone} cor={visual.cor} />
          <div style={{ minWidth: 0 }}>
            <span className="rq-req-num"><small>REQ</small>{req.id}</span>
            <div className="rq-req-tipo">{tipoNome}</div>
          </div>
          {!modoComparar && (
            <div className="rq-req-acoes">
              <button onClick={(e) => { e.stopPropagation(); setHistAberto(true); }} title="Histórico da requisição"><Clock size={14} /></button>
              {podeImprimir && <button onClick={handlePrintClick} title="Imprimir requisição"><Printer size={14} /></button>}
              {podeExcluir && <button onClick={handleTrash} title="Mover para a lixeira"><Trash2 size={14} /></button>}
            </div>
          )}
        </div>

        <div className="rq-req-titulo">{req.titulo || 'Sem título'}</div>
        {subtituloContextual && <div className="rq-req-sub">{subtituloContextual}</div>}

        <div className="rq-req-meta">
          <span><i className="fa-regular fa-calendar" />{req.data ? new Date(req.data + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</span>
          {(req.setor || req.ReqQuem) && <span><i className="fa-solid fa-building" />{req.setor || req.ReqQuem}</span>}
          <span title="Quem pediu"><i className="fa-solid fa-user" />{nomeExibicao || req.criado_por || '—'}</span>
          {req.fornecedor && <span title="Fornecedor"><i className="fa-solid fa-store" />{req.fornecedor}</span>}
        </div>

        {(cobravel || notaAchada || veioDoApp || escolhidoParaComparar || dias != null && dias > 7 || (!req.fornecedor && aberta)) && (
          <div className="rq-req-selos">
            {/* cobrança do cliente; o motivo do "Não cobrada" aparece ao passar o mouse e no cartão aberto (José, 26/10/2026) */}
            {cobravel && <SeloCobranca req={req} compacto />}
            {notaAchada && (
              <button type="button" className="rq-pilula rq-pulsa" style={{ ['--c' as any]: '#2563EB', cursor: 'pointer', border: '1px solid color-mix(in srgb, #2563EB 30%, transparent)' }}
                title="Achei no Omie uma nota de entrada que parece ser desta requisição — clique para conferir"
                onClick={(e) => { e.stopPropagation(); onVerNotaAchada?.(req.id); }}>
                <i className="fa-solid fa-file-invoice" /> Nota achada no Omie
              </button>
            )}
            {escolhidoParaComparar && <span className="rq-pilula" style={{ ['--c' as any]: '#D97706' }}>Escolhida</span>}
            {veioDoApp && <span className="rq-pilula" style={{ ['--c' as any]: '#2563EB' }} title="Criada pelo técnico no aplicativo"><HardHat size={11} /> Técnico (app)</span>}
            {dias != null && dias > 7 && (
              <span className="rq-pilula" style={{ ['--c' as any]: dias > 30 ? '#DC2626' : '#D97706' }} title="Há quantos dias está aberta">
                <Clock size={11} /> parada há {dias} dias
              </span>
            )}
            {!req.fornecedor && aberta && <span className="rq-pilula" style={{ ['--c' as any]: '#64748B' }}>sem fornecedor</span>}
          </div>
        )}

        <div className="rq-req-rodape">
          <div className="rq-num" style={{ fontSize: 21 }}>{brl(valorReq(req))}</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {([
              { campo: 'foto_nf', sigla: 'NF', nome: 'Nota fiscal', Icone: Receipt },
              { campo: 'boleto_fornecedor', sigla: 'Boleto', nome: 'Boleto do fornecedor', Icone: Banknote },
              { campo: 'recibo_fornecedor', sigla: 'Recibo', nome: 'Recibo / outros', Icone: Paperclip },
            ] as const).map(({ campo, sigla, nome, Icone }) => {
              // NF: conta as até 5 notas (foto_nf + foto_nf2..5) num chip só
              const qtd = campo === 'foto_nf'
                ? ['foto_nf', 'foto_nf2', 'foto_nf3', 'foto_nf4', 'foto_nf5'].filter(c => !!req[c]).length
                : (req[campo] ? 1 : 0);
              return (
                <span key={campo} className={`rq-anexo ${qtd > 0 ? 'on' : ''}`}
                  title={qtd > 0 ? `${nome} anexado${qtd > 1 ? ` (${qtd})` : ''}` : `Sem ${nome.toLowerCase()}`}>
                  <Icone size={12} /> {sigla}{qtd > 1 ? ` ×${qtd}` : ''}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* CardReq COMPLETO - só monta quando abre o modal */}
      {modalAberto && (
        <CardReq
          req={req}
          onUpdate={onUpdateCardReq}
          onPrint={onPrint}
          dadosCompartilhados={dadosCompartilhados}
          aberto={true}
          onFechar={() => { setModalAberto(false); onCardFechado?.(req.id); }}
          podeEditar={podeEditar}
          grupos={grupos}
          usuarioAtual={usuarioAtual}
          onGruposChange={onGruposChange}
          onExpandirGrupo={(id: number) => { onExpandirGrupo?.(id); setModalAberto(false); }}
        />
      )}

      <HistoricoModal reqId={req.id} titulo={req.titulo} open={histAberto} onClose={() => setHistAberto(false)} />
      {dlgImprimir && (
        <DialogoImprimirReq req={req} onFechar={() => setDlgImprimir(false)} onImprimir={(folhas) => imprimir(folhas)} />
      )}
    </>
  );
}
