// =============================================
// SCHEMAS ZOD - VALIDAÇÃO DAS API ROUTES
// =============================================

import { z } from "zod";

export const produtoManualSchema = z.object({
  id: z.string().optional(),
  codigo: z.string().min(1, "Código obrigatório"),
  descricao: z.string().min(1, "Descrição obrigatória"),
  preco: z.number().min(0, "Preço inválido"),
});

export const criarPedidoSchema = z.object({
  tipoPedido: z.string().min(1),
  motivoSaida: z.string().min(1),
  tecnico: z.string().min(1, "Técnico obrigatório"),
  cliente: z.string().min(1, "Cliente obrigatório"),
  observacao: z.string().optional().default(""),
  osId: z.string().optional().default(""),
  valorTotal: z.number().min(0).default(0),
  idExistente: z.string().optional(),
  produtosSelecionados: z.array(z.object({
    codigo: z.string().min(1),
    descricao: z.string().default(""),
    quantidade: z.number().min(0.5),
    preco: z.number().min(0),
  })).default([]),
});

export const editarPedidoSchema = z.object({
  id: z.string().min(1, "ID obrigatório"),
  status: z.string().min(1),
  observacao: z.string().optional().default(""),
  tecnico: z.string().optional().default(""),
  cliente: z.string().optional().default(""),
  motivoCancelamento: z.string().optional().default(""),
  pedidoOmie: z.string().optional().default(""),
  osId: z.string().optional().default(""),
  tipoPedido: z.string().optional().default(""),
  motivoSaida: z.string().optional().default(""),
});

export const movimentacaoSchema = z.object({
  id: z.string().min(1, "ID do pedido obrigatório"),
  codigo: z.string().min(1, "Código do produto obrigatório"),
  descricao: z.string().default(""),
  quantidade: z.number().min(0.5, "Quantidade mínima: 0.5"),
  preco: z.number().min(0),
  tecnico: z.string().default(""),
  tipoMovimento: z.enum(["Saída", "Devolução"]),
});

export const buscaTermoSchema = z.object({
  termo: z.string().min(1, "Digite ao menos 1 caractere"),
});

export const buscaTermoOSSchema = z.object({
  termo: z.string().min(1, "Digite ao menos 1 caractere"),
});
