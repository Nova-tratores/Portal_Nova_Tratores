'use client';
// Ficha do Veículo — o coração do Frota. Tudo vem de UMA chamada local
// (/api/frota/veiculos/[placa]): os espelhos já estão no banco, então não há
// espera de API externa aqui.
import { useCallback, useEffect, useState } from 'react';
import {
  Car, X, ShieldAlert, User as UserIcon, Wrench, Fuel, DollarSign,
  Loader2, Pencil, Check, History, Gauge, Satellite, AlertTriangle, FileText, Sparkles,
} from 'lucide-react';
import { authHeaders } from '@/lib/auth/client';
import DocumentoInline from '@/components/frota/DocumentoInline';
import { formatarPlaca } from '@/lib/frota/placa';
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

function Secao({ titulo, icone, children }: { titulo: string; icone: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {icone}{titulo}
      </div>
      {children}
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12.5 }}>
      <span style={{ color: 'var(--portal-text-muted)' }}>{rotulo}</span>
      <span style={{ color: 'var(--portal-text)', fontWeight: 600, textAlign: 'right' }}>{valor ?? '—'}</span>
    </div>
  );
}

const STATUS_MULTA: Record<string, { label: string; cor: string; bg: string }> = {
  nova: { label: 'Nova', cor: '#b45309', bg: '#fef3c7' },
  em_analise: { label: 'Em análise', cor: '#1d4ed8', bg: '#dbeafe' },
  em_defesa: { label: 'Em defesa', cor: '#7c3aed', bg: '#ede9fe' },
  paga: { label: 'Paga', cor: '#15803d', bg: '#dcfce7' },
  descontada: { label: 'Descontada', cor: '#0f766e', bg: '#ccfbf1' },
  arquivada: { label: 'Arquivada', cor: '#64748b', bg: '#f1f5f9' },
};

