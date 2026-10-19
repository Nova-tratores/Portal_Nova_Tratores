// GET /api/inteligencia-vendas/retorno — fila "sem retorno": propostas do
// portal, negócios do CRM dos vendedores e retornos combinados nas visitas.
//   dias=15 → a partir de quantos dias parada conta (5..90)
// A fila fica pronta no banco (iv_snapshot): abre na hora e recalcula por trás após 30 min.
import { NextResponse } from 'next/server';
import { carregarFontes, emBanco, erroIV, guardarIV, TTL_BASE } from '@/lib/inteligencia-vendas/server';
import { montarFila, resumoPorVendedor } from '@/lib/inteligencia-vendas/retorno';
import { hojeBR } from '@/lib/inteligencia-vendas/normalizar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const g = await guardarIV(req, 'retorno');
  if (g.resposta) return g.resposta;
  try {
    const p = new URL(req.url).searchParams;
    const dias = Math.min(90, Math.max(5, Number(p.get('dias')) || 15));
    const forcar = p.get('atualizar') === '1';
    const { valor: itens } = await emBanco(`retorno:${dias}`, TTL_BASE, async () => {
      const f = await carregarFontes(forcar);
      const props = new Map(f.propriedadesNome.map((x: { id: number; nome_fantasia: string | null; razao_social: string | null; cidade: string | null }) =>
        [x.id, { nome: String(x.nome_fantasia || x.razao_social || ''), cidade: String(x.cidade || '') }]));
      const vend = new Map(f.vendedores.map((v) => [v.id, v.nome]));
      const todos = montarFila({
        propostas: f.propostas, negocios: f.negocios, visitas: f.visitasRetorno, hoje: hojeBR(), diasParada: dias,
        nomePropriedade: (id) => (id != null && props.get(id)) || { nome: '', cidade: '' },
        nomeVendedor: (id) => (id != null ? vend.get(id) || '' : ''),
      });
      // Negócios/visitas do vendedor de teste do CRM não entram na cobrança.
      return todos.filter((i) => !/teste/i.test(i.vendedor));
    }, forcar);
    return NextResponse.json({ itens, porVendedor: resumoPorVendedor(itens), dias });
  } catch (e) {
    return erroIV(e, 'retorno');
  }
}
