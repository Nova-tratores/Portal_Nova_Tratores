'use client';
export const dynamic = 'force-dynamic';
import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { authHeaders } from '@/lib/auth/client';
import { filtrarDestinatarios } from '@/lib/notif/prefs';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { gateBtn, estiloSemPermissao } from '@/lib/permissoes/ui';
import SemPermissao from '@/components/SemPermissao';
import { useAuditLog } from '@/hooks/useAuditLog';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import Kanban from '@/components/requisicoes/Kanban';
import FormReq, { RASCUNHO_NOVA_REQ } from '@/components/requisicoes/FormReq';
import { apagarRascunho } from '@/lib/rascunho/useRascunho';
import FormFornecedor from '@/components/requisicoes/FormFornecedor';
import TemplatePDF from '@/components/requisicoes/TemplatePDF';
import {
  Activity, Plus, X, Bell, CheckCheck, Printer
} from 'lucide-react';
import PainelDev from '@/components/requisicoes/PainelDev';
import PecasNav from '@/components/ppv/PecasNav';
import PainelAtencao from '@/components/requisicoes/PainelAtencao';
import PainelGastos from '@/components/requisicoes/PainelGastos';
import LixeiraReq from '@/components/requisicoes/LixeiraReq';
import ConfirmarNotas, { NotasEncontradasCartao } from '@/components/requisicoes/ConfirmarNotas';
import type { SugestaoNota } from '@/lib/requisicoes/casar-nota-server';
import { fetchAuth } from '@/lib/auth/client';

// "Não é" fica guardado neste navegador (req|nota), para a sugestão não voltar
const CHAVE_NOTAS_RECUSADAS = 'req-notas-recusadas';
function lerRecusadas(): Set<string> { try { return new Set(JSON.parse(localStorage.getItem(CHAVE_NOTAS_RECUSADAS) || '[]')); } catch { return new Set(); } }
import { ESTILO_REQ_VN } from '@/components/requisicoes/visualReq';
import { normalizarStatus, normalizarTipo, ROTULO_FASE, type ItemAtencao } from '@/lib/requisicoes/inteligencia';

/** Linha do banco → como a tela usa (colunas antigas do AppSheet + grafias diferentes juntadas). */
function normalizarLinha(r: any) {
  return {
    ...r,
    status: normalizarStatus(r.status),
    tipo: normalizarTipo(r.tipo || r.ReqTipo || 'Peças'),
    titulo: r.titulo || r.Material_Serv_Solicitado || "",
    solicitante: r.solicitante || r.ReqSolicitante || "",
    setor: r.setor || r.ReqQuem || "",
    veiculo: r.veiculo || r.ReqVeiculo || "",
    hodometro: r.hodometro || r.ReqHodometro || "",
    valor_despeza: r.valor_despeza || "0,00",
    obs: r.obs || r.Motivo || r.ReqMotivo || "",
    quem_ferramenta: r.quem_ferramenta || r.ferramenta_quem || ""
  };
}

// A aba "Veículos" morreu na Fase 5 do Frota: o cadastro de veículos agora é
// SÓ no módulo Frota (/frota, botão "Novo veículo"), que mantém a SupaPlacas
// como projeção — o dropdown do FormReq e o Omie continuam funcionando igual.
const ABAS_VALIDAS = new Set(['kanban', 'painel', 'usuarios', 'fornecedores', 'relatorio', 'lixeira', 'form_usuario', 'form']);

