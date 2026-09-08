/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// QUESTIONÁRIO POR LINK ÚNICO — acesso ao banco (SERVIDOR).
//
// O respondente NÃO tem login e NÃO fala com o banco: fala com /api/q/<token>,
// que valida o token aqui e usa service role. As tabelas têm RLS sem policy,
// então a chave anônima não lê nem escreve nada.
//
// O token é a credencial e só serve pra responder ESTE questionário. Por isso
// tudo que sai daqui pra rota pública é filtrado: nada de id de ação, de custo
// ou de apoio de fábrica vaza pro respondente.
// =============================================================================
import { randomBytes } from 'node:crypto';
import { db, migrationFaltou } from './db';
import {
  sanitizarRespostas, respondidas, preverImportacao, mesclarObservacoes,
  type PreviaImportacao,
} from './questionario';

export { migrationFaltou };

/** Erros previstos, que a rota traduz em status HTTP. */
export class ErroQuestionario extends Error {
  constructor(public codigo: 'link_invalido' | 'link_expirado' | 'link_fechado' | 'muito_rapido', mensagem: string) {
    super(mensagem);
    this.name = 'ErroQuestionario';
  }
}

// Piso entre gravações. A tela espera 1,5 s depois da última tecla, então quem
// digita normalmente nunca esbarra nisto — mas um laço de requisições, sim.
export const INTERVALO_MINIMO_MS = 1000;

function agora() { return new Date().toISOString(); }

function ok<T>(res: { data: T | null; error: any }): T {
  if (res.error) throw Object.assign(new Error(res.error.message), { code: res.error.code });
  return res.data as T;
}

// ── Leitura do link ──────────────────────────────────────────────────────────
async function buscarLink(token: string) {
  const t = String(token ?? '').trim();
  // O token tem forma conhecida (43 chars base64url). Barrar aqui evita uma ida
  // ao banco a cada varredura de robô.
  if (!t || t.length > 128 || !/^[A-Za-z0-9_-]+$/.test(t)) {
    throw new ErroQuestionario('link_invalido', 'Link inválido.');
  }
  const { data, error } = await db
    .from('mkt_questionario_links').select('*').eq('token', t).maybeSingle();
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  if (!data) throw new ErroQuestionario('link_invalido', 'Link inválido.');
  if (data.expira_em && Date.parse(data.expira_em) < Date.now()) {
    throw new ErroQuestionario('link_expirado', 'Este link expirou.');
  }
  return data;
}

/**
 * Payload da tela pública. Registra o primeiro acesso e devolve SÓ o que o
 * respondente precisa ver.
 */
export async function porToken(token: string) {
  const link = await buscarLink(token);

  if (!link.primeiro_acesso_em) {
    await db.from('mkt_questionario_links')
      .update({ primeiro_acesso_em: agora() }).eq('id', link.id);
  }

  const { data: linha } = await db
    .from('mkt_questionario_respostas').select('respostas, atualizado_em')
    .eq('link_id', link.id).maybeSingle();

  const { data: acao } = await db
    .from('mkt_acoes').select('nome, codigo, tipo, data_inicio, data_fim, cidade, uf, local_nome')
    .eq('id', link.acao_id).maybeSingle();

  const respostas = (linha?.respostas ?? {}) as Record<string, string>;
  return {
    evento: {
      nome: acao?.nome ?? 'Evento',
      edicao: acao?.codigo ?? null,
      tipo: acao?.tipo ?? null,
      data_inicio: acao?.data_inicio ?? null,
      data_fim: acao?.data_fim ?? null,
      local: [acao?.local_nome, acao?.cidade, acao?.uf].filter(Boolean).join(' · ') || null,
    },
    destinatario_nome: link.destinatario_nome ?? null,
    editavel: link.editavel === true,
    enviado_em: link.enviado_em ?? null,
    ultimo_salvamento_em: link.ultimo_salvamento_em ?? null,
    respostas,
    respondidas: respondidas(respostas),
  };
}

