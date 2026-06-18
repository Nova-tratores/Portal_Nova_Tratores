// Helpers de data: Omie usa DD/MM/YYYY, Postgres/JS usam YYYY-MM-DD.

function parseBR(s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function parseBRTimestamp(s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]} ${m[4]}:${m[5]}:${m[6]}`;
  const d = parseBR(s);
  return d ? `${d} 00:00:00` : null;
}

function fmtBR(date) {
  const d = (date instanceof Date) ? date : new Date(date);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

function fmtISO(date) {
  const d = (date instanceof Date) ? date : new Date(date);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function hoje() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

function addDias(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function inicioMes(ano, mes) {
  return new Date(ano, mes - 1, 1);
}

function fimMes(ano, mes) {
  return new Date(ano, mes, 0);
}

// Status derivado em runtime, sem persistir (evita drift).
// Retorna: 'LIQUIDADO' | 'PARCIAL' | 'VENCIDO' | 'A_VENCER_PROXIMO' | 'A_VENCER'
function statusDerivado(titulo, hojeRef) {
  const ref = hojeRef || hoje();
  const venc = titulo.data_vencimento ? new Date(titulo.data_vencimento) : null;
  const pago = titulo.data_pagamento ? new Date(titulo.data_pagamento) : null;
  const valorDoc = parseFloat(titulo.valor_documento || 0);
  const valorPago = parseFloat(titulo.valor_pago || 0);

  if (pago && valorPago >= valorDoc - 0.01) return 'LIQUIDADO';
  if (valorPago > 0 && valorPago < valorDoc - 0.01) return 'PARCIAL';
  if (!venc) return 'A_VENCER';
  if (venc < ref) return 'VENCIDO';
  if (venc <= addDias(ref, 7)) return 'A_VENCER_PROXIMO';
  return 'A_VENCER';
}

module.exports = {
  parseBR,
  parseBRTimestamp,
  fmtBR,
  fmtISO,
  hoje,
  addDias,
  inicioMes,
  fimMes,
  statusDerivado
};
