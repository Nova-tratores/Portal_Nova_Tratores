'use client';
// Frota > Multas — todas as multas da frota, com QUEM estava com o carro na
// data (uso diário > responsável fixo > Rota Exata) e o fluxo interno
// (análise/defesa/paga/descontada). A lista abre na hora com o espelho local
// e um sync com a Rota Exata roda em segundo plano ao abrir a aba (trava de
// 10 min na rota /multas/atualizar) — recarrega sozinha quando termina.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ShieldAlert, AlertTriangle, MapPin, ExternalLink, Paperclip, Loader2, Camera, Plus, X } from 'lucide-react';
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

interface VeiculoOpcao { id: string; placa: string; placa_exibicao?: string | null; modelo?: string | null; ativo?: boolean }

const inputNM: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 13,
  border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)',
  color: 'var(--portal-text)', outline: 'none',
};

// Modal de multa MANUAL (notificação que chegou por correio etc. — fora da
// Rota Exata). O responsável NA DATA é resolvido sozinho pelo servidor
// (uso diário > fixo), igual às sincronizadas.
function NovaMultaModal({ onClose, onCriada }: { onClose: () => void; onCriada: () => void }) {
  const [veiculos, setVeiculos] = useState<VeiculoOpcao[] | null>(null);
  const [form, setForm] = useState({
    veiculo_id: '', dt_multa: '', descricao: '', valor: '', pontos: '',
    numero_auto: '', dt_vencimento: '', local_endereco: '', obs_interna: '',
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/frota/veiculos', { headers: await authHeaders() });
        const d = await r.json();
        if (r.ok) setVeiculos(((d.veiculos || []) as VeiculoOpcao[]).filter((v) => v.ativo !== false));
        else setVeiculos([]);
      } catch { setVeiculos([]); }
    })();
  }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const salvar = async () => {
    setErro('');
    if (!form.veiculo_id) { setErro('Selecione o veículo.'); return; }
    if (!form.dt_multa) { setErro('Informe a data da infração.'); return; }
    if (!form.descricao.trim()) { setErro('Descreva a infração.'); return; }
    setSalvando(true);
    try {
      const r = await fetch('/api/frota/multas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) { setErro(d.error || 'Falha ao cadastrar a multa.'); return; }
      onCriada();
    } catch { setErro('Erro de conexão.'); }
    finally { setSalvando(false); }
  };

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div style={{ background: 'var(--portal-bg-card)', borderRadius: 14, width: '100%', maxWidth: 540, maxHeight: '90vh', overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--portal-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <ShieldAlert size={16} color="#b91c1c" /> Nova multa (manual)
          </h3>
          <button onClick={onClose} aria-label="Fechar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--portal-text-muted)' }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>
          Pra multa que não veio pela Rota Exata (notificação por correio, órgão local…). Quem estava com o
          carro na data é atribuído automaticamente, e o auto de infração pode ser anexado depois no card.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, fontWeight: 700, color: 'var(--portal-text-muted)' }}>
            Veículo *
            <select value={form.veiculo_id} onChange={set('veiculo_id')} style={inputNM}>
              <option value="">{veiculos == null ? 'Carregando…' : 'Selecione…'}</option>
              {(veiculos || []).map((v) => (
                <option key={v.id} value={v.id}>
                  {formatarPlaca(v.placa_exibicao || v.placa)}{v.modelo ? ` · ${v.modelo}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, fontWeight: 700, color: 'var(--portal-text-muted)' }}>
            Data da infração *
            <input type="date" value={form.dt_multa} onChange={set('dt_multa')} style={inputNM} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, fontWeight: 700, color: 'var(--portal-text-muted)' }}>
            Vencimento
            <input type="date" value={form.dt_vencimento} onChange={set('dt_vencimento')} style={inputNM} />
          </label>
          <label style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, fontWeight: 700, color: 'var(--portal-text-muted)' }}>
            Infração *
            <input value={form.descricao} onChange={set('descricao')} placeholder="Ex.: Excesso de velocidade até 20%" style={inputNM} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, fontWeight: 700, color: 'var(--portal-text-muted)' }}>
            Valor (R$)
            <input type="number" min={0} step="0.01" value={form.valor} onChange={set('valor')} placeholder="0,00" style={inputNM} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, fontWeight: 700, color: 'var(--portal-text-muted)' }}>
            Pontos
            <input type="number" min={0} step={1} value={form.pontos} onChange={set('pontos')} placeholder="0" style={inputNM} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, fontWeight: 700, color: 'var(--portal-text-muted)' }}>
            Nº do auto de infração
            <input value={form.numero_auto} onChange={set('numero_auto')} style={inputNM} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, fontWeight: 700, color: 'var(--portal-text-muted)' }}>
            Local
            <input value={form.local_endereco} onChange={set('local_endereco')} placeholder="Endereço/rodovia" style={inputNM} />
          </label>
          <label style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, fontWeight: 700, color: 'var(--portal-text-muted)' }}>
            Observação interna
            <input value={form.obs_interna} onChange={set('obs_interna')} style={inputNM} />
          </label>
        </div>

        {erro && <div style={{ fontSize: 12, color: '#b91c1c' }}>{erro}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--portal-border)', background: 'none', color: 'var(--portal-text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={salvando}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#b91c1c,#7f1d1d)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: salvando ? 'default' : 'pointer', opacity: salvando ? 0.6 : 1 }}
          >
            {salvando ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Cadastrar multa
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const [sincronizando, setSincronizando] = useState(false);
  const [novaMulta, setNovaMulta] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch('/api/frota/multas', { headers: await authHeaders() });
      const d = await r.json();
      if (!r.ok) { setErro(d.error || 'Falha ao carregar.'); return; }
      setMultas(d.multas || []);
    } catch (e) { setErro(String(e)); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  // Ao abrir a aba: puxa da Rota Exata em segundo plano (a rota ignora se o
  // último sync tem menos de 10 min) e recarrega a lista se veio coisa nova.
  const sincronizouRef = useRef(false);
  useEffect(() => {
    if (sincronizouRef.current) return;
    sincronizouRef.current = true;
    (async () => {
      setSincronizando(true);
      try {
        const r = await fetch('/api/frota/multas/atualizar', { method: 'POST', headers: await authHeaders() });
        const d = await r.json().catch(() => ({}));
        if (r.ok && d.sincronizou) await carregar();
      } catch { /* sem rede/timeout: a aba segue com o espelho local */ }
      finally { setSincronizando(false); }
    })();
  }, [carregar]);

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
        {sincronizando && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--portal-text-muted)' }}>
            <Loader2 size={13} className="animate-spin" /> sincronizando com a Rota Exata…
          </span>
        )}
        <div style={{ flex: 1 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--portal-text-secondary)', cursor: 'pointer' }}>
          <input type="checkbox" checked={soAbertas} onChange={() => setSoAbertas((v) => !v)} /> só em aberto
        </label>
        {podeEditar && (
          <button
            onClick={() => setNovaMulta(true)}
            title="Cadastrar multa que não veio pela Rota Exata (notificação por correio etc.)"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#b91c1c,#7f1d1d)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
          >
            <Plus size={14} /> Nova multa
          </button>
        )}
      </div>

      {novaMulta && (
        <NovaMultaModal
          onClose={() => setNovaMulta(false)}
          onCriada={() => { setNovaMulta(false); carregar(); }}
        />
      )}

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
                  {m.origem === 'manual' && (
                    <span title="Cadastrada manualmente no portal (não veio da Rota Exata)" style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, color: '#64748b', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 999, padding: '1px 7px', verticalAlign: '1px' }}>
                      manual
                    </span>
                  )}
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
