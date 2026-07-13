// GET  → lista todos os serviços do cadastro Omie (conta NOVA), achatados.
// POST → aplica alterações em massa: recebe linhas editadas, compara com o
//        estado atual no Omie e chama AlterarCadastroServico só no que mudou.
//        "inativo" de serviço é read-only na API: tentamos e verificamos depois.
import { NextResponse } from 'next/server';
import { autenticar } from '@/lib/auth/server';
import {
  listarTodosServicos, servicoParaRow, diffServico, payloadServico,
  omieServicoCall, pausa, PAUSA_MS, type ServicoRow,
} from '@/lib/omie-massa/omie';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function checarAcesso(req: Request) {
  const auth = await autenticar(req);
  if (!auth) return { erro: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) };
  // Página vive no módulo Ajustes: aceita o módulo inteiro ('ajustes'), a ação
  // granular ('ajustes:omie-massa') e o id antigo ('omie-massa', compat).
  const permitido = auth.isAdmin || ['ajustes', 'ajustes:omie-massa', 'omie-massa'].some((m) => auth.modulos.includes(m));
  if (!permitido) {
    return { erro: NextResponse.json({ error: 'Sem permissão (ajustes:omie-massa)' }, { status: 403 }) };
  }
  return { auth };
}

export async function GET(req: Request) {
  const { erro } = await checarAcesso(req);
  if (erro) return erro;
  try {
    const servicos = await listarTodosServicos();
    return NextResponse.json({ servicos: servicos.map(servicoParaRow) });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

interface ResultadoItem { nCodServ: number; cCodigo: string; ok: boolean; erro?: string; campos: string[] }

export async function POST(req: Request) {
  const { erro } = await checarAcesso(req);
  if (erro) return erro;
  const body = await req.json().catch(() => null) as { alteracoes?: Array<Partial<ServicoRow>> } | null;
  const alteracoes = body?.alteracoes || [];
  if (!alteracoes.length) return NextResponse.json({ error: 'Nenhuma alteração enviada' }, { status: 400 });

  try {
    const atuais = new Map((await listarTodosServicos()).map((s) => [s.intListar.nCodServ, s]));
    const resultados: ResultadoItem[] = [];
    const comInativo: number[] = [];

    for (const row of alteracoes) {
      const atual = atuais.get(Number(row.nCodServ));
      if (!atual) {
        resultados.push({ nCodServ: Number(row.nCodServ), cCodigo: '', ok: false, erro: 'não existe no Omie', campos: [] });
        continue;
      }
      const mudancas = diffServico(row, atual);
      if (!mudancas.length) {
        resultados.push({ nCodServ: atual.intListar.nCodServ, cCodigo: atual.cabecalho.cCodigo, ok: true, campos: [] });
        continue;
      }
      try {
        await omieServicoCall('AlterarCadastroServico', payloadServico(row, atual, mudancas));
        resultados.push({ nCodServ: atual.intListar.nCodServ, cCodigo: atual.cabecalho.cCodigo, ok: true, campos: mudancas.map((m) => m.campo) });
        if (mudancas.some((m) => m.campo === 'inativo')) comInativo.push(atual.intListar.nCodServ);
      } catch (e: unknown) {
        resultados.push({ nCodServ: atual.intListar.nCodServ, cCodigo: atual.cabecalho.cCodigo, ok: false, erro: e instanceof Error ? e.message : String(e), campos: mudancas.map((m) => m.campo) });
      }
      await pausa(PAUSA_MS);
    }

    // Verifica se o Omie realmente aceitou mudar "inativo" (na doc é read-only)
    let inativoIgnorado: number[] = [];
    if (comInativo.length) {
      const depois = new Map((await listarTodosServicos()).map((s) => [s.intListar.nCodServ, s.info?.inativo ?? 'N']));
      inativoIgnorado = comInativo.filter((cod) => {
        const row = alteracoes.find((r) => Number(r.nCodServ) === cod);
        return row && depois.get(cod) !== String(row.inativo).toUpperCase();
      });
    }

    return NextResponse.json({ resultados, inativoIgnorado });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
