// Tipos mínimos do web-push (o pacote não traz .d.ts e @types/web-push não está instalado).
declare module 'web-push' {
  export interface PushSubscription { endpoint: string; keys: { p256dh: string; auth: string } }
  export interface RequestOptions { TTL?: number; urgency?: 'very-low' | 'low' | 'normal' | 'high'; topic?: string; headers?: Record<string, string> }
  export interface SendResult { statusCode: number; body: string; headers: Record<string, string> }
  export function setVapidDetails(subject: string, publicKey: string, privateKey: string): void
  export function sendNotification(subscription: PushSubscription, payload?: string | Buffer | null, options?: RequestOptions): Promise<SendResult>
  export function generateVAPIDKeys(): { publicKey: string; privateKey: string }
  const webpush: { setVapidDetails: typeof setVapidDetails; sendNotification: typeof sendNotification; generateVAPIDKeys: typeof generateVAPIDKeys }
  export default webpush
}
