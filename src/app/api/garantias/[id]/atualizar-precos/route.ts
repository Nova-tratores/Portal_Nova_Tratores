import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import { TBL_GARANTIAS, TBL_GAR_PECAS } from '@/lib/garantias/constants';
import { TBL_OS, TBL_ITENS } from '@/lib/pos/constants';
import { registrarEvento } from '@/lib/garantias/server';

// POST /api/garantias/[id]/atualizar-precos
// Recalcula preco_unitario das peças da garantia consultando o PPV/movimentações
// e o PecasInfo do relatório técnico. Útil para garantias antigas que foram
// criadas com preço zerado.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const ator = body.ator || 'Garantista';

  const { data: g } = await supabase
    .from(TBL_GARANTIAS)
    .select('id, numero, id_ordem, ppv_ids')
    .eq('id', id)
    .maybeSingle();
  if (!g) return NextResponse.json({ error: 'Garantia não encontrada.' }, { status: 404 });

  // Carrega peças atuais da garantia
  const { data: pecas } = await supabase
    .from(TBL_GAR_PECAS)
    .select('id, cod_produto, descricao, quantidade, preco_unitario')
    .eq('garantia_id', id);
  if (!pecas || pecas.length === 0) {
    return NextResponse.json({ ok: true, atualizadas: 0, total: 0 });
  }

  // Monta tabela de preços: cruza PPV (movimentacoes) + PecasInfo (manual)
  const ppvIds = String(g.ppv_ids || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // Se ppv_ids vazio, busca da OS
  let idsPPV = ppvIds;
  if (idsPPV.length === 0) {
    const { data: osRow } = await supabase
      .from(TBL_OS)
      .select('ID_PPV')
      .eq('Id_Ordem', g.id_ordem)
      .maybeSingle();
    idsPPV = String((osRow as { ID_PPV?: string } | null)?.ID_PPV || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // 1) Preços do PPV via movimentacoes
  // `reqId` opcional: se a entrada veio de uma Requisicao, guardamos o id
  // pra atualizar o cod_produto da peça da garantia para "REQ-{id}"
  // (retroativamente — garantias antigas perdiam essa correlação).
  type Entrada = { preco: number; descricao: string; reqId?: number };
  const precosPorCod: Record<string, Entrada> = {};
  if (idsPPV.length > 0) {
    const { data: itens } = await supabase.from(TBL_ITENS).select('*').in('Id_PPV', idsPPV);
    const resumo: Record<string, { descricao: string; qtde: number; totalFin: number }> = {};
    (itens || []).forEach((item: { CodProduto?: string; Descricao?: string; Qtde?: string; Preco?: string; TipoMovimento?: string }) => {
      const cod = String(item.CodProduto || '');
      const tipo = String(item.TipoMovimento || '').toLowerCase();
      const preco = parseFloat(item.Preco || '0');
      let qtd = Math.abs(parseFloat(item.Qtde || '0'));
      if (tipo.includes('devolu')) qtd = -qtd;
      if (!resumo[cod]) resumo[cod] = { descricao: item.Descricao || cod, qtde: 0, totalFin: 0 };
      resumo[cod].qtde += qtd;
      resumo[cod].totalFin += preco * qtd;
    });
    Object.entries(resumo).forEach(([cod, p]) => {
      if (p.qtde !== 0) {
        precosPorCod[cod] = {
          preco: p.totalFin / p.qtde,
          descricao: p.descricao,
        };
      }
    });
  }

  // 2) Requisições vinculadas à OS (valor_cobrado_cliente)
  // Indexa por TÍTULO e por OBSERVAÇÃO/MOTIVO — peças escritas só com palavra-
  // chave ("Mangueira") cruzam com requisições mais descritivas
  // ("PRENSAR MANGUEIRA PARA TRATOR DE CLIENTE").
  // Parser BR-aware: respeita o sentido do ponto/vírgula.
  //   "86,70" → 86.70   |   "1.234,56" → 1234.56   |   "86.70" → 86.70
  const parseValorBR = (v: unknown): number => {
    if (v == null) return 0;
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    const s = String(v).trim();
    if (!s) return 0;
    // Se tem vírgula, vírgula é decimal (formato BR). Ponto vira separador
    // de milhar e é removido. Caso contrário, mantém como veio (formato US).
    const normalizado = s.includes(',')
      ? s.replace(/\./g, '').replace(',', '.')
      : s;
    const n = parseFloat(normalizado);
    return isNaN(n) ? 0 : n;
  };
  const { data: reqs } = await supabase
    .from('Requisicao')
    .select('id, titulo, obs, Motivo, valor_cobrado_cliente')
    .eq('ordem_servico', g.id_ordem)
    .not('status', 'in', '("lixeira","cancelada")');
  if (reqs && reqs.length > 0) {
    for (const r of reqs as { id: number; titulo?: string; obs?: string; Motivo?: string; valor_cobrado_cliente?: string | number }[]) {
      const valor = parseValorBR(r.valor_cobrado_cliente);
      if (!(valor > 0)) continue;
      const candidatos = [r.titulo, r.obs, r.Motivo]
        .map((s) => String(s || '').trim())
        .filter(Boolean);
      for (const desc of candidatos) {
        const key = `__desc:${desc.toLowerCase()}`;
        if (!precosPorCod[key]) {
          precosPorCod[key] = { preco: valor, descricao: desc, reqId: r.id };
        }
      }
      // Também indexa por REQ-{id} pra peças que já têm o cod_produto correto
      precosPorCod[`REQ-${r.id}`] = {
        preco: valor,
        descricao: candidatos[0] || `REQ-${r.id}`,
        reqId: r.id,
      };
    }
  }

  // 3) Preços das peças manuais (PecasInfo no relatório técnico)
  const { data: tec } = await supabase
    .from('Ordem_Servico_Tecnicos')
    .select('PecasInfo')
    .eq('Ordem_Servico', g.id_ordem)
    .maybeSingle();
  if ((tec as { PecasInfo?: string } | null)?.PecasInfo) {
    try {
      const arr = JSON.parse((tec as { PecasInfo: string }).PecasInfo);
      if (Array.isArray(arr)) {
        for (const p of arr) {
          if (!p || p.origem !== 'manual') continue;
          const cod = String(p.codigo || '').trim();
          const desc = String(p.descricao || '').trim();
          if (!cod && !desc) continue;
          const preco = Number(p.preco) || 0;
          if (preco <= 0) continue;
          if (cod && !precosPorCod[cod]) {
            precosPorCod[cod] = { preco, descricao: desc };
          }
          // também indexa por descricao pra fallback
          if (desc && !precosPorCod[`__desc:${desc.toLowerCase()}`]) {
            precosPorCod[`__desc:${desc.toLowerCase()}`] = { preco, descricao: desc };
          }
        }
      }
    } catch {
      /* PecasInfo inválido — ignora */
    }
  }

  // 4) Atualiza preço de cada peça da garantia (cruzamento: cod -> descricao exata -> descricao contida)
  // Quando o match veio de uma Requisicao, também atualiza o cod_produto pra
  // "REQ-{id}" — assim a próxima geração de SG já joga essa peça pra
  // "Serviços de Terceiros" automaticamente.
  let atualizadas = 0;
  for (const p of pecas) {
    const cod = String(p.cod_produto || '').trim();
    const desc = String(p.descricao || '').trim();
    const descLower = desc.toLowerCase();
    let entrada: Entrada | null = null;

    if (cod && precosPorCod[cod]) {
      entrada = precosPorCod[cod];
    } else if (desc && precosPorCod[`__desc:${descLower}`]) {
      entrada = precosPorCod[`__desc:${descLower}`];
    } else if (desc) {
      // fallback: descricao contida (ex.: peça "Mangueira" cruza com requisição "Mangueira intercooler")
      const chave = Object.keys(precosPorCod).find((k) => {
        if (!k.startsWith('__desc:')) return false;
        const candidato = k.slice('__desc:'.length);
        return candidato.includes(descLower) || descLower.includes(candidato);
      });
      if (chave) entrada = precosPorCod[chave];
    }

    if (!entrada) continue;
    const update: Record<string, unknown> = {};
    if (entrada.preco !== Number(p.preco_unitario)) {
      update.preco_unitario = entrada.preco;
    }
    if (entrada.reqId && cod !== `REQ-${entrada.reqId}`) {
      update.cod_produto = `REQ-${entrada.reqId}`;
    }
    if (Object.keys(update).length === 0) continue;

    const { error: upErr } = await supabase
      .from(TBL_GAR_PECAS)
      .update(update)
      .eq('id', p.id);
    if (!upErr) atualizadas++;
  }

  await registrarEvento(id, {
    tipo: 'precos_atualizados',
    ator,
    detalhe: `${atualizadas} peça(s) tiveram preço atualizado a partir do PPV/relatório técnico.`,
  });

  return NextResponse.json({ ok: true, atualizadas, total: pecas.length });
}
