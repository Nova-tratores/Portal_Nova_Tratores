const { ImapFlow } = require('imapflow');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
const BUCKET = 'clientes-docs';

async function main() {
  // Pegar todos os chassis do banco pra fazer match
  const { data: chassisDB } = await supabase.from('projeto_chassis').select('chassis, projeto, empresa, modelo');
  const chassisMap = new Map();
  for (const c of chassisDB || []) {
    chassisMap.set(c.chassis.toUpperCase(), c);
    // Ultimos 5 digitos como chave alternativa
    const tail = c.chassis.replace(/[^a-zA-Z0-9]/g, '').slice(-5).toUpperCase();
    if (tail.length >= 4 && !chassisMap.has(tail)) chassisMap.set(tail, c);
  }
  console.log('Chassis no banco:', chassisDB?.length, '| Chaves de busca:', chassisMap.size);

  // Limpar emails antigos (uid=0)
  await supabase.from('projeto_emails').delete().eq('uid', 0);

  // Conectar ao Gmail
  const client = new ImapFlow({
    host: 'imap.gmail.com', port: 993, secure: true,
    auth: { user: 'posvendas.novatratores@gmail.com', pass: 'vuak yzex ycpm mydd' },
    logger: false,
  });
  await client.connect();
  console.log('Gmail conectado');

  // Abrir pasta de enviados
  const pastas = ['[Gmail]/E-mails enviados', '[Gmail]/Sent Mail', '[Gmail]/Enviados'];
  let lock, pastaUsada = '';
  for (const p of pastas) {
    try { lock = await client.getMailboxLock(p); pastaUsada = p; break; } catch {}
  }
  if (!lock) { console.error('Pasta de enviados nao encontrada'); await client.logout(); return; }
  console.log('Pasta:', pastaUsada, '| Msgs:', client.mailbox.exists);

  // Varrer TODOS os emails da pasta
  console.log('Varrendo todos os emails...');
  const emailsParaSalvar = [];
  let total = 0, matched = 0;

  const messages = client.fetch('1:*', { envelope: true, bodyStructure: true, uid: true });

  for await (const msg of messages) {
    total++;
    if (total % 500 === 0) console.log('  Escaneados:', total);

    const subject = (msg.envelope?.subject || '').toUpperCase();
    if (!subject) continue;

    // Procurar chassis no assunto
    let chassisFound = null;

    // Verificar cada chassis conhecido
    for (const [key, info] of chassisMap.entries()) {
      if (subject.includes(key)) {
        chassisFound = info;
        break;
      }
    }

    if (!chassisFound) continue;
    matched++;

    // Verificar anexos
    const anexos = [];
    function findAtt(node) {
      if (!node) return;
      if (node.childNodes) { for (const c of node.childNodes) findAtt(c); return; }
      const disp = (node.disposition || '').toLowerCase();
      const nome = (node.dispositionParameters?.filename || node.parameters?.name || '').toLowerCase();
      if (disp === 'attachment' || nome.endsWith('.pdf') || nome.endsWith('.jpg') || nome.endsWith('.jpeg') || nome.endsWith('.png') ||
          (node.type === 'application' && (node.size || 0) > 500)) {
        anexos.push({
          nome: node.dispositionParameters?.filename || node.parameters?.name || node.type + '_' + node.subtype,
          tipo: node.type + '/' + node.subtype,
          part: node.part || '',
          size: node.size || 0,
        });
      }
    }
    if (msg.bodyStructure) findAtt(msg.bodyStructure);

    emailsParaSalvar.push({
      chassis: chassisFound.chassis,
      projeto: chassisFound.projeto,
      uid: msg.uid,
      envelope: msg.envelope,
      anexos_meta: anexos,
      tem_anexo: anexos.length > 0,
    });
  }

  console.log('Total escaneado:', total, '| Emails com chassis:', matched, '| Com anexo:', emailsParaSalvar.filter(e => e.tem_anexo).length);
  lock.release();

  // Agora baixar anexos e salvar
  console.log('\nBaixando anexos e salvando...');
  let salvos = 0, anexosBaixados = 0;

  for (let i = 0; i < emailsParaSalvar.length; i++) {
    const email = emailsParaSalvar[i];
    if (i % 50 === 0 && i > 0) console.log('Progresso:', i, '/', emailsParaSalvar.length);

    const env = email.envelope;
    const anexosSalvos = [];

    // Baixar anexos
    if (email.tem_anexo) {
      const lock2 = await client.getMailboxLock(pastaUsada);
      try {
        for (const anx of email.anexos_meta) {
          try {
            const { content } = await client.download(email.uid.toString(), anx.part, { uid: true });
            const chunks = [];
            for await (const chunk of content) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            const buffer = Buffer.concat(chunks);
            if (buffer.length > 500) {
              const safeName = anx.nome.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 80);
              const chKey = email.chassis.replace(/[^a-zA-Z0-9]/g, '_');
              const path = 'emails/' + chKey + '/' + email.uid + '_' + safeName;
              const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, { contentType: anx.tipo, upsert: true });
              if (!error) {
                const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
                anexosSalvos.push({ nome: anx.nome, tipo: anx.tipo, url: pub.publicUrl, size: buffer.length });
                anexosBaixados++;
              }
            }
          } catch {}
        }
      } catch {}
      lock2.release();
    }

    // Salvar no banco
    await supabase.from('projeto_emails').upsert({
      chassis: email.chassis,
      uid: email.uid,
      pasta: pastaUsada,
      assunto: env?.subject || '',
      de: env?.from?.[0]?.address || '',
      para: (env?.to || []).map(a => a.address),
      data: env?.date ? new Date(env.date).toISOString() : null,
      tem_anexo: anexosSalvos.length > 0,
      anexos: JSON.stringify(anexosSalvos),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'chassis,uid,pasta' });
    salvos++;
  }

  await client.logout();
  console.log('\nFinalizado:', salvos, 'emails salvos,', anexosBaixados, 'anexos baixados');
}

main().catch(e => console.error('ERRO:', e.message));
