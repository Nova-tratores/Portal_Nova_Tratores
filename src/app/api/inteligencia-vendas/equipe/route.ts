/* eslint-disable @typescript-eslint/no-explicit-any */
// GET /api/inteligencia-vendas/equipe — placar da equipe comercial (supervisão):
// CRM dos vendedores (visitas, GPS, retroativas, retornos, negócios) + propostas
// do portal + vendas do Omie (12 m) + carteira da base. Cache de 10 min.
//   atualizar=1 → relê
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { paginar } from '@/lib/db/paginar';
import { carregarBase, emBanco, erroIV, guardarIV } from '@/lib/inteligencia-vendas/server';
import { montarEquipe } from '@/lib/inteligencia-vendas/equipe';
import { montarEventos } from '@/lib/inteligencia-vendas/painel-vendedores';
import { hojeBR, somarDias } from '@/lib/inteligencia-vendas/normalizar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function tudo(tabela: string, colunas: string, ordem: string): Promise<any[]> {
  const { data, error } = await paginar<any>((de, ate) => supabaseAdmin.from(tabela).select(colunas).order(ordem).range(de, ate) as any);
  if (error) throw new Error(`${tabela}: ${error.message}`);
  return data;
}

export async function GET(req: Request) {
  const g = await guardarIV(req, 'equipe');
  if (g.resposta) return g.resposta;
  try {
    const atualizar = new URL(req.url).searchParams.get('atualizar') === '1';
    const { valor: { linhas, eventos, vendedores }, em } = await emBanco('equipe', 30 * 60_000, async () => {
      const [vendedores, visitas, negocios, propostas, pedidos, { clientes }] = await Promise.all([
        tudo('vendedores', 'id,nome,ativo', 'id'),
        tudo('vw_visitas_detalhadas', 'id,vendedor_id,propriedade_id,tipo,data_visita,latitude,retroativa,acionar_pos_vendas,pos_vendas_resolvido,data_proximo_contato,resumo,proximos_passos,cliente_nome,propriedade_nome,deleted_at', 'id'),
        tudo('negocios', 'id,vendedor_id,status,valor,updated_at', 'id'),
        tudo('v_formulario', 'id,Cliente,cliente_doc_norm,Cidade,Modelo,Marca,status,vendedor_id,vendedor_nome,criado_em,status_desde,proximo_contato,previsao_fechamento,validade,Valor_Total,em_aberto,motivo_perda_id,concorrente,concorrente_valor,fechado_em,termometro,dias_na_fase', 'id'),
        tudo('pedidos_venda_relatorio', 'vendedor,data_emissao,valor_total,categoria,cancelada,etapa,cliente', 'numero_venda'),
        carregarBase(atualizar),
      ]);
      const ativos = vendedores.filter((v: any) => v.ativo !== false && !/teste/i.test(v.nome));
      return {
        linhas: montarEquipe({ vendedores, visitas, negocios, propostas, pedidos, clientes, hoje: hojeBR() }),
        // eventos datados de 3 anos pra o painel por período (a tela soma, sem voltar ao banco)
        eventos: montarEventos({ vendedores: ativos, visitas, propostas, pedidos, desde: somarDias(hojeBR(), -3 * 366) }),
        vendedores: ativos.map((v: any) => ({ id: v.id, nome: v.nome })),
      };
    }, atualizar);
    return NextResponse.json({ linhas, eventos, vendedores, atualizadoEm: em });
  } catch (e) {
    return erroIV(e, 'equipe');
  }
}
