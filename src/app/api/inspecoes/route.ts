import nodemailer from 'nodemailer';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
  const horimetro = formData.get('horimetro') as string | null;
  const modelo = formData.get('modelo') as string | null;
  const cliente = formData.get('cliente') as string | null;
  const nome = formData.get('nome') as string | null;
  const destinatariosRaw = formData.get('destinatarios') as string | null;

  if (!file || !chassis || !modelo) {
    return NextResponse.json(
      { error: 'Arquivo, chassis e modelo são obrigatórios.' },
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
  const modeloSan = sanitize(modelo);
  const chassisSan = sanitize(chassis);
  const chassisFinal = chassisSan.slice(-4);
  const clienteSan = cliente ? sanitize(cliente) : '';
  const nomeSan = nome ? sanitize(nome) : '';
  const horimetroSan = horimetro ? sanitize(horimetro) : '';

  const subject = 'INSPEÇÃO DE PRÉ ENTREGA DE TRATORES';

  const agora = new Date();
  const horaAtual = agora.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false });
  const saudacao = Number(horaAtual) < 12 ? 'Bom dia' : 'Boa tarde';

  const html = `
<p>${saudacao}, segue em anexo inspeção de pré-entrega do trator ${modeloSan}.</p>

<p>${modeloSan} - CHASSI: ${chassisSan} .</p>

<p>Qualquer dúvida estou à disposição,</p>

<p>att:</p>

<p><strong>${nomeSan}</strong><br>&nbsp;&nbsp;Pós vendas</p>
`;

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const ext = file.name.split('.').pop() || 'pdf';
    const storagePath = `${chassisSan}/inspecao_${Date.now()}.${ext}`;

    const [info, uploadResult] = await Promise.all([
      transporter.sendMail({
        from: `"Sistema Inspeção" <${process.env.GMAIL_USER}>`,
        to: destinatarios.join(', '),
        subject,
        html,
        attachments: [{ filename: file.name, content: buffer }],
      }),
      supabase.storage
        .from('inspecoes')
        .upload(storagePath, buffer, { contentType: file.type || 'application/pdf', upsert: true })
        .then(({ error }) => {
          if (error) return null;
          const { data } = supabase.storage.from('inspecoes').getPublicUrl(storagePath);
          return data.publicUrl;
        })
        .catch(() => null),
    ]);

    await supabase.from('inspecao_emails').insert({
      chassis: chassisSan,
      chassis_final: chassisFinal,
      horimetro: horimetroSan || null,
      modelo: modeloSan,
      cliente: clienteSan || null,
      assunto: subject,
      destinatarios,
      corpo: html,
      pdf_url: uploadResult || null,
      enviado_por: nomeSan || null,
    }).then(({ error }) => {
      if (error) console.error('Erro ao salvar inspecao_emails:', error.message);
    });

    // Limpa pendência Mahindra das OS abertas desse chassis (inspeção resolvida)
    await supabase
      .from('Ordem_Servico')
      .update({ pendencia_mahindra: null })
      .or(`Projeto.ilike.%${chassisSan}%,Serv_Solicitado.ilike.%${chassisSan}%`)
      .not('Status', 'in', '("Concluída","Cancelada")')
      .then(({ error }) => {
        if (error) console.error('Erro ao limpar pendencia_mahindra:', error.message);
      });

    return NextResponse.json({ id: info.messageId, pdfUrl: uploadResult });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'erro desconhecido';
    console.error('Erro ao enviar email de inspeção:', error);
    return NextResponse.json(
      { error: `Falha ao enviar email: ${msg}` },
      { status: 500 }
    );
  }
}
