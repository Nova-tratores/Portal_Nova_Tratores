// NFS-e de serviço por OS, para os modos Relação e Dashboard do /pos.
// Lê SÓ o cache que o dashboard de vendas mantém (os_nfse + os_servicos_itens)
// — nenhuma chamada à Omie. Devolve um mapa pelo nº da OS na Omie (sem zeros à
// esquerda), que a tela cola nos cards por `Ordem_Omie`. Rota separada do
// kanban para não pesar o carregamento dos cards.
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";
import { exigirAcessoModulo } from "@/lib/ajustes/permissao-server";
import { chaveNumOS, type MapaNfse } from "@/lib/pos/nota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// O POS envia as OS para a conta principal da Omie (OMIE_APP_KEY) = NOVA.
const CONTA_POS = "NOVA";
const PAGINA = 1000; // teto do PostgREST
const CACHE_MS = 5 * 60 * 1000;
let cache: { em: number; mapa: MapaNfse } | null = null;

async function lerTudo<T>(tabela: string, colunas: string, ordem: string): Promise<T[]> {
  const todas: T[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await supabase.from(tabela).select(colunas).eq("conta_omie", CONTA_POS)
      .order(ordem, { ascending: true }).range(de, de + PAGINA - 1);
    if (error) throw new Error(`${tabela}: ${error.message}`);
    todas.push(...((data || []) as T[]));
    if (!data || data.length < PAGINA) break;
  }
  return todas;
}

async function montarMapa(): Promise<MapaNfse> {
  const [notas, itens] = await Promise.all([
    lerTudo<{ ncod_os: number; num_os: string | null; nfse_num: string | null; tem_nota: boolean }>("os_nfse", "ncod_os,num_os,nfse_num,tem_nota", "ncod_os"),
    lerTudo<{ ncod_os: number; numero_os: string; valor_total: number }>("os_servicos_itens", "ncod_os,numero_os,valor_total", "id"),
  ]);
  const mapa: MapaNfse = {};
  const chavePorCod = new Map<number, string>();
  for (const n of notas) {
    const k = chaveNumOS(n.num_os);
    if (!k) continue;
    chavePorCod.set(Number(n.ncod_os), k);
    mapa[k] = { temNota: !!n.tem_nota, nfseNum: n.nfse_num || null, valorServico: null };
  }
  for (const it of itens) {
    const k = chavePorCod.get(Number(it.ncod_os)) || chaveNumOS(it.numero_os);
    if (!k) continue;
    const alvo = (mapa[k] ||= { temNota: null, nfseNum: null, valorServico: null });
    alvo.valorServico = Math.round(((alvo.valorServico || 0) + (Number(it.valor_total) || 0)) * 100) / 100;
  }
  return mapa;
}

export async function GET(req: NextRequest) {
  try {
    await exigirAcessoModulo(req, "pos");
  } catch (e) {
    const st = (e as { http?: number })?.http || 401;
    return NextResponse.json({ error: e instanceof Error ? e.message : "não autenticado" }, { status: st });
  }
  try {
    if (!cache || Date.now() - cache.em > CACHE_MS) cache = { em: Date.now(), mapa: await montarMapa() };
    return NextResponse.json({ mapa: cache.mapa });
  } catch (e) {
    // Cache de NFS-e fora do ar não derruba a tela: a separação pelo selo continua valendo.
    return NextResponse.json({ mapa: {}, aviso: e instanceof Error ? e.message : String(e) });
  }
}
