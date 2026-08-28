'use client';
// Ficha do Veículo — o coração do Frota. Tudo vem de UMA chamada local
// (/api/frota/veiculos/[placa]): os espelhos já estão no banco, então não há
// espera de API externa aqui.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Car, X, ShieldAlert, User as UserIcon, Wrench, Fuel, DollarSign,
  Loader2, Pencil, Check, History, Gauge, Satellite, AlertTriangle, FileText, Sparkles, Camera,
  HandCoins, Undo2, ClipboardCheck,
} from 'lucide-react';
import { authHeaders } from '@/lib/auth/client';
import { supabase } from '@/lib/supabase';
import DocumentoInline from '@/components/frota/DocumentoInline';
import SistemasVeiculo from '@/components/frota/SistemasVeiculo';
import HistoricoPendencias from '@/components/frota/HistoricoPendencias';
import AbastecimentosModal from '@/components/frota/AbastecimentosModal';
import TrajetosModal from '@/components/frota/TrajetosModal';
import { formatarPlaca } from '@/lib/frota/placa';
import { responsavelVazio } from '@/lib/frota/responsavel';
import { useIsMobile } from '@/hooks/useIsMobile';
import { checklistPreVenda, pendenciasDoVeiculo } from '@/lib/frota/pendencias';
import { SUBTIPOS_VEICULO, labelSubtipo } from '@/lib/frota/tipos';
import type { Motorista, VeiculoDetalhe } from '@/lib/frota/tipos';

interface Props {
  placa: string;
  podeEditar: boolean;
  podeResponsavel: boolean;
  podeDocumentos: boolean;
  onClose: () => void;
  onMudou?: () => void;
}

const fmtRS = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtData = (s: string | null | undefined) =>
  s ? new Date(`${String(s).slice(0, 10)}T00:00:00`).toLocaleDateString('pt-BR') : '—';
const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const fmtMes = (m: string | null | undefined) => {
  const [a, mes] = String(m || '').split('-');
  return mes ? `${MESES_ABREV[Number(mes) - 1] || mes}/${a}` : (m || '—');
};
const statusChecklist = (status: string | null, score: number | null) => {
  const s = (status || '').toLowerCase();
  if (s === 'suspeito' || (score != null && score < 50)) return { label: 'Suspeito', cor: '#b91c1c', bg: '#fee2e2' };
  if (s === 'completo') return { label: 'Completo', cor: '#15803d', bg: '#dcfce7' };
  if (s === 'em_andamento') return { label: 'Em andamento', cor: '#b45309', bg: '#fef3c7' };
  return { label: 'Pendente', cor: '#6b7280', bg: '#f3f4f6' };
};

function Secao({ titulo, icone, children }: { titulo: string; icone: React.ReactNode; children: React.ReactNode }) {
  // módulos separados por LINHA DE GRADE fina (sem caixa), fonte preta
  return (
    <div style={{ borderBottom: '1px solid rgba(0,0,0,0.5)', padding: '14px 4px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 700, color: 'var(--portal-text)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {icone}{titulo}
      </div>
      {children}
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, borderBottom: '1px solid rgba(0,0,0,0.5)', paddingBottom: 4 }}>
      <span style={{ color: 'var(--portal-text)' }}>{rotulo}</span>
      <span style={{ color: 'var(--portal-text)', fontWeight: 600, textAlign: 'right' }}>{valor ?? '—'}</span>
    </div>
  );
}

const STATUS_MULTA: Record<string, { label: string; cor: string; bg: string }> = {
  nova: { label: 'Nova', cor: '#b45309', bg: '#fef3c7' },
  em_analise: { label: 'Em análise', cor: '#1d4ed8', bg: '#dbeafe' },
  em_defesa: { label: 'Em defesa', cor: '#7c3aed', bg: '#ede9fe' },
  paga: { label: 'Paga', cor: '#15803d', bg: '#dcfce7' },
  descontada: { label: 'Descontada', cor: '#1e3a8a', bg: '#dbeafe' },
  arquivada: { label: 'Arquivada', cor: '#64748b', bg: '#f1f5f9' },
};

