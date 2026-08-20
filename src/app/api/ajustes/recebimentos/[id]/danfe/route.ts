import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { consultarRecebimento, obterIdNfePorChave, obterDanfeDfe } from '@/lib/ajustes/omie';

export const dynamic = 'force-dynamic';

// DANFE (PDF) + XML da NF-e de um recebimento, via DfeDocs/ObterNfe.
// Fluxo: chave (da query ou via ConsultarRecebimento) -> ConsultarNF por chave
// resolve o nIdNfe -> ObterNfe devolve cPdf/cXmlNfe. A NF so' vira consultavel
// DEPOIS de concluida (etapa 60); enquanto pendente respondemos { pendente:true }.
// GET ?conta=NOVA&chave=<44 digitos>
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta')) ?? CONTA_DEFAULT;
  try {
    const { id } = await params;
    let chave = (req.nextUrl.searchParams.get('chave') || '').replace(/\D/g, '');
    if (!chave) {
      const rec = await consultarRecebimento(conta, id);
      chave = (rec.chaveNFe || '').replace(/\D/g, '');
    }
    if (!chave) return NextResponse.json({ erro: 'NF-e sem chave de acesso.' }, { status: 400 });

    const nIdNfe = await obterIdNfePorChave(conta, chave);
    if (!nIdNfe) {
      return NextResponse.json({
        pendente: true,
        msg: 'O DANFE fica disponível depois de dar entrada (concluir) o recebimento. Enquanto isso, use "copiar chave" para consultar na SEFAZ.',
      });
    }
    const d = await obterDanfeDfe(conta, nIdNfe);
    if (!d.url) return NextResponse.json({ erro: d.status || 'DANFE não disponível na Omie.' });
    return NextResponse.json({ url: d.url, xml: d.xml || null, chave: d.chave || chave, numero: d.numero || null });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
