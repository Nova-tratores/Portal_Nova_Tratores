import nodemailer from 'nodemailer';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { urlSegura } from '@/lib/url-segura';
import { formatarDataBR } from '@/lib/financeiro/parcelas';
import { decrypt } from '@/lib/cripto';

// Cada usuário envia PELO SEU e-mail (financeiro_envio_config). Não há mais
// fallback pro Gmail da empresa — sem config, o envio pede pra configurar.

// Service role p/ ler a config de envio do usuário (tabela com RLS fechada ao cliente).
const adminSupa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export async function POST(request: Request) {
  // Exige login: esta rota baixa URLs e manda e-mail pelo Gmail da empresa.
  const auth = await autenticar(request);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  let body: {
    urls?: string[];
    nfUrls?: string[];
    destinatarios?: string[];
    cliente?: string;
    nf?: string;
    valor?: string;
    vencimento?: string;
    remetente?: string;
    parcelas?: { n: number; data: string; valor: string }[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  const destinatarios = (body.destinatarios || []).map((e) => String(e).trim()).filter(Boolean);
  const urls = (body.urls || []).map((u) => String(u).trim()).filter(Boolean);
  const nfUrls = (body.nfUrls || []).map((u) => String(u).trim()).filter(Boolean);
  const todasUrls = [...urls, ...nfUrls];

  if (destinatarios.length === 0) {
    return NextResponse.json({ error: 'Nenhum email de destino informado.' }, { status: 400 });
  }
  if (todasUrls.length === 0) {
    return NextResponse.json({ error: 'Nenhum boleto ou nota fiscal anexado para enviar.' }, { status: 400 });
  }

  // Anti-SSRF: só baixa URLs que não apontem pra endereços internos.
  for (const url of todasUrls) {
    if (!(await urlSegura(url))) {
      return NextResponse.json({ error: 'URL de anexo não permitida.' }, { status: 400 });
    }
  }

  const sanitize = (s: string) => String(s || '').replace(/[<>&"']/g, '');
  const clienteSan = sanitize(body.cliente || '');
  const nfSan = sanitize(body.nf || '');
  const valorSan = sanitize(body.valor || '');
  const vencSan = sanitize(body.vencimento || '');
  const remetenteSan = sanitize(body.remetente || '');

  // Baixa cada arquivo (boletos + notas fiscais) da URL e anexa
  let attachments: { filename: string; content: Buffer }[] = [];
  try {
    attachments = await Promise.all(
      todasUrls.map(async (url, i) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Falha ao baixar anexo (${res.status})`);
        const buffer = Buffer.from(await res.arrayBuffer());
        const limpo = url.split('?')[0];
        const nome = decodeURIComponent(limpo.substring(limpo.lastIndexOf('/') + 1)) || `anexo_${i + 1}.pdf`;
        return { filename: nome, content: buffer };
      })
    );
  } catch (e: any) {
    return NextResponse.json({ error: `Não foi possível anexar os arquivos: ${e.message}` }, { status: 502 });
  }

  const agora = new Date();
  const horaAtual = agora.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false });
  const saudacao = Number(horaAtual) < 12 ? 'Bom dia' : 'Boa tarde';

  const subject = `BOLETO NOVA TRATORES${nfSan ? ` - NF ${nfSan}` : ''}${clienteSan ? ` - ${clienteSan}` : ''}`;

  const partesAnexo: string[] = [];
  if (urls.length) partesAnexo.push(urls.length > 1 ? 'os boletos' : 'o boleto');
  if (nfUrls.length) partesAnexo.push(nfUrls.length > 1 ? 'as notas fiscais' : 'a nota fiscal');
  const itensTxt = partesAnexo.join(' e ') || 'os documentos';

  // Bloco de valores/vencimento. Parcelado → lista cada parcela (dia + valor);
  // à vista → valor + vencimento; sem parcelas informadas → cai no formato antigo
  // (com a data formatada em pt-BR, que antes ia crua/em inglês).
  const parcelas = Array.isArray(body.parcelas) ? body.parcelas : [];
  let blocoValores = '';
  if (parcelas.length > 1) {
    const linhas = parcelas
      .map((p) => `<li>${sanitize(String(p.n))}ª parcela — vencimento <strong>${sanitize(p.data || '')}</strong> — <strong>${sanitize(p.valor || '')}</strong></li>`)
      .join('');
    blocoValores = `<p>Pagamento parcelado em ${parcelas.length}x:</p><ul style="margin:6px 0 0;padding-left:20px">${linhas}</ul>`;
  } else if (parcelas.length === 1) {
    const p = parcelas[0];
    blocoValores = p.valor
      ? `<p>Valor: <strong>${sanitize(p.valor)}</strong>${p.data ? `<br>Vencimento: ${sanitize(p.data)}` : ''}</p>`
      : (p.data ? `<p>Vencimento: ${sanitize(p.data)}</p>` : '');
  } else {
    const vencFmt = sanitize(formatarDataBR(vencSan));
    blocoValores = valorSan
      ? `<p>Valor: <strong>${valorSan}</strong>${vencFmt ? `<br>Vencimento: ${vencFmt}` : ''}</p>`
      : (vencFmt ? `<p>Vencimento: ${vencFmt}</p>` : '');
  }

  const html = `
<p>${saudacao}${clienteSan ? `, <strong>${clienteSan}</strong>` : ''}.</p>

<p>Segue em anexo ${itensTxt} referente ${nfSan ? `à NF ${nfSan}` : 'ao seu faturamento'}.</p>

${blocoValores}

<br>
<p>Qualquer dúvida estamos à disposição.</p>

<p>${remetenteSan || 'Nova Tratores'}<br>
&nbsp;&nbsp;&nbsp;Financeiro / Pós-Vendas</p>
`;

  // Remetente por usuário: se ele configurou um e-mail de envio (SMTP + senha de app
  // criptografada), usa o transporte dele e põe o "De:" no e-mail dele. Senão, cai no
  // Gmail da empresa. Qualquer falha na config do usuário não bloqueia o envio.
  // Remetente = SEMPRE o e-mail configurado pelo PRÓPRIO usuário (cada um envia
  // pelo seu). NÃO cai mais no Gmail padrão do sistema: se o usuário não tem
  // config, devolve semConfig=true pra UI pedir o e-mail/senha na hora.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let envioTransporter: any = null;
  let fromEmail = '';
  let cfgErro: string | null = null;
  try {
    const { data: cfg } = await adminSupa
      .from('financeiro_envio_config')
      .select('email_envio, smtp_host, smtp_port, smtp_secure, senha_enc')
      .eq('user_id', auth.userId)
      .maybeSingle();
    if (cfg?.email_envio && cfg?.senha_enc && cfg?.smtp_host && cfg?.smtp_port) {
      const senha = decrypt(cfg.senha_enc);
      envioTransporter = nodemailer.createTransport({
        host: cfg.smtp_host,
        port: cfg.smtp_port,
        secure: cfg.smtp_secure !== false,
        auth: { user: cfg.email_envio, pass: senha },
      });
      fromEmail = cfg.email_envio;
    }
  } catch (e) {
    cfgErro = e instanceof Error ? e.message : String(e);
    console.error('[enviar-boleto] falha ao ler/descriptografar a config de e-mail do usuário:', cfgErro);
  }

  if (!envioTransporter || !fromEmail) {
    // Sem e-mail próprio configurado → a UI mostra o modal pra configurar na hora.
    return NextResponse.json({
      error: cfgErro
        ? 'Não consegui usar seu e-mail de envio. Reconfigure sua senha de app.'
        : 'Você ainda não configurou o seu e-mail de envio. Configure para enviar pelo seu e-mail.',
      semConfig: true,
    }, { status: 400 });
  }

  const fromName = remetenteSan || 'Nova Tratores';

  try {
    const info = await envioTransporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: destinatarios.join(', '),
      subject,
      html,
      attachments,
    });
    return NextResponse.json({ ok: true, id: info.messageId, enviados: destinatarios, de: fromEmail });
  } catch (error: any) {
    console.error('Erro ao enviar boleto por email:', error);
    return NextResponse.json({ error: `Falha ao enviar email: ${error.message}` }, { status: 500 });
  }
}
