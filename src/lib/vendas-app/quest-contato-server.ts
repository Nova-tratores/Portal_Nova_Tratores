// Contato do alvo de uma quest — SÓ NO SERVIDOR (service role).
// Ordem de confiança: cliente do chassi no Omie (portal_nt_projetos_chassis →
// cadastro Omie) > cliente achado pelo NOME no cadastro Omie (mesma regra de nome
// do app: igual, começa igual, ou uma letra de diferença; prefere a cidade da
// quest) > propriedade do CRM (propriedade_id) > telefone escrito na descrição.
// Lugar: locaisDoTrator (visita do vendedor > GPS do técnico > CRM > cadastro).
// "Pedir ao suporte" vira notificação no sino do Mariano no portal.
import { supabaseAdmin as db } from '@/lib/server/supabase-admin';
import { paginar } from '@/lib/db/paginar';
import { locaisDoTrator, type LocalMapa } from '@/lib/clientes/locais-server';
import { nomeChave, umaLetraDeDiferenca } from './tratores-cidade';
import {
  faltaContato, juntarTelefones, telefonesDoTexto, textoPedidoSuporte,
  type FaltaContato, type TelefoneQuest,
} from './quest-contato';

export interface QuestAlvo {
  id: number; vendedor_id: number | null; titulo: string; descricao: string | null;
  chassis: string | null; modelo: string | null; cliente_nome: string | null; cidade: string | null; propriedade_id: number | null;
}
export interface ContatoQuest {
  cliente: { nome: string; cod: number | null; doc: string | null } | null;
  telefones: TelefoneQuest[];
  endereco: string | null;
  locais: LocalMapa[];
  falta: FaltaContato[];
}

interface Cadastro { cod_cli: number; razao_social: string | null; nome_fantasia: string | null; cnpj_cpf: string | null; telefone: string | null; cidade: string | null; k: string; kf: string }

// cadastro Omie inteiro (~poucos mil) em memória 30 min: casar por nome precisa da lista toda
let cache: { em: number; linhas: Cadastro[] } | null = null;
async function cadastros(): Promise<Cadastro[]> {
  if (cache && Date.now() - cache.em < 30 * 60_000) return cache.linhas;
  const { data: rows, error } = await paginar<Omit<Cadastro, 'k' | 'kf'>>((a, b) => db.from('portal_nt_clientes_cadastro_omie')
    .select('cod_cli, razao_social, nome_fantasia, cnpj_cpf, telefone, cidade').order('cod_cli').range(a, b));
  if (error) throw new Error(error.message);
  const linhas = rows.map((r) => ({ ...r, k: nomeChave(r.razao_social), kf: nomeChave(r.nome_fantasia) }));
  cache = { em: Date.now(), linhas };
  return linhas;
}

const cidadeChave = (s: string | null | undefined) => nomeChave(String(s || '').replace(/\([^)]*\)/g, ''));

/** Cadastro do cliente pelo nome; com vários, o da cidade da quest e o que tem telefone. */
function porNome(lista: Cadastro[], nome: string | null, cidade: string | null): Cadastro | null {
  const k = nomeChave(nome);
  if (!k || k.length < 5 || k === 'NOVA TRATORES') return null;
  let c = lista.filter((x) => x.k === k || x.kf === k);
  if (!c.length && k.length >= 10) c = lista.filter((x) => x.k.startsWith(k + ' ') || k.startsWith(x.k + ' '));
  if (!c.length && k.length >= 12) c = lista.filter((x) => umaLetraDeDiferenca(x.k, k));
  if (!c.length) return null;
  const cid = cidadeChave(cidade);
  const pontos = (x: Cadastro) => (cid && cidadeChave(x.cidade) === cid ? 2 : 0) + (telefonesDoTexto(x.telefone, 'omie').length ? 1 : 0);
  return [...c].sort((a, b) => pontos(b) - pontos(a))[0];
}

export async function carregarQuest(id: number): Promise<QuestAlvo | null> {
  const { data } = await db.from('vendas_quests')
    .select('id, vendedor_id, titulo, descricao, chassis, modelo, cliente_nome, cidade, propriedade_id').eq('id', id).maybeSingle();
  return (data as QuestAlvo) || null;
}

