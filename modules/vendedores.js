/* ============================================================
   SISTEMA COMERCIAL CASABE REAL
   modules/vendedores.js — Módulo de Vendedores
   v1.0.0
   ============================================================

   Responsabilidades:
   1.  Listado del equipo comercial con KPIs individuales
   2.  Ranking por período con comparativo
   3.  Ficha de vendedor: historial, clientes, productos
   4.  Gráfico de desempeño individual
   5.  Indicadores de actividad diaria

   Escucha: sccr:activar-vendedores
   Depende de: utils.js, motor.js, Chart.js
   ============================================================ */

'use strict';

window.SCCR = window.SCCR || {};

const ModuloVendedores = (() => {

  /* ----------------------------------------------------------
     ESTADO
     ---------------------------------------------------------- */
  let _periodo   = 'mes';
  let _graficoFicha = null;

  /* ----------------------------------------------------------
     LISTENER
     ---------------------------------------------------------- */
  document.addEventListener('sccr:activar-vendedores', onActivar);


  /* ==========================================================
     1. ACTIVACIÓN
     ========================================================== */
  function onActivar() {
    if (!SCCR.Motor?.estaListo()) {
      document.getElementById('view-vendedores').innerHTML =
        SCCR.UI.vacio({ titulo: 'Cargando vendedores…', icono: 'loader' });
      return;
    }
    render();
  }


  /* ==========================================================
     2. RENDER PRINCIPAL
     ========================================================== */
  function render() {
    const view = document.getElementById('view-vendedores');
    if (!view) return;

    SCCR.Log?.info('Vendedores', `Renderizando — período: ${_periodo}`);

    const ranking = SCCR.Motor.rankingVendedores(_periodo);
    const kpis    = SCCR.Motor.calcularKPIs();

    view.innerHTML = `

      <!-- Header -->
      <div class="page-header flex items-center justify-between">
        <div>
          <h1 class="page-title">Vendedores</h1>
          <p class="page-subtitle">Desempeño y gestión del equipo comercial</p>
        </div>
        <div class="flex gap-3">
          <button class="btn btn-secondary" id="vend-btn-csv">
            <i data-lucide="file-spreadsheet" style="width:15px;height:15px;"></i>
            Exportar CSV
          </button>
        </div>
      </div>

      <!-- Filtro de período -->
      <div class="filter-bar mb-5">
        <span class="filter-bar__label">Período</span>
        ${['hoy','semana','mes','ano'].map(p => `
          <button class="btn btn-sm ${p === _periodo ? 'btn-primary' : 'btn-secondary'}"
            data-periodo="${p}" id="vend-btn-${p}">
            ${labelPeriodo(p)}
          </button>`).join('')}
        <div class="filter-bar__spacer"></div>
        <span class="text-sm text-secondary">${ranking.length} vendedor${ranking.length !== 1 ? 'es' : ''}</span>
      </div>

      <!-- KPIs del equipo -->
      <div class="grid grid-4 mb-5" id="vend-kpis"></div>

      <!-- Ranking + Gráfico -->
      <div class="grid grid-2 mb-5" style="gap:var(--space-5);">

        <!-- Ranking -->
        <div class="card">
          <div class="card__header">
            <span class="card__title">Ranking — ${labelPeriodo(_periodo)}</span>
          </div>
          <div class="card__body p-4" id="vend-ranking"></div>
        </div>

        <!-- Gráfico comparativo -->
        <div class="chart-container">
          <div class="chart-container__header">
            <span class="chart-container__title">Comparativo de ventas</span>
          </div>
          <div class="chart-container__body" style="min-height:300px;">
            <canvas id="vend-chart-comp"></canvas>
          </div>
        </div>

      </div>

      <!-- Tarjetas individuales -->
      <div class="text-h3 mb-4" style="font-size:16px;">Detalle por vendedor</div>
      <div class="grid grid-3 mb-5" id="vend-tarjetas"></div>

      <!-- Actividad diaria -->
      <div class="card">
        <div class="card__header">
          <span class="card__title">Actividad de hoy</span>
          <span class="text-xs text-secondary" id="vend-act-fecha"></span>
        </div>
        <div class="card__body" id="vend-actividad-hoy"></div>
      </div>

    `;

    renderKPIs(kpis, ranking);
    renderRanking(ranking);
    renderGraficoComparativo(ranking);
    renderTarjetas(ranking);
    renderActividadHoy();
    bindEventos();
    lucide.createIcons();
  }


  /* ==========================================================
     3. KPIs DEL EQUIPO
     ========================================================== */
  function renderKPIs(kpis, ranking) {
    const el = document.getElementById('vend-kpis');
    if (!el) return;

    const totalVentas  = ranking.reduce((s, v) => s + v.ventas, 0);
    const totalPedidos = ranking.reduce((s, v) => s + v.pedidos, 0);
    const conMeta      = ranking.filter(v => v.meta > 0);
    const cumplProm    = conMeta.length > 0
      ? SCCR.Numero.redondear(
          conMeta.reduce((s, v) => s + (v.cumplimiento || 0), 0) / conMeta.length, 1)
      : null;
    const activos = ranking.filter(v => v.pedidos > 0).length;

    el.innerHTML = [
      {
        label:    'Ventas del equipo',
        valor:    SCCR.Numero.moneda(totalVentas),
        icono:    'trending-up',
        primario: true,
        periodo:  labelPeriodo(_periodo),
      },
      {
        label:   'Pedidos totales',
        valor:   SCCR.Numero.formato(totalPedidos),
        icono:   'shopping-cart',
        periodo: `${ranking.length} vendedores`,
      },
      {
        label:   'Vendedores activos',
        valor:   SCCR.Numero.formato(activos),
        icono:   'user-check',
        periodo: `de ${ranking.length} en el equipo`,
      },
      {
        label:   'Cumplimiento promedio',
        valor:   cumplProm !== null ? `${cumplProm} %` : '—',
        icono:   'target',
        periodo: conMeta.length > 0 ? `${conMeta.length} con meta` : 'Sin metas configuradas',
      },
    ].map(t => SCCR.UI.kpiHTML(t)).join('');
  }


  /* ==========================================================
     4. RANKING
     ========================================================== */
  function renderRanking(ranking) {
    const el = document.getElementById('vend-ranking');
    if (!el) return;

    if (ranking.length === 0) {
      el.innerHTML = SCCR.UI.vacio({ titulo: 'Sin datos', icono: 'user-check' });
      return;
    }

    const totalVentas = ranking.reduce((s, v) => s + v.ventas, 0);

    el.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:var(--space-4);">
        ${ranking.map((v, i) => {
          const pctVentas = totalVentas > 0
            ? SCCR.Numero.clamp((v.ventas / totalVentas) * 100, 0, 100)
            : 0;

          return `
            <div style="cursor:pointer;" onclick="ModuloVendedores.verFicha('${escId(v.vendedor)}')">
              <div class="flex items-center gap-3 mb-2">

                <!-- Posición -->
                ${SCCR.UI.rankNum(i + 1)}

                <!-- Avatar + nombre -->
                <div class="flex items-center gap-2" style="flex:1;min-width:0;">
                  <div class="header__avatar" style="width:32px;height:32px;font-size:12px;flex-shrink:0;">
                    ${SCCR.Texto.iniciales(v.vendedor)}
                  </div>
                  <div style="min-width:0;">
                    <div class="font-semibold truncate" style="font-size:13px;">
                      ${SCCR.Texto.escaparHTML(v.vendedor)}
                    </div>
                    <div class="text-xs text-secondary">
                      ${v.pedidos} pedidos · ${v.clientes} clientes · ${v.nuevos_clientes} nuevos
                    </div>
                  </div>
                </div>

                <!-- Monto -->
                <div style="text-align:right;flex-shrink:0;">
                  <div class="font-bold" style="font-size:15px;">${SCCR.Numero.moneda(v.ventas)}</div>
                  <div class="text-xs text-secondary">${pctVentas.toFixed(0)}% del total</div>
                </div>
              </div>

              <!-- Barra de participación -->
              <div style="display:flex;align-items:center;gap:var(--space-3);">
                <div style="flex:1;background:var(--color-border);border-radius:4px;height:6px;overflow:hidden;">
                  <div style="width:${pctVentas}%;height:100%;
                       background:${i === 0 ? 'var(--color-primary)' : 'var(--color-text-secondary)'};
                       border-radius:4px;transition:width .5s ease;"></div>
                </div>
                <!-- Meta si existe -->
                ${v.cumplimiento !== null ? `
                  <span class="text-xs font-semibold"
                    style="color:${v.cumplimiento >= 90 ? 'var(--color-connected)'
                           : v.cumplimiento >= 60 ? 'var(--color-warning)'
                           : 'var(--color-danger)'};">
                    ${v.cumplimiento}% meta
                  </span>` : ''}
              </div>
            </div>`;
        }).join('')}
      </div>`;
  }


  /* ==========================================================
     5. GRÁFICO COMPARATIVO
     ========================================================== */
  function renderGraficoComparativo(ranking) {
    const canvas = document.getElementById('vend-chart-comp');
    if (!canvas) return;

    if (window._vendGraficoComp) window._vendGraficoComp.destroy();

    const PALETA = ['#D71920','#2D3436','#F1C40F','#F39C12','#7F8C8D','#B2BEC3'];

    window._vendGraficoComp = new Chart(canvas, {
      type: 'bar',
      data: {
        labels:   ranking.map(v => nombreCorto(v.vendedor)),
        datasets: [{
          label:           'Ventas (USD)',
          data:            ranking.map(v => v.ventas),
          backgroundColor: ranking.map((_, i) => PALETA[i % PALETA.length]),
          borderRadius:    8,
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
              title:  ctx => ranking[ctx[0].dataIndex]?.vendedor || '',
              label:  ctx => ` ${SCCR.Numero.moneda(ctx.raw)}`,
              afterLabel: ctx => {
                const v = ranking[ctx.dataIndex];
                return v ? [
                  ` ${v.pedidos} pedidos`,
                  ` ${v.clientes} clientes`,
                  v.cumplimiento !== null ? ` ${v.cumplimiento}% meta` : '',
                ].filter(Boolean) : [];
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
     6. TARJETAS INDIVIDUALES
     ========================================================== */
  function renderTarjetas(ranking) {
    const el = document.getElementById('vend-tarjetas');
    if (!el) return;

    if (ranking.length === 0) {
      el.innerHTML = SCCR.UI.vacio({ titulo: 'Sin vendedores', icono: 'users' });
      return;
    }

    el.innerHTML = ranking.map((v, i) => {
      const medallas = ['🥇','🥈','🥉'];
      const estado   = v.pedidos > 0 ? 'activo' : 'inactivo';

      return `
        <div class="card" style="cursor:pointer;transition:box-shadow .2s,transform .2s;"
          onclick="ModuloVendedores.verFicha('${escId(v.vendedor)}')"
          onmouseenter="this.style.boxShadow='var(--shadow-lg)';this.style.transform='translateY(-3px)'"
          onmouseleave="this.style.boxShadow='';this.style.transform=''">

          <div class="card__body">

            <!-- Cabecera -->
            <div class="flex items-center justify-between mb-4">
              <div class="flex items-center gap-3">
                <div class="header__avatar" style="width:44px;height:44px;font-size:16px;flex-shrink:0;
                  ${i === 0 ? 'background:var(--color-primary);' : ''}">
                  ${SCCR.Texto.iniciales(v.vendedor)}
                </div>
                <div>
                  <div class="font-bold" style="font-size:15px;line-height:1.2;">
                    ${SCCR.Texto.escaparHTML(nombreCorto(v.vendedor))}
                  </div>
                  <div class="flex gap-1 mt-1">
                    ${SCCR.UI.badge(estado === 'activo' ? 'Activo' : 'Sin actividad',
                        estado === 'activo' ? 'active' : 'inactive')}
                  </div>
                </div>
              </div>
              <span style="font-size:24px;">${medallas[i] || ''}</span>
            </div>

            <!-- Ventas destacadas -->
            <div style="background:var(--color-bg);border-radius:var(--radius-md);
                 padding:var(--space-3) var(--space-4);margin-bottom:var(--space-4);text-align:center;">
              <div class="text-xs text-secondary" style="text-transform:uppercase;letter-spacing:.05em;">
                Ventas ${labelPeriodo(_periodo)}
              </div>
              <div style="font-size:26px;font-weight:700;color:var(--color-text-primary);margin-top:2px;">
                ${SCCR.Numero.moneda(v.ventas)}
              </div>
            </div>

            <!-- Grid de métricas -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);margin-bottom:var(--space-4);">
              ${[
                { label: 'Pedidos',     valor: v.pedidos },
                { label: 'Clientes',    valor: v.clientes },
                { label: 'Nuevos',      valor: v.nuevos_clientes },
                { label: 'Ticket',      valor: SCCR.Numero.moneda(v.ticket_promedio) },
              ].map(m => `
                <div style="text-align:center;padding:var(--space-2);
                     background:var(--color-bg);border-radius:var(--radius-md);">
                  <div class="text-xs text-secondary">${m.label}</div>
                  <div class="font-semibold mt-1" style="font-size:15px;">${m.valor}</div>
                </div>`).join('')}
            </div>

            <!-- Meta y cumplimiento -->
            ${v.meta > 0 ? `
              <div>
                <div class="flex justify-between mb-1" style="font-size:12px;">
                  <span class="text-secondary">Meta: ${SCCR.Numero.moneda(v.meta)}</span>
                  <span class="font-semibold">${v.cumplimiento}%</span>
                </div>
                ${SCCR.UI.progreso(
                  v.cumplimiento,
                  '',
                  v.cumplimiento >= 90 ? 'success'
                  : v.cumplimiento >= 60 ? 'warning' : 'danger'
                )}
              </div>` : `
              <div class="text-xs text-secondary text-center" style="padding:var(--space-2) 0;">
                Sin meta configurada —
                <button class="btn btn-ghost btn-sm" style="font-size:11px;padding:2px 6px;"
                  onclick="event.stopPropagation();SCCR.navigate('metas')">
                  Configurar
                </button>
              </div>`}

          </div>
        </div>`;
    }).join('');
  }


  /* ==========================================================
     7. ACTIVIDAD DE HOY
     ========================================================== */
  function renderActividadHoy() {
    const el   = document.getElementById('vend-actividad-hoy');
    const lblF = document.getElementById('vend-act-fecha');
    if (!el) return;

    if (lblF) {
      lblF.textContent = SCCR.Fecha.format(new Date(), 'largo');
    }

    const rankHoy        = SCCR.Motor.rankingVendedores('hoy');
    const todosVendedores = [...new Set(SCCR.Motor.pedidos().map(p => p.vendedor))].sort();
    const conActividad   = new Set(rankHoy.map(v => v.vendedor));
    const sinActividad   = todosVendedores.filter(v => !conActividad.has(v));

    el.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-5);">

        <!-- Con actividad -->
        <div>
          <div class="text-xs text-secondary" style="text-transform:uppercase;letter-spacing:.05em;margin-bottom:var(--space-3);">
            ✅ Con pedidos hoy (${rankHoy.length})
          </div>
          ${rankHoy.length === 0
            ? `<p class="text-secondary text-sm">Ningún vendedor ha registrado pedidos hoy.</p>`
            : rankHoy.map(v => `
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                  <div class="header__avatar" style="width:30px;height:30px;font-size:11px;flex-shrink:0;">
                    ${SCCR.Texto.iniciales(v.vendedor)}
                  </div>
                  <div>
                    <div class="font-medium" style="font-size:13px;">${SCCR.Texto.escaparHTML(v.vendedor)}</div>
                    <div class="text-xs text-secondary">${v.pedidos} pedido${v.pedidos!==1?'s':''} · ${v.clientes} cliente${v.clientes!==1?'s':''}</div>
                  </div>
                </div>
                <span class="font-semibold" style="font-size:13px;">${SCCR.Numero.moneda(v.ventas)}</span>
              </div>`).join('')}
        </div>

        <!-- Sin actividad -->
        <div>
          <div class="text-xs text-secondary" style="text-transform:uppercase;letter-spacing:.05em;margin-bottom:var(--space-3);">
            ⚠️ Sin pedidos hoy (${sinActividad.length})
          </div>
          ${sinActividad.length === 0
            ? `<p class="text-secondary text-sm">¡Todo el equipo registró pedidos hoy!</p>`
            : sinActividad.map(v => `
              <div class="flex items-center gap-2 mb-3">
                <div class="header__avatar" style="width:30px;height:30px;font-size:11px;flex-shrink:0;
                     background:var(--color-border);color:var(--color-text-secondary);">
                  ${SCCR.Texto.iniciales(v)}
                </div>
                <span class="text-sm" style="color:var(--color-text-secondary);">${SCCR.Texto.escaparHTML(v)}</span>
              </div>`).join('')}
        </div>

      </div>`;
  }


  /* ==========================================================
     8. FICHA DE VENDEDOR (modal)
     ========================================================== */
  function verFicha(nombre) {
    const vendedor = decodeURIComponent(nombre);
    const data     = SCCR.Motor.rankingVendedores('todo')
      .find(v => SCCR.Texto.normalizar(v.vendedor) === SCCR.Texto.normalizar(vendedor));

    if (!data) { SCCR.toast?.('Vendedor no encontrado', 'error'); return; }

    /* Pedidos del vendedor */
    const pedidos = SCCR.Motor.filtrarPorVendedor(SCCR.Motor.pedidos(), vendedor);

    /* Top clientes */
    const clientesPed = SCCR.Coleccion.groupBy(pedidos, 'establecimiento');
    const topClientes = Object.entries(clientesPed)
      .map(([nom, ps]) => ({ nom, ventas: ps.reduce((s, p) => s + p.total, 0), pedidos: ps.length }))
      .sort((a, b) => b.ventas - a.ventas)
      .slice(0, 5);

    /* Serie mensual del vendedor */
    const meses = SCCR.Fecha.mesesDelAno();
    const anio  = new Date().getFullYear();
    const serie = meses.map((_, i) =>
      pedidos.filter(p => {
        const f = new Date(p.fecha + 'T00:00:00');
        return f.getFullYear() === anio && f.getMonth() === i;
      }).reduce((s, p) => s + p.total, 0)
    );

    const body = `

      <!-- Cabecera -->
      <div class="flex items-center gap-4 mb-5">
        <div class="header__avatar" style="width:60px;height:60px;font-size:22px;flex-shrink:0;">
          ${SCCR.Texto.iniciales(vendedor)}
        </div>
        <div>
          <h2 style="font-size:20px;font-weight:700;">${SCCR.Texto.escaparHTML(vendedor)}</h2>
          <div class="flex gap-2 mt-1">
            ${SCCR.UI.badge('Vendedor', 'active')}
            ${data.pedidos > 0 ? SCCR.UI.badge('Activo', 'active') : SCCR.UI.badge('Sin actividad', 'inactive')}
          </div>
        </div>
      </div>

      <!-- KPIs del vendedor -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:var(--space-3);margin-bottom:var(--space-5);">
        ${[
          { label: 'Ventas',       valor: SCCR.Numero.moneda(data.ventas) },
          { label: 'Pedidos',      valor: data.pedidos },
          { label: 'Clientes',     valor: data.clientes },
          { label: 'Ticket prom.', valor: SCCR.Numero.moneda(data.ticket_promedio) },
        ].map(k => `
          <div style="background:var(--color-bg);border-radius:var(--radius-md);
               padding:var(--space-3);text-align:center;">
            <div class="text-xs text-secondary" style="text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;">${k.label}</div>
            <div style="font-size:17px;font-weight:700;">${k.valor}</div>
          </div>`).join('')}
      </div>

      <!-- Meta y cumplimiento -->
      ${data.meta > 0 ? `
        <div style="margin-bottom:var(--space-5);">
          <div class="flex justify-between mb-2" style="font-size:13px;">
            <span class="text-secondary">Meta mensual: <strong>${SCCR.Numero.moneda(data.meta)}</strong></span>
            <span class="font-bold" style="color:${
              data.cumplimiento >= 90 ? 'var(--color-connected)'
              : data.cumplimiento >= 60 ? 'var(--color-warning)'
              : 'var(--color-danger)'};">${data.cumplimiento}%</span>
          </div>
          ${SCCR.UI.progreso(
            data.cumplimiento, '',
            data.cumplimiento >= 90 ? 'success'
            : data.cumplimiento >= 60 ? 'warning' : 'danger'
          )}
          <div class="text-xs text-secondary mt-2">
            Faltante: <strong>${SCCR.Numero.moneda(Math.max(0, data.meta - data.ventas))}</strong>
          </div>
        </div>` : ''}

      <!-- Gráfico anual -->
      <div style="margin-bottom:var(--space-5);">
        <div class="text-xs text-secondary" style="text-transform:uppercase;letter-spacing:.05em;margin-bottom:var(--space-3);">
          Ventas ${anio} por mes
        </div>
        <div style="height:160px;position:relative;">
          <canvas id="vend-ficha-chart"></canvas>
        </div>
      </div>

      <!-- Top clientes -->
      <div class="text-xs text-secondary" style="text-transform:uppercase;letter-spacing:.05em;margin-bottom:var(--space-3);">
        Top clientes de ${SCCR.Texto.escaparHTML(nombreCorto(vendedor))}
      </div>
      <div class="table-wrap mb-5">
        <table class="table">
          <thead>
            <tr><th>#</th><th>Cliente</th><th style="text-align:right;">Ventas</th><th style="text-align:center;">Pedidos</th></tr>
          </thead>
          <tbody>
            ${topClientes.map((c, i) => `
              <tr>
                <td>${SCCR.UI.rankNum(i + 1)}</td>
                <td class="font-medium" style="font-size:13px;">${SCCR.Texto.escaparHTML(c.nom)}</td>
                <td style="text-align:right;" class="font-semibold">${SCCR.Numero.moneda(c.ventas)}</td>
                <td style="text-align:center;">${c.pedidos}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>

      <!-- Últimos pedidos -->
      <div class="text-xs text-secondary" style="text-transform:uppercase;letter-spacing:.05em;margin-bottom:var(--space-3);">
        Últimos pedidos
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr><th>Fecha</th><th>Cliente</th><th style="text-align:right;">Total</th><th>Tipo</th></tr>
          </thead>
          <tbody>
            ${SCCR.Coleccion.ordenar(pedidos, 'fecha', 'desc').slice(0, 8).map(p => `
              <tr>
                <td style="white-space:nowrap;">
                  <div class="font-medium" style="font-size:13px;">${SCCR.Fecha.format(p.fecha)}</div>
                  <div class="text-xs text-secondary">${SCCR.Fecha.relativo(p.fecha)}</div>
                </td>
                <td style="font-size:13px;">${SCCR.Texto.escaparHTML(p.establecimiento)}</td>
                <td style="text-align:right;" class="font-semibold">${SCCR.Numero.moneda(p.total)}</td>
                <td>${p.es_nuevo_cliente ? SCCR.UI.badge('Nuevo','new') : SCCR.UI.badge('Rec.','active')}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;

    const footer = `
      <button class="btn btn-secondary" onclick="SCCR.navigate('metas')">
        <i data-lucide="target" style="width:15px;height:15px;"></i>
        Configurar meta
      </button>
      <button class="btn btn-ghost" onclick="SCCR.closeModal()">Cerrar</button>`;

    SCCR.openModal({ title: SCCR.Texto.escaparHTML(vendedor), body, footer });
    lucide.createIcons();

    /* Renderizar gráfico dentro del modal */
    setTimeout(() => {
      const canvas = document.getElementById('vend-ficha-chart');
      if (!canvas) return;

      if (_graficoFicha) _graficoFicha.destroy();

      _graficoFicha = new Chart(canvas, {
        type: 'line',
        data: {
          labels: meses,
          datasets: [{
            data:                 serie,
            borderColor:          '#D71920',
            backgroundColor:      'rgba(215,25,32,0.07)',
            borderWidth:          2,
            pointBackgroundColor: '#D71920',
            pointRadius:          serie.map(v => v > 0 ? 4 : 0),
            fill:                 true,
            tension:              0.4,
          }],
        },
        options: {
          responsive:          true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false },
            tooltip: {
              callbacks: { label: ctx => ` ${SCCR.Numero.moneda(ctx.raw)}` }
            }
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: '#7F8C8D', font: { size: 10 } } },
            y: { beginAtZero: true, ticks: { callback: v => SCCR.Numero.compacto(v), color: '#7F8C8D', font: { size: 10 } } },
          },
        },
      });
    }, 100);
  }


  /* ==========================================================
     9. EXPORTAR CSV
     ========================================================== */
  function exportarCSV() {
    const ranking = SCCR.Motor.rankingVendedores('todo');
    if (ranking.length === 0) { SCCR.toast?.('Sin datos', 'warning'); return; }

    const cols = ['Vendedor','Ventas USD','Pedidos','Clientes','Nuevos Clientes',
                  'Ticket Promedio','Meta USD','Cumplimiento %'];
    const filas = ranking.map(v => [
      v.vendedor, v.ventas, v.pedidos, v.clientes,
      v.nuevos_clientes, v.ticket_promedio,
      v.meta || 0, v.cumplimiento ?? '',
    ]);

    const csv = [cols, ...filas]
      .map(f => f.map(v => `"${String(v).replace(/"/g,'""')}"`).join(';'))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `vendedores_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    SCCR.toast?.(`${ranking.length} vendedores exportados`, 'success');
  }


  /* ==========================================================
     10. EVENTOS
     ========================================================== */
  function bindEventos() {
    ['hoy','semana','mes','ano'].forEach(p => {
      const btn = document.getElementById(`vend-btn-${p}`);
      if (btn && !btn.dataset.bound) {
        btn.dataset.bound = 'true';
        btn.addEventListener('click', () => { _periodo = p; render(); });
      }
    });

    document.getElementById('vend-btn-csv')?.addEventListener('click', exportarCSV);
  }


  /* ==========================================================
     HELPERS
     ========================================================== */
  function labelPeriodo(p) {
    return { hoy: 'Hoy', semana: 'Semana', mes: 'Mes', ano: 'Año' }[p] || p;
  }

  function nombreCorto(nombre) {
    const partes = nombre.trim().split(/\s+/);
    return partes.length > 1 ? `${partes[0]} ${partes[1][0]}.` : partes[0];
  }

  function escId(nombre) {
    return encodeURIComponent(nombre).replace(/'/g, '%27');
  }


  /* ==========================================================
     API PÚBLICA
     ========================================================== */
  return { render, verFicha };

})();

window.SCCR.ModuloVendedores = ModuloVendedores;
window.ModuloVendedores       = ModuloVendedores;
