// GET /api/inteligencia-vendas/municipios — ranking "onde focar":
// IBGE (área plantada, valor da produção, bovinos) + CAR/SICOR (imóveis,
// crédito rural) + a nossa base (clientes, tratores, propostas, peças).
//   todos=1 → além dos 45 municípios da loja, toda cidade com 5+ clientes
import { NextResponse } from 'next/server';
import { carregarBase, emBanco, erroIV, guardarIV, TTL_BASE } from '@/lib/inteligencia-vendas/server';
import { centrosMunicipios, dadosAgro, dadosPublicos, municipiosDaLoja, municipiosIBGE } from '@/lib/inteligencia-vendas/ibge-server';
import { montarMunicipios } from '@/lib/inteligencia-vendas/municipios';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const g = await guardarIV(req, 'municipios');
  if (g.resposta) return g.resposta;
  try {
    const p = new URL(req.url).searchParams;
    const todos = p.get('todos') === '1';
    // pronto no banco (iv_snapshot): abre na hora e recalcula por trás após 30 min
    const { valor } = await emBanco(`municipios:${todos ? 1 : 0}`, TTL_BASE, () => montar(todos));
    return NextResponse.json(valor);
  } catch (e) {
    return erroIV(e, 'municipios');
  }
}

async function montar(todos: boolean) {
  {
    const { clientes } = await carregarBase();
    const ufs = [...new Set(['SP', 'PR', ...clientes.map((c) => c.uf).filter(Boolean)])];
    const ibge = await municipiosIBGE(ufs);
    const ibgeDaCidade = (k: string) => ibge.get(k)?.ibge ?? null;

    const daLoja = municipiosDaLoja();
    const lista = new Map(daLoja.map((m) => [m.ibge, { ibge: m.ibge, nome: m.nome, uf: 'SP', daLoja: true }]));
    if (todos) {
      const cont = new Map<number, number>();
      for (const c of clientes) { const i = ibgeDaCidade(c.chaveCidade); if (i) cont.set(i, (cont.get(i) || 0) + 1); }
      for (const m of ibge.values()) {
        if (!lista.has(m.ibge) && (cont.get(m.ibge) || 0) >= 5) lista.set(m.ibge, { ibge: m.ibge, nome: m.nome, uf: m.uf, daLoja: false });
      }
    }
    const municipios = [...lista.values()];
    const avisos: string[] = [];
    const [publicos, agro, centros] = await Promise.all([
      dadosPublicos(municipios.map((m) => m.ibge)).catch((e) => { avisos.push(String(e.message || e)); return new Map(); }),
      dadosAgro(),
      centrosMunicipios(),
    ]);
    if (agro.size === 0) avisos.push('Dados do CAR/crédito rural indisponíveis (tabelas agro_*).');
    const linhas = montarMunicipios({ municipios, publicos, agro, clientes, ibgeDaCidade }).map((m) => ({ ...m, centro: centros.get(m.ibge) ?? null }));
    const ano = [...publicos.values()].find((d) => d.ano)?.ano || '';
    return { municipios: linhas, anoIBGE: ano, avisos };
  }
}