/**
 * Grava. Faz MERGE campo a campo: dois aparelhos abertos no mesmo link não
 * apagam o campo um do outro (num MESMO campo, o último salvamento vence).
 */
export async function salvar(token: string, entrada: unknown) {
  const link = await buscarLink(token);
  if (!link.editavel) throw new ErroQuestionario('link_fechado', 'Este questionário foi fechado.');

  if (link.ultimo_salvamento_em) {
    const desde = Date.now() - Date.parse(link.ultimo_salvamento_em);
    if (desde >= 0 && desde < INTERVALO_MINIMO_MS) {
      throw new ErroQuestionario('muito_rapido', 'Aguarde um instante antes de salvar de novo.');
    }
  }

  const novas = sanitizarRespostas(entrada);
  if (Object.keys(novas).length === 0) {
    throw new ErroQuestionario('link_invalido', 'Nenhuma resposta reconhecida no envio.');
  }

  const { data: linha } = await db
    .from('mkt_questionario_respostas').select('respostas')
    .eq('link_id', link.id).maybeSingle();

  const atuais = (linha?.respostas ?? {}) as Record<string, string>;
  const mescladas = { ...atuais, ...novas };

  if (linha) {
    ok(await db.from('mkt_questionario_respostas')
      .update({ respostas: mescladas, atualizado_em: agora() })
      .eq('link_id', link.id).select('link_id').single());
  } else {
    ok(await db.from('mkt_questionario_respostas')
      .insert([{ link_id: link.id, respostas: mescladas }])
      .select('link_id').single());
  }

  const quando = agora();
  await db.from('mkt_questionario_links')
    .update({ ultimo_salvamento_em: quando }).eq('id', link.id);

  return { salvo_em: quando, respondidas: respondidas(mescladas) };
}

/**
 * "Enviar" do respondente. NÃO trava a edição de propósito: quem fecha é um
 * admin, pra pessoa poder lembrar de algo depois e completar.
 */
export async function enviar(token: string) {
  const link = await buscarLink(token);
  if (!link.editavel) throw new ErroQuestionario('link_fechado', 'Este questionário foi fechado.');
  const quando = agora();
  await db.from('mkt_questionario_links').update({ enviado_em: quando }).eq('id', link.id);
  return { enviado_em: quando };
}

// ── Administração ────────────────────────────────────────────────────────────
/** 32 bytes url-safe. Gerado no Node: base64url no Postgres só existe no PG 18. */
export function gerarToken(): string {
  return randomBytes(32).toString('base64url');
}

export async function criarLink(args: {
  acaoId: string;
  destinatarioUsuarioId?: string | null;
  destinatarioNome?: string | null;
  destinatarioEmail?: string | null;
  expiraEm?: string | null;
  titulo?: string | null;
  criadoPorId: string;
  criadoPorNome: string;
}) {
  const token = gerarToken();
  const link = ok<any>(await db.from('mkt_questionario_links').insert([{
    acao_id: args.acaoId,
    token,
    destinatario_usuario_id: args.destinatarioUsuarioId || null,
    destinatario_nome: args.destinatarioNome || null,
    destinatario_email: args.destinatarioEmail || null,
    expira_em: args.expiraEm || null,
    titulo: args.titulo || null,
    criado_por_id: args.criadoPorId,
    criado_por_nome: args.criadoPorNome,
  }]).select('*').single());

  // Linha de respostas nasce junto, vazia: a tela pública nunca encontra o
  // questionário "sem registro".
  await db.from('mkt_questionario_respostas')
    .insert([{ link_id: link.id, respostas: {} }]);

  return link;
}

export async function listarLinks(acaoId: string) {
  const links = ok<any[]>(await db
    .from('mkt_questionario_links').select('*').eq('acao_id', acaoId).order('criado_em'));
  if (links.length === 0) return [];

  const { data: respostas } = await db
    .from('mkt_questionario_respostas').select('link_id, respostas, atualizado_em')
    .in('link_id', links.map((l) => l.id));
  const porLink = new Map((respostas ?? []).map((r: any) => [r.link_id, r]));

  return links.map((l) => {
    const r = porLink.get(l.id);
    const conteudo = (r?.respostas ?? {}) as Record<string, string>;
    return { ...l, respostas: conteudo, respondidas: respondidas(conteudo) };
  });
}

