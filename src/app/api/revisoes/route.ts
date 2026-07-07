import nodemailer from 'nodemailer';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sanitizarFiltro } from '@/lib/busca-segura';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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
    // Enviar email e salvar PDF em paralelo
    const ext = file.name.split('.').pop() || 'pdf';
    const storagePath = `${chassisSan}/${horasSan}h_${Date.now()}.${ext}`;

    const [info, uploadResult] = await Promise.all([
      // 1) Enviar email
      transporter.sendMail({
        from: `"Sistema Revisão" <${process.env.GMAIL_USER}>`,
        to: destinatarios.join(', '),
        subject,
        html,
        attachments: [{ filename: file.name, content: buffer }],
      }),
      // 2) Upload do PDF ao Storage
      supabase.storage
        .from('revisoes')
        .upload(storagePath, buffer, { contentType: file.type || 'application/pdf', upsert: true })
        .then(({ error }) => {
          if (error) return null;
          const { data } = supabase.storage.from('revisoes').getPublicUrl(storagePath);
          return data.publicUrl;
        })
        .catch(() => null),
    ]);

    // 3) Salvar registro no banco de dados
    const nomeSender = formData.get('nome') as string | null;
    await supabase.from('revisao_emails').insert({
      chassis: chassisSan,
      chassis_final: chassisFinal,
      horas: horasSan,
      modelo: modeloSan,
      cliente: clienteSan || null,
      assunto: subject,
      destinatarios,
      corpo: html,
      pdf_url: uploadResult || null,
      enviado_por: nomeSender?.replace(/[<>&"']/g, '') || null,
    }).then(({ error }) => {
      if (error) console.error('Erro ao salvar revisao_emails:', error.message);
    });

    // Recalcular pendência Mahindra: para OS abertas desse chassis, tentar limpar.
    // A re-checagem completa ocorre quando a OS for editada. Aqui limpamos
    // pendências cuja única lacuna era esta revisão específica.
    await supabase
      .from('Ordem_Servico')
      .update({ pendencia_mahindra: null })
      .or(`Projeto.ilike.%${sanitizarFiltro(chassisSan)}%,Serv_Solicitado.ilike.%${sanitizarFiltro(chassisSan)}%`)
      .not('Status', 'in', '("Concluída","Cancelada")')
      .then(({ error }) => {
        if (error) console.error('Erro ao limpar pendencia_mahindra:', error.message);
      });

    return NextResponse.json({ id: info.messageId, pdfUrl: uploadResult });
  } catch (error: any) {
    console.error('Erro ao enviar email:', error);
    return NextResponse.json(
      { error: `Falha ao enviar email: ${error.message}` },
      { status: 500 }
    );
  }
}
