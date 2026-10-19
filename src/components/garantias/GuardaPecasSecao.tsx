'use client';
import { useState } from 'react';
import { Archive, Loader2, CheckCircle2, Trash2, CalendarClock, MapPin, Camera } from 'lucide-react';
import type { GarantiaDetalhe } from '@/lib/garantias/types';
import { fmtDataHora, diasAte } from '@/lib/garantias/format';
import { GUARDA_DIAS_PADRAO } from '@/lib/garantias/constants';
import { rotuloLocalizacao } from '@/lib/garantias/localizacao';
import GarantiaAnexos from './GarantiaAnexos';

interface Props {
  garantia: GarantiaDetalhe;
  userName: string;
  busy: string;
  onAcao: (acao: string, payload?: Record<string, unknown>) => Promise<boolean>;
  onAnexosChange: () => void;
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)',
  color: 'var(--portal-text)', fontSize: 13, outline: 'none', boxSizing: 'border-box',
};

const btn = (bg: string, disabled?: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '11px 14px', minHeight: 44, borderRadius: 9, border: 'none', background: bg,
  color: '#fff', fontSize: 13, fontWeight: 600,
  cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.55 : 1,
});

const fmtPrazo = (ymd: string | null | undefined) => (ymd ? ymd.split('-').reverse().join('/') : '—');

