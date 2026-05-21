// =========================================================
// MARKERS - Client pins and vehicle markers
// =========================================================

const Markers = {
    clientMarkers: [],
    vehicleMarkers: [],

    renderClients(clientes) {
        MapCore.clientesLayer.clearLayers();
        MapCore.clusterGroup.clearLayers();
        this.clientMarkers = [];

        const clEl = document.getElementById('layer-clusters'); const useClusters = clEl ? clEl.checked : false;
        const heatPoints = [];
        const markers = [];

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

            const color = c.equipamentos_count > 0 ? Utils.getVisitColor(c.ultima_visita) : 'gray';
            const size = isStacked ? 24 : Utils.getMarkerSize(c.equipamentos_count);

            const icon = L.divIcon({
                className: '',
                html: isStacked
                    ? `<div class="marker-client stacked" style="width:${size}px;height:${size}px;" title="${group.length} clientes nesta posicao">
                        <span class="marker-stack-count">${group.length}</span>
                    </div>`
                    : `<div class="marker-client ${color}" style="width:${size}px;height:${size}px;" title="${c.nome}">
                        ${c.feedbacks_count > 0 ? '<div style="position:absolute;top:-4px;right:-4px;width:8px;height:8px;background:#f59e0b;border-radius:50%;border:1px solid white;"></div>' : ''}
                    </div>`,
                iconSize: [size, size],
                iconAnchor: [size / 2, size / 2]
            });

            const marker = L.marker([c.lat, c.lng], { icon, draggable: false });

            if (isStacked) {
                // Tooltip shows count
                marker.bindTooltip(`${group.length} clientes`, { direction: 'top', offset: [0, -10], className: 'client-tooltip' });

                // Popup lists all clients at this position
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

                // Store first client data for dragging
                marker.clientData = c;
            } else {
                marker.bindTooltip(c.nome || c.nome_fantasia || '', { direction: 'top', offset: [0, -10], className: 'client-tooltip' });

                marker.on('click', function() {
                    const d = this.clientData;
                    if (d && d.id) Panels.open(d.id);
                });

                marker.clientData = c;
            }

            markers.push(marker);
            heatPoints.push([c.lat, c.lng, Math.max(1, c.equipamentos_count)]);
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

        for (const v of veiculos) {
            if (!v.lat || !v.lng) continue;

            const on = v.ignicao;
            const motorista = Utils.truncate((v.motorista || 'N/D'), 22);
            const oficina = this.isOficina(v.placa);
            const tipo = oficina ? 'oficina' : 'comercial';

            // Detectar se esta parado em cliente (ignicao off, fora da loja)
            const naLoja = Utils.calcularDistancia(v.lat, v.lng, -23.208410, -49.370770) < 0.8;
            const paradoCliente = !on && !naLoja && oficina;
            const clienteProximo = paradoCliente ? this._findNearestClient(v.lat, v.lng) : null;

            const iconUrl = Utils.getVehicleIconUrl(v.modelo);
            let markerHtml;

            if (paradoCliente) {
                // Marker especial: parado no cliente - destaque com nome do cliente
                const nomeCliente = clienteProximo ? Utils.truncate(clienteProximo.nome || clienteProximo.nome_fantasia || '', 28) : 'Cliente';
                markerHtml = `
                    <div class="vehicle-marker-wrap vehicle-at-client" title="${motorista} parado em ${nomeCliente}">
                        <div class="vehicle-marker-icon off ${tipo}" style="position:relative">
                            <img src="${iconUrl}" alt="" class="vehicle-marker-svg"/>
                            <div style="position:absolute;bottom:-3px;right:-3px;width:10px;height:10px;background:#f59e0b;border-radius:50%;border:2px solid rgba(15,23,42,0.9)"></div>
                        </div>
                        <div class="vehicle-marker-text">
                            <div style="font-size:12px;font-weight:700;color:#f59e0b;line-height:1.2;text-shadow:0 1px 3px rgba(0,0,0,0.9)">${motorista}</div>
                            <div style="font-size:10px;color:rgba(255,255,255,0.9);font-weight:600;line-height:1.2;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${nomeCliente}</div>
                            <div style="font-size:9px;color:rgba(255,255,255,0.5)">${v.placa}</div>
                        </div>
                    </div>
                `;
            } else if (!on && naLoja) {
                // Na loja, parado - marker discreto
                markerHtml = `
                    <div class="vehicle-marker-wrap vehicle-at-loja" title="${v.placa} - ${motorista} (na loja)">
                        <div class="vehicle-marker-icon off ${tipo}" style="opacity:0.6">
                            <img src="${iconUrl}" alt="" class="vehicle-marker-svg"/>
                        </div>
                        <div class="vehicle-marker-text" style="opacity:0.6">
                            <div class="vehicle-marker-placa">${v.placa}</div>
                            <div class="vehicle-marker-sub">${motorista}</div>
                        </div>
                    </div>
                `;
            } else {
                // Em movimento ou comercial
                markerHtml = `
                    <div class="vehicle-marker-wrap" title="${v.placa} - ${motorista}">
                        <div class="vehicle-marker-icon ${on ? 'on' : 'off'} ${tipo}">
                            <img src="${iconUrl}" alt="" class="vehicle-marker-svg"/>
                        </div>
                        <div class="vehicle-marker-text">
                            <div style="font-size:12px;font-weight:700;color:white;text-shadow:0 1px 2px rgba(0,0,0,0.7)">${motorista}</div>
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
            marker.bindTooltip(`${motorista} · ${v.placa}${clienteProximo ? ` · ${clienteProximo.nome}` : ''}`, { direction: 'top', offset: [0, -14], className: 'client-tooltip' });
            marker.on('click', function() {
                App.selectVehicle(this.vehicleData.placa);
            });
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
                const stopM = L.circleMarker([parada.lat, parada.lng], {
                    radius: 8, fillColor: '#f59e0b', color: 'white', weight: 2,
                    fillOpacity: 0.9
                });
                stopM.bindPopup(`
                    <div class="popup-title">⏸️ Parada ${parada.duracao_min} min</div>
                    <div class="popup-detail">🚗 ${v.placa} (${v.motorista || 'N/D'})</div>
                    <div class="popup-detail">Chegada: ${Utils.formatTime(parada.inicio)}</div>
                    <div class="popup-detail">Saida: ${Utils.formatTime(parada.fim)}</div>
                    ${parada.endereco ? `<div class="popup-detail">📍 ${parada.endereco}</div>` : ''}
                `, { maxWidth: 260 });
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
            const resp = await fetch(`/api/clientes/${data.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lat: pos.lat, lng: pos.lng })
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
