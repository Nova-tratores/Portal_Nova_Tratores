import nodemailer from 'nodemailer';
import { NextResponse } from 'next/server';
import { autenticar } from '@/lib/auth/server';

// Mesmo esquema de envio do Controle Revisão (Gmail via nodemailer)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
  pool: true,
  maxConnections: 3,
});

export async function POST(request: Request) {
  // Exige login: esta rota baixa URLs arbitrárias e manda e-mail pelo Gmail da
  // empresa — não pode ser anônima. (Allow-list de URL contra SSRF fica pro P2.)
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

  const html = `
<p>${saudacao}${clienteSan ? `, <strong>${clienteSan}</strong>` : ''}.</p>

<p>Segue em anexo ${itensTxt} referente ${nfSan ? `à NF ${nfSan}` : 'ao seu faturamento'}.</p>

${valorSan ? `<p>Valor: <strong>${valorSan}</strong>${vencSan ? `<br>Vencimento: ${vencSan}` : ''}</p>` : (vencSan ? `<p>Vencimento: ${vencSan}</p>` : '')}

<br>
<p>Qualquer dúvida estamos à disposição.</p>

<p>${remetenteSan || 'Nova Tratores'}<br>
&nbsp;&nbsp;&nbsp;Financeiro / Pós-Vendas</p>
`;

  try {
    const info = await transporter.sendMail({
      from: `"Nova Tratores" <${process.env.GMAIL_USER}>`,
      to: destinatarios.join(', '),
      subject,
      html,
      attachments,
    });
    return NextResponse.json({ ok: true, id: info.messageId, enviados: destinatarios });
  } catch (error: any) {
    console.error('Erro ao enviar boleto por email:', error);
    return NextResponse.json({ error: `Falha ao enviar email: ${error.message}` }, { status: 500 });
  }
}