export async function contatoDaQuest(q: QuestAlvo): Promise<ContatoQuest> {
  const chassi = String(q.chassis || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const [doChassi, lista, prop] = await Promise.all([
    chassi.length >= 7
      ? db.from('portal_nt_projetos_chassis').select('chassis, cod_cli_ultimo, cliente_nome_ultimo, updated_at')
        .ilike('chassis', `%${chassi.slice(-7)}`).order('updated_at', { ascending: false }).limit(5)
        .then((r) => (r.data || []).find((x) => String(x.chassis || '').toUpperCase().endsWith(chassi.slice(-7))) || null)
      : Promise.resolve(null),
    cadastros().catch(() => [] as Cadastro[]),
    q.propriedade_id != null
      ? db.from('portal_nt_clientes_PRINCIPAL').select('id_omie, razao_social, nome_fantasia, telefone, endereco, cidade').eq('id', q.propriedade_id).maybeSingle()
        .then((r) => r.data || null)
      : Promise.resolve(null),
  ]);

  const cod = Number(doChassi?.cod_cli_ultimo) || Number(prop?.id_omie) || null;
  const cad = (cod ? lista.find((x) => Number(x.cod_cli) === cod) : null)
    || porNome(lista, q.cliente_nome || prop?.razao_social || null, q.cidade);
  const codFinal = cad?.cod_cli ?? cod;

  const { locais, endereco } = await locaisDoTrator({ chassi: chassi || null, codOmie: codFinal }).catch(() => ({ locais: [] as LocalMapa[], endereco: null }));
  const enderecoProp = prop ? [prop.endereco, prop.cidade].map((s) => String(s || '').trim()).filter(Boolean).join(', ') || null : null;

  const telefones = juntarTelefones(
    telefonesDoTexto(cad?.telefone, 'omie'),
    telefonesDoTexto(prop?.telefone, 'crm'),
    telefonesDoTexto(String(q.descricao || '').match(/telefone[^\n]*/gi)?.join('\n') || null, 'quest'),
  );
  const end = endereco || enderecoProp;
  return {
    cliente: cad
      ? { nome: String(cad.razao_social || cad.nome_fantasia || q.cliente_nome || ''), cod: cad.cod_cli, doc: cad.cnpj_cpf }
      : q.cliente_nome ? { nome: q.cliente_nome, cod: codFinal, doc: null } : null,
    telefones,
    endereco: end,
    locais,
    falta: faltaContato({ telefones, temLocal: locais.length > 0, endereco: end }),
  };
}

// ─── Pedido ao suporte ─────────────────────────────────────────────────────────
const MARIANO_PADRAO = '3c9d4cc0-3771-4b04-adf1-2b9a2f93ceaa'; // financeiro_usu ativo (mariano.novatratores@gmail.com)

/** Quem atende os pedidos de contato dos vendedores: o Mariano ativo no portal. */
async function idSuporte(): Promise<string> {
  const { data } = await db.from('financeiro_usu').select('id').eq('ativo', true).ilike('nome', 'mariano%').limit(1);
  return String(data?.[0]?.id || MARIANO_PADRAO);
}

export async function pedirContatoAoSuporte(p: {
  quest: QuestAlvo; vendedorNome: string; falta: FaltaContato[]; obs?: string | null; contato?: ContatoQuest | null;
}): Promise<{ ok: true; jaPedido: boolean }> {
  const suporte = await idSuporte();
  const q = p.quest;
  const trator = q.chassis ? `${q.modelo || 'Trator'} …${String(q.chassis).slice(-6)}` : null;
  const { titulo, descricao } = textoPedidoSuporte({
    vendedor: p.vendedorNome, cliente: p.contato?.cliente?.nome || q.cliente_nome, cidade: q.cidade, trator,
    falta: p.falta, obs: p.obs, questId: q.id,
  });
  // o mesmo pedido em 12 h não repete (vendedor apertando de novo)
  const desde = new Date(Date.now() - 12 * 3600_000).toISOString();
  const { data: ja } = await db.from('portal_notificacoes').select('id').eq('user_id', suporte).eq('titulo', titulo).gte('created_at', desde).limit(1);
  if (ja?.length) return { ok: true, jaPedido: true };
  const cod = p.contato?.cliente?.cod;
  const link = cod ? `/clientes?cod=${cod}` : '/clientes';
  const { error } = await db.from('portal_notificacoes').insert({ user_id: suporte, tipo: 'avisos', titulo, descricao, link });
  if (error) throw new Error(error.message);
  return { ok: true, jaPedido: false };
}
