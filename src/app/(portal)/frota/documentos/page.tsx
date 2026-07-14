'use client';
// Frota > Documentos — CRLV, apólice, IPVA, licenciamento e laudos POR VEÍCULO,
// com o preview INLINE (a página 1 do PDF vira miniatura; clique = leitura sem
// baixar nada) e semáforo de validade.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Plus, Trash2, Loader2, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { authHeaders } from '@/lib/auth/client';
import { formatarPlaca } from '@/lib/frota/placa';
import { MSG_SEM_PERMISSAO } from '@/lib/permissoes/ui';
import DocumentoInline from '@/components/frota/DocumentoInline';

const TIPOS: Record<string, string> = {
  crlv: 'CRLV', seguro: 'Seguro', ipva: 'IPVA', licenciamento: 'Licenciamento',
  contrato_locacao: 'Contrato de locação', laudo: 'Laudo', outros: 'Outros',
};
const fmtData = (s: string | null) => (s ? new Date(`${s}T00:00:00`).toLocaleDateString('pt-BR') : null);

interface Doc {
  id: string; veiculo_id: string; tipo: string; numero: string | null;
  emissor: string | null; vigencia_inicio: string | null; vigencia_fim: string | null;
  valor: number | null; arquivo_url: string | null; nome_arquivo: string | null;
  obs: string | null;
}
interface Veic { id: string; placa: string; placa_exibicao: string | null; modelo: string | null; descricao: string | null; tipo_registro: string; ativo: boolean }

function Validade({ fim }: { fim: string | null }) {
  if (!fim) return <span style={{ fontSize: 10.5, color: 'var(--portal-text-muted)' }}>sem vigência</span>;
  const dias = Math.floor((new Date(`${fim}T00:00:00`).getTime() - Date.now()) / 86400_000);
  const [cor, bg, txt] =
    dias < 0 ? ['#b91c1c', '#fee2e2', `venceu ${fmtData(fim)}`]
    : dias <= 30 ? ['#b45309', '#fef3c7', `vence em ${dias}d`]
    : ['#15803d', '#dcfce7', `válido até ${fmtData(fim)}`];
  return <span style={{ fontSize: 10.5, fontWeight: 700, color: cor, background: bg, borderRadius: 999, padding: '2px 8px' }}>{txt}</span>;
}

