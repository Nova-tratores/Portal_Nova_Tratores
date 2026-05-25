'use client';
import { VALOR_HORA, VALOR_KM } from '@/lib/garantias/constants';
import { fmtMoeda } from '@/lib/garantias/format';

interface Props {
  tecnicoHoras: number;
  tecnicoKm: number;
  garantistaHoras: number | string | null;
  garantistaKm: number | string | null;
  onChange?: (campo: 'horas' | 'km', valor: string) => void;
  mostrarValores?: boolean;
}

const cellInput: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  borderRadius: 6,
  border: '1px solid var(--portal-border)',
  background: 'var(--portal-bg-input)',
  color: 'var(--portal-text)',
  fontSize: 13,
  outline: 'none',
};

export default function ValoresComparativo({
  tecnicoHoras,
  tecnicoKm,
  garantistaHoras,
  garantistaKm,
  onChange,
  mostrarValores = true,
}: Props) {
  const editavel = !!onChange;
  const gh = garantistaHoras === null || garantistaHoras === '' ? 0 : Number(garantistaHoras);
  const gk = garantistaKm === null || garantistaKm === '' ? 0 : Number(garantistaKm);
  const valTec = tecnicoHoras * VALOR_HORA + tecnicoKm * VALOR_KM;
  const valGar = gh * VALOR_HORA + gk * VALOR_KM;

  const th: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    color: 'var(--portal-text-muted)',
    padding: '6px 8px',
    textAlign: 'left',
  };
  const td: React.CSSProperties = {
    fontSize: 13,
    color: 'var(--portal-text)',
    padding: '6px 8px',
    borderTop: '1px solid var(--portal-border)',
  };

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={th}></th>
          <th style={{ ...th, textAlign: 'right' }}>Técnico</th>
          <th style={{ ...th, textAlign: 'right' }}>Garantista</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style={td}>Horas trabalhadas</td>
          <td style={{ ...td, textAlign: 'right' }}>{tecnicoHoras}h</td>
          <td style={{ ...td, textAlign: 'right' }}>
            {editavel ? (
              <input
                type="number"
                value={garantistaHoras ?? ''}
                onChange={(e) => onChange?.('horas', e.target.value)}
                style={{ ...cellInput, textAlign: 'right' }}
              />
            ) : (
              `${gh}h`
            )}
          </td>
        </tr>
        <tr>
          <td style={td}>Quilometragem</td>
          <td style={{ ...td, textAlign: 'right' }}>{tecnicoKm} km</td>
          <td style={{ ...td, textAlign: 'right' }}>
            {editavel ? (
              <input
                type="number"
                value={garantistaKm ?? ''}
                onChange={(e) => onChange?.('km', e.target.value)}
                style={{ ...cellInput, textAlign: 'right' }}
              />
            ) : (
              `${gk} km`
            )}
          </td>
        </tr>
        {mostrarValores && (
          <tr>
            <td style={{ ...td, fontWeight: 700 }}>Valor</td>
            <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmtMoeda(valTec)}</td>
            <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#16a34a' }}>{fmtMoeda(valGar)}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
