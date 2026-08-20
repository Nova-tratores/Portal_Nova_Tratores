'use client';
// Roteiro do Dia — a HOME do vendedor. Lista ordenada por score
// (valor ponderado × urgência do chassi × esfriamento do contato),
// com a comissão estimada em destaque e registro de visita em 3 cliques.
import { useState } from 'react';
import Ideia from '@/components/crm/Ideia';
import {
  DEALS, ESTAGIOS, lead, maquina, diasDesde, scoreRoteiro,
  comissaoEstimada, valorPonderado, brl,
} from '@/lib/crm/demo';

const RESULTADOS = ['Avançou', 'Pediu prazo', 'Objeção preço', 'Objeção crédito', 'Sem resposta'];
const RETORNOS = ['Amanhã', '3 dias', '7 dias', '15 dias'];

export default function RoteiroPage() {
  const [abrindo, setAbrindo] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const [registrados, setRegistrados] = useState<Record<string, string>>({});

  const paradas = DEALS
    .filter((d) => !d.ganho && !d.perdido)
    .sort((a, b) => scoreRoteiro(b) - scoreRoteiro(a));

  const concluir = (dealId: string, retorno: string) => {
    setRegistrados((r) => ({ ...r, [dealId]: `${resultado} · retorno em ${retorno}` }));
    setAbrindo(null);
    setResultado(null);
  };

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '20px 14px 60px', color: 'var(--portal-text)' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 10 }}>Roteiro do Dia</h1>

      <Ideia titulo="A ideia desta tela">
        Com 1 vendedor e rotas rurais, a home dele não é um Kanban — é <b>o que visitar hoje, na ordem certa</b>.
        O score mistura: valor do negócio ponderado pela chance de fechar, a idade do chassi no pátio (o velho
        empurra pra cima) e há quantos dias o contato esfria. A <b>comissão se fechar hoje</b> aparece em cada
        card porque é o número que muda o comportamento — chassi de 400 dias paga comissão 2×.
        Clique em <b>Registrar visita</b> pra ver o fluxo de 3 cliques (sem digitar nada).
      </Ideia>

      <div style={{ display: 'grid', gap: 12 }}>
        {paradas.map((d, i) => {
          const l = lead(d.leadId);
          const m = maquina(d.maquinaId);
          const est = ESTAGIOS.find((e) => e.codigo === d.estagio);
          const com = m && d.valorNegociado ? comissaoEstimada(m, d.valorNegociado) : null;
          const feito = registrados[d.id];
          return (
            <div
              key={d.id}
              style={{
                background: 'var(--portal-bg-card)',
                border: '1px solid var(--portal-border)',
                borderLeft: `5px solid ${i === 0 ? '#1B7A5F' : 'var(--portal-border)'}`,
                borderRadius: 10,
                padding: '13px 16px',
                opacity: feito ? 0.65 : 1,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>
                  {l.fazenda !== '—' ? l.fazenda : l.nome} · {l.municipio} · {l.km} km
                </div>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--portal-text-secondary)' }}>
                  score {scoreRoteiro(d).toFixed(0)} · #{i + 1}
                </span>
              </div>
              <div style={{ fontSize: 13.5, marginTop: 2 }}>
                {l.nome} — {m ? m.modelo : 'sem máquina definida'}
                {m ? ` (${diasDesde(m.entradaPatio)}d de pátio)` : ''}
              </div>
              <div style={{ fontSize: 13, color: 'var(--portal-text-secondary)', marginTop: 2 }}>
                {d.valorNegociado ? brl(d.valorNegociado) : 'sem valor'} · {est?.nome} ·{' '}
                <span style={{ color: d.diasSemContato > (est?.sla ?? 5) ? '#f87171' : 'inherit', fontWeight: d.diasSemContato > (est?.sla ?? 5) ? 700 : 400 }}>
                  {d.diasSemContato} dias sem contato
                </span>
                {d.valorNegociado ? ` · ponderado ${brl(valorPonderado(d))}` : ''}
              </div>
              {com !== null && (
                <div style={{ marginTop: 6, fontSize: 14.5, fontWeight: 800, color: '#1B7A5F' }}>
                  Comissão se fechar hoje: {brl(com)}
                </div>
              )}

              {feito ? (
                <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: '#1B7A5F' }}>
                  ✓ Visita registrada — {feito}
                </div>
              ) : abrindo === d.id ? (
                <div style={{ marginTop: 10, borderTop: '1px dashed var(--portal-border)', paddingTop: 10 }}>
                  {!resultado ? (
                    <>
                      <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>
                        2º clique — como foi? <span style={{ fontWeight: 400, color: 'var(--portal-text-secondary)' }}>(um chip, sem teclado)</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {RESULTADOS.map((r) => (
                          <button
                            key={r}
                            onClick={() => setResultado(r)}
                            style={{
                              padding: '7px 13px', borderRadius: 99, cursor: 'pointer',
                              border: '1px solid var(--portal-border)', background: 'var(--portal-bg-secondary)',
                              color: 'var(--portal-text)', fontSize: 13, fontWeight: 600,
                            }}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>
                        3º clique — retorno quando? <span style={{ fontWeight: 400, color: 'var(--portal-text-secondary)' }}>({resultado})</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {RETORNOS.map((r) => (
                          <button
                            key={r}
                            onClick={() => concluir(d.id, r)}
                            style={{
                              padding: '7px 13px', borderRadius: 99, cursor: 'pointer',
                              border: '1px solid #1B7A5F', background: '#1B7A5F',
                              color: '#fefefe', fontSize: 13, fontWeight: 700,
                            }}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--portal-text-secondary)' }}>
                        No sistema real: salva com GPS do celular (prova de visita), atualiza o relógio do funil e,
                        se &quot;Avançou&quot;, já sugere o próximo estágio. Sem sinal? Vai pra fila offline e sobe sozinho depois.
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => { setAbrindo(d.id); setResultado(null); }}
                    style={{
                      padding: '8px 16px', borderRadius: 8, cursor: 'pointer', border: 'none',
                      background: '#1B7A5F', color: '#fefefe', fontSize: 13.5, fontWeight: 700,
                    }}
                  >
                    Registrar visita (1º clique)
                  </button>
                  <button style={btnGhost}>WhatsApp</button>
                  <button style={btnGhost}>Rotas</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const btnGhost: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
  border: '1px solid var(--portal-border)', background: 'var(--portal-bg-secondary)',
  color: 'var(--portal-text)', fontSize: 13.5, fontWeight: 600,
};
