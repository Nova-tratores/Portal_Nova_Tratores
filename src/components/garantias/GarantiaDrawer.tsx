'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  X, Loader2, ExternalLink, Package, ShieldCheck, Factory, Send,
  AlertTriangle, CheckCircle2, XCircle, Save, History, FileWarning, MapPin, RefreshCw, ImagePlus,
  Mail, ChevronDown, ChevronUp, FileText, Download, Pencil, HelpCircle, QrCode,
} from 'lucide-react';
import GuiaMontadoraModal from './GuiaMontadoraModal';
import QRGarantiaModal from './QRGarantiaModal';
import type { GarantiaDetalhe, Montadora, ChecklistField } from '@/lib/garantias/types';
import { STATUS_LABEL, STATUS_COR } from '@/lib/garantias/constants';
import { camposObrigatoriosFaltando } from '@/lib/garantias/checklist';
import { fmtDataHora, fmtMoeda, diasEntre } from '@/lib/garantias/format';
import ChecklistRenderer from './ChecklistRenderer';
import MontadoraPicker from './MontadoraPicker';
import GarantiaFotosOS from './GarantiaFotosOS';
import GarantiaFotosGarantista from './GarantiaFotosGarantista';
import GarantiaAnexos from './GarantiaAnexos';
import ValoresComparativo from './ValoresComparativo';
import GarantiaTimeline from './GarantiaTimeline';
import CobrancaCliente from './CobrancaCliente';
import SolicitacaoEmailSecao from './SolicitacaoEmailSecao';
import RelatoTratorilsonSecao from './RelatoTratorilsonSecao';
import ConversaFabrica from './ConversaFabrica';
import DevolucaoPecasSecao from './DevolucaoPecasSecao';
import { guiaDaMontadora } from '@/lib/garantias/guias';
import { MSG_SEM_PERMISSAO } from '@/lib/permissoes/ui';

interface Props {
  garantiaId: string;
  userName: string;
  userId: string;
  onClose: () => void;
  onSaved: () => void;
  podeAnalisar?: boolean;
  podeEnviarFabrica?: boolean;
  podeFinalizar?: boolean;
}

function Secao({ titulo, icone, children }: { titulo: string; icone?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--portal-bg-card)',
        border: '1px solid var(--portal-border)',
        borderRadius: 12,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {icone}
        {titulo}
      </div>
      {children}
    </div>
  );
}

const btn = (bg: string, disabled?: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  padding: '9px 14px',
  borderRadius: 9,
  border: 'none',
  background: bg,
  color: '#fff',
  fontSize: 13,
  fontWeight: 600,
  cursor: disabled ? 'default' : 'pointer',
  opacity: disabled ? 0.55 : 1,
});

const taStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--portal-border)',
  background: 'var(--portal-bg-input)',
  color: 'var(--portal-text)',
  fontSize: 13,
  fontFamily: 'inherit',
  resize: 'vertical',
  outline: 'none',
};

