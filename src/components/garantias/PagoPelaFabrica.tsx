'use client';
import { useState } from 'react';
import { fetchAuth } from '@/lib/auth/client';
import { Loader2, Pencil } from 'lucide-react';
import { fmtMoeda } from '@/lib/garantias/format';
import { valoresFabrica } from '@/lib/garantias/constants';
import { lerHoras, pagoDaGarantia, type QtdPaga } from '@/lib/garantias/pago-fabrica';
import type { GarantiaDetalhe } from '@/lib/garantias/types';

// Garantia aprovada: quantas horas/km a fábrica REALMENTE pagou (DRVG) e quantas
// ficaram recusadas. Salvar refaz o valor pago com a taxa da montadora.

const n2 = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

function Linha({ rotulo, q, unidade, taxa, valor }: { rotulo: string; q: QtdPaga; unidade: string; taxa: number; valor: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 2, padding: '6px 0', borderBottom: '1px dashed var(--portal-border)' }}>
      <div style={{ fontWeight: 700 }}>{rotulo}</div>
      <div style={{ fontWeight: 700, textAlign: 'right' }}>{fmtMoeda(valor)}</div>
      <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', gridColumn: '1 / -1' }}>
        Pedimos <b>{n2(q.pedidas)} {unidade}</b> · fábrica pagou <b style={{ color: '#16a34a' }}>{n2(q.pagas)} {unidade}</b>
        {q.recusadas > 0 && <> · recusou <b style={{ color: '#dc2626' }}>{n2(q.recusadas)} {unidade}</b></>}
        {' '}× {fmtMoeda(taxa)}
        {!q.informado && q.pedidas > 0 && <span title="Ninguém informou ainda; deduzido do valor pago"> (deduzido)</span>}
      </div>
    </div>
  );
}

export default function PagoPelaFabrica({ g, podeEditar, onSalvo }: { g: GarantiaDetalhe; podeEditar: boolean; onSalvo: () => void }) {
  const taxa = valoresFabrica(g.montadora);
  const pago = pagoDaGarantia(g, taxa);
  const [editando, setEditando] = useState(false);
  const [horas, setHoras] = useState('');
  const [km, setKm] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const abrir = () => {
    setHoras(n2(pago.horas.pagas));
    setKm(n2(pago.km.pagas));
    setErro('');
    setEditando(true);
  };

  const h = lerHoras(horas);
  const k = lerHoras(km);
  const salvar = async () => {
    if (h == null || k == null) { setErro('Use números, ex.: 1,5 ou 1:30 para horas.'); return; }
    setSalvando(true);
    setErro('');
    try {
      const r = await fetchAuth(`/api/garantias/${g.id}/pago-fabrica`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ horas: h, km: k }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.error || 'Não foi possível salvar.'); return; }
      setEditando(false);
      onSalvo();
    } catch {
      setErro('Sem conexão com o portal.');
    } finally {
      setSalvando(false);
    }
  };

  const inp: React.CSSProperties = {
    width: 90, padding: '7px 8px', borderRadius: 6, border: '1px solid var(--portal-border)',
    background: 'var(--portal-bg-input)', color: 'var(--portal-text)', fontSize: 14, textAlign: 'right',
  };

  return (
    <div style={{ border: '1px solid var(--portal-border)', borderRadius: 8, padding: '8px 10px', fontSize: 13, color: 'var(--portal-text)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ fontWeight: 800 }}>Pago pela fábrica (horas e km)</div>
        {podeEditar && !editando && (
          <button onClick={abrir} title="Informar o que a fábrica pagou (DRVG)"
            style={{ display: 'flex', alignItems: 'center', gap: 4, minHeight: 32, padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--portal-border)', background: 'transparent', color: 'var(--portal-text)' }}>
            <Pencil size={13} /> Editar
          </button>
        )}
      </div>

      {!editando ? (
        <>
          <Linha rotulo="Mão de obra" q={pago.horas} unidade="h" taxa={taxa.hora} valor={Number(g.valor_pago_horas) || 0} />
          <Linha rotulo="Deslocamento" q={pago.km} unidade="km" taxa={taxa.km} valor={Number(g.valor_pago_km) || 0} />
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>
            Digite o que a fábrica pagou (está na DRVG). O que faltar para o pedido conta como recusado.
          </div>
          {([
            ['Horas pagas', horas, setHoras, pago.horas.pedidas, 'h', taxa.hora, h],
            ['Km pagos', km, setKm, pago.km.pedidas, 'km', taxa.km, k],
          ] as const).map(([rot, v, set, pedidas, un, tx, lido]) => (
            <label key={rot} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ width: 90, fontWeight: 700 }}>{rot}</span>
              <input value={v} onChange={(e) => set(e.target.value)} inputMode="decimal" style={inp} />
              <span style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>
                de {n2(pedidas)} {un} pedidas
                {lido != null && <> · recusadas <b style={{ color: '#dc2626' }}>{n2(Math.max(0, pedidas - lido))} {un}</b> · {fmtMoeda(lido * tx)}</>}
              </span>
            </label>
          ))}
          {erro && <div style={{ fontSize: 12, color: '#b45309' }}>{erro}</div>}
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={salvar} disabled={salvando}
              style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 36, padding: '6px 14px', borderRadius: 6, border: 'none', background: '#16a34a', color: '#fefefe', fontWeight: 700, cursor: 'pointer' }}>
              {salvando && <Loader2 size={14} className="spin" />} Salvar
            </button>
            <button onClick={() => setEditando(false)} disabled={salvando}
              style={{ minHeight: 36, padding: '6px 14px', borderRadius: 6, border: '1px solid var(--portal-border)', background: 'transparent', color: 'var(--portal-text)', cursor: 'pointer' }}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
