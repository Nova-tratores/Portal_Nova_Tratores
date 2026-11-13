// Tabela "Mapa de cotações" da folha impressa — usada pelo TemplatePDF (PC) e
// pela página /requisicoes/imprimir/[id] (celular). Estilo em linha para sair
// igual nas duas. Marca a INDICADA e a COMPRADA e mostra o link. (12/11/2026)
import { cotacoesPreenchidas, dominioDoLink, type Cotacao } from '@/lib/requisicoes/cotacoes';

const th: React.CSSProperties = { padding: 8, borderBottom: '2px solid #000', textAlign: 'left' };
const td: React.CSSProperties = { padding: 8, fontSize: 13, verticalAlign: 'top' };
const selo = (bg: string, cor: string): React.CSSProperties => ({
  display: 'inline-block', fontSize: 9, fontWeight: 900, padding: '1px 6px', borderRadius: 4,
  background: bg, color: cor, border: '1px solid #000', marginRight: 4, textTransform: 'uppercase',
});

export default function MapaCotacoesPDF({ cotacao, titulo = 'Mapa de Cotações' }: { cotacao: Cotacao; titulo?: string }) {
  const lista = cotacoesPreenchidas(cotacao);
  if (!lista.length) return null;
  const indicada = Number(cotacao.indicada) || null;
  const comprada = Number(cotacao.comprada) || null;
  const temMarca = !!(indicada || comprada);

  return (
    <div style={{ border: '2px solid #000', borderRadius: 16, overflow: 'hidden', marginBottom: 16, breakInside: 'avoid' }}>
      <div style={{ background: '#f1f5f9', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', padding: '8px 0', borderBottom: '2px solid #000', textAlign: 'center' }}>{titulo}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', background: '#f8fafc' }}>
            <th style={{ ...th, borderRight: '2px solid #000', width: '38%' }}>Fornecedor</th>
            <th style={{ ...th, borderRight: '2px solid #000' }}>Material/Serviço</th>
            <th style={{ ...th, textAlign: 'right', width: '18%' }}>Valor ofertado</th>
          </tr>
        </thead>
        <tbody>
          {lista.map(i => {
            const ehComprada = comprada === i;
            const link = dominioDoLink(cotacao[`link${i}`]);
            return (
              <tr key={i} style={{ borderBottom: '1px solid #e2e8f0', background: ehComprada ? '#ecfdf5' : undefined }}>
                <td style={{ ...td, borderRight: '2px solid #000' }}>
                  {(indicada === i || ehComprada) && (
                    <div style={{ marginBottom: 2 }}>
                      {indicada === i && <span style={selo('#fde68a', '#000')}>Indicada</span>}
                      {ehComprada && <span style={selo('#059669', '#fff')}>Comprada</span>}
                    </div>
                  )}
                  <span style={{ textTransform: 'uppercase', fontWeight: ehComprada ? 900 : 600 }}>{cotacao[`fornecedor${i}`] || `Cotação ${i}`}</span>
                  {link && <div style={{ fontSize: 10, color: '#1d4ed8' }}>🔗 {link}</div>}
                  {cotacao[`obs${i}`] && (
                    <div style={{ fontSize: 10, color: '#475569', whiteSpace: 'pre-wrap' }}>{cotacao[`obs${i}`]}</div>
                  )}
                </td>
                <td style={{ ...td, borderRight: '2px solid #000', textTransform: 'uppercase' }}>{cotacao[`servico_material${i}`]}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{cotacao[`valor${i}`] ? `R$ ${cotacao[`valor${i}`]}` : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {temMarca && (
        <div style={{ fontSize: 10, padding: '6px 8px', borderTop: '2px solid #000', background: '#f8fafc' }}>
          {indicada ? <>Indicada por <b>{cotacao.indicada_por || '—'}</b></> : 'Sem cotação indicada'}
          {' · '}
          {comprada ? <>comprada marcada por <b>{cotacao.comprada_por || '—'}</b></> : 'compra ainda não marcada'}
        </div>
      )}
    </div>
  );
}
