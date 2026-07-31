'use client';
import { useState } from 'react';
import { PackageOpen, Loader2, CheckCircle2, Truck, CalendarClock } from 'lucide-react';
import type { GarantiaDetalhe } from '@/lib/garantias/types';
import { fmtDataHora, diasAte } from '@/lib/garantias/format';
import GarantiaAnexos from './GarantiaAnexos';

interface Props {
  garantia: GarantiaDetalhe;
  userName: string;
  busy: string;
  onAcao: (acao: string, payload?: Record<string, unknown>) => Promise<boolean>;
  onAnexosChange: () => void;
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8,
  border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)',
  color: 'var(--portal-text)', fontSize: 13, outline: 'none',
};

const btn = (bg: string, disabled?: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '9px 14px', borderRadius: 9, border: 'none', background: bg,
  color: '#fff', fontSize: 13, fontWeight: 600,
  cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.55 : 1,
});

// Devolução das peças usadas à fábrica (prova de destruição) — pendência
// anexa à garantia APROVADA (Ventura/Kuhn/Tatu). Padrão do CobrancaCliente.
export default function DevolucaoPecasSecao({ garantia: g, userName, busy, onAcao, onAnexosChange }: Props) {
  const [nf, setNf] = useState(g.devolucao_nf || '');
  const [transportadora, setTransportadora] = useState(g.devolucao_transportadora || '');
  const [rastreio, setRastreio] = useState(g.devolucao_rastreio || '');
  const [obs, setObs] = useState(g.devolucao_obs || '');
  const [prazo, setPrazo] = useState(g.devolucao_prazo || '');
  const [editandoPrazo, setEditandoPrazo] = useState(false);

  const anexos = g.anexos.filter((a) => a.categoria === 'devolucao_pecas');
  const pendente = g.devolucao_status === 'pendente';
  const enviada = g.devolucao_status === 'enviada';
  const dispensada = g.devolucao_status === 'dispensada';
  const dias = diasAte(g.devolucao_prazo);
  const vencida = pendente && dias != null && dias < 0;

  return (
    <div
      style={{
        background: 'var(--portal-bg-card)',
        border: `1px solid ${vencida ? '#fca5a5' : 'var(--portal-border)'}`,
        borderLeft: `4px solid ${enviada ? '#16a34a' : dispensada ? '#64748b' : vencida ? '#dc2626' : '#b45309'}`,
        borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
        <PackageOpen size={14} />
        Devolução das peças à fábrica (prova de destruição)
        <span
          style={{
            marginLeft: 'auto', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 8,
            background: enviada ? '#ECFDF5' : dispensada ? '#F1F5F9' : vencida ? '#FEF2F2' : '#FEF3C7',
            color: enviada ? '#047857' : dispensada ? '#475569' : vencida ? '#B91C1C' : '#92400E',
          }}
        >
          {enviada ? 'ENVIADA' : dispensada ? 'DISPENSADA' : vencida ? 'VENCIDA' : 'PENDENTE'}
        </span>
      </div>

      {pendente && (
        <>
          {/* Prazo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12, color: vencida ? '#b91c1c' : 'var(--portal-text-secondary)' }}>
            <CalendarClock size={13} />
            {g.devolucao_prazo ? (
              dias != null && dias < 0
                ? <strong>Prazo venceu há {Math.abs(dias)} dia(s) ({g.devolucao_prazo.split('-').reverse().join('/')})</strong>
                : <span>Prazo: <strong>{g.devolucao_prazo.split('-').reverse().join('/')}</strong>{dias != null ? (dias === 0 ? ' — vence HOJE' : ` — faltam ${dias} dia(s)`) : ''}</span>
            ) : (
              <span>Sem prazo definido</span>
            )}
            {editandoPrazo ? (
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} style={{ ...inputStyle, width: 'auto', padding: '4px 8px', fontSize: 12 }} />
                <button
                  type="button"
                  onClick={async () => {
                    // prazo_anterior: o servidor recusa (409) se outro usuário
                    // mudou o prazo enquanto este drawer estava aberto.
                    const ok = await onAcao('prazo', { prazo, prazo_anterior: g.devolucao_prazo || null });
                    if (ok) setEditandoPrazo(false);
                  }}
                  disabled={!!busy || !prazo}
                  style={{ ...btn('#475569', !!busy || !prazo), padding: '4px 10px', fontSize: 11 }}
                >
                  {busy === 'devolucao_prazo' ? <Loader2 size={11} className="spin" /> : 'Salvar'}
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setPrazo(g.devolucao_prazo || '');
                  setEditandoPrazo(true);
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#0ea5e9', fontWeight: 600, padding: 0 }}
              >
                ajustar prazo
              </button>
            )}
          </div>

          {/* Dados do envio */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 10, color: 'var(--portal-text-faint)' }}>NF de remessa/devolução</span>
              <input value={nf} onChange={(e) => setNf(e.target.value)} placeholder="Nº da nota" style={inputStyle} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 10, color: 'var(--portal-text-faint)' }}>Transportadora</span>
              <input value={transportadora} onChange={(e) => setTransportadora(e.target.value)} placeholder="Ex.: Braspress" style={inputStyle} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 10, color: 'var(--portal-text-faint)' }}>Rastreio (opcional)</span>
              <input value={rastreio} onChange={(e) => setRastreio(e.target.value)} placeholder="Código" style={inputStyle} />
            </div>
          </div>
          <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Observações (opcional)" style={inputStyle} />

          {/* Comprovante */}
          <GarantiaAnexos
            garantiaId={g.id}
            anexos={anexos}
            uploadCategoria="devolucao_pecas"
            enviadoPor={userName}
            onChange={onAnexosChange}
            vazioTexto="Anexe o comprovante do envio (canhoto, foto da postagem, NF)."
          />

          <button
            onClick={() => onAcao('registrar', { nf, transportadora, rastreio, obs })}
            disabled={!!busy || (!nf.trim() && anexos.length === 0)}
            title={!nf.trim() && anexos.length === 0 ? 'Informe a NF de remessa ou anexe o comprovante' : undefined}
            style={btn('linear-gradient(135deg,#b45309,#92400e)', !!busy || (!nf.trim() && anexos.length === 0))}
          >
            {busy === 'devolucao_registrar' ? <Loader2 size={15} className="spin" /> : <Truck size={15} />}
            Registrar devolução enviada
          </button>
          <button
            type="button"
            onClick={() => {
              if (!confirm('Confirmar: a fábrica DISPENSOU a devolução das peças? O card sai da coluna "Devolução de peças" (dá pra reativar depois).')) return;
              const motivo = prompt('Motivo (opcional):');
              if (motivo === null) return;
              onAcao('dispensar', { motivo });
            }}
            disabled={!!busy}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--portal-text-muted)', textDecoration: 'underline', padding: 0, alignSelf: 'flex-start' }}
          >
            Fábrica dispensou a devolução
          </button>
        </>
      )}

      {dispensada && (
        <>
          <div style={{ fontSize: 12, color: 'var(--portal-text-secondary)' }}>
            A fábrica dispensou a devolução das peças (o motivo fica na linha do tempo).
          </div>
          <button
            type="button"
            onClick={() => {
              if (confirm('Reativar a pendência de devolução? O card volta pra coluna "Devolução de peças".')) {
                onAcao('reabrir');
              }
            }}
            disabled={!!busy}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--portal-text-muted)', textDecoration: 'underline', padding: 0, alignSelf: 'flex-start' }}
          >
            {busy === 'devolucao_reabrir' ? 'Reativando…' : 'Reativar a pendência (dispensada por engano)'}
          </button>
        </>
      )}

      {enviada && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--portal-text)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#047857', fontWeight: 600 }}>
              <CheckCircle2 size={14} /> Peças devolvidas em {fmtDataHora(g.devolucao_enviada_em)}
            </span>
            <div style={{ fontSize: 12, color: 'var(--portal-text-secondary)' }}>
              {g.devolucao_nf && <>NF de remessa: <strong>{g.devolucao_nf}</strong> · </>}
              {g.devolucao_transportadora && <>{g.devolucao_transportadora}</>}
              {g.devolucao_rastreio && <> · rastreio {g.devolucao_rastreio}</>}
            </div>
            {g.devolucao_obs && (
              <div style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>{g.devolucao_obs}</div>
            )}
          </div>
          {anexos.length > 0 && (
            <GarantiaAnexos garantiaId={g.id} anexos={anexos} onChange={onAnexosChange} />
          )}
          <button
            type="button"
            onClick={() => {
              if (confirm('Reabrir o registro da devolução? Ela volta a ficar pendente no kanban.')) {
                onAcao('reabrir');
              }
            }}
            disabled={!!busy}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--portal-text-muted)', textDecoration: 'underline', padding: 0, alignSelf: 'flex-start' }}
          >
            {busy === 'devolucao_reabrir' ? 'Reabrindo…' : 'Reabrir (registrado por engano)'}
          </button>
        </>
      )}
    </div>
  );
}
