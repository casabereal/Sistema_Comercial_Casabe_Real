/* ============================================================
   SISTEMA COMERCIAL CASABE REAL
   modules/metas.js — Módulo de Metas
   v1.0.0
   ============================================================

   Responsabilidades:
   1.  Configurar y visualizar metas por vendedor
   2.  Meta global mensual del equipo
   3.  Cumplimiento en tiempo real vs. meta
   4.  Proyección de cierre vs. meta
   5.  Historial de metas por mes
   6.  Persistencia en data/metas.json (localStorage como fallback)

   Escucha: sccr:activar-metas
   Depende de: utils.js, motor.js, Chart.js
   ============================================================ */

'use strict';

window.SCCR = window.SCCR || {};

const ModuloMetas = (() => {

  /* ----------------------------------------------------------
     ESTADO
     ---------------------------------------------------------- */
  let _metas   = {};   /* { vendedor: { meta_mensual, meta_cajas } } */
  let _metaGlobal = 0; /* meta mensual total del equipo */
  let _grafico    = null;

  /* ----------------------------------------------------------
     LISTENER
     ---------------------------------------------------------- */
  document.addEventListener('sccr:activar-metas', onActivar);


  /* ==========================================================
     1. ACTIVACIÓN
     ========================================================== */
  function onActivar() {
    if (!SCCR.Motor?.estaListo()) {
      document.getElementById('view-metas').innerHTML =
        SCCR.UI.vacio({ titulo: 'Cargando metas…', icono: 'loader' });
      return;
    }
    cargarMetas().then(render);
  }


  /* ==========================================================
     2. CARGA DE METAS
     ========================================================== */
  async function cargarMetas() {
    /* 1️⃣ localStorage (overrides locales) */
    const override = SCCR.Store.get('metas_override');
    if (override) { _metas = override; }

    /* 2️⃣ data/metas.json */
    try {
      const res = await fetch('data/metas.json');
      if (res.ok) {
        const data = await res.json();
        const arr  = Array.isArray(data) ? data : Object.values(data);
        arr.forEach(m => {
          if (m.vendedor && !_metas[m.vendedor]) {
            _metas[m.vendedor] = m;
          }
        });
      }
    } catch (_) { /* archivo vacío o no existe */ }

    /* Meta global = suma de metas individuales */
    _metaGlobal = Object.values(_metas)
      .reduce((s, m) => s + (m.meta_mensual || 0), 0);

    /* Sincronizar con el Motor */
    Object.entries(_metas).forEach(([v, m]) => {
      SCCR.Motor.guardarMeta(v, m.meta_mensual || 0);
    });
  }

  function guardarMetas() {
    SCCR.Store.set('metas_override', _metas);
    /* Sincronizar con Motor */
    Object.entries(_metas).forEach(([v, m]) => {
      SCCR.Motor.guardarMeta(v, m.meta_mensual || 0);
    });
    _metaGlobal = Object.values(_metas).reduce((s, m) => s + (m.meta_mensual || 0), 0);
  }


  /* ==========================================================
     3. RENDER PRINCIPAL
     ========================================================== */
  function render() {
    const view = document.getElementById('view-metas');
    if (!view) return;

    SCCR.Log?.info('Metas', 'Renderizando módulo');

    const kpis    = SCCR.Motor.calcularKPIs();
    const ranking = SCCR.Motor.cumplimientoPorVendedor();
    const vendedores = [...new Set(SCCR.Motor.pedidos().map(p => p.vendedor))].sort();

    view.innerHTML = `

      <!-- Header -->
      <div class="page-header flex items-center justify-between">
        <div>
          <h1 class="page-title">Metas</h1>
          <p class="page-subtitle">Administración de objetivos comerciales</p>
        </div>
        <div class="flex gap-3">
          <button class="btn btn-secondary" id="meta-btn-csv">
            <i data-lucide="file-spreadsheet" style="width:15px;height:15px;"></i>
            Exportar
          </button>
          <button class="btn btn-primary" id="meta-btn-nueva">
            <i data-lucide="plus" style="width:15px;height:15px;"></i>
            Nueva meta
          </button>
        </div>
      </div>

      <!-- KPIs globales -->
      <div class="grid grid-4 mb-5" id="meta-kpis"></div>

      <!-- Panel principal: gráfico + configuración -->
      <div class="grid grid-2 mb-5" style="gap:var(--space-5);">

        <!-- Gráfico de termómetro de cumplimiento -->
        <div class="chart-container">
          <div class="chart-container__header">
            <span class="chart-container__title">Cumplimiento por vendedor</span>
            <span class="text-xs text-secondary">${SCCR.Fecha.mesActual()}</span>
          </div>
          <div class="chart-container__body" style="min-height:300px;">
            <canvas id="meta-chart-cumpl"></canvas>
          </div>
        </div>

        <!-- Meta global del equipo -->
        <div class="card">
          <div class="card__header">
            <span class="card__title">Meta del equipo</span>
            <button class="btn btn-ghost btn-sm" id="meta-btn-editar-global">
              <i data-lucide="pencil" style="width:14px;height:14px;"></i>
              Editar
            </button>
          </div>
          <div class="card__body" id="meta-panel-global"></div>
        </div>

      </div>

      <!-- Metas por vendedor -->
      <div class="card mb-5">
        <div class="card__header">
          <span class="card__title">Metas por vendedor — ${SCCR.Fecha.mesActual()}</span>
          <span class="text-xs text-secondary">${ranking.length} vendedor${ranking.length!==1?'es':''}</span>
        </div>
        <div class="card__body p-4" id="meta-tabla-vendedores"></div>
      </div>

      <!-- Proyección vs meta -->
      <div class="card">
        <div class="card__header">
          <span class="card__title">Proyección al cierre vs Meta</span>
        </div>
        <div class="card__body" id="meta-proyeccion"></div>
      </div>

    `;

    renderKPIs(kpis, ranking);
    renderPanelGlobal(kpis);
    renderGraficoCumplimiento(ranking);
    renderTablaVendedores(ranking, vendedores);
    renderProyeccion(kpis);
    bindEventos(vendedores);
    lucide.createIcons();
  }


  /* ==========================================================
     4. KPIs GLOBALES
     ========================================================== */
  function renderKPIs(kpis, ranking) {
    const el = document.getElementById('meta-kpis');
    if (!el) return;

    const conMeta     = ranking.filter(v => v.meta > 0);
    const sobremeta   = conMeta.filter(v => (v.cumplimiento_pct || 0) >= 100).length;
    const enRiesgo    = conMeta.filter(v => (v.cumplimiento_pct || 0) < 60).length;
    const cumplProm   = conMeta.length > 0
      ? SCCR.Numero.redondear(conMeta.reduce((s, v) => s + (v.cumplimiento_pct||0), 0) / conMeta.length, 1)
      : null;

    el.innerHTML = [
      {
        label:    'Meta del equipo',
        valor:    _metaGlobal > 0 ? SCCR.Numero.moneda(_metaGlobal) : 'Sin configurar',
        icono:    'target',
        primario: true,
        periodo:  SCCR.Fecha.mesActual(),
      },
      {
        label:   'Cumplimiento global',
        valor:   kpis.meta_mes > 0 ? `${kpis.cumplimiento_mes} %` : '—',
        icono:   'percent',
        periodo: `${SCCR.Numero.moneda(kpis.ventas_mes)} de ${SCCR.Numero.moneda(kpis.meta_mes)}`,
      },
      {
        label:   'Sobre la meta',
        valor:   SCCR.Numero.formato(sobremeta),
        icono:   'trophy',
        periodo: `de ${conMeta.length} con meta`,
      },
      {
        label:   'En riesgo',
        valor:   SCCR.Numero.formato(enRiesgo),
        icono:   'alert-triangle',
        periodo: 'Cumplimiento < 60%',
      },
    ].map(t => SCCR.UI.kpiHTML(t)).join('');
  }


  /* ==========================================================
     5. PANEL DE META GLOBAL
     ========================================================== */
  function renderPanelGlobal(kpis) {
    const el = document.getElementById('meta-panel-global');
    if (!el) return;

    const meta       = _metaGlobal;
    const ventas     = kpis.ventas_mes;
    const pct        = meta > 0 ? SCCR.Numero.clamp((ventas / meta) * 100, 0, 200) : 0;
    const faltante   = meta > 0 ? Math.max(0, meta - ventas) : 0;
    const sobrante   = meta > 0 ? Math.max(0, ventas - meta) : 0;
    const p          = kpis.pronostico_mes;
    const diasRest   = p?.dias_restantes || 0;
    const ritmoNec   = faltante > 0 && diasRest > 0
      ? SCCR.Numero.redondear(faltante / diasRest, 2)
      : 0;

    if (meta === 0) {
      el.innerHTML = `
        <div class="empty-state" style="padding:var(--space-7) var(--space-5);">
          <i data-lucide="target" class="empty-state__icon"></i>
          <p class="empty-state__title">Sin meta configurada</p>
          <p class="empty-state__description">
            Define una meta global o configura metas individuales por vendedor.
          </p>
          <button class="btn btn-primary mt-4" id="meta-btn-nueva-2">
            <i data-lucide="plus" style="width:15px;height:15px;"></i>
            Configurar meta
          </button>
        </div>`;
      document.getElementById('meta-btn-nueva-2')?.addEventListener('click', abrirModalNuevaMeta);
      return;
    }

    el.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:var(--space-5);">

        <!-- Termómetro grande -->
        <div style="text-align:center;">
          <div class="text-xs text-secondary mb-2" style="text-transform:uppercase;letter-spacing:.05em;">
            Avance vs. Meta
          </div>
          <div style="position:relative;display:inline-block;width:100%;">
            <!-- Número grande -->
            <div style="font-size:42px;font-weight:700;
              color:${pct >= 100 ? 'var(--color-connected)' : 'var(--color-text-primary)'};">
              ${pct.toFixed(1)} %
            </div>
            <div class="text-secondary text-sm mb-3">
              ${SCCR.Numero.moneda(ventas)} / ${SCCR.Numero.moneda(meta)}
            </div>
          </div>

          <!-- Barra grande -->
          <div style="background:var(--color-border);border-radius:var(--radius-full);
               height:16px;overflow:hidden;margin-bottom:var(--space-2);">
            <div style="
              width:${Math.min(pct, 100)}%;
              height:100%;
              background:${pct >= 100 ? 'var(--color-connected)'
                         : pct >= 75  ? 'var(--color-warning)'
                         : 'var(--color-primary)'};
              border-radius:var(--radius-full);
              transition:width .8s ease;"></div>
          </div>

          <!-- Marcadores -->
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--color-text-muted);">
            <span>$0</span>
            <span>25%</span>
            <span>50%</span>
            <span>75%</span>
            <span>${SCCR.Numero.moneda(meta)}</span>
          </div>
        </div>

        <hr class="divider" style="margin:0;">

        <!-- Métricas de cierre -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);">
          ${sobrante > 0 ? `
            <div style="grid-column:span 2;background:var(--color-connected-bg);border-radius:var(--radius-md);
                 padding:var(--space-3);text-align:center;">
              <div class="text-xs" style="color:var(--color-connected);font-weight:600;text-transform:uppercase;">
                ¡Meta superada!
              </div>
              <div style="font-size:20px;font-weight:700;color:var(--color-connected);">
                +${SCCR.Numero.moneda(sobrante)}
              </div>
            </div>` : `
            <div style="background:var(--color-bg);border-radius:var(--radius-md);padding:var(--space-3);">
              <div class="text-xs text-secondary">Faltante para meta</div>
              <div style="font-size:18px;font-weight:700;color:var(--color-primary);margin-top:2px;">
                ${SCCR.Numero.moneda(faltante)}
              </div>
            </div>
            <div style="background:var(--color-bg);border-radius:var(--radius-md);padding:var(--space-3);">
              <div class="text-xs text-secondary">Ritmo diario necesario</div>
              <div style="font-size:18px;font-weight:700;color:var(--color-text-primary);margin-top:2px;">
                ${SCCR.Numero.moneda(ritmoNec)}/d
              </div>
            </div>`}

          <div style="background:var(--color-bg);border-radius:var(--radius-md);padding:var(--space-3);">
            <div class="text-xs text-secondary">Días restantes</div>
            <div style="font-size:18px;font-weight:700;margin-top:2px;">${diasRest}</div>
          </div>
          <div style="background:var(--color-bg);border-radius:var(--radius-md);padding:var(--space-3);">
            <div class="text-xs text-secondary">Ritmo actual/día</div>
            <div style="font-size:18px;font-weight:700;margin-top:2px;">
              ${SCCR.Numero.moneda(p?.ritmo_diario || 0)}
            </div>
          </div>
        </div>

      </div>`;
  }


  /* ==========================================================
     6. GRÁFICO DE CUMPLIMIENTO POR VENDEDOR
     ========================================================== */
  function renderGraficoCumplimiento(ranking) {
    const canvas = document.getElementById('meta-chart-cumpl');
    if (!canvas) return;

    const conMeta = ranking.filter(v => v.meta > 0);

    if (conMeta.length === 0) {
      canvas.parentElement.innerHTML = SCCR.UI.vacio({
        titulo:      'Sin metas configuradas',
        descripcion: 'Configura metas para ver el gráfico de cumplimiento.',
        icono:       'bar-chart-2',
      });
      return;
    }

    if (_grafico) _grafico.destroy();

    const colores = conMeta.map(v =>
      (v.cumplimiento_pct || 0) >= 100 ? '#27AE60'
      : (v.cumplimiento_pct || 0) >= 75  ? '#F39C12'
      : (v.cumplimiento_pct || 0) >= 50  ? '#F1C40F'
      : '#D71920'
    );

    _grafico = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: conMeta.map(v => nombreCorto(v.vendedor)),
        datasets: [
          {
            label:           'Cumplimiento (%)',
            data:            conMeta.map(v => v.cumplimiento_pct || 0),
            backgroundColor: colores,
            borderRadius:    6,
            borderSkipped:   false,
            yAxisID:         'y',
          },
          {
            label:           'Meta (USD)',
            data:            conMeta.map(v => v.meta),
            type:            'line',
            borderColor:     '#2D3436',
            borderWidth:     2,
            borderDash:      [6, 3],
            pointRadius:     0,
            fill:            false,
            yAxisID:         'y2',
          },
        ],
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: { font: { family: 'Montserrat', size: 11 }, color: '#7F8C8D' },
          },
          tooltip: {
            backgroundColor: '#2D3436',
            titleColor:      '#fff',
            bodyColor:       '#B2BEC3',
            padding:         12,
            cornerRadius:    8,
            callbacks: {
              title:  ctx => conMeta[ctx[0].dataIndex]?.vendedor || '',
              label:  ctx => ctx.datasetIndex === 0
                ? ` Cumplimiento: ${ctx.raw.toFixed(1)}%`
                : ` Meta: ${SCCR.Numero.moneda(ctx.raw)}`,
              afterBody: (ctx) => {
                const v = conMeta[ctx[0].dataIndex];
                return v ? [
                  ` Ventas: ${SCCR.Numero.moneda(v.ventas)}`,
                  ` Faltante: ${SCCR.Numero.moneda(v.faltante)}`,
                ] : [];
              },
            },
          },
          annotation: {
            annotations: {
              lineaMeta: {
                type:        'line',
                yMin:        100,
                yMax:        100,
                borderColor: 'rgba(39,174,96,0.5)',
                borderWidth: 1.5,
                borderDash:  [4, 4],
              },
            },
          },
        },
        scales: {
          x: {
            grid:  { display: false },
            ticks: { color: '#7F8C8D', font: { family: 'Montserrat', size: 11 } },
          },
          y: {
            position:    'left',
            beginAtZero: true,
            max:         Math.max(120, ...conMeta.map(v => v.cumplimiento_pct || 0)),
            grid:        { color: '#F0F2F5', drawBorder: false },
            ticks: {
              color:    '#7F8C8D',
              font:     { family: 'Montserrat', size: 11 },
              callback: v => `${v}%`,
            },
          },
          y2: {
            position: 'right',
            display:  false,
            grid:     { drawOnChartArea: false },
          },
        },
      },
    });
  }


  /* ==========================================================
     7. TABLA DE METAS POR VENDEDOR
     ========================================================== */
  function renderTablaVendedores(ranking, vendedores) {
    const el = document.getElementById('meta-tabla-vendedores');
    if (!el) return;

    /* Combinar vendedores con pedidos + los que tienen meta pero no pedidos */
    const todosVendedores = [...new Set([
      ...ranking.map(v => v.vendedor),
      ...vendedores,
    ])].sort();

    el.innerHTML = `
      <table class="table" id="meta-tabla">
        <thead>
          <tr>
            <th>Vendedor</th>
            <th style="text-align:right;">Ventas mes</th>
            <th style="text-align:right;">Meta mensual</th>
            <th style="min-width:160px;">Cumplimiento</th>
            <th style="text-align:right;">Faltante</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${todosVendedores.map(vend => {
            const r    = ranking.find(v =>
              SCCR.Texto.normalizar(v.vendedor) === SCCR.Texto.normalizar(vend));
            const meta = _metas[vend]?.meta_mensual || 0;
            const ventas = r?.ventas || 0;
            const pct    = meta > 0 ? SCCR.Numero.clamp((ventas / meta) * 100, 0, 999) : null;
            const falt   = meta > 0 ? Math.max(0, meta - ventas) : 0;

            return `
              <tr>
                <td>
                  <div class="flex items-center gap-2">
                    <div class="header__avatar" style="width:30px;height:30px;font-size:11px;flex-shrink:0;">
                      ${SCCR.Texto.iniciales(vend)}
                    </div>
                    <span class="font-medium" style="font-size:13px;">${SCCR.Texto.escaparHTML(vend)}</span>
                  </div>
                </td>
                <td style="text-align:right;" class="font-semibold">${SCCR.Numero.moneda(ventas)}</td>
                <td style="text-align:right;">
                  ${meta > 0
                    ? `<span class="font-medium">${SCCR.Numero.moneda(meta)}</span>`
                    : `<span class="text-muted text-sm">Sin meta</span>`}
                </td>
                <td>
                  ${pct !== null
                    ? SCCR.UI.progreso(
                        Math.min(pct, 100),
                        `${pct.toFixed(1)}%`,
                        pct >= 90 ? 'success' : pct >= 60 ? 'warning' : 'danger'
                      )
                    : `<span class="text-muted text-xs">—</span>`}
                </td>
                <td style="text-align:right;">
                  ${meta > 0
                    ? `<span class="${falt === 0 ? 'text-xs' : 'text-sm font-semibold'}"
                         style="color:${falt === 0 ? 'var(--color-connected)' : 'var(--color-danger)'};">
                         ${falt === 0 ? '✓ Lograda' : SCCR.Numero.moneda(falt)}
                       </span>`
                    : '—'}
                </td>
                <td>
                  <button class="btn btn-ghost btn-sm btn-icon"
                    title="Editar meta"
                    onclick="ModuloMetas.editarMeta('${escId(vend)}', ${meta})">
                    <i data-lucide="pencil" style="width:14px;height:14px;"></i>
                  </button>
                </td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  }


  /* ==========================================================
     8. PROYECCIÓN VS META
     ========================================================== */
  function renderProyeccion(kpis) {
    const el = document.getElementById('meta-proyeccion');
    if (!el) return;

    const p    = kpis.pronostico_mes;
    const meta = _metaGlobal || kpis.meta_mes;

    if (!p || meta === 0) {
      el.innerHTML = SCCR.UI.vacio({
        titulo:      'Sin datos suficientes',
        descripcion: 'Configura una meta y registra pedidos para ver la proyección.',
        icono:       'trending-up',
      });
      return;
    }

    const proyLineal    = p.proyeccion_lineal;
    const proyPonderada = p.proyeccion_ponderada;
    const pctLineal     = SCCR.Numero.clamp((proyLineal / meta) * 100, 0, 200);
    const pctPonderada  = SCCR.Numero.clamp((proyPonderada / meta) * 100, 0, 200);
    const veredicto     = pctPonderada >= 100
      ? { texto: '✅ En camino de cumplir la meta', color: 'var(--color-connected)' }
      : pctPonderada >= 80
      ? { texto: '🟡 Cerca de la meta — mantener ritmo', color: 'var(--color-warning)' }
      : { texto: '🔴 Por debajo del objetivo — acelerar ventas', color: 'var(--color-danger)' };

    el.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--space-5);align-items:start;">

        <!-- Proyección ponderada (principal) -->
        <div style="background:var(--color-bg);border-radius:var(--radius-lg);padding:var(--space-5);text-align:center;">
          <div class="text-xs text-secondary" style="text-transform:uppercase;letter-spacing:.05em;margin-bottom:var(--space-3);">
            Proyección ponderada
          </div>
          <div style="font-size:28px;font-weight:700;color:var(--color-text-primary);margin-bottom:var(--space-2);">
            ${SCCR.Numero.moneda(proyPonderada)}
          </div>
          <div style="font-size:13px;font-weight:600;color:${
            pctPonderada >= 100 ? 'var(--color-connected)' : 'var(--color-warning)'};">
            ${pctPonderada.toFixed(1)}% de la meta
          </div>
          <div class="text-xs text-secondary mt-2">Basada en últimos 7 días</div>
        </div>

        <!-- Proyección lineal -->
        <div style="background:var(--color-bg);border-radius:var(--radius-lg);padding:var(--space-5);text-align:center;">
          <div class="text-xs text-secondary" style="text-transform:uppercase;letter-spacing:.05em;margin-bottom:var(--space-3);">
            Proyección lineal
          </div>
          <div style="font-size:28px;font-weight:700;color:var(--color-text-primary);margin-bottom:var(--space-2);">
            ${SCCR.Numero.moneda(proyLineal)}
          </div>
          <div style="font-size:13px;font-weight:600;color:${
            pctLineal >= 100 ? 'var(--color-connected)' : 'var(--color-text-secondary)'};">
            ${pctLineal.toFixed(1)}% de la meta
          </div>
          <div class="text-xs text-secondary mt-2">Promedio diario del mes</div>
        </div>

        <!-- Meta y brecha -->
        <div style="background:var(--color-bg);border-radius:var(--radius-lg);padding:var(--space-5);text-align:center;">
          <div class="text-xs text-secondary" style="text-transform:uppercase;letter-spacing:.05em;margin-bottom:var(--space-3);">
            Meta mensual
          </div>
          <div style="font-size:28px;font-weight:700;color:var(--color-text-primary);margin-bottom:var(--space-2);">
            ${SCCR.Numero.moneda(meta)}
          </div>
          <div style="font-size:13px;color:var(--color-text-secondary);">
            Brecha: <strong>${SCCR.Numero.moneda(Math.abs(proyPonderada - meta))}</strong>
            ${proyPonderada >= meta ? '(sobre)' : '(bajo)'}
          </div>
        </div>

      </div>

      <!-- Veredicto -->
      <div style="margin-top:var(--space-5);padding:var(--space-4) var(--space-5);
           background:var(--color-bg);border-radius:var(--radius-md);border-left:4px solid ${veredicto.color};">
        <div style="font-weight:600;color:${veredicto.color};font-size:14px;">${veredicto.texto}</div>
        <div class="text-sm text-secondary mt-1">
          Día ${p.dias_transcurridos} de ${p.dias_mes} —
          ${p.dias_restantes} días restantes —
          Ritmo actual: ${SCCR.Numero.moneda(p.ritmo_diario)}/día
        </div>
      </div>`;
  }


  /* ==========================================================
     9. MODALES DE EDICIÓN
     ========================================================== */

  function abrirModalNuevaMeta() {
    const vendedores = [...new Set(SCCR.Motor.pedidos().map(p => p.vendedor))].sort();

    const body = `
      <div style="display:flex;flex-direction:column;gap:var(--space-4);">

        <div class="form-group">
          <label class="form-label">Vendedor</label>
          <select class="form-select" id="meta-modal-vendedor">
            <option value="_global">🌐 Meta global del equipo</option>
            ${vendedores.map(v => `
              <option value="${SCCR.Texto.escaparHTML(v)}">${SCCR.Texto.escaparHTML(v)}</option>`).join('')}
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Meta mensual (USD)</label>
          <div class="search-input-wrap">
            <span class="search-input-wrap__icon" style="left:12px;font-weight:700;color:var(--color-text-secondary);">$</span>
            <input type="number" class="form-input" id="meta-modal-monto"
              placeholder="0.00" min="0" step="0.01"
              style="padding-left:28px;" />
          </div>
          <span class="form-hint">Ingresa el objetivo de ventas en dólares para el mes actual.</span>
        </div>

        <div id="meta-modal-error" class="form-error" style="display:none;"></div>

      </div>`;

    const footer = `
      <button class="btn btn-ghost" onclick="SCCR.closeModal()">Cancelar</button>
      <button class="btn btn-primary" id="meta-modal-guardar">
        <i data-lucide="save" style="width:15px;height:15px;"></i>
        Guardar meta
      </button>`;

    SCCR.openModal({ title: 'Nueva meta', body, footer });
    lucide.createIcons();

    document.getElementById('meta-modal-guardar')?.addEventListener('click', () => {
      const vend  = document.getElementById('meta-modal-vendedor')?.value;
      const monto = parseFloat(document.getElementById('meta-modal-monto')?.value || '0');
      const errEl = document.getElementById('meta-modal-error');

      if (!monto || monto <= 0) {
        if (errEl) { errEl.textContent = 'Ingresa un monto válido mayor a cero.'; errEl.style.display = 'block'; }
        return;
      }

      if (vend === '_global') {
        /* Distribuir proporcionalmente si ya hay metas individuales */
        const vends = [...new Set(SCCR.Motor.pedidos().map(p => p.vendedor))];
        if (vends.length > 0) {
          const porVend = SCCR.Numero.redondear(monto / vends.length, 2);
          vends.forEach(v => {
            if (!_metas[v]) _metas[v] = { vendedor: v };
            _metas[v].meta_mensual = porVend;
          });
        }
      } else {
        if (!_metas[vend]) _metas[vend] = { vendedor: vend };
        _metas[vend].meta_mensual = monto;
      }

      guardarMetas();
      SCCR.closeModal();
      SCCR.toast?.('Meta guardada correctamente', 'success');
      render();
    });
  }

  function editarMeta(nombreEnc, metaActual) {
    const vendedor = decodeURIComponent(nombreEnc);

    const body = `
      <div style="display:flex;flex-direction:column;gap:var(--space-4);">
        <div class="flex items-center gap-3 mb-2">
          <div class="header__avatar" style="width:40px;height:40px;font-size:14px;">
            ${SCCR.Texto.iniciales(vendedor)}
          </div>
          <div>
            <div class="font-semibold">${SCCR.Texto.escaparHTML(vendedor)}</div>
            <div class="text-xs text-secondary">
              Meta actual: ${metaActual > 0 ? SCCR.Numero.moneda(metaActual) : 'Sin meta'}
            </div>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Nueva meta mensual (USD)</label>
          <div class="search-input-wrap">
            <span class="search-input-wrap__icon" style="left:12px;font-weight:700;color:var(--color-text-secondary);">$</span>
            <input type="number" class="form-input" id="meta-edit-monto"
              value="${metaActual || ''}"
              placeholder="0.00" min="0" step="0.01"
              style="padding-left:28px;" />
          </div>
          <span class="form-hint">Deja en 0 para eliminar la meta de este vendedor.</span>
        </div>

        <div id="meta-edit-error" class="form-error" style="display:none;"></div>
      </div>`;

    const footer = `
      ${metaActual > 0
        ? `<button class="btn btn-danger btn-sm" id="meta-edit-eliminar">Eliminar meta</button>`
        : ''}
      <button class="btn btn-ghost" onclick="SCCR.closeModal()">Cancelar</button>
      <button class="btn btn-primary" id="meta-edit-guardar">
        <i data-lucide="save" style="width:15px;height:15px;"></i>
        Guardar
      </button>`;

    SCCR.openModal({ title: `Meta — ${SCCR.Texto.escaparHTML(vendedor)}`, body, footer });
    lucide.createIcons();

    /* Guardar */
    document.getElementById('meta-edit-guardar')?.addEventListener('click', () => {
      const monto = parseFloat(document.getElementById('meta-edit-monto')?.value || '0');
      const errEl = document.getElementById('meta-edit-error');

      if (isNaN(monto) || monto < 0) {
        if (errEl) { errEl.textContent = 'Ingresa un valor válido.'; errEl.style.display = 'block'; }
        return;
      }

      if (!_metas[vendedor]) _metas[vendedor] = { vendedor };
      _metas[vendedor].meta_mensual = monto;
      guardarMetas();
      SCCR.closeModal();
      SCCR.toast?.(`Meta de ${vendedor} actualizada: ${SCCR.Numero.moneda(monto)}`, 'success');
      render();
    });

    /* Eliminar */
    document.getElementById('meta-edit-eliminar')?.addEventListener('click', () => {
      delete _metas[vendedor];
      guardarMetas();
      SCCR.closeModal();
      SCCR.toast?.(`Meta de ${vendedor} eliminada`, 'success');
      render();
    });
  }


  /* ==========================================================
     10. EXPORTAR CSV
     ========================================================== */
  function exportarCSV() {
    const ranking = SCCR.Motor.cumplimientoPorVendedor();
    if (ranking.length === 0) { SCCR.toast?.('Sin datos', 'warning'); return; }

    const cols  = ['Vendedor','Ventas USD','Meta USD','Cumplimiento %','Faltante USD'];
    const filas = ranking.map(v => [
      v.vendedor, v.ventas, v.meta || 0,
      v.cumplimiento_pct ?? '',
      v.faltante || 0,
    ]);

    const csv = [cols, ...filas]
      .map(f => f.map(v => `"${String(v).replace(/"/g,'""')}"`).join(';'))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `metas_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    SCCR.toast?.('Metas exportadas', 'success');
  }


  /* ==========================================================
     11. EVENTOS
     ========================================================== */
  function bindEventos(vendedores) {
    document.getElementById('meta-btn-nueva')?.addEventListener('click', abrirModalNuevaMeta);
    document.getElementById('meta-btn-editar-global')?.addEventListener('click', abrirModalNuevaMeta);
    document.getElementById('meta-btn-csv')?.addEventListener('click', exportarCSV);
  }


  /* ==========================================================
     HELPERS
     ========================================================== */
  function nombreCorto(nombre) {
    const p = nombre.trim().split(/\s+/);
    return p.length > 1 ? `${p[0]} ${p[1][0]}.` : p[0];
  }

  function escId(nombre) {
    return encodeURIComponent(nombre).replace(/'/g, '%27');
  }


  /* ==========================================================
     API PÚBLICA
     ========================================================== */
  return {
    render,
    editarMeta,
    abrirModalNuevaMeta,
  };

})();

window.SCCR.ModuloMetas = ModuloMetas;
window.ModuloMetas       = ModuloMetas;
