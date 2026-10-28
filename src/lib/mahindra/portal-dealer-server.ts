// Robô do portal de concessionárias da Mahindra (dealerportal.mahindrabrasil.com.br) — SÓ NO SERVIDOR.
// Entra com MAHINDRA_DEALER_USUARIO / MAHINDRA_DEALER_SENHA (sem navegador: o site é ASP.NET e o login
// é um postback do formulário), lê a lista de certificados de garantia e abre os que precisam, gravando
// em `mahindra_certificados` (sql/mahindra-certificados.sql). Só LÊ o site — nunca salva nada lá.
// Leitura do HTML: ./certificados.ts.

import { supabaseAdmin as db } from '@/lib/server/supabase-admin';
import { lerCertificado, lerListaCertificados, type Certificado } from './certificados';

const BASE = 'https://dealerportal.mahindrabrasil.com.br';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const TABELA = 'mahindra_certificados';

export const linkCertificado = (itemId: number) => `${BASE}/en-us/Main/ctl/CERTEDIT/mid/383/ItemId/${itemId}`;

/** Sessão com cookies (o site guarda o login em cookie). */
function sessao() {
  const jar = new Map<string, string>();
  return async function pedir(url: string, opt: { method?: string; body?: string; headers?: Record<string, string> } = {}) {
    let u = url;
    let atual = opt;
    let r: Response | null = null;
    for (let i = 0; i < 6; i++) {
      r = await fetch(u, {
        method: atual.method || 'GET', body: atual.body, redirect: 'manual', signal: AbortSignal.timeout(30_000),
        headers: { 'User-Agent': UA, Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), ...(atual.headers || {}) },
      });
      for (const c of r.headers.getSetCookie?.() || []) {
        const kv = c.split(';')[0];
        const k = kv.indexOf('=');
        if (k > 0) jar.set(kv.slice(0, k).trim(), kv.slice(k + 1));
      }
      const loc = r.headers.get('location');
      if (r.status >= 300 && r.status < 400 && loc) { u = new URL(loc, u).href; atual = {}; continue; }
      break;
    }
    return { status: r!.status, url: u, html: await r!.text() };
  };
}

const ocultos = (html: string) => Object.fromEntries(
  [...html.matchAll(/<input[^>]*type="hidden"[^>]*>/g)]
    .map((m) => [m[0].match(/name="([^"]*)"/)?.[1], (m[0].match(/value="([^"]*)"/)?.[1] || '').replace(/&amp;/g, '&')])
    .filter(([k]) => k) as [string, string][],
);

