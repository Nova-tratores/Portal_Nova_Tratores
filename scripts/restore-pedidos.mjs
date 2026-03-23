import fs from "fs";
import path from "path";

const CSV_PATH = path.resolve("pedidos_rows (4).csv");
const SUPABASE_URL = "https://citrhumdkfivdzbmayde.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpdHJodW1ka2ZpdmR6Ym1heWRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMDgyNzUsImV4cCI6MjA4NDY4NDI3NX0.83x3-NrKoJgtIuSE7Jjsaj0zH-b-XJ3Z8i3XkBkwVoU";

function parseCSV(text) {
  const lines = text.split("\n").filter((l) => l.trim());
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    // Handle commas inside fields (simple approach: split and rejoin if needed)
    const values = [];
    let current = "";
    let inQuotes = false;
    for (const char of lines[i]) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    const row = {};
    headers.forEach((h, idx) => {
      let val = values[idx] || "";
      // Decode HTML entities
      val = val.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
      row[h] = val;
    });
    rows.push(row);
  }
  return rows;
}

function toRecord(row) {
  const rec = {
    id_pedido: row.id_pedido,
    Motivo_Saida_Pedido: row.Motivo_Saida_Pedido || null,
    data: row.data || null,
    cliente: row.cliente || null,
    Tipo_Pedido: row.Tipo_Pedido || null,
    valor_total: row.valor_total ? parseFloat(row.valor_total) : 0,
    status: row.status || null,
    tecnico: row.tecnico || null,
    observacao: row.observacao || null,
    motivo_cancelamento: row.motivo_cancelamento || null,
    pedido_omie: row.pedido_omie || null,
    email_usuario: row.email_usuario || null,
    Tipo_Remessa: row.Tipo_Remessa || null,
    Motivo_Saida_Remessa: row.Motivo_Saida_Remessa || null,
    Id_Os: row.Id_Os || null,
    status_manual_override: row.status_manual_override === "true",
  };
  return rec;
}

async function upsert(record) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/pedidos?id_pedido=eq.${encodeURIComponent(record.id_pedido)}`,
    {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(record),
    }
  );

  const text = await res.text();
  const data = text ? JSON.parse(text) : [];

  // If PATCH returned empty (no row matched), do POST
  if (Array.isArray(data) && data.length === 0) {
    const res2 = await fetch(`${SUPABASE_URL}/rest/v1/pedidos`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify([record]),
    });
    if (!res2.ok) {
      const err = await res2.text();
      console.error(`  ERRO INSERT ${record.id_pedido}: ${err}`);
      return "error";
    }
    return "inserted";
  }

  if (!res.ok) {
    console.error(`  ERRO PATCH ${record.id_pedido}: ${text}`);
    return "error";
  }
  return "updated";
}

async function main() {
  const csv = fs.readFileSync(CSV_PATH, "utf-8");
  const rows = parseCSV(csv);
  console.log(`CSV: ${rows.length} pedidos`);

  let updated = 0, inserted = 0, errors = 0;

  for (const row of rows) {
    const rec = toRecord(row);
    const result = await upsert(rec);
    if (result === "updated") updated++;
    else if (result === "inserted") { inserted++; console.log(`  + Inserido: ${rec.id_pedido}`); }
    else errors++;
  }

  console.log(`\nResultado: ${updated} atualizados, ${inserted} inseridos, ${errors} erros`);
}

main().catch(console.error);
