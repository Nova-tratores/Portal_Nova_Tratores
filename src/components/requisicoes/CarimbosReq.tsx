// Carimbos do PDF da requisição (José, 25/11/2026). Usado pelo TemplatePDF
// (botão Imprimir do cartão) e pela página /requisicoes/imprimir/[id].
//  - NÃO AUTORIZADO: carimbão vermelho atravessado no meio da folha, quando o
//    Diretor recusou.
//  - PAGO: carimbo verde no canto de cima, à direita, com a caixinha "Foi pago?".
// Estilo inline (sem Tailwind) para sair igual nas duas telas. O pai precisa
// de position: relative.

const fmtData = (v: unknown) => {
  if (!v) return '';
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR');
};

export const naoAutorizada = (req: any) => req?.autorizacao_status === 'recusada' || req?.status === 'recusada';

export default function CarimbosReq({ req }: { req: any }) {
  if (!req) return null;
  const recusada = naoAutorizada(req);
  const pago = !!req.pago;
  if (!recusada && !pago) return null;

  return (
    <>
      {recusada && (
        <div style={{
          position: 'absolute', top: '42%', left: '50%', transform: 'translate(-50%, -50%) rotate(-22deg)',
          border: '8px solid #DC2626', borderRadius: 18, padding: '10px 34px', color: '#DC2626',
          textAlign: 'center', opacity: 0.85, zIndex: 20, pointerEvents: 'none', background: 'rgba(255,255,255,0.35)',
          whiteSpace: 'nowrap',
        }}>
          <div style={{ fontSize: 64, fontWeight: 900, letterSpacing: 4, lineHeight: 1.05 }}>NÃO AUTORIZADO</div>
          {(req.autorizacao_por || req.autorizacao_em) && (
            <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: 1, marginTop: 4, textTransform: 'uppercase' }}>
              {req.autorizacao_por ? `por ${req.autorizacao_por}` : ''}{req.autorizacao_em ? ` em ${fmtData(req.autorizacao_em)}` : ''}
            </div>
          )}
        </div>
      )}
      {pago && (
        <div style={{
          // ao lado do quadro "ID REQUISIÇÃO" (que fica colado no canto), sem tapar o número
          position: 'absolute', top: 10, right: 175, transform: 'rotate(-10deg)',
          border: '5px solid #059669', borderRadius: 12, padding: '4px 18px', color: '#059669',
          textAlign: 'center', zIndex: 21, pointerEvents: 'none', background: 'rgba(255,255,255,0.7)',
        }}>
          <div style={{ fontSize: 38, fontWeight: 900, letterSpacing: 4, lineHeight: 1 }}>PAGO</div>
          {req.pago_em && <div style={{ fontSize: 11, fontWeight: 800, marginTop: 2 }}>{fmtData(req.pago_em)}</div>}
        </div>
      )}
    </>
  );
}
