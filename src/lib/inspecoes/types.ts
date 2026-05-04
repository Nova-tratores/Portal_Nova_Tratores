export interface EmailInspecao {
  uid: string;
  subject: string;
  date: string;
  horimetro: string;
  modelo: string;
  chassisFinal: string;
  attachments: { filename: string; contentType: string; size: number; part: string }[];
  body: string;
}

export const INSPECAO_DESTINATARIOS_FIXOS: { nome: string; email: string }[] = [
  { nome: 'Marcel', email: 'marcel.ochsenhofer@mahindrabrazil.com' },
  { nome: 'Vinicius', email: 'ferreira.vinicius@mahindrabrazil.com' },
  { nome: 'Scheila', email: 'kronbauer.scheila@mahindrabrazil.com' },
];
