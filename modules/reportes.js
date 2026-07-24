/* ============================================================
   SISTEMA COMERCIAL CASABE REAL
   modules/reportes.js — Módulo de Reportes
   v1.0.0
   ============================================================

   Responsabilidades:
   1.  Reporte diario, semanal, mensual y anual
   2.  KPIs del período seleccionado
   3.  Gráficos comparativos multi-período
   4.  Tablas de detalle exportables
   5.  Exportar a CSV y PDF (impresión)

   Escucha: sccr:activar-reportes
   Depende de: utils.js, motor.js, Chart.js
   ============================================================ */

'use strict';

window.SCCR = window.SCCR || {};

const ModuloReportes = (() => {

  /* ----------------------------------------------------------
     ESTADO
     ---------------------------------------------------------- */
  let _tipo    = 'mensual';  /* diario | semanal | mensual | anual */
  let _graficos = {};

  /* ----------------------------------------------------------
     LISTENER
     ---------------------------------------------------------- */
  document.addEventListener('sccr:activar-reportes', onActivar);


  /* ==========================================================
     1. ACTIVACIÓN
     ========================================================== */
  function onActivar() {
    if (!SCCR.Motor?.estaListo()) {
      document.getElementById('view-reportes').innerHTML =
        SCCR.UI.vacio({ titulo: 'Cargando reportes…', icono: 'loader' });
      return;
    }
    render();
  }


  /* ==========================================================
     2. RENDER PRINCIPAL
     ========================================================== */
  function render() {
    const view = document.getElementById('view-reportes');
    if (!view) return;

    SCCR.Log?.info('Reportes', `Renderizando — tipo: ${_tipo}`);

    view.innerHTML = `

      <!-- Header -->
      <div class="page-header flex items-center justify-between">
        <div>
          <h1 class="page-title">Reportes</h1>
          <p class="page-subtitle">Informes comerciales por período</p>
        </div>
        <div class="flex gap-3">
          <button class="btn btn-secondary" id="rep-btn-csv">
            <i data-lucide="file-spreadsheet" style="width:15px;height:15px;"></i>
            Exportar CSV
          </button>
          <button class="btn btn-secondary" id="rep-btn-pdf">
            <i data-lucide="printer" style="width:15px;height:15px;"></i>
            Imprimir PDF
          </button>
        </div>
      </div>

      <!-- Selector de tipo de reporte -->
      <div class="filter-bar mb-5">
        <span class="filter-bar__label">Reporte</span>
        ${['diario','semanal','mensual','anual'].map(t => `
          <button class="btn btn-sm ${t === _tipo ? 'btn-primary' : 'btn-secondary'}"
            data-tipo="${t}" id="rep-btn-tipo-${t}">
            ${labelTipo(t)}
          </button>`).join('')}
        <div class="filter-bar__spacer"></div>
        <span class="text-sm text-secondary" id="rep-periodo-label"></span>
      </div>

      <!-- KPIs del período -->
      <div class="grid grid-4 mb-5" id="rep-kpis"></div>

      <!-- Gráficos -->
      <div class="grid grid-2 mb-5" style="gap:var(--space-5);">

        <div class="chart-container">
          <div class="chart-container__header">
            <span class="chart-container__title" id="rep-chart1-titulo">Evolución de ventas</span>
          </div>
          <div class="chart-container__body" style="min-height:280px;">
            <canvas id="rep-chart-ventas"></canvas>
          </div>
        </div>

        <div class="chart-container">
          <div class="chart-container__header">
            <span class="chart-container__title">Distribución por vendedor</span>
          </div>
          <div class="chart-container__body" style="min-height:280px;">
            <canvas id="rep-chart-vendedores"></canvas>
          </div>
        </div>

      </div>

      <!-- Segunda fila de gráficos -->
      <div class="grid grid-2 mb-5" style="gap:var(--space-5);">

        <div class="chart-container">
          <div class="chart-container__header">
            <span class="chart-container__title">Top productos</span>
          </div>
          <div class="chart-container__body" style="min-height:260px;">
            <canvas id="rep-chart-productos"></canvas>
          </div>
        </div>

        <div class="chart-container">
          <div class="chart-container__header">
            <span class="chart-container__title">Nuevos vs. Recurrentes</span>
          </div>
          <div class="chart-container__body" style="min-height:260px;">
            <canvas id="rep-chart-tipos"></canvas>
          </div>
        </div>

      </div>

      <!-- Tabla detallada -->
      <div class="card mb-5">
        <div class="card__header">
          <span class="card__title" id="rep-tabla-titulo">Detalle de pedidos</span>
          <span class="text-xs text-secondary" id="rep-tabla-subtitulo"></span>
        </div>
        <div class="card__body p-4" id="rep-tabla"></div>
      </div>

      <!-- Comparativo con período anterior -->
      <div class="card">
        <div class="card__header">
          <span class="card__title">Comparativo vs período anterior</span>
        </div>
        <div class="card__body" id="rep-comparativo"></div>
      </div>

    `;

    renderKPIs();
    renderGraficos();
    renderTabla();
    renderComparativo();
    bindEventos();
    lucide.createIcons();
  }


  /* ==========================================================
     3. KPIs DEL PERÍODO
     ========================================================== */
  function renderKPIs() {
    const el    = document.getElementById('rep-kpis');
    const lbl   = document.getElementById('rep-periodo-label');
    if (!el) return;

    const periodo  = tipoPeriodo();
    const pedidos  = SCCR.Motor.filtrarPorPeriodo(periodo);
    const ventas   = pedidos.reduce((s, p) => s + p.total, 0);
    const cajas    = pedidos.reduce((s, p) => s + p.cantidad_items, 0);
    const clientes = new Set(pedidos.map(p => SCCR.Texto.normalizar(p.establecimiento))).size;
    const ticket   = pedidos.length > 0
      ? SCCR.Numero.redondear(ventas / pedidos.length, 2) : 0;
    const nuevos   = pedidos.filter(p => p.es_nuevo_cliente).length;

    if (lbl) lbl.textContent = labelPeriodoActual();

    el.innerHTML = [
      {
        label:    'Ventas totales',
        valor:    SCCR.Numero.moneda(ventas),
        icono:    'dollar-sign',
        primario: true,
        periodo:  labelTipo(_tipo),
      },
      {
        label:   'Pedidos',
        valor:   SCCR.Numero.formato(pedidos.length),
        icono:   'shopping-cart',
        periodo: `${clientes} clientes`,
      },
      {
        label:   'Unidades',
        valor:   SCCR.Numero.formato(cajas),
        icono:   'package',
        periodo: `${nuevos} nuevos clientes`,
      },
      {
        label:   'Ticket promedio',
        valor:   SCCR.Numero.moneda(ticket),
        icono:   'receipt',
        periodo: 'Por pedido',
      },
    ].map(t => SCCR.UI.kpiHTML(t)).join('');
  }


  /* ==========================================================
     4. GRÁFICOS
     ========================================================== */
  function renderGraficos() {
    destruirGraficos();
    renderGraficoVentas();
    renderGraficoVendedores();
    renderGraficoProductos();
    renderGraficoTipos();
  }

  function destruirGraficos() {
    Object.values(_graficos).forEach(g => { try { g.destroy(); } catch (_) {} });
    _graficos = {};
  }

  /* ── 4.1 Evolución de ventas ── */
  function renderGraficoVentas() {
    const canvas = document.getElementById('rep-chart-ventas');
    const titulo = document.getElementById('rep-chart1-titulo');
    if (!canvas) return;

    const periodo = tipoPeriodo();
    const { labels, datos } = SCCR.Motor.serieVentas(
      periodo === 'hoy' ? 'semana' : periodo === 'todo' ? 'ano' : periodo
    );

    if (titulo) titulo.textContent =
      _tipo === 'diario'   ? 'Ventas esta semana' :
      _tipo === 'semanal'  ? 'Ventas por día' :
      _tipo === 'mensual'  ? 'Ventas por semana' :
      'Ventas por mes';

    _graficos.ventas = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label:                'Ventas (USD)',
          data:                 datos,
          borderColor:          '#D71920',
          backgroundColor:      'rgba(215,25,32,0.07)',
          borderWidth:          2.5,
          pointBackgroundColor: '#D71920',
          pointBorderColor:     '#fff',
          pointBorderWidth:     2,
          pointRadius:          4,
          pointHoverRadius:     6,
          fill:                 true,
          tension:              0.4,
        }],
      },
      options: opcionesLinea(),
    });
  }

  /* ── 4.2 Distribución por vendedor ── */
  function renderGraficoVendedores() {
    const canvas = document.getElementById('rep-chart-vendedores');
    if (!canvas) return;

    const periodo = tipoPeriodo();
    const ranking = SCCR.Motor.rankingVendedores(periodo);

    if (ranking.length === 0) {
      canvas.parentElement.innerHTML = SCCR.UI.vacio({ titulo: 'Sin datos', icono: 'user-check' });
      return;
    }

    const PALETA = ['#D71920','#2D3436','#F1C40F','#F39C12','#7F8C8D','#B2BEC3'];

    _graficos.vendedores = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels:   ranking.map(v => nombreCorto(v.vendedor)),
        datasets: [{
          data:            ranking.map(v => v.ventas),
          backgroundColor: ranking.map((_, i) => PALETA[i % PALETA.length]),
          borderColor:     '#fff',
          borderWidth:     3,
          hoverOffset:     6,
        }],
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              font:      { family: 'Montserrat', size: 11 },
              color:     '#7F8C8D',
              boxWidth:  12,
              padding:   14,
            },
          },
          tooltip: {
            backgroundColor: '#2D3436',
            titleColor:      '#fff',
            bodyColor:       '#B2BEC3',
            padding:         12,
            cornerRadius:    8,
            callbacks: {
              label: ctx => {
                const total = ctx.dataset.data.reduce((s, v) => s + v, 0);
                const pct   = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0;
                return ` ${SCCR.Numero.moneda(ctx.raw)} (${pct}%)`;
              },
            },
          },
        },
      },
    });
  }

  /* ── 4.3 Top productos ── */
  function renderGraficoProductos() {
    const canvas = document.getElementById('rep-chart-productos');
    if (!canvas) return;

    const periodo = tipoPeriodo();
    const { labels, datos } = SCCR.Motor.serieProductos(periodo);

    if (datos.length === 0) {
      canvas.parentElement.innerHTML = SCCR.UI.vacio({ titulo: 'Sin datos de productos', icono: 'package' });
      return;
    }

    const PALETA = ['#D71920','#2D3436','#F1C40F','#F39C12','#7F8C8D',
                    '#B2BEC3','#636E72','#DFE6E9'];

    _graficos.productos = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label:           'Ventas (USD)',
          data:            datos,
          backgroundColor: labels.map((_, i) => PALETA[i % PALETA.length]),
          borderRadius:    5,
          borderSkipped:   false,
        }],
      },
      options: {
        indexAxis:           'y',
        responsive:          true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#2D3436',
            titleColor:      '#fff',
            bodyColor:       '#B2BEC3',
            padding:         10,
            cornerRadius:    8,
            callbacks: { label: ctx => ` ${SCCR.Numero.moneda(ctx.raw)}` },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            grid:        { color: '#F0F2F5', drawBorder: false },
            ticks: {
              color:    '#7F8C8D',
              font:     { family: 'Montserrat', size: 10 },
              callback: v => SCCR.Numero.compacto(v),
            },
          },
          y: {
            grid:  { display: false },
            ticks: { color: '#7F8C8D', font: { family: 'Montserrat', size: 11 } },
          },
        },
      },
    });
  }

  /* ── 4.4 Nuevos vs Recurrentes ── */
  function renderGraficoTipos() {
    const canvas = document.getElementById('rep-chart-tipos');
    if (!canvas) return;

    const periodo    = tipoPeriodo();
    const pedidos    = SCCR.Motor.filtrarPorPeriodo(periodo);
    const nuevos     = pedidos.filter(p => p.es_nuevo_cliente);
    const recurrentes = pedidos.filter(p => !p.es_nuevo_cliente);

    const ventasNuevos     = nuevos.reduce((s, p) => s + p.total, 0);
    const ventasRecurrentes = recurrentes.reduce((s, p) => s + p.total, 0);

    _graficos.tipos = new Chart(canvas, {
      type: 'pie',
      data: {
        labels:   ['Recurrentes','Nuevos clientes'],
        datasets: [{
          data:            [ventasRecurrentes, ventasNuevos],
          backgroundColor: ['#D71920', '#2D3436'],
          borderColor:     '#fff',
          borderWidth:     3,
          hoverOffset:     6,
        }],
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { font: { family: 'Montserrat', size: 11 }, color: '#7F8C8D', boxWidth: 12, padding: 14 },
          },
          tooltip: {
            backgroundColor: '#2D3436',
            titleColor:      '#fff',
            bodyColor:       '#B2BEC3',
            padding:         12,
            cornerRadius:    8,
            callbacks: {
              label: ctx => {
                const total = ctx.dataset.data.reduce((s, v) => s + v, 0);
                const pct   = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0;
                return ` ${SCCR.Numero.moneda(ctx.raw)} — ${pct}%`;
              },
              afterLabel: ctx => {
                const counts = [recurrentes.length, nuevos.length];
                return ` ${counts[ctx.dataIndex]} pedidos`;
              },
            },
          },
        },
      },
    });
  }


  /* ==========================================================
     5. TABLA DETALLADA
     ========================================================== */
  function renderTabla() {
    const el  = document.getElementById('rep-tabla');
    const tit = document.getElementById('rep-tabla-titulo');
    const sub = document.getElementById('rep-tabla-subtitulo');
    if (!el) return;

    const periodo = tipoPeriodo();
    const pedidos = SCCR.Coleccion.ordenar(
      SCCR.Motor.filtrarPorPeriodo(periodo), 'fecha', 'desc'
    );

    if (tit) tit.textContent = `Detalle de pedidos — ${labelTipo(_tipo)}`;
    if (sub) sub.textContent = `${pedidos.length} pedidos`;

    if (pedidos.length === 0) {
      el.innerHTML = SCCR.UI.vacio({
        titulo:      'Sin pedidos en este período',
        descripcion: 'Selecciona otro tipo de reporte o registra pedidos.',
        icono:       'file-text',
      });
      return;
    }

    /* Mostrar max 50 filas en pantalla */
    const muestra = pedidos.slice(0, 50);

    el.innerHTML = `
      <div class="table-wrap" style="max-height:480px;overflow-y:auto;">
        <table class="table" id="rep-tabla-pedidos">
          <thead style="position:sticky;top:0;z-index:1;">
            <tr>
              <th>Fecha</th>
              <th>Cliente</th>
              <th>Vendedor</th>
              <th>Productos</th>
              <th style="text-align:center;">Uds.</th>
              <th style="text-align:right;">Total</th>
              <th>Tipo</th>
            </tr>
          </thead>
          <tbody>
            ${muestra.map(p => `
              <tr>
                <td style="white-space:nowrap;">
                  <div class="font-medium" style="font-size:13px;">${SCCR.Fecha.format(p.fecha)}</div>
                  <div class="text-xs text-secondary">${SCCR.Fecha.relativo(p.fecha)}</div>
                </td>
                <td>
                  <div class="font-medium" style="font-size:13px;max-width:140px;" class="truncate">
                    ${SCCR.Texto.escaparHTML(p.establecimiento)}
                  </div>
                  ${p.rif ? `<div class="text-xs text-secondary">${SCCR.Texto.escaparHTML(p.rif)}</div>` : ''}
                </td>
                <td style="font-size:13px;">${SCCR.Texto.escaparHTML(p.vendedor)}</td>
                <td class="text-sm text-secondary">
                  ${p.productos.length > 0
                    ? p.productos.slice(0,2).map(pr =>
                        `${SCCR.Texto.truncar(pr.producto,18)} x${pr.cantidad}`
                      ).join(', ') + (p.productos.length > 2 ? ` +${p.productos.length-2}` : '')
                    : SCCR.Texto.truncar(p.productos_texto || '—', 35)}
                </td>
                <td style="text-align:center;" class="font-medium">${p.cantidad_items}</td>
                <td style="text-align:right;" class="font-semibold white-space:nowrap;">
                  ${SCCR.Numero.moneda(p.total)}
                </td>
                <td>
                  ${p.es_nuevo_cliente
                    ? SCCR.UI.badge('Nuevo','new')
                    : SCCR.UI.badge('Rec.','active')}
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${pedidos.length > 50
        ? `<div class="card__footer text-center text-secondary text-sm">
             Mostrando 50 de ${pedidos.length} pedidos — exporta a CSV para ver todos.
           </div>` : ''}`;
  }


  /* ==========================================================
     6. COMPARATIVO VS PERÍODO ANTERIOR
     ========================================================== */
  function renderComparativo() {
    const el = document.getElementById('rep-comparativo');
    if (!el) return;

    const periodo   = tipoPeriodo();
    const actual    = SCCR.Motor.filtrarPorPeriodo(periodo);
    const anterior  = pedidosPeriodoAnterior();

    const ventasAct  = actual.reduce((s, p) => s + p.total, 0);
    const ventasAnt  = anterior.reduce((s, p) => s + p.total, 0);
    const delta      = SCCR.Numero.variacion(ventasAnt, ventasAct);

    const pedidosAct = actual.length;
    const pedidosAnt = anterior.length;
    const deltaP     = SCCR.Numero.variacion(pedidosAnt, pedidosAct);

    const cajasAct   = actual.reduce((s, p) => s + p.cantidad_items, 0);
    const cajasAnt   = anterior.reduce((s, p) => s + p.cantidad_items, 0);
    const deltaC     = SCCR.Numero.variacion(cajasAnt, cajasAct);

    const cliAct     = new Set(actual.map(p => SCCR.Texto.normalizar(p.establecimiento))).size;
    const cliAnt     = new Set(anterior.map(p => SCCR.Texto.normalizar(p.establecimiento))).size;
    const deltaCli   = SCCR.Numero.variacion(cliAnt, cliAct);

    const filas = [
      { label: 'Ventas',   actual: SCCR.Numero.moneda(ventasAct),   anterior: SCCR.Numero.moneda(ventasAnt),   delta },
      { label: 'Pedidos',  actual: pedidosAct,                       anterior: pedidosAnt,                       delta: deltaP },
      { label: 'Unidades', actual: cajasAct,                         anterior: cajasAnt,                         delta: deltaC },
      { label: 'Clientes', actual: cliAct,                           anterior: cliAnt,                           delta: deltaCli },
    ];

    el.innerHTML = `
      <table class="table">
        <thead>
          <tr>
            <th>Métrica</th>
            <th style="text-align:right;">${labelTipo(_tipo)} actual</th>
            <th style="text-align:right;">${labelTipo(_tipo)} anterior</th>
            <th style="text-align:center;">Variación</th>
          </tr>
        </thead>
        <tbody>
          ${filas.map(f => `
            <tr>
              <td class="font-medium">${f.label}</td>
              <td style="text-align:right;" class="font-semibold">${f.actual}</td>
              <td style="text-align:right;" class="text-secondary">${f.anterior}</td>
              <td style="text-align:center;">
                <span class="${SCCR.UI.claseDelta(f.delta.signo)}" style="font-size:13px;">
                  ${f.delta.texto}
                </span>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }


  /* ==========================================================
     7. EXPORTAR CSV
     ========================================================== */
  function exportarCSV() {
    const periodo = tipoPeriodo();
    const filas   = SCCR.Motor.exportar(periodo);

    if (filas.length === 0) { SCCR.toast?.('Sin datos para exportar', 'warning'); return; }

    const cols = Object.keys(filas[0]);
    const csv  = [
      cols.join(';'),
      ...filas.map(f =>
        cols.map(k => `"${String(f[k] ?? '').replace(/"/g,'""')}"`).join(';')
      ),
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `reporte_${_tipo}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    SCCR.toast?.(`${filas.length} registros exportados`, 'success');
  }


  /* ==========================================================
     8. IMPRIMIR / PDF
     ========================================================== */
  function imprimirPDF() {
    SCCR.toast?.('Preparando impresión…', 'success', 2000);
    setTimeout(() => window.print(), 500);
  }


  /* ==========================================================
     9. EVENTOS
     ========================================================== */
  function bindEventos() {
    ['diario','semanal','mensual','anual'].forEach(t => {
      const btn = document.getElementById(`rep-btn-tipo-${t}`);
      if (btn && !btn.dataset.bound) {
        btn.dataset.bound = 'true';
        btn.addEventListener('click', () => { _tipo = t; render(); });
      }
    });

    document.getElementById('rep-btn-csv')?.addEventListener('click', exportarCSV);
    document.getElementById('rep-btn-pdf')?.addEventListener('click', imprimirPDF);
  }


  /* ==========================================================
     HELPERS
     ========================================================== */

  /* Mapea tipo de reporte → período del Motor */
  function tipoPeriodo() {
    return { diario: 'hoy', semanal: 'semana', mensual: 'mes', anual: 'ano' }[_tipo] || 'mes';
  }

  function labelTipo(t) {
    return { diario: 'Diario', semanal: 'Semanal', mensual: 'Mensual', anual: 'Anual' }[t] || t;
  }

  function labelPeriodoActual() {
    const hoy = new Date();
    if (_tipo === 'diario')   return SCCR.Fecha.format(hoy, 'largo');
    if (_tipo === 'semanal') {
      const r = SCCR.Fecha.rango('semana');
      return `${SCCR.Fecha.format(r.desde, 'diames')} – ${SCCR.Fecha.format(r.hasta, 'diames')}`;
    }
    if (_tipo === 'mensual')  return SCCR.Fecha.format(hoy, 'mes');
    return String(hoy.getFullYear());
  }

  /* Pedidos del mismo período pero del ciclo anterior */
  function pedidosPeriodoAnterior() {
    const hoy = new Date();
    let desde, hasta;

    if (_tipo === 'diario') {
      desde = new Date(hoy); desde.setDate(hoy.getDate() - 1); desde.setHours(0,0,0,0);
      hasta = new Date(desde); hasta.setHours(23,59,59,999);

    } else if (_tipo === 'semanal') {
      const dia = hoy.getDay() === 0 ? 6 : hoy.getDay() - 1;
      hasta = new Date(hoy); hasta.setDate(hoy.getDate() - dia - 1); hasta.setHours(23,59,59,999);
      desde = new Date(hasta); desde.setDate(hasta.getDate() - 6); desde.setHours(0,0,0,0);

    } else if (_tipo === 'mensual') {
      desde = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
      hasta = new Date(hoy.getFullYear(), hoy.getMonth(), 0, 23, 59, 59, 999);

    } else {
      desde = new Date(hoy.getFullYear() - 1, 0, 1);
      hasta = new Date(hoy.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
    }

    return SCCR.Motor.pedidos().filter(p => {
      const f = new Date(p.fecha + 'T00:00:00');
      return f >= desde && f <= hasta;
    });
  }

  function nombreCorto(nombre) {
    const p = nombre.trim().split(/\s+/);
    return p.length > 1 ? `${p[0]} ${p[1][0]}.` : p[0];
  }

  /* Opciones base Chart.js para gráfico de línea */
  function opcionesLinea() {
    return {
      responsive:          true,
      maintainAspectRatio: false,
      interaction:         { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#2D3436',
          titleColor:      '#fff',
          bodyColor:       '#B2BEC3',
          padding:         12,
          cornerRadius:    8,
          callbacks: { label: ctx => ` ${SCCR.Numero.moneda(ctx.raw)}` },
        },
      },
      scales: {
        x: {
          grid:  { display: false },
          ticks: { color: '#7F8C8D', font: { family: 'Montserrat', size: 11 } },
        },
        y: {
          beginAtZero: true,
          grid:        { color: '#F0F2F5', drawBorder: false },
          ticks: {
            color:    '#7F8C8D',
            font:     { family: 'Montserrat', size: 11 },
            callback: v => SCCR.Numero.compacto(v),
          },
        },
      },
    };
  }


  /* ==========================================================
     API PÚBLICA
     ========================================================== */
  return { render };

})();

window.SCCR.ModuloReportes = ModuloReportes;
window.ModuloReportes       = ModuloReportes;
