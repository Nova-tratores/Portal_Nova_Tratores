// =========================================================
// MARKERS - Client pins and vehicle markers
// =========================================================

const Markers = {
    clientMarkers: [],
    vehicleMarkers: [],

    // Marcador fixo da Nova Tratores
    _lojaRendered: false,
    renderLoja() {
        if (this._lojaRendered) return;
        this._lojaRendered = true;
        const lojaIcon = L.divIcon({
            className: '',
            html: `<div style="width:60px;height:60px;border-radius:50%;background:#fff;border:3px solid #dc2626;box-shadow:0 4px 12px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;overflow:hidden">
                <img src="/Logo_Nova.png" style="width:50px;height:50px;object-fit:contain" alt="Nova Tratores"/>
            </div>`,
            iconSize: [60, 60],
            iconAnchor: [30, 30]
        });
        const marker = L.marker([-23.208410, -49.370770], { icon: lojaIcon, zIndexOffset: 9999 });
        marker.bindPopup('<div style="text-align:center;font-weight:700;font-size:14px">Nova Tratores</div><div style="text-align:center;font-size:11px;color:#666">Piraju - SP</div>');
        marker.addTo(MapCore.map);
    },

    // Detecta tecnicos (veiculos oficina) dentro da propriedade do cliente (raio 500m)
    // So mostra se o cliente NAO foi visitado recentemente (>30 dias ou nunca)
    _buildTecnicoProximoMap() {
        const veiculos = (App.state.veiculos || []).filter(v => v.lat && v.lng && this.isOficina(v.placa));
        const map = new Map(); // clienteId -> { tecnico, placa, distancia }
        for (const c of (App.state.clientes || [])) {
            if (!c.lat || !c.lng) continue;
            // Ignorar clientes visitados nos ultimos 30 dias
            if (c.ultima_visita && Utils.diasDesde(c.ultima_visita) <= 30) continue;
            for (const v of veiculos) {
                const dist = Utils.calcularDistancia(c.lat, c.lng, v.lat, v.lng);
                if (dist <= 0.5) {
                    const nome = v._tecnico || v.motorista || v.placa;
                    const existing = map.get(String(c.id));
                    if (!existing || dist < existing.distancia) {
                        map.set(String(c.id), { tecnico: nome, placa: v.placa, distancia: dist, vLat: v.lat, vLng: v.lng });
                    }
                }
            }
        }
        return map;
    },

    renderClients(clientes) {
        this.renderLoja();
        MapCore.clientesLayer.clearLayers();
        MapCore.clusterGroup.clearLayers();
        MapCore.tecnicoNoClienteLayer.clearLayers();
        this.clientMarkers = [];

        const clEl = document.getElementById('layer-clusters'); const useClusters = clEl ? clEl.checked : false;
        const heatPoints = [];
        const markers = [];

        // Detectar tecnicos proximos de clientes
        const tecnicoProximo = this._buildTecnicoProximoMap();

        // Group clients by position to detect overlaps
        const posMap = {};
        for (const c of clientes) {
            if (!c.lat || !c.lng) continue;
            const key = `${Number(c.lat).toFixed(5)}_${Number(c.lng).toFixed(5)}`;
            if (!posMap[key]) posMap[key] = [];
            posMap[key].push(c);
        }

        // Track which positions already have a marker
        const rendered = new Set();

        for (const c of clientes) {
            if (!c.lat || !c.lng) continue;

            const key = `${Number(c.lat).toFixed(5)}_${Number(c.lng).toFixed(5)}`;
            const group = posMap[key];
            const isStacked = group.length > 1;

            // For stacked clients, only render one marker for the group
            if (isStacked && rendered.has(key)) continue;
            rendered.add(key);

            // Tecnico proximo?
            const tp = tecnicoProximo.get(String(c.id));

            const color = c.equipamentos_count > 0 ? Utils.getVisitColor(c.ultima_visita) : 'gray';
            const size = isStacked ? 24 : Utils.getMarkerSize(c.equipamentos_count);

            const nomePin = Utils.truncate(c.nome || c.nome_fantasia || 'Cliente', 20);
            const pinColor = color === 'green' ? '#16a34a' : color === 'yellow' ? '#ca8a04' : color === 'red' ? '#dc2626' : '#6b7280';

            const icon = L.divIcon({
                className: '',
                html: isStacked
                    ? `<div style="display:flex;flex-direction:column;align-items:center">
                        <div style="background:#1E293B;color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.3);margin-bottom:2px">${group.length} clientes</div>
                        <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:5px solid #1E293B"></div>
                        <div style="width:12px;height:12px;border-radius:50%;background:#1E293B;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3);margin-top:-1px"></div>
                    </div>`
                    : `<div style="display:flex;flex-direction:column;align-items:center">
                        <div style="background:${pinColor};color:#fff;font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.25);max-width:140px;overflow:hidden;text-overflow:ellipsis;margin-bottom:2px">${nomePin}${c.feedbacks_count > 0 ? ' ⭐' : ''}</div>
                        <div style="width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:4px solid ${pinColor}"></div>
                        <div style="width:10px;height:10px;border-radius:50%;background:${pinColor};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.25);margin-top:-1px"></div>
                    </div>`,
                iconSize: [140, 36],
                iconAnchor: [70, 36]
            });

            const marker = L.marker([c.lat, c.lng], { icon, draggable: false });

            if (isStacked) {
                marker.bindTooltip(`${group.length} clientes`, { direction: 'top', offset: [0, -10], className: 'client-tooltip' });

                marker.on('click', function() {
                    if (!this.getPopup()) {
                        const items = group.map(d => `
                            <div style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
                                <div style="font-weight:600;font-size:12px;">${Utils.truncate(d.nome, 30)}</div>
                                <div style="font-size:11px;color:var(--text-secondary);">${d.cidade || ''} - ${d.estado || ''}</div>
                                <button class="popup-btn" style="margin-top:4px;padding:3px 10px;font-size:11px" onclick="Panels.open('${d.id}')">Detalhes</button>
                            </div>
                        `).join('');
                        this.bindPopup(`
                            <div class="popup-title" style="color:var(--accent-yellow)">${group.length} clientes na mesma posicao</div>
                            <div style="font-size:10px;color:var(--text-muted);margin-bottom:6px;font-family:monospace">${Number(group[0].lat).toFixed(6)}, ${Number(group[0].lng).toFixed(6)}</div>
                            <div style="max-height:200px;overflow-y:auto">${items}</div>
                        `, { maxWidth: 300 }).openPopup();
                    }
                });

                marker.clientData = c;
            } else {
                const nomeDisplay = c.nome || c.nome_fantasia || c.razao_social || 'Cliente';
                marker.bindTooltip(nomeDisplay, { direction: 'top', offset: [0, -10], className: 'client-tooltip' });

                // Popup com info basica + botao para painel completo
                marker.bindPopup(`
                    <div class="popup-title">${Utils.truncate(nomeDisplay, 35)}</div>
                    ${c.razao_social && c.razao_social !== nomeDisplay ? `<div class="popup-detail" style="font-size:11px;color:var(--text-muted)">${Utils.truncate(c.razao_social, 40)}</div>` : ''}
                    <div class="popup-detail">📍 ${c.cidade || 'Sem cidade'} ${c.estado ? '- ' + c.estado : ''}</div>
                    ${c.cnpj_cpf ? `<div class="popup-detail">📋 ${c.cnpj_cpf}</div>` : ''}
                    ${c.telefone ? `<div class="popup-detail">📞 ${c.telefone}</div>` : ''}
                    ${c.email ? `<div class="popup-detail">📧 ${c.email}</div>` : ''}
                    ${c.equipamentos_count > 0 ? `<div class="popup-detail">🔧 ${c.equipamentos_count} equipamentos</div>` : ''}
                    <button class="popup-btn" style="margin-top:8px;width:100%" onclick="Panels.open('${c.id}')">Ver detalhes / Editar coordenadas</button>
                `, { maxWidth: 280 });

                marker.clientData = c;
            }

            markers.push(marker);
            heatPoints.push([c.lat, c.lng, Math.max(1, c.equipamentos_count)]);

            // Circulo destacado: tecnico proximo deste cliente
            if (tp) {
                const primeiroNome = tp.tecnico.split(/\s+/)[0];
                const distLabel = tp.distancia < 1 ? `${Math.round(tp.distancia * 1000)}m` : `${tp.distancia.toFixed(1)}km`;
                const nomeCliente = Utils.truncate(c.nome || c.nome_fantasia || '', 25);

                // Circulo pulsante ao redor do cliente (interactive:false para nao roubar cliques)
                const circle = L.circle([c.lat, c.lng], {
                    radius: 500,
                    color: '#22c55e',
                    weight: 3,
                    opacity: 0.8,
                    fillColor: '#22c55e',
                    fillOpacity: 0.12,
                    dashArray: '8, 6',
                    interactive: false,
                    className: 'tecnico-proximo-circle'
                });

                // Badge flutuante com nome do tecnico
                const badgeIcon = L.divIcon({
                    className: '',
                    html: `<div style="
                        background: linear-gradient(135deg, #16a34a, #22c55e);
                        color: white;
                        padding: 6px 12px;
                        border-radius: 20px;
                        font-size: 12px;
                        font-weight: 700;
                        white-space: nowrap;
                        box-shadow: 0 4px 12px rgba(34,197,94,0.5), 0 0 0 3px rgba(34,197,94,0.2);
                        border: 2px solid rgba(255,255,255,0.9);
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        animation: tecnicoPulse 2s ease-in-out infinite;
                    ">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        ${primeiroNome} - ${distLabel}
                    </div>`,
                    iconSize: [0, 0],
                    iconAnchor: [-15, 40]
                });
                const badge = L.marker([c.lat, c.lng], { icon: badgeIcon, interactive: false, zIndexOffset: 2000 });

                badge.bindTooltip(`${tp.tecnico} (${tp.placa}) a ${distLabel} de ${nomeCliente}`, { direction: 'top', offset: [60, -10], className: 'client-tooltip' });

                MapCore.tecnicoNoClienteLayer.addLayer(circle);
                MapCore.tecnicoNoClienteLayer.addLayer(badge);
            }
        }

        this.clientMarkers = markers;

        // Adicionar todos de uma vez (batch)
        if (useClusters) {
            MapCore.clusterGroup.addLayers(markers);
            MapCore.map.addLayer(MapCore.clusterGroup);
        } else {
            markers.forEach(m => MapCore.clientesLayer.addLayer(m));
        }

        MapCore.setHeatData(heatPoints);

        // Re-apply edit mode if active
        if (App.state.mapEditMode) {
            this.enableDragging();
        }
    },

    // Placas dos veiculos da oficina (tecnicos)
    OFICINA_PLACAS: ['TKY6E68', 'FXM4G90', 'TKC5D99', 'FHY8D25', 'ATJ6211', 'DLZ1967'],

    isOficina(placa) {
        return this.OFICINA_PLACAS.includes((placa || '').replace(/[^A-Z0-9]/g, '').toUpperCase());
    },

    // Encontra o cliente mais proximo do veiculo (dentro de 500m)
    _findNearestClient(lat, lng) {
        let melhor = null, melhorDist = Infinity;
        for (const c of (App.state.clientes || [])) {
            if (!c.lat || !c.lng) continue;
            const d = Utils.calcularDistancia(lat, lng, c.lat, c.lng);
            if (d < 0.5 && d < melhorDist) { melhor = c; melhorDist = d; }
        }
        return melhor;
    },

    renderVehicles(veiculos) {
        MapCore.veiculosLayer.clearLayers();
        MapCore.veiculosOficinaLayer.clearLayers();
        MapCore.veiculosComercialLayer.clearLayers();
        this.vehicleMarkers = [];

        // Agrupar por tecnico para evitar duplicatas na oficina
        const tecnicosNaLoja = {};

        for (const v of veiculos) {
            if (!v.lat || !v.lng) continue;

            const on = v.ignicao;
            const tecnico = v._tecnico || v.motorista || '';
            const nome = Utils.truncate(tecnico || 'N/D', 22);
            const oficina = this.isOficina(v.placa);
            const tipo = oficina ? 'oficina' : 'comercial';
            const semGPS = v._semGPS;

            // Detectar se esta parado em cliente (ignicao off, fora da loja)
            const naLoja = Utils.calcularDistancia(v.lat, v.lng, -23.208410, -49.370770) < 0.8;
            const paradoCliente = !on && !naLoja && oficina && !semGPS;
            const clienteProximo = paradoCliente ? this._findNearestClient(v.lat, v.lng) : null;

            // Tecnicos na loja: agrupar para nao sobrepor
            if ((naLoja && !on) || semGPS) {
                const nKey = (tecnico || v.placa).toLowerCase();
                if (tecnicosNaLoja[nKey]) continue; // ja tem marker desse tecnico na loja
                tecnicosNaLoja[nKey] = true;
            }

            const iconUrl = Utils.getVehicleIconUrl(v.modelo);
            const primeiroNome = tecnico ? tecnico.split(/\s+/)[0] : '';
            let markerHtml;

            if (paradoCliente) {
                // Marker: tecnico parado no cliente
                const nomeCliente = clienteProximo ? Utils.truncate(clienteProximo.nome || clienteProximo.nome_fantasia || '', 28) : 'Cliente';
                markerHtml = `
                    <div class="vehicle-marker-wrap vehicle-at-client" title="${nome} parado em ${nomeCliente}">
                        <div class="vehicle-marker-icon off ${tipo}" style="position:relative">
                            <img src="${iconUrl}" alt="" class="vehicle-marker-svg"/>
                            <div style="position:absolute;bottom:-3px;right:-3px;width:10px;height:10px;background:#f59e0b;border-radius:50%;border:2px solid rgba(15,23,42,0.9)"></div>
                        </div>
                        <div class="vehicle-marker-text">
                            <div style="font-size:13px;font-weight:800;color:#f59e0b;line-height:1.2;text-shadow:0 1px 3px rgba(0,0,0,0.9)">${primeiroNome || nome}</div>
                            <div style="font-size:10px;color:rgba(255,255,255,0.9);font-weight:600;line-height:1.2;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${nomeCliente}</div>
                            <div style="font-size:9px;color:rgba(255,255,255,0.4)">${v.placa}</div>
                        </div>
                    </div>
                `;
            } else if (semGPS || (naLoja && !on)) {
                // Marker: tecnico na oficina (com ou sem GPS)
                const label = semGPS ? 'na oficina (sem carro)' : 'na oficina';
                markerHtml = `
                    <div class="vehicle-marker-wrap vehicle-at-loja" title="${nome} - ${label}">
                        <div style="width:28px;height:28px;border-radius:50%;background:rgba(100,116,139,0.5);display:flex;align-items:center;justify-content:center;border:2px solid rgba(100,116,139,0.3)">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        </div>
                        <div class="vehicle-marker-text" style="opacity:0.6">
                            <div style="font-size:12px;font-weight:700;color:rgba(255,255,255,0.7)">${primeiroNome || nome}</div>
                            <div class="vehicle-marker-sub">${semGPS ? 'oficina' : v.placa}</div>
                        </div>
                    </div>
                `;
            } else if (on && oficina) {
                // Marker: tecnico em movimento (veiculo oficina)
                markerHtml = `
                    <div class="vehicle-marker-wrap" title="${nome} em movimento - ${v.placa}">
                        <div class="vehicle-marker-icon on ${tipo}">
                            <img src="${iconUrl}" alt="" class="vehicle-marker-svg"/>
                        </div>
                        <div class="vehicle-marker-text">
                            <div style="font-size:13px;font-weight:800;color:#22c55e;text-shadow:0 1px 2px rgba(0,0,0,0.7)">${primeiroNome || nome}</div>
                            <div class="vehicle-marker-sub">${v.placa} · em movimento</div>
                        </div>
                    </div>
                `;
            } else {
                // Marker: veiculo comercial ou sem tecnico
                markerHtml = `
                    <div class="vehicle-marker-wrap" title="${v.placa} - ${nome}">
                        <div class="vehicle-marker-icon ${on ? 'on' : 'off'} ${tipo}">
                            <img src="${iconUrl}" alt="" class="vehicle-marker-svg"/>
                        </div>
                        <div class="vehicle-marker-text">
                            <div style="font-size:12px;font-weight:700;color:white;text-shadow:0 1px 2px rgba(0,0,0,0.7)">${nome}</div>
                            <div class="vehicle-marker-sub">${v.placa}${on ? ' · em movimento' : ''}</div>
                        </div>
                    </div>
                `;
            }

            const icon = L.divIcon({
                className: '',
                html: markerHtml,
                iconSize: [190, 44],
                iconAnchor: [20, 22]
            });

            const marker = L.marker([v.lat, v.lng], { icon, zIndexOffset: paradoCliente ? 1000 : (on ? 500 : 0) });
            marker.bindTooltip(`${nome}${v.placa ? ' · ' + v.placa : ''}${clienteProximo ? ' · ' + clienteProximo.nome : ''}`, { direction: 'top', offset: [0, -14], className: 'client-tooltip' });
            if (!semGPS) {
                marker.on('click', function() {
                    App.selectVehicle(this.vehicleData.placa);
                });
            }
            marker.vehicleData = v;
            this.vehicleMarkers.push(marker);

            // Add to the appropriate layer
            if (oficina) {
                MapCore.veiculosOficinaLayer.addLayer(marker);
            } else {
                MapCore.veiculosComercialLayer.addLayer(marker);
            }
        }
    },

    renderParadas(veiculos) {
        MapCore.paradasLayer.clearLayers();

        for (const v of veiculos) {
            if (!v.paradas_hoje || !Array.isArray(v.paradas_hoje)) continue;

            for (const parada of v.paradas_hoje) {
                if (!parada.lat || !parada.lng) continue;

                const durMin = parada.duracao_min || 0;
                const emAndamento = !parada.fim;
                const corParada = durMin > 60 ? '#DC2626' : durMin > 30 ? '#EA580C' : '#F59E0B';
                const tamanho = Math.min(18, 10 + Math.floor(durMin / 15));

                // Formatar tempo
                const horas = Math.floor(durMin / 60);
                const mins = durMin % 60;
                const tempoLabel = horas > 0 ? `${horas}h${mins > 0 ? mins + 'min' : ''}` : `${mins}min`;

                // Marcador com balão de tempo sempre visível
                const icon = L.divIcon({
                    className: '',
                    html: `<div style="position:relative;display:flex;align-items:center;justify-content:center">
                        <div style="width:${tamanho * 2}px;height:${tamanho * 2}px;border-radius:50%;background:${corParada};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);opacity:0.9;${emAndamento ? 'animation:pulse-parada 1.5s infinite' : ''}"></div>
                        <div style="position:absolute;top:${-14}px;left:50%;transform:translateX(-50%);background:${corParada};color:#fff;font-size:10px;font-weight:800;padding:2px 6px;border-radius:4px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.2)">${tempoLabel}${emAndamento ? '...' : ''}</div>
                    </div>`,
                    iconSize: [tamanho * 2, tamanho * 2 + 14],
                    iconAnchor: [tamanho, tamanho],
                });

                const stopM = L.marker([parada.lat, parada.lng], { icon });
                stopM.bindPopup(`
                    <div class="popup-title" style="font-size:14px;font-weight:700">⏸️ Parada — ${tempoLabel}${emAndamento ? ' (em andamento)' : ''}</div>
                    <div class="popup-detail" style="font-size:12px;margin-top:4px">🚗 <strong>${v.placa}</strong> ${v.modelo || ''} ${v.motorista ? '(' + v.motorista + ')' : ''}</div>
                    <div class="popup-detail" style="font-size:12px">Chegou: <strong>${Utils.formatTime(parada.inicio)}</strong></div>
                    ${parada.fim ? `<div class="popup-detail" style="font-size:12px">Saiu: <strong>${Utils.formatTime(parada.fim)}</strong></div>` : '<div class="popup-detail" style="font-size:12px;color:#DC2626;font-weight:700">Ainda parado</div>'}
                    ${parada.endereco ? `<div class="popup-detail" style="font-size:12px;margin-top:4px">📍 ${parada.endereco}</div>` : ''}
                `, { maxWidth: 280 });
                stopM.on('contextmenu', (e) => {
                    e.originalEvent.preventDefault();
                    e.originalEvent.stopPropagation();
                    MapCore._showContextMenu(e.originalEvent, e.latlng);
                });
                MapCore.paradasLayer.addLayer(stopM);
            }
        }
    },

    renderOportunidades(oportunidades) {
        MapCore.oportunidadesLayer.clearLayers();

        for (const c of oportunidades) {
            if (!c.lat || !c.lng) continue;

            const icon = L.divIcon({
                className: '',
                html: `<div class="marker-client pulse" style="width:22px;height:22px;background:linear-gradient(135deg, #8b5cf6, #f59e0b);"></div>`,
                iconSize: [22, 22],
                iconAnchor: [11, 11]
            });

            const marker = L.marker([c.lat, c.lng], { icon });
            marker.bindPopup(`
                <div class="popup-title">⭐ ${Utils.truncate(c.nome, 30)}</div>
                <div class="popup-detail">Score: ${c.score_oportunidade} pts</div>
                <div class="popup-detail">🔧 ${c.equipamentos_count} equipamentos</div>
                <div class="popup-detail">📍 ${c.cidade} - ${c.estado}</div>
                <button class="popup-btn" onclick="Panels.open('${c.id}')">Ver detalhes</button>
            `, { maxWidth: 260 });
            MapCore.oportunidadesLayer.addLayer(marker);
        }
    },

    enableDragging() {
        // Remove markers from cluster and add directly to map for dragging
        const clEl = document.getElementById('layer-clusters'); const useClusters = clEl ? clEl.checked : false;
        if (useClusters) {
            MapCore.clusterGroup.clearLayers();
        }

        for (const marker of this.clientMarkers) {
            if (!marker.clientData) continue;

            // Ensure marker is on the map directly (not in cluster)
            if (!MapCore.map.hasLayer(marker)) {
                marker.addTo(MapCore.map);
            }

            marker.options.draggable = true;
            if (marker.dragging) {
                marker.dragging.enable();
            }
            marker.on('dragend', this._onClientDragEnd);

            // Visual feedback - add edit border
            const el = marker.getElement();
            if (el) {
                const dot = el.querySelector('.marker-client');
                if (dot) dot.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.6), 0 2px 6px rgba(0,0,0,0.4)';
            }
        }
    },

    disableDragging() {
        const clEl = document.getElementById('layer-clusters'); const useClusters = clEl ? clEl.checked : false;

        for (const marker of this.clientMarkers) {
            if (!marker.clientData) continue;

            marker.options.draggable = false;
            if (marker.dragging) {
                marker.dragging.disable();
            }
            marker.off('dragend', this._onClientDragEnd);

            // Remove edit border
            const el = marker.getElement();
            if (el) {
                const dot = el.querySelector('.marker-client');
                if (dot) dot.style.boxShadow = '0 2px 6px rgba(0,0,0,0.4)';
            }

            // Remove from map if we'll re-add to cluster
            if (useClusters) {
                MapCore.map.removeLayer(marker);
            }
        }

        // Re-add to cluster group if needed
        if (useClusters) {
            MapCore.clusterGroup.addLayers(this.clientMarkers);
            if (!MapCore.map.hasLayer(MapCore.clusterGroup)) {
                MapCore.map.addLayer(MapCore.clusterGroup);
            }
        }
    },

    async _onClientDragEnd(e) {
        const marker = e.target;
        const data = marker.clientData;
        if (!data) return;

        let pos = marker.getLatLng();

        // Snap to nearest vehicle if within 200m
        const veiculos = (App.state.veiculos || []).filter(v => v.lat && v.lng);
        for (const v of veiculos) {
            const dist = Utils.calcularDistancia(pos.lat, pos.lng, v.lat, v.lng);
            if (dist < 0.2) {
                pos = { lat: v.lat, lng: v.lng };
                marker.setLatLng([v.lat, v.lng]);
                Utils.toast(`Posicao ajustada para o veiculo ${v.placa}`, 'info');
                break;
            }
        }

        try {
            const resp = await _originalFetch('/api/mapa/clientes', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: data.id, lat: pos.lat, lng: pos.lng })
            });
            if (!resp.ok) throw new Error('Erro ao salvar');

            // Update local state
            data.lat = pos.lat;
            data.lng = pos.lng;
            const stateClient = App.state.clientes.find(c => c.id === data.id);
            if (stateClient) {
                stateClient.lat = pos.lat;
                stateClient.lng = pos.lng;
            }
            Utils.toast(`${Utils.truncate(data.nome, 25)} reposicionado!`, 'success');
        } catch (err) {
            Utils.toast('Erro ao salvar posicao: ' + err.message, 'error');
            // Revert position
            marker.setLatLng([data.lat, data.lng]);
        }
    },

    filterNearVehicles(clientes, veiculos) {
        const veiculosGeo = (veiculos || []).filter(v => v.lat && v.lng);
        if (veiculosGeo.length === 0) return clientes;
        return clientes.filter(c => {
            if (!c.lat || !c.lng) return false;
            return veiculosGeo.some(v => Utils.calcularDistancia(c.lat, c.lng, v.lat, v.lng) < 5);
        });
    },

    filterClients(clientes) {
        const cidade = document.getElementById('filter-cidade').value;
        const visita = document.getElementById('filter-visita').value;
        const tipoEquip = document.getElementById('filter-equipamento')?.value || '';

        // Default: show only nearby clients. If "Mostrar todos" is checked, show all.
        const todosChk = document.getElementById('layer-clientes-todos');
        const mostrarTodos = todosChk ? todosChk.checked : false;
        let filtered = mostrarTodos ? [...clientes] : this.filterNearVehicles(clientes, App.state.veiculos);

        if (cidade) {
            filtered = filtered.filter(c => c.cidade === cidade);
        }

        if (visita === 'recente') filtered = filtered.filter(c => Utils.diasDesde(c.ultima_visita) <= 30);
        else if (visita === 'moderado') filtered = filtered.filter(c => { const d = Utils.diasDesde(c.ultima_visita); return d > 30 && d <= 90; });
        else if (visita === 'inativo') filtered = filtered.filter(c => Utils.diasDesde(c.ultima_visita) > 90 && c.ultima_visita);
        else if (visita === 'nunca') filtered = filtered.filter(c => !c.ultima_visita);

        if (tipoEquip === 'TRATOR') {
            filtered = filtered.filter(c => (c.tipos_equipamento || []).includes('TRATOR'));
        } else if (tipoEquip === 'IMPLEMENTO') {
            filtered = filtered.filter(c => (c.tipos_equipamento || []).includes('IMPLEMENTO'));
        } else if (tipoEquip === 'PECA') {
            filtered = filtered.filter(c => (c.tipos_equipamento || []).includes('PECA'));
        } else if (tipoEquip === 'TRATOR_ONLY') {
            filtered = filtered.filter(c => {
                const t = c.tipos_equipamento || [];
                return t.includes('TRATOR') && !t.includes('IMPLEMENTO');
            });
        } else if (tipoEquip === 'IMPLEMENTO_ONLY') {
            filtered = filtered.filter(c => {
                const t = c.tipos_equipamento || [];
                return t.includes('IMPLEMENTO') && !t.includes('TRATOR');
            });
        }

        return filtered;
    },

    showOnlyVehicle(placa) {
        for (const marker of this.vehicleMarkers) {
            if (!marker.vehicleData) continue;
            const el = marker.getElement();
            if (!el) continue;
            if (marker.vehicleData.placa === placa) {
                el.style.opacity = '1';
                el.style.pointerEvents = 'auto';
            } else {
                el.style.opacity = '0';
                el.style.pointerEvents = 'none';
            }
        }
    },

    showAllVehicles() {
        for (const marker of this.vehicleMarkers) {
            const el = marker.getElement();
            if (!el) continue;
            el.style.opacity = '1';
            el.style.pointerEvents = 'auto';
        }
    }
};
