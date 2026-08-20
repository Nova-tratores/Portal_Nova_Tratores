'use client';
// Estoque de Desova — ordenado pela dor: o chassi mais velho primeiro,
// com a sangria por dia visível. É a tela que muda a conversa de desconto.
import Ideia from '@/components/crm/Ideia';
import {
  MAQUINAS, diasDesde, faixaDe, custoPatio, custoTotal, pisoVendedor,
  sangriaDia, brl, brl2, TAXA_PATIO_MES,
} from '@/lib/crm/demo';

export default function EstoquePage() {
  const linhas = [...MAQUINAS].sort((a, b) => diasDesde(b.entradaPatio) - diasDesde(a.entradaPatio));
  const sangriaTotal = linhas.filter((m) => m.status !== 'vendida').reduce((s, m) => s + sangriaDia(m), 0);

  return (
    <div style={{ maxWidth: 1060, margin: '0 auto', padding: '20px 16px 60px', color: 'var(--portal-text)' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 10 }}>Estoque de Desova</h1>

      <Ideia titulo="A ideia desta tela">
        O custo do chassi é <b>congelado</b> quando ele entra no pátio, e daí em diante ele &quot;sangra&quot;{' '}
        <b>{(TAXA_PATIO_MES * 100).toFixed(1).replace('.', ',')}% ao mês</b> (custo de capital parado). O{' '}
        <b>piso do vendedor</b> = custo real de hoje + margem mínima da faixa de idade — repare que a margem
        exigida CAI conforme o chassi envelhece (12% → 8% → 5% → 2,5% → 0%), enquanto o multiplicador de comissão
        SOBE (1× → 2×). Piso e custo <b>nunca</b> aparecem pro cliente — a proposta só mostra o valor proposto.
        Hoje o pátio desta demonstração sangra <b style={{ color: '#dc2626' }}>{brl2(sangriaTotal)}/dia</b>.
      </Ideia>

      <div style={{ overflowX: 'auto', border: '1px solid var(--portal-border)', borderRadius: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 900 }}>
          <thead>
            <tr style={{ background: 'var(--portal-bg-secondary)', textAlign: 'left' }}>
              {['Chassi / Modelo', 'Dias de pátio', 'Faixa', 'Sangria/dia', 'Custo congelado', '+ Pátio acumulado', 'Custo real hoje', 'Piso do vendedor', 'Tabela', 'Margem potencial', 'Comissão'].map((h) => (
                <th key={h} style={{ padding: '10px 12px', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--portal-text-secondary)', whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((m) => {
              const dias = diasDesde(m.entradaPatio);
              const f = faixaDe(dias);
              const patio = custoPatio(m.custoAquisicao, dias);
              const total = custoTotal(m);
              const piso = pisoVendedor(m);
              const margem = m.valorTabela - total;
              return (
                <tr key={m.id} style={{ borderTop: '1px solid var(--portal-border)' }}>
                  <td style={{ padding: '10px 12px' }}>
                    <b>{m.modelo}</b>
                    <div style={{ fontSize: 11.5, color: 'var(--portal-text-secondary)' }}>
                      {m.chassi} · {m.condicao}{m.status === 'reservada' ? ' · RESERVADA' : ''}
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px', fontWeight: 800, fontSize: 15 }}>{dias}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ padding: '3px 10px', borderRadius: 99, background: f.cor, color: '#fefefe', fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap' }}>
                      {f.rotulo}
                    </span>
                    <div style={{ fontSize: 11, color: 'var(--portal-text-secondary)', marginTop: 3 }}>
                      margem mín. {(f.margemMin * 100).toFixed(1).replace('.', ',')}% · comissão {f.fator}×
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#dc2626', fontWeight: 800, whiteSpace: 'nowrap' }}>{brl2(sangriaDia(m))}</td>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{brl(m.custoAquisicao)}</td>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: '#dc2626' }}>+ {brl(patio)}</td>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', fontWeight: 700 }}>{brl(total)}</td>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', fontWeight: 700, color: '#1B7A5F' }}>{brl(piso)}</td>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{brl(m.valorTabela)}</td>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', fontWeight: 700, color: margem > 0 ? '#1B7A5F' : '#dc2626' }}>{brl(margem)}</td>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', fontWeight: 800 }}>{f.fator}×</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 16 }}>
        <Ideia titulo="Exemplo de leitura (primeira linha)">
          O chassi mais velho já &quot;comeu&quot; o pátio acumulado inteiro em custo — por isso a faixa dele libera
          margem mínima menor (ou zero) e paga comissão dobrada: <b>vale mais a pena pro vendedor E pra empresa
          vender ele HOJE com desconto do que o chassi novo com margem cheia</b>. Ver a sangria em R$/dia muda a
          conversa de desconto: &quot;segurar 30 dias pra tentar R$ 5 mil a mais&quot; custa R$ 4,5 mil de pátio.
        </Ideia>
      </div>
    </div>
  );
}
