/* eslint-disable @typescript-eslint/no-explicit-any */
// /api/inteligencia-vendas/plano-safra — linhas de crédito do Plano Safra.
//   GET                     linhas (vigentes, propostas, últimas antigas), páginas vigiadas, quem confere
//   GET ?usuarios=1         usuários ativos do portal (para o modal "quem confere")
//   POST {acao:'verificar'}                  lê as páginas oficiais agora (quem confere ou admin)
//   POST {acao:'aprovar'|'rejeitar', programa}  quem confere ou admin
//   POST {acao:'salvar', linha}              cria/edita uma linha à mão (quem confere ou admin)
//   POST {acao:'apagar', id}                 idem
//   POST {acao:'conferentes', usuarios:[{id,nome}]}  escolhe quem confere (admin ou módulo inteiro)
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { erroIV, guardarIV, logIV, migracaoFaltando, nomeDoUsuario } from '@/lib/inteligencia-vendas/server';
import { aprovarPrograma, garantirPrimeiraLeitura, lerConferentes, primeiraLeituraRodando, rejeitarPrograma, salvarConferentes, verificarFontes } from '@/lib/inteligencia-vendas/plano-safra-server';
import { safraAtual, validarLinhas } from '@/lib/inteligencia-vendas/plano-safra';
import { hojeBR } from '@/lib/inteligencia-vendas/normalizar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: Request) {
  // leitura liberada a quem tem o módulo (as taxas aparecem em Notícias e na Calculadora)
  const g = await guardarIV(req);
  if (g.resposta) return g.resposta;
  try {
    if (new URL(req.url).searchParams.get('usuarios') === '1') {
      const { data, error } = await supabaseAdmin.from('financeiro_usu').select('id,nome,avatar_url,funcao').eq('ativo', true).order('nome');
      if (error) throw error;
      return NextResponse.json({ usuarios: (data || []).filter((u: any) => u.nome && !/teste/i.test(`${u.nome} ${u.funcao || ''}`)) });
    }
    const [linhas, fontes, conferentes] = await Promise.all([
      supabaseAdmin.from('iv_linhas_credito').select('*').in('status', ['vigente', 'proposta']).order('programa').order('taxa_aa'),
      supabaseAdmin.from('iv_fontes_monitor').select('id,programa,nome,url,verificado_em,mudou_em,erro').order('programa'),
      lerConferentes(),
    ]);
    if (linhas.error) throw linhas.error;
    const a = g.auth!;
    // automático: sem nada valendo ainda, o robô faz a primeira leitura sozinho (em segundo plano)
    garantirPrimeiraLeitura(!(linhas.data || []).some((l: any) => l.status === 'vigente'));
    const souConferente = conferentes.some((c) => c.id === a.userId);
    return NextResponse.json({
      linhas: linhas.data || [], fontes: fontes.data || [], conferentes, safra: safraAtual(hojeBR()), lendo: primeiraLeituraRodando(),
      podeConferir: a.isAdmin || souConferente, podeEscolher: a.isAdmin || a.modulos.includes('inteligencia-vendas'),
    });
  } catch (e) {
    if (migracaoFaltando(e)) return NextResponse.json({ error: 'Migration sql/inteligencia-vendas-plano-safra.sql não aplicada', migracaoFaltando: true }, { status: 503 });
    return erroIV(e, 'plano-safra GET');
  }
}

