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
    storageKey: 'bomberos_decima_cbn_v10',
    cachePrefix: 'geo_cache_la_florida_',
    campaignTarget: 500, // Meta de socios campaña actual
    sheetsUrl: 'https://docs.google.com/spreadsheets/d/14oLL6bsJLAw1evjAH6HDXe8gocrDvXdz/gviz/tq?tqx=out:csv&gid=132653492'
  };

  const state = {
    records: [],
    filteredRecords: [],
    stations: window.BOMBEROS_STATIONS || [],
    map: null,
    clusterGroup: null,
    heatLayer: null,
    stationsGroup: null,
    userLocationMarker: null,
    activeBasemap: 'streets',
    tileLayers: {},
    visibleLayers: {
      clusters: true,
      heatmap: false,
      stations: true
    },
    filters: {
      search: '',
      status: 'all',
      calle: 'all',
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
    sidebarBackdrop: document.getElementById('sidebarBackdrop'),
    btnMobileCloseSidebar: document.getElementById('btnMobileCloseSidebar'),

    // Mobile Bottom Navigation
    mobileBottomBar: document.getElementById('mobileBottomBar'),
    btnNavMap: document.getElementById('btnNavMap'),
    btnNavGps: document.getElementById('btnNavGps'),
    btnNavSummary: document.getElementById('btnNavSummary'),
    btnNavAdd: document.getElementById('btnNavAdd'),
    btnNavSync: document.getElementById('btnNavSync'),
    mobileSyncIcon: document.getElementById('mobileSyncIcon'),

    // KPIs
    kpiTotalCaptados: document.getElementById('kpiTotalCaptados'),
    kpiTotalRecaudado: document.getElementById('kpiTotalRecaudado'),
    kpiTotalRepasar: document.getElementById('kpiTotalRepasar'),
    kpiEfectividad: document.getElementById('kpiEfectividad'),
    kpiAvgDonation: document.getElementById('kpiAvgDonation'),
    kpiTargetCurrent: document.getElementById('kpiTargetCurrent'),
    kpiTargetGoal: document.getElementById('kpiTargetGoal'),
    kpiTargetPercent: document.getElementById('kpiTargetPercent'),
    campaignProgressFill: document.getElementById('campaignProgressFill'),

    // Filters
    filterSearch: document.getElementById('filterSearch'),
    statusFilterPills: document.getElementById('statusFilterPills'),
    filterCalle: document.getElementById('filterCalle'),
    filterSquad: document.getElementById('filterSquad'),
    btnResetFilters: document.getElementById('btnResetFilters'),

    // Lists
    recentVisitsList: document.getElementById('recentVisitsList'),
    countRecentShown: document.getElementById('countRecentShown'),

    // Map Controls
    baseMapSelector: document.getElementById('baseMapSelector'),
    btnToggleClusters: document.getElementById('btnToggleClusters'),
    btnToggleHeatmap: document.getElementById('btnToggleHeatmap'),
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
    state.stations = window.BOMBEROS_STATIONS || [];
    initData();
    initMap();
    populateStreetOptions();
    bindEvents();
    renderAll();
    refreshIcons();

    // En pantallas móviles (< 768px), el sidebar inicia cerrado para mostrar el mapa completo al voluntario
    if (window.innerWidth <= 768) {
      DOM.appSidebar.classList.add('collapsed');
      if (DOM.sidebarIcon) DOM.sidebarIcon.setAttribute('data-lucide', 'panel-left-open');
    }

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

    populateSquadOptions();
    populateStreetOptions();
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

    state.stationsGroup = L.featureGroup().addTo(state.map);

    // Dibujar cuarteles oficiales
    renderFireStations();
  }

  // ================= CAPAS Y MARCADORES =================
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

      // Filtro de calle / pasaje
      if (state.filters.calle !== 'all') {
        const normKey = normalizeStreetKey(r.calle);
        if (normKey !== state.filters.calle) {
          return false;
        }
      }

      // Filtro de voluntario / escuadra
      if (state.filters.squad !== 'all' && r.voluntario !== state.filters.squad) {
        return false;
      }

      // Búsqueda de texto libre (calle, nombre, notas)
      if (sTerm) {
        const text = `${r.nombre || ''} ${r.direccion || ''} ${r.calle || ''} ${r.voluntario || ''} ${r.notas || ''}`.toLowerCase();
        if (!text.includes(sTerm)) {
          return false;
        }
      }

      return true;
    });

    renderMapMarkers();
    renderHeatmap();
    renderStats();
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
            ${record.monto > 0 ? `
              <div class="popup-row">
                <span>Aporte:</span>
                <strong style="color: var(--fire-gold); font-size: 0.9rem;">$ ${record.monto.toLocaleString('es-CL')} / ${record.frecuencia || 'mes'}</strong>
              </div>
            ` : (record.estado === 'Socio Captado' ? `
              <div class="popup-row">
                <span>Aporte:</span>
                <span style="color: #94a3b8; font-size: 0.82rem;">Monto por confirmar en planilla</span>
              </div>
            ` : '')}
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

    if (typeof L.heatLayer !== 'function') {
      console.warn('L.heatLayer no está disponible.');
      return;
    }

    // Puntos con coordenadas válidas según filtros activos
    const records = (state.filteredRecords && state.filteredRecords.length > 0)
      ? state.filteredRecords
      : state.records;

    const heatPoints = records
      .filter(r => r.lat && r.lng)
      .map(r => {
        // Mayor intensidad para socios captados con aporte, intensidad visible para visitas
        let intensity = 0.5;
        if (r.estado === 'Socio Captado') {
          intensity = r.monto ? Math.min(1.0, Math.max(0.7, r.monto / 15000)) : 0.85;
        } else if (r.estado === 'No Estaba (Repasar)') {
          intensity = 0.55;
        } else {
          intensity = 0.35;
        }
        return [r.lat, r.lng, intensity];
      });

    if (heatPoints.length > 0) {
      state.heatLayer = L.heatLayer(heatPoints, {
        radius: 36,
        blur: 22,
        maxZoom: 18,
        minOpacity: 0.45,
        gradient: {
          0.15: '#06b6d4',
          0.35: '#10b981',
          0.60: '#f59e0b',
          0.80: '#f97316',
          1.00: '#ef4444'
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

    const sociosConMonto = state.filteredRecords.filter(r => r.estado === 'Socio Captado' && Number(r.monto) > 0).length;
    const avgDonation = sociosConMonto > 0 ? Math.round(totalRecaudado / sociosConMonto) : (totalCaptados > 0 ? Math.round(totalRecaudado / totalCaptados) : 0);
    const efectividad = totalVisitados > 0 ? Math.round((totalCaptados / totalVisitados) * 100) : 0;

    // Update KPIs
    DOM.kpiTotalCaptados.textContent = totalCaptados;
    DOM.kpiTotalRecaudado.textContent = `$ ${totalRecaudado.toLocaleString('es-CL')}`;
    DOM.kpiTotalRepasar.textContent = totalRepasar;
    DOM.kpiEfectividad.textContent = `${efectividad}%`;
    DOM.kpiAvgDonation.textContent = `Promedio: $ ${avgDonation.toLocaleString('es-CL')} / mes`;

    // Campaign Goal bar
    const allCaptados = state.records.filter(r => r.estado === 'Socio Captado').length;
    const target = CONFIG.campaignTarget || 500;
    const pct = Math.min(100, Math.round((allCaptados / target) * 100));
    DOM.kpiTargetCurrent.textContent = allCaptados;
    if (DOM.kpiTargetGoal) DOM.kpiTargetGoal.textContent = target;
    DOM.kpiTargetPercent.textContent = `(${pct}%)`;
    DOM.campaignProgressFill.style.width = `${pct}%`;
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
    const missing = state.records.filter(r => (!r.lat || !r.lng) && r.direccion && r.calle !== 'Dirección Pendiente');
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

    const missing = state.records.filter(r => (!r.lat || !r.lng) && r.direccion && r.calle !== 'Dirección Pendiente');
    let resolvedCount = 0;

    showToast(`Iniciando geocodificación de ${missing.length} direcciones en La Florida...`, 'info');

    for (let i = 0; i < missing.length; i++) {
      const record = missing[i];
      DOM.btnAutoGeocode.textContent = `📍 Geocodificando (${i + 1}/${missing.length})...`;

      const coords = await geocodeAddressInLaFlorida(record.direccion);
      if (coords) {
        record.lat = coords.lat;
        record.lng = coords.lng;
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

  // Coordenadas base de referencia en La Florida para calles detectadas
  const STREET_COORDS = {
    'tripoli': { lat: -33.546917, lng: -70.571133 },
    'rodas': { lat: -33.546447, lng: -70.571558 },
    'sinai': { lat: -33.545520, lng: -70.572242 },
    'chipre': { lat: -33.545110, lng: -70.573198 },
    'grecia': { lat: -33.544782, lng: -70.573423 },
    'golan': { lat: -33.544450, lng: -70.573903 },
    'atenas': { lat: -33.545420, lng: -70.572877 },
    'albania': { lat: -33.546194, lng: -70.573320 },
    'mexico': { lat: -33.544750, lng: -70.573820 },
    'palermo': { lat: -33.544718, lng: -70.600691 },
    'los canales': { lat: -33.544703, lng: -70.576135 },
    'las vertientes': { lat: -33.545881, lng: -70.575833 },
    'los lagos': { lat: -33.546537, lng: -70.574254 },
    'la condesa': { lat: -33.544453, lng: -70.575760 },
    'el marquez': { lat: -33.544215, lng: -70.575229 },
    'el vizconde': { lat: -33.544570, lng: -70.575045 },
    'la realeza': { lat: -33.545298, lng: -70.574666 },
    'santa marta': { lat: -33.545150, lng: -70.580800 },
    'cali': { lat: -33.545505, lng: -70.579602 },
    'colombia': { lat: -33.545100, lng: -70.586800 },
    'tineo': { lat: -33.545424, lng: -70.578518 },
    'trinidad oriente': { lat: -33.546855, lng: -70.583759 },
    'la duquesa': { lat: -33.544924, lng: -70.574857 },
    'nariño': { lat: -33.546779, lng: -70.580251 },
    'santa dolores': { lat: -33.548251, lng: -70.602155 },
    'san andres': { lat: -33.546133, lng: -70.583969 },
    'santa fe': { lat: -33.544446, lng: -70.581795 },
    'agua viva norte': { lat: -33.546664, lng: -70.577542 },
    'pimiento': { lat: -33.544347, lng: -70.578603 },
    'litre': { lat: -33.544119, lng: -70.578714 },
    'las termas': { lat: -33.550990, lng: -70.585964 },
    'los fiordos': { lat: -33.546527, lng: -70.574764 },
    'central oriente': { lat: -33.548299, lng: -70.578788 },
    'barranquilla': { lat: -33.544917, lng: -70.581689 },
    'malta': { lat: -33.545440, lng: -70.572580 },
    'los esteros': { lat: -33.545680, lng: -70.574260 },
    'santa amalia': { lat: -33.543720, lng: -70.572540 },
    'el cairo': { lat: -33.546800, lng: -70.574100 },
    'las vegas': { lat: -33.544600, lng: -70.574700 },
    'marino': { lat: -33.546779, lng: -70.580251 },
    'navino': { lat: -33.546779, lng: -70.580251 },
    'narino': { lat: -33.546779, lng: -70.580251 },
    'las nieves': { lat: -33.544360, lng: -70.573020 },
    'algarrobal': { lat: -33.543920, lng: -70.573940 },
    'jose h. wettlin': { lat: -33.543560, lng: -70.575420 },
    'santa catalina': { lat: -33.545400, lng: -70.572300 },
    'leon': { lat: -33.544520, lng: -70.574140 },
    'peru': { lat: -33.545880, lng: -70.571660 },
    'los abedules': { lat: -33.544000, lng: -70.574500 },
    'palqui': { lat: -33.545920, lng: -70.571940 },
    'palque': { lat: -33.545920, lng: -70.571940 },
    'los maniantales': { lat: -33.543040, lng: -70.571780 },
    'torrente': { lat: -33.546240, lng: -70.574180 },
    'el arroyo': { lat: -33.544320, lng: -70.572740 },
    'los rios': { lat: -33.546880, lng: -70.574660 },
    'ines de suarez': { lat: -33.545960, lng: -70.572220 },
    'caldas': { lat: -33.543840, lng: -70.573380 },
    'popayan': { lat: -33.543440, lng: -70.574580 },
    'magdalena': { lat: -33.544840, lng: -70.572380 },
    'manio': { lat: -33.544720, lng: -70.571540 },
    'medellin': { lat: -33.543160, lng: -70.572620 },
    'horizonte astral': { lat: -33.546720, lng: -70.573540 },
    'carlos meza': { lat: -33.543280, lng: -70.573460 },
    'avila': { lat: -33.546160, lng: -70.573620 },
    'badajoz': { lat: -33.543680, lng: -70.572260 },
    'santa raquel': { lat: -33.546200, lng: -70.573900 },
    'trinidad poniente': { lat: -33.547100, lng: -70.594500 },
    'el llano': { lat: -33.546520, lng: -70.572140 },
    'malvania': { lat: -33.545800, lng: -70.572550 },
    'ramon freire': { lat: -33.548050, lng: -70.597450 },
    'socoroma': { lat: -33.546850, lng: -70.602450 },
    'parinacota': { lat: -33.546850, lng: -70.601800 },
    'chapiquina': { lat: -33.546400, lng: -70.602100 },
    'jose miguel carrera': { lat: -33.549200, lng: -70.583500 },
    'mamina': { lat: -33.533500, lng: -70.566500 },
    'cerro retumbadero': { lat: -33.549800, lng: -70.598800 },
    'cerro provincia': { lat: -33.549500, lng: -70.598200 },
    'cerro prolancia': { lat: -33.549500, lng: -70.598200 },
    'cerro el altar': { lat: -33.549200, lng: -70.597800 },
    'cerro altar': { lat: -33.549200, lng: -70.597800 },
    'cerro caracol': { lat: -33.548900, lng: -70.598500 },
    'cerro fitz roy': { lat: -33.549600, lng: -70.599100 },
    'cerro el roble': { lat: -33.549100, lng: -70.598900 },
    'cerro catedral': { lat: -33.549400, lng: -70.598600 },
    'cerro la campana': { lat: -33.549000, lng: -70.598100 },
    'valentina leppe': { lat: -33.548700, lng: -70.599300 },
    'las flores': { lat: -33.548300, lng: -70.596800 },
    'portillo': { lat: -33.548500, lng: -70.596400 },
    'la parva': { lat: -33.548600, lng: -70.596100 },
    'antuco': { lat: -33.548400, lng: -70.595800 }
  };

  // Normalizador clave para agrupar calles independientemente de mayúsculas/minúsculas y tildes
  function normalizeStreetKey(str) {
    if (!str) return '';
    return str.toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/^pje\.?\s+|^pasaje\s+/i, 'pasaje ')
      .replace(/^avda\.?\s+|^av\.?\s+/i, 'av ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Formato estético y legible para nombres de calles en selectores
  function formatStreetName(calle) {
    if (!calle) return '';
    let str = calle.trim();
    str = str.replace(/^PJE\.?\s+/i, 'Pje. ')
             .replace(/^PASAJE\s+/i, 'Pasaje ')
             .replace(/^AVDA\.?\s+/i, 'Av. ')
             .replace(/^AV\.?\s+/i, 'Av. ');

    const lowerWords = ['de', 'del', 'la', 'las', 'el', 'los', 'en', 'y'];
    return str.split(/\s+/).map((word, idx) => {
      const wLower = word.toLowerCase();
      if (idx > 0 && lowerWords.includes(wLower)) return wLower;
      return wLower.charAt(0).toUpperCase() + wLower.slice(1);
    }).join(' ');
  }

  // Modelos vectoriales de calles para que los domicilios sigan el trazado real de cada calle
  const STREET_MODELS = {
    'el marquez': { pts: [[-33.54421, -70.57550], [-33.54408, -70.57385]], numRange: [1000, 1100], sideOffset: 0.00004 },
    'el marques': { pts: [[-33.54421, -70.57550], [-33.54408, -70.57385]], numRange: [1000, 1100], sideOffset: 0.00004 },
    'el vizconde': { pts: [[-33.54462, -70.57530], [-33.54448, -70.57385]], numRange: [1000, 1100], sideOffset: 0.00004 },
    'la duquesa': { pts: [[-33.54492, -70.57520], [-33.54482, -70.57385]], numRange: [1000, 1100], sideOffset: 0.00004 },
    'la realeza': { pts: [[-33.54515, -70.57485], [-33.54502, -70.57380]], numRange: [1000, 1100], sideOffset: 0.00004 },
    'la condesa': { pts: [[-33.54360, -70.57605], [-33.54440, -70.57540], [-33.54565, -70.57465]], numRange: [9500, 9700], sideOffset: 0.00004 },
    'los canales': { pts: [[-33.54330, -70.57690], [-33.54440, -70.57630], [-33.54590, -70.57535]], numRange: [9510, 9700], sideOffset: 0.00004 },
    'los lagos': { pts: [[-33.54570, -70.57550], [-33.54700, -70.57380]], numRange: [9700, 9890], sideOffset: 0.00004 },
    'los fiordos': { pts: [[-33.54600, -70.57510], [-33.54695, -70.57440]], numRange: [9700, 9860], sideOffset: 0.00004 },
    'mexico': { pts: [[-33.54300, -70.57385], [-33.54650, -70.57380]], numRange: [9580, 9850], sideOffset: 0.00004 },
    'golan': { pts: [[-33.54350, -70.57330], [-33.54600, -70.57280]], numRange: [9500, 9650], sideOffset: 0.00004 },
    'sinai': { pts: [[-33.54350, -70.57250], [-33.54680, -70.57180]], numRange: [9550, 9900], sideOffset: 0.00004 },
    'tripoli': { pts: [[-33.54690, -70.57150], [-33.54695, -70.57080]], numRange: [9800, 9870], sideOffset: 0.00003 },
    'rodas': { pts: [[-33.54645, -70.57180], [-33.54640, -70.57120]], numRange: [1180, 1310], sideOffset: 0.00003 },
    'atenas': { pts: [[-33.54545, -70.57310], [-33.54540, -70.57260]], numRange: [1220, 1290], sideOffset: 0.00003 },
    'chipre': { pts: [[-33.54515, -70.57340], [-33.54508, -70.57290]], numRange: [1200, 1260], sideOffset: 0.00003 },
    'grecia': { pts: [[-33.54480, -70.57360], [-33.54475, -70.57320]], numRange: [1240, 1270], sideOffset: 0.00003 },
    'albania': { pts: [[-33.54620, -70.57350], [-33.54618, -70.57290]], numRange: [1200, 1290], sideOffset: 0.00003 },
    'el cairo': { pts: [[-33.54665, -70.57360], [-33.54660, -70.57290]], numRange: [1190, 1260], sideOffset: 0.00003 },
    'malta': { pts: [[-33.54565, -70.57290], [-33.54560, -70.57220]], numRange: [1190, 1280], sideOffset: 0.00003 },
    'las vertientes': { pts: [[-33.54650, -70.57650], [-33.54630, -70.57350]], numRange: [950, 1100], sideOffset: 0.00003 },
    'malvania': { pts: [[-33.54580, -70.57280], [-33.54578, -70.57230]], numRange: [1240, 1280], sideOffset: 0.00003 },
    'palermo': { pts: [[-33.54470, -70.60150], [-33.54473, -70.60000]], numRange: [9800, 9950], sideOffset: 0.00003 },
    'tineo': { pts: [[-33.54350, -70.57855], [-33.54680, -70.57848]], numRange: [9510, 9720], sideOffset: 0.00004 },
    'santa marta': { pts: [[-33.54345, -70.58085], [-33.54685, -70.58075]], numRange: [9520, 9900], sideOffset: 0.00004 },
    'magdalena': { pts: [[-33.54350, -70.58205], [-33.54680, -70.58195]], numRange: [9520, 9850], sideOffset: 0.00004 },
    'colombia': { pts: [[-33.54340, -70.58685], [-33.54685, -70.58675]], numRange: [9540, 9820], sideOffset: 0.00005 },
    'cali': { pts: [[-33.54550, -70.57860], [-33.54552, -70.58320]], numRange: [500, 710], sideOffset: 0.00004 },
    'barranquilla': { pts: [[-33.54492, -70.57950], [-33.54495, -70.58320]], numRange: [550, 710], sideOffset: 0.00004 },
    'santa fe': { pts: [[-33.54445, -70.57950], [-33.54448, -70.58320]], numRange: [550, 700], sideOffset: 0.00004 },
    'narino': { pts: [[-33.54645, -70.57920], [-33.54648, -70.58300]], numRange: [500, 680], sideOffset: 0.00004 },
    'trinidad oriente': { pts: [[-33.54685, -70.57850], [-33.54692, -70.58650]], numRange: [410, 720], sideOffset: 0.00005 },
    'ramon freire': { pts: [[-33.54520, -70.59750], [-33.54950, -70.59740]], numRange: [9740, 10080], sideOffset: 0.00004 },
    'parinacota': { pts: [[-33.54680, -70.60150], [-33.54960, -70.60140]], numRange: [10010, 10280], sideOffset: 0.00004 },
    'socoroma': { pts: [[-33.54680, -70.60240], [-33.54960, -70.60230]], numRange: [10000, 10280], sideOffset: 0.00004 },
    'santa dolores': { pts: [[-33.54760, -70.60215], [-33.54910, -70.60210]], numRange: [10090, 10180], sideOffset: 0.00004 },
    'las nieves': { pts: [[-33.54680, -70.60060], [-33.54950, -70.60050]], numRange: [10000, 10280], sideOffset: 0.00004 }
  };

  function interpolateAlongStreet(calleName, numStr) {
    if (!calleName) return null;
    let clean = normalizeStreetKey(calleName).replace(/^pasaje\s+|^av\s+/i, '');
    clean = clean.replace(/marquez/g, 'marques');
    let model = STREET_MODELS[clean];
    if (!model) {
      for (const k in STREET_MODELS) {
        if (clean.includes(k) || k.includes(clean)) {
          model = STREET_MODELS[k];
          break;
        }
      }
    }

    if (model) {
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

    // Si no tiene modelo poligonal, buscar en las coordenadas base conocidas de La Florida
    for (const [k, v] of Object.entries(STREET_COORDS)) {
      if (clean.includes(k) || k.includes(clean)) {
        let n = parseInt(String(numStr || '').replace(/\D/g, ''), 10);
        if (isNaN(n) || n === 0) n = 1;
        const h = String(n).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
        const offLat = ((h % 50) - 25) * 0.00002;
        const offLng = (((h * 3) % 50) - 25) * 0.00002;
        return {
          lat: Number((v.lat + offLat).toFixed(6)),
          lng: Number((v.lng + offLng).toFixed(6))
        };
      }
    }

    return null;
  }

  // ================= SINCRONIZACIÓN GOOGLE SHEETS =================
  // Sincronización automática directa con Google Sheets
  function autoSyncGoogleSheets(isManual = false) {
    const url = CONFIG.sheetsUrl;
    const icon = document.getElementById('syncIcon');
    const mobileIcon = document.getElementById('mobileSyncIcon');
    if (icon) icon.style.animation = 'spin 1s linear infinite';
    if (mobileIcon) mobileIcon.style.animation = 'spin 1s linear infinite';
    if (isManual) showToast('Conectando en vivo con Google Sheets...', 'info');

    Papa.parse(url, {
      download: true,
      header: false,
      skipEmptyLines: true,
      complete: function (results) {
        if (icon) icon.style.animation = '';
        if (mobileIcon) mobileIcon.style.animation = '';
        if (results && results.data && results.data.length > 0) {
          processImportedRowsFlexible(results.data, 'Google Sheets (En Vivo)');
          if (isManual) {
            showToast('✅ Mapa actualizado en vivo desde Google Sheets.', 'success');
          }
        }
      },
      error: function (err) {
        if (icon) icon.style.animation = '';
        if (mobileIcon) mobileIcon.style.animation = '';
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
      // 1. Coincidencia exacta de nombre de columna
      for (const c of candidates) {
        const idx = headers.findIndex(h => h === c);
        if (idx !== -1) return idx;
      }
      // 2. Coincidencia por subcadena, omitiendo encabezados largos (> 35 caracteres) como títulos combinados
      for (const c of candidates) {
        const idx = headers.findIndex(h => h.length <= 35 && h.includes(c));
        if (idx !== -1) return idx;
      }
      return -1;
    };

    let colDir = findCol(['direccion', 'calle', 'domicilio']);
    let colNum = findCol(['n° casa', 'no casa', 'numero', 'nro', 'casa']);
    let colResp = findCol(['respuesta', 'estado', 'resultado', 'condicion']);
    let colFolio = findCol(['folio', 'mandato']);
    let colVol = findCol(['voluntario', 'escuadra', 'bombero']);
    let colFecha = findCol(['ultima visita', 'fecha', 'timestamp', 'dia']);
    let colProx = findCol(['proxima visita', 'proxima']);
    let colObs = findCol(['observaciones', 'observacion', 'notas', 'nota']);
    let colMonto = findCol(['monto', 'aporte', 'valor', 'cuota', 'monto aporte', 'donacion', 'total']);
    const colLat = findCol(['latitud', 'lat']);
    const colLng = findCol(['longitud', 'lng', 'lon']);

    // Fallback para Google Visualization API (gviz/tq), que borra los encabezados de texto
    // en columnas numéricas/fecha cuando hay un total numérico sobre la fila de encabezados (ej. 771.500 en J3)
    if (colDir === 1 && colResp === 4) {
      if (colNum === -1 && headers[2] === '') colNum = 2;
      if (colFecha === -1 && headers[3] === '') colFecha = 3;
      if (colFolio === -1 && headers[5] === '') colFolio = 5;
      if (colMonto === -1 && headers.length > 9 && headers[9] === '') colMonto = 9;
    }
    if (colMonto === -1 && colObs >= 0) {
      for (let c = colObs + 1; c < headers.length; c++) {
        if (!headers[c]) {
          colMonto = c;
          break;
        }
      }
    }

    // Función auxiliar para parsear montos en pesos chilenos ($ 5.000 -> 5000)
    function parseMonto(raw) {
      if (raw === null || raw === undefined) return 0;
      if (typeof raw === 'number') return isNaN(raw) ? 0 : Math.round(raw);
      const str = String(raw).trim();
      if (!str) return 0;
      const digitsOnly = str.replace(/[^0-9]/g, '');
      if (!digitsOnly) return 0;
      const num = parseInt(digitsOnly, 10);
      return isNaN(num) ? 0 : num;
    }

    const newRecords = [];

    for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
      const row = rawRows[r];
      if (!row || row.length === 0) continue;

      // 1. Omitir filas completamente vacías o compuestas sólo por espacios
      const isEntirelyBlank = row.every(cell => !cell || String(cell).trim() === '');
      if (isEntirelyBlank) continue;

      let calle = colDir >= 0 && row[colDir] ? String(row[colDir]).trim() : '';
      let numero = colNum >= 0 && row[colNum] ? String(row[colNum]).trim() : '';
      const resp = colResp >= 0 && row[colResp] ? String(row[colResp]).trim() : '';
      const rawFolioCell = colFolio >= 0 && row[colFolio] ? String(row[colFolio]).trim() : '';
      const rowZeroDigits = row[0] ? String(row[0]).trim() : '';
      const folio = rawFolioCell || (/^\d+$/.test(rowZeroDigits) && Number(rowZeroDigits) >= 3000 ? rowZeroDigits : '');
      const vol = colVol >= 0 && row[colVol] ? String(row[colVol]).trim() : '10ª Compañía';
      const fecha = colFecha >= 0 && row[colFecha] ? String(row[colFecha]).trim() : '';
      const prox = colProx >= 0 && row[colProx] ? String(row[colProx]).trim() : '';
      const obs = colObs >= 0 && row[colObs] ? String(row[colObs]).trim() : '';
      const rawMonto = colMonto >= 0 && row[colMonto] !== undefined ? String(row[colMonto]).trim() : '';
      const parsedMonto = parseMonto(rawMonto);

      // Determinar Estado:
      // Si la respuesta dice "Socio" o si tiene un monto de aporte > 0 registrado (mandatos cuya
      // dirección está en blanco y la fórmula de Excel puso "No interesado" por defecto), es Socio Captado.
      let estado = 'No Estaba (Repasar)';
      let isSocio = false;
      if (/socio|ya es socio/i.test(resp) || parsedMonto > 0) {
        estado = 'Socio Captado';
        isSocio = true;
      } else if (/ausente|volver|repasar|nadie/i.test(resp)) {
        estado = 'No Estaba (Repasar)';
      } else if (/rechaz|no interesado|no quiere|negativ/i.test(resp)) {
        estado = 'Rechazado';
      } else if (folio) {
        estado = 'Socio Captado';
        isSocio = true;
      }

      // 2. Si no tiene calle ni número
      if (!calle && !numero) {
        // Si no es socio y no tiene folio, descartar fila sin dirección (evitar registros fantasma)
        if (!isSocio && !folio) {
          continue;
        }
        // Si es socio con folio registrado pero la dirección quedó pendiente:
        calle = 'Dirección Pendiente';
        numero = folio ? `Folio #${folio}` : '';
      }

      // 3. Monto real del aporte
      let monto = 0;
      if (isSocio) {
        monto = parsedMonto;
      }

      // Nombre y Dirección Completa
      const fullDir = numero ? `${calle} ${numero}`.trim() : calle;
      let nombre = `Casa ${fullDir}`;
      if (estado === 'Socio Captado') {
        nombre = folio ? `Socio Mandato #${folio}` : `Socio Cooperador (${fullDir})`;
      }

      // Coordenadas: Si vienen en la planilla, usarlas; sino, interpolar por trazado de calle
      let lat = colLat >= 0 && row[colLat] ? parseFloat(String(row[colLat]).replace(',', '.')) : null;
      let lng = colLng >= 0 && row[colLng] ? parseFloat(String(row[colLng]).replace(',', '.')) : null;

      if (!lat || !lng) {
        const coords = interpolateAlongStreet(calle, numero);
        if (coords) {
          lat = coords.lat;
          lng = coords.lng;
        } else if (calle && calle !== 'Dirección Pendiente') {
          // Fallback georreferenciador determinista en el cuadrante de la Décima
          const hash = (calle + (numero || '')).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
          const offsetLat = ((hash % 100) - 50) * 0.00004;
          const offsetLng = (((hash * 7) % 100) - 50) * 0.00004;
          lat = Number((-33.5450 + offsetLat).toFixed(6));
          lng = Number((-70.5735 + offsetLng).toFixed(6));
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
        sector: 'La Florida',
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
      populateStreetOptions();
      applyFilters();
      showToast(`¡Éxito! Se sincronizaron ${newRecords.length} casas de la 10ª Compañía desde ${sourceName}.`, 'success');
      checkMissingCoordinates();
    } else {
      showToast('No se pudieron leer registros válidos de la planilla.', 'warning');
    }
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

    const sector = 'La Florida';

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
    populateStreetOptions();
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
  function populateStreetOptions() {
    if (!DOM.filterCalle) return;
    const streetMap = new Map();

    state.records.forEach(r => {
      if (!r.calle || !r.calle.trim()) return;
      const key = normalizeStreetKey(r.calle);
      if (!streetMap.has(key)) {
        streetMap.set(key, {
          key: key,
          name: formatStreetName(r.calle),
          count: 0
        });
      }
      streetMap.get(key).count++;
    });

    const sorted = Array.from(streetMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));

    DOM.filterCalle.innerHTML = '<option value="all">📍 Todas las calles y pasajes</option>';
    sorted.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.key;
      opt.textContent = `${item.name} (${item.count} casas)`;
      DOM.filterCalle.appendChild(opt);
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
    // Sidebar toggle (desktop button)
    DOM.btnToggleSidebar.addEventListener('click', () => {
      DOM.appSidebar.classList.toggle('collapsed');
      const isCollapsed = DOM.appSidebar.classList.contains('collapsed');
      DOM.sidebarIcon.setAttribute('data-lucide', isCollapsed ? 'panel-left-open' : 'panel-left-close');
      refreshIcons();
      setTimeout(() => state.map && state.map.invalidateSize(), 300);
    });

    // Mobile Backdrop & Close Button
    if (DOM.sidebarBackdrop) {
      DOM.sidebarBackdrop.addEventListener('click', () => {
        DOM.appSidebar.classList.add('collapsed');
        if (DOM.sidebarIcon) DOM.sidebarIcon.setAttribute('data-lucide', 'panel-left-open');
        refreshIcons();
        setTimeout(() => state.map && state.map.invalidateSize(), 300);
      });
    }

    if (DOM.btnMobileCloseSidebar) {
      DOM.btnMobileCloseSidebar.addEventListener('click', () => {
        DOM.appSidebar.classList.add('collapsed');
        if (DOM.sidebarIcon) DOM.sidebarIcon.setAttribute('data-lucide', 'panel-left-open');
        refreshIcons();
        setTimeout(() => state.map && state.map.invalidateSize(), 300);
      });
    }

    // Mobile Bottom Navigation Bar Actions
    if (DOM.btnNavMap) {
      DOM.btnNavMap.addEventListener('click', () => {
        document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('active'));
        DOM.btnNavMap.classList.add('active');
        DOM.appSidebar.classList.add('collapsed');
        if (DOM.sidebarIcon) DOM.sidebarIcon.setAttribute('data-lucide', 'panel-left-open');
        refreshIcons();
        setTimeout(() => {
          if (state.map) {
            state.map.invalidateSize();
            state.map.flyTo(CONFIG.initialCenter, CONFIG.initialZoom, { duration: 0.8 });
          }
        }, 100);
      });
    }

    if (DOM.btnNavGps) {
      DOM.btnNavGps.addEventListener('click', () => {
        document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('active'));
        DOM.btnNavGps.classList.add('active');
        DOM.appSidebar.classList.add('collapsed');
        if (DOM.sidebarIcon) DOM.sidebarIcon.setAttribute('data-lucide', 'panel-left-open');
        refreshIcons();
        captureGpsLocation(false);
      });
    }

    if (DOM.btnNavSummary) {
      DOM.btnNavSummary.addEventListener('click', () => {
        document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('active'));
        DOM.btnNavSummary.classList.add('active');
        DOM.appSidebar.classList.toggle('collapsed');
        const isCollapsed = DOM.appSidebar.classList.contains('collapsed');
        if (DOM.sidebarIcon) DOM.sidebarIcon.setAttribute('data-lucide', isCollapsed ? 'panel-left-open' : 'panel-left-close');
        refreshIcons();
        setTimeout(() => state.map && state.map.invalidateSize(), 300);
      });
    }

    if (DOM.btnNavAdd) {
      DOM.btnNavAdd.addEventListener('click', () => {
        openModal('modalNewRecord');
      });
    }

    if (DOM.btnNavSync) {
      DOM.btnNavSync.addEventListener('click', () => {
        autoSyncGoogleSheets(true);
      });
    }

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

    if (DOM.filterCalle) {
      DOM.filterCalle.addEventListener('change', (e) => {
        state.filters.calle = e.target.value;
        if (state.filters.calle !== 'all') {
          // Centrar mapa en las casas de la calle seleccionada
          const streetRecords = state.records.filter(r => r.calle && normalizeStreetKey(r.calle) === state.filters.calle && r.lat && r.lng);
          if (streetRecords.length > 0) {
            const group = L.featureGroup(streetRecords.map(r => L.marker([r.lat, r.lng])));
            state.map.fitBounds(group.getBounds().pad(0.2), { maxZoom: 17, duration: 1 });
          }
        }
        applyFilters();
      });
    }

    DOM.filterSquad.addEventListener('change', (e) => {
      state.filters.squad = e.target.value;
      applyFilters();
    });

    DOM.btnResetFilters.addEventListener('click', () => {
      DOM.filterSearch.value = '';
      if (DOM.filterCalle) DOM.filterCalle.value = 'all';
      DOM.filterSquad.value = 'all';
      document.querySelectorAll('#statusFilterPills .pill-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('#statusFilterPills .pill-btn[data-status="all"]').classList.add('active');

      state.filters = { search: '', status: 'all', calle: 'all', squad: 'all' };
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
