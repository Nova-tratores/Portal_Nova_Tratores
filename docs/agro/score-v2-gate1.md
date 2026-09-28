# Score v2 · Gate 1 — dados: duplicatas, vínculo tipado e confiança

Estado em 28/09/2026: **código e migration prontos; migration ainda NÃO aplicada; relatório numérico pendente**.
Reconhecimento anterior: [score-v2-gate0.md](score-v2-gate0.md).

## 1. O que foi entregue

| Peça | Arquivo |
|---|---|
| Migration (idempotente, com pré e pós-checagem) | `sql/agro-score-v2-gate1.sql` |
| Recálculo, um município por chamada | `scripts/agro/recalcular_v2.py` |
| Tipo de vínculo (lib pura + 3 testes) | `src/lib/agro/vinculo.ts` |
| Rotas que aceitam o tipo | `src/app/api/agro/vinculos/sugestoes/route.ts`, `src/app/api/agro/imovel/[cod]/route.ts` |
| Seletor de tipo nas telas | `FichaImovel.tsx`, `VinculosSugeridos.tsx` |

Nada do v1 foi alterado: `agro_car_perfil`, `agro_v_car_perfil` e `calcular_perfil.py` seguem como estão.

## 2. Como as decisões viraram banco

| Decisão | Implementação |
|---|---|
| 1. Segurança | RLS ligada sem policy e EXECUTE revogado, como no resto do módulo. As RPCs de ação humana chamam `agro_exigir_acesso(user_id)` e conferem `portal_permissoes` dentro da função. |
| 2. Duplicata mútua de 95% | Parâmetro `duplicata_mutuo_min_pct`. CAR contido em outro fica fora do grupo, ganha `contido_em` e continua sujeito à regra dos 20%. |
| 3. Motivo em código | `motivo_codigo` (um) + `rebaixadores` (lista). A conta da confiança é a do v1, portada para SQL. |
| 4. Recálculo por município | `agro_iniciar_recalculo` (grupos globais) → `agro_recalcular_perfil_municipio` → `agro_publicar_execucao`, que recusa execução incompleta. Estado em `agro_execucao_municipio`. |
| 6. Migrations | Pré e pós-checagem no próprio arquivo; conferência posterior pela API. |
| 7. Vínculo existente | Bloco 6 da migration para com erro até `v_decisao` ser preenchida. |
| 8. Divisa entre municípios | `agro_calcular_sobreposicoes_vizinhos`; o município do grupo é o do representante. |

A decisão 5 (idade do trator) pertence ao Gate 2.

## 3. Vínculo existente (decisão 7)

| Campo | Valor |
|---|---|
| CAR | `SP-3515400-C0AF375E12EA4EB2A1CE3CAC0FD11548` |
| Cliente | Faz São José (Omie 990100104) |
| Origem | sugestão por visita do CRM, aceita |
| Quem aceitou | Henri Irneh, financeiro@novatratores.com.br |
| Quando | 28/09/2026 12:16 UTC, cinco minutos depois do deploy da tela |

O horário sugere teste, mas isso não foi presumido. A migration exige a resposta.

## 4. Pontos que contradizem o texto original

1. **Diversificado não sobe para média.** A decisão 3 manda não mudar a conta da confiança. A simulação da regra do mosaico abaixo de 30% promoveria só 16 dos 8.752 diversificados, porque 8.522 têm mosaico de 30% ou mais. Quem traz o diversificado para a lista é o filtro padrão novo, que entra no Gate 3.
2. **Seletor de tipo entrou no Gate 1.** Sem ele, tornar o tipo obrigatório quebraria Aceitar e Vincular em produção até o Gate 3.
3. **Parâmetros são 9, não 11.** Os dois do mosaico saíram junto com a regra.

## 5. Ordem de aplicação

1. Publicar o código. As rotas novas voltam sozinhas para a assinatura antiga enquanto a migration não existir.
2. Editar `v_decisao` no bloco 6 e rodar `sql/agro-score-v2-gate1.sql` no SQL Editor.
3. Rodar `python scripts/agro/recalcular_v2.py`. Se a etapa de grupos estourar o tempo pela API, rodar `SELECT public.agro_iniciar_recalculo('seu nome');` no SQL Editor e continuar com `--retomar <id>`.

## 6. Verificação feita

| Verificação | Resultado |
|---|---|
| Sintaxe SQL e PL/pgSQL (parser do Postgres, pglast) | 59 comandos e 10 funções sem erro |
| `npx vitest run src/lib/agro` | 13 testes passando |
| `npm run build` | passou |
| Execução da migration em banco real | **não feita**: sem acesso SQL ao projeto e sem Docker ativo |
| Teste visual do seletor de tipo | **não feito** |

## 7. Relatório do Gate 1

Sai do próprio `recalcular_v2.py` depois da migration: grupos, CARs agrupados, componentes rejeitados, confiança antes e depois, motivos da mudança e dez grupos de exemplo.
