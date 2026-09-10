// Telefone para WhatsApp — compartilhado pela Agenda de follow-up e pelo
// cockpit de atendimento (contatos do NovaZap). Client-safe, sem dependências.

/**
 * Só dígitos, com DDI 55 na frente. Devolve null se não houver número
 * aproveitável (menos de 10 dígitos = sem DDD ou incompleto).
 */
export function normalizarTelefoneWa(tel: string | null | undefined): string | null {
  const digits = String(tel ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.startsWith("55") && digits.length >= 12 ? digits : `55${digits}`;
}

/** Link `wa.me` pronto; `texto` vira a mensagem inicial. */
export function linkWhatsapp(tel: string | null | undefined, texto?: string): string | null {
  const n = normalizarTelefoneWa(tel);
  if (!n) return null;
  return texto ? `https://wa.me/${n}?text=${encodeURIComponent(texto)}` : `https://wa.me/${n}`;
}
