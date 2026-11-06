'use client';
import { useState } from 'react';
import { Loader2, RotateCcw, XCircle } from 'lucide-react';
import { fetchAuth } from '@/lib/auth/client';
import { STATUS_LABEL } from '@/lib/garantias/constants';
import { fmtDataHora } from '@/lib/garantias/format';
import { MOTIVOS_CANCELAMENTO, ultimoCancelamento, type MotivoCancelamento } from '@/lib/garantias/cancelamento';
import type { GarantiaDetalhe, GarantiaStatus } from '@/lib/garantias/types';

// Cancelar por teste / engano / outro motivo (qualquer status, até aprovada)
// e o aviso "cancelada" com Desfazer. Duplicação fica no bloco próprio do drawer.

const botao = (cor: string, off = false): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 6, minHeight: 36, padding: '6px 13px', borderRadius: 8,
  border: 'none', background: off ? '#cbd5e1' : cor, color: '#fefefe', fontSize: 12, fontWeight: 700,
  cursor: off ? 'not-allowed' : 'pointer',
});
const sec: React.CSSProperties = {
  padding: '7px 13px', borderRadius: 8, border: '1px solid var(--portal-border)', background: 'transparent',
  color: 'var(--portal-text)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
};

async function enviar(id: string, corpo: Record<string, unknown>) {
  const r = await fetchAuth(`/api/garantias/${id}/cancelar`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Não foi possível concluir.');
}

export function CancelarPorMotivo({ g, onFeito }: { g: GarantiaDetalhe; onFeito: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState<MotivoCancelamento | ''>('');
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const finalizada = g.status === 'aprovada' || g.status === 'rejeitada';
  const falta = !motivo || (motivo === 'outro' && obs.trim().length < 5);

  const cancelar = async () => {
    if (falta) return;
    const aviso = finalizada
      ? `A ${g.numero} está ${STATUS_LABEL[g.status as GarantiaStatus].toLowerCase()}. Cancelada, ela sai do relatório e dos totais (o valor pago deixa de contar).\n\nCancelar mesmo assim?`
      : `Cancelar a ${g.numero}? Ela sai do quadro e vai para Finalizadas como cancelada.`;
    if (!confirm(aviso)) return;
    setSalvando(true);
    setErro('');
    try {
      await enviar(g.id, { motivo, obs });
      setAberto(false);
      onFeito();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro');
    } finally {
      setSalvando(false);
    }
  };

  if (!aberto) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--portal-text-muted)', flex: 1, minWidth: 220, lineHeight: 1.5 }}>
          Garantia criada <b>só para teste</b> ou <b>aberta por engano</b>? Cancele com o motivo. Dá para desfazer depois.
        </span>
        <button onClick={() => setAberto(true)} style={botao('#64748b')}>
          <XCircle size={14} /> Cancelar por outro motivo…
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {MOTIVOS_CANCELAMENTO.map((m) => (
          <button key={m.id} onClick={() => setMotivo(m.id)}
            style={{ ...sec, minHeight: 36, borderColor: motivo === m.id ? '#64748b' : 'var(--portal-border)', background: motivo === m.id ? '#64748b' : 'transparent', color: motivo === m.id ? '#fefefe' : 'var(--portal-text)' }}>
            {m.label}
          </button>
        ))}
      </div>
      <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} maxLength={500}
        placeholder={motivo === 'outro' ? 'Explique o motivo (obrigatório)' : 'Observação (opcional)'}
        style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text)', fontSize: 13, resize: 'vertical' }} />
      {finalizada && (
        <span style={{ fontSize: 12, color: '#b45309', lineHeight: 1.5 }}>
          Esta garantia já está {STATUS_LABEL[g.status as GarantiaStatus].toLowerCase()}: cancelada, o valor dela deixa de contar no relatório e nos totais.
        </span>
      )}
      {erro && <span style={{ fontSize: 12, color: '#dc2626' }}>{erro}</span>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={() => { setAberto(false); setMotivo(''); setObs(''); setErro(''); }} style={sec}>Voltar</button>
        <button onClick={cancelar} disabled={salvando || falta} style={botao('#64748b', salvando || falta)}>
          {salvando ? <Loader2 size={15} className="spin" /> : <XCircle size={15} />} Cancelar garantia
        </button>
      </div>
    </div>
  );
}

export function AvisoCancelada({ g, podeDesfazer, onFeito }: { g: GarantiaDetalhe; podeDesfazer: boolean; onFeito: () => void }) {
  const ev = ultimoCancelamento(g.eventos || []);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const antes = ev?.status_anterior ? STATUS_LABEL[ev.status_anterior as GarantiaStatus] : null;

  const desfazer = async () => {
    if (!confirm(`Desfazer o cancelamento da ${g.numero}? Ela volta para "${antes || 'Em análise'}".`)) return;
    setSalvando(true);
    setErro('');
    try {
      await enviar(g.id, { acao: 'desfazer' });
      onFeito();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div style={{ fontSize: 13, color: 'var(--portal-text)', background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)', borderRadius: 8, padding: '10px 12px', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div>
        <b>{ev?.detalhe?.replace(/^Cancelada — /, '') || 'Cancelada'}</b>
        {g.cancelada_em ? ` · em ${fmtDataHora(g.cancelada_em)}` : ''}
        {ev?.ator ? ` · por ${ev.ator}` : ''}
        {antes ? <> · antes estava <b>{antes}</b></> : null}
      </div>
      <div style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>Não aparece no quadro, no relatório nem nos totais.</div>
      {erro && <span style={{ fontSize: 12, color: '#dc2626' }}>{erro}</span>}
      {podeDesfazer && (
        <div>
          <button onClick={desfazer} disabled={salvando} style={{ ...sec, display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36 }}>
            {salvando ? <Loader2 size={14} className="spin" /> : <RotateCcw size={14} />} Desfazer cancelamento
          </button>
        </div>
      )}
    </div>
  );
}
