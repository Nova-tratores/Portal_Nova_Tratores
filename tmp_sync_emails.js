const { ImapFlow } = require('imapflow');
const { createClient } = require('@supabase/supabase-js');

const GMAIL_USER = 'posvendas.novatratores@gmail.com';
const GMAIL_PASS = 'vuak yzex ycpm mydd';
const BUCKET = 'clientes-docs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function processarLote(chassisList) {
  const client = new ImapFlow({
    host: 'imap.gmail.com', port: 993, secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_PASS },
    logger: false,
  });

  await client.connect();
  let totalEmails = 0, totalAnexos = 0;

  for (const chassis of chassisList) {
    const emails = [];

    // Buscar no INBOX com body search
    let lock;
    try { lock = await client.getMailboxLock('INBOX'); } catch { continue; }

    try {
      const uids = await client.search({ body: chassis });
      if (uids && uids.length > 0) {
        for await (const msg of client.fetch(uids.slice(-20), { envelope: true, bodyStructure: true })) {
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
                size: node.size || 0,
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
                  totalAnexos++;
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

    if (emails.length > 0) {
      for (const e of emails) await supabase.from('projeto_emails').upsert(e, { onConflict: 'chassis,uid,pasta' });
      totalEmails += emails.length;
      console.log(chassis + ': ' + emails.length + ' emails, ' + emails.filter(e => e.tem_anexo).length + ' com anexo');
    } else {
      await supabase.from('projeto_emails').upsert({
        chassis, uid: 0, pasta: 'NONE', assunto: '', de: '', para: [],
        data: null, tem_anexo: false, anexos: '[]', updated_at: new Date().toISOString(),
      }, { onConflict: 'chassis,uid,pasta' });
      process.stdout.write('.');
    }

    await new Promise(r => setTimeout(r, 100));
  }

  await client.logout();
  return { totalEmails, totalAnexos };
}

async function main() {
  const { data: todosChassis } = await supabase.from('projeto_chassis').select('chassis').limit(5000);
  const { data: jaProc } = await supabase.from('projeto_emails').select('chassis');
  const jaSet = new Set((jaProc || []).map(e => e.chassis));
  const pendentes = (todosChassis || []).map(c => c.chassis).filter(ch => !jaSet.has(ch));

  console.log('Total:', todosChassis?.length, '| Processados:', jaSet.size, '| Pendentes:', pendentes.length);

  const LOTE = 20;
  let tE = 0, tA = 0;

  for (let i = 0; i < pendentes.length; i += LOTE) {
    const lote = pendentes.slice(i, i + LOTE);
    console.log('\nLote ' + (Math.floor(i/LOTE)+1) + '/' + Math.ceil(pendentes.length/LOTE));
    try {
      const r = await processarLote(lote);
      tE += r.totalEmails; tA += r.totalAnexos;
    } catch (e) {
      console.error('\nErro:', e.message);
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  console.log('\n\nTotal: ' + tE + ' emails, ' + tA + ' anexos');
}

main().catch(e => console.error(e));
