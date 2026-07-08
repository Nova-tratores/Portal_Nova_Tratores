'use client';
import { useMemo, useState } from 'react';
import { DollarSign, Loader2, Save, CheckCircle2, XCircle, RotateCcw, Plus, Trash2, AlertTriangle } from 'lucide-react';
import type { GarantiaDetalhe, CobrancaItens, CobrancaOutro } from '@/lib/garantias/types';
import { VALOR_HORA, VALOR_KM } from '@/lib/garantias/constants';
import { fmtMoeda, fmtDataHora } from '@/lib/garantias/format';

interface Props {
  garantia: GarantiaDetalhe;
  busy: string;
  onAcao: (acao: string, payload?: Record<string, unknown>) => Promise<boolean>;
}

const COBRANCA_LABEL: Record<string, { texto: string; cor: string; bg: string }> = {
  nao_aplicavel:   { texto: 'Não aplicável',          cor: '#64748b', bg: '#f1f5f9' },
  nao_cobrar:      { texto: 'Cortesia (não cobrar)',  cor: '#0369a1', bg: '#dbeafe' },
  pendente:        { texto: 'Aguardando cobrança',    cor: '#b45309', bg: '#fef3c7' },
  cobrada:         { texto: 'Cobrança enviada',       cor: '#7c3aed', bg: '#ede9fe' },
  paga:            { texto: 'Cliente pagou',          cor: '#15803d', bg: '#dcfce7' },
  baixada_prejuizo:{ texto: 'Baixada como prejuízo',  cor: '#b91c1c', bg: '#fee2e2' },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = COBRANCA_LABEL[status] || COBRANCA_LABEL.nao_aplicavel;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 999,
      background: cfg.bg, color: cfg.cor,
      fontSize: 11, fontWeight: 700,
    }}>
      {cfg.texto}
    </span>
  );
}

function diasAteVencimento(vencimento: string | null): number | null {
  if (!vencimento) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const venc = new Date(`${vencimento}T00:00:00`);
  return Math.round((venc.getTime() - hoje.getTime()) / 86400000);
}

const btn = (bg: string, disabled?: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  gap: 6, padding: '8px 12px', borderRadius: 8, border: 'none',
  background: bg, color: '#fff', fontSize: 13, fontWeight: 600,
  cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.55 : 1,
});

