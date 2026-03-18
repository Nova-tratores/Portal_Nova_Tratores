import nodemailer from 'nodemailer';
import { NextResponse } from 'next/server';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const chassis = formData.get('chassis') as string | null;
  const horas = formData.get('horas') as string | null;
  const modelo = formData.get('modelo') as string | null;
  const cliente = formData.get('cliente') as string | null;
  const nome = formData.get('nome') as string | null;
  const destinatariosRaw = formData.get('destinatarios') as string | null;

  if (!file || !chassis || !horas || !modelo) {
    return NextResponse.json(
      { error: 'Arquivo, chassis, horas e modelo são obrigatórios.' },
      { status: 400 }
    );
  }

  let destinatarios: string[] = [];
  try {
    if (destinatariosRaw) destinatarios = JSON.parse(destinatariosRaw);
  } catch {
    // fallback
  }
  if (destinatarios.length === 0) {
    return NextResponse.json(
      { error: 'Nenhum destinatário informado.' },
      { status: 400 }
    );
  }

  const sanitize = (s: string) => s.replace(/[<>&"']/g, '');
  const horasSan = sanitize(horas);
  const modeloSan = sanitize(modelo);
  const chassisSan = sanitize(chassis);
  const chassisFinal = chassisSan.slice(-4);
  const clienteSan = cliente ? sanitize(cliente) : '';
  const nomeSan = nome ? sanitize(nome) : '';

  const subject = `CHEQUE DE REVISÃO - ${horasSan} HORAS - ${modeloSan} ${chassisFinal}`;

  const agora = new Date();
  const horaAtual = agora.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false });
  const saudacao = Number(horaAtual) < 12 ? 'Bom dia' : 'Boa tarde';

  const html = `
<p>${saudacao}, segue em anexo o cheque de revisão de ${horasSan} Horas do Trator ${modeloSan}.</p>

<p>CHASSI: ${chassisSan}<br>
CLIENTE: ${clienteSan}</p>

<br>
<p>Qualquer dúvida estou à disposição.</p>

<p>${nomeSan}<br>
&nbsp;&nbsp;&nbsp;Pós vendas</p>
`;

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const info = await transporter.sendMail({
      from: `"Sistema Revisão" <${process.env.GMAIL_USER}>`,
      to: destinatarios.join(', '),
      subject,
      html,
      attachments: [
        {
          filename: file.name,
          content: buffer,
        },
      ],
    });

    return NextResponse.json({ id: info.messageId });
  } catch (error: any) {
    console.error('Erro ao enviar email:', error);
    return NextResponse.json(
      { error: `Falha ao enviar email: ${error.message}` },
      { status: 500 }
    );
  }
}
