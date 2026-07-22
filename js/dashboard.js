/* ============================================================
   SISTEMA COMERCIAL CASABE REAL
   modules/dashboard.js — Módulo Dashboard Ejecutivo
   v1.0.0
   ============================================================

   Responsabilidades:
   1.  Renderizar la vista completa del Dashboard
   2.  Gestionar filtros de período (hoy/semana/mes/año)
   3.  Actualizar KPIs, gráficos y rankings en tiempo real
   4.  Renderizar el panel de Inteligencia Comercial
   5.  Manejar el chat con el Agente IA
   6.  Exportar el Dashboard a PDF

   Escucha: sccr:activar-dashboard, sccr:motor-listo
   Depende de: utils.js, motor.js, app.js, Chart.js
   ============================================================ */

'use strict';

window.SCCR = window.SCCR || {};

const ModuloDashboard = (() => {

  /* ----------------------------------------------------------
     ESTADO INTERNO
     ---------------------------------------------------------- */
  let _periodo    = 'mes';   /* período activo del filtro global */
  let _graficos   = {};      /* instancias Chart.js */
  let _inicializado = false;
  let _historialChat = [];   /* historial de conversación con la IA */

  /* ----------------------------------------------------------
     REGISTRAR LISTENERS
     ---------------------------------------------------------- */
  document.addEventListener('sccr:motor-listo',       onMotorListo);
  document.addEventListener('sccr:activar-dashboard', onActivar);


  /* ==========================================================
     1. ACTIVACIÓN
     ========================================================== */
  function onMotorListo() {
    /* Si el dashboard ya está visible, renderizarlo */
    const view = document.getElementById('view-dashboard');
    if (view && view.style.display !== 'none') {
      render();
    }
  }

  function onActivar() {
    if (!SCCR.Motor?.estaListo()) {
      mostrarEsqueleto();
      return;
    }
    render();
  }


  /* ==========================================================
     2. RENDER PRINCIPAL
     ========================================================== */
  function render() {
    SCCR.Log?.info('Dashboard', `Renderizando — período: ${_periodo}`);

    renderFiltroGlobal();
    renderKPIs();
    renderGraficos();
    renderRankings();
    renderEmbudoMini();
    renderPronosticoMini();
    renderPanelIA();
    bindEventos();

    _inicializado = true;
    lucide.createIcons();
  }


  /* ==========================================================
     3. FILTRO GLOBAL DE PERÍODO
     ========================================================== */
  function renderFiltroGlobal() {
    /* Insertar barra de filtro sobre los KPIs si no existe */
    const kpisEl = document.getElementById('dashboard-kpis');
    if (!kpisEl) return;

    let filtroBar = document.getElementById('dash-filtro-global');
    if (!filtroBar) {
      filtroBar = document.createElement('div');
      filtroBar.id        = 'dash-filtro-global';
      filtroBar.className = 'filter-bar mb-5';
      filtroBar.innerHTML = `
        <span class="filter-bar__label">Período</span>
        ${['hoy','semana','mes','ano'].map(p => `
          <button
            class="btn btn-sm ${p === _periodo ? 'btn-primary' : 'btn-secondary'}"
            data-periodo="${p}"
            id="dash-btn-${p}"
          >
            ${etiquetaPeriodo(p)}
          </button>
        `).join('')}
        <div class="filter-bar__spacer"></div>
        <span class="text-xs text-secondary" id="dash-ultima-sync"></span>
        <button class="btn btn-secondary btn-sm" id="dash-btn-export-pdf">
          <i data-lucide="download" style="width:13px;height:13px;"></i>
          PDF
        </button>
      `;
      kpisEl.parentNode.insertBefore(filtroBar, kpisEl);
    } else {
      /* Actualizar estado activo */
      ['hoy','semana','mes','ano'].forEach(p => {
        const btn = document.getElementById(`dash-btn-${p}`);
        if (btn) {
          btn.className = `btn btn-sm ${p === _periodo ? 'btn-primary' : 'btn-secondary'}`;
        }
      });
    }

    /* Última sincronización */
    const syncEl = document.getElementById('dash-ultima-sync');
    if (syncEl) {
      const ultima = SCCR.Importador?.estado()?.ultima_sync;
      syncEl.textContent = ultima
        ? `Sync: ${SCCR.Fecha.relativo(ultima)}`
        : '';
    }
  }

  function etiquetaPeriodo(p) {
    return { hoy: 'Hoy', semana: 'Semana', mes: 'Mes', ano: 'Año' }[p] || p;
  }


  /* ==========================================================
     4. KPIs — 6 TARJETAS
     ========================================================== */
  function renderKPIs() {
    const contenedor = document.getElementById('dashboard-kpis');
    if (!contenedor) return;

    const kpis = SCCR.Motor.calcularKPIs();

    /* Seleccionar valores según período activo */
    const ventas   = { hoy: kpis.ventas_hoy, semana: kpis.ventas_semana, mes: kpis.ventas_mes, ano: kpis.ventas_ano }[_periodo];
    const pedidos  = { hoy: kpis.pedidos_hoy, semana: kpis.pedidos_semana, mes: kpis.pedidos_mes, ano: kpis.pedidos_mes }[_periodo];
    const cajas    = { hoy: kpis.cajas_hoy, semana: kpis.cajas_semana, mes: kpis.cajas_mes, ano: kpis.cajas_mes }[_periodo];

    const tarjetas = [
      {
        label:    'Ventas',
        valor:    SCCR.Numero.moneda(ventas),
        icono:    'dollar-sign',
        primario: true,
        delta:    _periodo === 'mes' ? kpis.delta_ventas_mes.texto
                : _periodo === 'semana' ? kpis.delta_ventas_semana.texto : null,
        signo:    _periodo === 'mes' ? kpis.delta_ventas_mes.signo
                : _periodo === 'semana' ? kpis.delta_ventas_semana.signo : 'neutral',
        periodo:  etiquetaPeriodo(_periodo),
      },
      {
        label:   'Pedidos',
        valor:   SCCR.Numero.formato(pedidos),
        icono:   'shopping-cart',
        periodo: `${kpis.clientes_mes} clientes activos`,
      },
      {
        label:   'Unidades',
        valor:   SCCR.Numero.formato(cajas),
        icono:   'package',
        periodo: 'Cajas / unidades',
      },
      {
        label:   'Ticket promedio',
        valor:   SCCR.Numero.moneda(kpis.ticket_promedio_mes),
        icono:   'receipt',
        periodo: 'Por pedido este mes',
      },
      {
        label:   'Nuevos clientes',
        valor:   SCCR.Numero.formato(kpis.clientes_nuevos_mes),
        icono:   'user-plus',
        periodo: 'Este mes',
      },
      {
        label:   'Cumplimiento meta',
        valor:   kpis.meta_mes > 0 ? `${kpis.cumplimiento_mes} %` : '—',
        icono:   'target',
        periodo: kpis.meta_mes > 0
          ? `Meta: ${SCCR.Numero.moneda(kpis.meta_mes)}`
          : 'Sin meta configurada',
      },
    ];

    contenedor.innerHTML = tarjetas
      .map(t => SCCR.UI.kpiHTML(t))
      .join('');
  }


  /* ==========================================================
     5. GRÁFICOS
     ========================================================== */
  function renderGraficos() {
    renderGraficoEvolucion(_periodo === 'ano' ? 'ano' : _periodo === 'hoy' ? 'semana' : _periodo);
    renderGraficoVendedores(_periodo === 'hoy' ? 'mes' : _periodo);
  }

  /* ── 5.1 Evolución de ventas ── */
  function renderGraficoEvolucion(periodo) {
    const canvas = document.getElementById('chart-evolucion');
    if (!canvas) return;

    const { labels, datos } = SCCR.Motor.serieVentas(periodo);
    const hayDatos = datos.some(v => v > 0);

    if (_graficos.evolucion) _graficos.evolucion.destroy();

    _graficos.evolucion = new Chart(canvas, {
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
          pointRadius:          hayDatos ? 4 : 0,
          pointHoverRadius:     6,
          fill:                 true,
          tension:              0.4,
        }],
      },
      options: {
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
            callbacks: {
              label: ctx => ` ${SCCR.Numero.moneda(ctx.raw)}`,
            },
          },
        },
        scales: {
          x: {
            grid:  { display: false },
            ticks: { color: '#7F8C8D', font: { family: 'Montserrat', size: 11 } },
          },
          y: {
            grid:      { color: '#F0F2F5', drawBorder: false },
            beginAtZero: true,
            ticks: {
              color:    '#7F8C8D',
              font:     { family: 'Montserrat', size: 11 },
              callback: v => SCCR.Numero.compacto(v),
            },
          },
        },
      },
    });
  }

  /* ── 5.2 Ventas por vendedor ── */
  function renderGraficoVendedores(periodo) {
    const canvas = document.getElementById('chart-vendedores');
    if (!canvas) return;

    const { labels, datos } = SCCR.Motor.serieVendedores(periodo);

    if (_graficos.vendedores) _graficos.vendedores.destroy();

    const PALETA = ['#D71920','#2D3436','#F1C40F','#F39C12','#7F8C8D','#B2BEC3'];

    _graficos.vendedores = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label:           'Ventas (USD)',
          data:            datos,
          backgroundColor: labels.map((_, i) => PALETA[i % PALETA.length]),
          borderRadius:    6,
          borderSkipped:   false,
        }],
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#2D3436',
            titleColor:      '#fff',
            bodyColor:       '#B2BEC3',
            padding:         12,
            cornerRadius:    8,
            callbacks: {
              label: ctx => ` ${SCCR.Numero.moneda(ctx.raw)}`,
            },
          },
        },
        scales: {
          x: {
            grid:  { display: false },
            ticks: { color: '#7F8C8D', font: { family: 'Montserrat', size: 11 } },
          },
          y: {
            grid:        { color: '#F0F2F5', drawBorder: false },
            beginAtZero: true,
            ticks: {
              color:    '#7F8C8D',
              font:     { family: 'Montserrat', size: 11 },
              callback: v => SCCR.Numero.compacto(v),
            },
          },
        },
      },
    });
  }


  /* ==========================================================
     6. RANKINGS
     ========================================================== */
  function renderRankings() {
    renderRankingClientes();
    renderRankingVendedores();
  }

  function renderRankingClientes() {
    const el = document.getElementById('ranking-clientes');
    if (!el) return;

    const periodo = _periodo === 'hoy' ? 'semana' : _periodo;
    const top     = SCCR.Motor.rankingClientes(periodo).slice(0, 5);

    if (top.length === 0) {
      el.innerHTML = SCCR.UI.vacio({ titulo: 'Sin datos', icono: 'users', descripcion: 'No hay pedidos en este período.' });
      return;
    }

    el.innerHTML = `
      <table class="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Cliente</th>
            <th style="text-align:right;">Ventas</th>
            <th>Tipo</th>
          </tr>
        </thead>
        <tbody>
          ${top.map((c, i) => `
            <tr style="cursor:pointer;" onclick="SCCR.navigate('clientes')">
              <td>${SCCR.UI.rankNum(i + 1)}</td>
              <td>
                <div class="font-medium" style="font-size:13px;max-width:150px;" class="truncate">
                  ${SCCR.Texto.escaparHTML(c.nombre)}
                </div>
                <div class="text-xs text-secondary">
                  ${c.pedidos} pedido${c.pedidos !== 1 ? 's' : ''}
                  · ${c.dias_sin_comprar !== null ? `hace ${c.dias_sin_comprar}d` : ''}
                </div>
              </td>
              <td style="text-align:right;" class="font-semibold">
                ${SCCR.Numero.moneda(c.ventas)}
              </td>
              <td>
                ${SCCR.UI.badge(c.clasificacion, SCCR.UI.badgeCliente(c.clasificacion))}
                ${c.es_nuevo ? SCCR.UI.badge('Nuevo', 'new') : ''}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="card__footer" style="text-align:right;">
        <button class="btn btn-ghost btn-sm" onclick="SCCR.navigate('clientes')">
          Ver todos <i data-lucide="arrow-right" style="width:13px;height:13px;"></i>
        </button>
      </div>`;
  }

  function renderRankingVendedores() {
    const el = document.getElementById('ranking-vendedores');
    if (!el) return;

    const periodo = _periodo === 'hoy' ? 'mes' : _periodo;
    const ranking = SCCR.Motor.rankingVendedores(periodo);

    if (ranking.length === 0) {
      el.innerHTML = SCCR.UI.vacio({ titulo: 'Sin datos', icono: 'user-check' });
      return;
    }

    el.innerHTML = `
      <table class="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Vendedor</th>
            <th style="text-align:right;">Ventas</th>
            <th>Cumplimiento</th>
          </tr>
        </thead>
        <tbody>
          ${ranking.map((v, i) => `
            <tr>
              <td>${SCCR.UI.rankNum(i + 1)}</td>
              <td>
                <div class="flex items-center gap-2">
                  <div class="header__avatar" style="width:30px;height:30px;font-size:11px;flex-shrink:0;">
                    ${SCCR.Texto.iniciales(v.vendedor)}
                  </div>
                  <div>
                    <div class="font-medium" style="font-size:13px;">${SCCR.Texto.escaparHTML(v.vendedor)}</div>
                    <div class="text-xs text-secondary">${v.pedidos} pedidos · ${v.clientes} clientes</div>
                  </div>
                </div>
              </td>
              <td style="text-align:right;" class="font-semibold">
                ${SCCR.Numero.moneda(v.ventas)}
              </td>
              <td style="min-width:120px;">
                ${v.cumplimiento !== null
                  ? SCCR.UI.progreso(v.cumplimiento, `${v.cumplimiento}%`)
                  : `<span class="text-muted text-xs">Sin meta</span>`}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="card__footer" style="text-align:right;">
        <button class="btn btn-ghost btn-sm" onclick="SCCR.navigate('vendedores')">
          Ver detalle <i data-lucide="arrow-right" style="width:13px;height:13px;"></i>
        </button>
      </div>`;
  }


  /* ==========================================================
     7. EMBUDO MINI
     ========================================================== */
  function renderEmbudoMini() {
    const el = document.getElementById('embudo-mini');
    if (!el) return;

    const datos = SCCR.Motor.datosEmbudo();
    const max   = Math.max(...datos.map(e => e.cantidad), 1);
    const kpis  = SCCR.Motor.calcularKPIs();

    el.innerHTML = `
      <div style="padding:var(--space-2) 0;">
        ${datos.map(e => {
          const pct = e.cantidad > 0 ? Math.max((e.cantidad / max) * 100, 10) : 0;
          return `
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
              <div style="width:120px;font-size:12px;color:var(--color-text-secondary);text-align:right;flex-shrink:0;line-height:1.2;">
                ${SCCR.Texto.escaparHTML(e.etapa)}
              </div>
              <div style="flex:1;background:var(--color-border);border-radius:4px;height:24px;overflow:hidden;">
                <div style="
                  width:${pct}%;
                  height:100%;
                  background:linear-gradient(90deg,var(--color-primary-dark),var(--color-primary));
                  border-radius:4px;
                  display:flex;align-items:center;padding-left:10px;
                  font-size:11px;font-weight:700;color:#fff;
                  transition:width .6s ease;
                  min-width:${e.cantidad > 0 ? '32px' : '0'};
                ">
                  ${e.cantidad > 0 ? e.cantidad : ''}
                </div>
              </div>
            </div>`;
        }).join('')}
        <div style="margin-top:var(--space-4);padding-top:var(--space-4);border-top:1px solid var(--color-border);
             display:flex;justify-content:space-between;font-size:12px;color:var(--color-text-secondary);">
          <span>Total pedidos mes: <strong>${kpis.pedidos_mes}</strong></span>
          <button class="btn btn-ghost btn-sm" style="font-size:11px;" onclick="SCCR.navigate('embudo')">
            Ver embudo completo <i data-lucide="arrow-right" style="width:12px;height:12px;"></i>
          </button>
        </div>
      </div>`;
  }


  /* ==========================================================
     8. PRONÓSTICO MINI
     ========================================================== */
  function renderPronosticoMini() {
    const el = document.getElementById('pronostico-mini');
    if (!el) return;

    const kpis = SCCR.Motor.calcularKPIs();
    const p    = kpis.pronostico_mes;
    const meta = kpis.meta_mes;

    if (!p || kpis.pedidos_mes === 0) {
      el.innerHTML = SCCR.UI.vacio({
        titulo:      'Sin datos suficientes',
        descripcion: 'Registra pedidos para ver el pronóstico.',
        icono:       'trending-up',
      });
      return;
    }

    const proyeccion  = p.proyeccion_ponderada;
    const pctVsMeta   = meta > 0
      ? SCCR.Numero.clamp((proyeccion / meta) * 100, 0, 200)
      : null;
    const tipoProgMes = p.porcentaje_mes >= 80 ? '' : '';

    el.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:var(--space-4);">

        <!-- Cifras principales -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);">
          <div>
            <div class="text-xs text-secondary" style="text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">
              Proyección al cierre
            </div>
            <div style="font-size:24px;font-weight:700;color:var(--color-text-primary);line-height:1;">
              ${SCCR.Numero.moneda(proyeccion)}
            </div>
            ${meta > 0 && pctVsMeta !== null ? `
              <div class="text-xs mt-1 ${pctVsMeta >= 100 ? 'text-success' : 'text-warning'}">
                ${pctVsMeta >= 100 ? '✓ Sobre la meta' : `${pctVsMeta.toFixed(0)}% de la meta`}
              </div>` : ''}
          </div>
          <div>
            <div class="text-xs text-secondary" style="text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">
              Ritmo diario
            </div>
            <div style="font-size:24px;font-weight:700;color:var(--color-text-primary);line-height:1;">
              ${SCCR.Numero.moneda(p.ritmo_diario)}
            </div>
            <div class="text-xs text-secondary mt-1">Promedio últimos 7d</div>
          </div>
        </div>

        <!-- Avance del mes -->
        <div>
          <div class="text-xs text-secondary mb-2">
            Día ${p.dias_transcurridos} de ${p.dias_mes} — ${p.dias_restantes} días restantes
          </div>
          ${SCCR.UI.progreso(p.porcentaje_mes, `${p.porcentaje_mes}% del mes`)}
        </div>

        <!-- Ventas vs meta -->
        ${meta > 0 ? `
        <div>
          <div class="text-xs text-secondary mb-2">
            Ventas acumuladas vs Meta
            <span class="font-semibold" style="color:var(--color-text-primary);margin-left:4px;">
              ${SCCR.Numero.moneda(kpis.ventas_mes)} / ${SCCR.Numero.moneda(meta)}
            </span>
          </div>
          ${SCCR.UI.progreso(
            kpis.cumplimiento_mes,
            `${kpis.cumplimiento_mes}%`,
            kpis.cumplimiento_mes >= 90 ? 'success'
              : kpis.cumplimiento_mes >= 60 ? 'warning' : 'danger'
          )}
        </div>` : `
        <div class="alert alert-info" style="font-size:12px;padding:10px 14px;">
          <i data-lucide="info" style="width:14px;height:14px;" class="alert__icon"></i>
          <span>Configura metas en el módulo de <strong>Metas</strong> para ver proyección vs objetivo.</span>
        </div>`}

        <!-- Enlace -->
        <div style="text-align:right;">
          <button class="btn btn-ghost btn-sm" onclick="SCCR.navigate('reportes')">
            Ver reportes completos <i data-lucide="arrow-right" style="width:13px;height:13px;"></i>
          </button>
        </div>

      </div>`;
  }


  /* ==========================================================
     9. PANEL DE INTELIGENCIA COMERCIAL
     ========================================================== */
  function renderPanelIA() {
    const kpis    = SCCR.Motor.calcularKPIs();
    const alertas = SCCR.Motor.calcularAlertas();

    /* Resumen ejecutivo */
    setTexto('ai-resumen', SCCR.Motor.resumenEjecutivo('mes'));

    /* Alertas */
    const elAlertas = document.getElementById('ai-alertas');
    if (elAlertas) {
      if (alertas.length === 0) {
        elAlertas.textContent = '✅ Sin alertas activas. El sistema opera con normalidad.';
      } else {
        elAlertas.innerHTML = alertas.slice(0, 4).map(a => {
          const ico = a.nivel === 'danger' ? '🔴'
                    : a.nivel === 'warning' ? '🟡' : 'ℹ️';
          return `<div style="margin-bottom:6px;line-height:1.4;">
            ${ico} ${SCCR.Texto.escaparHTML(a.mensaje)}
          </div>`;
        }).join('');
      }

      /* Badge en nav */
      const badge   = document.getElementById('badge-alertas');
      const criticas = alertas.filter(a => a.nivel === 'danger').length;
      if (badge) {
        badge.style.display = criticas > 0 ? 'inline' : 'none';
        badge.textContent   = criticas;
      }
    }

    /* Recomendaciones */
    const elRecos = document.getElementById('ai-recomendaciones');
    if (elRecos) elRecos.innerHTML = generarRecomendaciones(kpis, alertas);

    /* Pronóstico IA */
    const elPron = document.getElementById('ai-pronostico');
    if (elPron) {
      const p = kpis.pronostico_mes;
      if (p) {
        const faltante = kpis.meta_mes > 0
          ? Math.max(0, kpis.meta_mes - kpis.ventas_mes)
          : null;
        const ritmaNecesario = faltante !== null && p.dias_restantes > 0
          ? SCCR.Numero.moneda(faltante / p.dias_restantes)
          : null;

        elPron.innerHTML = `
          <div>Proyección: <strong>${SCCR.Numero.moneda(p.proyeccion_ponderada)}</strong></div>
          ${ritmaNecesario
            ? `<div style="margin-top:4px;">Ritmo necesario para la meta: <strong>${ritmaNecesario}/día</strong></div>`
            : ''}
          <div style="margin-top:4px;color:rgba(255,255,255,0.5);font-size:12px;">
            Basado en los últimos 7 días
          </div>`;
      } else {
        elPron.textContent = 'Ingresa pedidos para generar pronóstico.';
      }
    }

    /* Inicializar chat */
    initChat();
  }

  function generarRecomendaciones(kpis, alertas) {
    const items = [];

    const inactivos = alertas.filter(a => a.tipo === 'cliente_inactivo');
    if (inactivos.length > 0) {
      const c = inactivos[0].dato;
      items.push(`📞 Contactar a <strong>${SCCR.Texto.escaparHTML(c.nombre)}</strong> — ${c.dias_sin_comprar} días sin comprar.`);
    }

    if (alertas.some(a => a.tipo === 'meta_en_riesgo')) {
      const falta = SCCR.Numero.moneda(Math.max(0, kpis.meta_mes - kpis.ventas_mes));
      items.push(`🎯 Acelerar ventas: faltan <strong>${falta}</strong> para la meta del mes.`);
    }

    const nuevos = alertas.find(a => a.tipo === 'nuevos_clientes');
    if (nuevos) {
      const nombres = nuevos.dato.clientes.slice(0, 2)
        .map(n => `<strong>${SCCR.Texto.escaparHTML(n)}</strong>`).join(', ');
      items.push(`🆕 Seguimiento a ${nombres} — nuevos clientes recientes.`);
    }

    const sinAct = alertas.filter(a => a.tipo === 'vendedor_sin_actividad');
    if (sinAct.length > 0) {
      items.push(`📋 <strong>${SCCR.Texto.escaparHTML(sinAct[0].dato.vendedor)}</strong> no ha registrado pedidos hoy.`);
    }

    if (items.length === 0) {
      items.push('✅ El sistema opera con normalidad. Revisa el Embudo para identificar nuevas oportunidades.');
    }

    return items.map(i => `<div style="margin-bottom:6px;line-height:1.4;">${i}</div>`).join('');
  }


  /* ==========================================================
     10. CHAT CON IA
     ========================================================== */
  function initChat() {
    const input   = document.getElementById('ai-chat-input');
    const btnSend = document.getElementById('ai-chat-send');
    if (!input || !btnSend || input.dataset.chatBound === 'true') return;
    input.dataset.chatBound = 'true';

    async function enviar() {
      const query = input.value.trim();
      if (!query) return;

      input.value      = '';
      input.disabled   = true;
      btnSend.disabled = true;

      /* Mostrar spinner en el resumen */
      const aiResumen = document.getElementById('ai-resumen');
      const backup    = aiResumen?.innerHTML;
      if (aiResumen) {
        aiResumen.innerHTML = `
          <div class="flex items-center gap-2" style="opacity:.7;">
            <div class="sync-indicator__dot sync-indicator__dot--syncing"></div>
            Analizando…
          </div>`;
      }

      /* Agregar al historial */
      _historialChat.push({ role: 'user', content: query });

      try {
        const kpis    = SCCR.Motor.calcularKPIs();
        const alertas = SCCR.Motor.calcularAlertas();
        const topCli  = SCCR.Motor.rankingClientes('mes').slice(0, 5);
        const topVend = SCCR.Motor.rankingVendedores('mes');

        const sistema = `Eres el Agente Comercial del Sistema Comercial Casabe Real.
Responde SOLO en español, de forma concisa y directa (máximo 3 oraciones).
Usa los datos reales del sistema para dar respuestas específicas y accionables.

DATOS DEL SISTEMA (${new Date().toLocaleDateString('es-VE')}):
• Ventas hoy: ${SCCR.Numero.moneda(kpis.ventas_hoy)} | Semana: ${SCCR.Numero.moneda(kpis.ventas_semana)} | Mes: ${SCCR.Numero.moneda(kpis.ventas_mes)}
• Pedidos mes: ${kpis.pedidos_mes} | Clientes activos: ${kpis.clientes_mes} | Nuevos: ${kpis.clientes_nuevos_mes}
• Meta mes: ${kpis.meta_mes > 0 ? SCCR.Numero.moneda(kpis.meta_mes) : 'No configurada'} | Cumplimiento: ${kpis.cumplimiento_mes}%
• Ticket promedio: ${SCCR.Numero.moneda(kpis.ticket_promedio_mes)}
• Proyección cierre: ${SCCR.Numero.moneda(kpis.pronostico_mes?.proyeccion_ponderada || 0)}
• Top clientes: ${topCli.map(c => `${c.nombre} (${SCCR.Numero.moneda(c.ventas)})`).join(' | ')}
• Vendedores: ${topVend.map(v => `${v.vendedor} ${SCCR.Numero.moneda(v.ventas)}${v.cumplimiento !== null ? ' ' + v.cumplimiento + '%' : ''}`).join(' | ')}
• Alertas: ${alertas.length > 0 ? alertas.map(a => a.mensaje).join('; ') : 'ninguna'}`;

        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model:      'claude-sonnet-4-6',
            max_tokens: 1000,
            system:     sistema,
            messages:   _historialChat.slice(-10), /* últimos 10 turnos */
          }),
        });

        const data   = await res.json();
        const texto  = data.content?.[0]?.text || 'No pude generar una respuesta.';

        /* Agregar respuesta al historial */
        _historialChat.push({ role: 'assistant', content: texto });

        if (aiResumen) aiResumen.textContent = texto;

      } catch (err) {
        SCCR.Log?.error('Dashboard', 'Chat IA error:', err);
        if (aiResumen) aiResumen.innerHTML = backup;
        SCCR.toast?.('Error al consultar la IA', 'error');
        _historialChat.pop(); /* quitar el mensaje que falló */
      } finally {
        input.disabled   = false;
        btnSend.disabled = false;
        input.focus();
      }
    }

    btnSend.addEventListener('click', enviar);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); }
    });
  }


  /* ==========================================================
     11. EVENTOS Y BINDINGS
     ========================================================== */
  function bindEventos() {
    /* Botones de período */
    ['hoy','semana','mes','ano'].forEach(p => {
      const btn = document.getElementById(`dash-btn-${p}`);
      if (btn && !btn.dataset.bound) {
        btn.dataset.bound = 'true';
        btn.addEventListener('click', () => {
          _periodo = p;
          render();
        });
      }
    });

    /* Filtro gráfico evolución */
    const selEv = document.getElementById('filter-evolucion');
    if (selEv && !selEv.dataset.bound) {
      selEv.dataset.bound = 'true';
      selEv.addEventListener('change', e => renderGraficoEvolucion(e.target.value));
    }

    /* Filtro gráfico vendedores */
    const selVend = document.getElementById('filter-vendedores-chart');
    if (selVend && !selVend.dataset.bound) {
      selVend.dataset.bound = 'true';
      selVend.addEventListener('change', e => renderGraficoVendedores(e.target.value));
    }

    /* Exportar PDF */
    const btnPDF = document.getElementById('dash-btn-export-pdf');
    if (btnPDF && !btnPDF.dataset.bound) {
      btnPDF.dataset.bound = 'true';
      btnPDF.addEventListener('click', exportarPDF);
    }
  }


  /* ==========================================================
     12. EXPORTAR PDF
     ========================================================== */
  function exportarPDF() {
    SCCR.toast?.('Preparando PDF…', 'success', 2000);

    /* Guardar estado del DOM para restaurar */
    const sidebar = document.getElementById('sidebar');
    const header  = document.getElementById('breadcrumb-bar');

    window.print();
  }


  /* ==========================================================
     13. ESQUELETO DE CARGA
     ========================================================== */
  function mostrarEsqueleto() {
    const kpisEl = document.getElementById('dashboard-kpis');
    if (kpisEl) {
      kpisEl.innerHTML = Array(6).fill(`
        <div class="kpi-card">
          <div class="skeleton skeleton--title" style="width:60%;"></div>
          <div class="skeleton skeleton--kpi" style="width:80%;margin-top:8px;"></div>
          <div class="skeleton skeleton--text" style="width:50%;margin-top:8px;"></div>
        </div>`).join('');
    }
  }


  /* ==========================================================
     HELPERS
     ========================================================== */
  function setTexto(id, texto) {
    const el = document.getElementById(id);
    if (el) el.textContent = texto ?? '—';
  }


  /* ==========================================================
     API PÚBLICA
     ========================================================== */
  return {
    render,
    setPeriodo: (p) => { _periodo = p; render(); },
    limpiarChat: () => { _historialChat = []; },
  };

})();

/* Registrar en namespace global */
window.SCCR.ModuloDashboard = ModuloDashboard;
