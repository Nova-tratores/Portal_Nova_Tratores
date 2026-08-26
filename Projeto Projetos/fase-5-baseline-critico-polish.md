# Fase 5 — Baseline, caminho crítico visual e polish

**Objetivo:** fechar o sistema com as camadas de leitura gerencial: linha de base
(plano original × real), destaque visual do caminho crítico, e exportação.

**Pré-requisitos:** Fases 0–4 aprovadas.

---

## 1. Baselines (linha de base)
- Botão "Salvar baseline" → cria um registro em `cronograma.baselines` e copia as
  datas calculadas atuais para `baseline_tarefas` (RPC `cron_salvar_baseline`).
- No Gantt, opção de mostrar a barra de baseline (fina, abaixo da barra atual) para
  ver o desvio plano × execução.
- Indicador por tarefa: dias de atraso/adianto vs. baseline selecionada.

## 2. Caminho crítico visual
- Toggle na toolbar (já existe da Fase 3) passa a destacar de fato: barras com
  `e_critica=true` em vermelho/realce; dependências do caminho crítico com traço
  mais forte.
- Painel lateral opcional: "fim do projeto", "folga total disponível", lista das
  tarefas críticas em ordem.

## 3. Plano × Real
- Comparação clara entre `inicio_planejado/fim_planejado` (se usados),
  `inicio_calc/fim_calc` (motor) e `inicio_real/fim_real` (execução).
- Curva de progresso simples (planejado vs realizado) — pode reusar Recharts, já
  presente no stack.

## 4. Exportação
- Exportar o projeto (tarefas + datas + dependências) em CSV/JSON.
- Opcional: PDF/PNG da timeline (o SVAR core exporta imagem; avaliar se basta).

## 5. Polish
- Estados vazios (projeto sem tarefas, recurso sem calendário).
- Mensagens de erro do motor (ciclo, restrição violada) com link para a tarefa.
- Confirmações destrutivas (remover dependência/tarefa com sucessoras).
- Revisar performance do recálculo em projeto grande; se passar de ~alguns
  segundos, ativar o worker no Railway via `pg_notify` (Fase 2.5 mencionada).

---

## Gate de revisão — Fase 5

- [ ] Salvar baseline e ver o desvio plano × real no Gantt.
- [ ] Caminho crítico destacado corretamente (bate com a folga do motor).
- [ ] Exportação CSV/JSON íntegra (reimportável).
- [ ] Erros do motor visíveis e acionáveis na UI.
- [ ] Sistema utilizável de ponta a ponta nos dois domínios (obra interna e OS de
      máquina) com o mesmo motor.

**Fim do roteiro base.** Evoluções futuras candidatas: auto-nivelamento de
recursos, dependências entre projetos, templates de cronograma por tipo de OS,
e o worker dedicado de recálculo.