export default function VeiculoDrawer({ placa, podeEditar, podeResponsavel, podeDocumentos, onClose, onMudou }: Props) {
  const isMobile = useIsMobile();
  const [det, setDet] = useState<VeiculoDetalhe | null>(null);
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState('');

  // edição de campo da ficha
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  // avisos da leitura de CRLV por IA (mostrados no topo do formulário)
  const [crlvAvisos, setCrlvAvisos] = useState<string[]>([]);

  // troca de responsável
  const [trocando, setTrocando] = useState(false);
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);
  const [novoResp, setNovoResp] = useState('');
  const [novoRespId, setNovoRespId] = useState('');

  // novo documento (o gerenciamento vive AQUI na Ficha — não há tela separada)
  const [docForm, setDocForm] = useState<{ aberto: boolean; tipo: string; numero: string; vigencia_fim: string }>({
    aberto: false, tipo: 'crlv', numero: '', vigencia_fim: '',
  });
  const [docArquivo, setDocArquivo] = useState<File | null>(null);

  // modais "tudo deste veículo" (sem redirecionar pra outra tela)
  const [abastecimentosAberto, setAbastecimentosAberto] = useState(false);
  const [trajetosAberto, setTrajetosAberto] = useState(false);

  // venda do veículo (registro histórico: pra quem, quando, por quanto)
  const [vendaAberta, setVendaAberta] = useState(false);
  const [venda, setVenda] = useState({ comprador: '', data: new Date().toISOString().slice(0, 10), valor: '', obs: '' });

  // catálogo de equipamentos (cadastra uma vez, anexa por seleção no carro)
  const [catalogoEquip, setCatalogoEquip] = useState<string[]>([]);
  useEffect(() => {
    if (!podeEditar) return;
    (async () => {
      try {
        const r = await fetch('/api/frota/equipamentos', { headers: await authHeaders() });
        const d = await r.json();
        if (r.ok) setCatalogoEquip((d.equipamentos || []).map((e: { nome: string }) => e.nome));
      } catch { /* seletor fica só com "cadastrar novo" */ }
    })();
  }, [podeEditar]);

  // grava a lista de equipamentos do carro na hora (PATCH normal — auditado)
  const salvarEquipamentos = async (novos: string[]) => {
    setBusy('equip');
    try {
      const r = await fetch(`/api/frota/veiculos/${encodeURIComponent(placa)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ equipamentos: novos }),
      });
      if (!r.ok) { const d = await r.json(); alert(d.error || 'Falha ao salvar equipamentos.'); return; }
      await carregar();
    } finally { setBusy(''); }
  };

  const anexarEquipamento = async (nome: string) => {
    if (!det) return;
    let escolhido = nome;
    if (nome === '__novo__') {
      const novo = prompt('Nome do equipamento novo (ex.: RASTREADOR, INSULFILM):', '');
      if (!novo || !novo.trim()) return;
      escolhido = novo.trim().toUpperCase();
      try {
        const r = await fetch('/api/frota/equipamentos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
          body: JSON.stringify({ nome: escolhido }),
        });
        const d = await r.json();
        if (!r.ok) { alert(d.error || 'Falha ao cadastrar o equipamento.'); return; }
        setCatalogoEquip((c) => [...new Set([...c, escolhido])].sort());
      } catch (e) { alert(String(e)); return; }
    }
    const atuais = det.veiculo.equipamentos || [];
    if (atuais.includes(escolhido)) return;
    await salvarEquipamentos([...atuais, escolhido]);
  };

  const carregar = useCallback(async () => {
    setErro('');
    try {
      const r = await fetch(`/api/frota/veiculos/${encodeURIComponent(placa)}`, { headers: await authHeaders() });
      const d = await r.json();
      if (!r.ok) { setErro(d.error || 'Falha ao carregar.'); return; }
      setDet(d);
    } catch (e) { setErro(String(e)); }
  }, [placa]);

  useEffect(() => { carregar(); }, [carregar]);

  // Senha do cartão Veloe fica mascarada na ficha — clique pra revelar
  const [verSenhaVeloe, setVerSenhaVeloe] = useState(false);

  const formBase = (): Record<string, string> => {
    const v = det!.veiculo;
    return {
      marca: v.marca || '', modelo: v.modelo || '', descricao: v.descricao || '',
      ano: v.ano != null ? String(v.ano) : '', cor: v.cor || '',
      chassi: v.chassi || '', renavam: v.renavam || '', combustivel: v.combustivel || '',
      categoria: v.categoria || 'outros', status: v.status || 'ativo',
      tipo_veiculo: v.tipo_veiculo || '',
      seguradora: v.seguradora || '', numero_apolice: v.numero_apolice || '',
      senha_cartao_veloe: v.senha_cartao_veloe || '',
      proprietario: v.proprietario || '',
      exercicio_crlv: v.exercicio_crlv != null ? String(v.exercicio_crlv) : '',
      observacoes: v.observacoes || '',
      valor_mercado: det!.fipe?.valor_mercado != null ? String(det!.fipe!.valor_mercado) : '',
      fipe_codigo: v.fipe_codigo || '',
      fipe_ano_codigo: v.fipe_ano_codigo || '',
      id_projeto_omie: v.id_projeto_omie != null ? String(v.id_projeto_omie) : '',
      id_projeto_omie_castro: v.id_projeto_omie_castro != null ? String(v.id_projeto_omie_castro) : '',
    };
  };

  const abrirEdicao = () => {
    if (!det) return;
    setCrlvAvisos([]);
    setForm(formBase());
    setEditando(true);
  };

  // Lê o CRLV com IA e PRÉ-PREENCHE o formulário de edição — nada é salvo
  // sem o humano conferir e clicar em Salvar (o PATCH normal loga tudo).
  const lerCrlvDoc = async (documentoId: string) => {
    if (!det) return;
    setBusy(`crlv-${documentoId}`);
    try {
      const r = await fetch('/api/frota/documentos/ler-crlv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ documento_id: documentoId }),
      });
      const d = await r.json();
      if (!r.ok) { alert(d.error || 'Falha ao ler o CRLV.'); return; }
      const x = d.dados || {};
      const lido: Record<string, string> = {};
      if (x.marca) lido.marca = String(x.marca);
      if (x.modelo) lido.modelo = String(x.modelo);
      if (x.ano_fabricacao) lido.ano = String(x.ano_fabricacao);
      if (x.cor) lido.cor = String(x.cor);
      if (x.chassi) lido.chassi = String(x.chassi);
      if (x.renavam) lido.renavam = String(x.renavam);
      if (x.combustivel) lido.combustivel = String(x.combustivel);
      if (x.proprietario) lido.proprietario = String(x.proprietario);
      if (x.exercicio) lido.exercicio_crlv = String(x.exercicio); // "ano do documento"
      setForm({ ...formBase(), ...lido });
      setCrlvAvisos([
        `✨ ${Object.keys(lido).length} campo(s) lidos do CRLV${d.fonte === 'pdf_padrao' ? '' : ' (via IA)'} — CONFIRA antes de salvar.`,
        ...(d.avisos || []),
      ]);
      setEditando(true);
    } catch (e) { alert(String(e)); } finally { setBusy(''); }
  };

  const salvarEdicao = async () => {
    setBusy('editar');
    try {
      const { valor_mercado, ...campos } = form;
      const payload: Record<string, unknown> = { ...campos };
      if (form.ano !== undefined) payload.ano = form.ano === '' ? null : Number(form.ano);
      // projetos Omie: número ou null (o servidor espelha na SupaPlacas)
      for (const k of ['id_projeto_omie', 'id_projeto_omie_castro'] as const) {
        if (form[k] !== undefined) payload[k] = form[k] === '' ? null : Number(String(form[k]).replace(/\D/g, ''));
      }
      // ano do documento (exercício do CRLV): número ou null
      if (form.exercicio_crlv !== undefined) {
        payload.exercicio_crlv = form.exercicio_crlv === '' ? null : Number(String(form.exercicio_crlv).replace(/\D/g, ''));
      }
      const r = await fetch(`/api/frota/veiculos/${encodeURIComponent(placa)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!r.ok) { alert(d.error || 'Falha ao salvar.'); return; }
      if (d.aviso) alert(d.aviso);

      // FIPE mora em Placas (o DRE lê de lá) — grava à parte, só se mudou
      const fipeNovo = valor_mercado === '' ? null : Number(String(valor_mercado).replace(',', '.'));
      if (det?.veiculo.id_placa != null && fipeNovo !== (det.fipe?.valor_mercado ?? null)) {
        const rf = await fetch('/api/visual-estoque/frota/dados', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
          body: JSON.stringify({
            id_placa: det.veiculo.id_placa,
            valor_mercado: fipeNovo,
            data_valor: new Date().toISOString().slice(0, 10),
          }),
        });
        if (!rf.ok) { const df = await rf.json().catch(() => ({})); alert(df.erro || df.error || 'Ficha salva, mas o valor FIPE falhou.'); }
      }

      setEditando(false);
      setCrlvAvisos([]);
      await carregar();
      onMudou?.();
    } finally { setBusy(''); }
  };

  // carrega os motoristas (RH) e os perfis do portal já na abertura —
  // a FOTO do responsável vem do RH ou, na falta, do avatar do perfil no portal
  const [usuariosPortal, setUsuariosPortal] = useState<{ id: string; nome: string; avatar_url: string | null }[]>([]);
  // abas da Ficha (estilo Chrome): Visão geral × Histórico de pendências × Linha do tempo
  const [abaFicha, setAbaFicha] = useState<'geral' | 'hist' | 'timeline'>('geral');
  const [resumoHist, setResumoHist] = useState<{ total: number; abertas: number; eventos: number } | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/frota/motoristas', { headers: await authHeaders() });
        const d = await r.json();
        setMotoristas(d.motoristas || []);
      } catch { /* sem foto; o seletor ainda permite digitar o nome */ }
      try {
        const { data } = await supabase.from('financeiro_usu').select('id, nome, avatar_url');
        setUsuariosPortal((data || []).filter((u: any) => u.avatar_url));
      } catch { /* sem avatar do portal */ }
    })();
  }, []);

  const abrirTroca = () => {
    setTrocando(true);
    setNovoResp(''); setNovoRespId('');
  };

  const enviarDocumento = async () => {
    if (!det) return;
    setBusy('documento');
    try {
      const fd = new FormData();
      fd.set('veiculo_id', det.veiculo.id);
      fd.set('tipo', docForm.tipo);
      fd.set('numero', docForm.numero);
      fd.set('vigencia_fim', docForm.vigencia_fim);
      if (docArquivo) fd.set('file', docArquivo);
      const r = await fetch('/api/frota/documentos', { method: 'POST', headers: await authHeaders(), body: fd });
      const d = await r.json();
      if (!r.ok) { alert(d.error || 'Falha ao enviar.'); return; }
      setDocForm({ aberto: false, tipo: 'crlv', numero: '', vigencia_fim: '' });
      setDocArquivo(null);
      await carregar();
      // CRLV recém-subido com arquivo: já lê com IA e abre a ficha pré-preenchida
      if (podeEditar && d.documento?.tipo === 'crlv' && d.documento?.arquivo_url) {
        await lerCrlvDoc(d.documento.id);
      }
    } finally { setBusy(''); }
  };

  // Busca o valor na tabela FIPE (API pública) e pré-preenche o campo. Ao
  // salvar, o código FIPE fica gravado — daí o cron mensal atualiza sozinho.
  const buscarFipe = async () => {
    setBusy('fipe');
    try {
      const r = await fetch(`/api/frota/veiculos/${encodeURIComponent(placa)}/fipe`, { headers: await authHeaders() });
      const d = await r.json();
      if (!r.ok) { alert(d.error || 'Falha na consulta FIPE.'); return; }
      setForm((f) => ({
        ...f,
        valor_mercado: String(d.valor),
        fipe_codigo: d.codigo_fipe || '',
        fipe_ano_codigo: d.ano_codigo || '',
      }));
      setCrlvAvisos([
        `💰 FIPE: ${d.nome} (${d.ano_modelo}) — ${d.valor_texto} (${d.mes_referencia}). CONFIRA se o modelo bate antes de salvar${d.confianca === 'baixa' ? ' — CONFIANÇA BAIXA no matching!' : '.'}`,
        ...(d.candidatos?.length ? [`Outros candidatos: ${d.candidatos.slice(0, 3).join(' · ')}`] : []),
      ]);
    } catch (e) { alert(String(e)); } finally { setBusy(''); }
  };

  // Foto do veículo (mora em Placas.imagem_url — precisa do vínculo id_placa)
  const trocarFoto = async (file: File | null) => {
    if (!file) return;
    setBusy('foto');
    try {
      const fd = new FormData();
      fd.set('file', file);
      const r = await fetch(`/api/frota/veiculos/${encodeURIComponent(placa)}/foto`, {
        method: 'POST', headers: await authHeaders(), body: fd,
      });
      const d = await r.json();
      if (!r.ok) { alert(d.error || 'Falha ao trocar a foto.'); return; }
      await carregar();
      onMudou?.();
    } finally { setBusy(''); }
  };

  const excluirDocumento = async (id: string, rotulo: string) => {
    if (!confirm(`Excluir ${rotulo}?`)) return;
    setBusy('documento');
    try {
      const r = await fetch(`/api/frota/documentos?id=${id}`, { method: 'DELETE', headers: await authHeaders() });
      if (!r.ok) { const d = await r.json(); alert(d.error || 'Falha ao excluir.'); return; }
      await carregar();
    } finally { setBusy(''); }
  };

  const salvarResponsavel = async () => {
    setBusy('responsavel');
    try {
      const r = await fetch(`/api/frota/veiculos/${encodeURIComponent(placa)}/responsavel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ nome: novoResp, motorista_id: novoRespId || null }),
      });
      const d = await r.json();
      if (!r.ok) { alert(d.error || 'Falha ao trocar o responsável.'); return; }
      setTrocando(false);
      await carregar();
      onMudou?.();
    } finally { setBusy(''); }
  };

  // Desvincular = fecha o período aberto sem abrir outro (nome vazio). Assim o
  // carro fica de fato SEM responsável e passa a permitir o checklist mensal.
  const desvincularResponsavel = async () => {
    if (!confirm('Desvincular o responsável deste veículo? Ele ficará sem responsável e passará a permitir o checklist mensal pelo portal.')) return;
    setBusy('responsavel');
    try {
      const r = await fetch(`/api/frota/veiculos/${encodeURIComponent(placa)}/responsavel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ nome: '' }),
      });
      const d = await r.json();
      if (!r.ok) { alert(d.error || 'Falha ao desvincular.'); return; }
      setTrocando(false);
      await carregar();
      onMudou?.();
    } finally { setBusy(''); }
  };

  // Liga/desliga o checklist mensal deste carro. Pedir motivo ao DESLIGAR: seis
  // meses depois, "por que este carro não faz checklist?" precisa de resposta.
  const alternarChecklist = async () => {
    const v = det?.veiculo;
    if (!v) return;
    const desligando = v.checklist_desativado !== true;
    let motivo = '';
    if (desligando) {
      const resp = prompt('Desativar o checklist mensal deste veículo.\nPor quê? (ex.: parado no pátio, aguardando venda)');
      if (resp === null) return; // cancelou
      motivo = resp.trim();
    } else if (!confirm('Voltar a pedir o checklist mensal deste veículo?')) return;

    setBusy('checklist');
    try {
      const r = await fetch(`/api/frota/veiculos/${encodeURIComponent(placa)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ checklist_desativado: desligando, checklist_desativado_motivo: desligando ? motivo : '' }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { alert(d.error || 'Falha ao mudar o checklist.'); return; }
      await carregar();
      onMudou?.();
    } finally { setBusy(''); }
  };

  const v = det?.veiculo;
  // Fora da frota: some com a seção de checklist (pedido do usuário). A mesma
  // régua do servidor em /api/frota/checklist — se divergirem, a tela esconde
  // o botão de um carro que o app dos mecânicos ainda aceita, ou o contrário.
  const foraDaFrota = !!v && (v.ativo === false || v.status === 'vendido' || v.status === 'arquivado');
  const checklistDesligado = v?.checklist_desativado === true;
  // período aberto "cru" (mesmo se o nome for placeholder tipo "Vazio")
  const respAberto = det?.responsaveis.find((r) => r.fim === null) || null;
  // responsável REAL: ignora nomes-placeholder — aí o carro conta como sem responsável
  const respAtual = respAberto && !responsavelVazio(respAberto.motorista_nome) ? respAberto : null;
  const semResponsavel = !respAtual;

  const multasAbertas = useMemo(
    () => (det?.multas || []).filter((m) => !['paga', 'descontada', 'arquivada'].includes(m.status_interno)).length,
    [det],
  );

  // a MESMA régua do card vermelho da lista (lib/frota/pendencias)
  const pendencias = useMemo(() => {
    if (!det) return [];
    const limite = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
    return pendenciasDoVeiculo({
      status: det.veiculo.status,
      ativo: det.veiculo.ativo,
      pendencia_vinculo: det.veiculo.pendencia_vinculo,
      renavam: det.veiculo.renavam,
      chassi: det.veiculo.chassi,
      proprietario: det.veiculo.proprietario,
      tem_crlv: (det.documentos || []).some((d) => d.tipo === 'crlv'),
      docs_vencendo: (det.documentos || []).filter((d) => d.vigencia_fim && String(d.vigencia_fim) <= limite).length,
      multas_abertas: multasAbertas,
      exercicio_crlv: det.veiculo.exercicio_crlv,
    });
  }, [det, multasAbertas]);

  // o que tirar/resolver antes de entregar o carro vendido
  const checklist = useMemo(() => {
    if (!det) return [];
    const hoje = new Date().toISOString().slice(0, 10);
    return checklistPreVenda({
      tem_rastreador: det.veiculo.tem_rastreador,
      equipamentos: det.veiculo.equipamentos,
      seguradora: det.veiculo.seguradora,
      numero_apolice: det.veiculo.numero_apolice,
      tem_seguro_vigente: (det.documentos || []).some((d) => d.tipo === 'seguro' && d.vigencia_fim && String(d.vigencia_fim) >= hoje),
      multas_abertas: multasAbertas,
      responsavel_atual: respAtual?.motorista_nome || null,
    });
  }, [det, multasAbertas, respAtual]);

  const confirmarVenda = async () => {
    setBusy('venda');
    try {
      const r = await fetch(`/api/frota/veiculos/${encodeURIComponent(placa)}/venda`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify(venda),
      });
      const d = await r.json();
      if (!r.ok) { alert(d.error || 'Falha ao registrar a venda.'); return; }
      if (d.aviso) alert(d.aviso);
      setVendaAberta(false);
      await carregar();
      onMudou?.();
    } finally { setBusy(''); }
  };

  // Arquivar: saída da frota SEM venda (sucateado, devolvido, cadastro errado)
  const arquivar = async () => {
    const motivo = prompt('Motivo do arquivamento (sucateado, devolvido, cadastro errado/duplicado…):', '');
    if (!motivo || !motivo.trim()) return;
    setBusy('arquivar');
    try {
      const r = await fetch(`/api/frota/veiculos/${encodeURIComponent(placa)}/arquivar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ motivo: motivo.trim() }),
      });
      const d = await r.json();
      if (!r.ok) { alert(d.error || 'Falha ao arquivar.'); return; }
      if (d.aviso) alert(d.aviso);
      await carregar();
      onMudou?.();
    } finally { setBusy(''); }
  };

  const desarquivar = async () => {
    if (!confirm('Desarquivar? O veículo volta pra frota ativa (inclusive no patrimônio do DRE).')) return;
    setBusy('arquivar');
    try {
      const r = await fetch(`/api/frota/veiculos/${encodeURIComponent(placa)}/arquivar`, {
        method: 'DELETE', headers: await authHeaders(),
      });
      const d = await r.json();
      if (!r.ok) { alert(d.error || 'Falha ao desarquivar.'); return; }
      await carregar();
      onMudou?.();
    } finally { setBusy(''); }
  };

  const desfazerVenda = async () => {
    if (!confirm('Desfazer a venda? O veículo volta a contar como ativo (inclusive no patrimônio do DRE).')) return;
    setBusy('venda');
    try {
      const r = await fetch(`/api/frota/veiculos/${encodeURIComponent(placa)}/venda`, {
        method: 'DELETE', headers: await authHeaders(),
      });
      const d = await r.json();
      if (!r.ok) { alert(d.error || 'Falha ao desfazer.'); return; }
      await carregar();
      onMudou?.();
    } finally { setBusy(''); }
  };
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '6px 8px', borderRadius: 0, fontSize: 13.5,
    border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text)',
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', zIndex: 900, display: 'flex', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(1120px, 100%)', height: isMobile ? '100%' : 'auto', maxHeight: isMobile ? '100%' : '94vh', background: 'var(--portal-bg)', display: 'flex', flexDirection: 'column', borderRadius: 0, overflow: 'hidden', border: '1px solid var(--portal-border)', boxShadow: '0 25px 60px rgba(0,0,0,0.35)' }}>
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--portal-border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <label
            title={podeEditar && det?.veiculo.id_placa != null ? 'Trocar a foto do veículo' : undefined}
            style={{ position: 'relative', cursor: podeEditar && det?.veiculo.id_placa != null ? 'pointer' : 'default', flexShrink: 0 }}
          >
            {det?.imagem_url ? (
              <img src={det.imagem_url} alt="" style={{ width: 52, height: 52, borderRadius: 0, objectFit: 'cover', background: 'var(--portal-bg-secondary)', display: 'block' }} />
            ) : (
              <div style={{ width: 52, height: 52, borderRadius: 0, background: 'linear-gradient(135deg,#1E40AF,#1E3A8A)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Car size={26} color="#fff" />
              </div>
            )}
            {podeEditar && det?.veiculo.id_placa != null && (
              <>
                <span style={{ position: 'absolute', right: -4, bottom: -4, width: 20, height: 20, borderRadius: '50%', background: '#1e40af', border: '2px solid var(--portal-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {busy === 'foto' ? <Loader2 size={11} color="#fff" className="spin" /> : <Camera size={11} color="#fff" />}
                </span>
                <input type="file" accept="image/*" onChange={(e) => { trocarFoto(e.target.files?.[0] || null); e.target.value = ''; }} style={{ display: 'none' }} />
              </>
            )}
          </label>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 20, fontWeight: 800, color: 'var(--portal-text)' }}>{formatarPlaca(placa)}</strong>
              {v?.tem_rastreador && (
                <span title="Tem rastreador (Rota Exata)" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 700, color: '#1e3a8a', background: '#dbeafe', borderRadius: 999, padding: '2px 8px' }}>
                  <Satellite size={11} /> RASTREADO
                </span>
              )}
              {v && !v.ativo && (
                <span style={{ fontSize: 11.5, fontWeight: 700, color: '#b91c1c', background: '#fee2e2', borderRadius: 999, padding: '2px 8px' }}>INATIVO</span>
              )}
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--portal-text)' }}>
              {[v?.marca, v?.modelo || v?.descricao, v?.ano].filter(Boolean).join(' · ') || '—'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--portal-text)' }}><X size={20} /></button>
        </div>

        {/* Corpo */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {erro && <div style={{ color: '#b91c1c', fontSize: 13 }}>{erro}</div>}
          {!det && !erro && <div style={{ color: 'var(--portal-text)', fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}><Loader2 size={14} className="spin" /> Carregando…</div>}

          {det && v && (
            <>
              {/* Mapa de SISTEMAS (taxonomia) — azulejo vermelho piscando = pendência aberta */}
              <SistemasVeiculo placa={placa} />

              {/* ── ABAS da Ficha (estilo Chrome) ── */}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, padding: '8px 4px 0', background: 'var(--portal-bg-secondary)' }}>
                {([
                  ['geral', 'Visão geral'],
                  ['hist', `Histórico de pendências${resumoHist ? ` (${resumoHist.total})` : ''}`],
                  ['timeline', `Linha do tempo${resumoHist ? ` (${resumoHist.eventos})` : ''}`],
                ] as ['geral' | 'hist' | 'timeline', string][]).map(([chave, rotulo]) => (
                  <button key={chave} onClick={() => setAbaFicha(chave)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', cursor: 'pointer',
                      fontSize: 13, fontWeight: abaFicha === chave ? 700 : 500, color: 'var(--portal-text)', border: 'none',
                      background: abaFicha === chave ? 'var(--portal-bg-card)' : 'transparent',
                      borderRadius: '10px 10px 0 0',
                      boxShadow: abaFicha === chave ? '0 -2px 6px rgba(0,0,0,0.10)' : 'none',
                      whiteSpace: 'nowrap',
                    }}>
                    {rotulo}
                    {chave === 'hist' && resumoHist && resumoHist.abertas > 0 && (
                      <span style={{ fontSize: 10.5, fontWeight: 800, color: '#fff', background: '#dc2626', padding: '1px 8px' }} className="sist-blink">
                        {resumoHist.abertas} aberta{resumoHist.abertas > 1 ? 's' : ''}
                      </span>
                    )}
                  </button>
                ))}
                <a href={`/frota/pendencias?placa=${encodeURIComponent(placa)}`}
                  style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 12, fontWeight: 600, color: '#2563eb', textDecoration: 'none', paddingRight: 8 }}>
                  gerenciar →
                </a>
              </div>

              {/* Histórico/Linha do tempo (o componente também alimenta os contadores das abas) */}
              <HistoricoPendencias placa={placa} aba={abaFicha === 'geral' ? null : abaFicha} onResumo={setResumoHist} />

              {abaFicha === 'geral' && (<>

              {/* Pendências — a mesma régua que pinta o card de vermelho */}
              {pendencias.length > 0 && (
                <div style={{ background: 'rgba(220,38,38,0.07)', border: '1px solid #ef4444', borderRadius: 0, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: '#b91c1c', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    <AlertTriangle size={13} /> {pendencias.length} pendência{pendencias.length > 1 ? 's' : ''}
                  </div>
                  {pendencias.map((p, i) => (
                    <span key={i} style={{ fontSize: 12, color: '#b91c1c' }}>• {p}</span>
                  ))}
                </div>
              )}

              {/* Vendido — o carro é HISTÓRICO agora */}
              {v.status === 'vendido' && (
                <div style={{ background: '#ede9fe', border: '1px solid #c4b5fd', borderRadius: 0, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: '#6d28d9', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    <HandCoins size={13} /> Vendido
                  </div>
                  <span style={{ fontSize: 13.5, color: '#4c1d95' }}>
                    {v.venda_comprador ? <>Para <strong>{v.venda_comprador}</strong></> : 'Comprador não informado'}
                    {v.venda_data ? ` em ${fmtData(v.venda_data)}` : ''}
                    {v.venda_valor != null ? <> por <strong>{fmtRS(Number(v.venda_valor))}</strong></> : ''}
                  </span>
                  {v.venda_obs && <span style={{ fontSize: 12.5, color: '#6d28d9' }}>💬 {v.venda_obs}</span>}
                  <span style={{ fontSize: 11, color: '#7c3aed' }}>
                    Fora da frota ativa e do patrimônio do DRE — a ficha fica só como registro histórico.
                  </span>
                  {podeEditar && (
                    <button onClick={desfazerVenda} disabled={busy === 'venda'} style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 0, border: '1px solid #c4b5fd', background: 'transparent', color: '#6d28d9', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                      {busy === 'venda' ? <Loader2 size={11} className="spin" /> : <Undo2 size={11} />} desfazer venda
                    </button>
                  )}
                </div>
              )}

              {/* Arquivado — fora da frota, ficha de histórico */}
              {v.status === 'arquivado' && (
                <div style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 0, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    <FileText size={13} /> Arquivado{v.arquivado_em ? ` em ${fmtData(v.arquivado_em)}` : ''}
                  </div>
                  {v.arquivado_motivo && <span style={{ fontSize: 13.5, color: '#334155' }}>💬 {v.arquivado_motivo}</span>}
                  <span style={{ fontSize: 11, color: '#64748b' }}>
                    Fora da frota ativa e do patrimônio do DRE — a ficha fica só como registro histórico.
                  </span>
                  {podeEditar && (
                    <button onClick={desarquivar} disabled={busy === 'arquivar'} style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 0, border: '1px solid #cbd5e1', background: 'transparent', color: '#475569', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                      {busy === 'arquivar' ? <Loader2 size={11} className="spin" /> : <Undo2 size={11} />} desarquivar
                    </button>
                  )}
                </div>
              )}

              {/* Identificação */}
              <Secao titulo="Identificação" icone={<Car size={14} />}>
                {!editando ? (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '4px 20px' }}>
                      <Linha rotulo="Marca / Modelo" valor={[v.marca, v.modelo].filter(Boolean).join(' ') || v.descricao} />
                      <Linha rotulo="Ano" valor={v.ano} />
                      <Linha rotulo="Cor" valor={v.cor} />
                      <Linha rotulo="Combustível" valor={v.combustivel} />
                      <Linha rotulo="Chassi" valor={v.chassi} />
                      <Linha rotulo="RENAVAM" valor={v.renavam} />
                      <Linha rotulo="Tipo" valor={labelSubtipo(v.tipo_veiculo)} />
                      <Linha rotulo="Categoria" valor={v.categoria} />
                      <Linha rotulo="Status" valor={v.status} />
                      <Linha rotulo="Proprietário" valor={v.proprietario} />
                      <Linha
                        rotulo="Documento (exercício)"
                        valor={v.exercicio_crlv != null
                          ? <span style={{ color: v.exercicio_crlv < new Date().getFullYear() ? '#b91c1c' : '#15803d' }}>{v.exercicio_crlv}{v.exercicio_crlv < new Date().getFullYear() ? ' — atrasado' : ''}</span>
                          : '—'}
                      />
                      <Linha
                        rotulo={`Hodômetro${det.km_odometro_fonte === 'digitado' ? ' (digitado na bomba)' : det.km_odometro_fonte === 'rastreador' ? ' (rastreador)' : ''}`}
                        valor={det.km_odometro != null ? `${det.km_odometro.toLocaleString('pt-BR')} km` : '—'}
                      />
                      <Linha rotulo="Tanque" valor={v.capacidade_tanque != null ? `${v.capacidade_tanque} L` : '—'} />
                      <Linha rotulo="Seguradora" valor={v.seguradora} />
                      <Linha rotulo="Apólice" valor={v.numero_apolice} />
                      <Linha
                        rotulo="Senha cartão Veloe"
                        valor={v.senha_cartao_veloe
                          ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              {verSenhaVeloe ? v.senha_cartao_veloe : '••••••'}
                              <button
                                onClick={() => setVerSenhaVeloe((s) => !s)}
                                title={verSenhaVeloe ? 'Ocultar a senha' : 'Mostrar a senha'}
                                style={{ background: 'none', border: 'none', color: '#1e40af', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, padding: 0 }}
                              >
                                {verSenhaVeloe ? 'ocultar' : 'mostrar'}
                              </button>
                            </span>
                          )
                          : '—'}
                      />
                      {det.fipe && (
                        <Linha
                          rotulo="Valor de mercado (FIPE)"
                          valor={det.fipe.valor_mercado != null
                            ? `${fmtRS(det.fipe.valor_mercado)}${det.fipe.data_valor ? ` (${fmtData(det.fipe.data_valor)})` : ''}`
                            : '—'}
                        />
                      )}
                      <Linha
                        rotulo="Projeto Omie (Nova / Castro)"
                        valor={v.id_projeto_omie || v.id_projeto_omie_castro
                          ? `${v.id_projeto_omie ?? '—'} / ${v.id_projeto_omie_castro ?? '—'}`
                          : '—'}
                      />
                    </div>

                    {/* Equipamentos instalados — catálogo + chips (salva na hora) */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px dashed var(--portal-border)', paddingTop: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--portal-text)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                        Equipamentos instalados {busy === 'equip' && <Loader2 size={10} className="spin" style={{ verticalAlign: '-1px' }} />}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {(v.equipamentos || []).length === 0 && !podeEditar && (
                          <span style={{ fontSize: 12, color: 'var(--portal-text)' }}>—</span>
                        )}
                        {(v.equipamentos || []).map((e) => (
                          <span key={e} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700, color: '#1e3a8a', background: '#dbeafe', borderRadius: 999, padding: '3px 10px' }}>
                            {e}
                            {podeEditar && (
                              <button
                                onClick={() => salvarEquipamentos((v.equipamentos || []).filter((x) => x !== e))}
                                disabled={busy === 'equip'}
                                title={`Remover ${e} deste veículo`}
                                style={{ background: 'none', border: 'none', color: '#1e3a8a', cursor: 'pointer', fontSize: 12, padding: 0, lineHeight: 1 }}
                              >×</button>
                            )}
                          </span>
                        ))}
                        {podeEditar && (
                          <select
                            value=""
                            disabled={busy === 'equip'}
                            onChange={(e) => { if (e.target.value) anexarEquipamento(e.target.value); e.target.value = ''; }}
                            title="Anexar um equipamento do catálogo (cada item entra no checklist pré-venda)"
                            style={{ ...inputStyle, width: 'auto', fontSize: 12, padding: '4px 8px', cursor: 'pointer' }}
                          >
                            <option value="">Anexar equipamento…</option>
                            {catalogoEquip.filter((c) => !(v.equipamentos || []).includes(c)).map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                            <option value="__novo__">Cadastrar novo…</option>
                          </select>
                        )}
                      </div>
                    </div>
                    {v.observacoes && <div style={{ fontSize: 12, color: 'var(--portal-text)' }}>{v.observacoes}</div>}
                    {podeEditar && (
                      <button onClick={abrirEdicao} style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 0, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                        <Pencil size={11} /> Editar ficha
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    {crlvAvisos.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '8px 10px', borderRadius: 0, background: '#fef3c7', border: '1px solid #fcd34d' }}>
                        {crlvAvisos.map((a, i) => (
                          <span key={i} style={{ fontSize: 12.5, color: '#92400e', fontWeight: i === 0 ? 700 : 500 }}>{a}</span>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
                      {([
                        ['marca', 'Marca'], ['modelo', 'Modelo'], ['ano', 'Ano'], ['cor', 'Cor'],
                        ['chassi', 'Chassi'], ['renavam', 'RENAVAM'], ['combustivel', 'Combustível'],
                        ['seguradora', 'Seguradora'], ['numero_apolice', 'Apólice'],
                        ['senha_cartao_veloe', 'Senha cartão Veloe'],
                        ['proprietario', 'Proprietário'], ['exercicio_crlv', 'Documento (exercício)'],
                      ] as [string, string][]).map(([campo, rotulo]) => (
                        <label key={campo} style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11.5, fontWeight: 700, color: 'var(--portal-text)', textTransform: 'uppercase' }}>
                          {rotulo}
                          <input value={form[campo] || ''} onChange={(e) => setForm((f) => ({ ...f, [campo]: e.target.value }))} style={inputStyle} />
                        </label>
                      ))}
                      {det.veiculo.id_placa != null && (
                        <label title="Grava em Placas.valor_mercado — é o número que o DRE usa no patrimônio" style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11.5, fontWeight: 700, color: 'var(--portal-text)', textTransform: 'uppercase' }}>
                          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            Valor FIPE (R$)
                            <button
                              type="button"
                              onClick={buscarFipe}
                              disabled={busy === 'fipe'}
                              title="Buscar o valor atual na tabela FIPE pela marca/modelo/ano da ficha"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'none', border: 'none', color: '#1e40af', cursor: 'pointer', fontSize: 10, fontWeight: 700, padding: 0, textTransform: 'none' }}
                            >
                              {busy === 'fipe' ? <Loader2 size={10} className="spin" /> : <Sparkles size={10} />} buscar FIPE
                            </button>
                          </span>
                          <input value={form.valor_mercado || ''} onChange={(e) => setForm((f) => ({ ...f, valor_mercado: e.target.value }))} placeholder="ex.: 85000" style={inputStyle} />
                        </label>
                      )}
                      <label title="Código do projeto no Omie (loja NOVA) — usado ao lançar requisições veiculares no contas a pagar" style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11.5, fontWeight: 700, color: 'var(--portal-text)', textTransform: 'uppercase' }}>
                        Projeto Omie — Nova
                        <input value={form.id_projeto_omie || ''} onChange={(e) => setForm((f) => ({ ...f, id_projeto_omie: e.target.value }))} placeholder="código numérico" style={inputStyle} />
                      </label>
                      <label title="Código do projeto no Omie (loja CASTRO)" style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11.5, fontWeight: 700, color: 'var(--portal-text)', textTransform: 'uppercase' }}>
                        Projeto Omie — Castro
                        <input value={form.id_projeto_omie_castro || ''} onChange={(e) => setForm((f) => ({ ...f, id_projeto_omie_castro: e.target.value }))} placeholder="código numérico" style={inputStyle} />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11.5, fontWeight: 700, color: 'var(--portal-text)', textTransform: 'uppercase' }}>
                        Categoria
                        <select value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))} style={inputStyle}>
                          {['comercial', 'oficina', 'diretoria', 'apoio', 'outros'].map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11.5, fontWeight: 700, color: 'var(--portal-text)', textTransform: 'uppercase' }}>
                        Status
                        <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} style={inputStyle}>
                          {['ativo', 'manutencao', 'parado', 'vendido', 'locado'].map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </label>
                      <label title="Carretinha/reboque tem placa e documentos como qualquer veículo — só não tem motor" style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11.5, fontWeight: 700, color: 'var(--portal-text)', textTransform: 'uppercase' }}>
                        Tipo do veículo
                        <select value={form.tipo_veiculo} onChange={(e) => setForm((f) => ({ ...f, tipo_veiculo: e.target.value }))} style={inputStyle}>
                          <option value="">—</option>
                          {SUBTIPOS_VEICULO.map((s) => <option key={s.valor} value={s.valor}>{s.label}</option>)}
                          {form.tipo_veiculo && !SUBTIPOS_VEICULO.some((s) => s.valor === form.tipo_veiculo) && (
                            <option value={form.tipo_veiculo}>{form.tipo_veiculo}</option>
                          )}
                        </select>
                      </label>
                    </div>
                    <textarea value={form.observacoes || ''} onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} placeholder="Observações" rows={2} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
                    <div style={{ fontSize: 11, color: 'var(--portal-text)' }}>
                      Campo que você editar fica <strong>travado contra o sync</strong> da Rota Exata (o valor manual vence).
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={salvarEdicao} disabled={busy === 'editar'} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 0, border: 'none', background: '#1e40af', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        {busy === 'editar' ? <Loader2 size={12} className="spin" /> : <Check size={12} />} Salvar
                      </button>
                      <button onClick={() => { setEditando(false); setCrlvAvisos([]); }} style={{ padding: '6px 12px', borderRadius: 0, border: '1px solid var(--portal-border)', background: 'transparent', color: 'var(--portal-text)', fontSize: 12, cursor: 'pointer' }}>Cancelar</button>
                    </div>
                  </>
                )}
              </Secao>

              {/* Responsável */}
              <Secao titulo="Responsável" icone={<UserIcon size={14} />}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    {(() => {
                      // foto do técnico: 1º RH (/api/frota/motoristas), 2º avatar do PERFIL no portal
                      const norm = (s: string | null | undefined) =>
                        String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
                      const alvo = norm(respAtual?.motorista_nome);
                      const m = motoristas.find((x) =>
                        ((respAtual as any)?.motorista_id && x.id === (respAtual as any).motorista_id) ||
                        (alvo && norm(x.nome) === alvo));
                      const perfil = alvo
                        ? usuariosPortal.find((u) => {
                            const n = norm(u.nome);
                            return n === alvo || (alvo.length > 5 && (n.includes(alvo) || alvo.includes(n)));
                          })
                        : undefined;
                      const foto = ((m as any)?.foto_url || perfil?.avatar_url) as string | null | undefined;
                      return foto ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={foto} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, background: 'var(--portal-bg-secondary)', border: '2px solid var(--portal-border)' }} />
                      ) : (
                        <div style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, background: 'var(--portal-bg-secondary)', border: '2px solid var(--portal-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--portal-text)' }}>
                          <UserIcon size={18} />
                        </div>
                      );
                    })()}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--portal-text)' }}>
                        {respAtual?.motorista_nome || 'Sem responsável'}
                      </div>
                      {respAtual && (
                        <div style={{ fontSize: 12.5, color: 'var(--portal-text)' }}>
                          desde {fmtData(respAtual.inicio)} · origem: {respAtual.origem}
                        </div>
                      )}
                    </div>
                  </div>
                  {podeResponsavel && !trocando && (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button onClick={abrirTroca} style={{ padding: '5px 10px', borderRadius: 0, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                        Trocar responsável
                      </button>
                      {respAberto && (
                        <button onClick={desvincularResponsavel} disabled={busy === 'responsavel'} title="Fechar o período de responsável — o carro fica sem responsável e libera o checklist mensal pelo portal" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 0, border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                          {busy === 'responsavel' ? <Loader2 size={12} className="spin" /> : <Undo2 size={12} />} Desvincular
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {semResponsavel && respAberto && (
                  <div style={{ fontSize: 12.5, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 0, padding: '7px 10px' }}>
                    Consta um responsável &quot;{respAberto.motorista_nome}&quot; em aberto (placeholder). O carro está contando como <strong>sem responsável</strong>. Clique em <strong>Desvincular</strong> para fechar esse registro de vez.
                  </div>
                )}

                {trocando && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 0, background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)' }}>
                    <select
                      value={novoRespId}
                      onChange={(e) => {
                        setNovoRespId(e.target.value);
                        const m = motoristas.find((x) => x.id === e.target.value);
                        if (m) setNovoResp(m.nome);
                      }}
                      style={inputStyle}
                    >
                      <option value="">— escolher da lista (Rota Exata) —</option>
                      {motoristas.map((m) => <option key={m.id} value={m.id}>{m.nome}{m.cargo ? ` · ${m.cargo}` : ''}</option>)}
                    </select>
                    <input value={novoResp} onChange={(e) => { setNovoResp(e.target.value); setNovoRespId(''); }} placeholder="…ou digite o nome (vazio = sem responsável)" style={inputStyle} />
                    <div style={{ fontSize: 11, color: 'var(--portal-text)' }}>
                      A troca aqui <strong>propaga para o resto do portal</strong> (rotas, supervisor de vendas). O período anterior fica no histórico.
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={salvarResponsavel} disabled={busy === 'responsavel'} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 0, border: 'none', background: '#1e40af', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        {busy === 'responsavel' ? <Loader2 size={12} className="spin" /> : <Check size={12} />} Confirmar troca
                      </button>
                      <button onClick={() => setTrocando(false)} style={{ padding: '6px 12px', borderRadius: 0, border: '1px solid var(--portal-border)', background: 'transparent', color: 'var(--portal-text)', fontSize: 12, cursor: 'pointer' }}>Cancelar</button>
                    </div>
                  </div>
                )}

                {det.responsaveis.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: 'var(--portal-text)' }}>
                      <History size={11} /> HISTÓRICO
                    </div>
                    {det.responsaveis.slice(0, 6).map((r) => (
                      <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--portal-text)' }}>
                        <span>{r.motorista_nome || '—'}</span>
                        <span>{fmtData(r.inicio)} → {r.fim ? fmtData(r.fim) : 'atual'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Secao>

              {/* Documentos — preview inline + gestão (tudo aqui na Ficha) */}
              <Secao titulo={`Documentos (${det.documentos?.length || 0})`} icone={<FileText size={14} />}>
                {(det.documentos || []).length === 0 && !docForm.aberto && (
                  <span style={{ fontSize: 12, color: 'var(--portal-text)' }}>
                    Nenhum documento — suba o CRLV, a apólice e o IPVA pra ativar os alertas de vencimento.
                  </span>
                )}
                {(det.documentos || []).length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
                    {det.documentos.map((doc) => {
                      const dias = doc.vigencia_fim
                        ? Math.floor((new Date(`${doc.vigencia_fim}T00:00:00`).getTime() - Date.now()) / 86400_000)
                        : null;
                      return (
                        <div key={doc.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {doc.arquivo_url ? (
                            <DocumentoInline url={doc.arquivo_url} nome={doc.nome_arquivo} alturaThumb={95} />
                          ) : (
                            <div style={{ height: 95, borderRadius: 0, background: 'var(--portal-bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--portal-text)', fontSize: 11 }}>sem arquivo</div>
                          )}
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--portal-text)', display: 'flex', alignItems: 'center', gap: 5 }}>
                            {doc.tipo.toUpperCase()}
                            {dias != null && (
                              <span style={{ fontWeight: 700, color: dias < 0 ? '#b91c1c' : dias <= 30 ? '#b45309' : '#15803d' }}>
                                {dias < 0 ? 'vencido' : `${dias}d`}
                              </span>
                            )}
                            {podeEditar && doc.tipo === 'crlv' && doc.arquivo_url && (
                              <button
                                onClick={() => lerCrlvDoc(doc.id)}
                                disabled={busy === `crlv-${doc.id}`}
                                title="Ler os dados do CRLV com IA e pré-preencher a ficha (você confere antes de salvar)"
                                style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 3, background: 'none', border: 'none', color: '#1e40af', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, padding: 0 }}
                              >
                                {busy === `crlv-${doc.id}` ? <Loader2 size={10} className="spin" /> : <Sparkles size={10} />} ler dados
                              </button>
                            )}
                            {podeDocumentos && (
                              <button
                                onClick={() => excluirDocumento(doc.id, `${doc.tipo.toUpperCase()}${doc.nome_arquivo ? ` (${doc.nome_arquivo})` : ''}`)}
                                title="Excluir documento"
                                style={{ marginLeft: podeEditar && doc.tipo === 'crlv' && doc.arquivo_url ? 0 : 'auto', background: 'none', border: 'none', color: '#b91c1c', cursor: 'pointer', fontSize: 11.5, padding: 0 }}
                              >
                                excluir
                              </button>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {podeDocumentos && !docForm.aberto && (
                  <button onClick={() => setDocForm((f) => ({ ...f, aberto: true }))} style={{ alignSelf: 'flex-start', padding: '5px 10px', borderRadius: 0, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                    + Adicionar documento
                  </button>
                )}
                {docForm.aberto && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 0, background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
                      <select value={docForm.tipo} onChange={(e) => setDocForm((f) => ({ ...f, tipo: e.target.value }))} style={inputStyle}>
                        {[['crlv', 'CRLV'], ['seguro', 'Seguro'], ['ipva', 'IPVA'], ['licenciamento', 'Licenciamento'], ['contrato_locacao', 'Contrato de locação'], ['laudo', 'Laudo'], ['outros', 'Outros']].map(([k, l]) => (
                          <option key={k} value={k}>{l}</option>
                        ))}
                      </select>
                      <input placeholder="Número (opcional)" value={docForm.numero} onChange={(e) => setDocForm((f) => ({ ...f, numero: e.target.value }))} style={inputStyle} />
                    </div>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11.5, fontWeight: 700, color: 'var(--portal-text)', textTransform: 'uppercase' }}>
                      Vence em (dispara o alerta)
                      <input type="date" value={docForm.vigencia_fim} onChange={(e) => setDocForm((f) => ({ ...f, vigencia_fim: e.target.value }))} style={inputStyle} />
                    </label>
                    <input type="file" accept=".pdf,image/*" onChange={(e) => setDocArquivo(e.target.files?.[0] || null)} style={inputStyle} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={enviarDocumento} disabled={busy === 'documento'} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 0, border: 'none', background: '#1e40af', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        {busy === 'documento' ? <Loader2 size={12} className="spin" /> : <Check size={12} />} Salvar
                      </button>
                      <button onClick={() => setDocForm((f) => ({ ...f, aberto: false }))} style={{ padding: '6px 12px', borderRadius: 0, border: '1px solid var(--portal-border)', background: 'transparent', color: 'var(--portal-text)', fontSize: 12, cursor: 'pointer' }}>Cancelar</button>
                    </div>
                  </div>
                )}
              </Secao>

              {/* Checklists mensais (NT Mecânico).
                  Carro fora da frota (vendido/arquivado/inativo) não mostra
                  esta seção: não há checklist a fazer nem decisão a tomar. Já o
                  DESLIGADO à mão continua aparecendo — senão não haveria por
                  onde religar. A trava de verdade é no servidor
                  (/api/frota/checklist), porque o app dos mecânicos também abre
                  checklist e esconder botão aqui não impediria nada. */}
              {!foraDaFrota && (
              <Secao titulo={`Checklists mensais (${det.checklists?.length || 0})`} icone={<ClipboardCheck size={14} />}>
                {checklistDesligado ? (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 0, padding: '8px 12px' }}>
                    <ClipboardCheck size={14} style={{ color: '#92400e', flexShrink: 0, marginTop: 2 }} />
                    <div style={{ fontSize: 12.5, color: '#92400e', lineHeight: 1.5 }}>
                      <strong>Checklist desativado neste veículo.</strong>
                      {v.checklist_desativado_motivo ? ` ${v.checklist_desativado_motivo}` : ''}
                      {v.checklist_desativado_por ? ` (por ${v.checklist_desativado_por})` : ''}
                    </div>
                  </div>
                ) : semResponsavel && (
                  <a href={`/frota/checklist/${encodeURIComponent(v.placa)}`} target="_blank" rel="noopener noreferrer"
                    title="Veículo sem responsável — fazer/ver o checklist do mês (preenchimento pelo celular)"
                    style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 0, background: '#1e40af', color: '#fff', fontSize: 13.5, fontWeight: 700, textDecoration: 'none' }}>
                    <ClipboardCheck size={14} /> Checklist do mês
                  </a>
                )}
                {podeEditar && (
                  <button onClick={alternarChecklist} disabled={busy === 'checklist'}
                    title={checklistDesligado
                      ? 'Voltar a pedir o checklist mensal deste veículo'
                      : 'Parar de pedir o checklist mensal deste veículo (ex.: carro parado no pátio)'}
                    style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 0, border: `1px solid ${checklistDesligado ? '#bbf7d0' : '#fecaca'}`, background: checklistDesligado ? '#f0fdf4' : '#fef2f2', color: checklistDesligado ? '#166534' : '#b91c1c', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                    {busy === 'checklist' ? 'Salvando…' : checklistDesligado ? 'Reativar checklist' : 'Desativar checklist'}
                  </button>
                )}
                {(det.checklists || []).length === 0 ? (
                  <span style={{ fontSize: 12, color: 'var(--portal-text)' }}>
                    Nenhum checklist mensal registrado. O técnico responsável faz o checklist do carro no NT Mecânico no início do mês.
                  </span>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(det.checklists || []).map((c) => {
                      const st = statusChecklist(c.status, c.score_confianca);
                      const printUrl = c.share_token ? `/api/frota/checklist/print?token=${encodeURIComponent(c.share_token)}` : undefined;
                      return (
                        <a key={c.id} href={printUrl} target="_blank" rel="noopener noreferrer"
                          title={printUrl ? 'Abrir checklist (imprimir / salvar em PDF)' : 'Este checklist não tem link para abrir'}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid var(--portal-border)', borderRadius: 0, textDecoration: 'none', color: 'inherit', cursor: printUrl ? 'pointer' : 'default' }}>
                          <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--portal-text)', minWidth: 66 }}>{fmtMes(c.mes_referencia)}</span>
                          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: 12, color: 'var(--portal-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.tecnico_nome || '—'}</span>
                            {c.placa_registrada && (
                              <span title={`Vinculado pelo responsável — no NT Mecânico este checklist foi registrado com a placa ${c.placa_registrada}`} style={{ fontSize: 11.5, color: '#b45309' }}>
                                registrado como {formatarPlaca(c.placa_registrada)}
                              </span>
                            )}
                          </span>
                          {c.km != null && <span style={{ fontSize: 12.5, color: 'var(--portal-text)' }}>{c.km.toLocaleString('pt-BR')} km</span>}
                          {c.score_confianca != null && <span style={{ fontSize: 11, fontWeight: 700, color: c.score_confianca < 50 ? '#b91c1c' : 'var(--portal-text-muted)' }}>{c.score_confianca}%</span>}
                          <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 8px', borderRadius: 0, background: st.bg, color: st.cor }}>{st.label}</span>
                          <FileText size={15} color="var(--portal-text-muted)" />
                        </a>
                      );
                    })}
                  </div>
                )}
              </Secao>
              )}

              {/* Custos 12m */}
              <Secao titulo="Custos (últimos 12 meses)" icone={<DollarSign size={14} />}>
                {det.custos_12m.length === 0 ? (
                  <span style={{ fontSize: 12, color: 'var(--portal-text)' }}>Sem custos registrados.</span>
                ) : (
                  <>
                    {det.custos_12m.map((c) => <Linha key={c.tipo} rotulo={c.tipo} valor={fmtRS(c.total)} />)}
                    <div style={{ borderTop: '1px dashed var(--portal-border)', paddingTop: 6 }}>
                      <Linha rotulo="Total 12m" valor={<strong style={{ color: '#1e40af' }}>{fmtRS(det.custos_12m.reduce((s, c) => s + c.total, 0))}</strong>} />
                    </div>
                  </>
                )}
              </Secao>

              {/* Uso & Ignição (30 dias) */}
              {v.tem_rastreador && det.uso_30d && (
                <Secao titulo="Uso & Ignição (30 dias)" icone={<Gauge size={14} />}>
                  {det.uso_30d.dias_com_uso === 0 ? (
                    <span style={{ fontSize: 12, color: 'var(--portal-text)' }}>
                      Sem dias consolidados ainda — o fechamento roda de madrugada.
                    </span>
                  ) : (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '4px 20px' }}>
                        <Linha rotulo="Dias com uso" valor={det.uso_30d.dias_com_uso} />
                        <Linha rotulo="Partidas" valor={det.uso_30d.partidas} />
                        <Linha rotulo="Tempo ligado" valor={`${Math.floor(det.uso_30d.tempo_ligado_min / 60)}h${String(det.uso_30d.tempo_ligado_min % 60).padStart(2, '0')}`} />
                        <Linha
                          rotulo="Marcha lenta (parado ligado)"
                          valor={<span style={{ color: det.uso_30d.tempo_marcha_lenta_min >= 300 ? '#b45309' : undefined }}>{`${Math.floor(det.uso_30d.tempo_marcha_lenta_min / 60)}h${String(det.uso_30d.tempo_marcha_lenta_min % 60).padStart(2, '0')}`}</span>}
                        />
                        <Linha rotulo="KM rodados" valor={det.uso_30d.km.toLocaleString('pt-BR')} />
                        <Linha rotulo="Paradas atípicas" valor={<span style={{ color: det.uso_30d.paradas_atipicas > 0 ? '#b91c1c' : undefined }}>{det.uso_30d.paradas_atipicas}</span>} />
                      </div>
                      {det.uso_30d.ultimos_dias.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, borderTop: '1px dashed var(--portal-border)', paddingTop: 8 }}>
                          {det.uso_30d.ultimos_dias.map((d) => (
                            <div key={d.data} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--portal-text)' }}>
                              <span>{fmtData(d.data)}</span>
                              <span>
                                {Math.round(Number(d.km_odometro ?? d.km_total))} km · {d.partidas} partida(s) · {d.tempo_ligado_min}min ligado
                                {d.paradas_atipicas > 0 && <strong style={{ color: '#b91c1c' }}> · {d.paradas_atipicas} atípica(s)</strong>}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* modal com mini-mapa multi-dia — nada de redirecionar */}
                      <button onClick={() => setTrajetosAberto(true)} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0, fontSize: 12.5, color: '#1e40af', fontWeight: 600, cursor: 'pointer' }}>
                        Ver paradas & trajetos deste veículo →
                      </button>
                    </>
                  )}
                </Secao>
              )}

              {/* Multas */}
              <Secao titulo={`Multas (${det.multas.length})`} icone={<ShieldAlert size={14} />}>
                {det.multas.length === 0 ? (
                  <span style={{ fontSize: 12, color: 'var(--portal-text)' }}>Nenhuma multa registrada. 🎉</span>
                ) : det.multas.map((m) => {
                  const st = STATUS_MULTA[m.status_interno] || STATUS_MULTA.nova;
                  return (
                    <div key={m.id} style={{ padding: '8px 10px', borderRadius: 0, background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <strong style={{ fontSize: 13.5, color: 'var(--portal-text)' }}>{fmtData(m.dt_multa)} · {fmtRS(m.valor)} · {m.pontos ?? 0} pts</strong>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: st.cor, background: st.bg, borderRadius: 999, padding: '2px 8px' }}>{st.label}</span>
                      </div>
                      <span style={{ fontSize: 12.5, color: 'var(--portal-text)' }}>
                        {m.motorista_nome ? `Motorista: ${m.motorista_nome}` : 'Motorista não identificado'}
                        {m.motorista_divergente && (
                          <span title="O motorista carimbado pela Rota Exata difere do responsável vigente na data" style={{ color: '#b45309', marginLeft: 6 }}>
                            <AlertTriangle size={11} style={{ verticalAlign: '-2px' }} /> divergente
                          </span>
                        )}
                      </span>
                      {m.local_endereco && <span style={{ fontSize: 11, color: 'var(--portal-text)' }}>{m.local_endereco}</span>}
                    </div>
                  );
                })}
              </Secao>

              {/* Manutenções */}
              <Secao titulo={`Manutenções (${det.manutencoes.length})`} icone={<Wrench size={14} />}>
                {det.manutencoes.length === 0 ? (
                  <span style={{ fontSize: 12, color: 'var(--portal-text)' }}>Nenhuma manutenção registrada.</span>
                ) : det.manutencoes.slice(0, 8).map((m) => (
                  <div key={`${m.origem}-${m.id}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, color: 'var(--portal-text)' }}>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {fmtData(m.data)} ·{' '}
                      {m.origem === 'requisicao' ? (
                        <a href={`/requisicoes?req=${m.id}`} title="Abrir a requisição" style={{ color: '#1e40af', textDecoration: 'none', fontWeight: 600 }}>
                          {m.descricao || m.tipo || '—'}
                        </a>
                      ) : (
                        m.descricao || m.tipo || '—'
                      )}
                      <span style={{ color: 'var(--portal-text)' }}> ({m.origem === 'requisicao' ? 'requisição' : m.origem})</span>
                    </span>
                    <strong style={{ color: 'var(--portal-text)' }}>{fmtRS(m.valor_total)}</strong>
                  </div>
                ))}
              </Secao>

              {/* Abastecimentos recentes */}
              <Secao titulo="Abastecimentos recentes" icone={<Fuel size={14} />}>
                {det.abastecimentos.length === 0 ? (
                  <span style={{ fontSize: 12, color: 'var(--portal-text)' }}>Nenhum abastecimento.</span>
                ) : det.abastecimentos.map((a, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, color: 'var(--portal-text)' }}>
                    <span>
                      {fmtData(a.data_transacao)} · {Number(a.litros).toFixed(1)} L
                      {a.hodometro != null && Number(a.hodometro) > 0 && ` · ${Number(a.hodometro).toLocaleString('pt-BR')} km`}
                      {a.posto_nome ? ` · ${a.posto_nome}` : ''}
                    </span>
                    <strong style={{ color: 'var(--portal-text)' }}>{fmtRS(Number(a.valor_total))}</strong>
                  </div>
                ))}
                {/* modal com o histórico completo (dia/semana/mês) — nada de redirecionar */}
                <button onClick={() => setAbastecimentosAberto(true)} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0, fontSize: 12.5, color: '#1e40af', fontWeight: 600, cursor: 'pointer' }}>
                  Ver todos os abastecimentos deste veículo →
                </button>
              </Secao>

              {/* Saída da frota — venda ou arquivamento; a ficha fica de histórico */}
              {podeEditar && v.status !== 'vendido' && v.status !== 'arquivado' && (
                <Secao titulo="Saída da frota" icone={<HandCoins size={14} />}>
                  {!vendaAberta ? (
                    <>
                      <span style={{ fontSize: 12, color: 'var(--portal-text)' }}>
                        O carro saiu? <strong>Venda</strong> registra pra quem, quando e por quanto;{' '}
                        <strong>arquivar</strong> é pra saída sem venda (sucateado, devolvido, cadastro
                        errado). Nos dois casos ele sai da frota ativa e do patrimônio do DRE, mas a
                        ficha inteira fica de histórico — nada é apagado.
                      </span>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button onClick={() => setVendaAberta(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 0, border: '1px solid #fca5a5', background: '#fef2f2', color: '#b91c1c', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                          <HandCoins size={13} /> Marcar como vendido
                        </button>
                        <button onClick={arquivar} disabled={busy === 'arquivar'} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 0, border: '1px solid #cbd5e1', background: 'var(--portal-bg-input)', color: '#475569', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                          {busy === 'arquivar' ? <Loader2 size={13} className="spin" /> : <FileText size={13} />} Arquivar veículo
                        </button>
                      </div>
                    </>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 10, borderRadius: 0, background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)' }}>
                      {checklist.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '8px 10px', borderRadius: 0, background: '#fef3c7', border: '1px solid #fcd34d' }}>
                          <span style={{ fontSize: 12.5, fontWeight: 800, color: '#92400e', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                            Antes de entregar, tire/resolva:
                          </span>
                          {checklist.map((c, i) => (
                            <span key={i} style={{ fontSize: 12.5, color: '#92400e' }}>• {c}</span>
                          ))}
                        </div>
                      )}
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
                        <label style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11.5, fontWeight: 700, color: 'var(--portal-text)', textTransform: 'uppercase' }}>
                          Vendido para *
                          <input value={venda.comprador} onChange={(e) => setVenda((f) => ({ ...f, comprador: e.target.value }))} placeholder="nome do comprador" style={inputStyle} />
                        </label>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11.5, fontWeight: 700, color: 'var(--portal-text)', textTransform: 'uppercase' }}>
                          Data da venda *
                          <input type="date" value={venda.data} onChange={(e) => setVenda((f) => ({ ...f, data: e.target.value }))} style={inputStyle} />
                        </label>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11.5, fontWeight: 700, color: 'var(--portal-text)', textTransform: 'uppercase' }}>
                          Valor (R$) *
                          <input value={venda.valor} onChange={(e) => setVenda((f) => ({ ...f, valor: e.target.value }))} placeholder="ex.: 45000" style={inputStyle} />
                        </label>
                      </div>
                      <textarea value={venda.obs} onChange={(e) => setVenda((f) => ({ ...f, obs: e.target.value }))} placeholder="Observações (forma de pagamento, pendências combinadas…)" rows={2} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={confirmarVenda} disabled={busy === 'venda'} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 0, border: 'none', background: '#b91c1c', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                          {busy === 'venda' ? <Loader2 size={12} className="spin" /> : <Check size={12} />} Confirmar venda
                        </button>
                        <button onClick={() => setVendaAberta(false)} style={{ padding: '6px 12px', borderRadius: 0, border: '1px solid var(--portal-border)', background: 'transparent', color: 'var(--portal-text)', fontSize: 12, cursor: 'pointer' }}>Cancelar</button>
                      </div>
                    </div>
                  )}
                </Secao>
              )}

              {abastecimentosAberto && (
                <AbastecimentosModal placa={v.placa} onClose={() => setAbastecimentosAberto(false)} />
              )}
              {trajetosAberto && (
                <TrajetosModal placa={v.placa} onClose={() => setTrajetosAberto(false)} />
              )}

              {/* Rodapé técnico */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--portal-text-faint)' }}>
                <Gauge size={11} />
                {v.tem_rastreador
                  ? `Sincronizado com a Rota Exata${v.visto_em ? ` · visto em ${new Date(v.visto_em).toLocaleString('pt-BR')}` : ''}`
                  : 'Sem rastreador — ignição/trajetos indisponíveis para este veículo.'}
                {(v.campos_manuais || []).length > 0 && ` · campos travados: ${v.campos_manuais.join(', ')}`}
              </div>
              </>)}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
