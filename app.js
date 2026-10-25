/**
 * BOMBEROS DE LA FLORIDA - GEOSOCIOS
 * Plataforma Territorial de Mapeo y Gestión de Socios Cooperadores
 */

(function () {
  'use strict';

  // ================= CONFIG & STATE =================
  const CONFIG = {
    initialCenter: [-33.5450, -70.5735], // Zona activa campaña 10ª Cía: Trípoli, Golán, Los Canales, La Realeza
    initialZoom: 15,
    minZoom: 11,
    maxZoom: 19,
    storageKey: 'bomberos_decima_cbn_v4',
    cachePrefix: 'geo_cache_la_florida_',
    campaignTarget: 50, // Meta de socios campaña actual
    sheetsUrl: 'https://docs.google.com/spreadsheets/d/14oLL6bsJLAw1evjAH6HDXe8gocrDvXdz/gviz/tq?tqx=out:csv&gid=132653492'
  };

  const state = {
    records: [],
    filteredRecords: [],
    sectors: window.LA_FLORIDA_SECTORS || [],
    stations: window.BOMBEROS_STATIONS || [],
    map: null,
    clusterGroup: null,
    heatLayer: null,
    sectorsGroup: null,
    stationsGroup: null,
    userLocationMarker: null,
    activeBasemap: 'streets',
    tileLayers: {},
    visibleLayers: {
      clusters: true,
      heatmap: false,
      sectors: false,
      stations: true
    },
    filters: {
      search: '',
      status: 'all',
      sector: 'all',
      squad: 'all'
    },
    isGeocoding: false
  };

  // ================= DOM ELEMENTS =================
  const DOM = {
    map: document.getElementById('map'),
    appSidebar: document.getElementById('appSidebar'),
    btnToggleSidebar: document.getElementById('btnToggleSidebar'),
    sidebarIcon: document.getElementById('sidebarIcon'),

    // KPIs
    kpiTotalCaptados: document.getElementById('kpiTotalCaptados'),
    kpiTotalRecaudado: document.getElementById('kpiTotalRecaudado'),
    kpiTotalRepasar: document.getElementById('kpiTotalRepasar'),
    kpiEfectividad: document.getElementById('kpiEfectividad'),
    kpiAvgDonation: document.getElementById('kpiAvgDonation'),
    kpiTargetCurrent: document.getElementById('kpiTargetCurrent'),
    kpiTargetPercent: document.getElementById('kpiTargetPercent'),
    campaignProgressFill: document.getElementById('campaignProgressFill'),

    // Filters
    filterSearch: document.getElementById('filterSearch'),
    statusFilterPills: document.getElementById('statusFilterPills'),
    filterSector: document.getElementById('filterSector'),
    filterSquad: document.getElementById('filterSquad'),
    btnResetFilters: document.getElementById('btnResetFilters'),

    // Lists
    sectorsCoverageList: document.getElementById('sectorsCoverageList'),
    countBarriosCubiertos: document.getElementById('countBarriosCubiertos'),
    recentVisitsList: document.getElementById('recentVisitsList'),
    countRecentShown: document.getElementById('countRecentShown'),

    // Map Controls
    baseMapSelector: document.getElementById('baseMapSelector'),
    btnToggleClusters: document.getElementById('btnToggleClusters'),
    btnToggleHeatmap: document.getElementById('btnToggleHeatmap'),
    btnToggleSectors: document.getElementById('btnToggleSectors'),
    btnToggleStations: document.getElementById('btnToggleStations'),
    btnLocateUser: document.getElementById('btnLocateUser'),
    btnCenterFlorida: document.getElementById('btnCenterFlorida'),
    btnExportData: document.getElementById('btnExportData'),

    // Geocoding Banner
    geocodingBanner: document.getElementById('geocodingBanner'),
    geoMissingCount: document.getElementById('geoMissingCount'),
    btnAutoGeocode: document.getElementById('btnAutoGeocode'),

    // Modals
    modalSyncSheets: document.getElementById('modalSyncSheets'),
    modalNewRecord: document.getElementById('modalNewRecord'),
    modalHelp: document.getElementById('modalHelp'),
    btnSyncSheets: document.getElementById('btnSyncSheets'),
    btnUploadCsv: document.getElementById('btnUploadCsv'),
    btnNewRecord: document.getElementById('btnNewRecord'),
    btnHelp: document.getElementById('btnHelp'),
    fileCsvInput: document.getElementById('fileCsvInput'),
    inputSheetsUrl: document.getElementById('inputSheetsUrl'),
    btnLoadSheetsUrl: document.getElementById('btnLoadSheetsUrl'),
    btnCopyScript: document.getElementById('btnCopyScript'),
    scriptContent: document.getElementById('scriptContent'),

    // Form New Record
    formNewRecord: document.getElementById('formNewRecord'),
    btnGpsForForm: document.getElementById('btnGpsForForm'),
    gpsStatusHint: document.getElementById('gpsStatusHint'),
    newLat: document.getElementById('newLat'),
    newLng: document.getElementById('newLng'),

    toastContainer: document.getElementById('toastContainer')
  };

  // ================= INITIALIZATION =================
  function init() {
    initData();
    initMap();
    populateSectorOptions();
    bindEvents();
    renderAll();
    refreshIcons();

    // Sincronización automática silenciosa al abrir la plataforma
    setTimeout(() => {
      autoSyncGoogleSheets(false);
    }, 1200);
  }

  // Cargar datos (guardados previamente o muestra)
  function initData() {
    const saved = localStorage.getItem(CONFIG.storageKey);
    if (saved) {
      try {
        state.records = JSON.parse(saved);
      } catch (e) {
        state.records = window.SAMPLE_DATA ? [...window.SAMPLE_DATA] : [];
      }
    } else {
      state.records = window.SAMPLE_DATA ? [...window.SAMPLE_DATA] : [];
      saveRecords();
    }

    // Auto-asignar sector a los que no tengan
    state.records.forEach(r => {
      if (!r.sector && r.lat && r.lng) {
        r.sector = findSectorForCoordinate(r.lat, r.lng);
      }
    });

    populateSquadOptions();
  }

  function saveRecords() {
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(state.records));
  }

  // ================= MAP INITIALIZATION =================
  function initMap() {
    state.map = L.map('map', {
      center: CONFIG.initialCenter,
      zoom: CONFIG.initialZoom,
      minZoom: CONFIG.minZoom,
      maxZoom: CONFIG.maxZoom,
      zoomControl: false
    });

    // Zoom control en la esquina superior izquierda
    L.control.zoom({ position: 'topleft' }).addTo(state.map);

    // Definición de capas base (Tiles de alta disponibilidad sin bloqueo 403)
    // 1. Calles Oficiales Nítidas (Esri World Street Map - 100% visible, sin bloqueos)
    state.tileLayers.streets = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri &bull; 10ª Compañía CBÑ',
      maxZoom: 19
    });

    // 2. Satélite Aéreo con nombres de calles (Esri Imagery + Calles)
    state.tileLayers.satellite = L.layerGroup([
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri',
        maxZoom: 19
      }),
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19
      })
    ]);

    // 3. Nocturno Táctico (Esri con filtro oscuro elegante, sin bloqueos)
    state.tileLayers.dark = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri &bull; 10ª Compañía CBÑ',
      className: 'dark-tactical-tiles',
      maxZoom: 19
    });

    // Activar capa de calles reales por defecto
    state.tileLayers.streets.addTo(state.map);

    // Inicializar Grupos de Capas
    state.clusterGroup = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 45,
      spiderfyOnMaxZoom: true,
      iconCreateFunction: function (cluster) {
        const count = cluster.getChildCount();
        return L.divIcon({
          html: `<div><span>${count}</span></div>`,
          className: 'marker-cluster marker-cluster-medium',
          iconSize: L.point(40, 40)
        });
      }
    });
    state.map.addLayer(state.clusterGroup);

    state.sectorsGroup = L.featureGroup();
    state.stationsGroup = L.featureGroup().addTo(state.map);

    // Dibujar sectores y cuarteles
    renderSectorsPolygons();
    renderFireStations();
  }

  // ================= CAPAS Y POLÍGONOS =================
  function renderSectorsPolygons() {
    state.sectorsGroup.clearLayers();

    state.sectors.forEach(sec => {
      const polygon = L.polygon(sec.bounds, {
        color: sec.color,
        weight: 1.5,
        fillColor: sec.color,
        fillOpacity: 0.08,
        dashArray: '4, 6'
      });

      polygon.bindTooltip(`
        <div style="font-weight: 700; color: ${sec.color};">Cuadrante: ${sec.name}</div>
        <div style="font-size: 0.72rem; color: #94a3b8;">${sec.description}</div>
      `, { sticky: true, opacity: 0.95 });

      polygon.on('click', () => {
        DOM.filterSector.value = sec.name;
        state.filters.sector = sec.name;
        applyFilters();
      });

      state.sectorsGroup.addLayer(polygon);
    });
  }

  function renderFireStations() {
    state.stationsGroup.clearLayers();

    state.stations.forEach(st => {
      const icon = L.divIcon({
        className: 'custom-station-icon',
        html: `
          <div class="custom-fire-marker marker-cuartel" title="${st.name}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const marker = L.marker([st.lat, st.lng], { icon: icon });
      marker.bindPopup(`
        <div class="popup-card">
          <div class="popup-header" style="background: linear-gradient(135deg, rgba(59, 130, 246, 0.3) 0%, rgba(15, 23, 42, 0.9) 100%);">
            <div>
              <span class="badge-pill" style="background: rgba(59, 130, 246, 0.2); border-color: rgba(59, 130, 246, 0.4); color: #93c5fd;">
                Cuartel Oficial
              </span>
              <div class="popup-title" style="margin-top: 4px;">${st.name}</div>
            </div>
          </div>
          <div class="popup-body">
            <div class="popup-row">
              <span>Ubicación:</span>
              <strong>${st.address}</strong>
            </div>
          </div>
        </div>
      `);

      state.stationsGroup.addLayer(marker);
    });
  }

  // ================= FILTRADO Y RENDERIZADO =================
  function applyFilters() {
    const sTerm = state.filters.search.toLowerCase().trim();

    state.filteredRecords = state.records.filter(r => {
      // Filtro de estado
      if (state.filters.status !== 'all' && r.estado !== state.filters.status) {
        return false;
      }

      // Filtro de sector
      if (state.filters.sector !== 'all' && r.sector !== state.filters.sector) {
        return false;
      }

      // Filtro de voluntario / escuadra
      if (state.filters.squad !== 'all' && r.voluntario !== state.filters.squad) {
        return false;
      }

      // Búsqueda de texto libre (calle, nombre, notas, sector)
      if (sTerm) {
        const text = `${r.nombre || ''} ${r.direccion || ''} ${r.sector || ''} ${r.voluntario || ''} ${r.notas || ''}`.toLowerCase();
        if (!text.includes(sTerm)) {
          return false;
        }
      }

      return true;
    });

    renderMapMarkers();
    renderHeatmap();
    renderStats();
    renderSectorCoverage();
    renderRecentList();
    checkMissingCoordinates();
  }

  function renderMapMarkers() {
    state.clusterGroup.clearLayers();

    state.filteredRecords.forEach(record => {
      if (!record.lat || !record.lng) return;

      let markerClass = 'marker-captado';
      let iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;

      if (record.estado === 'No Estaba (Repasar)') {
        markerClass = 'marker-repasar';
        iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
      } else if (record.estado === 'Rechazado') {
        markerClass = 'marker-rechazado';
        iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
      }

      const icon = L.divIcon({
        className: 'custom-pin-icon',
        html: `
          <div class="custom-fire-marker ${markerClass}" title="${record.nombre} - ${record.direccion}">
            ${iconSvg}
          </div>
        `,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });

      const marker = L.marker([record.lat, record.lng], { icon: icon });

      // Contenido del Popup al hacer clic
      marker.bindPopup(`
        <div class="popup-card">
          <div class="popup-header">
            <div>
              <span class="badge-status ${getBadgeClass(record.estado)}">${record.estado}</span>
              <div class="popup-title" style="margin-top: 5px;">${escapeHtml(record.nombre)}</div>
            </div>
          </div>
          <div class="popup-body">
            <div class="popup-row">
              <span>Dirección:</span>
              <strong>${escapeHtml(record.direccion)}</strong>
            </div>
            <div class="popup-row">
              <span>Sector:</span>
              <strong>${escapeHtml(record.sector || 'La Florida')}</strong>
            </div>
            ${record.monto > 0 ? `
              <div class="popup-row">
                <span>Aporte:</span>
                <strong style="color: var(--fire-gold); font-size: 0.9rem;">$ ${record.monto.toLocaleString('es-CL')} / ${record.frecuencia || 'mes'}</strong>
              </div>
            ` : ''}
            ${record.metodoPago && record.metodoPago !== '-' ? `
              <div class="popup-row">
                <span>Método Pago:</span>
                <strong>${escapeHtml(record.metodoPago)}</strong>
              </div>
            ` : ''}
            <div class="popup-row">
              <span>Registrado por:</span>
              <strong>${escapeHtml(record.voluntario || 'Voluntario')}</strong>
            </div>
            ${record.fecha ? `
              <div class="popup-row">
                <span>Fecha:</span>
                <strong>${record.fecha}</strong>
              </div>
            ` : ''}
            ${record.telefono ? `
              <div class="popup-row">
                <span>Teléfono:</span>
                <a href="tel:${record.telefono}" style="color: var(--cyan); text-decoration: none;">${record.telefono}</a>
              </div>
            ` : ''}
            ${record.notas ? `
              <div style="margin-top: 4px; padding: 6px; background: rgba(255,255,255,0.04); border-radius: 4px; font-size: 0.72rem; color: #cbd5e1;">
                <em>"${escapeHtml(record.notas)}"</em>
              </div>
            ` : ''}
          </div>
          <div class="popup-footer">
            <span style="font-size: 0.65rem; color: #64748b;">La Florida, RM</span>
            <a href="https://www.google.com/maps/dir/?api=1&destination=${record.lat},${record.lng}" target="_blank" class="popup-btn-route">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
              Cómo Llegar
            </a>
          </div>
        </div>
      `);

      state.clusterGroup.addLayer(marker);
    });
  }

  function renderHeatmap() {
    if (state.heatLayer) {
      state.map.removeLayer(state.heatLayer);
      state.heatLayer = null;
    }

    if (!state.visibleLayers.heatmap) return;

    // Solo socios captados para ver densidad de cooperadores
    const heatPoints = state.filteredRecords
      .filter(r => r.lat && r.lng && r.estado === 'Socio Captado')
      .map(r => {
        // Ponderar levemente por monto de aporte
        const intensity = r.monto ? Math.min(1.0, Math.max(0.4, r.monto / 20000)) : 0.6;
        return [r.lat, r.lng, intensity];
      });

    if (heatPoints.length > 0) {
      state.heatLayer = L.heatLayer(heatPoints, {
        radius: 28,
        blur: 20,
        maxZoom: 17,
        gradient: {
          0.2: '#06b6d4',
          0.4: '#10b981',
          0.6: '#f59e0b',
          0.8: '#f97316',
          1.0: '#ef4444'
        }
      }).addTo(state.map);
    }
  }

  // ================= KPIS Y ESTADÍSTICAS =================
  function renderStats() {
    const totalCaptados = state.filteredRecords.filter(r => r.estado === 'Socio Captado').length;
    const totalRepasar = state.filteredRecords.filter(r => r.estado === 'No Estaba (Repasar)').length;
    const totalRechazados = state.filteredRecords.filter(r => r.estado === 'Rechazado').length;
    const totalVisitados = totalCaptados + totalRepasar + totalRechazados;

    const totalRecaudado = state.filteredRecords
      .filter(r => r.estado === 'Socio Captado')
      .reduce((acc, curr) => acc + (Number(curr.monto) || 0), 0);

    const avgDonation = totalCaptados > 0 ? Math.round(totalRecaudado / totalCaptados) : 0;
    const efectividad = totalVisitados > 0 ? Math.round((totalCaptados / totalVisitados) * 100) : 0;

    // Update KPIs
    DOM.kpiTotalCaptados.textContent = totalCaptados;
    DOM.kpiTotalRecaudado.textContent = `$ ${totalRecaudado.toLocaleString('es-CL')}`;
    DOM.kpiTotalRepasar.textContent = totalRepasar;
    DOM.kpiEfectividad.textContent = `${efectividad}%`;
    DOM.kpiAvgDonation.textContent = `Promedio: $ ${avgDonation.toLocaleString('es-CL')} / mes`;

    // Campaign Goal bar
    const allCaptados = state.records.filter(r => r.estado === 'Socio Captado').length;
    const pct = Math.min(100, Math.round((allCaptados / CONFIG.campaignTarget) * 100));
    DOM.kpiTargetCurrent.textContent = allCaptados;
    DOM.kpiTargetPercent.textContent = `(${pct}%)`;
    DOM.campaignProgressFill.style.width = `${pct}%`;
  }

  // Cobertura por Barrio
  function renderSectorCoverage() {
    DOM.sectorsCoverageList.innerHTML = '';
    let barriosConVisitas = 0;

    state.sectors.forEach(sec => {
      const sociosEnSector = state.records.filter(r => r.sector === sec.name && r.estado === 'Socio Captado').length;
      const repasarEnSector = state.records.filter(r => r.sector === sec.name && r.estado === 'No Estaba (Repasar)').length;
      const totalEnSector = sociosEnSector + repasarEnSector;

      if (totalEnSector > 0) barriosConVisitas++;

      // Meta orientativa de 15 socios por sector
      const sectorGoal = 15;
      const pct = Math.min(100, Math.round((sociosEnSector / sectorGoal) * 100));

      const item = document.createElement('div');
      item.className = 'sector-item';
      item.innerHTML = `
        <div class="sector-top">
          <div class="sector-name">
            <span class="sector-dot" style="background: ${sec.color};"></span>
            ${escapeHtml(sec.name)}
          </div>
          <div class="sector-count">
            <strong>${sociosEnSector}</strong> socios <span style="font-size: 0.65rem; color: #94a3b8;">(${repasarEnSector} por repasar)</span>
          </div>
        </div>
        <div class="sector-progress-track">
          <div class="sector-progress-bar" style="width: ${pct}%; background: ${sec.color};"></div>
        </div>
      `;

      item.addEventListener('click', () => {
        state.map.flyTo(sec.center, 14, { duration: 1.2 });
        DOM.filterSector.value = sec.name;
        state.filters.sector = sec.name;
        applyFilters();
      });

      DOM.sectorsCoverageList.appendChild(item);
    });

    DOM.countBarriosCubiertos.textContent = `${barriosConVisitas} / ${state.sectors.length}`;
  }

  // Lista de registros recientes en el sidebar
  function renderRecentList() {
    DOM.recentVisitsList.innerHTML = '';
    const slice = state.filteredRecords.slice(0, 15);
    DOM.countRecentShown.textContent = `${slice.length} de ${state.filteredRecords.length}`;

    if (slice.length === 0) {
      DOM.recentVisitsList.innerHTML = `
        <div style="text-align: center; padding: 1.5rem; color: #64748b; font-size: 0.78rem;">
          No se encontraron casas con los filtros seleccionados.
        </div>
      `;
      return;
    }

    slice.forEach(r => {
      const card = document.createElement('div');
      card.className = 'recent-card';
      card.innerHTML = `
        <div class="rc-header">
          <span class="rc-name">${escapeHtml(r.nombre)}</span>
          ${r.monto > 0 ? `<span class="rc-amount">+$ ${r.monto.toLocaleString('es-CL')}</span>` : ''}
        </div>
        <div class="rc-address">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          ${escapeHtml(r.direccion)}
        </div>
        <div class="rc-footer">
          <span class="badge-status ${getBadgeClass(r.estado)}">${r.estado}</span>
          <span>${r.fecha || 'Reciente'}</span>
        </div>
      `;

      card.addEventListener('click', () => {
        if (r.lat && r.lng) {
          state.map.flyTo([r.lat, r.lng], 16, { duration: 1 });
          // Buscar marker y abrir popup
          state.clusterGroup.eachLayer(layer => {
            const pos = layer.getLatLng();
            if (Math.abs(pos.lat - r.lat) < 0.0001 && Math.abs(pos.lng - r.lng) < 0.0001) {
              setTimeout(() => layer.openPopup(), 600);
            }
          });
        } else {
          showToast(`La dirección "${r.direccion}" requiere geocodificación.`, 'warning');
        }
      });

      DOM.recentVisitsList.appendChild(card);
    });
  }

  // ================= VERIFICAR Y AUTO-GEOCODIFICAR =================
  function checkMissingCoordinates() {
    const missing = state.records.filter(r => (!r.lat || !r.lng) && r.direccion);
    if (missing.length > 0) {
      DOM.geoMissingCount.textContent = missing.length;
      DOM.geocodingBanner.style.display = 'flex';
    } else {
      DOM.geocodingBanner.style.display = 'none';
    }
  }

  async function batchGeocodeMissingAddresses() {
    if (state.isGeocoding) return;
    state.isGeocoding = true;
    DOM.btnAutoGeocode.disabled = true;
    DOM.btnAutoGeocode.textContent = 'Buscando en mapa...';

    const missing = state.records.filter(r => (!r.lat || !r.lng) && r.direccion);
    let resolvedCount = 0;

    showToast(`Iniciando geocodificación de ${missing.length} direcciones en La Florida...`, 'info');

    for (let i = 0; i < missing.length; i++) {
      const record = missing[i];
      DOM.btnAutoGeocode.textContent = `📍 Geocodificando (${i + 1}/${missing.length})...`;

      const coords = await geocodeAddressInLaFlorida(record.direccion);
      if (coords) {
        record.lat = coords.lat;
        record.lng = coords.lng;
        if (!record.sector) {
          record.sector = findSectorForCoordinate(coords.lat, coords.lng);
        }
        resolvedCount++;
      }

      // Delay para respetar política de uso de OSM Nominatim (1 req por seg)
      await new Promise(r => setTimeout(r, 700));
    }

    saveRecords();
    applyFilters();

    state.isGeocoding = false;
    DOM.btnAutoGeocode.disabled = false;
    DOM.btnAutoGeocode.textContent = '📍 Geocodificar en La Florida';

    showToast(`¡Listo! Se georreferenciaron ${resolvedCount} direcciones en La Florida.`, 'success');
  }

  // Geocodificador inteligente con Caché Local
  async function geocodeAddressInLaFlorida(direccion) {
    const cleanDir = direccion.trim().toLowerCase();
    const cacheKey = CONFIG.cachePrefix + cleanDir;

    // 1. Revisar caché de localStorage
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {}
    }

    // 2. Consulta a Nominatim con contexto estricto de La Florida, Santiago, Chile
    try {
      const query = encodeURIComponent(`${direccion}, La Florida, Región Metropolitana, Chile`);
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1&countrycodes=cl`;

      const response = await fetch(url, {
        headers: {
          'Accept-Language': 'es'
        }
      });

      if (!response.ok) return null;
      const data = await response.json();

      if (data && data.length > 0) {
        const result = {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon)
        };
        // Guardar en caché
        localStorage.setItem(cacheKey, JSON.stringify(result));
        return result;
      }
    } catch (err) {
      console.warn('Error en geocodificación:', err);
    }

    return null;
  }

  // Modelos vectoriales de calles para que los domicilios sigan el trazado real de cada calle
  const STREET_MODELS = {
    'el marquez': { pts: [[-33.54421, -70.57550], [-33.54408, -70.57385]], numRange: [1000, 1100], sideOffset: 0.00004 },
    'el marques': { pts: [[-33.54421, -70.57550], [-33.54408, -70.57385]], numRange: [1000, 1100], sideOffset: 0.00004 },
    'el vizconde': { pts: [[-33.54462, -70.57530], [-33.54448, -70.57385]], numRange: [1000, 1100], sideOffset: 0.00004 },
    'la realeza': { pts: [[-33.54515, -70.57485], [-33.54502, -70.57380]], numRange: [1000, 1100], sideOffset: 0.00004 },
    'la condesa': { pts: [[-33.54360, -70.57605], [-33.54440, -70.57540], [-33.54565, -70.57465]], numRange: [9500, 9700], sideOffset: 0.00004 },
    'los canales': { pts: [[-33.54330, -70.57690], [-33.54440, -70.57630], [-33.54590, -70.57535]], numRange: [9570, 9700], sideOffset: 0.00004 },
    'los lagos': { pts: [[-33.54570, -70.57550], [-33.54700, -70.57380]], numRange: [9700, 9830], sideOffset: 0.00004 },
    'mexico': { pts: [[-33.54300, -70.57385], [-33.54650, -70.57380]], numRange: [9650, 9850], sideOffset: 0.00004 },
    'golan': { pts: [[-33.54350, -70.57330], [-33.54600, -70.57280]], numRange: [9500, 9650], sideOffset: 0.00004 },
    'sinai': { pts: [[-33.54450, -70.57240], [-33.54680, -70.57180]], numRange: [9550, 9880], sideOffset: 0.00004 },
    'tripoli': { pts: [[-33.54690, -70.57150], [-33.54695, -70.57080]], numRange: [9800, 9850], sideOffset: 0.00003 },
    'rodas': { pts: [[-33.54645, -70.57180], [-33.54640, -70.57120]], numRange: [1250, 1310], sideOffset: 0.00003 },
    'atenas': { pts: [[-33.54545, -70.57310], [-33.54540, -70.57260]], numRange: [1220, 1260], sideOffset: 0.00003 },
    'chipre': { pts: [[-33.54515, -70.57340], [-33.54508, -70.57290]], numRange: [1230, 1260], sideOffset: 0.00003 },
    'grecia': { pts: [[-33.54480, -70.57360], [-33.54475, -70.57320]], numRange: [1240, 1270], sideOffset: 0.00003 },
    'albania': { pts: [[-33.54620, -70.57350], [-33.54618, -70.57300]], numRange: [1200, 1240], sideOffset: 0.00003 },
    'las vertientes': { pts: [[-33.54650, -70.57650], [-33.54630, -70.57350]], numRange: [950, 1100], sideOffset: 0.00003 },
    'malvania': { pts: [[-33.54580, -70.57280], [-33.54578, -70.57230]], numRange: [1240, 1280], sideOffset: 0.00003 },
    'palermo': { pts: [[-33.54470, -70.60150], [-33.54473, -70.60000]], numRange: [9800, 9950], sideOffset: 0.00003 }
  };

  function interpolateAlongStreet(calleName, numStr) {
    if (!calleName) return null;
    const clean = calleName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    let model = STREET_MODELS[clean];
    if (!model) {
      for (const k in STREET_MODELS) {
        if (clean.includes(k) || k.includes(clean)) {
          model = STREET_MODELS[k];
          break;
        }
      }
    }
    if (!model) return null;

    const pts = model.pts;
    const [minNum, maxNum] = model.numRange;
    let n = parseInt(String(numStr || '').replace(/\D/g, ''), 10);
    if (isNaN(n) || n === 0) n = Math.floor((minNum + maxNum) / 2);

    let t = (n - minNum) / Math.max(1, (maxNum - minNum));
    t = Math.max(0.04, Math.min(0.96, t));

    const numSegs = pts.length - 1;
    const segIdx = Math.min(numSegs - 1, Math.floor(t * numSegs));
    const segT = (t * numSegs) - segIdx;

    const p1 = pts[segIdx];
    const p2 = pts[segIdx + 1];

    let lat = p1[0] + segT * (p2[0] - p1[0]);
    let lng = p1[1] + segT * (p2[1] - p1[1]);

    const side = (n % 2 === 0) ? 1 : -1;
    const dlat = p2[0] - p1[0];
    const dlng = p2[1] - p1[1];
    const len = Math.sqrt(dlat * dlat + dlng * dlng);
    if (len > 0) {
      lat += -dlng / len * model.sideOffset * side;
      lng += dlat / len * model.sideOffset * side;
    }

    return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
  }

  // ================= SINCRONIZACIÓN GOOGLE SHEETS =================
  // Sincronización automática directa con Google Sheets
  function autoSyncGoogleSheets(isManual = false) {
    const url = CONFIG.sheetsUrl;
    const icon = document.getElementById('syncIcon');
    if (icon) icon.style.animation = 'spin 1s linear infinite';
    if (isManual) showToast('Conectando en vivo con Google Sheets...', 'info');

    Papa.parse(url, {
      download: true,
      header: false,
      skipEmptyLines: true,
      complete: function (results) {
        if (icon) icon.style.animation = '';
        if (results && results.data && results.data.length > 0) {
          processImportedRowsFlexible(results.data, 'Google Sheets (En Vivo)');
          if (isManual) {
            showToast('✅ Mapa actualizado en vivo desde Google Sheets.', 'success');
          }
        }
      },
      error: function (err) {
        if (icon) icon.style.animation = '';
        if (isManual) {
          showToast('No se pudo sincronizar en vivo: ' + err.message, 'warning');
        }
      }
    });
  }

  async function loadGoogleSheetsCsv(csvUrl) {
    if (!csvUrl) {
      showToast('Por favor ingresa el enlace CSV de tu Google Sheet.', 'warning');
      return;
    }

    showToast('Descargando datos oficiales de la 10ª Compañía...', 'info');

    try {
      Papa.parse(csvUrl, {
        download: true,
        header: false,
        skipEmptyLines: true,
        complete: function (results) {
          processImportedRowsFlexible(results.data, 'Google Sheets');
          closeModal('modalSyncSheets');
        },
        error: function (error) {
          showToast('Error al leer Google Sheets: ' + error.message, 'warning');
        }
      });
    } catch (e) {
      showToast('No se pudo conectar con el enlace indicado.', 'warning');
    }
  }

  // Parsear archivo CSV subido desde disco
  function handleCsvFileUpload(file) {
    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      complete: function (results) {
        processImportedRowsFlexible(results.data, file.name);
      },
      error: function (err) {
        showToast('Error al procesar el archivo CSV: ' + err.message, 'warning');
      }
    });
  }

  // Procesamiento flexible que soporta encabezados en filas 0, 1, 2 o 3 (como en la hoja Registro)
  function processImportedRowsFlexible(rawRows, sourceName) {
    if (!rawRows || rawRows.length === 0) {
      showToast('La planilla no contiene filas con datos válidos.', 'warning');
      return;
    }

    // 1. Buscar la fila que contiene los nombres de las columnas
    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(6, rawRows.length); i++) {
      const row = rawRows[i];
      const hasDir = row.some(cell => {
        const norm = String(cell).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        return norm.includes('direccion') || norm.includes('calle') || norm.includes('address');
      });
      if (hasDir) {
        headerRowIdx = i;
        break;
      }
    }

    if (headerRowIdx === -1) {
      showToast('No se encontró la columna "Dirección" en las primeras filas de la planilla.', 'warning');
      return;
    }

    const headers = rawRows[headerRowIdx].map(h =>
      String(h).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
    );

    const findCol = (candidates) => {
      return headers.findIndex(h => candidates.some(c => h.includes(c)));
    };

    const colDir = findCol(['direccion', 'calle', 'domicilio']);
    const colNum = findCol(['n° casa', 'no casa', 'numero', 'nro', 'casa']);
    const colResp = findCol(['respuesta', 'estado', 'resultado', 'condicion']);
    const colFolio = findCol(['folio', 'mandato']);
    const colVol = findCol(['voluntario', 'escuadra', 'bombero']);
    const colFecha = findCol(['ultima visita', 'fecha', 'timestamp', 'dia']);
    const colProx = findCol(['proxima visita', 'proxima']);
    const colObs = findCol(['observaciones', 'observacion', 'notas', 'nota']);
    const colLat = findCol(['latitud', 'lat']);
    const colLng = findCol(['longitud', 'lng', 'lon']);

    const newRecords = [];
    const streetCounts = {};

    for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
      const row = rawRows[r];
      if (!row || row.length === 0) continue;

      const calle = colDir >= 0 && row[colDir] ? String(row[colDir]).trim() : '';
      const numero = colNum >= 0 && row[colNum] ? String(row[colNum]).trim() : '';
      const resp = colResp >= 0 && row[colResp] ? String(row[colResp]).trim() : '';
      const folio = colFolio >= 0 && row[colFolio] ? String(row[colFolio]).trim() : '';
      const vol = colVol >= 0 && row[colVol] ? String(row[colVol]).trim() : '10ª Compañía';
      const fecha = colFecha >= 0 && row[colFecha] ? String(row[colFecha]).trim() : '';
      const prox = colProx >= 0 && row[colProx] ? String(row[colProx]).trim() : '';
      const obs = colObs >= 0 && row[colObs] ? String(row[colObs]).trim() : '';

      if (!calle && !numero) continue;

      // Estado
      let estado = 'Socio Captado';
      let monto = 0;
      if (/socio|ya es socio/i.test(resp)) {
        estado = 'Socio Captado';
        monto = 5000;
      } else if (/ausente|volver|repasar|nadie/i.test(resp)) {
        estado = 'No Estaba (Repasar)';
      } else if (/rechaz|no interesado|no quiere|negativ/i.test(resp)) {
        estado = 'Rechazado';
      } else {
        estado = 'No Estaba (Repasar)';
      }

      // Nombre y Dirección Completa
      const fullDir = numero ? `${calle} ${numero}` : calle;
      let nombre = `Casa ${fullDir}`;
      if (estado === 'Socio Captado') {
        nombre = folio ? `Socio Mandato #${folio}` : `Socio Cooperador (${fullDir})`;
      }

      // Coordenadas: Si vienen en la planilla, usarlas; sino, buscar en tabla conocida
      let lat = colLat >= 0 && row[colLat] ? parseFloat(String(row[colLat]).replace(',', '.')) : null;
      let lng = colLng >= 0 && row[colLng] ? parseFloat(String(row[colLng]).replace(',', '.')) : null;

      if (!lat || !lng) {
        const coords = interpolateAlongStreet(calle, numero);
        if (coords) {
          lat = coords.lat;
          lng = coords.lng;
        }
      }

      newRecords.push({
        id: Date.now() + r,
        nroFila: row[0] || r,
        fecha: fecha || 'Reciente',
        nombre: nombre,
        direccion: fullDir,
        calle: calle,
        numero: numero,
        sector: 'Villa O\'Higgins / Santa Amalia',
        monto: monto,
        frecuencia: monto > 0 ? 'Mensual' : '-',
        metodoPago: folio ? `Mandato Folio #${folio}` : (estado === 'Socio Captado' ? 'Mandato PAC / Tarjeta' : '-'),
        voluntario: vol || 'Décima Compañía',
        estado: estado,
        folio: folio,
        proximaVisita: prox,
        notas: obs || (folio ? `Folio: ${folio}` : ''),
        lat: lat,
        lng: lng
      });
    }

    if (newRecords.length > 0) {
      state.records = newRecords;
      saveRecords();
      populateSquadOptions();
      applyFilters();
      showToast(`¡Éxito! Se sincronizaron ${newRecords.length} casas de la 10ª Compañía desde ${sourceName}.`, 'success');
      checkMissingCoordinates();
    } else {
      showToast('No se pudieron leer registros válidos de la planilla.', 'warning');
    }
  }

  // ================= ASIGNACIÓN DE SECTOR =================
  function findSectorForCoordinate(lat, lng) {
    for (const sec of state.sectors) {
      const minLat = Math.min(sec.bounds[0][0], sec.bounds[2][0]);
      const maxLat = Math.max(sec.bounds[0][0], sec.bounds[2][0]);
      const minLng = Math.min(sec.bounds[0][1], sec.bounds[1][1]);
      const maxLng = Math.max(sec.bounds[0][1], sec.bounds[1][1]);

      if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) {
        return sec.name;
      }
    }
    return 'La Florida Centro';
  }

  // ================= FORMULARIO EN TERRENO (NUEVO REGISTRO) =================
  async function handleNewRecordSubmit(e) {
    e.preventDefault();

    const nombre = document.getElementById('newNombre').value.trim();
    const direccion = document.getElementById('newDireccion').value.trim();
    const estado = document.getElementById('newEstado').value;
    const monto = parseInt(document.getElementById('newMonto').value, 10) || 0;
    const voluntario = document.getElementById('newVoluntario').value.trim() || 'Escuadra Terreno';
    const metodoPago = document.getElementById('newMetodoPago').value;
    const notas = document.getElementById('newNotas').value.trim();

    let lat = DOM.newLat.value ? parseFloat(DOM.newLat.value) : null;
    let lng = DOM.newLng.value ? parseFloat(DOM.newLng.value) : null;

    // Si no tiene GPS aún, intentar geocodificar la dirección de inmediato
    if (!lat || !lng) {
      showToast('Ubicando dirección en La Florida...', 'info');
      const coords = await geocodeAddressInLaFlorida(direccion);
      if (coords) {
        lat = coords.lat;
        lng = coords.lng;
      }
    }

    const sector = (lat && lng) ? findSectorForCoordinate(lat, lng) : 'La Florida Centro';

    const newRecord = {
      id: Date.now(),
      fecha: new Date().toISOString().split('T')[0],
      nombre,
      direccion,
      sector,
      monto,
      frecuencia: 'Mensual',
      metodoPago,
      voluntario,
      estado,
      telefono: '',
      lat,
      lng,
      notas
    };

    state.records.unshift(newRecord);
    saveRecords();
    applyFilters();

    closeModal('modalNewRecord');
    DOM.formNewRecord.reset();
    DOM.newLat.value = '';
    DOM.newLng.value = '';
    DOM.gpsStatusHint.textContent = 'No es necesario escribir "La Florida", el sistema lo asume automáticamente.';

    showToast(`✅ Socio "${nombre}" registrado y ubicado en el mapa.`, 'success');

    // Volar al punto registrado
    if (lat && lng) {
      state.map.flyTo([lat, lng], 16, { duration: 1.2 });
    }
  }

  // Obtener GPS del bombero en terreno
  function captureGpsLocation(isForForm = false) {
    if (!navigator.geolocation) {
      showToast('La geolocalización GPS no está soportada en este navegador.', 'warning');
      return;
    }

    showToast('Obteniendo tu ubicación GPS en terreno...', 'info');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        if (isForForm) {
          DOM.newLat.value = lat;
          DOM.newLng.value = lng;
          DOM.gpsStatusHint.textContent = `📍 Coordenadas capturadas: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          DOM.gpsStatusHint.style.color = '#6ee7b7';
          showToast('GPS capturado con éxito.', 'success');
        } else {
          // Mostrar punto azul en el mapa
          if (state.userLocationMarker) {
            state.map.removeLayer(state.userLocationMarker);
          }

          const userIcon = L.divIcon({
            html: `
              <div style="width: 16px; height: 16px; background: #3b82f6; border: 3px solid #fff; border-radius: 50%; box-shadow: 0 0 16px #3b82f6; animation: pulse 1.5s infinite;"></div>
            `,
            iconSize: [16, 16],
            iconAnchor: [8, 8]
          });

          state.userLocationMarker = L.marker([lat, lng], { icon: userIcon })
            .bindPopup('<strong>Tu ubicación actual (Bombero en terreno)</strong>')
            .addTo(state.map);

          state.map.flyTo([lat, lng], 16, { duration: 1.2 });
          showToast('Mapa centrado en tu posición GPS actual.', 'info');
        }
      },
      (err) => {
        showToast('No se pudo obtener el GPS: ' + err.message, 'warning');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  // ================= EXPORTAR A EXCEL / CSV =================
  function exportRecordsToCsv() {
    if (state.records.length === 0) {
      showToast('No hay datos para exportar.', 'warning');
      return;
    }

    const exportData = state.records.map(r => ({
      Fecha: r.fecha || '',
      Nombre: r.nombre || '',
      Direccion: r.direccion || '',
      Sector: r.sector || '',
      Monto_CLP: r.monto || 0,
      Frecuencia: r.frecuencia || 'Mensual',
      MetodoPago: r.metodoPago || '',
      Voluntario: r.voluntario || '',
      Estado: r.estado || '',
      Telefono: r.telefono || '',
      Latitud: r.lat || '',
      Longitud: r.lng || '',
      Notas: r.notas || ''
    }));

    const csv = Papa.unparse(exportData);
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Socios_Bomberos_La_Florida_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('Planilla CSV descargada con coordenadas de Latitud y Longitud.', 'success');
  }

  // ================= UI HELPERS & SELECTORS =================
  function populateSectorOptions() {
    DOM.filterSector.innerHTML = '<option value="all">📍 Todos los sectores de La Florida</option>';
    state.sectors.forEach(sec => {
      const opt = document.createElement('option');
      opt.value = sec.name;
      opt.textContent = sec.name;
      DOM.filterSector.appendChild(opt);
    });
  }

  function populateSquadOptions() {
    const squads = new Set();
    state.records.forEach(r => {
      if (r.voluntario) squads.add(r.voluntario);
    });

    DOM.filterSquad.innerHTML = '<option value="all">🚒 Todas las escuadras / voluntarios</option>';
    squads.forEach(sq => {
      const opt = document.createElement('option');
      opt.value = sq;
      opt.textContent = sq;
      DOM.filterSquad.appendChild(opt);
    });
  }

  function switchBasemap(type) {
    if (state.activeBasemap === type) return;

    state.map.removeLayer(state.tileLayers[state.activeBasemap]);
    state.tileLayers[type].addTo(state.map);
    state.activeBasemap = type;

    // Actualizar botones activos
    document.querySelectorAll('#baseMapSelector .map-type-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.basemap === type);
    });
  }

  function toggleLayer(layerName) {
    state.visibleLayers[layerName] = !state.visibleLayers[layerName];

    if (layerName === 'clusters') {
      if (state.visibleLayers.clusters) {
        state.map.addLayer(state.clusterGroup);
      } else {
        state.map.removeLayer(state.clusterGroup);
      }
      DOM.btnToggleClusters.classList.toggle('active', state.visibleLayers.clusters);
    } else if (layerName === 'heatmap') {
      DOM.btnToggleHeatmap.classList.toggle('active', state.visibleLayers.heatmap);
      renderHeatmap();
    } else if (layerName === 'sectors') {
      if (state.visibleLayers.sectors) {
        state.map.addLayer(state.sectorsGroup);
      } else {
        state.map.removeLayer(state.sectorsGroup);
      }
      DOM.btnToggleSectors.classList.toggle('active', state.visibleLayers.sectors);
    } else if (layerName === 'stations') {
      if (state.visibleLayers.stations) {
        state.map.addLayer(state.stationsGroup);
      } else {
        state.map.removeLayer(state.stationsGroup);
      }
      DOM.btnToggleStations.classList.toggle('active', state.visibleLayers.stations);
    }
  }

  function renderAll() {
    applyFilters();
  }

  function refreshIcons() {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  // ================= MODAL MANAGERS =================
  function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
      modal.classList.add('active');
      refreshIcons();
    }
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
      modal.classList.remove('active');
    }
  }

  // ================= TOAST NOTIFICATIONS =================
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let iconHtml = '<i data-lucide="info"></i>';
    if (type === 'success') iconHtml = '<i data-lucide="check-circle" style="color: var(--emerald);"></i>';
    if (type === 'warning') iconHtml = '<i data-lucide="alert-triangle" style="color: var(--amber);"></i>';

    toast.innerHTML = `
      ${iconHtml}
      <span>${escapeHtml(message)}</span>
    `;

    DOM.toastContainer.appendChild(toast);
    refreshIcons();

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  function getBadgeClass(estado) {
    if (estado === 'Socio Captado') return 'badge-captado';
    if (estado === 'No Estaba (Repasar)') return 'badge-repasar';
    return 'badge-rechazado';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ================= EVENT BINDINGS =================
  function bindEvents() {
    // Sidebar toggle
    DOM.btnToggleSidebar.addEventListener('click', () => {
      DOM.appSidebar.classList.toggle('collapsed');
      const isCollapsed = DOM.appSidebar.classList.contains('collapsed');
      DOM.sidebarIcon.setAttribute('data-lucide', isCollapsed ? 'panel-left-open' : 'panel-left-close');
      refreshIcons();
      setTimeout(() => state.map.invalidateSize(), 300);
    });

    // Basemaps switch
    document.querySelectorAll('#baseMapSelector .map-type-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const type = e.currentTarget.dataset.basemap;
        switchBasemap(type);
      });
    });

    // Layer toggles
    DOM.btnToggleClusters.addEventListener('click', () => toggleLayer('clusters'));
    DOM.btnToggleHeatmap.addEventListener('click', () => toggleLayer('heatmap'));
    DOM.btnToggleSectors.addEventListener('click', () => toggleLayer('sectors'));
    DOM.btnToggleStations.addEventListener('click', () => toggleLayer('stations'));

    // Map tools
    DOM.btnLocateUser.addEventListener('click', () => captureGpsLocation(false));
    DOM.btnCenterFlorida.addEventListener('click', () => {
      state.map.flyTo(CONFIG.initialCenter, CONFIG.initialZoom, { duration: 1 });
      showToast('Centrado en La Florida.', 'info');
    });
    DOM.btnExportData.addEventListener('click', exportRecordsToCsv);

    // Geocoding action
    DOM.btnAutoGeocode.addEventListener('click', batchGeocodeMissingAddresses);

    // Filters
    DOM.filterSearch.addEventListener('input', (e) => {
      state.filters.search = e.target.value;
      applyFilters();
    });

    DOM.statusFilterPills.addEventListener('click', (e) => {
      if (e.target.classList.contains('pill-btn')) {
        document.querySelectorAll('#statusFilterPills .pill-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        state.filters.status = e.target.dataset.status;
        applyFilters();
      }
    });

    DOM.filterSector.addEventListener('change', (e) => {
      state.filters.sector = e.target.value;
      if (state.filters.sector !== 'all') {
        const found = state.sectors.find(s => s.name === state.filters.sector);
        if (found) state.map.flyTo(found.center, 14, { duration: 1 });
      }
      applyFilters();
    });

    DOM.filterSquad.addEventListener('change', (e) => {
      state.filters.squad = e.target.value;
      applyFilters();
    });

    DOM.btnResetFilters.addEventListener('click', () => {
      DOM.filterSearch.value = '';
      DOM.filterSector.value = 'all';
      DOM.filterSquad.value = 'all';
      document.querySelectorAll('#statusFilterPills .pill-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('#statusFilterPills .pill-btn[data-status="all"]').classList.add('active');

      state.filters = { search: '', status: 'all', sector: 'all', squad: 'all' };
      applyFilters();
      showToast('Filtros restablecidos.', 'info');
    });

    // Sincronización en vivo con 1 clic
    DOM.btnSyncSheets.addEventListener('click', () => autoSyncGoogleSheets(true));
    DOM.btnNewRecord.addEventListener('click', () => openModal('modalNewRecord'));
    DOM.btnHelp.addEventListener('click', () => openModal('modalHelp'));

    // Modal Close buttons
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const modalId = e.currentTarget.getAttribute('data-close');
        closeModal(modalId);
      });
    });

    // Close on overlay click
    document.querySelectorAll('.modal-overlay').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('active');
        }
      });
    });

    // Load Google Sheets from URL
    DOM.btnLoadSheetsUrl.addEventListener('click', () => {
      const url = DOM.inputSheetsUrl.value.trim();
      loadGoogleSheetsCsv(url);
    });

    // Upload local CSV
    DOM.btnUploadCsv.addEventListener('click', () => DOM.fileCsvInput.click());
    DOM.fileCsvInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        handleCsvFileUpload(e.target.files[0]);
      }
    });

    // Form New Record
    DOM.formNewRecord.addEventListener('submit', handleNewRecordSubmit);
    DOM.btnGpsForForm.addEventListener('click', () => captureGpsLocation(true));

    // Copy script button
    DOM.btnCopyScript.addEventListener('click', () => {
      navigator.clipboard.writeText(DOM.scriptContent.textContent).then(() => {
        DOM.btnCopyScript.textContent = '¡Copiado!';
        setTimeout(() => DOM.btnCopyScript.textContent = 'Copiar Código', 2000);
        showToast('Código de Google Apps Script copiado al portapapeles.', 'success');
      });
    });
  }

  // ================= START APP =================
  window.addEventListener('DOMContentLoaded', init);

})();