export default function FrotaDocumentosPage() {
  const { userProfile } = useAuth();
  const { pode } = usePermissoes(userProfile?.id);
  const podeEditar = pode('frota', 'documentos:editar');

  const [docs, setDocs] = useState<Doc[]>([]);
  const [veiculos, setVeiculos] = useState<Veic[]>([]);
  const [erro, setErro] = useState('');
  const [modal, setModal] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [form, setForm] = useState({ veiculo_id: '', tipo: 'crlv', numero: '', emissor: '', vigencia_inicio: '', vigencia_fim: '', obs: '' });
  const [arquivo, setArquivo] = useState<File | null>(null);

  const carregar = useCallback(async () => {
    try {
      const h = await authHeaders();
      const [rd, rv] = await Promise.all([
        fetch('/api/frota/documentos', { headers: h }),
        fetch('/api/frota/veiculos', { headers: h }),
      ]);
      const dd = await rd.json();
      const dv = await rv.json();
      if (!rd.ok) { setErro(dd.error || 'Falha ao carregar.'); return; }
      setDocs(dd.documentos || []);
      setVeiculos((dv.veiculos || []).filter((v: Veic) => v.tipo_registro === 'veiculo'));
    } catch (e) { setErro(String(e)); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const porVeiculo = useMemo(() => {
    const m = new Map<string, Doc[]>();
    for (const d of docs) {
      const l = m.get(d.veiculo_id) || [];
      l.push(d);
      m.set(d.veiculo_id, l);
    }
    return m;
  }, [docs]);

  const enviar = async () => {
    if (!form.veiculo_id) { alert('Escolha o veículo.'); return; }
    setEnviando(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.set(k, v));
      if (arquivo) fd.set('file', arquivo);
      const r = await fetch('/api/frota/documentos', { method: 'POST', headers: await authHeaders(), body: fd });
      const d = await r.json();
      if (!r.ok) { alert(d.error || 'Falha ao enviar.'); return; }
      setModal(false);
      setArquivo(null);
      setForm({ veiculo_id: '', tipo: 'crlv', numero: '', emissor: '', vigencia_inicio: '', vigencia_fim: '', obs: '' });
      await carregar();
    } finally { setEnviando(false); }
  };

  const excluir = async (d: Doc) => {
    if (!confirm(`Excluir o ${TIPOS[d.tipo] || d.tipo}${d.nome_arquivo ? ` (${d.nome_arquivo})` : ''}?`)) return;
    const r = await fetch(`/api/frota/documentos?id=${d.id}`, { method: 'DELETE', headers: await authHeaders() });
    if (!r.ok) { const x = await r.json(); alert(x.error || 'Falha ao excluir.'); return; }
    await carregar();
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 13,
    border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text)',
  };
  const veiculosComDocs = veiculos.filter((v) => (porVeiculo.get(v.id) || []).length > 0);

  return (
    <div style={{ padding: '28px 40px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: 'var(--portal-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileText size={20} color="#0d9488" /> Documentos
        </h2>
        <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted)' }}>{docs.length} documentos · clique na miniatura pra ler sem baixar</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setModal(true)}
          disabled={!podeEditar}
          title={podeEditar ? 'Adicionar documento' : MSG_SEM_PERMISSAO}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#0D9488,#0F766E)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: podeEditar ? 'pointer' : 'not-allowed', opacity: podeEditar ? 1 : 0.5 }}
        >
          <Plus size={14} /> Novo documento
        </button>
      </div>

      {erro && <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 10 }}>{erro}</div>}
      {docs.length === 0 && !erro && (
        <div style={{ color: 'var(--portal-text-muted)', fontSize: 13 }}>
          Nenhum documento ainda. Suba o CRLV, a apólice e o IPVA de cada carro — os vencimentos passam a aparecer aqui e na Visão geral.
        </div>
      )}

      {veiculosComDocs.map((v) => (
        <div key={v.id} style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--portal-text)', marginBottom: 8 }}>
            {formatarPlaca(v.placa)}
            <span style={{ fontWeight: 500, color: 'var(--portal-text-muted)', fontSize: 12.5 }}> · {v.modelo || v.descricao || ''}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>
            {(porVeiculo.get(v.id) || []).map((d) => (
              <div key={d.id} style={{ background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {d.arquivo_url ? (
                  <DocumentoInline url={d.arquivo_url} nome={d.nome_arquivo} />
                ) : (
                  <div style={{ height: 120, borderRadius: 8, background: 'var(--portal-bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--portal-text-muted)', fontSize: 11.5 }}>
                    sem arquivo
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <strong style={{ fontSize: 12.5, color: 'var(--portal-text)' }}>{TIPOS[d.tipo] || d.tipo}</strong>
                  <Validade fim={d.vigencia_fim} />
                </div>
                {(d.numero || d.emissor) && (
                  <span style={{ fontSize: 11.5, color: 'var(--portal-text-secondary)' }}>
                    {[d.numero, d.emissor].filter(Boolean).join(' · ')}
                  </span>
                )}
                {podeEditar && (
                  <button onClick={() => excluir(d)} title="Excluir" style={{ alignSelf: 'flex-end', background: 'none', border: 'none', color: '#b91c1c', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                    <Trash2 size={12} /> excluir
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {modal && (
        <div onClick={() => setModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--portal-bg)', borderRadius: 16, padding: 22, width: 'min(480px, 100%)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 16, color: 'var(--portal-text)' }}>Novo documento</strong>
              <button onClick={() => setModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--portal-text-muted)' }}><X size={18} /></button>
            </div>
            <select value={form.veiculo_id} onChange={(e) => setForm((f) => ({ ...f, veiculo_id: e.target.value }))} style={inputStyle}>
              <option value="">— veículo —</option>
              {veiculos.filter((v) => v.ativo).map((v) => (
                <option key={v.id} value={v.id}>{formatarPlaca(v.placa)} · {v.modelo || v.descricao || ''}</option>
              ))}
            </select>
            <select value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))} style={inputStyle}>
              {Object.entries(TIPOS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <input type="file" accept=".pdf,image/*" onChange={(e) => setArquivo(e.target.files?.[0] || null)} style={inputStyle} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input placeholder="Número (apólice/CRLV)" value={form.numero} onChange={(e) => setForm((f) => ({ ...f, numero: e.target.value }))} style={inputStyle} />
              <input placeholder="Emissor (seguradora/Detran)" value={form.emissor} onChange={(e) => setForm((f) => ({ ...f, emissor: e.target.value }))} style={inputStyle} />
              <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', display: 'flex', flexDirection: 'column', gap: 2 }}>
                Início da vigência
                <input type="date" value={form.vigencia_inicio} onChange={(e) => setForm((f) => ({ ...f, vigencia_inicio: e.target.value }))} style={inputStyle} />
              </label>
              <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', display: 'flex', flexDirection: 'column', gap: 2 }}>
                Fim da vigência (alerta)
                <input type="date" value={form.vigencia_fim} onChange={(e) => setForm((f) => ({ ...f, vigencia_fim: e.target.value }))} style={inputStyle} />
              </label>
            </div>
            <input placeholder="Observações (opcional)" value={form.obs} onChange={(e) => setForm((f) => ({ ...f, obs: e.target.value }))} style={inputStyle} />
            <button onClick={enviar} disabled={enviando} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 14px', borderRadius: 8, border: 'none', background: '#0d9488', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
              {enviando ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Salvar documento
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
