'use client';
// Frota > Multas — todas as multas da frota, com QUEM estava com o carro na
// data (uso diário > responsável fixo > Rota Exata) e o fluxo interno
// (análise/defesa/paga/descontada). Espelho local — nada de API externa aqui.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ShieldAlert, AlertTriangle, MapPin, ExternalLink, Paperclip, Loader2, Camera } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { authHeaders } from '@/lib/auth/client';
import { formatarPlaca } from '@/lib/frota/placa';
import { MSG_SEM_PERMISSAO } from '@/lib/permissoes/ui';
import type { Multa } from '@/lib/frota/tipos';

const fmtRS = (v: number | null) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const fmtData = (s: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR') : '—');

const STATUS: Record<string, { label: string; cor: string; bg: string }> = {
  nova: { label: 'Nova', cor: '#b45309', bg: '#fef3c7' },
  em_analise: { label: 'Em análise', cor: '#1d4ed8', bg: '#dbeafe' },
  em_defesa: { label: 'Em defesa', cor: '#7c3aed', bg: '#ede9fe' },
  paga: { label: 'Paga', cor: '#15803d', bg: '#dcfce7' },
  descontada: { label: 'Descontada em folha', cor: '#0f766e', bg: '#ccfbf1' },
  arquivada: { label: 'Arquivada', cor: '#64748b', bg: '#f1f5f9' },
};
const FONTE_LABEL: Record<string, string> = {
  uso_diario: 'marcou o carro no dia',
  responsavel_fixo: 'responsável fixo',
  rotaexata: 'carimbado pela Rota Exata',
};

// as imagens que a Rota Exata carimba vêm em formatos variados — extrai URLs
function urlsImagensRE(imagens: unknown): string[] {
  if (!Array.isArray(imagens)) return [];
  return imagens
    .map((i: any) => (typeof i === 'string' ? i : i?.url || i?.imagem || i?.link || ''))
    .filter((u: string) => /^https?:\/\//.test(u));
}

export default function FrotaMultasPage() {
  const { userProfile } = useAuth();
  const { pode } = usePermissoes(userProfile?.id);
  const podeEditar = pode('frota', 'multas:editar');

  const [multas, setMultas] = useState<Multa[]>([]);
  const [erro, setErro] = useState('');
  const [soAbertas, setSoAbertas] = useState(true);
  const [busy, setBusy] = useState('');

  const carregar = useCallback(async () => {
    try {
      const r = await fetch('/api/frota/multas', { headers: await authHeaders() });
      const d = await r.json();
      if (!r.ok) { setErro(d.error || 'Falha ao carregar.'); return; }
      setMultas(d.multas || []);
    } catch (e) { setErro(String(e)); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const mudarStatus = async (id: string, status: string) => {
    setBusy(id);
    try {
      const r = await fetch('/api/frota/multas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ id, status_interno: status }),
      });
      if (!r.ok) { const d = await r.json(); alert(d.error || 'Falha ao atualizar.'); return; }
      await carregar();
    } finally { setBusy(''); }
  };

  // anexos (auto de infração, boleto, comprovante, defesa...)
  const fileRef = useRef<HTMLInputElement>(null);
  const [multaAnexando, setMultaAnexando] = useState<string | null>(null);

  const anexar = async (multaId: string, file: File | null) => {
    if (!file) return;
    setBusy(`anexo-${multaId}`);
    try {
      const fd = new FormData();
      fd.set('multa_id', multaId);
      fd.set('file', file);
      const r = await fetch('/api/frota/multas/anexos', { method: 'POST', headers: await authHeaders(), body: fd });
      const d = await r.json();
      if (!r.ok) { alert(d.error || 'Falha ao anexar.'); return; }
      await carregar();
    } finally { setBusy(''); setMultaAnexando(null); }
  };

  const removerAnexo = async (multaId: string, url: string, nome: string) => {
    if (!confirm(`Remover o anexo "${nome}"?`)) return;
    setBusy(`anexo-${multaId}`);
    try {
      const r = await fetch(`/api/frota/multas/anexos?multa_id=${encodeURIComponent(multaId)}&url=${encodeURIComponent(url)}`, {
        method: 'DELETE', headers: await authHeaders(),
      });
      if (!r.ok) { const d = await r.json(); alert(d.error || 'Falha ao remover.'); return; }
      await carregar();
    } finally { setBusy(''); }
  };

  const visiveis = useMemo(
    () => multas.filter((m) => !soAbertas || !['paga', 'descontada', 'arquivada'].includes(m.status_interno)),
    [multas, soAbertas],
  );
  const totalAberto = multas
    .filter((m) => !['paga', 'descontada', 'arquivada'].includes(m.status_interno))
    .reduce((s, m) => s + (Number(m.valor) || 0), 0);

  return (
    <div style={{ padding: '28px 40px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: 'var(--portal-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldAlert size={20} color="#b91c1c" /> Multas
        </h2>
        <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted)' }}>
          {visiveis.length} exibidas · <strong style={{ color: '#b91c1c' }}>{fmtRS(totalAberto)}</strong> em aberto
        </span>
        <div style={{ flex: 1 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--portal-text-secondary)', cursor: 'pointer' }}>
          <input type="checkbox" checked={soAbertas} onChange={() => setSoAbertas((v) => !v)} /> só em aberto
        </label>
      </div>

      {/* input único e escondido — o botão "anexar" de cada multa aponta pra cá */}
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          if (multaAnexando) anexar(multaAnexando, e.target.files?.[0] || null);
          e.target.value = '';
        }}
      />

      {erro && <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 12 }}>{erro}</div>}
      {visiveis.length === 0 && !erro && (
        <div style={{ color: 'var(--portal-text-muted)', fontSize: 13 }}>Nenhuma multa {soAbertas ? 'em aberto' : 'registrada'}. 🎉</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {visiveis.map((m) => {
          const st = STATUS[m.status_interno] || STATUS.nova;
          return (
            <div key={m.id} style={{ background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 12, padding: '12px 16px', display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 90 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--portal-text)' }}>{formatarPlaca(m.placa)}</div>
                <div style={{ fontSize: 11.5, color: 'var(--portal-text-muted)' }}>{fmtData(m.dt_multa)}</div>
              </div>

              <div style={{ flex: 2, minWidth: 220 }}>
                <div style={{ fontSize: 13, color: 'var(--portal-text)', fontWeight: 600 }}>
                  {m.descricao || 'Infração'}
                  {m.numero_auto && <span style={{ color: 'var(--portal-text-muted)', fontWeight: 400 }}> · auto {m.numero_auto}</span>}
                </div>
                {m.local_endereco && (
                  <a
                    href={m.local_lat && m.local_lng ? `https://www.google.com/maps?q=${m.local_lat},${m.local_lng}` : undefined}
                    target="_blank" rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--portal-text-muted)', textDecoration: 'none' }}
                  >
                    <MapPin size={11} /> {m.local_endereco} {m.local_lat && <ExternalLink size={10} />}
                  </a>
                )}
                <div style={{ fontSize: 12, color: 'var(--portal-text-secondary)', marginTop: 3 }}>
                  <strong>{m.atribuido_a || 'não identificado'}</strong>
                  {m.atribuido_fonte && <span style={{ color: 'var(--portal-text-muted)' }}> ({FONTE_LABEL[m.atribuido_fonte]})</span>}
                  {m.motorista_divergente && (
                    <span title="O motorista carimbado pela Rota Exata difere do responsável vigente na data — confira antes de descontar" style={{ color: '#b45309', marginLeft: 6 }}>
                      <AlertTriangle size={11} style={{ verticalAlign: '-2px' }} /> divergência
                    </span>
                  )}
                </div>

                {/* Anexos: fotos da Rota Exata + arquivos do portal (auto, boleto, comprovante...) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  {urlsImagensRE(m.imagens).map((u, i) => (
                    <a key={`re-${i}`} href={u} target="_blank" rel="noopener noreferrer" title="Imagem carimbada pela Rota Exata"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, color: '#0d9488', background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 999, padding: '2px 8px', textDecoration: 'none' }}>
                      <Camera size={10} /> foto {i + 1}
                    </a>
                  ))}
                  {(m.anexos || []).map((a) => (
                    <span key={a.url} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: 'var(--portal-text-secondary)', background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)', borderRadius: 999, padding: '2px 8px' }}>
                      <a href={a.url} target="_blank" rel="noopener noreferrer" title={`${a.nome}${a.por ? ` · ${a.por}` : ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'inherit', textDecoration: 'none', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <Paperclip size={10} /> {a.nome}
                      </a>
                      {podeEditar && (
                        <button onClick={() => removerAnexo(m.id, a.url, a.nome)} title="Remover anexo" style={{ background: 'none', border: 'none', color: '#b91c1c', cursor: 'pointer', fontSize: 11, padding: 0, lineHeight: 1 }}>×</button>
                      )}
                    </span>
                  ))}
                  {podeEditar && (
                    <button
                      onClick={() => { setMultaAnexando(m.id); fileRef.current?.click(); }}
                      disabled={busy === `anexo-${m.id}`}
                      title="Anexar arquivo (auto de infração, boleto, comprovante, defesa…)"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700, color: '#0d9488', background: 'transparent', border: '1px dashed #0d948866', borderRadius: 999, padding: '2px 8px', cursor: 'pointer' }}
                    >
                      {busy === `anexo-${m.id}` ? <Loader2 size={10} className="spin" /> : <Paperclip size={10} />} anexar
                    </button>
                  )}
                </div>
              </div>

              <div style={{ textAlign: 'right', minWidth: 90 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#b91c1c' }}>{fmtRS(m.valor)}</div>
                <div style={{ fontSize: 11.5, color: 'var(--portal-text-muted)' }}>{m.pontos ?? 0} pts · {m.nivel_infracao || '—'}</div>
                {m.dt_vencimento && <div style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>vence {fmtData(m.dt_vencimento)}</div>}
              </div>

              <div style={{ minWidth: 150 }}>
                <select
                  value={m.status_interno}
                  disabled={!podeEditar || busy === m.id}
                  title={podeEditar ? 'Mudar o status interno' : MSG_SEM_PERMISSAO}
                  onChange={(e) => mudarStatus(m.id, e.target.value)}
                  style={{
                    width: '100%', padding: '6px 8px', borderRadius: 8, fontSize: 12, fontWeight: 700,
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
