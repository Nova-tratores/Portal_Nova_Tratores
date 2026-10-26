import { redirect } from "next/navigation";

// Contatos do WhatsApp por cargo foram para dentro de Clientes (23/10/2026).
export default function AntigaContatos() {
  redirect("/feedbacks/clientes?ver=contatos");
}
