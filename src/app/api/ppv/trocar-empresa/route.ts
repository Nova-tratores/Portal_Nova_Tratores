import { NextRequest, NextResponse } from "next/server";
import { protegerRota, autorDe } from "@/lib/ajustes/permissao-server";
import { supabaseFetch } from "@/lib/ppv/supabase";
import { TBL_ITENS, TBL_PRODUTOS } from "@/lib/ppv/constants";
import { buscarPPVPorId, atualizarValorTotal, registrarLog } from "@/lib/ppv/queries";
import { TBL_SEM_COBRANCA } from "@/lib/ppv/sem-cobranca";

// "Mudar de empresa" de UMA peça do PPV (usado no drawer do PPV e na aba Produtos da OS).
// A peça passa pra outra conta (Nova ⇄ Castro) e pega o preço do cadastro de lá.
//  1ª chamada (confirmar=false): se o preço muda, devolve os dois preços pra tela perguntar.
//  2ª chamada (confirmar=true):  grava.
// Peça que não existe na outra empresa: NÃO muda; fica marcada (Sem_Cadastro_Em) na tela.

const NOVA = "Nova Tratores";
const CASTRO = "Castro Peças";
const ehCastro = (s?: string | null) => /castro|primari/i.test(s || "");
const curta = (e: string) => (ehCastro(e) ? "CASTRO" : "NOVA");

function erroColuna(e: unknown): NextResponse | null {
  const m = String((e as Error)?.message || "");
  if (/empresa|sem_cadastro/i.test(m) && /column|coluna/i.test(m)) {
    return NextResponse.json({ error: "Falta rodar o SQL sql/alter-movimentacoes-empresa.sql no Supabase." }, { status: 500 });
  }
  return null;
}

export async function POST(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: "ppv" }, { modulo: "pos" }]);
  if (g.resposta) return g.resposta;
  try {
    const body = await req.json();
    const id = String(body?.id || "").trim();
    const codigo = String(body?.codigo || "").trim();
    const confirmar = !!body?.confirmar;
    if (!id || !codigo) return NextResponse.json({ error: "id e codigo são obrigatórios" }, { status: 400 });

    const det = await buscarPPVPorId(id);
    if (!det) return NextResponse.json({ error: "PPV não encontrado" }, { status: 404 });
    if (det.faturadoOmieEm) return NextResponse.json({ error: "Pedido já faturado: não dá pra mudar a empresa da peça." }, { status: 409 });
    if (det.pedidoOmie) return NextResponse.json({ error: `O PPV já foi enviado ao Omie (pedido ${det.pedidoOmie}). A empresa já ficou definida lá.` }, { status: 409 });

    const p = det.produtos.find((x) => x.codigo === codigo);
    if (!p) return NextResponse.json({ error: `A peça ${codigo} não está neste PPV.` }, { status: 404 });

    const atual = ehCastro(p.empresa) ? CASTRO : NOVA;
    const destino = atual === CASTRO ? NOVA : CASTRO;
    const filtroDestino = destino === CASTRO ? "&Empresa=ilike.*castro*" : "&Empresa=not.ilike.*castro*";
    const cad = await supabaseFetch<Record<string, unknown>[]>(
      `${TBL_PRODUTOS}?Codigo_Produto=eq.${encodeURIComponent(codigo)}${filtroDestino}&select=Preco_Venda&limit=1`
    );
    const filtroItem = `${TBL_ITENS}?Id_PPV=eq.${encodeURIComponent(id)}&CodProduto=eq.${encodeURIComponent(codigo)}`;
    const autor = autorDe(g.user);

    // Não existe na outra empresa → não muda, só marca
    if (!cad || cad.length === 0) {
      try { await supabaseFetch(filtroItem, "PATCH", { Sem_Cadastro_Em: destino }); }
      catch (e) { const r = erroColuna(e); if (r) return r; throw e; }
      await registrarLog(id, `Tentou mudar ${codigo} para ${curta(destino)}: não cadastrado lá`, autor);
      return NextResponse.json({ naoCadastrado: true, destino: curta(destino), detalhes: await buscarPPVPorId(id) });
    }

    const precoAtual = p.semCobranca ? p.semCobranca.precoOriginal : p.preco;
    const precoCad = parseFloat(String(cad[0].Preco_Venda ?? 0)) || 0;
    // cadastro sem preço: mantém o preço que já está no pedido
    const precoDestino = precoCad > 0 ? precoCad : precoAtual;
    const mudaPreco = Math.abs(precoDestino - precoAtual) > 0.004;

    if (mudaPreco && !confirmar) {
      return NextResponse.json({ precisaConfirmar: true, atual: curta(atual), destino: curta(destino), precoAtual, precoDestino });
    }

    // Peça "não cobrada": as linhas ficam em 0; o preço novo vai pro preço original
    const patch: Record<string, unknown> = { Empresa: destino, Sem_Cadastro_Em: null };
    if (mudaPreco && !p.semCobranca) patch.Preco = precoDestino;
    try { await supabaseFetch(filtroItem, "PATCH", patch); }
    catch (e) { const r = erroColuna(e); if (r) return r; throw e; }
    if (mudaPreco && p.semCobranca) {
      await supabaseFetch(`${TBL_SEM_COBRANCA}?id_ppv=eq.${encodeURIComponent(id)}&cod_produto=eq.${encodeURIComponent(codigo)}`, "PATCH", { preco_original: precoDestino });
    }

    if (mudaPreco) await atualizarValorTotal(id);
    await registrarLog(id, `Mudou ${codigo} de ${curta(atual)} para ${curta(destino)}${mudaPreco ? ` (R$ ${precoAtual.toFixed(2)} → R$ ${precoDestino.toFixed(2)})` : ""}`, autor);
    return NextResponse.json({ ok: true, destino: curta(destino), mudouPreco: mudaPreco, detalhes: await buscarPPVPorId(id) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}
