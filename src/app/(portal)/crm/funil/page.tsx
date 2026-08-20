'use client';
// Funil — Kanban de gestão. Demonstra a alçada automática de desconto e a
// trava que impede fechar "ganho" com aprovação pendente.
import { useState } from 'react';
import Ideia from '@/components/crm/Ideia';
import {
  DEALS, ESTAGIOS, lead, maquina, pisoVendedor, custoTotal,
  alcadaRequerida, valorPonderado, brl,
} from '@/lib/crm/demo';

export default function FunilPage() {
  const [aviso, setAviso] = useState<string | null>(null);
  const abertos = DEALS.filter((d) => !d.ganho && !d.perdido);

  const tentarFechar = (codigo: string, pendente: boolean, alcada: string) => {
    setAviso(
      pendente
        ? `⛔ ${codigo}: o banco de dados RECUSA o fechamento — o desconto exige aprovação de ${alcada.toUpperCase()} e ela ainda está pendente. (No sistema real é uma exception na trigger, não um aviso de tela.)`
        : `✓ ${codigo}: pode fechar — o valor está acima do piso do vendedor, nenhuma aprovação é necessária.`
    );
  };

  return (
    <div style={{ padding: '20px 16px 60px', color: 'var(--portal-text)' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 10 }}>Funil de Vendas</h1>

      <div style={{ maxWidth: 980 }}>
        <Ideia titulo="A ideia desta tela">
          Tela do <b>gestor</b> (o vendedor vive no Roteiro). Cada estágio tem SLA próprio — proposta e negociação
          são onde os R$ 2M se ganham (2–3 dias), crédito tem a latência do banco (7 dias). O selo{' '}
          <b style={{ color: '#f59e0b' }}>⚠ alçada</b> aparece sozinho quando o valor negociado fica abaixo do piso:
          entre piso e custo real → gestor decide; abaixo do custo real (break-even) → só diretoria.
          Experimente o botão <b>Fechar ganho</b> num card com alçada pendente.
        </Ideia>
      </div>

      {aviso && (
        <div
          style={{
            maxWidth: 980, marginBottom: 14, padding: '10px 14px', borderRadius: 8, fontSize: 13.5,
            background: 'var(--portal-bg-card)', border: '1px solid #f59e0b', fontWeight: 600,
          }}
        >
          {aviso}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 12 }}>
        {ESTAGIOS.map((e) => {
          const cards = abertos.filter((d) => d.estagio === e.codigo);
          const total = cards.reduce((s, d) => s + (d.valorNegociado ?? 0), 0);
          const pond = cards.reduce((s, d) => s + valorPonderado(d), 0);
          return (
            <div key={e.codigo} style={{ minWidth: 265, flexShrink: 0 }}>
              <div
                style={{
                  background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)',
                  borderTop: '4px solid #1B7A5F', borderRadius: '8px 8px 0 0', padding: '10px 12px',
                }}
              >
                <div style={{ fontWeight: 800, fontSize: 13.5 }}>{e.nome}</div>
                <div style={{ fontSize: 12, color: 'var(--portal-text-secondary)', marginTop: 2 }}>
                  {cards.length} · {brl(total)} · pond. {brl(pond)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--portal-text-secondary)' }}>
                  SLA {e.sla}d · destrava: {e.dono} · {Math.round(e.prob * 100)}%
                </div>
              </div>
              <div
                style={{
                  background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)',
                  borderTop: 'none', borderRadius: '0 0 8px 8px', padding: 8,
                  display: 'grid', gap: 8, minHeight: 90,
                }}
              >
                {cards.map((d) => {
                  const l = lead(d.leadId);
                  const m = maquina(d.maquinaId);
                  const alcada = m && d.valorNegociado ? alcadaRequerida(m, d.valorNegociado) : 'vendedor';
                  const pendente = d.aprovacao === 'pendente';
                  return (
                    <div
                      key={d.id}
                      style={{
                        background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)',
                        borderRadius: 8, padding: '10px 12px', fontSize: 12.5,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                        <b style={{ fontSize: 13 }}>{l.nome}</b>
                        <span style={{ color: 'var(--portal-text-secondary)' }}>{d.codigo.slice(-4)}</span>
                      </div>
                      <div style={{ color: 'var(--portal-text-secondary)' }}>
                        {l.municipio}{m ? ` · ${m.modelo}` : ''}
                      </div>
                      <div style={{ marginTop: 4, fontWeight: 700 }}>
                        {d.valorNegociado ? brl(d.valorNegociado) : '—'}
                      </div>
                      {m && d.valorNegociado && (
                        <div style={{ fontSize: 11.5, color: 'var(--portal-text-secondary)', marginTop: 2 }}>
                          piso {brl(pisoVendedor(m))} · custo real {brl(custoTotal(m))}
                        </div>
                      )}
                      {pendente && (
                        <div style={{ marginTop: 6, display: 'inline-block', padding: '2px 9px', borderRadius: 99, background: '#f59e0b', color: '#111111', fontSize: 11, fontWeight: 800 }}>
                          ⚠ alçada: {alcada}
                        </div>
                      )}
                      {d.aprovacao === 'aprovado' && (
                        <div style={{ marginTop: 6, display: 'inline-block', padding: '2px 9px', borderRadius: 99, background: '#1B7A5F', color: '#fefefe', fontSize: 11, fontWeight: 800 }}>
                          ✓ desconto aprovado (vale 1 vez)
                        </div>
                      )}
                      <button
                        onClick={() => tentarFechar(d.codigo, pendente, alcada)}
                        style={{
                          marginTop: 8, width: '100%', padding: '6px 0', borderRadius: 7, cursor: 'pointer',
                          border: pendente ? '1px solid #f59e0b' : '1px solid var(--portal-border)',
                          background: 'var(--portal-bg-secondary)', color: 'var(--portal-text)',
                          fontSize: 12, fontWeight: 700,
                        }}
                      >
                        Fechar ganho →
                      </button>
                    </div>
                  );
                })}
                {cards.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--portal-text-secondary)', textAlign: 'center', padding: 12 }}>
                    vazio
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ maxWidth: 980, marginTop: 8 }}>
        <Ideia titulo="Perdido exige motivo">
          Soltar um card em &quot;Perdido&quot; abre modal obrigatório de motivo (preço, crédito negado, comprou
          concorrente, adiou…). Esse campo é o que vai dizer, na semana 6, se o problema da operação é preço ou é banco —
          e aparece agregado no Painel do Gestor.
        </Ideia>
      </div>
    </div>
  );
}
