// Cores de marca do módulo de feedbacks.
// CRM = vermelho, RFM = índigo. Trocar aqui reflete em todo o módulo.

export const COR_CRM = "#dc2626";
export const COR_CRM_BG = "#fef2f2";
export const COR_CRM_FG = "#b91c1c";
export const GRAD_CRM = "linear-gradient(135deg, #dc2626, #b91c1c)";

export const COR_RFM = "#6366f1";
export const COR_RFM_BG = "#e0e7ff";
export const COR_RFM_FG = "#4338ca";
export const GRAD_RFM = "linear-gradient(135deg, #6366f1, #4f46e5)";

export const corTipo = (tipo: "crm" | "rfm") => (tipo === "crm" ? COR_CRM : COR_RFM);
export const gradTipo = (tipo: "crm" | "rfm") => (tipo === "crm" ? GRAD_CRM : GRAD_RFM);
