const { ImapFlow } = require('imapflow');
const { createClient } = require('@supabase/supabase-js');

const GMAIL_USER = 'posvendas.novatratores@gmail.com';
const GMAIL_PASS = 'vuak yzex ycpm mydd';
const BUCKET = 'clientes-docs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Evitar crash por socket timeout
process.on('uncaughtException', (err) => {
  if (err.code === 'ETIMEOUT' || err.message.includes('timeout') || err.message.includes('Socket')) {
    console.error('\nSocket timeout - continuando...');
  } else {
    console.error('\nErro fatal:', err.message);
    process.exit(1);
  }
});

async function criarClient() {
  const client = new ImapFlow({
    host: 'imap.gmail.com', port: 993, secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_PASS },
    logger: false,
    socketTimeout: 30000,
  });
  client.on('error', () => {});
  await client.connect();
  return client;
}

async function processarChassis(chassis, client) {
  const emails = [];
  const tail = chassis.replace(/[^a-zA-Z0-9]/g, '').slice(-5);

  const lock = await client.getMailboxLock('INBOX');
  try {
    let uids = await client.search({ subject: tail });

    if (uids && uids.length > 0) {
      for await (const msg of client.fetch(uids.slice(-20), { envelope: true, bodyStructure: true })) {
        const subj = (msg.envelope.subject || '').toUpperCase();
        if (!subj.includes(tail.toUpperCase())) continue;

        const env = msg.envelope;
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

        const salvos = [];
        for (const anx of anexos) {
          try {
            const { content } = await client.download(msg.uid.toString(), anx.part, { uid: true });
            const chunks = [];
            for await (const chunk of content) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            const buffer = Buffer.concat(chunks);
            if (buffer.length > 100) {
              const safeName = anx.nome.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 80);
              const path = 'emails/' + chassis + '/' + msg.uid + '_' + safeName;
              const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, { contentType: anx.tipo, upsert: true });
              if (!error) {
                const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
                salvos.push({ nome: anx.nome, tipo: anx.tipo, url: pub.publicUrl, size: buffer.length });
              }
            }
          } catch {}
        }

        emails.push({
          chassis, uid: msg.uid, pasta: 'INBOX',
          assunto: env.subject || '', de: env.from?.[0]?.address || '',
          para: (env.to || []).map(a => a.address),
          data: env.date ? new Date(env.date).toISOString() : null,
          tem_anexo: salvos.length > 0,
          anexos: JSON.stringify(salvos),
          updated_at: new Date().toISOString(),
        });
      }
    }
  } catch {}
  lock.release();
  return emails;
}

async function main() {
  const { data: todosChassis } = await supabase.from('projeto_chassis').select('chassis').limit(5000);
  const { data: jaProc } = await supabase.from('projeto_emails').select('chassis');
  const jaSet = new Set((jaProc || []).map(e => e.chassis));
  const pendentes = (todosChassis || []).map(c => c.chassis).filter(ch => !jaSet.has(ch));

  console.log('Pendentes:', pendentes.length);
  if (pendentes.length === 0) { console.log('Nada a fazer.'); return; }

  let tE = 0, tA = 0;
  const LOTE = 15;

  for (let i = 0; i < pendentes.length; i += LOTE) {
    const lote = pendentes.slice(i, i + LOTE);
    console.log('\nLote ' + (Math.floor(i/LOTE)+1) + '/' + Math.ceil(pendentes.length/LOTE));

    let client;
    try {
      client = await criarClient();
    } catch (e) {
      console.error('Falha ao conectar:', e.message);
      await new Promise(r => setTimeout(r, 10000));
      continue;
    }

    for (const chassis of lote) {
      try {
        const emails = await processarChassis(chassis, client);
        if (emails.length > 0) {
          for (const e of emails) await supabase.from('projeto_emails').upsert(e, { onConflict: 'chassis,uid,pasta' });
          tE += emails.length;
          tA += emails.filter(e => e.tem_anexo).length;
          console.log(chassis + ': ' + emails.length + ' emails');
        } else {
          await supabase.from('projeto_emails').upsert({
            chassis, uid: 0, pasta: 'NONE', assunto: '', de: '', para: [],
            data: null, tem_anexo: false, anexos: '[]', updated_at: new Date().toISOString(),
          }, { onConflict: 'chassis,uid,pasta' });
          process.stdout.write('.');
        }
      } catch (e) {
        console.error('\n' + chassis + ' erro:', e.message);
      }
    }

    try { await client.logout(); } catch {}
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('\n\nTotal: ' + tE + ' emails, ' + tA + ' com anexo');
}

main().catch(e => console.error(e));