export default function VeiculoDrawer({ placa, podeEditar, podeResponsavel, podeDocumentos, onClose, onMudou }: Props) {
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

  const formBase = (): Record<string, string> => {
    const v = det!.veiculo;
    return {
      marca: v.marca || '', modelo: v.modelo || '', descricao: v.descricao || '',
      ano: v.ano != null ? String(v.ano) : '', cor: v.cor || '',
      chassi: v.chassi || '', renavam: v.renavam || '', combustivel: v.combustivel || '',
      categoria: v.categoria || 'outros', status: v.status || 'ativo',
      seguradora: v.seguradora || '', numero_apolice: v.numero_apolice || '',
      proprietario: v.proprietario || '',
      observacoes: v.observacoes || '',
      valor_mercado: det!.fipe?.valor_mercado != null ? String(det!.fipe!.valor_mercado) : '',
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

  const abrirTroca = async () => {
    setTrocando(true);
    setNovoResp(''); setNovoRespId('');
    try {
      const r = await fetch('/api/frota/motoristas', { headers: await authHeaders() });
      const d = await r.json();
      setMotoristas(d.motoristas || []);
    } catch { /* seletor fica vazio; dá pra digitar o nome */ }
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

  const v = det?.veiculo;
  const respAtual = det?.responsaveis.find((r) => r.fim === null) || null;
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '6px 8px', borderRadius: 6, fontSize: 12.5,
    border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text)',
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 900, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(640px, 100%)', height: '100%', background: 'var(--portal-bg)', display: 'flex', flexDirection: 'column', boxShadow: '-10px 0 40px rgba(0,0,0,0.3)' }}>
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--portal-border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          {det?.imagem_url ? (
            <img src={det.imagem_url} alt="" style={{ width: 52, height: 52, borderRadius: 10, objectFit: 'cover', background: 'var(--portal-bg-secondary)' }} />
          ) : (
            <div style={{ width: 52, height: 52, borderRadius: 10, background: 'linear-gradient(135deg,#0D9488,#0F766E)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Car size={26} color="#fff" />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 20, fontWeight: 800, color: 'var(--portal-text)' }}>{formatarPlaca(placa)}</strong>
              {v?.tem_rastreador && (
                <span title="Tem rastreador (Rota Exata)" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700, color: '#0f766e', background: '#ccfbf1', borderRadius: 999, padding: '2px 8px' }}>
                  <Satellite size={11} /> RASTREADO
                </span>
              )}
              {v && !v.ativo && (
                <span style={{ fontSize: 10.5, fontWeight: 700, color: '#b91c1c', background: '#fee2e2', borderRadius: 999, padding: '2px 8px' }}>INATIVO</span>
              )}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)' }}>
              {[v?.marca, v?.modelo || v?.descricao, v?.ano].filter(Boolean).join(' · ') || '—'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--portal-text-muted)' }}><X size={20} /></button>
        </div>

        {/* Corpo */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {erro && <div style={{ color: '#b91c1c', fontSize: 13 }}>{erro}</div>}
          {!det && !erro && <div style={{ color: 'var(--portal-text-muted)', fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}><Loader2 size={14} className="spin" /> Carregando…</div>}

          {det && v && (
            <>
              {/* Identificação */}
              <Secao titulo="Identificação" icone={<Car size={14} />}>
                {!editando ? (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 20px' }}>
                      <Linha rotulo="Marca / Modelo" valor={[v.marca, v.modelo].filter(Boolean).join(' ') || v.descricao} />
                      <Linha rotulo="Ano" valor={v.ano} />
                      <Linha rotulo="Cor" valor={v.cor} />
                      <Linha rotulo="Combustível" valor={v.combustivel} />
                      <Linha rotulo="Chassi" valor={v.chassi} />
                      <Linha rotulo="RENAVAM" valor={v.renavam} />
                      <Linha rotulo="Categoria" valor={v.categoria} />
                      <Linha rotulo="Status" valor={v.status} />
                      <Linha rotulo="Proprietário" valor={v.proprietario} />
                      <Linha rotulo="Hodômetro (rastreador)" valor={det.km_odometro != null ? `${det.km_odometro.toLocaleString('pt-BR')} km` : '—'} />
                      <Linha rotulo="Tanque" valor={v.capacidade_tanque != null ? `${v.capacidade_tanque} L` : '—'} />
                      <Linha rotulo="Seguradora" valor={v.seguradora} />
                      <Linha rotulo="Apólice" valor={v.numero_apolice} />
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
                    {v.observacoes && <div style={{ fontSize: 12, color: 'var(--portal-text-secondary)' }}>{v.observacoes}</div>}
                    {podeEditar && (
                      <button onClick={abrirEdicao} style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text-secondary)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>
                        <Pencil size={11} /> Editar ficha
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    {crlvAvisos.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '8px 10px', borderRadius: 8, background: '#fef3c7', border: '1px solid #fcd34d' }}>
                        {crlvAvisos.map((a, i) => (
                          <span key={i} style={{ fontSize: 11.5, color: '#92400e', fontWeight: i === 0 ? 700 : 500 }}>{a}</span>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {([
                        ['marca', 'Marca'], ['modelo', 'Modelo'], ['ano', 'Ano'], ['cor', 'Cor'],
                        ['chassi', 'Chassi'], ['renavam', 'RENAVAM'], ['combustivel', 'Combustível'],
                        ['seguradora', 'Seguradora'], ['numero_apolice', 'Apólice'],
                        ['proprietario', 'Proprietário'],
                      ] as [string, string][]).map(([campo, rotulo]) => (
                        <label key={campo} style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10.5, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase' }}>
                          {rotulo}
                          <input value={form[campo] || ''} onChange={(e) => setForm((f) => ({ ...f, [campo]: e.target.value }))} style={inputStyle} />
                        </label>
                      ))}
                      {det.veiculo.id_placa != null && (
                        <label title="Grava em Placas.valor_mercado — é o número que o DRE usa no patrimônio" style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10.5, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase' }}>
                          Valor FIPE (R$)
                          <input value={form.valor_mercado || ''} onChange={(e) => setForm((f) => ({ ...f, valor_mercado: e.target.value }))} placeholder="ex.: 85000" style={inputStyle} />
                        </label>
                      )}
                      <label title="Código do projeto no Omie (loja NOVA) — usado ao lançar requisições veiculares no contas a pagar" style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10.5, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase' }}>
                        Projeto Omie — Nova
                        <input value={form.id_projeto_omie || ''} onChange={(e) => setForm((f) => ({ ...f, id_projeto_omie: e.target.value }))} placeholder="código numérico" style={inputStyle} />
                      </label>
                      <label title="Código do projeto no Omie (loja CASTRO)" style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10.5, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase' }}>
                        Projeto Omie — Castro
                        <input value={form.id_projeto_omie_castro || ''} onChange={(e) => setForm((f) => ({ ...f, id_projeto_omie_castro: e.target.value }))} placeholder="código numérico" style={inputStyle} />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10.5, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase' }}>
                        Categoria
                        <select value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))} style={inputStyle}>
                          {['comercial', 'oficina', 'diretoria', 'apoio', 'outros'].map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10.5, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase' }}>
                        Status
                        <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} style={inputStyle}>
                          {['ativo', 'manutencao', 'parado', 'vendido', 'locado'].map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </label>
                    </div>
                    <textarea value={form.observacoes || ''} onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} placeholder="Observações" rows={2} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
                    <div style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>
                      Campo que você editar fica <strong>travado contra o sync</strong> da Rota Exata (o valor manual vence).
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={salvarEdicao} disabled={busy === 'editar'} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 6, border: 'none', background: '#0d9488', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        {busy === 'editar' ? <Loader2 size={12} className="spin" /> : <Check size={12} />} Salvar
                      </button>
                      <button onClick={() => { setEditando(false); setCrlvAvisos([]); }} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--portal-border)', background: 'transparent', color: 'var(--portal-text-secondary)', fontSize: 12, cursor: 'pointer' }}>Cancelar</button>
                    </div>
                  </>
                )}
              </Secao>

              {/* Responsável */}
              <Secao titulo="Responsável" icone={<UserIcon size={14} />}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--portal-text)' }}>
                      {respAtual?.motorista_nome || 'Sem responsável'}
                    </div>
                    {respAtual && (
                      <div style={{ fontSize: 11.5, color: 'var(--portal-text-muted)' }}>
                        desde {fmtData(respAtual.inicio)} · origem: {respAtual.origem}
                      </div>
                    )}
                  </div>
                  {podeResponsavel && !trocando && (
                    <button onClick={abrirTroca} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text-secondary)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>
                      Trocar responsável
                    </button>
                  )}
                </div>

                {trocando && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 8, background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)' }}>
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
                    <div style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>
                      A troca aqui <strong>propaga para o resto do portal</strong> (rotas, supervisor de vendas). O período anterior fica no histórico.
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={salvarResponsavel} disabled={busy === 'responsavel'} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 6, border: 'none', background: '#0d9488', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        {busy === 'responsavel' ? <Loader2 size={12} className="spin" /> : <Check size={12} />} Confirmar troca
                      </button>
                      <button onClick={() => setTrocando(false)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--portal-border)', background: 'transparent', color: 'var(--portal-text-secondary)', fontSize: 12, cursor: 'pointer' }}>Cancelar</button>
                    </div>
                  </div>
                )}

                {det.responsaveis.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: 'var(--portal-text-muted)' }}>
                      <History size={11} /> HISTÓRICO
                    </div>
                    {det.responsaveis.slice(0, 6).map((r) => (
                      <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--portal-text-secondary)' }}>
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
                  <span style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>
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
                            <div style={{ height: 95, borderRadius: 8, background: 'var(--portal-bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--portal-text-muted)', fontSize: 11 }}>sem arquivo</div>
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
                                style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 3, background: 'none', border: 'none', color: '#0d9488', cursor: 'pointer', fontSize: 10.5, fontWeight: 700, padding: 0 }}
                              >
                                {busy === `crlv-${doc.id}` ? <Loader2 size={10} className="spin" /> : <Sparkles size={10} />} ler dados
                              </button>
                            )}
                            {podeDocumentos && (
                              <button
                                onClick={() => excluirDocumento(doc.id, `${doc.tipo.toUpperCase()}${doc.nome_arquivo ? ` (${doc.nome_arquivo})` : ''}`)}
                                title="Excluir documento"
                                style={{ marginLeft: podeEditar && doc.tipo === 'crlv' && doc.arquivo_url ? 0 : 'auto', background: 'none', border: 'none', color: '#b91c1c', cursor: 'pointer', fontSize: 10.5, padding: 0 }}
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
                  <button onClick={() => setDocForm((f) => ({ ...f, aberto: true }))} style={{ alignSelf: 'flex-start', padding: '5px 10px', borderRadius: 6, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text-secondary)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>
                    + Adicionar documento
                  </button>
                )}
                {docForm.aberto && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 8, background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <select value={docForm.tipo} onChange={(e) => setDocForm((f) => ({ ...f, tipo: e.target.value }))} style={inputStyle}>
                        {[['crlv', 'CRLV'], ['seguro', 'Seguro'], ['ipva', 'IPVA'], ['licenciamento', 'Licenciamento'], ['contrato_locacao', 'Contrato de locação'], ['laudo', 'Laudo'], ['outros', 'Outros']].map(([k, l]) => (
                          <option key={k} value={k}>{l}</option>
                        ))}
                      </select>
                      <input placeholder="Número (opcional)" value={docForm.numero} onChange={(e) => setDocForm((f) => ({ ...f, numero: e.target.value }))} style={inputStyle} />
                    </div>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10.5, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase' }}>
                      Vence em (dispara o alerta)
                      <input type="date" value={docForm.vigencia_fim} onChange={(e) => setDocForm((f) => ({ ...f, vigencia_fim: e.target.value }))} style={inputStyle} />
                    </label>
                    <input type="file" accept=".pdf,image/*" onChange={(e) => setDocArquivo(e.target.files?.[0] || null)} style={inputStyle} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={enviarDocumento} disabled={busy === 'documento'} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 6, border: 'none', background: '#0d9488', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        {busy === 'documento' ? <Loader2 size={12} className="spin" /> : <Check size={12} />} Salvar
                      </button>
                      <button onClick={() => setDocForm((f) => ({ ...f, aberto: false }))} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--portal-border)', background: 'transparent', color: 'var(--portal-text-secondary)', fontSize: 12, cursor: 'pointer' }}>Cancelar</button>
                    </div>
                  </div>
                )}
              </Secao>

              {/* Custos 12m */}
              <Secao titulo="Custos (últimos 12 meses)" icone={<DollarSign size={14} />}>
                {det.custos_12m.length === 0 ? (
                  <span style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>Sem custos registrados.</span>
                ) : (
                  <>
                    {det.custos_12m.map((c) => <Linha key={c.tipo} rotulo={c.tipo} valor={fmtRS(c.total)} />)}
                    <div style={{ borderTop: '1px dashed var(--portal-border)', paddingTop: 6 }}>
                      <Linha rotulo="Total 12m" valor={<strong style={{ color: '#0d9488' }}>{fmtRS(det.custos_12m.reduce((s, c) => s + c.total, 0))}</strong>} />
                    </div>
                  </>
                )}
              </Secao>

              {/* Uso & Ignição (30 dias) */}
              {v.tem_rastreador && det.uso_30d && (
                <Secao titulo="Uso & Ignição (30 dias)" icone={<Gauge size={14} />}>
                  {det.uso_30d.dias_com_uso === 0 ? (
                    <span style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>
                      Sem dias consolidados ainda — o fechamento roda de madrugada.
                    </span>
                  ) : (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 20px' }}>
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
                            <div key={d.data} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--portal-text-secondary)' }}>
                              <span>{fmtData(d.data)}</span>
                              <span>
                                {Math.round(Number(d.km_odometro ?? d.km_total))} km · {d.partidas} partida(s) · {d.tempo_ligado_min}min ligado
                                {d.paradas_atipicas > 0 && <strong style={{ color: '#b91c1c' }}> · {d.paradas_atipicas} atípica(s)</strong>}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      <a href="/frota/paradas" style={{ fontSize: 11.5, color: '#0d9488', fontWeight: 600, textDecoration: 'none' }}>
                        Ver paradas & trajetos →
                      </a>
                    </>
                  )}
                </Secao>
              )}

              {/* Multas */}
              <Secao titulo={`Multas (${det.multas.length})`} icone={<ShieldAlert size={14} />}>
                {det.multas.length === 0 ? (
                  <span style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>Nenhuma multa registrada. 🎉</span>
                ) : det.multas.map((m) => {
                  const st = STATUS_MULTA[m.status_interno] || STATUS_MULTA.nova;
                  return (
                    <div key={m.id} style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <strong style={{ fontSize: 12.5, color: 'var(--portal-text)' }}>{fmtData(m.dt_multa)} · {fmtRS(m.valor)} · {m.pontos ?? 0} pts</strong>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: st.cor, background: st.bg, borderRadius: 999, padding: '2px 8px' }}>{st.label}</span>
                      </div>
                      <span style={{ fontSize: 11.5, color: 'var(--portal-text-secondary)' }}>
                        {m.motorista_nome ? `Motorista: ${m.motorista_nome}` : 'Motorista não identificado'}
                        {m.motorista_divergente && (
                          <span title="O motorista carimbado pela Rota Exata difere do responsável vigente na data" style={{ color: '#b45309', marginLeft: 6 }}>
                            <AlertTriangle size={11} style={{ verticalAlign: '-2px' }} /> divergente
                          </span>
                        )}
                      </span>
                      {m.local_endereco && <span style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>{m.local_endereco}</span>}
                    </div>
                  );
                })}
              </Secao>

              {/* Manutenções */}
              <Secao titulo={`Manutenções (${det.manutencoes.length})`} icone={<Wrench size={14} />}>
                {det.manutencoes.length === 0 ? (
                  <span style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>Nenhuma manutenção registrada.</span>
                ) : det.manutencoes.slice(0, 8).map((m) => (
                  <div key={`${m.origem}-${m.id}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, color: 'var(--portal-text-secondary)' }}>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {fmtData(m.data)} ·{' '}
                      {m.origem === 'requisicao' ? (
                        <a href={`/requisicoes?req=${m.id}`} title="Abrir a requisição" style={{ color: '#0d9488', textDecoration: 'none', fontWeight: 600 }}>
                          {m.descricao || m.tipo || '—'}
                        </a>
                      ) : (
                        m.descricao || m.tipo || '—'
                      )}
                      <span style={{ color: 'var(--portal-text-muted)' }}> ({m.origem === 'requisicao' ? 'requisição' : m.origem})</span>
                    </span>
                    <strong style={{ color: 'var(--portal-text)' }}>{fmtRS(m.valor_total)}</strong>
                  </div>
                ))}
              </Secao>

              {/* Abastecimentos recentes */}
              <Secao titulo="Abastecimentos recentes" icone={<Fuel size={14} />}>
                {det.abastecimentos.length === 0 ? (
                  <span style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>Nenhum abastecimento.</span>
                ) : det.abastecimentos.map((a, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, color: 'var(--portal-text-secondary)' }}>
                    <span>{fmtData(a.data_transacao)} · {Number(a.litros).toFixed(1)} L{a.posto_nome ? ` · ${a.posto_nome}` : ''}</span>
                    <strong style={{ color: 'var(--portal-text)' }}>{fmtRS(Number(a.valor_total))}</strong>
                  </div>
                ))}
                <a href={`/frota/abastecimento?placa=${encodeURIComponent(placa)}`} style={{ fontSize: 11.5, color: '#0d9488', fontWeight: 600, textDecoration: 'none' }}>
                  Ver tudo no Abastecimento →
                </a>
              </Secao>

              {/* Rodapé técnico */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--portal-text-faint)' }}>
                <Gauge size={11} />
                {v.tem_rastreador
                  ? `Sincronizado com a Rota Exata${v.visto_em ? ` · visto em ${new Date(v.visto_em).toLocaleString('pt-BR')}` : ''}`
                  : 'Sem rastreador — ignição/trajetos indisponíveis para este veículo.'}
                {(v.campos_manuais || []).length > 0 && ` · campos travados: ${v.campos_manuais.join(', ')}`}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
