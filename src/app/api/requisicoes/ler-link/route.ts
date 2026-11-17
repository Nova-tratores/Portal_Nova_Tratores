// Lê o link da cotação e devolve produto, preço e loja (José, 17/11/2026). GET ?url=
// Só http/https, nada de IP/rede interna (o domínio é resolvido e conferido antes), 8 s e até 3 MB.
import { NextRequest, NextResponse } from 'next/server';
import { lookup } from 'node:dns/promises';
import { protegerRota } from '@/lib/ajustes/permissao-server';
import { lerDadosDoHtml, urlPublica } from '@/lib/requisicoes/ler-link';

export const dynamic = 'force-dynamic';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const ipInterno = (ip: string) => /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80)/i.test(ip);

export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'requisicoes' }, { modulo: 'pos' }, { modulo: 'financeiro' }]);
  if (g.resposta) return g.resposta;
  const alvo = urlPublica(req.nextUrl.searchParams.get('url') || '');
  if (!alvo) return NextResponse.json({ error: 'Link inválido' }, { status: 400 });
  try {
    const ips = await lookup(alvo.hostname, { all: true });
    if (!ips.length || ips.some((x) => ipInterno(x.address))) return NextResponse.json({ error: 'Link não permitido' }, { status: 400 });
    const r = await fetch(alvo.toString(), {
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'pt-BR,pt;q=0.9' },
      redirect: 'follow', signal: AbortSignal.timeout(8000), cache: 'no-store',
    });
    if (!r.ok) return NextResponse.json({ error: `O site respondeu ${r.status} — preencha à mão.` }, { status: 200 });
    if (r.url && !urlPublica(r.url)) return NextResponse.json({ error: 'Link não permitido' }, { status: 400 });
    const html = (await r.text()).slice(0, 3_000_000);
    const d = lerDadosDoHtml(html, r.url || alvo.toString());
    // site com anti-robô (captcha, Cloudflare…) devolve outra página: não preenche nada errado
    const base = (h: string) => h.replace(/^www./, "").split(".").slice(-3).join(".");
    const desviou = r.url && !base(new URL(r.url).hostname).includes(base(alvo.hostname).split(".")[0]);
    // mesmo site, mas mandou para verificação/login (Mercado Livre manda para /gz/account-verification)
    const barrado = !!r.url && /account-verification|captcha|challenge|\/login|\/entrar|\/signin|verifica/i.test(new URL(r.url).pathname);
    if (desviou || barrado || /captcha|bot manager|are you a robot|access denied|just a moment|attention required|verifica[cç][aã]o de seguran/i.test(d.produto + " " + html.slice(0, 4000))) {
      return NextResponse.json({ error: "Esse site bloqueia a leitura automática (pede verificação) — preencha produto e preço à mão e anexe um print." });
    }
    if (!d.produto && !d.preco) return NextResponse.json({ ...d, error: 'Não achei produto nem preço nessa página — preencha à mão.' });
    return NextResponse.json(d);
  } catch (e) {
    return NextResponse.json({ error: `Não consegui abrir o link (${e instanceof Error ? e.message : String(e)}) — preencha à mão.` });
  }
}