async function entrar() {
  const usuario = process.env.MAHINDRA_DEALER_USUARIO;
  const senha = process.env.MAHINDRA_DEALER_SENHA;
  if (!usuario || !senha) throw new Error('Faltam MAHINDRA_DEALER_USUARIO / MAHINDRA_DEALER_SENHA nas variáveis do servidor.');
  const pedir = sessao();
  const url = `${BASE}/en-us/Login?returnurl=%2fen-us%2f`;
  const tela = await pedir(url);
  const campoUser = tela.html.match(/name="([^"]*txtUsername)"/)?.[1];
  const campoSenha = tela.html.match(/name="([^"]*txtPassword)"/)?.[1];
  const botao = tela.html.match(/__doPostBack\(&#39;([^&]*cmdLogin)&#39;/)?.[1];
  if (!campoUser || !campoSenha) throw new Error('A tela de login da Mahindra mudou (campos não encontrados).');
  const corpo = new URLSearchParams({ ...ocultos(tela.html), __EVENTTARGET: botao || '', __EVENTARGUMENT: '', [campoUser]: usuario, [campoSenha]: senha });
  const pos = await pedir(url, { method: 'POST', body: corpo.toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  if (!/Logout/i.test(pos.html)) throw new Error('Não consegui entrar no portal da Mahindra (usuário/senha ou verificação em duas etapas).');
  return pedir;
}

const linhaDoBanco = (c: Certificado, criadoNoPortal: string | null) => ({
  item_id: c.itemId, chassi: c.chassi, status: c.status, modelo: c.modelo, rodagem: c.rodagem, motor: c.motor,
  bomba_injetora: c.bombaInjetora, nf_mahindra: c.nfMahindra, horas_entrega: c.horasEntrega, bateria_serie: c.bateriaSerie,
  bateria_marca: c.bateriaMarca, proprietario: c.proprietario, documento: c.documento, telefone: c.telefone, email: c.email,
  cep: c.cep, endereco: c.endereco, numero: c.numero, complemento: c.complemento, cidade: c.cidade, estado: c.estado,
  concessionaria: c.concessionaria, entrega_tecnica: c.entregaTecnica, responsavel_tecnico: c.responsavelTecnico,
  data_entrega: c.dataEntrega, nf_concessionaria: c.nfConcessionaria, data_nf_concessionaria: c.dataNfConcessionaria,
  banco: c.banco, linha_credito: c.linhaCredito, documentos: c.documentos, criado_no_portal: criadoNoPortal,
  sincronizado_em: new Date().toISOString(),
});

let rodando: Promise<ResultadoSync> | null = null;
export interface ResultadoSync { ok: boolean; naLista: number; abertos: number; gravados: number; erros: string[] }

/** Lê a lista e abre: novos, não aprovados e os conferidos há mais de 7 dias (`todos` abre todos). */
export function sincronizarCertificados(opt: { todos?: boolean } = {}): Promise<ResultadoSync> {
  if (rodando) return rodando;
  rodando = (async () => {
    const erros: string[] = [];
    const pedir = await entrar();
    const lista = lerListaCertificados((await pedir(`${BASE}/Main/ctl/CERT/mid/383`)).html);
    const { data: ja, error } = await db.from(TABELA).select('item_id, status, sincronizado_em');
    if (error) throw new Error(/mahindra_certificados/.test(error.message) ? 'Falta rodar o SQL mahindra-certificados no banco.' : error.message);
    const conhecido = new Map((ja || []).map((x) => [Number(x.item_id), x]));
    const semana = Date.now() - 7 * 86_400_000;
    const abrir = lista.filter((l) => {
      const k = conhecido.get(l.itemId);
      return opt.todos || !k || k.status !== 'Aprovado' || k.status !== l.status || Date.parse(k.sincronizado_em) < semana;
    });
    let gravados = 0;
    for (const l of abrir) {
      try {
        const c = lerCertificado((await pedir(linkCertificado(l.itemId))).html, l.itemId);
        if (!c.chassi) { erros.push(`${l.itemId}: sem chassi na página`); continue; }
        const { error: e } = await db.from(TABELA).upsert(linhaDoBanco(c, l.criadoEm), { onConflict: 'item_id' });
        if (e) erros.push(`${l.itemId}: ${e.message}`); else gravados++;
      } catch (e) { erros.push(`${l.itemId}: ${e instanceof Error ? e.message : String(e)}`); }
      await new Promise((r) => setTimeout(r, 400));
    }
    (globalThis as { __mahindraLeitura?: string }).__mahindraLeitura = new Date().toISOString();
    return { ok: erros.length === 0, naLista: lista.length, abertos: abrir.length, gravados, erros };
  })().finally(() => { rodando = null; });
  return rodando;
}

/** Última leitura do portal da Mahindra: a mais nova entre um certificado gravado, a tarefa do
 *  agendador (cron_runs "mahindra-certificados") e a leitura deste processo (que pode não gravar nada). */
export async function ultimaSincronizacao(): Promise<string | null> {
  const [cert, run] = await Promise.all([
    db.from(TABELA).select('sincronizado_em').order('sincronizado_em', { ascending: false }).limit(1),
    db.from('cron_runs').select('finalizado_em').eq('job', 'mahindra-certificados').eq('status', 'ok').order('id', { ascending: false }).limit(1),
  ]);
  const datas = [cert.data?.[0]?.sincronizado_em, run.data?.[0]?.finalizado_em, (globalThis as { __mahindraLeitura?: string }).__mahindraLeitura]
    .filter((x): x is string => !!x && Number.isFinite(Date.parse(x)));
  return datas.length ? datas.reduce((a, b) => (Date.parse(a) > Date.parse(b) ? a : b)) : null;
}

/** Roda a sincronização em segundo plano se a última tem mais de `horas` (chamado ao abrir o radar). */
export async function sincronizarSeVelho(horas = 12): Promise<void> {
  if (!process.env.MAHINDRA_DEALER_USUARIO || rodando) return;
  const ult = await ultimaSincronizacao().catch(() => null);
  if (ult && Date.now() - Date.parse(ult) < horas * 3_600_000) return;
  void sincronizarCertificados().catch((e) => console.error('[mahindra-certificados]', e instanceof Error ? e.message : e));
}

export interface CertificadoResumo {
  itemId: number; chassi: string; dataEntrega: string | null; entregaTecnica: boolean | null; responsavel: string | null;
  horasEntrega: number | null; motor: string | null; bombaInjetora: string | null; banco: string | null; linhaCredito: string | null;
  status: string | null; link: string; documentos: { tipo: string; url: string }[];
}

/** Certificados gravados, por chassi (limpo). Tabela ausente → mapa vazio. */
export async function certificadosPorChassi(): Promise<Map<string, CertificadoResumo>> {
  const { data, error } = await db.from(TABELA)
    .select('item_id, chassi, data_entrega, entrega_tecnica, responsavel_tecnico, horas_entrega, motor, bomba_injetora, banco, linha_credito, status, documentos');
  const mapa = new Map<string, CertificadoResumo>();
  if (error) return mapa;
  for (const r of data || []) {
    const atual = mapa.get(r.chassi);
    if (atual && atual.itemId > Number(r.item_id)) continue; // fica o certificado mais novo do chassi
    mapa.set(r.chassi, {
      itemId: Number(r.item_id), chassi: r.chassi, dataEntrega: r.data_entrega, entregaTecnica: r.entrega_tecnica,
      responsavel: r.responsavel_tecnico, horasEntrega: r.horas_entrega != null ? Number(r.horas_entrega) : null,
      motor: r.motor, bombaInjetora: r.bomba_injetora, banco: r.banco, linhaCredito: r.linha_credito, status: r.status,
      link: linkCertificado(Number(r.item_id)), documentos: Array.isArray(r.documentos) ? r.documentos : [],
    });
  }
  return mapa;
}
