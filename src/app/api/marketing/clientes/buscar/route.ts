// =============================================================================
// Busca de cliente no cadastro Omie — irmã AUTENTICADA de /api/clientes/buscar.
//
// Por que não reusar a existente: aquela rota tem CORS aberto pro Chatwoot e
// NÃO exige token. Esta copia o algoritmo e acrescenta autenticar().
//
// O algoritmo: carrega a base paginada e filtra em JS com normalização de
// acento, porque o ilike do Postgres não ignora acento — "Jose" não acha
// "José". Cache em memória de 5 min (o portal roda como processo longo).
//
// A chave devolvida é o PAR (cod_cli, empresa): o mesmo número existe na NOVA
// e na CASTRO.
// =============================================================================
import { NextResponse } from 'next/server';
import { guardar, erroResposta } from '@/lib/marketing/rota';
import { db, normalizar } from '@/lib/marketing/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ClienteCache {
  cod_cli: number;
  empresa: string;
  razao_social: string | null;
  nome_fantasia: string | null;
  cnpj_cpf: string | null;
  cidade: string | null;
  estado: string | null;
  telefone: string | null;
  _nome: string;    // normalizado
  _digitos: string; // só os dígitos do documento
}

const TTL = 5 * 60_000;
let cache: ClienteCache[] | null = null;
let cacheEm = 0;

async function carregarBase(): Promise<ClienteCache[]> {
  if (cache && Date.now() - cacheEm < TTL) return cache;

  const out: ClienteCache[] = [];
  const PAGINA = 1000;
  for (let de = 0; ; de += PAGINA) {
    // .order() obrigatório: range() sem ordem estável REPETE linhas.
    const { data, error } = await db
      .from('portal_nt_clientes_cadastro_omie')
      .select('cod_cli, empresa, razao_social, nome_fantasia, cnpj_cpf, cidade, estado, telefone, inativo')
      .order('cod_cli')
      .range(de, de + PAGINA - 1);
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    const linhas = data ?? [];
    for (const c of linhas) {
      if (c.inativo === true || c.inativo === 'S') continue;
      out.push({
        cod_cli: Number(c.cod_cli),
        empresa: String(c.empresa || ''),
        razao_social: c.razao_social ?? null,
        nome_fantasia: c.nome_fantasia ?? null,
        cnpj_cpf: c.cnpj_cpf ?? null,
        cidade: c.cidade ?? null,
        estado: c.estado ?? null,
        telefone: c.telefone ?? null,
        _nome: normalizar(`${c.razao_social ?? ''} ${c.nome_fantasia ?? ''}`),
        _digitos: String(c.cnpj_cpf ?? '').replace(/\D/g, ''),
      });
    }
    if (linhas.length < PAGINA) break;
  }

  cache = out;
  cacheEm = Date.now();
  return out;
}

export async function GET(req: Request) {
  // A tela mobile do estande também busca cliente, então vale o módulo satélite.
  const g = await guardar(req, 'lead');
  if (g.resposta) return g.resposta;

  try {
    const url = new URL(req.url);
    const termo = (url.searchParams.get('q') || '').trim();
    if (termo.length < 3) return NextResponse.json({ clientes: [] });

    const base = await carregarBase();
    const alvo = normalizar(termo);
    const digitos = termo.replace(/\D/g, '');

    const achados = base.filter((c) =>
      c._nome.includes(alvo) || (digitos.length >= 3 && c._digitos.includes(digitos)),
    );

    return NextResponse.json({
      clientes: achados.slice(0, 20).map((c) => ({
        cod_cli: c.cod_cli,
        empresa: c.empresa,
        nome: c.razao_social || c.nome_fantasia || `Cliente ${c.cod_cli}`,
        fantasia: c.nome_fantasia,
        documento: c.cnpj_cpf,
        cidade: c.cidade,
        estado: c.estado,
        telefone: c.telefone,
      })),
      total: achados.length,
    });
  } catch (e) {
    return erroResposta(e, 'GET /clientes/buscar');
  }
}
