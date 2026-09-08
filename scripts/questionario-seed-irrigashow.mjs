// =============================================================================
// SEED — link do questionário pós-evento do IRRIGASHOW 2026 para o Dougras.
//
//   node scripts/questionario-seed-irrigashow.mjs
//
// Idempotente: rodar de novo NÃO cria uma segunda ação nem um segundo link —
// reaproveita o que já existe e reimprime a URL.
//
// A ação é criada só com o nome e o tipo, de propósito. Período, local, custos
// e público são exatamente o que ninguém sabe: é o que o questionário existe
// pra descobrir. Inventar aqui contaminaria o relatório de contrapartida.
// =============================================================================
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';

const NOME_ACAO = 'IRRIGASHOW 2026';
const NOME_DESTINATARIO = 'Dougras';

function env(chave) {
  const txt = fs.readFileSync('.env.local', 'utf8');
  const m = txt.match(new RegExp(`^${chave}=(.*)$`, 'm'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
}

const URL_BASE = env('NEXT_PUBLIC_SUPABASE_URL');
const CHAVE = env('SUPABASE_SERVICE_ROLE_KEY');
const PORTAL = (process.env.PORTAL_URL || env('PORTAL_URL') || 'http://localhost:3000').replace(/\/$/, '');

if (!URL_BASE || !CHAVE) {
  console.error('Faltou NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no .env.local.');
  process.exit(1);
}

const cabecalho = {
  apikey: CHAVE,
  Authorization: `Bearer ${CHAVE}`,
  'Content-Type': 'application/json',
};

async function rest(caminho, opcoes = {}) {
  const r = await fetch(`${URL_BASE}/rest/v1/${caminho}`, {
    ...opcoes,
    headers: { ...cabecalho, ...(opcoes.headers || {}) },
  });
  const texto = await r.text();
  if (!r.ok) {
    const erro = new Error(`${r.status} em ${caminho}: ${texto.slice(0, 300)}`);
    erro.status = r.status;
    throw erro;
  }
  return texto ? JSON.parse(texto) : null;
}

async function principal() {
  // 0. As tabelas existem?
  try {
    await rest('mkt_questionario_links?select=id&limit=1');
  } catch (e) {
    if (e.status === 404) {
      console.error('\nAs tabelas do questionário não existem ainda.');
      console.error('Rode sql/marketing-questionario.sql no SQL Editor do Supabase e tente de novo.\n');
      process.exit(1);
    }
    throw e;
  }

  // 1. Destinatário — parar se não existir, conforme combinado.
  const usuarios = await rest(
    `financeiro_usu?select=id,nome,email,ativo&nome=ilike.*${encodeURIComponent(NOME_DESTINATARIO)}*`,
  );
  if (usuarios.length === 0) {
    console.error(`\nNenhum usuário do portal com "${NOME_DESTINATARIO}" no nome. Nada foi criado.\n`);
    process.exit(1);
  }
  if (usuarios.length > 1) {
    console.error(`\nMais de um usuário casa com "${NOME_DESTINATARIO}". Nada foi criado:`);
    for (const u of usuarios) console.error(`  - ${u.nome} <${u.email}>`);
    process.exit(1);
  }
  const destinatario = usuarios[0];
  console.log(`Destinatário: ${destinatario.nome} <${destinatario.email}>`);

  // 2. A ação. Só o nome e o tipo — o resto é o que o questionário vai descobrir.
  let acoes = await rest(`mkt_acoes?select=id,nome&nome=eq.${encodeURIComponent(NOME_ACAO)}&deleted_at=is.null`);
  let acao = acoes[0];
  if (acao) {
    console.log(`Ação já existia: ${acao.nome} (${acao.id})`);
  } else {
    const criadas = await rest('mkt_acoes', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify([{
        nome: NOME_ACAO,
        tipo: 'feira',
        status: 'realizada',
        empresa: 'NOVA',
        observacoes: 'Ficha aberta para receber as respostas do questionário pós-evento. Período, local, custos e público ainda não confirmados.',
      }]),
    });
    acao = criadas[0];
    console.log(`Ação criada: ${acao.nome} (${acao.id})`);
  }

  // 3. O link. Já existe um pra essa pessoa nessa ação? Reaproveita.
  const existentes = await rest(
    `mkt_questionario_links?select=id,token,editavel,enviado_em&acao_id=eq.${acao.id}&destinatario_usuario_id=eq.${destinatario.id}`,
  );
  let link = existentes[0];
  if (link) {
    console.log('Link já existia — reaproveitando (nenhum token novo foi gerado).');
  } else {
    const token = randomBytes(32).toString('base64url');
    const criados = await rest('mkt_questionario_links', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify([{
        acao_id: acao.id,
        token,
        destinatario_usuario_id: destinatario.id,
        destinatario_nome: destinatario.nome,
        destinatario_email: destinatario.email,
        titulo: 'Questionário pós-evento',
        criado_por_nome: 'seed',
      }]),
    });
    link = criados[0];
    await rest('mkt_questionario_respostas', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates' },
      body: JSON.stringify([{ link_id: link.id, respostas: {} }]),
    });
    console.log('Link criado.');
  }

  const url = `${PORTAL}/q/${link.token}`;
  console.log('\n' + '─'.repeat(70));
  console.log('URL DO QUESTIONÁRIO');
  console.log(url);
  console.log('─'.repeat(70));
  console.log(`Situação: ${link.editavel === false ? 'FECHADO' : 'aberto'}${link.enviado_em ? ' · já enviado' : ''}`);
  console.log('\nPara mandar com o endereço de produção:');
  console.log('  PORTAL_URL=https://seu-dominio node scripts/questionario-seed-irrigashow.mjs\n');
}

principal().catch((e) => {
  console.error('\nFalhou:', e.message, '\n');
  process.exit(1);
});
