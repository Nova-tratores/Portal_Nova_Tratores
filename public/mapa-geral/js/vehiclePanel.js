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

        // Paradas no mapa (mostra todas as paradas do dia com tempo)
        if (v.paradas_hoje && v.paradas_hoje.length > 0) {
            const totalParadoMin = v.paradas_hoje.reduce((s, p) => s + (p.duracao_min || 0), 0);
            const dirigindoMin = v.tempo_ligado_min || 0;
            const fmtTempo = (min) => min >= 60 ? Math.floor(min/60) + 'h' + (min%60 > 0 ? String(min%60).padStart(2,'0') + 'min' : '') : min + 'min';

            body.innerHTML += `
                <div class="vp-section">
                    <div class="vp-section-title">Resumo do Dia</div>
                    <div class="vp-info-grid" style="margin-bottom:12px">
                        <div class="vp-info-item">
                            <div class="vp-info-label">Dirigindo</div>
                            <div class="vp-info-value" style="color:var(--accent-green)">${fmtTempo(dirigindoMin)}</div>
                        </div>
                        <div class="vp-info-item">
                            <div class="vp-info-label">Parado</div>
                            <div class="vp-info-value" style="color:var(--accent-red)">${fmtTempo(totalParadoMin)}</div>
                        </div>
                        <div class="vp-info-item">
                            <div class="vp-info-label">Paradas</div>
                            <div class="vp-info-value" style="color:var(--accent-yellow)">${v.paradas_hoje.length}</div>
                        </div>
                        <div class="vp-info-item">
                            <div class="vp-info-label">Pontos GPS</div>
                            <div class="vp-info-value">${v.pontos_hoje || 0}</div>
                        </div>
                    </div>
                    <button class="vp-btn primary" style="width:100%;margin-bottom:8px" onclick="VehiclePanel.mostrarParadasNoMapa('${v.placa}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="10" r="3"/><path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 0 0-16 0c0 3 2.7 7 8 11.7z"/></svg>
                        Ver paradas no mapa
                    </button>
                    <div style="display:flex;flex-direction:column;gap:4px">
                        ${v.paradas_hoje.map((p, i) => {
                            const fmtH = (iso) => { if (!iso) return '--:--'; try { const d = new Date(iso); return d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0') } catch { return '--:--' } };
                            const corP = p.duracao_min > 60 ? '#DC2626' : p.duracao_min > 30 ? '#EA580C' : '#F59E0B';
                            return `<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:rgba(255,255,255,0.06);border-radius:8px;border-left:3px solid ${corP}">
                                <span style="font-size:11px;font-weight:700;color:var(--text-primary);min-width:20px">${i+1}</span>
                                <span style="font-size:12px;color:var(--text-secondary)">${fmtH(p.inicio)} - ${p.fim ? fmtH(p.fim) : 'agora'}</span>
                                <span style="font-size:12px;font-weight:800;color:${corP};margin-left:auto">${fmtTempo(p.duracao_min)}</span>
                            </div>`;
                        }).join('')}
                    </div>
                </div>
            `;
        }

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
    },

    _paradasLayer: null,

    mostrarParadasNoMapa(placa) {
        const v = (App.state.veiculos || []).find(v => v.placa === placa);
        if (!v || !v.paradas_hoje || v.paradas_hoje.length === 0) {
            Utils.toast('Nenhuma parada registrada hoje', 'error');
            return;
        }

        // Limpar camada anterior
        if (this._paradasLayer) {
            MapCore.map.removeLayer(this._paradasLayer);
        }
        this._paradasLayer = L.layerGroup().addTo(MapCore.map);

        const bounds = [];
        const fmtH = (iso) => { if (!iso) return '--:--'; try { const d = new Date(iso); return d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0') } catch { return '--:--' } };
        const fmtTempo = (min) => min >= 60 ? Math.floor(min/60) + 'h' + (min%60 > 0 ? String(min%60).padStart(2,'0') + 'min' : '') : min + 'min';

        // Posição atual do veículo
        if (v.lat && v.lng) {
            const iconUrl = Utils.getVehicleIconUrl(v.modelo);
            const carIcon = L.divIcon({
                className: '',
                html: `<div style="display:flex;flex-direction:column;align-items:center">
                    <div style="background:rgba(15,23,42,0.95);padding:4px 10px;border-radius:6px;display:flex;align-items:center;gap:6px;box-shadow:0 2px 8px rgba(0,0,0,0.3)">
                        <img src="${iconUrl}" style="width:20px;height:20px;filter:brightness(10)" />
                        <span style="color:#fff;font-size:12px;font-weight:700">${v.placa}</span>
                        <span style="color:${v.ignicao ? '#22c55e' : '#ef4444'};font-size:10px;font-weight:700">${v.ignicao ? 'ON' : 'OFF'}</span>
                    </div>
                </div>`,
                iconSize: [160, 30],
                iconAnchor: [80, 15]
            });
            L.marker([v.lat, v.lng], { icon: carIcon, zIndexOffset: 3000 }).addTo(this._paradasLayer);
            bounds.push([v.lat, v.lng]);
        }

        // Paradas numeradas
        v.paradas_hoje.forEach((p, i) => {
            if (!p.lat || !p.lng) return;
            bounds.push([p.lat, p.lng]);

            const corP = p.duracao_min > 60 ? '#DC2626' : p.duracao_min > 30 ? '#EA580C' : '#F59E0B';
            const emAndamento = !p.fim;
            const tamanho = Math.min(22, 12 + Math.floor(p.duracao_min / 10));

            const icon = L.divIcon({
                className: '',
                html: `<div style="display:flex;flex-direction:column;align-items:center">
                    <div style="background:${corP};color:#fff;font-size:11px;font-weight:800;padding:3px 8px;border-radius:6px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;gap:4px">
                        <span style="background:rgba(255,255,255,0.3);width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px">${i+1}</span>
                        ${fmtTempo(p.duracao_min)}${emAndamento ? '...' : ''}
                    </div>
                    <div style="font-size:9px;color:${corP};font-weight:700;margin-top:1px">${fmtH(p.inicio)} - ${p.fim ? fmtH(p.fim) : 'agora'}</div>
                    <svg width="${tamanho}" height="${Math.round(tamanho*1.3)}" viewBox="0 0 30 40" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3))">
                        <path d="M15 38C15 38 28 22 28 14C28 6.82 22.18 1 15 1C7.82 1 2 6.82 2 14C2 22 15 38 15 38Z" fill="${corP}" stroke="#fff" stroke-width="2"/>
                        <text x="15" y="17" text-anchor="middle" fill="#fff" font-size="12" font-weight="800">${i+1}</text>
                    </svg>
                </div>`,
                iconSize: [140, 70],
                iconAnchor: [70, 70]
            });

            const marker = L.marker([p.lat, p.lng], { icon, zIndexOffset: 2000 + i });
            marker.bindPopup(`
                <div style="font-size:14px;font-weight:700;margin-bottom:4px">Parada ${i+1} — ${fmtTempo(p.duracao_min)}${emAndamento ? ' (em andamento)' : ''}</div>
                <div style="font-size:12px;color:#64748B">Veículo: <strong>${v.placa}</strong> ${v.modelo || ''}</div>
                <div style="font-size:12px;color:#64748B">Motorista: <strong>${v.motorista || v._tecnico || 'N/D'}</strong></div>
                <div style="font-size:12px;color:#64748B">Chegou: <strong>${fmtH(p.inicio)}</strong></div>
                ${p.fim ? `<div style="font-size:12px;color:#64748B">Saiu: <strong>${fmtH(p.fim)}</strong></div>` : '<div style="font-size:12px;color:#DC2626;font-weight:700">Ainda parado</div>'}
            `, { maxWidth: 280 });
            marker.addTo(this._paradasLayer);
        });

        // Conectar paradas com linha
        if (bounds.length > 1) {
            L.polyline(bounds, { color: '#3b82f6', weight: 2, opacity: 0.5, dashArray: '8, 6' }).addTo(this._paradasLayer);
        }

        // Zoom no mapa pra mostrar todas as paradas
        if (bounds.length > 0) {
            MapCore.map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
        }

        Utils.toast(`${v.paradas_hoje.length} paradas de ${v.placa} no mapa`, 'success');
    }
};
