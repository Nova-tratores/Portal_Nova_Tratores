'use client';
// Heatmap dia da semana × hora do dia (horário de Brasília): revela padrões
// operacionais e abastecimentos fora do expediente. Escala sequencial de um
// tom só (vermelho), do claro ao escuro pelo valor gasto.

import { Fragment } from 'react';
import type { HeatmapCelula } from '@/lib/abastecimento/tipos';

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function corEscala(frac: number): string {
  // branco → #7f1d1d, interpolação simples
  const de = [254, 242, 242]; // #fef2f2
  const ate = [127, 29, 29]; // #7f1d1d
  const c = de.map((d, i) => Math.round(d + (ate[i] - d) * frac));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export default function HeatmapDiaHora({ celulas, onCellClick }: {
  celulas: HeatmapCelula[];
  onCellClick?: (dia: number, hora: number, nomeDia: string) => void;
}) {
  const mapa = new Map(celulas.map((c) => [`${c.dia}|${c.hora}`, c]));
  const maxValor = Math.max(1, ...celulas.map((c) => c.valor));

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '38px repeat(24, minmax(18px, 1fr))', gap: 2, minWidth: 560 }}>
        <div />
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} style={{ textAlign: 'center', color: '#aaa', fontSize: '.58rem' }}>{h % 3 === 0 ? `${h}h` : ''}</div>
        ))}
        {DIAS.map((nome, dia) => (
          <Fragment key={dia}>
            <div style={{ color: '#888', fontSize: '.66rem', fontWeight: 600, display: 'flex', alignItems: 'center' }}>{nome}</div>
            {Array.from({ length: 24 }, (_, hora) => {
              const c = mapa.get(`${dia}|${hora}`);
              const frac = c ? Math.max(0.12, c.valor / maxValor) : 0;
              return (
                <div
                  key={`${dia}-${hora}`}
                  title={c ? `${nome} ${hora}h — ${c.qtd} abastecimento(s), R$ ${c.valor.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} — clique para detalhar` : `${nome} ${hora}h — sem abastecimentos`}
                  onClick={c && onCellClick ? () => onCellClick(dia, hora, nome) : undefined}
                  style={{ aspectRatio: '1', borderRadius: 3, background: c ? corEscala(frac) : '#fafafa', border: '1px solid #f0f0f0', cursor: c && onCellClick ? 'pointer' : 'default' }}
                />
              );
            })}
          </Fragment>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, color: '#888', fontSize: '.68rem' }}>
        menos
        {[0.15, 0.4, 0.65, 1].map((f) => (
          <span key={f} style={{ width: 14, height: 14, borderRadius: 3, background: corEscala(f), display: 'inline-block' }} />
        ))}
        mais gasto · células fora do horário comercial merecem atenção
      </div>
    </div>
  );
}
