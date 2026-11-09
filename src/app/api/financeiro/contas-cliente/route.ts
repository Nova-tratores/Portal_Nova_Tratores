// GET /api/financeiro/contas-cliente?chave=<cpf/cnpj ou CONTA:cod>&situacao=abertos|todos&de&ate
// Títulos a pagar e a receber da pessoa nas duas empresas, lidos do ESPELHO
// (contas_pagar / contas_receber) + regra de juros de cada empresa. Só leitura.
import { NextRequest, NextResponse } from 'next/server';
import { protegerRota } from '@/lib/ajustes/permissao-server';
import { lerRegras, pessoaPorChave, titulosDaPessoa } from '@/lib/financeiro/contas-cliente-server';

export const dynamic = 'force-dynamic';
const ISO_DIA = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'financeiro', acao: 'contas-cliente' }]);
  if (g.resposta) return g.resposta;
  const sp = req.nextUrl.searchParams;
  const chave = (sp.get('chave') || '').trim();
  if (!chave) return NextResponse.json({ ok: false, erro: 'Escolha o cliente ou fornecedor' }, { status: 400 });
  const situacao = sp.get('situacao') === 'todos' ? 'todos' : 'abertos';
  const de = ISO_DIA.test(sp.get('de') || '') ? sp.get('de')! : undefined;
  const ate = ISO_DIA.test(sp.get('ate') || '') ? sp.get('ate')! : undefined;
  try {
    const pessoa = await pessoaPorChave(chave);
    if (!pessoa) return NextResponse.json({ ok: false, erro: 'Cadastro não encontrado' }, { status: 404 });
    const [{ titulos, sincronizadoEm }, { regras, migracaoFaltando }] = await Promise.all([
      titulosDaPessoa(pessoa.codigos, { situacao, de, ate }),
      lerRegras(),
    ]);
    return NextResponse.json({ ok: true, pessoa, titulos, sincronizadoEm, regras, migracaoFaltando, situacao });
  } catch (e) {
    console.error('[contas-cliente] GET', e);
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : 'Erro ao ler as contas' }, { status: 500 });
  }
}