export default function GarantiaDrawer({ garantiaId, userName, userId, onClose, onSaved, podeAnalisar = true, podeEnviarFabrica = true, podeFinalizar = true }: Props) {
  const [g, setG] = useState<GarantiaDetalhe | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [verTimeline, setVerTimeline] = useState(false);
  const [qrAberto, setQrAberto] = useState(false);
  // Correção manual de chassi/modelo (garantia criada antes do trator existir
  // no controle de revisões)
  const [editTrator, setEditTrator] = useState<{ chassis: string; modelo: string } | null>(null);
  // Garante que a auto-sincronização com a OS roda só uma vez por garantia
  const autoSyncRef = useRef<string | null>(null);

  // Estado editável (análise)
  const [respostas, setRespostas] = useState<Record<string, unknown>>({});
  const [gHoras, setGHoras] = useState<string>('');
  const [gKm, setGKm] = useState<string>('');
  const [gObs, setGObs] = useState('');

  // Devolução ao técnico
  const [boTexto, setBoTexto] = useState('');
  const [boVisita, setBoVisita] = useState(false);

  // Finalização
  const [motivoRecusa, setMotivoRecusa] = useState('');
  const [pecasAprovadas, setPecasAprovadas] = useState<Set<string>>(new Set());
  // Garantia paga M.O. (horas) e/ou Deslocamento (km)? Default: paga os dois.
  const [moAprovada, setMoAprovada] = useState(true);
  const [deslocAprovado, setDeslocAprovado] = useState(true);
  // Retorno das peças (1ª etapa do fluxo duas_etapas): valor pago das peças
  // editável — vazio = usa a soma das peças marcadas.
  const [valorPecasStr, setValorPecasStr] = useState('');
  // Devolução das peças à fábrica (prova de destruição): checkbox da
  // finalização. Init-once por garantia+montadora via ref — carregar() roda
  // após toda ação e um useState de prop resetaria o checkbox no meio da
  // finalização.
  const [devolucaoPedida, setDevolucaoPedida] = useState(false);
  const devolucaoInitRef = useRef<string | null>(null);

  // Recusa interna (em_analise)
  const [recusaTexto, setRecusaTexto] = useState('');
  const [mostrarRecusa, setMostrarRecusa] = useState(false);

  // Guia "como solicitar garantia" da montadora
  const [guiaAberto, setGuiaAberto] = useState(false);

  // Emails do chassi
  const [emailsAberto, setEmailsAberto] = useState(false);
  const [emailsList, setEmailsList] = useState<any[] | null>(null);
  const [emailsLoading, setEmailsLoading] = useState(false);
  const [emailModal, setEmailModal] = useState<any | null>(null);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch(`/api/garantias/${garantiaId}`);
      const data = await res.json();
      if (!res.ok) {
        setErro(data.error || 'Falha ao carregar garantia.');
        return;
      }
      const det: GarantiaDetalhe = data.garantia;
      setG(det);
      setRespostas((det.checklist_respostas as Record<string, unknown>) || {});
      setGHoras(det.garantista_horas != null ? String(det.garantista_horas) : '');
      setGKm(det.garantista_km != null ? String(det.garantista_km) : '');
      setGObs(det.garantista_obs || '');
      // Default: todas as peças marcadas como aprovadas. Após finalizar — ou
      // após o retorno das peças (1ª etapa do fluxo duas_etapas) — respeita o
      // resultado salvo.
      const jaFinalizada = det.status === 'aprovada' || det.status === 'rejeitada';
      const pecasResolvidas =
        jaFinalizada || det.status === 'aguardando_servico' || det.status === 'ressarcimento_fabrica';
      const aprovadasIds = det.pecas
        .filter((p) => pecasResolvidas ? p.resultado === 'aprovada' : true)
        .map((p) => p.id);
      setPecasAprovadas(new Set(aprovadasIds));
      // M.O. e deslocamento: default pagos; após finalizar, reflete o que foi pago.
      setMoAprovada(jaFinalizada ? (Number(det.valor_pago_horas) || 0) > 0 : true);
      setDeslocAprovado(jaFinalizada ? (Number(det.valor_pago_km) || 0) > 0 : true);
    } catch {
      setErro('Erro de conexão.');
    } finally {
      setLoading(false);
    }
  }, [garantiaId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Re-sincroniza peças + horas + km a partir da OS de origem.
  // silent=true: usado no auto-sync ao abrir (não mostra mensagem/spinner).
  const sincronizarOS = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent;
      // O auto-sync (silent) é higiene de dados em background — sempre roda, pra
      // quem só finaliza também ver as peças atualizadas. Só o botão MANUAL
      // exige a permissão de analisar.
      if (!silent && !podeAnalisar) { setErro('Você não tem permissão para sincronizar com a OS.'); return; }
      if (!silent) { setBusy('sincronizar'); setErro(''); setAviso(''); }
      try {
        const res = await fetch(`/api/garantias/${garantiaId}/sincronizar-os`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ator: userName }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (!silent) setErro(data.error || 'Falha ao sincronizar com a OS.');
          return;
        }
        if (data.changed) {
          await carregar();
          onSaved();
          if (!silent) setAviso(`Atualizado da OS: ${data.qtd_pecas} peça(s) · ${data.horas}h / ${data.km} km.`);
        } else if (!silent) {
          setAviso('Já estava atualizado com a OS.');
        }
      } catch {
        if (!silent) setErro('Erro de conexão ao sincronizar.');
      } finally {
        if (!silent) setBusy('');
      }
    },
    [garantiaId, userName, carregar, onSaved, podeAnalisar],
  );

  // Auto-sincroniza ao abrir, uma vez por garantia, nas fases editáveis (antes
  // do envio à fábrica). O PPV (conectado ao POS) é a fonte da verdade das
  // peças, então mantemos peças/horas/km sempre espelhando a OS. Depois do
  // envio, a foto fica congelada (usa-se o botão manual se precisar refazer).
  useEffect(() => {
    if (!g) return;
    if (autoSyncRef.current === g.id) return;
    autoSyncRef.current = g.id;
    // Auto-sincroniza em todos os estágios ANTES de finalizar (não só na
    // análise): custos de terceiro / requisições podem entrar enquanto a
    // garantia está na fábrica ('enviada') ou com info pendente. Só não
    // sincroniza depois de aprovada/rejeitada (peças congeladas).
    // 'aguardando_servico' também sincroniza: o serviço está sendo executado
    // agora, e as horas/km precisam estar frescas pro pedido de ressarcimento.
    // Depois do pedido ('ressarcimento_fabrica') a foto congela.
    const editavel =
      g.status === 'em_analise' ||
      g.status === 'bo_tecnico' ||
      g.status === 'enviada' ||
      g.status === 'info_pendente' ||
      g.status === 'aguardando_servico';
    if (editavel) {
      sincronizarOS({ silent: true });
    }
  }, [g, sincronizarOS]);

  // Pré-marca o checkbox de devolução das peças conforme a flag da montadora —
  // 1x por garantia/montadora (não reseta a escolha do garantista a cada reload)
  useEffect(() => {
    if (!g) return;
    const chave = `${g.id}:${g.montadora?.id ?? ''}`;
    if (devolucaoInitRef.current === chave) return;
    devolucaoInitRef.current = chave;
    setDevolucaoPedida(!!g.montadora?.exige_devolucao_pecas);
  }, [g]);

  async function uploadChecklistFile(file: File): Promise<string> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('categoria', 'garantista');
    fd.append('enviado_por', userName);
    const res = await fetch(`/api/garantias/${garantiaId}/anexos`, { method: 'POST', body: fd });
    const data = await res.json();
    return data.anexo?.url || '';
  }

  // Centraliza o enforcement: cada ação do drawer mapeia pra uma permissão.
  function acaoPermitida(acao: string): boolean {
    if (acao === 'enviar' || acao === 'enviar_sg' || acao === 'solicitar_ressarcimento') return podeEnviarFabrica;
    if (acao === 'finalizar' || acao === 'retorno_pecas' || acao === 'recusar_interno' || acao === 'reabrir_recusa' || acao.startsWith('cobranca_') || acao.startsWith('devolucao_')) return podeFinalizar;
    return podeAnalisar; // assumir, montadora, analise, pendencia, tipo_garantia, gerar_sg, atualizar_precos...
  }

  async function chamar(acao: string, url: string, opts: RequestInit) {
    if (!acaoPermitida(acao)) { setErro('Você não tem permissão para esta ação.'); return false; }
    setBusy(acao);
    setErro('');
    try {
      const res = await fetch(url, opts);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(data.error || 'Falha na operação.');
        return false;
      }
      await carregar();
      onSaved();
      return true;
    } catch {
      setErro('Erro de conexão.');
      return false;
    } finally {
      setBusy('');
    }
  }

  const assumir = () =>
    chamar('assumir', `/api/garantias/${garantiaId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'assumir', garantista_nome: userName, garantista_user_id: userId }),
    });

  const selecionarMontadora = (m: Montadora | null) =>
    chamar('montadora', `/api/garantias/${garantiaId}/checklist`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ montadora_id: m?.id || null, garantista_nome: userName }),
    });

  const salvarAnalise = () =>
    chamar('analise', `/api/garantias/${garantiaId}/checklist`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        checklist_respostas: respostas,
        garantista_horas: gHoras,
        garantista_km: gKm,
        garantista_obs: gObs,
        garantista_nome: userName,
      }),
    });

  const enviarFabrica = async () => {
    await salvarAnalise();
    await chamar('enviar', `/api/garantias/${garantiaId}/enviar-fabrica`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ garantista_nome: userName }),
    });
  };

  const abrirPendencia = (tipo: 'bo' | 'info_fabrica') =>
    chamar('pendencia', `/api/garantias/${garantiaId}/pendencias`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo, descricao: boTexto, exige_visita: boVisita, criado_por: userName }),
    }).then((ok) => {
      if (ok) {
        setBoTexto('');
        setBoVisita(false);
      }
    });

  const finalizar = (resultado: 'aprovada' | 'rejeitada') =>
    chamar('finalizar', `/api/garantias/${garantiaId}/finalizar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resultado,
        motivo_recusa: motivoRecusa,
        garantista_horas: gHoras,
        garantista_km: gKm,
        garantista_obs: gObs,
        garantista_nome: userName,
        pecas_aprovadas: resultado === 'aprovada' ? [...pecasAprovadas] : [],
        mo_aprovada: moAprovada,
        desloc_aprovado: deslocAprovado,
        devolucao_pedida: devolucaoPedida,
      }),
    });

  // Devolução das peças à fábrica (registrar/prazo/dispensar/reabrir)
  const acaoDevolucao = (acao: string, payload?: Record<string, unknown>) =>
    chamar(`devolucao_${acao}`, `/api/garantias/${garantiaId}/devolucao`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao, ator: userName, ...payload }),
    });

  // 1ª etapa (fluxo duas_etapas): registra o retorno da fábrica sobre as peças
  const registrarRetornoPecas = () => {
    if (pecasAprovadas.size === 0) {
      const ok = confirm(
        'Nenhuma peça marcada como aprovada.\n\nA garantia será RECUSADA pela fábrica e a cobrança ao cliente fica liberada. Confirmar?'
      );
      if (!ok) return Promise.resolve(false);
    }
    const valorNum = valorPecasStr.trim() === '' ? undefined : Number(valorPecasStr.replace(',', '.'));
    return chamar('retorno_pecas', `/api/garantias/${garantiaId}/retorno-pecas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pecas_aprovadas: [...pecasAprovadas],
        valor_pago_pecas: valorNum,
        motivo_recusa: motivoRecusa,
        garantista_nome: userName,
      }),
    }).then((ok) => {
      if (ok) { setMotivoRecusa(''); setValorPecasStr(''); }
      return ok;
    });
  };

  // 2ª etapa (fluxo duas_etapas): serviço executado → pede o ressarcimento
  const solicitarRessarcimento = () =>
    chamar('solicitar_ressarcimento', `/api/garantias/${garantiaId}/solicitar-ressarcimento`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        garantista_nome: userName,
        garantista_horas: gHoras,
        garantista_km: gKm,
        garantista_obs: gObs,
      }),
    });

  // Recusa interna (em_analise → rejeitada, sem enviar pra fábrica)
  const recusarInterno = () =>
    chamar('recusar_interno', `/api/garantias/${garantiaId}/finalizar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resultado: 'rejeitada',
        recusa_garantista: true,
        motivo_recusa: recusaTexto,
        garantista_horas: gHoras,
        garantista_km: gKm,
        garantista_obs: gObs,
        garantista_nome: userName,
      }),
    });

  const reabrirRecusa = (motivo: string) =>
    chamar('reabrir_recusa', `/api/garantias/${garantiaId}/reabrir-recusa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ator: userName, motivo }),
    });

  const acaoCobranca = (acao: string, payload?: Record<string, unknown>) =>
    chamar(`cobranca_${acao}`, `/api/garantias/${garantiaId}/cobranca`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao, ator: userName, ...payload }),
    });

  // ---- Render ----
  const campos: ChecklistField[] = g?.checklist_snapshot || g?.montadora?.checklist_def || [];
  const faltando = camposObrigatoriosFaltando(campos, respostas);
  const emAnalise = g?.status === 'em_analise';
  const naFabrica = g?.status === 'enviada';
  const finalizada = g?.status === 'aprovada' || g?.status === 'rejeitada';
  const aguardandoTec = g?.status === 'bo_tecnico' || g?.status === 'info_pendente';
  const pendenciaAberta = g?.pendencias?.find((p) => p.status === 'aberta') || null;
  const temRetornoFabrica = !!g?.retorno_fabrica_url;
  // Fluxo em duas etapas (peças primeiro, ressarcimento de horas/km depois)
  const fluxoDuasEtapas = g?.montadora?.fluxo === 'duas_etapas';
  const aguardandoServico = g?.status === 'aguardando_servico';
  const emRessarcimento = g?.status === 'ressarcimento_fabrica';
  const naFabricaDuasEtapas = naFabrica && fluxoDuasEtapas;
  // Ipacol (tipo e-mail): RAT do atendimento é OPCIONAL (às vezes a própria
  // fábrica executa o serviço) — quando anexada após o retorno das peças, vai
  // junto no e-mail do ressarcimento
  const mostraRatAtendimento = g?.montadora?.tipo_template === 'email';
  const temRatAtendimento = !!g?.anexos?.some(
    (a) => a.categoria === 'relatorio_at' && (!g.pecas_retorno_em || a.created_at >= g.pecas_retorno_em)
  );

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 900, display: 'flex', justifyContent: 'flex-end' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(560px, 100%)',
          height: '100%',
          background: 'var(--portal-bg)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-10px 0 40px rgba(0,0,0,0.3)',
        }}
      >
        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--portal-text-muted)' }}>
            <Loader2 size={22} className="spin" />
          </div>
        ) : !g ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--portal-text-muted)', flexDirection: 'column', gap: 10 }}>
            {erro || 'Garantia não encontrada.'}
            <button onClick={onClose} style={btn('#64748b')}>Fechar</button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 18px',
                borderBottom: '1px solid var(--portal-border)',
                background: 'var(--portal-bg-card)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--portal-text)' }}>{g.numero}</span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: STATUS_COR[g.status],
                    background: STATUS_COR[g.status] + '1c',
                    padding: '3px 8px',
                    borderRadius: 6,
                  }}
                >
                  {STATUS_LABEL[g.status]}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setVerTimeline((v) => !v)}
                  title="Histórico"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: verTimeline ? '#0ea5e9' : 'var(--portal-text-muted)' }}
                >
                  <History size={19} />
                </button>
                <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--portal-text-muted)' }}>
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {erro && (
                <div style={{ fontSize: 12, color: '#dc2626', background: '#dc262615', padding: '8px 10px', borderRadius: 8 }}>
                  {erro}
                </div>
              )}

              {/* Etapas do fluxo duas_etapas (peças → serviço → ressarcimento) */}
              {fluxoDuasEtapas && g.status !== 'aberta' && (
                <EtapasGarantia
                  etapaAtual={
                    finalizada ? 4
                    : emRessarcimento ? 3
                    : aguardandoServico ? 2
                    : g.status === 'info_pendente' && g.ressarcimento_enviado_em ? 3
                    : naFabrica || g.status === 'info_pendente' ? 1
                    : 0
                  }
                />
              )}

              {verTimeline && (
                <Secao titulo="Histórico" icone={<History size={14} />}>
                  <GarantiaTimeline eventos={g.eventos} />
                </Secao>
              )}

              {/* Dados da OS / máquina */}
              <Secao titulo="Ordem de serviço" icone={<ShieldCheck size={14} />}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', fontSize: 13 }}>
                  <Campo label="Cliente" valor={g.cliente} />
                  <Campo label="OS" valor={g.id_ordem} />
                  <Campo label="Chassi" valor={g.chassis} />
                  <Campo label="Modelo" valor={g.modelo} />
                  <Campo label="Técnico" valor={g.tecnico_nome} />
                  <Campo label="Garantista" valor={g.garantista_nome} />
                </div>

                {/* Correção do chassi/modelo — garantia criada antes do trator
                    entrar no controle de revisões fica sem chassi (e a SG da
                    fábrica recusaria). Puxa do cadastro ou edita na mão. */}
                {!finalizada && !editTrator && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      onClick={async () => {
                        const ok = await chamar('atualizar_trator', `/api/garantias/${garantiaId}/atualizar-trator`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ ator: userName }),
                        });
                        if (ok) setAviso('Chassi/modelo atualizados do controle de revisões.');
                      }}
                      disabled={!!busy}
                      title="Busca o trator no controle de revisões (pelo chassi do Projeto, pelo relatório do técnico ou pelo cliente) e corrige chassi + modelo."
                      style={btn('#0d9488', !!busy)}
                    >
                      {busy === 'atualizar_trator' ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
                      Puxar chassi/modelo do controle de revisões
                    </button>
                    <button
                      onClick={() => setEditTrator({ chassis: g.chassis || '', modelo: g.modelo || '' })}
                      disabled={!!busy}
                      style={btn('#64748b', !!busy)}
                    >
                      <Pencil size={14} /> Corrigir manualmente
                    </button>
                  </div>
                )}
                {!finalizada && editTrator && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--portal-bg-secondary, #f8fafc)', border: '1px solid var(--portal-border, #e2e8f0)', borderRadius: 8, padding: 10 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--portal-text-secondary, #64748b)' }}>
                        Chassi
                        <input
                          value={editTrator.chassis}
                          onChange={(e) => setEditTrator({ ...editTrator, chassis: e.target.value })}
                          placeholder="Ex: MBN1KGCBFSGD02113"
                          style={{ width: '100%', marginTop: 4, padding: '7px 9px', borderRadius: 6, border: '1px solid var(--portal-border, #cbd5e1)', fontSize: 13, boxSizing: 'border-box' }}
                        />
                      </label>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--portal-text-secondary, #64748b)' }}>
                        Modelo
                        <input
                          value={editTrator.modelo}
                          onChange={(e) => setEditTrator({ ...editTrator, modelo: e.target.value })}
                          placeholder="Ex: JIVO 245 DI 4WD"
                          style={{ width: '100%', marginTop: 4, padding: '7px 9px', borderRadius: 6, border: '1px solid var(--portal-border, #cbd5e1)', fontSize: 13, boxSizing: 'border-box' }}
                        />
                      </label>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={async () => {
                          const ok = await chamar('atualizar_trator', `/api/garantias/${garantiaId}/atualizar-trator`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ ator: userName, chassis: editTrator.chassis.trim(), modelo: editTrator.modelo.trim() }),
                          });
                          if (ok) { setEditTrator(null); setAviso('Chassi/modelo corrigidos.'); }
                        }}
                        disabled={!!busy || (!editTrator.chassis.trim() && !editTrator.modelo.trim())}
                        style={btn('#0f766e', !!busy)}
                      >
                        {busy === 'atualizar_trator' ? <Loader2 size={15} className="spin" /> : <Save size={15} />}
                        Salvar chassi/modelo
                      </button>
                      <button onClick={() => setEditTrator(null)} disabled={!!busy} style={btn('#94a3b8', !!busy)}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
                <a
                  href={`/pos?id=${g.id_ordem}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#0ea5e9', fontWeight: 600 }}
                >
                  <ExternalLink size={13} /> Abrir OS no Pós-Vendas
                </a>
                <button
                  onClick={() => setQrAberto(true)}
                  title="QR code de acompanhamento: fase atual + fotos, sem login"
                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#334155', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  <QrCode size={13} /> QR code da garantia
                </button>
                {qrAberto && g && <QRGarantiaModal garantiaId={g.id} numero={g.numero} onClose={() => setQrAberto(false)} />}
                {g.status !== 'rejeitada' && (
                  <button
                    onClick={async () => {
                      if (!confirm(`Reaplicar o padrão de garantia na OS ${g.id_ordem} no Omie?\n\n(categoria Serv Prest Garantia, sem conta a receber, conta INTERNO, contrato/projeto da montadora, recibo, depto Garantias)`)) return;
                      const ok = await chamar('refaturar_omie', `/api/garantias/${garantiaId}/refaturar-omie`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ator: userName }),
                      });
                      if (ok) setAviso('Padrão de garantia reaplicado na OS no Omie.');
                    }}
                    disabled={!!busy}
                    title="Usa quando a OS já foi enviada ao Omie sem o padrão de garantia (ex.: garantia criada depois do fechamento)."
                    style={btn('#475569', !!busy)}
                  >
                    {busy === 'refaturar_omie' ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
                    Reaplicar padrão de garantia no Omie
                  </button>
                )}
              </Secao>

              {/* Conversa com a fábrica (e-mails da garantia — enviados + respostas) */}
              {g.status !== 'aberta' && (
                <ConversaFabrica key={g.id} garantiaId={g.id} naoLidos={g.emails_nao_lidos || 0} />
              )}

              {/* Emails do chassi */}
              {g.chassis && (
                <div style={{ background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 12, overflow: 'hidden' }}>
                  <button
                    type="button"
                    onClick={async () => {
                      const opening = !emailsAberto;
                      setEmailsAberto(opening);
                      if (opening && emailsList === null) {
                        setEmailsLoading(true);
                        try {
                          const res = await fetch(`/api/garantias/emails?chassis=${encodeURIComponent(g.chassis || '')}`);
                          const data = await res.json();
                          setEmailsList(data.emails || []);
                        } catch { setEmailsList([]); }
                        setEmailsLoading(false);
                      }
                    }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 6,
                      padding: 14, border: 'none', background: 'none', cursor: 'pointer',
                      fontSize: 12, fontWeight: 700, color: 'var(--portal-text-muted)',
                      textTransform: 'uppercase', letterSpacing: 0.4,
                    }}
                  >
                    <Mail size={14} />
                    Emails do Trator
                    {emailsList !== null && (
                      <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 8, background: emailsList.length > 0 ? '#EFF6FF' : 'var(--portal-bg-secondary)', color: emailsList.length > 0 ? '#2563EB' : 'var(--portal-text-muted)', fontWeight: 700 }}>
                        {emailsList.length}
                      </span>
                    )}
                    <span style={{ marginLeft: 'auto' }}>
                      {emailsAberto ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </span>
                  </button>
                  {emailsAberto && (
                    <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {emailsLoading ? (
                        <div style={{ textAlign: 'center', padding: 16, color: 'var(--portal-text-muted)', fontSize: 12 }}>
                          <Loader2 size={16} className="spin" />
                        </div>
                      ) : !emailsList || emailsList.length === 0 ? (
                        <div style={{ padding: 12, textAlign: 'center', fontSize: 12, color: 'var(--portal-text-muted)' }}>
                          Nenhum email encontrado para este chassi.
                        </div>
                      ) : (
                        emailsList.map((e: any, ei: number) => (
                          <div
                            key={ei}
                            onClick={() => setEmailModal(e)}
                            style={{
                              padding: '10px 12px', border: '1px solid var(--portal-border)', borderRadius: 8,
                              background: 'var(--portal-bg-secondary)', cursor: 'pointer', transition: 'all 0.1s',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                                <span style={{
                                  fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 4, flexShrink: 0,
                                  background: e.tipo === 'revisao' ? '#ECFDF5' : '#EFF6FF',
                                  color: e.tipo === 'revisao' ? '#059669' : '#2563EB',
                                }}>
                                  {e.tipo === 'revisao' ? 'REV' : 'GAR'}
                                </span>
                                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--portal-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {e.assunto}
                                </span>
                              </div>
                              <span style={{ fontSize: 10, color: 'var(--portal-text-muted)', flexShrink: 0 }}>
                                {e.data ? new Date(e.data).toLocaleDateString('pt-BR') : '-'}
                              </span>
                            </div>
                            {e.de && <div style={{ fontSize: 11, color: 'var(--portal-text-muted)', marginTop: 3 }}>De: {e.de}</div>}
                            {e.anexos?.length > 0 && (
                              <div style={{ fontSize: 10, color: '#0ea5e9', marginTop: 3, fontWeight: 600 }}>
                                {e.anexos.length} anexo{e.anexos.length > 1 ? 's' : ''}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Modal de email */}
              {emailModal && (
                <div
                  onClick={(ev) => { if (ev.target === ev.currentTarget) setEmailModal(null); }}
                  style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 10003, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
                >
                  <div style={{ background: 'var(--portal-bg-card)', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '80vh', overflow: 'auto', padding: 24, boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                            background: emailModal.tipo === 'revisao' ? '#ECFDF5' : '#EFF6FF',
                            color: emailModal.tipo === 'revisao' ? '#059669' : '#2563EB',
                          }}>
                            {emailModal.tipo === 'revisao' ? 'REVISÃO' : 'GARANTIA'}
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>
                            {emailModal.data ? new Date(emailModal.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                          </span>
                        </div>
                        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--portal-text)' }}>{emailModal.assunto}</h3>
                        {emailModal.de && <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', marginTop: 4 }}>De: {emailModal.de}</div>}
                      </div>
                      <button onClick={() => setEmailModal(null)} style={{ background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)', borderRadius: 8, padding: 6, cursor: 'pointer', flexShrink: 0 }}>
                        <X size={14} color="var(--portal-text-secondary)" />
                      </button>
                    </div>

                    {emailModal.corpo && (
                      <div style={{ padding: 14, background: 'var(--portal-bg-secondary)', borderRadius: 10, border: '1px solid var(--portal-border)', fontSize: 13, color: 'var(--portal-text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: 14, maxHeight: 300, overflow: 'auto' }}>
                        {emailModal.corpo}
                      </div>
                    )}

                    {emailModal.anexos?.length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Anexos</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {emailModal.anexos.map((a: any, ai: number) => (
                            <a
                              key={ai}
                              href={a.url || a.link || a.part || '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
                                borderRadius: 8, border: '1px solid rgba(59,130,246,0.15)',
                                background: 'rgba(59,130,246,0.04)', textDecoration: 'none',
                                fontSize: 13, color: '#3b82f6', fontWeight: 500,
                              }}
                            >
                              <FileText size={14} />
                              {a.nome || a.filename || `Anexo ${ai + 1}`}
                              <Download size={12} style={{ marginLeft: 'auto', opacity: 0.5 }} />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Peças selecionadas pelo técnico */}
              <Secao titulo={`Peças solicitadas (${g.pecas.length})`} icone={<Package size={14} />}>
                {!finalizada && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <button
                      type="button"
                      onClick={() => sincronizarOS()}
                      disabled={busy === 'sincronizar'}
                      title="Repuxa peças, horas e km direto da OS (PPV, requisições e peças manuais)"
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                        padding: '6px 10px', borderRadius: 7,
                        border: '1px solid var(--portal-border)',
                        background: 'var(--portal-bg-input)',
                        color: 'var(--portal-text-secondary)',
                        fontSize: 11, fontWeight: 600,
                        cursor: busy === 'sincronizar' ? 'default' : 'pointer',
                      }}
                    >
                      {busy === 'sincronizar' ? <Loader2 size={11} className="spin" /> : <RefreshCw size={11} />}
                      Atualizar peças e horas da OS
                    </button>
                    {aviso && <span style={{ fontSize: 11, color: '#16a34a' }}>{aviso}</span>}
                  </div>
                )}
                {g.pecas.length === 0 ? (
                  <span style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>Nenhuma peça vinculada.</span>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {g.pecas.map((p) => (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--portal-text)', padding: '4px 0', borderBottom: '1px solid var(--portal-border)' }}>
                        <span>
                          {p.cod_produto ? `${p.cod_produto} · ` : ''}
                          {p.descricao}
                        </span>
                        <span style={{ color: 'var(--portal-text-muted)', whiteSpace: 'nowrap' }}>x{p.quantidade}</span>
                      </div>
                    ))}
                  </div>
                )}
                {g.tecnico_obs && (
                  <div style={{ fontSize: 12, color: 'var(--portal-text-secondary)', background: 'var(--portal-bg-secondary)', padding: '6px 8px', borderRadius: 6 }}>
                    <strong>Obs. do técnico:</strong> {g.tecnico_obs}
                  </div>
                )}
              </Secao>

              {/* Fotos da OS */}
              <Secao titulo="Fotos da OS (para enviar à fábrica)" icone={<Package size={14} />}>
                <GarantiaFotosOS osId={g.id_ordem} />
              </Secao>

              {/* Fotos do garantista — útil quando a garantia foi criada
                  manualmente e a OS não tem fotos do relatório do técnico */}
              <Secao titulo="Fotos da garantia (adicionadas pelo garantista)" icone={<ImagePlus size={14} />}>
                <GarantiaFotosGarantista
                  garantiaId={g.id}
                  fotos={g.anexos.filter((a) => a.categoria === 'foto_garantista')}
                  enviadoPor={userName}
                  onChange={carregar}
                  readOnly={finalizada}
                />
              </Secao>

              {/* Pendência aberta (aguardando técnico) */}
              {pendenciaAberta && (
                <div style={{ background: '#f59e0b15', border: '1px solid #f59e0b55', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#b45309', textTransform: 'uppercase' }}>
                    <AlertTriangle size={14} />
                    {pendenciaAberta.tipo === 'bo' ? 'B.O. — aguardando o técnico' : 'Pendência da fábrica — aguardando o técnico'}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--portal-text)' }}>{pendenciaAberta.descricao}</div>
                  {pendenciaAberta.exige_visita && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#b45309' }}>
                      <MapPin size={12} /> Solicitada visita à propriedade do cliente
                    </span>
                  )}
                </div>
              )}

              {/* Assumir */}
              {g.status === 'aberta' && (
                <button onClick={assumir} disabled={!!busy || !podeAnalisar} title={!podeAnalisar ? MSG_SEM_PERMISSAO : undefined} style={btn('linear-gradient(135deg,#dc2626,#7f1d1d)', !!busy || !podeAnalisar)}>
                  {busy === 'assumir' ? <Loader2 size={15} className="spin" /> : <ShieldCheck size={15} />}
                  Assumir análise da garantia
                </button>
              )}

              {/* Montadora + Checklist */}
              {(emAnalise || naFabrica || finalizada || aguardandoTec || aguardandoServico || emRessarcimento) && g.status !== 'aberta' && (
                <Secao titulo="Montadora e checklist" icone={<Factory size={14} />}>
                  <MontadoraPicker
                    montadoraId={g.montadora_id}
                    onSelect={selecionarMontadora}
                    disabled={!!busy}
                  />
                  {g.montadora && (
                    <button
                      type="button"
                      onClick={() => setGuiaAberto(true)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
                        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                        fontSize: 12, fontWeight: 600, color: '#0ea5e9',
                      }}
                    >
                      <HelpCircle size={13} /> Como funciona a garantia da {g.montadora.nome}?
                    </button>
                  )}
                  {finalizada && (
                    <span style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>
                      Garantia já finalizada — você pode ajustar só a montadora; checklist e valores ficam intactos.
                    </span>
                  )}
                  {g.montadora_id && (
                    <ChecklistRenderer
                      campos={campos}
                      valores={respostas}
                      readOnly={!emAnalise}
                      onChange={emAnalise ? (id, v) => setRespostas((r) => ({ ...r, [id]: v })) : undefined}
                      onUpload={uploadChecklistFile}
                    />
                  )}
                </Secao>
              )}

              {/* Valores técnico x garantista */}
              {g.status !== 'aberta' && (
                <Secao titulo="Horas e KM — técnico x garantista" icone={<ShieldCheck size={14} />}>
                  <ValoresComparativo
                    tecnicoHoras={g.tecnico_horas}
                    tecnicoKm={g.tecnico_km}
                    garantistaHoras={gHoras}
                    garantistaKm={gKm}
                    onChange={emAnalise || naFabrica || aguardandoServico ? (campo, v) => (campo === 'horas' ? setGHoras(v) : setGKm(v)) : undefined}
                  />
                  {(emAnalise || naFabrica || aguardandoServico) && (
                    <textarea
                      placeholder="Observações do garantista (ajustes de valor, justificativas...)"
                      value={gObs}
                      onChange={(e) => setGObs(e.target.value)}
                      rows={2}
                      style={taStyle}
                    />
                  )}
                </Secao>
              )}

              {/* Ações em análise */}
              {emAnalise && (
                <>
                  <button onClick={salvarAnalise} disabled={!!busy || !podeAnalisar} title={!podeAnalisar ? MSG_SEM_PERMISSAO : undefined} style={btn('#475569', !!busy || !podeAnalisar)}>
                    {busy === 'analise' ? <Loader2 size={15} className="spin" /> : <Save size={15} />}
                    Salvar análise
                  </button>

                  <Secao titulo="Devolver ao técnico (B.O.)" icone={<FileWarning size={14} />}>
                    <textarea
                      placeholder="Descreva o que está faltando para o técnico..."
                      value={boTexto}
                      onChange={(e) => setBoTexto(e.target.value)}
                      rows={3}
                      style={taStyle}
                    />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--portal-text-secondary)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={boVisita} onChange={(e) => setBoVisita(e.target.checked)} />
                      Solicitar visita à propriedade do cliente
                    </label>
                    <button
                      onClick={() => abrirPendencia('bo')}
                      disabled={!!busy || !boTexto.trim()}
                      style={btn('#f59e0b', !!busy || !boTexto.trim())}
                    >
                      <AlertTriangle size={15} /> Marcar como B.O.
                    </button>
                  </Secao>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      onClick={enviarFabrica}
                      disabled={!!busy || !g.montadora_id || faltando.length > 0 || !podeEnviarFabrica}
                      title={!podeEnviarFabrica ? MSG_SEM_PERMISSAO : undefined}
                      style={{ ...btn('linear-gradient(135deg,#8b5cf6,#6d28d9)', !!busy || !g.montadora_id || faltando.length > 0 || !podeEnviarFabrica), flex: 1 }}
                    >
                      {busy === 'enviar' ? <Loader2 size={15} className="spin" /> : <Send size={15} />}
                      Enviar à fábrica
                    </button>
                    <button
                      onClick={() => setMostrarRecusa(true)}
                      disabled={!!busy}
                      style={{ ...btn('linear-gradient(135deg,#dc2626,#991b1b)', !!busy), flex: 1 }}
                      title="Recusar a garantia sem mandar pra fábrica (quando já se sabe que não cabe)"
                    >
                      <XCircle size={15} /> Recusar garantia
                    </button>
                  </div>
                  {mostrarRecusa && (
                    <div style={{
                      background: '#fef2f2', border: '1px solid #fca5a5',
                      borderLeft: '4px solid #dc2626', borderRadius: 12,
                      padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#b91c1c', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                        Recusar sem enviar à fábrica
                      </div>
                      <span style={{ fontSize: 12, color: '#7f1d1d' }}>
                        A garantia será encerrada como recusada pelo garantista. A cobrança ao cliente fica liberada na seção abaixo.
                      </span>
                      <textarea
                        value={recusaTexto}
                        onChange={(e) => setRecusaTexto(e.target.value)}
                        placeholder="Motivo da recusa (obrigatório). Ex: peça danificada por mau uso, fora do prazo de garantia, etc."
                        rows={3}
                        style={taStyle}
                      />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={async () => {
                            const ok = await recusarInterno();
                            if (ok) { setMostrarRecusa(false); setRecusaTexto(''); }
                          }}
                          disabled={!!busy || !recusaTexto.trim()}
                          style={{ ...btn('linear-gradient(135deg,#dc2626,#7f1d1d)', !!busy || !recusaTexto.trim()), flex: 1 }}
                        >
                          {busy === 'recusar_interno' ? <Loader2 size={15} className="spin" /> : <XCircle size={15} />}
                          Confirmar recusa
                        </button>
                        <button
                          onClick={() => { setMostrarRecusa(false); setRecusaTexto(''); }}
                          disabled={!!busy}
                          style={{ ...btn('#f3f4f6', !!busy), color: '#525252', flex: 1 }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                  {(!g.montadora_id || faltando.length > 0) && !mostrarRecusa && (
                    <span style={{ fontSize: 11, color: 'var(--portal-text-muted)', textAlign: 'center' }}>
                      {!g.montadora_id
                        ? 'Defina a montadora para enviar à fábrica.'
                        : `Preencha os campos obrigatórios: ${faltando.join(', ')}`}
                    </span>
                  )}
                </>
              )}

              {/* Solicitação por E-MAIL (montadoras tipo 'email', ex. Ipacol) */}
              {g.status !== 'aberta' && g.montadora?.tipo_template === 'email' && (
                <SolicitacaoEmailSecao
                  key={g.id}
                  g={g}
                  userName={userName}
                  naFabrica={naFabrica}
                  finalizada={finalizada}
                  podeAnalisar={podeAnalisar}
                  podeEnviarFabrica={podeEnviarFabrica}
                  onChange={() => {
                    carregar();
                    onSaved();
                  }}
                />
              )}

              {/* Solicitação de Garantia (SG) — disponível em qualquer fase após assumir */}
              {g.status !== 'aberta' && g.montadora && g.montadora.tipo_template !== 'email' && (
                <Secao titulo="Solicitação de Garantia (SG)" icone={<Send size={14} />}>
                  {(() => {
                    const eMahindra = g.montadora?.tipo_template === 'mahindra';
                    const sgAnexos = g.anexos
                      .filter((a) => a.categoria === 'envio_fabrica')
                      .sort((a, b) => (a.created_at > b.created_at ? -1 : 1));
                    const maisRecente = sgAnexos[0];
                    const temEmails = (g.montadora?.email_destinatarios?.length || 0) > 0;

                    // Caso: montadora sem template MAS com envio pelo site da
                    // própria fábrica (guia com acesso — Ventura/Tatu/KUHN):
                    // nada a configurar, o formulário é externo.
                    if (!eMahindra && guiaDaMontadora(g.montadora.nome)?.acesso) {
                      return (
                        <div style={{ fontSize: 12, color: 'var(--portal-text-secondary)', lineHeight: 1.55 }}>
                          O envio da <strong>{g.montadora.nome}</strong> é feito no{' '}
                          <strong>site/portal da própria fábrica</strong> — clique em{' '}
                          <strong>&quot;Como funciona?&quot;</strong> no topo pra abrir o guia com o link e o passo a
                          passo. Use a seção <strong>&quot;Relato pro formulário da fábrica&quot;</strong> logo abaixo
                          pra gerar e copiar os textos do Tratorilson.
                        </div>
                      );
                    }
                    // Caso: montadora ainda sem formato de envio configurado
                    if (!eMahindra) {
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <span style={{ fontSize: 12, color: '#dc2626' }}>
                            A montadora <strong>{g.montadora.nome}</strong> ainda não tem formato de envio configurado.
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>
                            Vá em <strong>/garantias → aba Montadoras → editar {g.montadora.nome}</strong> e defina o
                            campo <strong>&quot;Formato do arquivo&quot;</strong>: <strong>Mahindra (SG xlsx)</strong> ou{' '}
                            <strong>E-mail (sem planilha)</strong>. Depois cadastre os e-mails da fábrica.
                          </span>
                        </div>
                      );
                    }

                    const tipoGarantiaAtual = (respostas['tipo_garantia_sg'] as string) || 'produto_garantia';

                    const trocarTipoGarantia = async (novo: string) => {
                      const novasRespostas = { ...respostas, tipo_garantia_sg: novo };
                      setRespostas(novasRespostas);
                      await chamar('tipo_garantia', `/api/garantias/${garantiaId}/checklist`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          checklist_respostas: novasRespostas,
                          garantista_nome: userName,
                        }),
                      });
                    };

                    return (
                      <>
                        <p style={{ fontSize: 12, color: 'var(--portal-text-secondary)', margin: 0 }}>
                          Baixe a SG abaixo, revise/edite no Excel se precisar e anexe a versão revisada.
                          Ao enviar por e-mail, a versão mais recente é que vai pra fábrica.
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                            Tipo de Garantia
                          </label>
                          <select
                            value={tipoGarantiaAtual}
                            onChange={(e) => trocarTipoGarantia(e.target.value)}
                            disabled={!!busy}
                            style={{
                              padding: '8px 10px',
                              borderRadius: 8,
                              border: '1px solid var(--portal-border)',
                              background: 'var(--portal-bg-input)',
                              color: 'var(--portal-text)',
                              fontSize: 13,
                              outline: 'none',
                            }}
                          >
                            <option value="produto_garantia">Produto em Garantia</option>
                            <option value="pre_venda">Solicitação de Pré-venda</option>
                            <option value="garantia_especial">Garantia Especial (Cortesia)</option>
                            <option value="garantia_pecas">Garantia de Peças</option>
                          </select>
                          <span style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>
                            Define qual quadradinho será marcado na SG. Alterar aqui regera o arquivo na próxima geração.
                          </span>
                        </div>

                        <GarantiaAnexos
                          garantiaId={g.id}
                          anexos={sgAnexos}
                          uploadCategoria="envio_fabrica"
                          enviadoPor={userName}
                          onChange={carregar}
                          vazioTexto="Nenhuma SG gerada ainda."
                        />

                        {!maisRecente && (
                          <button
                            onClick={() =>
                              chamar('gerar_sg', `/api/garantias/${garantiaId}/enviar-sg`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ ator: userName, apenasGerar: true }),
                              })
                            }
                            disabled={!!busy}
                            style={btn('#475569', !!busy)}
                          >
                            {busy === 'gerar_sg' ? <Loader2 size={15} className="spin" /> : <Save size={15} />}
                            Gerar SG (xlsx)
                          </button>
                        )}

                        {naFabrica && temEmails && (
                          <>
                            <span style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>
                              Destinatários: {g.montadora.email_destinatarios.join(', ')}
                            </span>
                            <button
                              onClick={() =>
                                chamar('enviar_sg', `/api/garantias/${garantiaId}/enviar-sg`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ ator: userName }),
                                })
                              }
                              disabled={!!busy || !maisRecente}
                              style={btn('linear-gradient(135deg,#dc2626,#7f1d1d)', !!busy || !maisRecente)}
                            >
                              {busy === 'enviar_sg' ? <Loader2 size={15} className="spin" /> : <Send size={15} />}
                              Enviar SG por e-mail à fábrica
                            </button>
                          </>
                        )}
                        {naFabrica && !temEmails && (
                          <span style={{ fontSize: 11, color: '#dc2626' }}>
                            Cadastre os e-mails da fábrica em Montadoras → {g.montadora.nome} para liberar o envio.
                          </span>
                        )}
                        {!naFabrica && (
                          <span style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>
                            O envio por e-mail fica disponível quando a garantia for enviada à fábrica.
                          </span>
                        )}
                      </>
                    );
                  })()}
                </Secao>
              )}

              {/* Relato do Tratorilson pra colar no formulário/site da fábrica
                  (montadoras sem template com guia de envio externo) */}
              {g.status !== 'aberta' &&
                g.montadora &&
                g.montadora.tipo_template !== 'email' &&
                g.montadora.tipo_template !== 'mahindra' &&
                !!guiaDaMontadora(g.montadora.nome)?.acesso && (
                  <Secao titulo="Relato pro formulário da fábrica (Tratorilson)" icone={<FileText size={14} />}>
                    <RelatoTratorilsonSecao
                      key={g.id}
                      g={g}
                      userName={userName}
                      podeAnalisar={!!podeAnalisar}
                      finalizada={finalizada}
                      onChange={() => {
                        carregar();
                        onSaved();
                      }}
                    />
                  </Secao>
                )}

              {/* Aguardando serviço (2ª etapa do fluxo duas_etapas) */}
              {aguardandoServico && (
                <Secao titulo="Solicitar ressarcimento (2ª etapa)" icone={<Send size={14} />}>
                  <div style={{ fontSize: 12, color: '#0f766e', background: '#0d948815', border: '1px solid #0d948844', padding: '8px 10px', borderRadius: 8 }}>
                    Peças aprovadas em {fmtDataHora(g.pecas_retorno_em)} · Valor das peças:{' '}
                    <strong>{fmtMoeda(g.valor_pago_pecas)}</strong>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--portal-text-secondary)' }}>
                    Aguardando o técnico executar o serviço. Quando concluído, confira as horas e km acima e
                    solicite o ressarcimento à fábrica.
                  </span>
                  {(() => {
                    const vh = (Number(gHoras) || Number(g.tecnico_horas) || 0) * 193;
                    const vk = (Number(gKm) || Number(g.tecnico_km) || 0) * 2.8;
                    return (
                      <div
                        style={{
                          padding: '8px 10px', borderRadius: 8,
                          background: 'var(--portal-bg-secondary)',
                          border: '1px solid var(--portal-border)',
                          fontSize: 12, color: 'var(--portal-text-secondary)',
                          display: 'flex', flexDirection: 'column', gap: 2,
                        }}
                      >
                        <span>Mão de obra: <strong>{fmtMoeda(vh)}</strong></span>
                        <span>Deslocamento: <strong>{fmtMoeda(vk)}</strong></span>
                        <span style={{ marginTop: 4, paddingTop: 4, borderTop: '1px dashed var(--portal-border)', color: 'var(--portal-text)' }}>
                          Total do ressarcimento: <strong style={{ color: '#0d9488' }}>{fmtMoeda(vh + vk)}</strong>
                        </span>
                      </div>
                    );
                  })()}
                  {g.montadora?.ressarcimento_por_email ? (
                    (g.montadora?.email_destinatarios?.length || 0) > 0 ? (
                      <span style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>
                        Será enviado por e-mail para: {g.montadora.email_destinatarios.join(', ')}
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: '#dc2626' }}>
                        Cadastre os e-mails da fábrica em Montadoras → {g.montadora?.nome} para liberar o envio.
                      </span>
                    )
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>
                      A garantia só muda de fase — combine o ressarcimento com a fábrica por fora do portal.
                    </span>
                  )}
                  {mostraRatAtendimento && (
                    temRatAtendimento ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#047857', fontWeight: 600 }}>
                        <CheckCircle2 size={13} /> RAT do atendimento anexada — vai junto no e-mail do ressarcimento.
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>
                        RAT do atendimento não anexada (opcional) — se o serviço foi nosso, gere/anexe na seção
                        &quot;Solicitação de garantia por e-mail&quot; acima que ela vai junto no e-mail.
                      </span>
                    )
                  )}
                  <button
                    onClick={solicitarRessarcimento}
                    disabled={
                      !!busy || !podeEnviarFabrica ||
                      (!!g.montadora?.ressarcimento_por_email && (g.montadora?.email_destinatarios?.length || 0) === 0)
                    }
                    title={!podeEnviarFabrica ? MSG_SEM_PERMISSAO : undefined}
                    style={btn('linear-gradient(135deg,#0d9488,#0f766e)', !!busy || !podeEnviarFabrica || (!!g.montadora?.ressarcimento_por_email && (g.montadora?.email_destinatarios?.length || 0) === 0))}
                  >
                    {busy === 'solicitar_ressarcimento' ? <Loader2 size={15} className="spin" /> : <Send size={15} />}
                    Solicitar ressarcimento
                  </button>
                </Secao>
              )}

              {/* Em análise da fábrica (peças ou ressarcimento) */}
              {(naFabrica || emRessarcimento) && (
                <>
                  <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', textAlign: 'center' }}>
                    {emRessarcimento
                      ? `Ressarcimento solicitado em ${fmtDataHora(g.ressarcimento_enviado_em)} · ${diasEntre(g.ressarcimento_enviado_em)} dia(s) aguardando a fábrica`
                      : `Enviada à fábrica em ${fmtDataHora(g.enviada_fabrica_em)} · ${diasEntre(g.enviada_fabrica_em)} dia(s) em análise`}
                  </div>

                  <Secao titulo="Informação pendente para a fábrica" icone={<FileWarning size={14} />}>
                    <textarea
                      placeholder="O que a fábrica solicitou? O técnico será notificado..."
                      value={boTexto}
                      onChange={(e) => setBoTexto(e.target.value)}
                      rows={3}
                      style={taStyle}
                    />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--portal-text-secondary)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={boVisita} onChange={(e) => setBoVisita(e.target.checked)} />
                      Solicitar visita à propriedade do cliente
                    </label>
                    <button
                      onClick={() => abrirPendencia('info_fabrica')}
                      disabled={!!busy || !boTexto.trim()}
                      style={btn('#f97316', !!busy || !boTexto.trim())}
                    >
                      <AlertTriangle size={15} /> Devolver ao técnico
                    </button>
                  </Secao>

                  <Secao
                    titulo={naFabricaDuasEtapas ? 'Retorno da fábrica (peças)' : 'Retorno da fábrica (obrigatório)'}
                    icone={<FileWarning size={14} />}
                  >
                    <GarantiaAnexos
                      garantiaId={g.id}
                      anexos={g.anexos.filter((a) => a.categoria === 'retorno_fabrica')}
                      uploadCategoria="retorno_fabrica"
                      enviadoPor={userName}
                      onChange={carregar}
                      vazioTexto="Anexe o documento/print que a fábrica retornou."
                    />
                  </Secao>

                  {naFabricaDuasEtapas ? (
                    /* 1ª etapa: fábrica respondeu sobre as PEÇAS */
                    <Secao titulo="Retorno das peças (1ª etapa)" icone={<Package size={14} />}>
                      <span style={{ fontSize: 12, color: 'var(--portal-text-secondary)' }}>
                        Marque as peças que a fábrica aprovou. Com peças aprovadas, a garantia fica
                        aguardando o serviço do técnico — o ressarcimento das horas/km é a 2ª etapa.
                      </span>
                      <PecasChecklistFabrica
                        pecas={g.pecas}
                        selecionadas={pecasAprovadas}
                        onToggle={(pid) =>
                          setPecasAprovadas((prev) => {
                            const n = new Set(prev);
                            if (n.has(pid)) n.delete(pid); else n.add(pid);
                            return n;
                          })
                        }
                        busy={busy}
                        onAtualizarPrecos={() =>
                          chamar('atualizar_precos', `/api/garantias/${garantiaId}/atualizar-precos`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ ator: userName }),
                          })
                        }
                      />
                      {(() => {
                        const somaMarcadas = g.pecas
                          .filter((p) => pecasAprovadas.has(p.id))
                          .reduce((s, p) => s + (Number(p.preco_unitario) || 0) * (Number(p.quantidade) || 0), 0);
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                              Valor pago das peças
                            </label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={valorPecasStr}
                              onChange={(e) => setValorPecasStr(e.target.value)}
                              placeholder={somaMarcadas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              style={{ ...taStyle, resize: 'none' } as React.CSSProperties}
                            />
                            <span style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>
                              Deixe vazio para usar a soma das peças marcadas ({fmtMoeda(somaMarcadas)}).
                            </span>
                          </div>
                        );
                      })()}
                      {pecasAprovadas.size === 0 && (
                        <>
                          <div style={{ fontSize: 12, color: '#b91c1c', background: '#fef2f2', border: '1px solid #fca5a5', padding: '8px 10px', borderRadius: 8 }}>
                            Nenhuma peça marcada — a garantia será <strong>RECUSADA</strong> e a cobrança ao
                            cliente fica liberada.
                          </div>
                          <textarea
                            placeholder="Motivo da recusa das peças (obrigatório)"
                            value={motivoRecusa}
                            onChange={(e) => setMotivoRecusa(e.target.value)}
                            rows={2}
                            style={taStyle}
                          />
                        </>
                      )}
                      <button
                        onClick={registrarRetornoPecas}
                        disabled={!!busy || !podeFinalizar || (pecasAprovadas.size === 0 && !motivoRecusa.trim())}
                        title={!podeFinalizar ? MSG_SEM_PERMISSAO : undefined}
                        style={btn(
                          pecasAprovadas.size === 0 ? '#dc2626' : 'linear-gradient(135deg,#0d9488,#0f766e)',
                          !!busy || !podeFinalizar || (pecasAprovadas.size === 0 && !motivoRecusa.trim())
                        )}
                      >
                        {busy === 'retorno_pecas' ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />}
                        Registrar retorno das peças
                      </button>
                    </Secao>
                  ) : (
                    <Secao titulo={emRessarcimento ? 'Finalizar ressarcimento' : 'Finalizar garantia'} icone={<CheckCircle2 size={14} />}>
                      {!temRetornoFabrica && (
                        <span style={{ fontSize: 11, color: '#dc2626' }}>
                          Anexe o retorno da fábrica para liberar a finalização.
                        </span>
                      )}

                      {/* Peças: no fluxo padrão marca aqui; na 2ª etapa já vieram resolvidas */}
                      {!emRessarcimento && (
                        <PecasChecklistFabrica
                          pecas={g.pecas}
                          selecionadas={pecasAprovadas}
                          onToggle={(pid) =>
                            setPecasAprovadas((prev) => {
                              const n = new Set(prev);
                              if (n.has(pid)) n.delete(pid); else n.add(pid);
                              return n;
                            })
                          }
                          busy={busy}
                          onAtualizarPrecos={() =>
                            chamar('atualizar_precos', `/api/garantias/${garantiaId}/atualizar-precos`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ ator: userName }),
                            })
                          }
                        />
                      )}

                      {/* Serviço: a garantia paga M.O. e/ou deslocamento? (igual às peças) */}
                      {(() => {
                        const vh = (Number(gHoras) || 0) * 193;
                        const vk = (Number(gKm) || 0) * 2.8;
                        if (vh <= 0 && vk <= 0) return null;
                        const linha = (label: string, valor: number, sel: boolean, onToggle: () => void) => (
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, background: sel ? '#ECFDF5' : 'var(--portal-bg-secondary)', border: `1px solid ${sel ? '#A7F3D0' : 'var(--portal-border)'}`, cursor: 'pointer', fontSize: 12 }}>
                            <input type="checkbox" checked={sel} onChange={onToggle} />
                            <span style={{ flex: 1, color: 'var(--portal-text)' }}>{label}</span>
                            <span style={{ fontWeight: 700, color: sel ? '#16a34a' : 'var(--portal-text-muted)' }}>{fmtMoeda(valor)}</span>
                          </label>
                        );
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text-secondary)' }}>Serviço pago pela garantia</div>
                            {vh > 0 && linha('Mão de obra', vh, moAprovada, () => setMoAprovada((v) => !v))}
                            {vk > 0 && linha('Deslocamento (KM)', vk, deslocAprovado, () => setDeslocAprovado((v) => !v))}
                          </div>
                        );
                      })()}

                      {/* Preview do valor total a ser pago */}
                      {(() => {
                        const vh = (Number(gHoras) || 0) * 193;
                        const vk = (Number(gKm) || 0) * 2.8;
                        const vhPago = moAprovada ? vh : 0;
                        const vkPago = deslocAprovado ? vk : 0;
                        // 2ª etapa: peças congeladas do retorno da 1ª etapa
                        const vp = emRessarcimento
                          ? Number(g.valor_pago_pecas) || 0
                          : g.pecas
                              .filter((p) => pecasAprovadas.has(p.id))
                              .reduce((s, p) => s + (Number(p.preco_unitario) || 0) * (Number(p.quantidade) || 0), 0);
                        const total = vhPago + vkPago + vp;
                        const naoPago = (vh - vhPago) + (vk - vkPago) + (emRessarcimento ? 0 : g.pecas
                          .filter((p) => !pecasAprovadas.has(p.id))
                          .reduce((s, p) => s + (Number(p.preco_unitario) || 0) * (Number(p.quantidade) || 0), 0));
                        const riscado: React.CSSProperties = { textDecoration: 'line-through', opacity: 0.6 };
                        return (
                          <div
                            style={{
                              padding: '8px 10px', borderRadius: 8,
                              background: 'var(--portal-bg-secondary)',
                              border: '1px solid var(--portal-border)',
                              fontSize: 12, color: 'var(--portal-text-secondary)',
                              display: 'flex', flexDirection: 'column', gap: 2,
                            }}
                          >
                            <span style={moAprovada ? undefined : riscado}>Mão de obra: <strong>{fmtMoeda(vh)}</strong></span>
                            <span style={deslocAprovado ? undefined : riscado}>Deslocamento: <strong>{fmtMoeda(vk)}</strong></span>
                            <span>{emRessarcimento ? 'Peças (aprovadas na 1ª etapa)' : 'Peças aprovadas'}: <strong>{fmtMoeda(vp)}</strong></span>
                            <span style={{ marginTop: 4, paddingTop: 4, borderTop: '1px dashed var(--portal-border)', color: 'var(--portal-text)' }}>
                              Total a pagar (garantia): <strong style={{ color: '#16a34a' }}>{fmtMoeda(total)}</strong>
                            </span>
                            {naoPago > 0 && (
                              <span style={{ color: '#b45309' }}>
                                Não pago (vai pra cobrança/interno): <strong>{fmtMoeda(naoPago)}</strong>
                              </span>
                            )}
                          </div>
                        );
                      })()}

                      {emRessarcimento && (
                        <span style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>
                          Recusar aqui nega só o ressarcimento — as peças aprovadas na 1ª etapa continuam pagas.
                        </span>
                      )}
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, color: 'var(--portal-text-secondary)', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={devolucaoPedida}
                          onChange={(e) => setDevolucaoPedida(e.target.checked)}
                          style={{ marginTop: 2 }}
                        />
                        <span>
                          Fábrica pediu a <strong>devolução das peças usadas</strong> (prova de destruição)
                          <span style={{ display: 'block', fontSize: 10.5, color: 'var(--portal-text-faint)' }}>
                            Aplica-se só se aprovar — o card vai pra fase &quot;Devolução de peças&quot; com prazo de 30 dias.
                          </span>
                        </span>
                      </label>
                      <textarea
                        placeholder="Motivo da recusa (obrigatório se recusar)"
                        value={motivoRecusa}
                        onChange={(e) => setMotivoRecusa(e.target.value)}
                        rows={2}
                        style={taStyle}
                      />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => finalizar('aprovada')}
                          disabled={!!busy || !temRetornoFabrica || !podeFinalizar}
                          title={!podeFinalizar ? MSG_SEM_PERMISSAO : undefined}
                          style={{ ...btn('#16a34a', !!busy || !temRetornoFabrica || !podeFinalizar), flex: 1 }}
                        >
                          <CheckCircle2 size={15} /> Aprovar
                        </button>
                        <button
                          onClick={() => finalizar('rejeitada')}
                          disabled={!!busy || !temRetornoFabrica || !podeFinalizar}
                          title={!podeFinalizar ? MSG_SEM_PERMISSAO : undefined}
                          style={{ ...btn('#dc2626', !!busy || !temRetornoFabrica || !podeFinalizar), flex: 1 }}
                        >
                          <XCircle size={15} /> Recusar
                        </button>
                      </div>
                    </Secao>
                  )}
                </>
              )}

              {/* Finalizada */}
              {finalizada && (
                <Secao
                  titulo={g.status === 'aprovada' ? 'Garantia aprovada' : 'Garantia recusada'}
                  icone={g.status === 'aprovada' ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                >
                  {g.status === 'aprovada' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--portal-text)' }}>
                      <div>
                        Pago em garantia: <strong style={{ color: '#16a34a' }}>{fmtMoeda(g.valor_pago_total)}</strong>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>
                        Horas: {fmtMoeda(g.valor_pago_horas)} · KM: {fmtMoeda(g.valor_pago_km)}
                        {g.valor_pago_pecas != null && g.valor_pago_pecas > 0 ? ` · Peças: ${fmtMoeda(g.valor_pago_pecas)}` : ''}
                      </div>
                      {g.pecas.filter((p) => p.resultado === 'rejeitada').length > 0 && (
                        <div style={{ fontSize: 11, color: '#dc2626' }}>
                          {g.pecas.filter((p) => p.resultado === 'rejeitada').length} peça(s) não foram pagas pela fábrica.
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ fontSize: 13, color: 'var(--portal-text)' }}>
                        <strong>Motivo:</strong> {g.motivo_recusa || '—'}
                      </div>
                      <span
                        style={{
                          alignSelf: 'flex-start',
                          fontSize: 11, fontWeight: 700,
                          padding: '3px 8px', borderRadius: 8,
                          background: g.recusado_por === 'garantista' ? '#fef3c7' : '#fee2e2',
                          color:      g.recusado_por === 'garantista' ? '#92400e' : '#991b1b',
                          textTransform: 'uppercase', letterSpacing: 0.3,
                        }}
                      >
                        {g.recusado_por === 'garantista'
                          ? 'Recusada pelo garantista (sem ir à fábrica)'
                          : 'Recusada pela fábrica'}
                      </span>
                      {g.recusado_por === 'garantista' && (
                        <button
                          onClick={() => {
                            const m = prompt('Motivo pra reabrir a recusa (opcional):') || '';
                            reabrirRecusa(m);
                          }}
                          disabled={!!busy}
                          style={{ ...btn('transparent', !!busy), color: 'var(--portal-text-secondary)', border: '1px solid var(--portal-border)', alignSelf: 'flex-start', padding: '6px 12px', fontSize: 12 }}
                        >
                          <History size={13} /> Reabrir recusa
                        </button>
                      )}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>
                    Finalizada em {fmtDataHora(g.finalizada_em)}
                  </div>
                </Secao>
              )}

              {/* Devolução das peças à fábrica (prova de destruição) — só em
                  aprovadas em que a fábrica pediu (Ventura/Kuhn/Tatu) */}
              {/* Lista explícita (e não !== 'nao_aplicavel'): pré-migration o
                  campo vem undefined e a seção não pode aparecer vazia. */}
              {g.status === 'aprovada' &&
                (g.devolucao_status === 'pendente' || g.devolucao_status === 'enviada' || g.devolucao_status === 'dispensada') && (
                <DevolucaoPecasSecao
                  garantia={g}
                  userName={userName}
                  busy={busy}
                  onAcao={acaoDevolucao}
                  onAnexosChange={carregar}
                />
              )}

              {/* Cobrança ao cliente: em recusadas, ou em aprovadas que não
                  pagaram tudo (M.O./deslocamento/peça vira cobrança/interno). */}
              {(g.status === 'rejeitada' || (g.status === 'aprovada' && g.cobranca_status !== 'nao_aplicavel')) && (
                <CobrancaCliente garantia={g} busy={busy} onAcao={acaoCobranca} />
              )}

              {/* Anexos gerais + retorno da fábrica (visível também em finalizada) */}
              {(finalizada || aguardandoTec || aguardandoServico) && (
                <Secao titulo="Anexos" icone={<FileWarning size={14} />}>
                  <GarantiaAnexos garantiaId={g.id} anexos={g.anexos} onChange={carregar} />
                </Secao>
              )}

              {/* Pendências resolvidas */}
              {g.pendencias.filter((p) => p.status === 'respondida').length > 0 && (
                <Secao titulo="Devoluções respondidas" icone={<History size={14} />}>
                  {g.pendencias
                    .filter((p) => p.status === 'respondida')
                    .map((p) => {
                      const anexosResposta = g.anexos.filter(
                        (a) => a.pendencia_id === p.id && a.categoria === 'pendencia_resposta',
                      );
                      return (
                        <div key={p.id} style={{ fontSize: 12, borderLeft: '3px solid var(--portal-border)', paddingLeft: 10, paddingBottom: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ color: 'var(--portal-text-muted)' }}>
                            <strong>{p.tipo === 'bo' ? 'B.O.' : 'Pendência fábrica'}:</strong> {p.descricao}
                          </div>
                          <div style={{ color: 'var(--portal-text)' }}>
                            <strong>Resposta do técnico:</strong> {p.resposta_texto || <em style={{ color: 'var(--portal-text-muted)' }}>(somente anexos)</em>}
                          </div>
                          {p.respondido_por && (
                            <div style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>
                              {p.respondido_por}
                              {p.respondido_em ? ` · ${fmtDataHora(p.respondido_em)}` : ''}
                            </div>
                          )}
                          {anexosResposta.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {anexosResposta.map((a) => {
                                const ehImagem = (a.content_type || '').startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|bmp)$/i.test(a.nome_arquivo || a.url);
                                return ehImagem ? (
                                  <a
                                    key={a.id}
                                    href={a.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    title={a.nome_arquivo || 'Anexo'}
                                    style={{
                                      width: 80, height: 80, borderRadius: 8,
                                      overflow: 'hidden', border: '1px solid var(--portal-border)',
                                      background: 'var(--portal-bg-secondary)', display: 'block',
                                    }}
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={a.url} alt={a.nome_arquivo || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                  </a>
                                ) : (
                                  <a
                                    key={a.id}
                                    href={a.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{
                                      display: 'inline-flex', alignItems: 'center', gap: 4,
                                      padding: '6px 10px', borderRadius: 8,
                                      border: '1px solid var(--portal-border)',
                                      fontSize: 11, color: 'var(--portal-text)',
                                      textDecoration: 'none', background: 'var(--portal-bg-secondary)',
                                    }}
                                  >
                                    <FileWarning size={12} /> {a.nome_arquivo || 'Anexo'}
                                  </a>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </Secao>
              )}
              {guiaAberto && g.montadora && (
                <GuiaMontadoraModal montadoraNome={g.montadora.nome} onClose={() => setGuiaAberto(false)} />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Campo({ label, valor }: { label: string; valor: string | null | undefined }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--portal-text-faint)', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--portal-text)', fontWeight: 600 }}>{valor || '—'}</div>
    </div>
  );
}

// Checklist de peças pagas pela fábrica (usado na finalização do fluxo padrão
// e no retorno das peças da 1ª etapa do fluxo duas_etapas).
function PecasChecklistFabrica({ pecas, selecionadas, onToggle, busy, onAtualizarPrecos }: {
  pecas: GarantiaDetalhe['pecas'];
  selecionadas: Set<string>;
  onToggle: (id: string) => void;
  busy: string;
  onAtualizarPrecos: () => void;
}) {
  if (pecas.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text-secondary)' }}>
          Peças pagas pela fábrica
        </div>
        <button
          type="button"
          onClick={onAtualizarPrecos}
          disabled={!!busy}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '4px 10px', borderRadius: 6,
            border: '1px solid var(--portal-border)',
            background: 'var(--portal-bg-input)',
            color: 'var(--portal-text-secondary)',
            fontSize: 11, fontWeight: 600,
            cursor: busy ? 'default' : 'pointer',
          }}
        >
          {busy === 'atualizar_precos' ? <Loader2 size={11} className="spin" /> : <Save size={11} />}
          Atualizar preços do PPV
        </button>
      </div>
      {pecas.map((p) => {
        const sel = selecionadas.has(p.id);
        const valor = (Number(p.preco_unitario) || 0) * (Number(p.quantidade) || 0);
        return (
          <label
            key={p.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 8px', borderRadius: 8,
              background: sel ? '#ECFDF5' : 'var(--portal-bg-secondary)',
              border: `1px solid ${sel ? '#A7F3D0' : 'var(--portal-border)'}`,
              cursor: 'pointer', fontSize: 12,
            }}
          >
            <input type="checkbox" checked={sel} onChange={() => onToggle(p.id)} />
            <span style={{ flex: 1, color: 'var(--portal-text)' }}>
              {p.cod_produto ? `${p.cod_produto} · ` : ''}{p.descricao}
              <span style={{ color: 'var(--portal-text-muted)' }}> x{p.quantidade}</span>
            </span>
            <span style={{ fontWeight: 700, color: sel ? '#16a34a' : 'var(--portal-text-muted)' }}>
              {fmtMoeda(valor)}
            </span>
          </label>
        );
      })}
    </div>
  );
}

// Stepper do fluxo em duas etapas. etapaAtual: 0 = ainda em preparação,
// 1 = peças na fábrica, 2 = aguardando serviço, 3 = ressarcimento, 4 = concluída.
function EtapasGarantia({ etapaAtual }: { etapaAtual: number }) {
  const etapas = ['Peças na fábrica', 'Serviço', 'Ressarcimento'];
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)',
        borderRadius: 12, padding: '10px 14px',
      }}
    >
      {etapas.map((label, i) => {
        const n = i + 1;
        const feita = etapaAtual > n;
        const ativa = etapaAtual === n;
        const cor = feita ? '#16a34a' : ativa ? '#0d9488' : 'var(--portal-text-muted)';
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
            <span
              style={{
                width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 800,
                background: feita ? '#16a34a' : ativa ? '#0d9488' : 'var(--portal-bg-secondary)',
                color: feita || ativa ? '#fff' : 'var(--portal-text-muted)',
                border: feita || ativa ? 'none' : '1px solid var(--portal-border)',
              }}
            >
              {feita ? '✓' : n}
            </span>
            <span
              style={{
                fontSize: 11, fontWeight: ativa ? 800 : 600, color: cor,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {label}
            </span>
            {i < etapas.length - 1 && (
              <span style={{ flex: 1, height: 1, background: 'var(--portal-border)', minWidth: 8 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