export default function CobrancaCliente({ garantia: g, busy, onAcao }: Props) {
  const horasUsar = g.garantista_horas != null ? Number(g.garantista_horas) : Number(g.tecnico_horas) || 0;
  const kmUsar = g.garantista_km != null ? Number(g.garantista_km) : Number(g.tecnico_km) || 0;
  const valorHoras = horasUsar * VALOR_HORA;
  const valorKm = kmUsar * VALOR_KM;

  const [horas, setHoras] = useState<boolean>(g.cobranca_itens?.horas ?? true);
  const [km, setKm] = useState<boolean>(g.cobranca_itens?.km ?? true);
  const [pecasMarcadas, setPecasMarcadas] = useState<Set<string>>(
    new Set(g.cobranca_itens?.pecas || g.pecas.map((p) => p.id)),
  );
  const [outros, setOutros] = useState<CobrancaOutro[]>(g.cobranca_outros || []);
  const [vencimento, setVencimento] = useState<string>(() => {
    if (g.cobranca_vencimento) return g.cobranca_vencimento;
    // Default: hoje + 30 dias
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [obs, setObs] = useState<string>(g.cobranca_obs || '');

  // Valores editáveis pelo garantista. Default = cálculo padrão; se já houver
  // valores salvos (cobranca_itens.valores), retoma esses. Ex.: M.O. negada
  // pela fábrica → cobra do cliente o mesmo valor que cobraria da montadora.
  const valSalvos = g.cobranca_itens?.valores;
  const [valorHorasEd, setValorHorasEd] = useState<number>(valSalvos?.horas ?? valorHoras);
  const [valorKmEd, setValorKmEd] = useState<number>(valSalvos?.km ?? valorKm);
  const [valoresPecasEd, setValoresPecasEd] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const p of g.pecas) {
      const calc = (Number(p.preco_unitario) || 0) * (Number(p.quantidade) || 0);
      init[p.id] = valSalvos?.pecas?.[p.id] ?? calc;
    }
    return init;
  });

  const total = useMemo(() => {
    let t = 0;
    if (horas) t += Number(valorHorasEd) || 0;
    if (km) t += Number(valorKmEd) || 0;
    for (const p of g.pecas) {
      if (pecasMarcadas.has(p.id)) t += Number(valoresPecasEd[p.id]) || 0;
    }
    for (const o of outros) t += Number(o.valor) || 0;
    return t;
  }, [horas, km, pecasMarcadas, outros, g.pecas, valorHorasEd, valorKmEd, valoresPecasEd]);

  const togglePeca = (id: string) => {
    setPecasMarcadas((prev) => {
      const nv = new Set(prev);
      if (nv.has(id)) nv.delete(id); else nv.add(id);
      return nv;
    });
  };

  const editando = g.cobranca_status === 'pendente';
  const cobrada = g.cobranca_status === 'cobrada';
  const finalizada = g.cobranca_status === 'paga' || g.cobranca_status === 'baixada_prejuizo' || g.cobranca_status === 'nao_cobrar';

  const dias = diasAteVencimento(g.cobranca_vencimento);
  const vencida = cobrada && dias != null && dias < 0;

  const salvar = () => onAcao('definir', {
    itens: {
      horas, km, pecas: [...pecasMarcadas],
      valores: {
        horas: Number(valorHorasEd) || 0,
        km: Number(valorKmEd) || 0,
        pecas: Object.fromEntries(g.pecas.map((p) => [p.id, Number(valoresPecasEd[p.id]) || 0])),
      },
    },
    outros,
    vencimento,
    obs,
  });

  return (
    <div style={{
      background: '#fff7ed',
      border: '1px solid #fdba74',
      borderRadius: 12,
      padding: 14,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#9a3412', textTransform: 'uppercase', letterSpacing: 0.4 }}>
          <DollarSign size={14} /> Cobrança ao cliente
        </div>
        <StatusBadge status={g.cobranca_status} />
      </div>

      {vencida && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#b91c1c', fontWeight: 600 }}>
          <AlertTriangle size={13} /> Vencida há {Math.abs(dias!)} dia(s). Considere baixar como prejuízo.
        </div>
      )}

      {editando && (
        <>
          <span style={{ fontSize: 12, color: 'var(--portal-text-secondary)' }}>
            Marque o que vai ser cobrado do cliente. O valor total é calculado automaticamente.
          </span>

          <Item
            label={`Horas trabalhadas (${horasUsar.toFixed(1)}h × ${fmtMoeda(VALOR_HORA)})`}
            checked={horas}
            valor={valorHorasEd}
            onToggle={() => setHoras((v) => !v)}
            onValorChange={setValorHorasEd}
          />
          <Item
            label={`KM rodados (${kmUsar.toFixed(1)}km × ${fmtMoeda(VALOR_KM)})`}
            checked={km}
            valor={valorKmEd}
            onToggle={() => setKm((v) => !v)}
            onValorChange={setValorKmEd}
          />

          {g.pecas.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase' }}>Peças</span>
              {g.pecas.map((p) => {
                const v = (Number(p.preco_unitario) || 0) * (Number(p.quantidade) || 0);
                return (
                  <Item
                    key={p.id}
                    label={`${p.cod_produto ? `${p.cod_produto} · ` : ''}${p.descricao} (x${p.quantidade})`}
                    checked={pecasMarcadas.has(p.id)}
                    valor={valoresPecasEd[p.id] ?? v}
                    onToggle={() => togglePeca(p.id)}
                    onValorChange={(nv) => setValoresPecasEd((prev) => ({ ...prev, [p.id]: nv }))}
                  />
                );
              })}
            </div>
          )}

          {/* Lançamentos extras */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase' }}>Outros lançamentos</span>
            {outros.map((o, i) => (
              <div key={i} style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  value={o.descricao}
                  onChange={(e) => setOutros((prev) => prev.map((x, j) => j === i ? { ...x, descricao: e.target.value } : x))}
                  placeholder="Descrição (ex: deslocamento extra)"
                  style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--portal-border)', fontSize: 12 }}
                />
                <input
                  type="number"
                  value={o.valor || ''}
                  onChange={(e) => setOutros((prev) => prev.map((x, j) => j === i ? { ...x, valor: Number(e.target.value) || 0 } : x))}
                  placeholder="R$"
                  style={{ width: 90, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--portal-border)', fontSize: 12 }}
                />
                <button type="button" onClick={() => setOutros((prev) => prev.filter((_, j) => j !== i))} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#dc2626' }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setOutros((prev) => [...prev, { descricao: '', valor: 0 }])}
              style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, border: '1px dashed var(--portal-border)', background: 'transparent', color: 'var(--portal-text-secondary)', fontSize: 11, cursor: 'pointer' }}
            >
              <Plus size={11} /> Adicionar
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, color: 'var(--portal-text-muted)', fontWeight: 600 }}>
              Vencimento
              <input
                type="date"
                value={vencimento}
                onChange={(e) => setVencimento(e.target.value)}
                style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--portal-border)', fontSize: 12 }}
              />
            </label>
          </div>
          <textarea
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            placeholder="Observações da cobrança (opcional)"
            rows={2}
            style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--portal-border)', fontSize: 12, fontFamily: 'inherit', resize: 'vertical' }}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
            <strong>Total a cobrar:</strong>
            <strong style={{ color: '#b91c1c', fontSize: 16 }}>{fmtMoeda(total)}</strong>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={salvar} disabled={!!busy || !(total > 0)} style={btn('linear-gradient(135deg,#f97316,#c2410c)', !!busy || !(total > 0))}>
              {busy === 'cobranca_definir' ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
              Lançar cobrança
            </button>
            <button onClick={() => onAcao('nao_cobrar', { motivo: obs })} disabled={!!busy} style={btn('#64748b', !!busy)}>
              Cortesia (não cobrar)
            </button>
          </div>
        </>
      )}

      {(cobrada || finalizada) && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', fontSize: 12 }}>
            <Linha label="Total" valor={fmtMoeda(g.cobranca_valor_total)} destaque="#b91c1c" />
            <Linha label="Vencimento" valor={g.cobranca_vencimento ? new Date(`${g.cobranca_vencimento}T00:00:00`).toLocaleDateString('pt-BR') : '—'} />
            <Linha label="Cobrança lançada em" valor={fmtDataHora(g.cobranca_cobrada_em)} />
            {g.cobranca_pago_em && <Linha label="Pago em" valor={fmtDataHora(g.cobranca_pago_em)} destaque="#15803d" />}
            {g.cobranca_baixada_em && <Linha label="Baixada em" valor={fmtDataHora(g.cobranca_baixada_em)} destaque="#b91c1c" />}
          </div>
          {g.cobranca_obs && (
            <div style={{ fontSize: 12, color: 'var(--portal-text-secondary)' }}>
              <strong>Obs:</strong> {g.cobranca_obs}
            </div>
          )}

          {cobrada && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => onAcao('marcar_paga')} disabled={!!busy} style={btn('linear-gradient(135deg,#16a34a,#166534)', !!busy)}>
                {busy === 'cobranca_marcar_paga' ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} />}
                Marcar como paga
              </button>
              <button onClick={() => onAcao('baixar', { motivo: prompt('Motivo da baixa (opcional):') || '' })} disabled={!!busy} style={btn('linear-gradient(135deg,#dc2626,#7f1d1d)', !!busy)}>
                {busy === 'cobranca_baixar' ? <Loader2 size={14} className="spin" /> : <XCircle size={14} />}
                Baixar como prejuízo
              </button>
              <button onClick={() => onAcao('reabrir')} disabled={!!busy} style={{ ...btn('transparent', !!busy), color: 'var(--portal-text-secondary)', border: '1px solid var(--portal-border)' }}>
                <RotateCcw size={13} /> Reabrir
              </button>
            </div>
          )}
          {finalizada && (
            <button onClick={() => onAcao('reabrir')} disabled={!!busy} style={{ ...btn('transparent', !!busy), color: 'var(--portal-text-secondary)', border: '1px solid var(--portal-border)', alignSelf: 'flex-start' }}>
              <RotateCcw size={13} /> Reabrir cobrança
            </button>
          )}
        </>
      )}
    </div>
  );
}

