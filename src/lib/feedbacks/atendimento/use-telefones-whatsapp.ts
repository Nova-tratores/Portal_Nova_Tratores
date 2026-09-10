"use client";
// Telefones vindos do NovaZap, prontos para o select "telefone usado" do
// cockpit (concatenar com os telefones do cadastro Omie).
import { useMemo } from "react";
import type { SecaoWhatsapp } from "@/lib/chatwoot/parsers";
import type { ContextoAtendimento } from "./contexto";

export interface OpcaoTelefone {
  valor: string; // dígitos com DDI (ex.: 5514998638071)
  rotulo: string; // "Nome · Cargo"
  origem: "whatsapp";
}

export function opcoesTelefoneWhatsapp(secao: SecaoWhatsapp | undefined | null): OpcaoTelefone[] {
  if (!secao || secao.estado !== "ok") return [];
  const vistos = new Set<string>();
  const out: OpcaoTelefone[] = [];
  for (const c of secao.contatos) {
    if (!c.telefone_wa || vistos.has(c.telefone_wa)) continue;
    vistos.add(c.telefone_wa);
    out.push({ valor: c.telefone_wa, rotulo: c.cargo ? `${c.nome} · ${c.cargo}` : c.nome, origem: "whatsapp" });
  }
  return out;
}

export function useTelefonesWhatsapp(secao: SecaoWhatsapp | undefined | null): OpcaoTelefone[] {
  return useMemo(() => opcoesTelefoneWhatsapp(secao), [secao]);
}

export interface TelefoneOpcao { numero: string; wa: string | null; origem: string }

/** Telefones para a coluna da ligação: cadastro + atendimentos + WhatsApp, sem repetir. */
export function telefonesDoContexto(ctx: ContextoAtendimento | null): TelefoneOpcao[] {
  const vistos = new Set<string>();
  const out: TelefoneOpcao[] = [];
  for (const t of ctx?.identidade?.telefones ?? []) {
    const k = t.wa ?? t.numero;
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push(t);
  }
  for (const t of opcoesTelefoneWhatsapp(ctx?.whatsapp)) {
    if (vistos.has(t.valor)) continue;
    vistos.add(t.valor);
    out.push({ numero: `+${t.valor}`, wa: t.valor, origem: `WhatsApp · ${t.rotulo}` });
  }
  return out;
}