function RequisicoesPageInner() {
  const { userProfile } = useAuth();
  const { isDev, pode } = usePermissoes(userProfile?.id);
  // Permissões granulares das Requisições
  const podeCriar = pode('requisicoes', 'criar');
  const podeEditar = pode('requisicoes', 'editar');
  const podeMoverFase = pode('requisicoes', 'mover_fase');
  const podeFornecedor = pode('requisicoes', 'criar_fornecedor');
  const podeExcluir = pode('requisicoes', 'excluir');
  const podeImprimir = pode('requisicoes', 'imprimir');
  const { log: auditLog } = useAuditLog();
  const userName = userProfile?.nome || 'Alguém';
  const searchParams = useSearchParams();
  const abaInicial = (() => {
    const a = searchParams.get('aba');
    return a && ABAS_VALIDAS.has(a) ? a : 'kanban';
  })();
  const editarFornecedorId = searchParams.get('editar');
  const [abaAtiva, setAbaAtiva] = useState(abaInicial);
  const [requisicoes, setRequisicoes] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [veiculos, setVeiculos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [reqParaImprimir, setReqParaImprimir] = useState<any>(null);
  const [anexosParaImprimir, setAnexosParaImprimir] = useState<{ label: string; dataUrl: string }[]>([]);
  const [notificacoes, setNotificacoes] = useState<any[]>([]);
  const [toasts, setToasts] = useState<any[]>([]);
  const [showNotifModal, setShowNotifModal] = useState(false);
  const [contadorNotif, setContadorNotif] = useState(0);
  // Filtro do quadro vindo do "Precisa da sua atenção" (chave) ou de uma barra do Painel
  const [filtroEspecial, setFiltroEspecial] = useState<{ chave?: string; ids: number[]; titulo: string } | null>(null);
  const [comoLer, setComoLer] = useState(false);
  // Notas de entrada do Omie que parecem ser de requisições sem nº de nota (confirmação manual)
  const [sugestoesNota, setSugestoesNota] = useState<SugestaoNota[]>([]);
  const [verNotas, setVerNotas] = useState(false);
  const [focoNota, setFocoNota] = useState<number | null>(null);
  // requisições com nota achada (selo pulsando no cartão do quadro)
  const reqsComNota = useMemo(() => new Set(sugestoesNota.flatMap(sg => sg.reqIds)), [sugestoesNota]);
  const carregarSugestoesNota = useCallback(async () => {
    try {
      const r = await fetchAuth('/api/requisicoes/notas-sugeridas');
      if (!r.ok) return;
      const j = await r.json();
      const recusadas = lerRecusadas();
      setSugestoesNota((j.sugestoes || []).filter((x: SugestaoNota) => !recusadas.has(`${x.reqIds.join(',')}|${x.nota.id}`)));
    } catch { /* sem sugestão: a tela segue igual */ }
  }, []);
  useEffect(() => { carregarSugestoesNota(); }, [carregarSugestoesNota]);
  const confirmarNota = async (sg: SugestaoNota): Promise<string | null> => {
    try {
      const r = await fetchAuth('/api/requisicoes/notas-sugeridas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notaId: sg.nota.id, reqIds: sg.reqIds }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return j.error || 'Não consegui gravar.';
      const porReq: Record<string, Record<string, string>> = j.porReq || {};
      setRequisicoes(prev => prev.map(x => porReq[x.id] ? { ...x, ...porReq[x.id] } : x));
      setSugestoesNota(prev => prev.filter(x => x.nota.id !== sg.nota.id && !x.reqIds.some(id => sg.reqIds.includes(id))));
      return null;
    } catch (e) { return e instanceof Error ? e.message : 'Não consegui gravar.'; }
  };
  const recusarNota = (sg: SugestaoNota) => {
    const rec = lerRecusadas(); rec.add(`${sg.reqIds.join(',')}|${sg.nota.id}`);
    try { localStorage.setItem(CHAVE_NOTAS_RECUSADAS, JSON.stringify([...rec])); } catch { /* sem storage */ }
    setSugestoesNota(prev => prev.filter(x => x.nota.id !== sg.nota.id));
  };
  // Deep-link: /requisicoes?req=<id> abre o card direto (usado pelo Frota >
  // Manutenções; o Kanban sobe o card pro topo da coluna e expande o modal).
  const [idDestaque, setIdDestaque] = useState<any>(() => {
    const r = searchParams.get('req');
    return r && /^\d+$/.test(r) ? Number(r) : null;
  });
  const [filtroRelTipo, setFiltroRelTipo] = useState('');
  const [filtroRelSetor, setFiltroRelSetor] = useState('');
  const [filtroRelSolicitante, setFiltroRelSolicitante] = useState('');
  const [filtroRelBusca, setFiltroRelBusca] = useState('');

  const lixeiraCount = useMemo(() => requisicoes.filter(r => r.status === 'lixeira').length, [requisicoes]);

  const reqAbertas = useMemo(() => {
    return requisicoes.filter(r => r.status !== 'financeiro' && r.status !== 'lixeira')
      .filter(r => !filtroRelTipo || (r.tipo || r.ReqTipo) === filtroRelTipo)
      .filter(r => !filtroRelSetor || r.setor === filtroRelSetor)
      .filter(r => !filtroRelSolicitante || r.solicitante === filtroRelSolicitante)
      .filter(r => {
        if (!filtroRelBusca) return true;
        const b = filtroRelBusca.toLowerCase();
        return (r.titulo || '').toLowerCase().includes(b) || String(r.id).includes(b) || (r.cliente || '').toLowerCase().includes(b) || (r.Chassis_Modelo || '').toLowerCase().includes(b) || (r.numero_nota || '').toLowerCase().includes(b);
      })
      .sort((a: any, b: any) => (b.id || 0) - (a.id || 0));
  }, [requisicoes, filtroRelTipo, filtroRelSetor, filtroRelSolicitante, filtroRelBusca]);

  // `anexos` são folhas já convertidas em imagem (ver lib/requisicoes/anexos-pdf):
  // saem como páginas extras do MESMO documento, depois da requisição.
  const dispararImpressao = (dados: any, anexos: { label: string; dataUrl: string }[] = []) => {
    setReqParaImprimir(dados);
    setAnexosParaImprimir(anexos);
    setTimeout(() => {
      window.print();
      setReqParaImprimir(null);
      setAnexosParaImprimir([]);
    }, anexos.length ? 1400 : 800);   // dá tempo das imagens entrarem no layout
  };

  const abrirNotificacao = (idReq: any) => {
    setAbaAtiva('kanban');
    setIdDestaque(idReq);
    setShowNotifModal(false);
    setTimeout(() => setIdDestaque(null), 500);
  };

  const tocarAlerta = () => {
    try {
      if (typeof window !== 'undefined') {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const bip = (delay: number, freq: number) => {
          const oscillator = audioCtx.createOscillator();
          const gainNode = audioCtx.createGain();
          oscillator.type = 'triangle';
          oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime + delay);
          gainNode.gain.setValueAtTime(0.7, audioCtx.currentTime + delay);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + delay + 0.4);
          oscillator.connect(gainNode);
          gainNode.connect(audioCtx.destination);
          oscillator.start(audioCtx.currentTime + delay);
          oscillator.stop(audioCtx.currentTime + delay + 0.4);
        };
        bip(0, 1600); bip(0.2, 2000); bip(0.4, 1600);
      }
    } catch (e) { console.error("Erro áudio:", e); }
  };

  const carregarDados = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    try {
      const buscarTodasReqs = async () => {
        let todas: any[] = [];
        let from = 0;
        const PAGE = 1000;
        while (true) {
          const { data, error } = await supabase
            .from('Requisicao')
            .select('*')
            .order('id', { ascending: false })
            .range(from, from + PAGE - 1);
          if (error || !data) break;
          todas = todas.concat(data);
          if (data.length < PAGE) break;
          from += PAGE;
        }
        return todas;
      };

      const [allReqs, resUser, resVei] = await Promise.all([
        buscarTodasReqs(),
        supabase.from('financeiro_usu').select('*').eq('ativo', true).order('nome', { ascending: true }),
        supabase.from('SupaPlacas').select('*').order('NumPlaca', { ascending: true })
      ]);

      if (allReqs) setRequisicoes(allReqs.map(normalizarLinha));
      if (resUser.data) setUsuarios(resUser.data);
      if (resVei.data) setVeiculos(resVei.data);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, []);

  // Refresh ao voltar para a aba
  const refreshSilencioso = useCallback(() => carregarDados(true), [carregarDados]);
  useRefreshOnFocus(refreshSilencioso);

  // cópia sempre atual da lista (o aviso ao solicitante lê sem recriar callbacks)
  const requisicoesRef = useRef<any[]>([]);
  useEffect(() => { requisicoesRef.current = requisicoes; }, [requisicoes]);
  const usuariosRef = useRef<any[]>([]);
  useEffect(() => { usuariosRef.current = usuarios; }, [usuarios]);

  // Mudou de fase: quem pediu fica sabendo (antes só os admins eram avisados).
  // Solicitante = nome (ou e-mail, nas antigas) do cadastro financeiro_usu, cujo id é o do login.
  const avisarSolicitante = useCallback(async (id: number, fase: string) => {
    try {
      const req = requisicoesRef.current.find(r => r.id === id);
      const quem = String(req?.solicitante || '').trim().toLowerCase();
      if (!quem) return;
      const u = usuariosRef.current.find((x: any) => String(x.nome || '').trim().toLowerCase() === quem || String(x.email || '').trim().toLowerCase() === quem);
      if (!u?.id || u.id === userProfile?.id) return;
      await supabase.from('portal_notificacoes').insert({
        user_id: u.id, tipo: 'requisicao',
        titulo: `Sua requisição #${id} foi para: ${ROTULO_FASE[fase] || fase}`,
        descricao: req?.titulo || null, link: `/requisicoes?req=${id}`,
      });
    } catch { /* aviso é bônus: não trava a mudança */ }
  }, [userProfile?.id]);

  // Rastreia quais cards foram editados enquanto estavam abertos
  const cardsEditadosRef = useRef<Set<number>>(new Set());

  const handleUpdateReq = useCallback(async (id: number, dados: Record<string, unknown>) => {
    setRequisicoes(prev => prev.map(r => r.id === id ? { ...r, ...dados } : r));
    const { error } = await supabase.from('Requisicao').update(dados).eq('id', id);
    if (error) { console.error('[Requisições] Erro ao atualizar:', error?.message, error?.code, error?.details, error?.hint); carregarDados(true); return }
    auditLog({ sistema: 'requisicoes', acao: 'editar', entidade: 'requisicao', entidade_id: String(id), detalhes: dados });
    // Chegou ao financeiro: o motor da frota fecha na hora a pendência do carro
    // ligada a esta requisição (sem isso, só fechava na rodada de 15 min)
    if (dados.status === 'financeiro') {
      fetch('/api/frota/pendencias/sync', { method: 'POST', headers: await authHeaders() }).catch(() => {});
    }
    // Marca que esse card foi editado (notificação só ao fechar)
    cardsEditadosRef.current.add(id);
    if (typeof dados.status === 'string' && dados.status !== 'lixeira') avisarSolicitante(id, dados.status);
  }, [carregarDados, auditLog, avisarSolicitante])

  const handleCardFechado = useCallback((id: number) => {
    // Fechou o card do deep-link: solta o destaque (senão ele reabre no rerender)
    setIdDestaque((atual: any) => (String(atual) === String(id) ? null : atual));
    if (cardsEditadosRef.current.has(id)) {
      cardsEditadosRef.current.delete(id);
      const req = requisicoes.find(r => r.id === id);
      notificarUsuariosReq('requisicao', `${userName} alterou requisição #${id}`, req?.titulo || `Requisição #${id}`, '/requisicoes');
    }
  }, [requisicoes, userName]);

  // Notificar usuários com acesso a requisições via portal_notificacoes (bell icon)
  const notificarUsuariosReq = async (tipo: string, titulo: string, descricao?: string, link?: string) => {
    try {
      const { data: permissoes } = await supabase
        .from('portal_permissoes')
        .select('user_id, is_admin, modulos_permitidos, categoria, notif_silenciado');
      if (!permissoes || permissoes.length === 0) return;
      // Respeita as preferências de silenciar (módulo 'requisicoes').
      const ids = filtrarDestinatarios('requisicoes', permissoes.filter((p: any) => p.is_admin));
      if (ids.length === 0) return;
      await supabase.from('portal_notificacoes').insert(
        ids.map((user_id) => ({
          user_id,
          tipo,
          titulo,
          descricao: descricao || null,
          link: link || null,
        }))
      );
    } catch (err) { console.error('[Requisições] Erro ao notificar usuários:', err); }
  };

  useEffect(() => {
    carregarDados();

    const channel = supabase.channel('main-realtime-stream-' + Date.now())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'Supa-Solicitacao_Req' }, (payload) => {
        tocarAlerta();
        const nova = payload.new;
        const info = {
          id: Date.now(),
          idOriginal: nova.IdReq,
          titulo: nova.Material_Serv_Solicitado || "Nova Solicitação",
          solicitante: nova.ReqEmail || "Técnico (APP)",
          tipoNotif: "Nova Solicitação!",
          hora: new Date().toLocaleTimeString()
        };
        setToasts(prev => [info, ...prev]);
        setNotificacoes(prev => [info, ...prev]);
        setContadorNotif(prev => prev + 1);

        // Criar notificação no bell icon para admins
        notificarUsuariosReq(
          'requisicao',
          'Nova Solicitação de Requisição',
          nova.Material_Serv_Solicitado || 'Solicitação via APP',
          '/requisicoes'
        );

        carregarDados(true);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== info.id)), 10000);

        const buscarEImprimir = async () => {
          let reqData = null;
          const delays = [3000, 2000, 3000, 4000]; // intervalos entre tentativas
          for (const delay of delays) {
            await new Promise(r => setTimeout(r, delay));
            const safeId = String(nova.IdReq).replace(/%/g, '');
            // Busca por [APPSHEET_ID:...] (legado)
            const { data: dataLegado } = await supabase
              .from('Requisicao')
              .select('*')
              .ilike('obs', `%[APPSHEET_ID:${safeId}]%`)
              .maybeSingle();
            if (dataLegado?.id) { reqData = dataLegado; break; }
            // Busca pelo titulo + solicitante (app técnico)
            if (nova.Material_Serv_Solicitado && nova.ReqSolicitante) {
              const { data: dataApp } = await supabase
                .from('Requisicao')
                .select('*')
                .eq('titulo', nova.Material_Serv_Solicitado.toUpperCase())
                .eq('solicitante', nova.ReqSolicitante)
                .order('id', { ascending: false })
                .limit(1)
                .maybeSingle();
              if (dataApp?.id) { reqData = dataApp; break; }
            }
          }

          let nomeExibicao = nova.ReqEmail || "Técnico";
          if (nova.ReqEmail?.includes('@')) {
            const emailLimpo = nova.ReqEmail.trim().toLowerCase();
            const { data: userData } = await supabase
              .from('financeiro_usu')
              .select('nome')
              .ilike('email', emailLimpo)
              .maybeSingle();
            if (userData?.nome) nomeExibicao = userData.nome;
          }

          dispararImpressao({
            id: reqData?.id || nova.IdReq || "NOVA",
            titulo: nova.Material_Serv_Solicitado || "SOLICITAÇÃO APP",
            tipo: nova.ReqTipo || "Peças",
            solicitante: nomeExibicao,
            setor: nova.ReqQuem || "Oficina",
            data: nova.ReqData || new Date().toISOString(),
            veiculo: nova.ReqVeiculo || "",
            hodometro: nova.ReqHodometro || "",
            Motivo: nova.ReqMotivo || "",
            obs: nova.ReqMotivo || "",
            valor_despeza: "0,00",
            impresso_por: "AUTO-GERADO PELO APP",
            quem_ferramenta: nova.ferramenta_quem || "",
            created_at: reqData?.created_at,
          });
        };
        buscarEImprimir();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'Supa-AtualizarReq' }, async (payload) => {
        tocarAlerta();
        const novo = payload.new;
        const info = {
          id: Date.now(),
          idOriginal: novo.ReqREF,
          titulo: "Card Sincronizado",
          solicitante: "Técnico (APP)",
          tipoNotif: "Card Atualizado!",
          hora: new Date().toLocaleTimeString()
        };
        setToasts(prev => [info, ...prev]);
        setNotificacoes(prev => [info, ...prev]);
        setContadorNotif(prev => prev + 1);

        // Criar notificação no bell icon para admins
        notificarUsuariosReq(
          'requisicao',
          'Requisição Atualizada pelo Técnico',
          `Requisição #${novo.ReqREF} foi atualizada`,
          '/requisicoes'
        );

        if (novo.ReqFotoNota && novo.ReqREF) {
          await supabase.from('Requisicao')
            .update({ recibo_fornecedor: novo.ReqFotoNota })
            .eq('id', novo.ReqREF);
        }

        carregarDados(true);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== info.id)), 10000);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'Requisicao' }, (payload: any) => {
        // Só a requisição que mudou (antes relia as ~2.800 a cada edição de qualquer pessoa)
        if (payload.eventType === 'DELETE') {
          const id = payload.old?.id;
          if (id != null) setRequisicoes(prev => prev.filter(r => r.id !== id));
          return;
        }
        const nova = payload.new;
        if (!nova?.id) { carregarDados(true); return; }
        setRequisicoes(prev => {
          const linha = normalizarLinha(nova);
          const i = prev.findIndex(r => r.id === nova.id);
          if (i < 0) return [linha, ...prev];
          const copia = prev.slice(); copia[i] = { ...prev[i], ...linha }; return copia;
        });
      })
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Requisições] Realtime conectado')
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[Requisições] Erro realtime:', status, err?.message)
          // Reconectar após 3s
          setTimeout(() => {
            supabase.removeChannel(channel)
            carregarDados(true)
          }, 3000)
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [carregarDados]);

  const abertasCount = useMemo(() => requisicoes.filter(r => ['pedido', 'completa', 'aguardando'].includes(r.status)).length, [requisicoes]);
  const tabs = [
    { id: 'kanban', label: 'Quadro', icone: 'fa-table-columns', cor: '#EA580C', conta: abertasCount },
    { id: 'painel', label: 'Painel', icone: 'fa-chart-pie', cor: '#7C3AED' },
    podeFornecedor && { id: 'fornecedores', label: 'Fornecedores', icone: 'fa-store', cor: '#2563EB' },
    { id: 'relatorio', label: 'Relatório', icone: 'fa-file-lines', cor: '#0891B2' },
    podeExcluir && { id: 'lixeira', label: 'Lixeira', icone: 'fa-trash-can', cor: '#64748B', conta: lixeiraCount || undefined },
  ].filter(Boolean) as { id: string; label: string; icone: string; cor: string; conta?: number }[];
  const nomeDe = useCallback((s: string) => {
    const v = String(s || '').trim();
    if (!v.includes('@')) return v;
    return usuarios.find((u: any) => String(u.email || '').trim().toLowerCase() === v.toLowerCase())?.nome || v;
  }, [usuarios]);

  return (
    <div className="req-vn">
    <style>{ESTILO_REQ_VN}</style>
    {/* Sistema Peças: barra padronizada do módulo */}
    <div className="print:hidden"><PecasNav /></div>
    <div className="px-3 py-3 md:px-8 md:py-6">
      {reqParaImprimir && <TemplatePDF req={reqParaImprimir} anexos={anexosParaImprimir} onUpdate={() => {}} onPrint={() => {}} />}

      {/* Toasts */}
      <div className="fixed top-20 right-6 z-[9999] flex flex-col gap-3 max-w-[min(24rem,calc(100vw-3rem))] w-full pointer-events-none print:hidden">
        {toasts.map((t: any) => (
          <div
            key={t.id}
            onClick={() => abrirNotificacao(t.idOriginal)}
            className="pointer-events-auto cursor-pointer rounded-2xl overflow-hidden hover:scale-[1.02] transition-all"
            style={{
              background: 'var(--portal-bg-card)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
              border: '1px solid var(--portal-border)',
              animation: 'toastSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <div style={{ height: '3px', background: 'linear-gradient(90deg, #EA580C, #F97316)', animation: 'toastProgress 6s linear forwards' }} />
            <div className="flex items-center gap-3 p-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center text-white shrink-0 shadow-md shadow-orange-200">
                <Bell size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest mb-0.5">{t.tipoNotif}</p>
                <p className="text-[13px] font-semibold text-black truncate">{t.titulo}</p>
              </div>
              <div className="text-[10px] text-black font-medium shrink-0">agora</div>
            </div>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes toastSlideIn {
          from { opacity: 0; transform: translateX(120%); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes toastProgress {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>

      {/* Notificações — Painel lateral */}
      {showNotifModal && (
        <>
          {/* Overlay sutil */}
          <div
            className="fixed inset-0 z-[10000] print:hidden"
            style={{ background: 'rgba(0,0,0,0.12)', transition: 'opacity 0.3s' }}
            onClick={() => { setShowNotifModal(false); setContadorNotif(0); }}
          />
          {/* Painel */}
          <div
            className="fixed top-0 right-0 bottom-0 z-[10001] print:hidden flex flex-col"
            style={{
              width: '400px', maxWidth: '90vw',
              background: 'linear-gradient(180deg, var(--portal-bg-card) 0%, var(--portal-bg-secondary) 100%)',
              boxShadow: '-12px 0 48px rgba(0,0,0,0.08)',
              animation: 'notifSlideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              padding: '28px 24px 20px', flexShrink: 0,
              borderBottom: '1px solid var(--portal-border)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div>
                  <h2 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--portal-text)', margin: 0, letterSpacing: '-0.3px' }}>Notificações</h2>
                  <p style={{ fontSize: '12px', color: 'var(--portal-text-muted)', margin: '4px 0 0', fontWeight: '500' }}>
                    {notificacoes.length === 0 ? 'Nenhuma atualização' : `${notificacoes.length} ${notificacoes.length === 1 ? 'atualização' : 'atualizações'} recentes`}
                  </p>
                </div>
                <button
                  onClick={() => { setShowNotifModal(false); setContadorNotif(0); }}
                  style={{
                    width: '32px', height: '32px', borderRadius: '10px',
                    background: 'var(--portal-bg-secondary)', border: 'none', color: 'var(--portal-text-muted)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#FFEDD5'; e.currentTarget.style.color = '#EA580C' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--portal-bg-secondary)'; e.currentTarget.style.color = 'var(--portal-text-muted)' }}
                >
                  <X size={16} />
                </button>
              </div>
              {notificacoes.length > 0 && (
                <button
                  onClick={() => setNotificacoes([])}
                  style={{
                    width: '100%', padding: '8px', borderRadius: '10px',
                    background: '#FFF7ED', border: '1px solid #FED7AA',
                    color: '#EA580C', fontSize: '11px', fontWeight: '600',
                    cursor: 'pointer', transition: 'all 0.2s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#FFEDD5' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#FFF7ED' }}
                >
                  <CheckCheck size={13} /> Limpar todas
                </button>
              )}
            </div>

            {/* Lista */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
              {notificacoes.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px' }}>
                  <div style={{
                    width: '64px', height: '64px', borderRadius: '20px',
                    background: 'var(--portal-bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <Bell size={28} color="var(--portal-text-faint)" />
                  </div>
                  <p style={{ fontSize: '14px', color: 'var(--portal-text-muted)', fontWeight: '500' }}>Tudo em dia!</p>
                  <p style={{ fontSize: '12px', color: 'var(--portal-text-faint)' }}>Nenhuma notificação pendente</p>
                </div>
              ) : notificacoes.map((n: any, i: number) => (
                <div
                  key={n.id}
                  onClick={() => abrirNotificacao(n.idOriginal)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: '14px',
                    padding: '16px', borderRadius: '14px', cursor: 'pointer',
                    marginBottom: '4px', transition: 'all 0.2s',
                    background: 'transparent',
                    border: '1px solid transparent',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--portal-bg-card)'; e.currentTarget.style.border = '1px solid var(--portal-border)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.border = '1px solid transparent'; e.currentTarget.style.boxShadow = 'none' }}
                >
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '12px',
                    background: 'linear-gradient(135deg, #FFF7ED, #fff1f2)',
                    border: '1px solid #FED7AA',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <Bell size={16} color="#EA580C" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontSize: '13px', fontWeight: '600', color: 'var(--portal-text)',
                      margin: 0, lineHeight: '1.4',
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any
                    }}>{n.titulo}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                      <span style={{
                        fontSize: '11px', color: 'var(--portal-text-muted)', fontWeight: '500'
                      }}>{n.solicitante}</span>
                      <span style={{ width: '3px', height: '3px', borderRadius: '50%', background: 'var(--portal-text-faint)' }} />
                      <span style={{
                        fontSize: '11px', color: '#EA580C', fontWeight: '600'
                      }}>{n.hora}</span>
                    </div>
                  </div>
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '8px',
                    background: 'var(--portal-bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, marginTop: '4px'
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--portal-text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <style>{`
            @keyframes notifSlideIn {
              from { transform: translateX(100%); }
              to { transform: translateX(0); }
            }
          `}</style>
        </>
      )}

      {/* Abas coloridas (Estilo POS NewPortal) + "Como ler esta tela" */}
      <div style={{ marginBottom: 14, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', borderBottom: '1px solid var(--border, #e2e8f0)' }}>
        <div className="rq-abas">
          {tabs.map(tab => (
            <button key={tab.id} type="button" onClick={() => setAbaAtiva(tab.id)}
              className={`rq-aba ${abaAtiva === tab.id ? 'on' : ''}`} style={{ ['--c' as any]: tab.cor }}>
              <span className="rq-aba-ico"><i className={`fa-solid ${tab.icone}`} /></span>
              {tab.label}
              {tab.conta ? <span className="rq-aba-conta">{tab.conta}</span> : null}
            </button>
          ))}
        </div>
        <button type="button" className="rq-btn" style={{ marginBottom: 6, ['--c' as any]: '#2563EB' }} onClick={() => setComoLer(true)}>
          <i className="fa-regular fa-circle-question" style={{ color: '#2563EB' }} /> Como ler esta tela
        </button>
      </div>

      {comoLer && (
        <div className="fixed inset-0 z-[10002] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,.35)', backdropFilter: 'blur(6px)' }} onClick={() => setComoLer(false)}>
          <div className="rq-card" style={{ maxWidth: 640, width: '100%', maxHeight: '85vh', overflowY: 'auto', padding: '22px 24px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 19, fontWeight: 500 }}>Como ler esta tela</span>
              <button className="rq-btn" style={{ height: 32 }} onClick={() => setComoLer(false)}><X size={14} /></button>
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--rq-sec)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p><span style={{ fontWeight: 500, color: 'var(--rq-txt)' }}>Quadro</span> — cada coluna é uma fase: pedido → atualizada pelo técnico → aguardando fornecedor → financeiro. Arraste o cartão para mudar de fase. Em cima de cada coluna: quantas e quanto somam.</p>
              <p><span style={{ fontWeight: 500, color: 'var(--rq-txt)' }}>Precisa da sua atenção</span> — o que está travado: abertas paradas há muito tempo, que foram ao financeiro sem nota, acima de R$ 500, sem fornecedor ou que parecem duplicadas. Clique num número para ver só aquelas no quadro; clique de novo para tirar.</p>
              <p><span style={{ fontWeight: 500, color: 'var(--rq-txt)' }}>Cartão</span> — o ícone e a cor dizem o tipo (combustível, carro, alimentação…). Embaixo, o valor e se tem nota, boleto ou recibo (verde = anexado). &quot;Parada há N dias&quot; aparece depois de uma semana aberta.</p>
              <p><span style={{ fontWeight: 500, color: 'var(--rq-txt)' }}>Painel</span> — quanto se gastou no período, por mês, por tipo, fornecedor, veículo e pessoa, e quanto tempo leva até o financeiro. Clique numa barra para ver aquelas requisições no quadro.</p>
              <p><span style={{ fontWeight: 500, color: 'var(--rq-txt)' }}>Nova requisição (+)</span> — ao escolher o tipo (e o carro), o sistema sugere o fornecedor e o valor de costume e avisa se já existe uma parecida.</p>
              <p>Quando a fase muda, quem pediu recebe um aviso no sino.</p>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-32">
          <Activity className="animate-spin text-orange-500" />
        </div>
      ) : (
        <div className="print:hidden">
          {abaAtiva === 'kanban' && isDev && userProfile && (
            <PainelDev devId={userProfile.id} devNome={userProfile.nome} cartao />
          )}
          {abaAtiva === 'kanban' && podeEditar && (
            <NotasEncontradasCartao qtd={sugestoesNota.length} onAbrir={() => { setFocoNota(null); setVerNotas(true); }} />
          )}
          {verNotas && (
            <ConfirmarNotas sugestoes={sugestoesNota} requisicoes={requisicoes}
              foco={focoNota} onConfirmar={confirmarNota} onRecusar={recusarNota} onFechar={() => setVerNotas(false)} />
          )}
          {abaAtiva === 'kanban' && (
            <PainelAtencao
              requisicoes={requisicoes}
              filtroAtivo={filtroEspecial?.chave || null}
              onFiltrar={(it: ItemAtencao | null) => setFiltroEspecial(it ? { chave: it.chave, ids: it.ids, titulo: it.titulo } : null)}
            />
          )}
          {abaAtiva === 'painel' && (
            <PainelGastos
              requisicoes={requisicoes}
              veiculos={veiculos}
              nomeDe={nomeDe}
              onVerNoQuadro={(ids, titulo) => { setFiltroEspecial({ ids, titulo }); setAbaAtiva('kanban'); }}
            />
          )}
          {abaAtiva === 'kanban' && (
            <Kanban
              filtroEspecial={filtroEspecial}
              onLimparEspecial={() => setFiltroEspecial(null)}
              notasAchadas={podeEditar ? reqsComNota : null}
              onVerNotaAchada={(id: number) => { setFocoNota(id); setVerNotas(true); }}
              requisicoes={requisicoes}
              onUpdate={handleUpdateReq}
              onPrint={dispararImpressao}
              idDestaque={idDestaque}
              onCardFechado={handleCardFechado}
              podeEditar={podeEditar}
              podeMoverFase={podeMoverFase}
              podeImprimir={podeImprimir}
              podeExcluir={podeExcluir}
            />
          )}

          {abaAtiva === 'fornecedores' && (
            <FormFornecedor
              editarId={editarFornecedorId}
              onSave={async (n: Record<string, unknown>) => {
                const { error } = await supabase.from('Fornecedores').insert([n]);
                if (error) { console.error('Erro ao criar fornecedor:', error); alert('Erro ao cadastrar: ' + error.message); return; }
                auditLog({ sistema: 'requisicoes', acao: 'criar', entidade: 'fornecedor', entidade_label: String(n.nome || '') });
              }}
            />
          )}

          {abaAtiva === 'relatorio' && (() => {
            const tipos = [...new Set(requisicoes.filter(r => r.status !== 'lixeira').map(r => r.tipo || r.ReqTipo).filter(Boolean))].sort();
            const setores = [...new Set(requisicoes.filter(r => r.status !== 'lixeira').map(r => r.setor).filter(Boolean))].sort();
            const solicitantes = [...new Set(requisicoes.filter(r => r.status !== 'lixeira').map(r => r.solicitante).filter(Boolean))].sort();
            const veiculosList = veiculos || [];
            const usuariosList = usuarios || [];
            const getNome = (email: string) => { const u = usuariosList.find((x: any) => x.email === email?.trim()); return u?.nome || email || '—'; };
            const getPlaca = (id: any) => { const v = veiculosList.find((x: any) => String(x.IdPlaca) === String(id)); return v?.NumPlaca || ''; };
            const fases = [
              { id: 'pedido', label: 'Pedido Realizado', cor: '#F97316' },
              { id: 'completa', label: 'Atualizada por Técnico', cor: '#06b6d4' },
              { id: 'aguardando', label: 'Aguardando Fornecedor', cor: '#f97316' },
            ];
            const getDetalhe = (r: any) => {
              const tipo = (r.tipo || r.ReqTipo || '').toLowerCase();
              const setor = (r.setor || '').toLowerCase();
              if (setor.includes('cliente')) return r.cliente || '';
              if (['veicular abastecimento', 'veicular manutenção'].includes(tipo)) return getPlaca(r.veiculo) || r.veiculo || '';
              if (setor.includes('trator') && setor.includes('loja')) return r.Chassis_Modelo || '';
              if (['trator abastecimento', 'quadri abastecimento'].includes(tipo)) return r.Chassis_Modelo || '';
              if (tipo === 'ferramenta') return r.quem_ferramenta || '';
              return '';
            };
            const handlePrint = () => {
              const el = document.getElementById('relatorio-req-print');
              if (!el) return;
              const w = window.open('', '_blank');
              if (!w) return;
              w.document.write(`<!DOCTYPE html><html><head><title>Relatório Requisições</title><style>
                @page { size: A4; margin: 10mm; }
                body { font-family: Arial, sans-serif; font-size: 10pt; color: #1e293b; margin: 0; padding: 10px; }
                h1 { font-size: 14pt; margin: 0 0 4px; }
                .info { font-size: 9pt; color: #64748b; margin-bottom: 12px; }
                .fase-header { display: flex; align-items: center; gap: 8px; margin: 16px 0 6px; padding: 6px 10px; border-radius: 6px; }
                .fase-header h2 { font-size: 11pt; margin: 0; color: #fff; }
                .fase-header .count { font-size: 9pt; color: rgba(255,255,255,0.8); }
                table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
                th { background: #f1f5f9; padding: 5px 8px; text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.3px; color: #64748b; border-bottom: 2px solid #e2e8f0; }
                td { padding: 4px 8px; border-bottom: 1px solid #f1f5f9; font-size: 9pt; }
                tr:nth-child(even) { background: #fafbfc; }
                .total { margin-top: 8px; text-align: right; font-size: 10pt; font-weight: 700; }
              </style></head><body>${el.innerHTML}</body></html>`);
              w.document.close();
              w.onload = () => { w.print(); };
            };
            return (
            <div>
              <div className="flex flex-wrap gap-3 mb-6 items-end no-print">
                <div>
                  <label className="text-xs text-black font-medium block mb-1">Buscar</label>
                  <input type="text" placeholder="ID, título, cliente, nº nota..." value={filtroRelBusca} onChange={e => setFiltroRelBusca(e.target.value)} className="border border-zinc-200 rounded-lg px-3 py-2 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-orange-200" />
                </div>
                <div>
                  <label className="text-xs text-black font-medium block mb-1">Tipo</label>
                  <select value={filtroRelTipo} onChange={e => setFiltroRelTipo(e.target.value)} className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200">
                    <option value="">Todos</option>
                    {tipos.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-black font-medium block mb-1">Setor</label>
                  <select value={filtroRelSetor} onChange={e => setFiltroRelSetor(e.target.value)} className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200">
                    <option value="">Todos</option>
                    {setores.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-black font-medium block mb-1">Solicitante</label>
                  <select value={filtroRelSolicitante} onChange={e => setFiltroRelSolicitante(e.target.value)} className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200">
                    <option value="">Todos</option>
                    {solicitantes.map(s => <option key={s} value={s}>{getNome(s)}</option>)}
                  </select>
                </div>
                <button onClick={() => { setFiltroRelBusca(''); setFiltroRelTipo(''); setFiltroRelSetor(''); setFiltroRelSolicitante(''); }} className="text-xs text-black hover:text-orange-600 underline py-2">Limpar filtros</button>
                <button onClick={handlePrint} className="ml-auto bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 text-black px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all">
                  <Printer size={14} /> Imprimir
                </button>
              </div>

              <div className="text-xs text-black mb-3 font-medium">{reqAbertas.length} requisição(ões) aberta(s)</div>

              <div id="relatorio-req-print">
                <h1 style={{ display: 'none' }}>Nova Tratores — Requisições em Aberto</h1>
                <div className="info" style={{ display: 'none' }}>Gerado em: {new Date().toLocaleDateString('pt-BR')} | {reqAbertas.length} requisições</div>

                {fases.map(fase => {
                  const items = reqAbertas.filter(r => r.status === fase.id);
                  if (items.length === 0) return null;
                  return (
                    <div key={fase.id} style={{ marginBottom: 20 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 8, background: fase.cor, marginBottom: 8 }}>
                        <h2 style={{ fontSize: 14, fontWeight: 700, color: '#fff', margin: 0 }}>{fase.label}</h2>
                        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>({items.length})</span>
                      </div>
                      <div className="overflow-x-auto rounded-lg border border-zinc-200">
                        <table className="w-full min-w-[720px] text-sm">
                          <thead>
                            <tr className="bg-zinc-50 text-left text-xs text-black uppercase tracking-wider">
                              <th className="px-3 py-2 font-semibold">#</th>
                              <th className="px-3 py-2 font-semibold">Título</th>
                              <th className="px-3 py-2 font-semibold">Solicitante</th>
                              <th className="px-3 py-2 font-semibold">Tipo</th>
                              <th className="px-3 py-2 font-semibold">Setor</th>
                              <th className="px-3 py-2 font-semibold">Detalhes</th>
                              <th className="px-3 py-2 font-semibold text-right">Valor</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((r: any) => (
                              <tr key={r.id} className="border-t border-zinc-100 hover:bg-zinc-50 transition-colors">
                                <td className="px-3 py-2 font-semibold text-black">{r.id}</td>
                                <td className="px-3 py-2 text-black font-medium" style={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.titulo || r.Material_Serv_Solicitado || '—'}</td>
                                <td className="px-3 py-2 text-black">{getNome(r.solicitante)}</td>
                                <td className="px-3 py-2"><span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-zinc-100 text-black">{r.tipo || r.ReqTipo || '—'}</span></td>
                                <td className="px-3 py-2 text-black text-xs">{r.setor || '—'}</td>
                                <td className="px-3 py-2 text-black text-xs">{getDetalhe(r)}</td>
                                <td className="px-3 py-2 text-black font-medium text-right whitespace-nowrap">R$ {r.valor_despeza || '0,00'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
                {reqAbertas.length === 0 && (
                  <div className="py-16 text-center text-black text-sm">Nenhuma requisição aberta encontrada</div>
                )}
              </div>
            </div>)
          })()}

          {abaAtiva === 'lixeira' && (
            <LixeiraReq
              requisicoes={requisicoes}
              nomeDe={nomeDe}
              podeRestaurar={podeExcluir}
              onRestaurar={async (r: any) => {
                await supabase.from('Requisicao').update({ status: 'pedido' }).eq('id', r.id);
                setRequisicoes(prev => prev.map(x => x.id === r.id ? { ...x, status: 'pedido' } : x));
                auditLog({ sistema: 'requisicoes', acao: 'mover_status', entidade: 'requisicao', entidade_id: String(r.id), entidade_label: r.titulo, detalhes: { de: 'lixeira', para: 'pedido' } });
                notificarUsuariosReq('requisicao', `${userName} restaurou requisição #${r.id}`, r.titulo || '', '/requisicoes');
              }}
            />
          )}
        </div>
      )}

      {/* Painel do Dev (só visível para Devs) */}
      {/* Painel do Dev agora fica inline na barra de filtros do Kanban (extraControles) */}

      {/* Card aberto (modal de detalhes) → os botões flutuantes somem */}
      <style>{`body[data-req-modal="1"] .fab-nova-req, body[data-req-modal="1"] .fab-painel-dev { display: none !important; }`}</style>

      {/* FAB - Nova Requisição */}
      <button
        onClick={() => setAbaAtiva(abaAtiva === 'form' ? 'kanban' : 'form')}
        {...gateBtn(podeCriar)}
        style={{
          position: 'fixed', bottom: '32px', right: '32px',
          width: '56px', height: '56px',
          background: abaAtiva === 'form' ? '#EA580C' : 'linear-gradient(135deg, #EA580C, #C2410C)',
          color: '#fff', borderRadius: '16px', border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 24px rgba(220,38,38,0.3)',
          cursor: 'pointer', zIndex: 110, transition: 'all 0.3s',
          transform: abaAtiva === 'form' ? 'rotate(45deg)' : 'rotate(0deg)',
          ...estiloSemPermissao(podeCriar)
        }}
        className="print:hidden fab-nova-req"
      >
        <Plus size={24} />
      </button>

      {/* Form Modal */}
      {podeCriar && abaAtiva === 'form' && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[100] flex items-center justify-center p-2 md:p-4 print:hidden">
          <div className="w-full max-w-5xl bg-white rounded-2xl border border-zinc-200 overflow-y-auto max-h-[90vh] shadow-xl">
            <FormReq osInicial={searchParams.get('os')} historico={requisicoes} onSave={async (nova: Record<string, unknown>) => {
              nova.criado_por = userName;
              // Grupos escolhidos na criação (não é coluna — remove antes do insert)
              const gruposEscolhidos: number[] = Array.isArray(nova._grupos) ? (nova._grupos as number[]) : [];
              delete nova._grupos;
              const { data: ins, error } = await supabase.from('Requisicao').insert([nova]).select('id').single();
              if (error) {
                console.error('[Requisições] Erro ao criar:', error);
                alert('Erro ao criar requisição: ' + error.message);
                return;
              }
              // Vincula a nova requisição aos grupos escolhidos (best-effort)
              // Um de cada vez: a rota relê e regrava o histórico do grupo, e chamadas
              // em paralelo perdiam entrada do histórico
              if (ins?.id && gruposEscolhidos.length > 0) {
                for (const gid of gruposEscolhidos) {
                  await fetch('/api/pos/requisicoes/grupos/membros', {
                    method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
                    body: JSON.stringify({ grupo_id: gid, req_id: ins.id, acao: 'add', usuario: userName }),
                  }).catch(() => {});
                }
              }
              apagarRascunho(RASCUNHO_NOVA_REQ); // criou: o rascunho não serve mais
              auditLog({ sistema: 'requisicoes', acao: 'criar', entidade: 'requisicao', entidade_label: String(nova.titulo || '') });
              notificarUsuariosReq('requisicao', `${userName} criou uma requisição`, String(nova.titulo || 'Nova requisição'), '/requisicoes');
              // Veicular Manutenção → a pendência da Frota nasce NA HORA (o motor
              // cria pro carro com o km do hodômetro e fecha sozinho quando a
              // requisição chegar ao financeiro)
              if (nova.tipo === 'Veicular Manutenção') {
                fetch('/api/frota/pendencias/sync', { method: 'POST', headers: await authHeaders() }).catch(() => {});
              }
              setAbaAtiva('kanban');
              carregarDados(true);
            }} />
          </div>
        </div>
      )}
    </div>
    </div>
  );
}

export default function RequisicoesPage() {
  const { userProfile } = useAuth();
  const { temAcesso, loading: loadingPerm } = usePermissoes(userProfile?.id);
  if (!loadingPerm && userProfile && !temAcesso('requisicoes')) return <SemPermissao />;
  return (
    <Suspense fallback={<div style={{ padding: '60px', textAlign: 'center', color: '#6b7280' }}>Carregando...</div>}>
      <RequisicoesPageInner />
    </Suspense>
  );
}