function Item({ label, checked, valor, onToggle, onValorChange }: { label: string; checked: boolean; valor: number; onToggle: () => void; onValorChange: (v: number) => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 8px', borderRadius: 8,
      background: checked ? '#fef3c7' : 'rgba(255,255,255,0.5)',
      border: checked ? '1px solid #fcd34d' : '1px solid var(--portal-border)',
      fontSize: 12,
    }}>
      <input type="checkbox" checked={checked} onChange={onToggle} style={{ cursor: 'pointer' }} />
      <span onClick={onToggle} style={{ flex: 1, color: 'var(--portal-text)', cursor: 'pointer' }}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: checked ? '#b91c1c' : 'var(--portal-text-muted)' }}>
        <span style={{ fontSize: 11, fontWeight: 700 }}>R$</span>
        <input
          type="number"
          min={0}
          step="0.01"
          value={valor}
          disabled={!checked}
          onChange={(e) => onValorChange(Math.max(0, Number(e.target.value) || 0))}
          title="Clique para editar o valor cobrado"
          style={{
            width: 92, textAlign: 'right', padding: '4px 6px', borderRadius: 6,
            border: '1px solid var(--portal-border)', fontSize: 12, fontWeight: 700,
            color: 'inherit', background: checked ? '#fff' : 'transparent',
            cursor: checked ? 'text' : 'not-allowed',
          }}
        />
      </span>
    </div>
  );
}

function Linha({ label, valor, destaque }: { label: string; valor: string; destaque?: string }) {
  return (
    <>
      <span style={{ color: 'var(--portal-text-muted)' }}>{label}</span>
      <strong style={{ color: destaque || 'var(--portal-text)', textAlign: 'right' }}>{valor}</strong>
    </>
  );
}