// Guarda das peças antes do descarte (padrão da empresa — todas as montadoras):
// a peça substituída fica guardada 90 dias depois da aprovação, com FOTO de
// onde está, antes de poder ser sucateada. Molde da DevolucaoPecasSecao,
// pensado pro celular (fotos pela câmera, botões grandes).
export default function GuardaPecasSecao({ garantia: g, userName, busy, onAcao, onAnexosChange }: Props) {
  const [obs, setObs] = useState('');
  const [prazo, setPrazo] = useState(g.guarda_prazo || '');
  const [editandoPrazo, setEditandoPrazo] = useState(false);
  const [descartando, setDescartando] = useState(false);

  const fotosGuarda = g.anexos.filter((a) => a.categoria === 'guarda_pecas');
  const fotosDescarte = g.anexos.filter((a) => a.categoria === 'descarte_pecas');
  const pendente = g.guarda_status === 'pendente';
  const descartada = g.guarda_status === 'descartada';
  const dispensada = g.guarda_status === 'dispensada';
  const semGuarda = !pendente && !descartada && !dispensada; // nao_aplicavel ou pré-migration
  const dias = diasAte(g.guarda_prazo);
  // Na guarda, prazo vencido é LIBERAÇÃO (pode descartar), não atraso.
  const liberada = pendente && dias != null && dias <= 0;
  const localizacao = rotuloLocalizacao(g.localizacao);

  // Garantia aprovada antiga sem guarda: oferta compacta de iniciar (backfill
  // manual). Só quando tem peça e as peças não foram/irão pra fábrica.
  if (semGuarda) {
    if (g.pecas.length === 0 || g.devolucao_status === 'pendente' || g.devolucao_status === 'enviada') return null;
    return (
      <div
        style={{
          background: 'var(--portal-bg-card)', border: '1px dashed var(--portal-border)',
          borderRadius: 12, padding: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: 12, color: 'var(--portal-text-muted)', flex: '1 1 220px', lineHeight: 1.5 }}>
          <Archive size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
          Esta aprovada não tem <strong>guarda de peças</strong> (finalizada antes da regra, ou desligada).
          Padrão da empresa: guardar as peças substituídas por {GUARDA_DIAS_PADRAO} dias antes do descarte.
        </span>
        <button
          onClick={() => onAcao('abrir')}
          disabled={!!busy}
          style={{ ...btn('#0e7490', !!busy), minHeight: 38, padding: '8px 14px', fontSize: 12 }}
        >
          {busy === 'guarda_abrir' ? <Loader2 size={13} className="spin" /> : <Archive size={13} />}
          Iniciar guarda ({GUARDA_DIAS_PADRAO} dias)
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        background: 'var(--portal-bg-card)',
        border: `1px solid ${liberada ? '#86efac' : 'var(--portal-border)'}`,
        borderLeft: `4px solid ${descartada ? '#64748b' : dispensada ? '#94a3b8' : liberada ? '#16a34a' : '#0e7490'}`,
        borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, flexWrap: 'wrap' }}>
        <Archive size={14} />
        Guarda das peças (antes do descarte)
        <span
          style={{
            marginLeft: 'auto', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 8,
            background: descartada ? '#F1F5F9' : dispensada ? '#F1F5F9' : liberada ? '#ECFDF5' : '#ECFEFF',
            color: descartada ? '#475569' : dispensada ? '#475569' : liberada ? '#047857' : '#0E7490',
          }}
        >
          {descartada ? 'DESCARTADA' : dispensada ? 'DISPENSADA' : liberada ? 'PODE DESCARTAR' : 'EM GUARDA'}
        </span>
      </div>

      {pendente && (
        <>
          {/* Prazo — vencido aqui é liberação, não atraso */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12, color: liberada ? '#047857' : 'var(--portal-text-secondary)' }}>
            <CalendarClock size={13} />
            {g.guarda_prazo ? (
              liberada
                ? <strong>Guarda cumprida — descarte liberado desde {fmtPrazo(g.guarda_prazo)}</strong>
                : <span>Guardar até <strong>{fmtPrazo(g.guarda_prazo)}</strong>{dias != null ? ` — faltam ${dias} dia(s) pro descarte` : ''}</span>
            ) : (
              <span>Sem prazo definido</span>
            )}
            {editandoPrazo ? (
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} style={{ ...inputStyle, width: 'auto', padding: '6px 8px', fontSize: 12 }} />
                <button
                  type="button"
                  onClick={async () => {
                    // prazo_anterior: o servidor recusa (409) se outro usuário
                    // mudou o prazo enquanto este drawer estava aberto.
                    const ok = await onAcao('prazo', { prazo, prazo_anterior: g.guarda_prazo || null });
                    if (ok) setEditandoPrazo(false);
                  }}
                  disabled={!!busy || !prazo}
                  style={{ ...btn('#475569', !!busy || !prazo), minHeight: 34, padding: '6px 10px', fontSize: 11 }}
                >
                  {busy === 'guarda_prazo' ? <Loader2 size={11} className="spin" /> : 'Salvar'}
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setPrazo(g.guarda_prazo || '');
                  setEditandoPrazo(true);
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#0ea5e9', fontWeight: 600, padding: '4px 0' }}
              >
                ajustar prazo
              </button>
            )}
          </div>

          {/* Onde está guardada */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--portal-text-secondary)', flexWrap: 'wrap' }}>
            <MapPin size={13} />
            {localizacao ? (
              <span>Guardada em: <strong>{localizacao}</strong></span>
            ) : (
              <span style={{ color: '#b45309' }}>
                Sem localização — marque a estante/prateleira na seção <strong>Ordem de serviço</strong> deste card.
              </span>
            )}
          </div>

          {/* Fotos de prova de onde a peça está guardada */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: 'var(--portal-text-muted)' }}>
              <Camera size={12} /> Fotos da peça guardada ({fotosGuarda.length})
            </span>
            <GarantiaAnexos
              garantiaId={g.id}
              anexos={fotosGuarda}
              uploadCategoria="guarda_pecas"
              enviadoPor={userName}
              onChange={onAnexosChange}
              camera
              galeria
              vazioTexto="Tire uma foto da peça no lugar onde ficou guardada (prova da guarda)."
            />
          </div>

          {/* Registrar o descarte */}
          {!descartando ? (
            <button
              onClick={() => setDescartando(true)}
              disabled={!!busy}
              style={btn(liberada ? 'linear-gradient(135deg,#16a34a,#15803d)' : '#64748b', !!busy)}
            >
              <Trash2 size={15} />
              {liberada ? 'Registrar descarte das peças' : 'Registrar descarte (antes do prazo)'}
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 10, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-secondary)' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text-secondary)' }}>
                Prova do descarte — foto/vídeo da destruição (ou descreva como foi):
              </span>
              <GarantiaAnexos
                garantiaId={g.id}
                anexos={fotosDescarte}
                uploadCategoria="descarte_pecas"
                enviadoPor={userName}
                onChange={onAnexosChange}
                camera
                galeria
                vazioTexto="Nenhuma prova anexada ainda."
              />
              <input
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                placeholder="Como foi o descarte (opcional se anexou foto)"
                style={inputStyle}
              />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setDescartando(false)}
                  style={{ ...btn('transparent'), color: 'var(--portal-text)', border: '1px solid var(--portal-border)', flex: '1 1 110px' }}
                >
                  Voltar
                </button>
                <button
                  onClick={async () => {
                    const antecipado = !liberada && g.guarda_prazo;
                    if (antecipado && !confirm(`O prazo de guarda só termina em ${fmtPrazo(g.guarda_prazo)} — a fábrica ainda pode pedir a peça. Descartar MESMO ASSIM?`)) return;
                    const ok = await onAcao('descartar', { obs, confirma_antecipado: !!antecipado });
                    if (ok) { setDescartando(false); setObs(''); }
                  }}
                  disabled={!!busy || (fotosDescarte.length === 0 && !obs.trim())}
                  title={fotosDescarte.length === 0 && !obs.trim() ? 'Anexe a foto do descarte ou descreva como foi' : undefined}
                  style={{ ...btn('linear-gradient(135deg,#16a34a,#15803d)', !!busy || (fotosDescarte.length === 0 && !obs.trim())), flex: '2 1 180px' }}
                >
                  {busy === 'guarda_descartar' ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />}
                  Confirmar descarte
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              if (!confirm('Dispensar a guarda? Use quando as peças NÃO ficaram aqui (ex.: ficaram com o cliente, ou a fábrica pediu a devolução). Dá pra reativar depois.')) return;
              const motivo = prompt('Motivo (opcional):');
              if (motivo === null) return;
              onAcao('dispensar', { motivo });
            }}
            disabled={!!busy}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--portal-text-muted)', textDecoration: 'underline', padding: '4px 0', alignSelf: 'flex-start' }}
          >
            Dispensar a guarda (peças não ficaram aqui)
          </button>
        </>
      )}

      {dispensada && (
        <>
          <div style={{ fontSize: 12, color: 'var(--portal-text-secondary)' }}>
            A guarda foi dispensada (o motivo fica na linha do tempo).
          </div>
          <button
            type="button"
            onClick={() => {
              if (confirm('Reativar a guarda das peças? O card volta pra coluna "Guarda de peças".')) {
                onAcao('reabrir');
              }
            }}
            disabled={!!busy}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--portal-text-muted)', textDecoration: 'underline', padding: '4px 0', alignSelf: 'flex-start' }}
          >
            {busy === 'guarda_reabrir' ? 'Reativando…' : 'Reativar a guarda (dispensada por engano)'}
          </button>
        </>
      )}

      {descartada && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--portal-text)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#047857', fontWeight: 600 }}>
              <CheckCircle2 size={14} /> Peças descartadas em {fmtDataHora(g.guarda_descartada_em)}
            </span>
            {g.guarda_obs && (
              <div style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>{g.guarda_obs}</div>
            )}
          </div>
          {fotosDescarte.length > 0 && (
            <GarantiaAnexos garantiaId={g.id} anexos={fotosDescarte} onChange={onAnexosChange} galeria />
          )}
          <button
            type="button"
            onClick={() => {
              if (confirm('Reabrir o registro do descarte? As peças voltam a contar como em guarda.')) {
                onAcao('reabrir');
              }
            }}
            disabled={!!busy}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--portal-text-muted)', textDecoration: 'underline', padding: '4px 0', alignSelf: 'flex-start' }}
          >
            {busy === 'guarda_reabrir' ? 'Reabrindo…' : 'Reabrir (registrado por engano)'}
          </button>
        </>
      )}
    </div>
  );
}
