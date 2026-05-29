const { ImapFlow } = require('imapflow');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
const BUCKET = 'clientes-docs';

process.on('uncaughtException', (err) => {
  if (err.code === 'ETIMEOUT' || err.message.includes('timeout') || err.message.includes('Socket')) return;
  console.error('Fatal:', err.message); process.exit(1);
});

async function baixarAnexos(chassis, uid, pasta) {
  const client = new ImapFlow({
    host: 'imap.gmail.com', port: 993, secure: true,
    auth: { user: 'posvendas.novatratores@gmail.com', pass: 'vuak yzex ycpm mydd' },
    logger: false, socketTimeout: 30000,
  });
  client.on('error', () => {});

  try {
    await client.connect();
    const lock = await client.getMailboxLock(pasta);
    const salvos = [];

    try {
      for await (const msg of client.fetch([uid], { bodyStructure: true, uid: true })) {
        const anexos = [];
        function findAtt(node) {
          if (!node) return;
          if (node.childNodes) { for (const c of node.childNodes) findAtt(c); return; }
          const disp = (node.disposition || '').toLowerCase();
          if (disp === 'attachment' || (node.type !== 'text' && (node.size || 0) > 500)) {
            anexos.push({
              nome: node.dispositionParameters?.filename || node.parameters?.name || node.type + '_' + node.subtype,
              tipo: node.type + '/' + node.subtype,
              part: node.part || '',
            });
          }
        }
        if (msg.bodyStructure) findAtt(msg.bodyStructure);

        for (const anx of anexos) {
          try {
            const { content } = await client.download(uid.toString(), anx.part, { uid: true });
            const chunks = [];
            for await (const chunk of content) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            const buffer = Buffer.concat(chunks);
            if (buffer.length > 100) {
              const safeName = anx.nome.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 80);
              const path = 'emails/' + chassis + '/' + uid + '_' + safeName;
              const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, { contentType: anx.tipo, upsert: true });
              if (!error) {
                const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
                salvos.push({ nome: anx.nome, tipo: anx.tipo, url: pub.publicUrl, size: buffer.length });
              }
            }
          } catch {}
        }
      }
    } catch {}
    lock.release();
    await client.logout();
    return salvos;
  } catch (e) {
    try { await client.logout(); } catch {}
    return [];
  }
}

async function main() {
  // Emails que tem conteudo mas nao tem anexo baixado
  const { data: emails } = await supabase.from('projeto_emails')
    .select('id, chassis, uid, pasta, assunto')
    .neq('uid', 0)
    .eq('tem_anexo', false);

  console.log('Emails para baixar anexos:', emails?.length);

  for (const email of emails || []) {
    console.log('\n' + email.chassis + ' (uid=' + email.uid + '): ' + (email.assunto || '').substring(0, 50));
    const salvos = await baixarAnexos(email.chassis, email.uid, email.pasta);

    if (salvos.length > 0) {
      await supabase.from('projeto_emails').update({
        tem_anexo: true,
        anexos: JSON.stringify(salvos),
        updated_at: new Date().toISOString(),
      }).eq('id', email.id);
      console.log('  -> ' + salvos.length + ' anexo(s): ' + salvos.map(a => a.nome).join(', '));
    } else {
      console.log('  -> sem anexos');
    }

    await new Promise(r => setTimeout(r, 3000));
  }

  console.log('\nFinalizado');
}

main().catch(e => console.error(e));
