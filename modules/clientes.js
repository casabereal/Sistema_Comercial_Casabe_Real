/* ============================================================
   SISTEMA COMERCIAL CASABE REAL
   modules/clientes.js — Módulo de Clientes
   v1.0.0
   ============================================================

   Responsabilidades:
   1.  Listado de clientes con KPIs, búsqueda y filtros
   2.  Clasificación ABC con indicadores de frecuencia
   3.  Ficha completa de cliente (historial, productos, contacto)
   4.  Alertas de clientes inactivos
   5.  Exportar cartera a CSV

   Escucha: sccr:activar-clientes
   Depende de: utils.js, motor.js
   ============================================================ */

'use strict';

window.SCCR = window.SCCR || {};

const ModuloClientes = (() => {

  /* ----------------------------------------------------------
     ESTADO
     ---------------------------------------------------------- */
  let _clientes     = [];
  let _paginaActual = 1;
  let _porPagina    = 20;
  let _filtros      = {
    periodo:       'mes',
    clasificacion: 'todos',
    tipo:          'todos',
    busqueda:      '',
    orden:         'ventas',
    dirOrden:      'desc',
  };

  /* ----------------------------------------------------------
     LISTENER
     ---------------------------------------------------------- */
  document.addEventListener('sccr:activar-clientes', onActivar);


  /* ==========================================================
     1. ACTIVACIÓN
     ========================================================== */
  function onActivar() {
    if (!SCCR.Motor?.estaListo()) {
      document.getElementById('view-clientes').innerHTML =
        SCCR.UI.vacio({ titulo: 'Cargando clientes…', icono: 'loader' });
      return;
    }
    render();
  }


  /* ==========================================================
     2. RENDER PRINCIPAL
     ========================================================== */
  function render() {
    const view = document.getElementById('view-clientes');
    if (!view) return;

    SCCR.Log?.info('Clientes', 'Renderizando módulo');
    aplicarFiltros();

    view.innerHTML = `

      <!-- Header -->
      <div class="page-header flex items-center justify-between">
        <div>
          <h1 class="page-title">Clientes</h1>
          <p class="page-subtitle">Gestión integral de cartera de clientes</p>
        </div>
        <div class="flex gap-3">
          <button class="btn btn-secondary" id="cli-btn-csv">
            <i data-lucide="file-spreadsheet" style="width:15px;height:15px;"></i>
            Exportar CSV
          </button>
          <button class="btn btn-primary" id="cli-btn-nuevo">
            <i data-lucide="user-plus" style="width:15px;height:15px;"></i>
            Nuevo cliente
          </button>
        </div>
      </div>

      <!-- KPIs -->
      <div class="grid grid-4 mb-5" id="cli-kpis"></div>

      <!-- Alertas de inactividad -->
      <div id="cli-alertas-inactivos" class="mb-5"></div>

      <!-- Filtros -->
      <div class="filter-bar mb-5">

        <div class="search-input-wrap" style="flex:1;min-width:200px;max-width:320px;">
          <i data-lucide="search" class="search-input-wrap__icon" style="width:15px;height:15px;"></i>
          <input type="search" class="form-input" id="cli-busqueda"
            placeholder="Buscar cliente, RIF, contacto…"
            value="${SCCR.Texto.escaparHTML(_filtros.busqueda)}"
            autocomplete="off" />
        </div>

        <select class="form-select" id="cli-sel-periodo">
          <option value="semana" ${_filtros.periodo==='semana'?'selected':''}>Esta semana</option>
          <option value="mes"    ${_filtros.periodo==='mes'   ?'selected':''}>Este mes</option>
          <option value="ano"    ${_filtros.periodo==='ano'   ?'selected':''}>Este año</option>
          <option value="todo"   ${_filtros.periodo==='todo'  ?'selected':''}>Histórico</option>
        </select>

        <select class="form-select" id="cli-sel-clasificacion">
          <option value="todos" ${_filtros.clasificacion==='todos'?'selected':''}>Toda la cartera</option>
          <option value="A"     ${_filtros.clasificacion==='A'    ?'selected':''}>Categoría A</option>
          <option value="B"     ${_filtros.clasificacion==='B'    ?'selected':''}>Categoría B</option>
          <option value="C"     ${_filtros.clasificacion==='C'    ?'selected':''}>Categoría C</option>
        </select>

        <select class="form-select" id="cli-sel-tipo">
          <option value="todos"    ${_filtros.tipo==='todos'   ?'selected':''}>Todos</option>
          <option value="nuevo"    ${_filtros.tipo==='nuevo'   ?'selected':''}>Nuevos</option>
          <option value="activo"   ${_filtros.tipo==='activo'  ?'selected':''}>Activos</option>
          <option value="inactivo" ${_filtros.tipo==='inactivo'?'selected':''}>Inactivos (+14d)</option>
        </select>

        <div class="filter-bar__spacer"></div>
        <span class="text-sm text-secondary" id="cli-contador">${_clientes.length} clientes</span>

      </div>

      <!-- Tabla -->
      <div class="table-wrap mb-5" id="cli-tabla-wrap">
        ${renderTabla()}
      </div>

      <!-- Paginación -->
      <div id="cli-paginacion"></div>

      <!-- Distribución ABC -->
      <div class="grid grid-2 mt-5" style="gap:var(--space-5);">
        <div class="card">
          <div class="card__header">
            <span class="card__title">Distribución ABC</span>
            <span class="text-xs text-secondary">Regla de Pareto</span>
          </div>
          <div class="card__body" id="cli-abc"></div>
        </div>
        <div class="card">
          <div class="card__header">
            <span class="card__title">Frecuencia de compra</span>
            <span class="text-xs text-secondary">Días entre pedidos</span>
          </div>
          <div class="card__body" id="cli-frecuencia"></div>
        </div>
      </div>

    `;

    renderKPIs();
    renderAlertasInactivos();
    renderPaginacion();
    renderABC();
    renderFrecuencia();
    bindEventos();
    lucide.createIcons();
  }


  /* ==========================================================
     3. KPIs
     ========================================================== */
  function renderKPIs() {
    const el = document.getElementById('cli-kpis');
    if (!el) return;

    const kpis        = SCCR.Motor.calcularKPIs();
    const todosCli    = SCCR.Motor.rankingClientes('todo');
    const inactivos   = todosCli.filter(c => (c.dias_sin_comprar || 0) >= 14).length;
    const nuevosMes   = SCCR.Motor.rankingClientes('mes').filter(c => c.es_nuevo).length;
    const ticketProm  = todosCli.length > 0
      ? SCCR.Numero.redondear(
          todosCli.reduce((s, c) => s + c.ticket_promedio, 0) / todosCli.length, 2)
      : 0;

    el.innerHTML = [
      {
        label:    'Total clientes',
        valor:    SCCR.Numero.formato(todosCli.length),
        icono:    'users',
        primario: true,
        periodo:  'En la cartera',
      },
      {
        label:   'Activos este mes',
        valor:   SCCR.Numero.formato(kpis.clientes_mes),
        icono:   'user-check',
        periodo: 'Con pedidos en el mes',
      },
      {
        label:   'Nuevos este mes',
        valor:   SCCR.Numero.formato(nuevosMes),
        icono:   'user-plus',
        periodo: 'Formulario NC',
      },
      {
        label:   'Inactivos',
        valor:   SCCR.Numero.formato(inactivos),
        icono:   'user-x',
        periodo: 'Sin comprar +14 días',
      },
    ].map(t => SCCR.UI.kpiHTML(t)).join('');
  }


  /* ==========================================================
     4. ALERTAS DE INACTIVIDAD
     ========================================================== */
  function renderAlertasInactivos() {
    const el = document.getElementById('cli-alertas-inactivos');
    if (!el) return;

    const todosCli  = SCCR.Motor.rankingClientes('todo');
    const inactivos = todosCli
      .filter(c => (c.dias_sin_comprar || 0) >= 14)
      .sort((a, b) => (b.dias_sin_comprar || 0) - (a.dias_sin_comprar || 0))
      .slice(0, 3);

    if (inactivos.length === 0) { el.innerHTML = ''; return; }

    el.innerHTML = `
      <div class="alert alert-warning">
        <i data-lucide="alert-triangle" style="width:16px;height:16px;" class="alert__icon"></i>
        <div>
          <div class="alert__title">Clientes que requieren atención</div>
          <div style="display:flex;flex-wrap:wrap;gap:var(--space-3);margin-top:var(--space-2);">
            ${inactivos.map(c => `
              <button
                class="btn btn-secondary btn-sm"
                onclick="ModuloClientes.verFicha('${SCCR.Texto.escaparHTML(c.nombre)}')"
                style="font-size:12px;"
              >
                ${SCCR.Texto.escaparHTML(SCCR.Texto.truncar(c.nombre, 22))}
                <span style="color:var(--color-warning);font-weight:700;margin-left:4px;">
                  ${c.dias_sin_comprar}d
                </span>
              </button>`).join('')}
            ${todosCli.filter(c => (c.dias_sin_comprar || 0) >= 14).length > 3
              ? `<span class="text-sm text-secondary" style="align-self:center;">
                  +${todosCli.filter(c => (c.dias_sin_comprar||0) >= 14).length - 3} más
                 </span>` : ''}
          </div>
        </div>
      </div>`;
  }


  /* ==========================================================
     5. TABLA DE CLIENTES
     ========================================================== */
  function renderTabla() {
    if (_clientes.length === 0) {
      return SCCR.UI.vacio({
        titulo:      'Sin clientes',
        descripcion: 'No hay clientes que coincidan con los filtros.',
        icono:       'users',
        accion:      `<button class="btn btn-secondary"
                        onclick="ModuloClientes.limpiarFiltros()">
                        Limpiar filtros
                      </button>`,
      });
    }

    const inicio = (_paginaActual - 1) * _porPagina;
    const pagina = _clientes.slice(inicio, inicio + _porPagina);

    return `
      <table class="table" id="cli-tabla">
        <thead>
          <tr>
            <th>Cliente</th>
            ${thOrd('ventas',          'Ventas')}
            ${thOrd('pedidos',         'Pedidos')}
            ${thOrd('ticket_promedio', 'Ticket')}
            ${thOrd('dias_sin_comprar','Último pedido')}
            <th>Clasificación</th>
            <th>Vendedor</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${pagina.map(c => filaCliente(c)).join('')}
        </tbody>
      </table>`;
  }

  function thOrd(campo, label) {
    const activo = _filtros.orden === campo;
    const icono  = activo
      ? (_filtros.dirOrden === 'asc' ? 'chevron-up' : 'chevron-down')
      : 'chevrons-up-down';
    return `<th style="cursor:pointer;white-space:nowrap;user-select:none;" data-orden="${campo}">
      ${label}
      <i data-lucide="${icono}" style="width:12px;height:12px;vertical-align:middle;margin-left:3px;"></i>
    </th>`;
  }

  function filaCliente(c) {
    const diasStr  = c.dias_sin_comprar !== null
      ? `hace ${c.dias_sin_comprar}d`
      : '—';
    const diasColor = (c.dias_sin_comprar || 0) >= 30 ? 'var(--color-danger)'
                    : (c.dias_sin_comprar || 0) >= 14 ? 'var(--color-warning)'
                    : 'var(--color-text-secondary)';

    return `
      <tr style="cursor:pointer;" onclick="ModuloClientes.verFicha('${escId(c.nombre)}')">
        <td>
          <div class="flex items-center gap-3">
            <div class="header__avatar" style="width:34px;height:34px;font-size:12px;flex-shrink:0;">
              ${SCCR.Texto.iniciales(c.nombre)}
            </div>
            <div>
              <div class="font-medium" style="font-size:13px;">
                ${SCCR.Texto.escaparHTML(c.nombre)}
              </div>
              <div class="text-xs text-secondary">
                ${c.rif ? SCCR.Texto.escaparHTML(c.rif) + ' · ' : ''}
                ${SCCR.Texto.escaparHTML(c.contacto || '')}
              </div>
            </div>
          </div>
        </td>
        <td class="font-semibold">${SCCR.Numero.moneda(c.ventas)}</td>
        <td class="text-center">${c.pedidos}</td>
        <td>${SCCR.Numero.moneda(c.ticket_promedio)}</td>
        <td>
          <span style="color:${diasColor};font-weight:600;font-size:13px;">${diasStr}</span>
          <div class="text-xs text-secondary">${SCCR.Fecha.format(c.ultimo_pedido)}</div>
        </td>
        <td>
          <div class="flex gap-1 flex-wrap">
            ${SCCR.UI.badge(c.clasificacion, SCCR.UI.badgeCliente(c.clasificacion))}
            ${c.es_nuevo ? SCCR.UI.badge('Nuevo', 'new') : ''}
          </div>
        </td>
        <td>
          <span class="text-sm">${SCCR.Texto.escaparHTML(c.vendedor_principal || '—')}</span>
        </td>
        <td onclick="event.stopPropagation()">
          <div class="table__actions">
            <button class="btn btn-ghost btn-icon btn-sm" title="Ver ficha"
              onclick="ModuloClientes.verFicha('${escId(c.nombre)}')">
              <i data-lucide="eye" style="width:15px;height:15px;"></i>
            </button>
            ${c.telefono ? `
            <a class="btn btn-ghost btn-icon btn-sm" title="WhatsApp"
               href="https://wa.me/${waNro(c.telefono)}" target="_blank">
              <i data-lucide="message-circle" style="width:15px;height:15px;"></i>
            </a>` : ''}
          </div>
        </td>
      </tr>`;
  }


  /* ==========================================================
     6. FICHA DE CLIENTE (modal)
     ========================================================== */
  function verFicha(nombre) {
    const hist = SCCR.Motor.historialCliente(decodeURIComponent(nombre));
    if (!hist || hist.total_pedidos === 0) {
      SCCR.toast?.('Cliente no encontrado', 'error');
      return;
    }

    /* Productos más comprados por este cliente */
    const prodConteo = {};
    hist.pedidos.forEach(p => {
      p.productos.forEach(pr => {
        if (!prodConteo[pr.producto]) prodConteo[pr.producto] = { qty: 0, monto: 0 };
        prodConteo[pr.producto].qty   += pr.cantidad;
        prodConteo[pr.producto].monto += pr.subtotal;
      });
    });
    const topProds = Object.entries(prodConteo)
      .sort((a, b) => b[1].monto - a[1].monto)
      .slice(0, 5);

    /* Datos de contacto del pedido más reciente */
    const reciente = hist.pedidos[0] || {};

    const body = `

      <!-- Cabecera cliente -->
      <div class="flex items-center gap-4 mb-5">
        <div class="header__avatar" style="width:56px;height:56px;font-size:20px;flex-shrink:0;">
          ${SCCR.Texto.iniciales(hist.nombre)}
        </div>
        <div style="flex:1;">
          <h2 style="font-size:18px;font-weight:700;margin-bottom:4px;">
            ${SCCR.Texto.escaparHTML(hist.nombre)}
          </h2>
          <div class="flex gap-2 flex-wrap">
            ${SCCR.UI.badge(hist.clasificacion, SCCR.UI.badgeCliente(hist.clasificacion))}
            ${reciente.es_nuevo_cliente ? SCCR.UI.badge('Nuevo cliente', 'new') : SCCR.UI.badge('Recurrente', 'active')}
            ${reciente.rif ? `<span class="text-xs text-secondary" style="align-self:center;">RIF: ${SCCR.Texto.escaparHTML(reciente.rif)}</span>` : ''}
          </div>
        </div>
        ${reciente.rif_imagen_url ? `
          <a href="${reciente.rif_imagen_url}" target="_blank" class="btn btn-secondary btn-sm">
            <i data-lucide="file-text" style="width:13px;height:13px;"></i> Ver RIF
          </a>` : ''}
      </div>

      <!-- KPIs del cliente -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:var(--space-3);margin-bottom:var(--space-5);">
        ${[
          { label: 'Ventas totales',   valor: SCCR.Numero.moneda(hist.ventas_totales) },
          { label: 'Pedidos',          valor: hist.total_pedidos },
          { label: 'Ticket promedio',  valor: SCCR.Numero.moneda(hist.ticket_promedio) },
          { label: 'Frecuencia',       valor: hist.frecuencia_dias ? `${hist.frecuencia_dias}d` : '—' },
        ].map(k => `
          <div style="background:var(--color-bg);border-radius:var(--radius-md);padding:var(--space-3);text-align:center;">
            <div class="text-xs text-secondary" style="text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;">${k.label}</div>
            <div style="font-size:18px;font-weight:700;color:var(--color-text-primary);">${k.valor}</div>
          </div>`).join('')}
      </div>

      <!-- Contacto -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);margin-bottom:var(--space-5);">
        ${reciente.contacto_compras ? `
          <div>
            <div class="text-xs text-secondary" style="margin-bottom:4px;">Contacto Compras</div>
            <div class="font-medium text-sm">${SCCR.Texto.escaparHTML(reciente.contacto_compras)}</div>
            ${reciente.telefono_compras ? `
              <a href="https://wa.me/${waNro(reciente.telefono_compras)}" target="_blank"
                 class="flex items-center gap-1 text-sm mt-1" style="color:var(--color-primary);">
                <i data-lucide="message-circle" style="width:13px;height:13px;"></i>
                ${SCCR.Texto.escaparHTML(reciente.telefono_compras)}
              </a>` : ''}
          </div>` : ''}
        ${reciente.contacto_pagos ? `
          <div>
            <div class="text-xs text-secondary" style="margin-bottom:4px;">Contacto Pagos</div>
            <div class="font-medium text-sm">${SCCR.Texto.escaparHTML(reciente.contacto_pagos)}</div>
            ${reciente.telefono_pagos ? `
              <a href="https://wa.me/${waNro(reciente.telefono_pagos)}" target="_blank"
                 class="flex items-center gap-1 text-sm mt-1" style="color:var(--color-primary);">
                <i data-lucide="message-circle" style="width:13px;height:13px;"></i>
                ${SCCR.Texto.escaparHTML(reciente.telefono_pagos)}
              </a>` : ''}
          </div>` : ''}
      </div>

      <!-- Productos favoritos -->
      ${topProds.length > 0 ? `
        <div class="text-xs text-secondary" style="text-transform:uppercase;letter-spacing:.05em;margin-bottom:var(--space-3);">
          Productos más comprados
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:var(--space-5);">
          ${topProds.map(([nombre, d], i) => `
            <div class="flex items-center gap-3">
              <span style="width:18px;font-size:11px;color:var(--color-text-muted);text-align:right;">${i+1}</span>
              <span class="text-sm font-medium" style="flex:1;">${SCCR.Texto.escaparHTML(nombre)}</span>
              <span class="text-xs text-secondary">${d.qty} und.</span>
              <span class="font-semibold text-sm">${SCCR.Numero.moneda(d.monto)}</span>
            </div>`).join('')}
        </div>` : ''}

      <!-- Historial de pedidos -->
      <div class="text-xs text-secondary" style="text-transform:uppercase;letter-spacing:.05em;margin-bottom:var(--space-3);">
        Historial de pedidos
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Vendedor</th>
              <th>Productos</th>
              <th style="text-align:right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${hist.pedidos.slice(0, 10).map(p => `
              <tr>
                <td style="white-space:nowrap;">
                  <div class="font-medium" style="font-size:13px;">${SCCR.Fecha.format(p.fecha)}</div>
                  <div class="text-xs text-secondary">${SCCR.Fecha.relativo(p.fecha)}</div>
                </td>
                <td style="font-size:13px;">${SCCR.Texto.escaparHTML(p.vendedor)}</td>
                <td class="text-sm text-secondary">
                  ${p.productos.length > 0
                    ? p.productos.slice(0,2).map(pr => `${pr.producto} x${pr.cantidad}`).join(', ')
                      + (p.productos.length > 2 ? ` +${p.productos.length-2}` : '')
                    : SCCR.Texto.truncar(p.productos_texto || '—', 35)}
                </td>
                <td style="text-align:right;" class="font-semibold">${SCCR.Numero.moneda(p.total)}</td>
              </tr>`).join('')}
            ${hist.pedidos.length > 10 ? `
              <tr>
                <td colspan="4" class="text-center text-secondary text-sm" style="padding:var(--space-3);">
                  + ${hist.pedidos.length - 10} pedidos anteriores
                </td>
              </tr>` : ''}
          </tbody>
        </table>
      </div>
    `;

    const footer = `
      ${reciente.telefono_compras ? `
        <a href="https://wa.me/${waNro(reciente.telefono_compras)}" target="_blank" class="btn btn-secondary">
          <i data-lucide="message-circle" style="width:15px;height:15px;"></i>
          WhatsApp Compras
        </a>` : ''}
      <button class="btn btn-ghost" onclick="SCCR.closeModal()">Cerrar</button>
    `;

    SCCR.openModal({ title: SCCR.Texto.escaparHTML(hist.nombre), body, footer });
    lucide.createIcons();
  }


  /* ==========================================================
     7. DISTRIBUCIÓN ABC
     ========================================================== */
  function renderABC() {
    const el = document.getElementById('cli-abc');
    if (!el) return;

    const todos = SCCR.Motor.rankingClientes('todo');
    const grupos = { A: [], B: [], C: [] };
    todos.forEach(c => { if (grupos[c.clasificacion]) grupos[c.clasificacion].push(c); });

    const totalVentas = todos.reduce((s, c) => s + c.ventas, 0);

    el.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:var(--space-4);">
        ${['A','B','C'].map(letra => {
          const grupo    = grupos[letra];
          const ventas   = grupo.reduce((s, c) => s + c.ventas, 0);
          const pctCli   = todos.length > 0 ? (grupo.length / todos.length) * 100 : 0;
          const pctVenta = totalVentas > 0 ? (ventas / totalVentas) * 100 : 0;
          const colores  = { A: 'var(--color-connected)', B: 'var(--color-warning)', C: 'var(--color-text-muted)' };

          return `
            <div>
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2">
                  <span style="width:24px;height:24px;border-radius:50%;background:${colores[letra]};
                    color:#fff;display:flex;align-items:center;justify-content:center;
                    font-size:11px;font-weight:700;flex-shrink:0;">${letra}</span>
                  <span class="font-medium text-sm">
                    ${grupo.length} clientes
                    <span class="text-secondary">(${pctCli.toFixed(0)}%)</span>
                  </span>
                </div>
                <div class="text-right">
                  <span class="font-semibold text-sm">${SCCR.Numero.moneda(ventas)}</span>
                  <span class="text-xs text-secondary ml-1">${pctVenta.toFixed(0)}% ventas</span>
                </div>
              </div>
              <div class="progress" style="height:8px;">
                <div class="progress__bar" style="width:${pctVenta}%;background:${colores[letra]};"></div>
              </div>
            </div>`;
        }).join('')}

        <div class="alert alert-info" style="font-size:12px;margin-top:var(--space-2);">
          <i data-lucide="info" style="width:13px;height:13px;" class="alert__icon"></i>
          <span>Clasificación Pareto: A = top 80% ventas · B = 80–95% · C = 95–100%</span>
        </div>
      </div>`;
  }


  /* ==========================================================
     8. FRECUENCIA DE COMPRA
     ========================================================== */
  function renderFrecuencia() {
    const el = document.getElementById('cli-frecuencia');
    if (!el) return;

    const todos = SCCR.Motor.rankingClientes('todo')
      .filter(c => c.frecuencia_dias !== null && c.frecuencia_dias > 0);

    if (todos.length === 0) {
      el.innerHTML = SCCR.UI.vacio({ titulo: 'Sin datos suficientes', icono: 'calendar' });
      return;
    }

    /* Agrupar por rangos de días */
    const rangos = [
      { label: '1–7 días',   min: 1,  max: 7  },
      { label: '8–14 días',  min: 8,  max: 14 },
      { label: '15–30 días', min: 15, max: 30 },
      { label: '+30 días',   min: 31, max: Infinity },
    ];

    const conteo = rangos.map(r => ({
      ...r,
      cantidad: todos.filter(c => c.frecuencia_dias >= r.min && c.frecuencia_dias <= r.max).length,
    }));

    const maxCant = Math.max(...conteo.map(r => r.cantidad), 1);
    const promedio = SCCR.Numero.redondear(
      todos.reduce((s, c) => s + c.frecuencia_dias, 0) / todos.length, 1
    );

    el.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:var(--space-3);">
        ${conteo.map(r => `
          <div class="flex items-center gap-3">
            <div style="width:80px;font-size:12px;color:var(--color-text-secondary);text-align:right;flex-shrink:0;">
              ${r.label}
            </div>
            <div style="flex:1;background:var(--color-border);border-radius:4px;height:22px;overflow:hidden;">
              <div style="
                width:${r.cantidad > 0 ? Math.max((r.cantidad / maxCant) * 100, 8) : 0}%;
                height:100%;
                background:var(--color-primary);
                border-radius:4px;
                display:flex;align-items:center;padding-left:8px;
                font-size:11px;font-weight:700;color:#fff;
                transition:width .5s ease;
                min-width:${r.cantidad > 0 ? '28px' : '0'};">
                ${r.cantidad > 0 ? r.cantidad : ''}
              </div>
            </div>
            <span style="width:24px;font-size:12px;font-weight:600;color:var(--color-text-primary);">
              ${r.cantidad}
            </span>
          </div>`).join('')}

        <div class="divider" style="margin:var(--space-2) 0;"></div>
        <div class="flex justify-between text-sm">
          <span class="text-secondary">Frecuencia promedio</span>
          <span class="font-semibold">${promedio} días</span>
        </div>
      </div>`;
  }


  /* ==========================================================
     9. PAGINACIÓN
     ========================================================== */
  function renderPaginacion() {
    const el = document.getElementById('cli-paginacion');
    if (!el) return;

    const total = Math.ceil(_clientes.length / _porPagina);
    if (total <= 1) { el.innerHTML = ''; return; }

    const paginas = paginasVisibles(total);

    el.innerHTML = `
      <div class="flex items-center justify-between" style="padding:var(--space-4) 0;">
        <span class="text-sm text-secondary">
          ${Math.min((_paginaActual-1)*_porPagina+1, _clientes.length)}–${Math.min(_paginaActual*_porPagina, _clientes.length)}
          de ${_clientes.length} clientes
        </span>
        <div class="flex gap-2">
          <button class="btn btn-secondary btn-sm" id="cli-pag-ant"
            ${_paginaActual===1?'disabled':''}>
            <i data-lucide="chevron-left" style="width:14px;height:14px;"></i>
          </button>
          ${paginas.map(p => p === '…'
            ? `<span class="btn btn-ghost btn-sm" style="cursor:default;">…</span>`
            : `<button class="btn btn-sm ${p===_paginaActual?'btn-primary':'btn-secondary'}" data-pag="${p}">${p}</button>`
          ).join('')}
          <button class="btn btn-secondary btn-sm" id="cli-pag-sig"
            ${_paginaActual===total?'disabled':''}>
            <i data-lucide="chevron-right" style="width:14px;height:14px;"></i>
          </button>
        </div>
        <select class="form-select" id="cli-por-pagina" style="width:auto;">
          ${[10,20,50].map(n => `<option value="${n}" ${n===_porPagina?'selected':''}>${n} / pág</option>`).join('')}
        </select>
      </div>`;

    el.querySelectorAll('[data-pag]').forEach(btn =>
      btn.addEventListener('click', () => { _paginaActual = +btn.dataset.pag; refrescarTabla(); })
    );
    document.getElementById('cli-pag-ant')?.addEventListener('click', () => {
      if (_paginaActual > 1) { _paginaActual--; refrescarTabla(); }
    });
    document.getElementById('cli-pag-sig')?.addEventListener('click', () => {
      if (_paginaActual < total) { _paginaActual++; refrescarTabla(); }
    });
    document.getElementById('cli-por-pagina')?.addEventListener('change', e => {
      _porPagina = +e.target.value; _paginaActual = 1; refrescarTabla();
    });
  }

  function paginasVisibles(total) {
    if (total <= 7) return Array.from({length: total}, (_, i) => i+1);
    const p = _paginaActual;
    if (p <= 4)        return [1,2,3,4,5,'…',total];
    if (p >= total-3)  return [1,'…',total-4,total-3,total-2,total-1,total];
    return [1,'…',p-1,p,p+1,'…',total];
  }


  /* ==========================================================
     10. EXPORTAR CSV
     ========================================================== */
  function exportarCSV() {
    const todos = SCCR.Motor.rankingClientes('todo');
    if (todos.length === 0) { SCCR.toast?.('Sin datos', 'warning'); return; }

    const cols = ['Cliente','RIF','Clasificación','Ventas USD','Pedidos',
                  'Ticket Promedio','Último Pedido','Días Sin Comprar',
                  'Contacto Compras','Teléfono','Vendedor Principal'];

    const filas = todos.map(c => [
      c.nombre, c.rif || '', c.clasificacion,
      c.ventas, c.pedidos, c.ticket_promedio,
      SCCR.Fecha.format(c.ultimo_pedido), c.dias_sin_comprar ?? '',
      c.contacto || '', c.telefono || '', c.vendedor_principal || '',
    ]);

    const csv = [cols, ...filas]
      .map(f => f.map(v => `"${String(v).replace(/"/g,'""')}"`).join(';'))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `clientes_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    SCCR.toast?.(`${todos.length} clientes exportados`, 'success');
  }


  /* ==========================================================
     11. FILTROS Y EVENTOS
     ========================================================== */
  function aplicarFiltros() {
    let base = SCCR.Motor.rankingClientes(_filtros.periodo === 'todo' ? 'todo' : _filtros.periodo);

    /* Clasificación */
    if (_filtros.clasificacion !== 'todos') {
      base = base.filter(c => c.clasificacion === _filtros.clasificacion);
    }

    /* Tipo */
    if (_filtros.tipo === 'nuevo') {
      base = base.filter(c => c.es_nuevo);
    } else if (_filtros.tipo === 'activo') {
      base = base.filter(c => (c.dias_sin_comprar || 0) < 14);
    } else if (_filtros.tipo === 'inactivo') {
      base = base.filter(c => (c.dias_sin_comprar || 0) >= 14);
    }

    /* Búsqueda */
    if (_filtros.busqueda) {
      const q = SCCR.Texto.normalizar(_filtros.busqueda);
      base = base.filter(c =>
        SCCR.Texto.normalizar(c.nombre).includes(q) ||
        SCCR.Texto.normalizar(c.rif || '').includes(q) ||
        SCCR.Texto.normalizar(c.contacto || '').includes(q) ||
        SCCR.Texto.normalizar(c.vendedor_principal || '').includes(q)
      );
    }

    /* Ordenamiento */
    _clientes = SCCR.Coleccion.ordenar(base, _filtros.orden, _filtros.dirOrden);
    _paginaActual = 1;
  }

  function refrescarTabla() {
    const wrap = document.getElementById('cli-tabla-wrap');
    if (wrap) wrap.innerHTML = renderTabla();
    renderPaginacion();

    const cnt = document.getElementById('cli-contador');
    if (cnt) cnt.textContent = `${_clientes.length} clientes`;

    bindOrdenamiento();
    lucide.createIcons();
  }

  function bindEventos() {
    /* Búsqueda */
    document.getElementById('cli-busqueda')?.addEventListener('input',
      SCCR.debounce(e => {
        _filtros.busqueda = e.target.value.trim();
        aplicarFiltros(); refrescarTabla();
      }, 300)
    );

    /* Selectores */
    ['cli-sel-periodo','cli-sel-clasificacion','cli-sel-tipo'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', e => {
        const key = id === 'cli-sel-periodo'       ? 'periodo'
                  : id === 'cli-sel-clasificacion' ? 'clasificacion'
                  : 'tipo';
        _filtros[key] = e.target.value;
        aplicarFiltros(); refrescarTabla();
        if (id === 'cli-sel-periodo') { renderABC(); renderFrecuencia(); }
      });
    });

    /* Exportar */
    document.getElementById('cli-btn-csv')?.addEventListener('click', exportarCSV);

    /* Nuevo cliente → formulario NC */
    document.getElementById('cli-btn-nuevo')?.addEventListener('click', () => {
      window.open('https://form.jotform.com/261445908854063', '_blank');
    });

    bindOrdenamiento();
  }

  function bindOrdenamiento() {
    document.querySelectorAll('#cli-tabla thead [data-orden]').forEach(th => {
      th.addEventListener('click', () => {
        const campo = th.dataset.orden;
        if (_filtros.orden === campo) {
          _filtros.dirOrden = _filtros.dirOrden === 'asc' ? 'desc' : 'asc';
        } else {
          _filtros.orden    = campo;
          _filtros.dirOrden = 'desc';
        }
        aplicarFiltros(); refrescarTabla();
      });
    });
  }


  /* ==========================================================
     HELPERS
     ========================================================== */
  function waNro(tel) {
    if (!tel) return '';
    let t = tel.replace(/[\s\-\(\)\.]/g, '');
    if (t.startsWith('0')) t = '58' + t.slice(1);
    return t.replace('+','');
  }

  /* Escapar nombre para usarlo en atributo onclick */
  function escId(nombre) {
    return encodeURIComponent(nombre).replace(/'/g, '%27');
  }


  /* ==========================================================
     API PÚBLICA
     ========================================================== */
  return {
    render,
    verFicha,
    limpiarFiltros() {
      _filtros = { periodo: 'mes', clasificacion: 'todos', tipo: 'todos',
                   busqueda: '', orden: 'ventas', dirOrden: 'desc' };
      render();
    },
  };

})();

window.SCCR.ModuloClientes = ModuloClientes;
window.ModuloClientes       = ModuloClientes;
