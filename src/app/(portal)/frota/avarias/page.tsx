'use client';
// Frota > Avarias — danos de veículo atribuíveis a um motorista (batida, mau
// uso, dano no pátio…). Registro manual. O dado vive aqui; a COBRANÇA tem fim
// no RH: o app do RH lê esta tabela (Descontos → Avarias da frota), anexa o
// desconto na folha e espelha o status de volta — mesmo desenho das multas.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CarFront, Loader2, Plus, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { authHeaders } from '@/lib/auth/client';
import { supabase } from '@/lib/supabase';
import { formatarPlaca } from '@/lib/frota/placa';
import { MSG_SEM_PERMISSAO } from '@/lib/permissoes/ui';

const fmtRS = (v: number | null) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const fmtData = (s: string | null) => (s ? new Date(`${String(s).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—');

interface Avaria {
  id: string;
  placa: string;
  data: string;
  descricao: string;
  valor: number;
  motorista_id: string | null;
  motorista_nome: string | null;
  status: string;
  obs: string | null;
  criado_por: string | null;
}

const STATUS: Record<string, { label: string; cor: string; bg: string }> = {
  aberta: { label: 'Aberta', cor: '#b45309', bg: '#fef3c7' },
  descontada: { label: 'Descontada em folha (RH)', cor: '#1e3a8a', bg: '#dbeafe' },
  cobrada: { label: 'Cobrada por fora', cor: '#15803d', bg: '#dcfce7' },
  absorvida: { label: 'Empresa absorveu', cor: '#64748b', bg: '#f1f5f9' },
  cancelada: { label: 'Cancelada', cor: '#94a3b8', bg: '#f8fafc' },
};

const FORM_VAZIO = { placa: '', data: '', valor: '', descricao: '', motorista_id: '', obs: '' };

export default function FrotaAvariasPage() {
  const { userProfile } = useAuth();
  const { pode } = usePermissoes(userProfile?.id);
  const podeEditar = pode('frota', 'avarias:editar');

  const [avarias, setAvarias] = useState<Avaria[]>([]);
  const [veiculos, setVeiculos] = useState<{ placa: string; modelo: string | null }[]>([]);
  const [motoristas, setMotoristas] = useState<{ id: string; nome: string }[]>([]);
  const [erro, setErro] = useState('');
  const [soAbertas, setSoAbertas] = useState(true);
  const [busy, setBusy] = useState('');
  const [formAberto, setFormAberto] = useState(false);
  const [form, setForm] = useState({ ...FORM_VAZIO });
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch('/api/frota/avarias', { headers: await authHeaders() });
      const d = await r.json();
      if (!r.ok) { setErro(d.error || 'Falha ao carregar.'); return; }
      setAvarias(d.avarias || []);
    } catch (e) { setErro(String(e)); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  // seletores do formulário: placas (leitura direta, RLS libera autenticado)
  // e motoristas ativos (mesma API do seletor de responsável da Ficha)
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('frota_veiculos')
        .select('placa, modelo')
        .order('placa');
      setVeiculos((data || []).filter((v) => v.placa));
      try {
        const r = await fetch('/api/frota/motoristas', { headers: await authHeaders() });
        const d = await r.json();
        if (r.ok) setMotoristas((d.motoristas || []).map((m: { id: string; nome: string }) => ({ id: m.id, nome: m.nome })));
      } catch { /* seletor fica vazio; o campo é opcional */ }
    })();
  }, []);

  const salvar = async () => {
    const valor = Number(String(form.valor).replace(/\./g, '').replace(',', '.'));
    if (!form.placa) { alert('Escolha o veículo.'); return; }
    if (!form.data) { alert('Informe a data da avaria.'); return; }
    if (!form.descricao.trim()) { alert('Descreva a avaria.'); return; }
    if (!Number.isFinite(valor) || valor < 0) { alert('Valor inválido.'); return; }
    setSalvando(true);
    try {
      const r = await fetch('/api/frota/avarias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          placa: form.placa,
          data: form.data,
          valor,
          descricao: form.descricao.trim(),
          motorista_id: form.motorista_id || null,
          obs: form.obs.trim() || null,
        }),
      });
      const d = await r.json();
      if (!r.ok) { alert(d.error || 'Falha ao registrar.'); return; }
      setForm({ ...FORM_VAZIO });
      setFormAberto(false);
      await carregar();
    } finally { setSalvando(false); }
  };

  const mudarStatus = async (id: string, status: string) => {
    setBusy(id);
    try {
      const r = await fetch('/api/frota/avarias', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ id, status }),
      });
      if (!r.ok) { const d = await r.json(); alert(d.error || 'Falha ao atualizar.'); return; }
      await carregar();
    } finally { setBusy(''); }
  };

  const RESOLVIDAS = useMemo(() => new Set(['descontada', 'cobrada', 'absorvida', 'cancelada']), []);
  const visiveis = useMemo(
    () => avarias.filter((a) => !soAbertas || !RESOLVIDAS.has(a.status)),
    [avarias, soAbertas, RESOLVIDAS],
  );
  const totalAberto = avarias
    .filter((a) => !RESOLVIDAS.has(a.status))
    .reduce((s, a) => s + (Number(a.valor) || 0), 0);

  const inputStyle: React.CSSProperties = {
    padding: '8px 10px', borderRadius: 0, fontSize: 13,
    border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text)',
  };

  return (
    <div style={{ padding: '28px 40px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: 'var(--portal-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <CarFront size={20} color="#b45309" /> Avarias
        </h2>
        <span style={{ fontSize: 13.5, color: 'var(--portal-text)' }}>
          {visiveis.length} exibidas · <strong style={{ color: '#b45309' }}>{fmtRS(totalAberto)}</strong> em aberto
        </span>
        <div style={{ flex: 1 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, color: 'var(--portal-text)', cursor: 'pointer' }}>
          <input type="checkbox" checked={soAbertas} onChange={() => setSoAbertas((v) => !v)} /> só em aberto
        </label>
        <button
          onClick={() => (podeEditar ? setFormAberto((v) => !v) : alert(MSG_SEM_PERMISSAO))}
          title={podeEditar ? 'Registrar uma avaria/dano de veículo' : MSG_SEM_PERMISSAO}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700,
            color: '#fff', background: podeEditar ? '#1e40af' : '#94a3b8', border: 'none',
            borderRadius: 0, padding: '8px 14px', cursor: podeEditar ? 'pointer' : 'not-allowed',
          }}
        >
          {formAberto ? <X size={14} /> : <Plus size={14} />} {formAberto ? 'Fechar' : 'Registrar avaria'}
        </button>
      </div>

      <p style={{ fontSize: 13, color: 'var(--portal-text)', margin: '0 0 16px' }}>
        Dano causado por motorista (batida, mau uso, dano no pátio…). A cobrança acontece no RH:
        avaria <strong>aberta</strong> com motorista aparece na fila de Descontos e no Acerto do funcionário lá.
      </p>

      {formAberto && (
        <div style={{ background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 0, padding: 16, marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text)', marginBottom: 4 }}>VEÍCULO</div>
            <select value={form.placa} onChange={(e) => setForm((f) => ({ ...f, placa: e.target.value }))} style={{ ...inputStyle, minWidth: 180 }}>
              <option value="">Selecione…</option>
              {veiculos.map((v) => (
                <option key={v.placa} value={v.placa}>{formatarPlaca(v.placa)}{v.modelo ? ` — ${v.modelo}` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text)', marginBottom: 4 }}>DATA</div>
            <input type="date" value={form.data} onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text)', marginBottom: 4 }}>VALOR (R$)</div>
            <input value={form.valor} onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))} placeholder="0,00" style={{ ...inputStyle, width: 110 }} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text)', marginBottom: 4 }}>MOTORISTA RESPONSÁVEL</div>
            <select value={form.motorista_id} onChange={(e) => setForm((f) => ({ ...f, motorista_id: e.target.value }))} style={{ ...inputStyle, minWidth: 200 }}>
              <option value="">Sem responsável (por ora)</option>
              {motoristas.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text)', marginBottom: 4 }}>O QUE ACONTECEU</div>
            <input value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} placeholder="Ex.: bateu o para-choque na doca" style={{ ...inputStyle, width: '100%' }} />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text)', marginBottom: 4 }}>OBS (opcional)</div>
            <input value={form.obs} onChange={(e) => setForm((f) => ({ ...f, obs: e.target.value }))} placeholder="Orçamento, oficina…" style={{ ...inputStyle, width: '100%' }} />
          </div>
          <button
            onClick={salvar}
            disabled={salvando}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: '#fff', background: '#1e40af', border: 'none', borderRadius: 0, padding: '9px 16px', cursor: 'pointer' }}
          >
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Salvar
          </button>
        </div>
      )}

      {erro && <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 12 }}>{erro}</div>}
      {visiveis.length === 0 && !erro && (
        <div style={{ color: 'var(--portal-text)', fontSize: 13 }}>
          Nenhuma avaria {soAbertas ? 'em aberto' : 'registrada'}. 🎉
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {visiveis.map((a) => {
          const st = STATUS[a.status] || STATUS.aberta;
          return (
            <div key={a.id} style={{ background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 0, padding: '12px 16px', display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 90 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--portal-text)' }}>{formatarPlaca(a.placa)}</div>
                <div style={{ fontSize: 12.5, color: 'var(--portal-text)' }}>{fmtData(a.data)}</div>
              </div>
              <div style={{ flex: 2, minWidth: 220 }}>
                <div style={{ fontSize: 13, color: 'var(--portal-text)', fontWeight: 600 }}>{a.descricao}</div>
                <div style={{ fontSize: 13, color: 'var(--portal-text)', marginTop: 3 }}>
                  <strong>{a.motorista_nome || 'sem responsável'}</strong>
                  {a.criado_por && <span style={{ color: 'var(--portal-text)' }}> · registrada por {a.criado_por}</span>}
                </div>
                {a.obs && <div style={{ fontSize: 12.5, color: 'var(--portal-text)', marginTop: 2 }}>{a.obs}</div>}
              </div>
              <div style={{ textAlign: 'right', minWidth: 90 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#b45309' }}>{fmtRS(a.valor)}</div>
              </div>
              <div style={{ minWidth: 190 }}>
                <select
                  value={a.status}
                  disabled={!podeEditar || busy === a.id}
                  title={podeEditar ? 'Mudar o status (a baixa em folha é feita pelo RH)' : MSG_SEM_PERMISSAO}
                  onChange={(e) => mudarStatus(a.id, e.target.value)}
                  style={{
                    width: '100%', padding: '6px 8px', borderRadius: 0, fontSize: 13, fontWeight: 700,
                    border: `1px solid ${st.cor}33`, background: st.bg, color: st.cor,
                    cursor: podeEditar ? 'pointer' : 'not-allowed', opacity: podeEditar ? 1 : 0.6,
                  }}
                >
                  {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
