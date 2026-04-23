export interface Trator {
  ID: string;
  Modelo: string;
  Chassis: string;
  Numero_Motor: string;
  Vendedor: string;
  Cidade: string;
  Cliente: string;
  Entrega: string;
  "Inspecao Data": string;
  "Inspecao Horimetro": string;
  "Inspecao PDF": string;
  "50h Data": string;
  "50h Horimetro": string;
  "300h Data": string;
  "300h Horimetro": string;
  "600h Data": string;
  "600h Horimetro": string;
  "900h Data": string;
  "900h Horimetro": string;
  "1200h Data": string;
  "1200h Horimetro": string;
  "1500h Data": string;
  "1500h Horimetro": string;
  "1800h Data": string;
  "1800h Horimetro": string;
  "2100h Data": string;
  "2100h Horimetro": string;
  "2400h Data": string;
  "2400h Horimetro": string;
  "2700h Data": string;
  "2700h Horimetro": string;
  "3000h Data": string;
  "3000h Horimetro": string;
  [key: string]: any;
}

export const REVISOES_LISTA: string[] = [
  "50h", "300h", "600h", "900h", "1200h", "1500h",
  "1800h", "2100h", "2400h", "2700h", "3000h"
];
