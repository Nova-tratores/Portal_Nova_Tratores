// Criptografia simétrica (AES-256-GCM) para segredos guardados no banco
// (ex.: senha de app do e-mail de envio do financeiro). A chave vem de
// EMAIL_ENC_KEY (env, só no servidor). Sem a chave, encrypt/decrypt falham.
import crypto from 'crypto'

function getKey(): Buffer {
  const raw = process.env.EMAIL_ENC_KEY || ''
  if (!raw) throw new Error('EMAIL_ENC_KEY não configurada')
  // hex de 64 chars = 32 bytes exatos; qualquer outra coisa vira 32 bytes via sha256.
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex')
  return crypto.createHash('sha256').update(raw).digest()
}

// Retorna "v1:iv:tag:ciphertext" (tudo base64).
export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv)
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`
}

export function decrypt(enc: string): string {
  const [v, ivB, tagB, ctB] = String(enc).split(':')
  if (v !== 'v1' || !ivB || !tagB || !ctB) throw new Error('Segredo em formato inválido')
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivB, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(ctB, 'base64')), decipher.final()]).toString('utf8')
}

export function temChaveCripto(): boolean {
  return !!(process.env.EMAIL_ENC_KEY || '')
}
