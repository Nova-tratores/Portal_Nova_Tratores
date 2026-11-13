import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { consultarRecebimento, obterIdNfePorChave, obterDanfeDfe } from '@/lib/ajustes/omie';
import { protegerRota } from '@/lib/ajustes/permissao-server';
import { ACESSO_RECEBIMENTOS } from '@/lib/ajustes/recebimentos-espelho';
import { supabase } from '@/lib/ajustes/supabase';
import { BUCKET } from '@/lib/notas/cache-docs';

export const dynamic = 'force-dynamic';

// DANFE (PDF) + XML da NF-e de um recebimento, via DfeDocs/ObterNfe.
// Fluxo: chave (da query ou via ConsultarRecebimento) -> ConsultarNF por chave
// resolve o nIdNfe -> ObterNfe devolve cPdf/cXmlNfe. A NF so' vira consultavel
// DEPOIS de concluida (etapa 60); enquanto pendente respondemos { pendente:true }.
// 13/11/2026: antes de ir à Omie, procura a nota no arquivo do portal (notas_fiscais_docs,
// bucket privado notas-fiscais — o robô guarda PDF e XML de toda nota de entrada) e
// devolve um link assinado. A Omie fica só para a nota que ainda não foi guardada.
async function doArquivo(chave: string) {
  const { data } = await supabase.from('notas_fiscais_docs')
    .select('pdf_path,xml_path,numero').eq('tipo', 'entrada').eq('chave_nfe', chave)
    .not('pdf_path', 'is', null).limit(1).maybeSingle();
  if (!data?.pdf_path) return null;
  const st = supabase.storage.from(BUCKET);
  const pdf = await st.createSignedUrl(data.pdf_path, 600);
  if (!pdf.data?.signedUrl) return null;
  const xml = data.xml_path ? await st.createSignedUrl(data.xml_path, 600) : null;
  return { url: pdf.data.signedUrl, xml: xml?.data?.signedUrl || null, numero: data.numero || null };
}

// GET ?conta=NOVA&chave=<44 digitos>
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await protegerRota(req, ACESSO_RECEBIMENTOS);
  if (g.resposta) return g.resposta;
  const conta = parseConta(req.nextUrl.searchParams.get('conta')) ?? CONTA_DEFAULT;
  try {
    const { id } = await params;
    let chave = (req.nextUrl.searchParams.get('chave') || '').replace(/\D/g, '');
    if (!chave) {
      const rec = await consultarRecebimento(conta, id);
      chave = (rec.chaveNFe || '').replace(/\D/g, '');
    }
    if (!chave) return NextResponse.json({ erro: 'NF-e sem chave de acesso.' }, { status: 400 });

    const guardado = await doArquivo(chave).catch(() => null);
    if (guardado) return NextResponse.json({ ...guardado, chave, origem: 'portal' });

    const nIdNfe = await obterIdNfePorChave(conta, chave);
    if (!nIdNfe) {
      return NextResponse.json({
        pendente: true,
        msg: 'O DANFE fica disponível depois de dar entrada (concluir) o recebimento. Enquanto isso, use "copiar chave" para consultar na SEFAZ.',
      });
    }
    const d = await obterDanfeDfe(conta, nIdNfe);
    if (!d.url) return NextResponse.json({ erro: d.status || 'DANFE não disponível na Omie.' });
    return NextResponse.json({ url: d.url, xml: d.xml || null, chave: d.chave || chave, numero: d.numero || null, origem: 'omie' });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