export async function POST(req: Request) {
  const g = await guardarIV(req, 'calculadora');
  if (g.resposta) return g.resposta;
  const a = g.auth!;
  try {
    const b = await req.json().catch(() => ({}));
    const quem = await nomeDoUsuario(a);
    const conferentes = await lerConferentes();
    const podeConferir = a.isAdmin || conferentes.some((c) => c.id === a.userId);

    if (b.acao === 'conferentes') {
      if (!(a.isAdmin || a.modulos.includes('inteligencia-vendas'))) return NextResponse.json({ error: 'Só o administrador escolhe quem confere' }, { status: 403 });
      const lista = (Array.isArray(b.usuarios) ? b.usuarios : []).filter((u: any) => u?.id && u?.nome).slice(0, 10).map((u: any) => ({ id: String(u.id), nome: String(u.nome).slice(0, 80) }));
      await salvarConferentes(lista, quem);
      if (lista.length) {
        await supabaseAdmin.from('portal_notificacoes').insert(lista.filter((u: any) => u.id !== a.userId).map((u: any) => ({
          user_id: u.id, tipo: 'tickets', titulo: 'Você confere o Plano Safra', descricao: `${quem} escolheu você para conferir as taxas do Plano Safra quando o robô ler uma mudança.`,
          link: '/inteligencia-vendas/noticias',
        })));
      }
      await logIV(a, { acao: 'plano_safra_conferentes', detalhes: { conferentes: lista.map((u: any) => u.nome) } });
      return NextResponse.json({ ok: true, conferentes: lista });
    }

    if (!podeConferir) return NextResponse.json({ error: 'Só quem confere o Plano Safra pode fazer isso' }, { status: 403 });

    if (b.acao === 'verificar') {
      const r = await verificarFontes(quem);
      await logIV(a, { acao: 'plano_safra_verificar', detalhes: r });
      return NextResponse.json(r);
    }
    if (b.acao === 'aprovar' || b.acao === 'rejeitar') {
      const programa = String(b.programa || '');
      if (!programa) return NextResponse.json({ error: 'programa obrigatório' }, { status: 400 });
      if (b.acao === 'aprovar') await aprovarPrograma(programa, quem); else await rejeitarPrograma(programa, quem);
      await logIV(a, { acao: `plano_safra_${b.acao}`, entidade: 'iv_linhas_credito', entidadeLabel: programa });
      return NextResponse.json({ ok: true });
    }
    if (b.acao === 'salvar') {
      const [l] = validarLinhas([b.linha]);
      if (!l) return NextResponse.json({ error: 'Informe o nome e ao menos a taxa ou o prazo' }, { status: 400 });
      const dados = { ...l, programa: String(b.linha.programa || 'outro').slice(0, 40), fonte_url: b.linha.fonte_url || null, safra: safraAtual(hojeBR()) };
      const id = Number(b.linha.id);
      const r = id
        ? await supabaseAdmin.from('iv_linhas_credito').update({ ...dados, conferido_em: new Date().toISOString(), conferido_por: quem }).eq('id', id)
        : await supabaseAdmin.from('iv_linhas_credito').insert({ ...dados, status: 'vigente', origem: 'manual', criado_por: quem, conferido_em: new Date().toISOString(), conferido_por: quem });
      if (r.error) throw r.error;
      await logIV(a, { acao: 'plano_safra_salvar', entidade: 'iv_linhas_credito', entidadeLabel: dados.nome });
      return NextResponse.json({ ok: true });
    }
    if (b.acao === 'apagar') {
      // proposta tirada antes de aprovar = rejeitada; vigente apagada = antiga (fica no histórico)
      const { data: atual } = await supabaseAdmin.from('iv_linhas_credito').select('status').eq('id', Number(b.id)).maybeSingle();
      const { error } = await supabaseAdmin.from('iv_linhas_credito')
        .update({ status: atual?.status === 'proposta' ? 'rejeitada' : 'antiga', conferido_por: quem, conferido_em: new Date().toISOString() }).eq('id', Number(b.id));
      if (error) throw error;
      await logIV(a, { acao: 'plano_safra_apagar', entidade: 'iv_linhas_credito', entidadeId: String(b.id) });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'ação inválida' }, { status: 400 });
  } catch (e) {
    if (migracaoFaltando(e)) return NextResponse.json({ error: 'Migration sql/inteligencia-vendas-plano-safra.sql não aplicada', migracaoFaltando: true }, { status: 503 });
    return erroIV(e, 'plano-safra POST');
  }
}
