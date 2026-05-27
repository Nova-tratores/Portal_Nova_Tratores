// =========================================================
// VEHICLE PANEL - Vehicle detail slide-in panel
// =========================================================

const VehiclePanel = {
    currentPlaca: null,

    async open(placa) {
        this.currentPlaca = placa;
        const panel = document.getElementById('vehicle-panel');
        const header = document.getElementById('vp-header');
        const body = document.getElementById('vp-body');

        header.innerHTML = '<div style="padding:20px;color:var(--text-muted)"><div class="spinner"></div> Carregando...</div>';
        body.innerHTML = '';
        panel.classList.add('open');

        // Fechar painel de cliente se estiver aberto
        Panels.close();

        // Usa dados ja carregados no state (evita nova chamada de rede)
        const v = (App.state.veiculos || []).find(v => v.placa === placa);
        if (!v) {
            header.innerHTML = '<div style="padding:20px;color:var(--accent-red)">Veiculo nao encontrado</div>';
            return;
        }
        this._render(v);
    },

    close() {
        document.getElementById('vehicle-panel').classList.remove('open');
        this.currentPlaca = null;
    },

    _render(v) {
        const header = document.getElementById('vp-header');
        const body = document.getElementById('vp-body');
        const on = v.ignicao;
        const oficina = Markers.isOficina(v.placa);
        const tipoBadge = oficina
            ? '<span class="vp-badge tipo-oficina">Oficina</span>'
            : '<span class="vp-badge tipo-comercial">Comercial</span>';

        const iconUrl = Utils.getVehicleIconUrl(v.modelo);
        const tipo = oficina ? 'oficina' : 'comercial';
        header.innerHTML = `
            <div style="display:flex;gap:14px;align-items:center">
                <div class="vp-vehicle-icon ${tipo}">
                    <img src="${iconUrl}" alt="${v.modelo || 'Veiculo'}" class="vp-vehicle-svg"/>
                </div>
                <div style="flex:1;min-width:0">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start">
                        <div>
                            <div class="vp-placa">${v.placa}</div>
                            <div class="vp-modelo">${v.modelo || 'Veiculo'} ${v.cor ? '| ' + v.cor : ''} ${v.ano ? '| ' + v.ano : ''}</div>
                        </div>
                        ${tipoBadge}
                    </div>
                    <div class="vp-status-row">
                        <span class="vp-badge ${on ? 'on' : 'off'}">${on ? 'Ligado' : 'Desligado'}</span>
                        <span class="vp-badge info">${v.velocidade || 0} km/h</span>
                        <span class="vp-badge info">${v.motorista || 'N/D'}</span>
                    </div>
                </div>
            </div>
        `;

        body.innerHTML = '';

        // KM cards (dia + mes) - load async
        body.innerHTML += `
            <div class="vp-km-cards">
                <div class="vp-km-card">
                    <div class="vp-km-card-label">KM Hoje</div>
                    <div class="vp-km-card-value" id="vp-km-dia">--</div>
                </div>
                <div class="vp-km-card">
                    <div class="vp-km-card-label">KM no Mes</div>
                    <div class="vp-km-card-value" id="vp-km-mes">--</div>
                </div>
                <div class="vp-km-card">
                    <div class="vp-km-card-label">Odometro</div>
                    <div class="vp-km-card-value">${v.odometro ? (v.odometro / 1000).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '--'}</div>
                </div>
            </div>
        `;

        // Coordenadas
        if (v.lat && v.lng) {
            body.innerHTML += `
                <div class="vp-section" style="padding:12px 24px">
                    <div style="display:flex;align-items:center;gap:8px;justify-content:space-between">
                        <div style="font-size:11px;color:var(--text-muted)">Coordenadas:</div>
                        <div style="font-family:monospace;font-size:13px;color:var(--text-primary);font-weight:600;letter-spacing:0.3px">${v.lat.toFixed(6)}, ${v.lng.toFixed(6)}</div>
                        <button class="vp-btn" style="padding:3px 8px;font-size:10px" onclick="navigator.clipboard.writeText('${v.lat.toFixed(6)}, ${v.lng.toFixed(6)}');Utils.toast('Coordenadas copiadas!','success')">Copiar</button>
                    </div>
                </div>
            `;
        }

        // Info basica
        body.innerHTML += `
            <div class="vp-section">
                <div class="vp-section-title">Informacoes</div>
                <div class="vp-info-grid">
                    <div class="vp-info-item">
                        <div class="vp-info-label">Pontos hoje</div>
                        <div class="vp-info-value">${v.pontos_hoje || 0}</div>
                    </div>
                    <div class="vp-info-item">
                        <div class="vp-info-label">Ultima posicao</div>
                        <div class="vp-info-value">${v.dt_posicao ? Utils.formatDateTime(v.dt_posicao) : 'N/D'}</div>
                    </div>
                    <div class="vp-info-item">
                        <div class="vp-info-label">Status GPS</div>
                        <div class="vp-info-value">${v.status || 'N/D'}</div>
                    </div>
                    <div class="vp-info-item">
                        <div class="vp-info-label">Ligado hoje</div>
                        <div class="vp-info-value" style="color:var(--accent-green)">${v.tempo_ligado_min != null ? (v.tempo_ligado_min >= 60 ? Math.floor(v.tempo_ligado_min / 60) + 'h ' + (v.tempo_ligado_min % 60) + 'min' : v.tempo_ligado_min + ' min') : 'N/D'}</div>
                    </div>
                </div>
            </div>
        `;

        // Rota de hoje
        body.innerHTML += `
            <div class="vp-section">
                <div class="vp-section-title">Rota de Hoje</div>
                <div class="vp-btn-row">
                    <button class="vp-btn primary" onclick="VehiclePanel.loadRotaHoje('${v.placa}')">Ver rota no mapa</button>
                    <button class="vp-btn" onclick="VehiclePanel.loadResumoHoje('${v.placa}')">Resumo do dia</button>
                </div>
                <div id="vp-resumo-hoje"></div>
            </div>
        `;

        // Historico mensal
        const now = new Date();
        now.setHours(now.getHours() - 3);
        const mesAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        body.innerHTML += `
            <div class="vp-section">
                <div class="vp-section-title">Historico Mensal</div>
                <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px">
                    <input type="month" id="vp-mes-select" class="sb-input" value="${mesAtual}" style="font-size:12px;flex:1">
                    <button class="vp-btn" onclick="VehiclePanel.loadResumoMensal('${v.placa}')" style="flex:0 0 auto">Carregar</button>
                </div>
                <div id="vp-resumo-mensal"></div>
            </div>
        `;

        // Load KM data async
        this._loadKmData(v.placa);

        // Meses disponiveis
        this._loadMesesDisponiveis(v.placa);
    },

    async _loadKmData(placa) {
        const now = new Date();
        now.setHours(now.getHours() - 3);
        const hoje = now.toISOString().split('T')[0];
        const mes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        const [diario, mensal] = await Promise.allSettled([
            Utils.fetchJson(`/api/rota-dia/resumo?placa=${placa}&data=${hoje}`),
            Utils.fetchJson(`/api/veiculos/${placa}/resumo-mensal?mes=${mes}`)
        ]);

        if (this.currentPlaca !== placa) return;

        const elDia = document.getElementById('vp-km-dia');
        const elMes = document.getElementById('vp-km-mes');

        if (elDia) {
            const km = (diario.status === 'fulfilled' && diario.value) ? (diario.value.km_total || 0) : 0;
            elDia.textContent = km + ' km';
        }
        if (elMes) {
            const km = (mensal.status === 'fulfilled' && mensal.value && mensal.value.totais) ? (mensal.value.totais.km_total || 0) : 0;
            elMes.textContent = km + ' km';
        }
    },

    async _loadMesesDisponiveis(placa) {
        try {
            const resp = await Utils.fetchJson(`/api/veiculos/${placa}/meses-historico`);
            if (resp.meses && resp.meses.length > 0) {
                const container = document.getElementById('vp-resumo-mensal');
                if (container) {
                    container.innerHTML = `<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">Meses com dados: ${resp.meses.map(m => `${m.mes} (${m.pontos} pts)`).join(', ')}</div>` + container.innerHTML;
                }
            }
        } catch (e) { /* silencioso */ }
    },

    loadRotaHoje(placa) {
        Routes.loadRoute(placa);
    },

    async loadResumoHoje(placa) {
        const container = document.getElementById('vp-resumo-hoje');
        if (!container) return;
        container.innerHTML = '<div style="padding:10px;color:var(--text-muted)"><div class="spinner" style="display:inline-block;margin-right:8px"></div> Calculando...</div>';

        try {
            const now = new Date();
            now.setHours(now.getHours() - 3);
            const hoje = now.toISOString().split('T')[0];
            const resp = await Utils.fetchJson(`/api/rota-dia/resumo?placa=${placa}&data=${hoje}`);

            if (resp.total_pontos === 0) {
                container.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:8px 0">Nenhum dado de rota para hoje</div>';
                return;
            }

            container.innerHTML = `
                <div class="vp-info-grid" style="margin-top:12px">
                    <div class="vp-info-item">
                        <div class="vp-info-label">KM Total</div>
                        <div class="vp-info-value" style="color:var(--accent-blue)">${resp.km_total} km</div>
                    </div>
                    <div class="vp-info-item">
                        <div class="vp-info-label">Paradas</div>
                        <div class="vp-info-value" style="color:var(--accent-yellow)">${resp.paradas.length}</div>
                    </div>
                    <div class="vp-info-item">
                        <div class="vp-info-label">Em movimento</div>
                        <div class="vp-info-value" style="color:var(--accent-green)">${resp.tempo_movimento_min} min</div>
                    </div>
                    <div class="vp-info-item">
                        <div class="vp-info-label">Parado</div>
                        <div class="vp-info-value" style="color:var(--accent-red)">${resp.tempo_parado_min} min</div>
                    </div>
                    <div class="vp-info-item">
                        <div class="vp-info-label">Vezes ligado</div>
                        <div class="vp-info-value" style="color:var(--accent-green)">${resp.ignicoes != null ? resp.ignicoes + 'x' : 'N/D'}</div>
                    </div>
                </div>
                ${resp.hora_inicio ? `<div style="font-size:11px;color:var(--text-muted);margin-top:8px">Inicio: ${Utils.formatTime(resp.hora_inicio)} | Fim: ${Utils.formatTime(resp.hora_fim)} | ${resp.total_pontos} pontos</div>` : ''}
                ${resp.paradas.length > 0 ? `
                    <div style="margin-top:12px">
                        <div style="font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:6px">Paradas:</div>
                        ${resp.paradas.map((p, i) => `
                            <div style="font-size:11px;color:var(--text-secondary);padding:4px 0;border-bottom:1px solid var(--glass-border-light)">
                                ${i + 1}. ${Utils.formatTime(p.inicio)} - ${Utils.formatTime(p.fim)} (${p.duracao_min} min)
                                ${p.endereco ? `<br><span style="color:var(--text-muted)">${p.endereco}</span>` : ''}
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            `;
        } catch (e) {
            container.innerHTML = '<div style="font-size:12px;color:var(--accent-red);padding:8px 0">Erro ao carregar resumo</div>';
        }
    },

    async loadResumoMensal(placa) {
        const container = document.getElementById('vp-resumo-mensal');
        if (!container) return;

        const mesInput = document.getElementById('vp-mes-select');
        const mes = mesInput ? mesInput.value : null;
        if (!mes) { Utils.toast('Selecione um mes', 'error'); return; }

        container.innerHTML = '<div style="padding:10px;color:var(--text-muted)"><div class="spinner" style="display:inline-block;margin-right:8px"></div> Carregando...</div>';

        try {
            const resp = await Utils.fetchJson(`/api/veiculos/${placa}/resumo-mensal?mes=${mes}`);

            if (resp.dias.length === 0) {
                container.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:8px 0">Nenhum dado para este mes</div>';
                return;
            }

            container.innerHTML = `
                <div class="vp-totais">
                    <div class="vp-total-card">
                        <div class="vp-total-value" style="color:var(--accent-blue)">${resp.totais.km_total}</div>
                        <div class="vp-total-label">KM Total</div>
                    </div>
                    <div class="vp-total-card">
                        <div class="vp-total-value" style="color:var(--accent-green)">${resp.totais.media_km_dia}</div>
                        <div class="vp-total-label">Media KM/dia</div>
                    </div>
                    <div class="vp-total-card">
                        <div class="vp-total-value" style="color:var(--accent-yellow)">${resp.totais.dias_ativos}</div>
                        <div class="vp-total-label">Dias ativos</div>
                    </div>
                </div>
                <div class="vp-totais" style="margin-top:8px">
                    <div class="vp-total-card">
                        <div class="vp-total-value" style="color:var(--accent-green)">${resp.totais.ignicoes_total ?? 0}</div>
                        <div class="vp-total-label">Ligadas no mes</div>
                    </div>
                    <div class="vp-total-card">
                        <div class="vp-total-value" style="color:var(--accent-green)">${resp.totais.ignicoes_semana ?? 0}</div>
                        <div class="vp-total-label">Ultimos 7 dias</div>
                    </div>
                    <div class="vp-total-card">
                        <div class="vp-total-value" style="color:var(--accent-green)">${resp.totais.ignicoes_media_dia ?? 0}</div>
                        <div class="vp-total-label">Media/dia</div>
                    </div>
                </div>
                <table class="vp-table" style="margin-top:12px">
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>KM</th>
                            <th>Paradas</th>
                            <th>Ligadas</th>
                            <th>Tempo</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${resp.dias.map(d => `
                            <tr>
                                <td>${d.data.split('-').reverse().join('/')}</td>
                                <td>${d.km_total}</td>
                                <td>${d.paradas}</td>
                                <td>${d.ignicoes ?? 0}</td>
                                <td>${d.tempo_ativo_min} min</td>
                                <td><button class="vp-btn" style="padding:3px 8px;font-size:10px" onclick="Routes.loadRoute('${placa}', '${d.data}')">Mapa</button></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        } catch (e) {
            container.innerHTML = '<div style="font-size:12px;color:var(--accent-red);padding:8px 0">Erro ao carregar historico</div>';
        }
    }
};
