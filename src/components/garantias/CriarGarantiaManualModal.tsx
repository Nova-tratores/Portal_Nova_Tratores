'use client';
import { useEffect, useRef, useState } from 'react';
import { X, Search, Loader2, ShieldCheck, AlertTriangle, Check, ExternalLink } from 'lucide-react';

interface OSResultado {
  id_ordem: string;
  cliente: string;
  projeto: string;
  chassis: string;
  data: string;
  tipo_servico: string;
  tecnico: string;
  tecnico2: string;
  garantia_existente: { numero: string; status: string; ativa: boolean } | null;
  disponivel: boolean;
}

interface Props {
  userName: string;
  userId: string;
  onClose: () => void;
  onCriada: (garantiaId: string) => void;
}

const btnStyle = (bg: string, disabled?: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  gap: 6, padding: '9px 14px', borderRadius: 9, border: 'none',
  background: bg, color: '#fff', fontSize: 13, fontWeight: 600,
  cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.55 : 1,
});

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 9,
  border: '1px solid var(--portal-border)',
  background: 'var(--portal-bg-input)', color: 'var(--portal-text)',
  fontSize: 13, outline: 'none',
};

export default function CriarGarantiaManualModal({ userName, userId, onClose, onCriada }: Props) {
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState<OSResultado[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [selecionada, setSelecionada] = useState<OSResultado | null>(null);
  const [motivo, setMotivo] = useState('');
  const [incluirPecas, setIncluirPecas] = useState(true);
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (busca.trim().length < 2) {
      setResultados([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setCarregando(true);
      try {
        const res = await fetch(`/api/garantias/buscar-os?q=${encodeURIComponent(busca.trim())}`);
        const data = await res.json();
        setResultados(data.resultados || []);
      } catch {
        setResultados([]);
      } finally {
        setCarregando(false);
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [busca]);

  const criar = async () => {
    if (!selecionada) return;
    setCriando(true);
    setErro('');
    try {
      const res = await fetch('/api/garantias/criar-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_ordem: selecionada.id_ordem,
          garantista_nome: userName,
          garantista_user_id: userId,
          motivo: motivo.trim() || undefined,
          incluir_pecas_ppv: incluirPecas,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErro(data.error || 'Falha ao criar garantia.');
        return;
      }
      onCriada(data.garantia.id);
    } catch {
      setErro('Erro de conexão.');
    } finally {
      setCriando(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--portal-bg-card)', borderRadius: 18,
          maxWidth: 640, width: '100%', maxHeight: '90vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 22px', borderBottom: '1px solid var(--portal-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg,#dc2626,#7f1d1d)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ShieldCheck size={18} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--portal-text)' }}>
                Criar garantia manualmente
              </div>
              <div style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>
                Pra quando o técnico esqueceu de marcar a OS como garantia.
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 6, color: 'var(--portal-text-secondary)' }}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!selecionada ? (
            <>
              <div style={{ position: 'relative' }}>
                <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--portal-text-muted)' }} />
                <input
                  autoFocus
                  type="text"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar OS por número, cliente ou chassi…"
                  style={{ ...inputStyle, paddingLeft: 36 }}
                />
              </div>

              {carregando && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                  <Loader2 size={18} className="spin" color="var(--portal-text-muted)" />
                </div>
              )}

              {!carregando && busca.trim().length >= 2 && resultados.length === 0 && (
                <div style={{ textAlign: 'center', padding: 20, color: 'var(--portal-text-muted)', fontSize: 13 }}>
                  Nenhuma OS encontrada pra &quot;{busca}&quot;.
                </div>
              )}

              {resultados.map((r) => (
                <button
                  key={r.id_ordem}
                  type="button"
                  onClick={() => r.disponivel && setSelecionada(r)}
                  disabled={!r.disponivel}
                  style={{
                    textAlign: 'left', padding: '10px 12px', borderRadius: 10,
                    border: `1px solid ${r.disponivel ? 'var(--portal-border)' : '#fca5a5'}`,
                    background: r.disponivel ? 'var(--portal-bg-card)' : '#fef2f2',
                    cursor: r.disponivel ? 'pointer' : 'not-allowed',
                    display: 'flex', flexDirection: 'column', gap: 4,
                    opacity: r.disponivel ? 1 : 0.75,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <strong style={{ fontSize: 13, color: 'var(--portal-text)' }}>{r.id_ordem}</strong>
                    <span style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>{r.data ? new Date(r.data).toLocaleDateString('pt-BR') : ''}</span>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--portal-text-secondary)' }}>
                    {r.cliente || '—'}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>
                    {r.tipo_servico || '—'} · {r.chassis || 'sem chassi'} · {r.tecnico || r.tecnico2 || 'sem técnico'}
                  </span>
                  {r.garantia_existente && (
                    <span style={{
                      fontSize: 11, fontWeight: 700,
                      color: r.garantia_existente.ativa ? '#b91c1c' : '#15803d',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      <AlertTriangle size={11} />
                      {r.garantia_existente.ativa
                        ? `Já tem garantia ativa (${r.garantia_existente.numero})`
                        : `Já teve garantia finalizada (${r.garantia_existente.numero})`}
                    </span>
                  )}
                </button>
              ))}
            </>
          ) : (
            <>
              <div style={{
                padding: 12, borderRadius: 10, border: '1px solid var(--portal-border)',
                background: 'var(--portal-bg-secondary)', display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <strong style={{ fontSize: 14, color: 'var(--portal-text)' }}>{selecionada.id_ordem}</strong>
                    <div style={{ fontSize: 12, color: 'var(--portal-text-secondary)' }}>{selecionada.cliente}</div>
                  </div>
                  <button onClick={() => setSelecionada(null)} style={{ background: 'transparent', border: '1px solid var(--portal-border)', borderRadius: 8, fontSize: 11, padding: '4px 8px', color: 'var(--portal-text-secondary)', cursor: 'pointer' }}>
                    Trocar OS
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', fontSize: 12, color: 'var(--portal-text-secondary)' }}>
                  <span>Chassi: <strong>{selecionada.chassis || '—'}</strong></span>
                  <span>Modelo: <strong>{selecionada.projeto || '—'}</strong></span>
                  <span>Técnico: <strong>{selecionada.tecnico || selecionada.tecnico2 || '—'}</strong></span>
                  <span>Tipo: <strong>{selecionada.tipo_servico || '—'}</strong></span>
                </div>
                <a
                  href={`/pos?id=${selecionada.id_ordem}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#0ea5e9', fontWeight: 600 }}
                >
                  <ExternalLink size={13} /> Ver OS no Pós-Vendas
                </a>
              </div>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--portal-text-secondary)' }}>
                  Motivo (opcional)
                </span>
                <textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex: técnico esqueceu de marcar; cliente reclamou depois do ciclo; etc."
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                />
                <span style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>
                  Fica gravado na timeline e na observação do garantista.
                </span>
              </label>

              <label style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 12px', borderRadius: 10,
                background: incluirPecas ? '#f0fdf4' : 'var(--portal-bg-card)',
                border: `1px solid ${incluirPecas ? '#86efac' : 'var(--portal-border)'}`,
                cursor: 'pointer',
              }}>
                <input
                  type="checkbox"
                  checked={incluirPecas}
                  onChange={(e) => setIncluirPecas(e.target.checked)}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--portal-text)' }}>
                    Importar peças do PPV automaticamente
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>
                    Busca as peças vinculadas à OS via movimentações. Você ajusta depois no checklist.
                  </div>
                </div>
              </label>

              {erro && (
                <div style={{ padding: 10, borderRadius: 8, background: '#fef2f2', color: '#b91c1c', fontSize: 12 }}>
                  {erro}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {selecionada && (
          <div style={{ padding: '14px 22px', borderTop: '1px solid var(--portal-border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={onClose} disabled={criando} style={{ ...btnStyle('transparent', criando), color: 'var(--portal-text-secondary)', border: '1px solid var(--portal-border)' }}>
              Cancelar
            </button>
            <button onClick={criar} disabled={criando} style={btnStyle('linear-gradient(135deg,#dc2626,#7f1d1d)', criando)}>
              {criando ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
              Criar garantia
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