export async function definirEditavel(linkId: string, editavel: boolean) {
  return ok<any>(await db.from('mkt_questionario_links')
    .update({ editavel }).eq('id', linkId).select('id, editavel, acao_id').single());
}

export async function excluirLink(linkId: string) {
  ok(await db.from('mkt_questionario_links').delete().eq('id', linkId).select('id'));
}

// ── Importação para a ficha ──────────────────────────────────────────────────
async function contexto(linkId: string) {
  const link = ok<any>(await db
    .from('mkt_questionario_links').select('*').eq('id', linkId).single());
  const { data: linha } = await db
    .from('mkt_questionario_respostas').select('respostas').eq('link_id', linkId).maybeSingle();
  const acao = ok<any>(await db.from('mkt_acoes').select('*').eq('id', link.acao_id).single());

  // A avaliação da importação é a do próprio respondente, quando ele é usuário
  // do portal. Assim a resposta dele não sobrescreve a avaliação de outra
  // pessoa sobre o mesmo evento.
  let avaliacao: any = null;
  if (link.destinatario_usuario_id) {
    const { data } = await db.from('mkt_avaliacoes').select('*')
      .eq('acao_id', link.acao_id).eq('avaliador_id', link.destinatario_usuario_id).maybeSingle();
    avaliacao = data ?? null;
  }
  return { link, acao, avaliacao, respostas: (linha?.respostas ?? {}) as Record<string, string> };
}

export async function previaImportacao(linkId: string): Promise<PreviaImportacao & { acaoNome: string }> {
  const { acao, avaliacao, respostas } = await contexto(linkId);
  return { ...preverImportacao(respostas, acao, avaliacao), acaoNome: acao.nome };
}

/**
 * Grava na ficha. Campo já preenchido no destino só é trocado quando
 * `sobrescrever` vem true — a tela pergunta antes.
 */
export async function importar(linkId: string, sobrescrever: boolean) {
  const { link, acao, avaliacao, respostas } = await contexto(linkId);
  const previa = preverImportacao(respostas, acao, avaliacao);

  const aplicar = previa.itens.filter((i) => !i.conflito || sobrescrever);
  const naAcao: Record<string, any> = {};
  const naAvaliacao: Record<string, any> = {};
  for (const item of aplicar) {
    if (item.tabela === 'acao') naAcao[item.campo] = item.valor;
    else naAvaliacao[item.campo] = item.valor;
  }

  // As respostas sem campo próprio vão pras observações, atualizando a linha da
  // mesma pergunta em vez de empilhar outra.
  if (previa.paraObservacoes.length > 0) {
    naAcao.observacoes = mesclarObservacoes(acao.observacoes, previa.paraObservacoes);
  }

  if (Object.keys(naAcao).length > 0) {
    naAcao.atualizado_em = agora();
    ok(await db.from('mkt_acoes').update(naAcao).eq('id', link.acao_id).select('id').single());
  }

  if (Object.keys(naAvaliacao).length > 0) {
    const nome = link.destinatario_nome || 'Respondente do questionário';
    if (avaliacao) {
      ok(await db.from('mkt_avaliacoes')
        .update({ ...naAvaliacao, atualizado_em: agora() })
        .eq('id', avaliacao.id).select('id').single());
    } else {
      ok(await db.from('mkt_avaliacoes').insert([{
        ...naAvaliacao,
        acao_id: link.acao_id,
        avaliador_id: link.destinatario_usuario_id || null,
        avaliador_nome: nome,
      }]).select('id').single());
    }
  }

  return {
    aplicados: aplicar.length,
    ignoradosPorConflito: previa.itens.length - aplicar.length,
    observacoes: previa.paraObservacoes.length,
    numeroNaoLido: previa.numeroNaoLido,
  };
}
