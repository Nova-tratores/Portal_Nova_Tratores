/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

// Histórico de UMA peça na tela de Localização: o que cada pessoa marcou na
// conferência (✓ / em outro lugar / quantidade diferente), quando, e o que foi
// feito depois (moveu, tirou da posição, editou a locação, resultado da contagem).
// Fontes: audit_log (sistema 'localizacao' = conferências; 'caracteristicas' =
// gravações de #PRATELEIRA/#ANDAR/#CAIXA) + inventario_tarefas/contagens/ajustes.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const CHAVES_LOC = new Set(['#prateleira', '#andar', '#caixa', '#andar2', '#caixa2']);
const normK = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

export interface EventoHistorico {
  em: string;
  quem: string | null;
  tipo: 'conferido' | 'outro_lugar' | 'limpou' | 'pediu_contagem' | 'moveu' | 'tirou' | 'editou' | 'contagem';
  texto: string;
}

// GET ?empresa=NOVA&codigo_produto=123&sku=RP-...
export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const empresa = String(sp.get('empresa') || '').toUpperCase();
  const cp = String(sp.get('codigo_produto') || '');
  const sku = String(sp.get('sku') || '').trim();
  if (!empresa || !cp) return NextResponse.json({ erro: 'empresa e codigo_produto são obrigatórios' }, { status: 400 });

  try {
    const eventos: EventoHistorico[] = [];

    const { data: logs, error } = await supabase
      .from('audit_log')
      .select('created_at, user_nome, sistema, acao, detalhes')
      .eq('entidade_id', `${empresa}:${cp}`)
      .in('sistema', ['localizacao', 'caracteristicas'])
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) throw error;

    // gravações de locação: uma linha por característica → agrupa por (pessoa, ação, segundo)
    const grupos = new Map<string, { em: string; quem: string; acao: string; mud: string[] }>();
    for (const l of logs || []) {
      const d = (l as any).detalhes || {};
      if (l.sistema === 'localizacao') {
        const pos = d.posicao ? ` (posição ${String(d.posicao).split('|').filter(Boolean).join(' · ')})` : '';
        if (l.acao === 'pedir_contagem') {
          const c = d.contagem || {};
          const extra = c.ok === false ? ` — falhou: ${c.erro || 'erro'}` : c.jaExistia ? ' — já estava na contagem' : '';
          eventos.push({ em: l.created_at, quem: l.user_nome, tipo: 'pediu_contagem', texto: `Marcou quantidade diferente${pos} e mandou para a contagem${extra}` });
        } else if (d.status === 'conferido') {
          eventos.push({ em: l.created_at, quem: l.user_nome, tipo: 'conferido', texto: `Marcou confere${pos}` });
        } else if (d.status === 'divergente') {
          eventos.push({ em: l.created_at, quem: l.user_nome, tipo: 'outro_lugar', texto: `Marcou em outro lugar${pos}` });
        } else {
          eventos.push({ em: l.created_at, quem: l.user_nome, tipo: 'limpou', texto: `Desmarcou a conferência${pos}` });
        }
        continue;
      }
      if (!CHAVES_LOC.has(normK(d.caracteristica))) continue;
      const k = `${l.user_nome}|${l.acao}|${String(l.created_at).slice(0, 16)}`;
      const g = grupos.get(k) || { em: l.created_at, quem: l.user_nome, acao: l.acao, mud: [] as string[] };
      g.mud.push(`${String(d.caracteristica).replace('#', '')} ${d.de || '—'} → ${d.para || '—'}`);
      grupos.set(k, g);
    }
    for (const g of grupos.values()) {
      const tipo = g.acao === 'localizacao-liberar' ? 'tirou' : g.acao === 'localizacao-definir' ? 'moveu' : 'editou';
      const verbo = tipo === 'tirou' ? 'Tirou da posição' : tipo === 'moveu' ? 'Mudou a posição' : 'Editou a locação';
      eventos.push({ em: g.em, quem: g.quem, tipo, texto: `${verbo}: ${g.mud.join(', ')}` });
    }

    if (sku) {
      const { data: tarefas } = await supabase.from('inventario_tarefas')
        .select('id, status, criado_em').eq('sku', sku).order('id', { ascending: false }).limit(20);
      const ids = (tarefas || []).map((t: any) => t.id);
      if (ids.length) {
        const [{ data: conts }, { data: ajs }] = await Promise.all([
          supabase.from('inventario_contagens').select('tarefa_id, num, qtd_contada, contado_por, contado_em').in('tarefa_id', ids),
          supabase.from('inventario_ajustes').select('tarefa_id, divergencia, status').in('tarefa_id', ids),
        ]);
        for (const c of conts || []) {
          eventos.push({ em: (c as any).contado_em, quem: (c as any).contado_por, tipo: 'contagem',
            texto: `${(c as any).num > 1 ? 'Recontou' : 'Contou'}: ${(c as any).qtd_contada} un. (contagem #${(c as any).tarefa_id})` });
        }
        for (const t of tarefas || []) {
          const aj = (ajs || []).find((a: any) => a.tarefa_id === (t as any).id);
          const st = (t as any).status;
          if (st === 'conciliada') {
            const em = (conts || []).filter((c: any) => c.tarefa_id === (t as any).id).map((c: any) => c.contado_em).sort().pop() || (t as any).criado_em;
            eventos.push({ em, quem: null, tipo: 'contagem', texto: aj
              ? `Contagem #${(t as any).id} concluída: diferença de ${aj.divergencia > 0 ? '+' : ''}${aj.divergencia} un. — ajuste ${aj.status}`
              : `Contagem #${(t as any).id} concluída: quantidade bate` });
          } else if (st === 'recontagem') {
            eventos.push({ em: (t as any).criado_em, quem: null, tipo: 'contagem', texto: `Contagem #${(t as any).id}: diferença grande, aguardando recontagem` });
          }
        }
      }
    }

    eventos.sort((a, b) => String(b.em).localeCompare(String(a.em)));
    return NextResponse.json({ eventos });
  } catch (e) {
    console.error('[localizacao/historico] erro:', (e as Error).message);
    return NextResponse.json({ erro: 'Falha ao carregar o histórico.' }, { status: 500 });
  }
}
