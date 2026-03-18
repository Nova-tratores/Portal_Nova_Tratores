export function formatarDataBR(valor?: string | Date | null): string {
  if (!valor) {
    return new Intl.DateTimeFormat("pt-BR").format(new Date());
  }
  const d = new Date(valor);
  if (isNaN(d.getTime())) return String(valor);
  return new Intl.DateTimeFormat("pt-BR").format(d);
}

export function safeGet(
  obj: Record<string, unknown> | null | undefined,
  ...keys: string[]
): unknown {
  if (!obj) return null;
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== "EMPTY")
      return obj[key];
  }
  return null;
}

export function diasEntre(dataStr: string): number {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const parts = dataStr.split("/");
  if (parts.length !== 3) return 0;
  const dt = new Date(
    parseInt(parts[2]),
    parseInt(parts[1]) - 1,
    parseInt(parts[0])
  );
  dt.setHours(0, 0, 0, 0);
  return Math.floor((hoje.getTime() - dt.getTime()) / 86400000);
}

export function formatarMoeda(valor: number): string {
  return valor.toFixed(2).replace(".", ",");
}
