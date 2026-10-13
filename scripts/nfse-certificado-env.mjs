// Grava o certificado A1 (.pfx) da empresa no .env.local para a integração com
// o sistema nacional da NFS-e — SEM a senha passar por chat/log:
//   node scripts/nfse-certificado-env.mjs "C:\Users\...\CERTIFICADO DIGITAL  NOVA TRATORES.pfx"
// Pede a senha no terminal (não aparece), confere se abre, mostra só o titular
// e a validade, e grava NFSE_CERT_PFX_BASE64 + NFSE_CERT_SENHA no .env.local.
// No Railway, copie os MESMOS dois valores (o script diz onde achar).
import fs from 'node:fs';
import readline from 'node:readline';
import forge from 'node-forge';

const arquivo = process.argv[2];
// empresa: sem 2º argumento = Nova (NFSE_CERT_*); "castro" = NFSE_CERT_*_CASTRO
//   node scripts/nfse-certificado-env.mjs "<.pfx da Castro>" castro
const sufixo = /castro/i.test(process.argv[3] || '') ? '_CASTRO' : '';
if (!arquivo || !fs.existsSync(arquivo)) {
  console.error('Uso: node scripts/nfse-certificado-env.mjs "<caminho do .pfx>"');
  process.exit(1);
}

function perguntarSenha(texto) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(texto)) process.stdout.write(s); }; // não ecoa o que é digitado
    rl.question(texto, (r) => { rl.close(); process.stdout.write('\n'); resolve(r); });
  });
}

const bytes = fs.readFileSync(arquivo);
const senha = await perguntarSenha('Senha do certificado: ');

let titular = '?', validade = '?', cnpj = '';
try {
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.createBuffer(bytes.toString('binary'))), senha);
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || [];
  if (!certBags.length || !keyBags.length) throw new Error('o arquivo não tem certificado + chave privada');
  const cert = certBags[0].cert;
  titular = cert.subject.getField('CN')?.value || '?';
  cnpj = (titular.match(/\d{14}/) || [''])[0];
  validade = cert.validity.notAfter.toLocaleDateString('pt-BR');
  if (cert.validity.notAfter < new Date()) console.warn('⚠️  ATENÇÃO: este certificado está VENCIDO.');
} catch (e) {
  console.error('Não consegui abrir o certificado (senha errada ou arquivo inválido):', e.message);
  process.exit(1);
}

const env = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : '';
const valores = { [`NFSE_CERT_PFX_BASE64${sufixo}`]: bytes.toString('base64'), [`NFSE_CERT_SENHA${sufixo}`]: senha };
let novo = env;
for (const [k, v] of Object.entries(valores)) {
  const re = new RegExp(`^${k}=.*$`, 'm');
  novo = re.test(novo) ? novo.replace(re, `${k}=${v}`) : `${novo.replace(/\s*$/, '')}\n${k}=${v}\n`;
}
fs.writeFileSync('.env.local', novo);
console.log(`✓ Certificado gravado no .env.local`);
console.log(`  Titular: ${titular}${cnpj ? ` (CNPJ ${cnpj})` : ''}`);
console.log(`  Válido até: ${validade}`);
console.log(`  No Railway: crie NFSE_CERT_PFX_BASE64${sufixo} e NFSE_CERT_SENHA${sufixo} com os mesmos valores do .env.local.`);
