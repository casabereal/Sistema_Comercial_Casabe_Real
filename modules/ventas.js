/* ============================================================
   SISTEMA COMERCIAL CASABE REAL
   modules/ventas.js — Módulo de Ventas
   v1.0.0
   ============================================================

   Responsabilidades:
   1.  Renderizar la vista completa de Ventas
   2.  Tabla de pedidos con búsqueda, filtros y paginación
   3.  KPIs de ventas por período
   4.  Vista de detalle de un pedido (modal)
   5.  Exportar pedidos a CSV / Excel
   6.  Indicadores por producto

   Escucha: sccr:activar-ventas
   Depende de: utils.js, motor.js
   ============================================================ */

'use strict';

window.SCCR = window.SCCR || {};

const ModuloVentas = (() => {

  /* ----------------------------------------------------------
     ESTADO
     ---------------------------------------------------------- */
  let _pedidos       = [];   /* pedidos filtrados actuales */
  let _paginaActual  = 1;
  let _porPagina     = 20;
  let _filtros       = {
    periodo:  'mes',
    vendedor: 'todos',
    tipo:     'todos',
    busqueda: '',
    orden:    'fecha',
    dirOrden: 'desc',
  };

  /* ----------------------------------------------------------
     REGISTRAR LISTENER
     ---------------------------------------------------------- */
  document.addEventListener('sccr:activar-ventas', onActivar);


  /* ==========================================================
     1. ACTIVACIÓN
     ========================================================== */
  function onActivar() {
    if (!SCCR.Motor?.estaListo()) {
      document.getElementById('view-ventas').innerHTML = `
        <div class="page-header">
          <h1 class="page-title">Ventas</h1>
        </div>
        ${SCCR.UI.vacio({ titulo: 'Cargando datos…', icono: 'loader', descripcion: 'Espera mientras se importan los pedidos.' })}`;
      return;
    }
    render();
  }


  /* ==========================================================
     2. RENDER PRINCIPAL
     ========================================================== */
  function render() {
    const view = document.getElementById('view-ventas');
    if (!view) return;

    SCCR.Log?.info('Ventas', 'Renderizando módulo');

    aplicarFiltros();

    view.innerHTML = `

      <!-- Page Header -->
      <div class="page-header flex items-center justify-between">
        <div>
          <h1 class="page-title">Ventas</h1>
          <p class="page-subtitle">Administración y consulta de pedidos</p>
        </div>
        <div class="flex gap-3">
          <button class="btn btn-secondary" id="vent-btn-csv">
            <i data-lucide="file-spreadsheet" style="width:15px;height:15px;"></i>
            Exportar CSV
          </button>
          <button class="btn btn-primary" id="vent-btn-nuevo">
            <i data-lucide="plus" style="width:15px;height:15px;"></i>
            Nuevo pedido
          </button>
        </div>
      </div>

      <!-- KPIs rápidos -->
      <div class="grid grid-4 mb-5" id="vent-kpis"></div>

      <!-- Filtros -->
      <div class="filter-bar mb-5" id="vent-filtros">

        <!-- Búsqueda -->
        <div class="search-input-wrap" style="flex:1;min-width:200px;max-width:320px;">
          <i data-lucide="search" class="search-input-wrap__icon" style="width:15px;height:15px;"></i>
          <input
            type="search"
            class="form-input"
            id="vent-busqueda"
            placeholder="Buscar cliente, vendedor, producto…"
            value="${SCCR.Texto.escaparHTML(_filtros.busqueda)}"
            autocomplete="off"
          />
        </div>

        <!-- Período -->
        <select class="form-select" id="vent-sel-periodo">
          <option value="hoy"    ${_filtros.periodo==='hoy'   ?'selected':''}>Hoy</option>
          <option value="semana" ${_filtros.periodo==='semana'?'selected':''}>Esta semana</option>
          <option value="mes"    ${_filtros.periodo==='mes'   ?'selected':''}>Este mes</option>
          <option value="ano"    ${_filtros.periodo==='ano'   ?'selected':''}>Este año</option>
          <option value="todo"   ${_filtros.periodo==='todo'  ?'selected':''}>Todo</option>
        </select>

        <!-- Tipo -->
        <select class="form-select" id="vent-sel-tipo">
          <option value="todos"      ${_filtros.tipo==='todos'     ?'selected':''}>Todos los tipos</option>
          <option value="recurrente" ${_filtros.tipo==='recurrente'?'selected':''}>Recurrentes</option>
          <option value="nuevo"      ${_filtros.tipo==='nuevo'     ?'selected':''}>Nuevos clientes</option>
        </select>

        <!-- Vendedor -->
        <select class="form-select" id="vent-sel-vendedor">
          <option value="todos">Todos los vendedores</option>
          ${vendedoresOpciones()}
        </select>

        <div class="filter-bar__spacer"></div>

        <!-- Contador -->
        <span class="text-sm text-secondary" id="vent-contador">
          ${_pedidos.length} pedidos
        </span>

      </div>

      <!-- Tabla -->
      <div class="table-wrap mb-5" id="vent-tabla-wrap">
        ${renderTabla()}
      </div>

      <!-- Paginación -->
      <div id="vent-paginacion"></div>

      <!-- Sección: Indicadores por producto -->
      <div class="card mt-5">
        <div class="card__header">
          <span class="card__title">Productos más vendidos</span>
          <span class="text-xs text-secondary" id="vent-prod-periodo"></span>
        </div>
        <div class="card__body" id="vent-productos"></div>
      </div>

    `;

    /* Poblar KPIs */
    renderKPIs();

    /* Poblar productos */
    renderProductos();

    /* Paginación */
    renderPaginacion();

    /* Eventos */
    bindEventos();

    lucide.createIcons();
  }


  /* ==========================================================
     3. KPIs DE VENTAS
     ========================================================== */
  function renderKPIs() {
    const el = document.getElementById('vent-kpis');
    if (!el) return;

    const kpis    = SCCR.Motor.calcularKPIs();
    const periodo = _filtros.periodo;

    const ventas  = { hoy: kpis.ventas_hoy,   semana: kpis.ventas_semana,
                      mes: kpis.ventas_mes,    ano: kpis.ventas_ano, todo: kpis.ventas_ano }[periodo];
    const pedidos = { hoy: kpis.pedidos_hoy,  semana: kpis.pedidos_semana,
                      mes: kpis.pedidos_mes,   ano: kpis.pedidos_mes, todo: kpis.pedidos_mes }[periodo];
    const cajas   = { hoy: kpis.cajas_hoy,    semana: kpis.cajas_semana,
                      mes: kpis.cajas_mes,     ano: kpis.cajas_mes, todo: kpis.cajas_mes }[periodo];

    el.innerHTML = [
      {
        label:    'Total ventas',
        valor:    SCCR.Numero.moneda(ventas),
        icono:    'dollar-sign',
        primario: true,
        periodo:  labelPeriodo(),
      },
      {
        label:   'Pedidos',
        valor:   SCCR.Numero.formato(pedidos),
        icono:   'shopping-cart',
        periodo: `${_pedidos.length} en vista`,
      },
      {
        label:   'Unidades',
        valor:   SCCR.Numero.formato(cajas),
        icono:   'package',
        periodo: 'Cajas vendidas',
      },
      {
        label:   'Ticket promedio',
        valor:   SCCR.Numero.moneda(kpis.ticket_promedio_mes),
        icono:   'receipt',
        periodo: 'Por pedido',
      },
    ].map(t => SCCR.UI.kpiHTML(t)).join('');
  }


  /* ==========================================================
     4. TABLA DE PEDIDOS
     ========================================================== */
  function renderTabla() {
    if (_pedidos.length === 0) {
      return SCCR.UI.vacio({
        titulo:      'Sin pedidos',
        descripcion: 'No hay pedidos que coincidan con los filtros seleccionados.',
        icono:       'shopping-cart',
        accion:      `<button class="btn btn-secondary" onclick="ModuloVentas.limpiarFiltros()">
                        Limpiar filtros
                      </button>`,
      });
    }

    /* Paginar */
    const inicio  = (_paginaActual - 1) * _porPagina;
    const fin     = inicio + _porPagina;
    const pagina  = _pedidos.slice(inicio, fin);

    return `
      <table class="table" id="vent-tabla">
        <thead>
          <tr>
            ${thOrdenable('fecha',          'Fecha')}
            ${thOrdenable('establecimiento','Cliente')}
            ${thOrdenable('vendedor',       'Vendedor')}
            <th>Productos</th>
            ${thOrdenable('cantidad_items', 'Uds.')}
            ${thOrdenable('total',          'Total')}
            <th>Tipo</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${pagina.map(p => filaTabla(p)).join('')}
        </tbody>
      </table>`;
  }

  function thOrdenable(campo, label) {
    const activo = _filtros.orden === campo;
    const icono  = activo
      ? (_filtros.dirOrden === 'asc' ? 'chevron-up' : 'chevron-down')
      : 'chevrons-up-down';
    return `
      <th style="cursor:pointer;white-space:nowrap;user-select:none;"
          data-orden="${campo}">
        ${label}
        <i data-lucide="${icono}" style="width:12px;height:12px;vertical-align:middle;margin-left:3px;"></i>
      </th>`;
  }

  function filaTabla(p) {
    const productos = p.productos.length > 0
      ? p.productos.slice(0, 2).map(pr =>
          `${SCCR.Texto.escaparHTML(pr.producto)} x${pr.cantidad}`
        ).join(', ') + (p.productos.length > 2 ? ` +${p.productos.length - 2}` : '')
      : SCCR.Texto.truncar(p.productos_texto || '—', 40);

    return `
      <tr>
        <td style="white-space:nowrap;">
          <div class="font-medium" style="font-size:13px;">${SCCR.Fecha.format(p.fecha)}</div>
          <div class="text-xs text-secondary">${SCCR.Fecha.relativo(p.fecha_registro || p.fecha)}</div>
        </td>
        <td>
          <div class="font-medium" style="font-size:13px;max-width:160px;" class="truncate">
            ${SCCR.Texto.escaparHTML(p.establecimiento)}
          </div>
          ${p.rif ? `<div class="text-xs text-secondary">${SCCR.Texto.escaparHTML(p.rif)}</div>` : ''}
        </td>
        <td>
          <div class="flex items-center gap-2">
            <div class="header__avatar" style="width:26px;height:26px;font-size:10px;flex-shrink:0;">
              ${SCCR.Texto.iniciales(p.vendedor)}
            </div>
            <span style="font-size:13px;">${SCCR.Texto.escaparHTML(p.vendedor)}</span>
          </div>
        </td>
        <td>
          <span class="text-sm" style="max-width:200px;display:block;" class="truncate">
            ${SCCR.Texto.escaparHTML(productos)}
          </span>
        </td>
        <td class="text-center font-medium">${p.cantidad_items}</td>
        <td class="font-semibold" style="white-space:nowrap;">${SCCR.Numero.moneda(p.total)}</td>
        <td>
          ${p.es_nuevo_cliente
            ? SCCR.UI.badge('Nuevo', 'new')
            : SCCR.UI.badge('Recurrente', 'active')}
        </td>
        <td>
          <div class="table__actions">
            <button
              class="btn btn-ghost btn-icon btn-sm"
              title="Ver detalle"
              data-id="${p.id}"
              onclick="ModuloVentas.verDetalle('${p.id}')"
            >
              <i data-lucide="eye" style="width:15px;height:15px;"></i>
            </button>
          </div>
        </td>
      </tr>`;
  }


  /* ==========================================================
     5. PAGINACIÓN
     ========================================================== */
  function renderPaginacion() {
    const el = document.getElementById('vent-paginacion');
    if (!el) return;

    const totalPaginas = Math.ceil(_pedidos.length / _porPagina);
    if (totalPaginas <= 1) { el.innerHTML = ''; return; }

    const paginas = paginasVisibles(totalPaginas);

    el.innerHTML = `
      <div class="flex items-center justify-between" style="padding:var(--space-4) 0;">
        <span class="text-sm text-secondary">
          Mostrando ${Math.min((_paginaActual - 1) * _porPagina + 1, _pedidos.length)}–${Math.min(_paginaActual * _porPagina, _pedidos.length)}
          de ${_pedidos.length} pedidos
        </span>
        <div class="flex gap-2">
          <button class="btn btn-secondary btn-sm" id="pag-ant"
            ${_paginaActual === 1 ? 'disabled' : ''}>
            <i data-lucide="chevron-left" style="width:14px;height:14px;"></i>
          </button>
          ${paginas.map(p => p === '…'
            ? `<span class="btn btn-ghost btn-sm" style="cursor:default;">…</span>`
            : `<button class="btn btn-sm ${p === _paginaActual ? 'btn-primary' : 'btn-secondary'}"
                data-pag="${p}">${p}</button>`
          ).join('')}
          <button class="btn btn-secondary btn-sm" id="pag-sig"
            ${_paginaActual === totalPaginas ? 'disabled' : ''}>
            <i data-lucide="chevron-right" style="width:14px;height:14px;"></i>
          </button>
        </div>
        <select class="form-select" id="vent-por-pagina" style="width:auto;">
          ${[10,20,50,100].map(n =>
            `<option value="${n}" ${n === _porPagina ? 'selected' : ''}>${n} por página</option>`
          ).join('')}
        </select>
      </div>`;

    /* Bind paginación */
    el.querySelectorAll('[data-pag]').forEach(btn => {
      btn.addEventListener('click', () => {
        _paginaActual = parseInt(btn.dataset.pag);
        refrescarTabla();
      });
    });
    document.getElementById('pag-ant')?.addEventListener('click', () => {
      if (_paginaActual > 1) { _paginaActual--; refrescarTabla(); }
    });
    document.getElementById('pag-sig')?.addEventListener('click', () => {
      if (_paginaActual < totalPaginas) { _paginaActual++; refrescarTabla(); }
    });
    document.getElementById('vent-por-pagina')?.addEventListener('change', e => {
      _porPagina    = parseInt(e.target.value);
      _paginaActual = 1;
      refrescarTabla();
    });
  }

  function paginasVisibles(total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const p = _paginaActual;
    if (p <= 4) return [1,2,3,4,5,'…',total];
    if (p >= total - 3) return [1,'…',total-4,total-3,total-2,total-1,total];
    return [1,'…',p-1,p,p+1,'…',total];
  }


  /* ==========================================================
     6. PRODUCTOS MÁS VENDIDOS
     ========================================================== */
  function renderProductos() {
    const el   = document.getElementById('vent-productos');
    const lbl  = document.getElementById('vent-prod-periodo');
    if (!el) return;

    if (lbl) lbl.textContent = labelPeriodo();

    /* Agregar productos de los pedidos filtrados */
    const conteo = {};
    _pedidos.forEach(p => {
      p.productos.forEach(pr => {
        const nombre = pr.producto || 'Sin nombre';
        if (!conteo[nombre]) conteo[nombre] = { cantidad: 0, monto: 0, pedidos: 0 };
        conteo[nombre].cantidad += pr.cantidad;
        conteo[nombre].monto   += pr.subtotal;
        conteo[nombre].pedidos++;
      });
    });

    const lista = Object.entries(conteo)
      .map(([nombre, v]) => ({ nombre, ...v }))
      .sort((a, b) => b.monto - a.monto)
      .slice(0, 10);

    if (lista.length === 0) {
      el.innerHTML = SCCR.UI.vacio({ titulo: 'Sin datos de productos', icono: 'package' });
      return;
    }

    const maxMonto = lista[0].monto;

    el.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:var(--space-3);">
        ${lista.map((prod, i) => {
          const pct = maxMonto > 0 ? (prod.monto / maxMonto) * 100 : 0;
          return `
            <div style="display:grid;grid-template-columns:24px 1fr auto;gap:var(--space-3);align-items:center;">
              <span class="text-xs text-secondary text-right font-semibold">${i + 1}</span>
              <div>
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                  <span class="font-medium" style="font-size:13px;">
                    ${SCCR.Texto.escaparHTML(prod.nombre)}
                  </span>
                  <span class="text-xs text-secondary">
                    ${prod.cantidad} und · ${prod.pedidos} ped.
                  </span>
                </div>
                <div class="progress" style="height:6px;">
                  <div class="progress__bar" style="width:${pct}%;background:${i === 0 ? 'var(--color-primary)' : 'var(--color-text-secondary)'};"></div>
                </div>
              </div>
              <span class="font-semibold" style="font-size:13px;white-space:nowrap;min-width:80px;text-align:right;">
                ${SCCR.Numero.moneda(prod.monto)}
              </span>
            </div>`;
        }).join('')}
      </div>`;
  }


  /* ==========================================================
     7. MODAL DE DETALLE DE PEDIDO
     ========================================================== */
  function verDetalle(id) {
    const pedido = SCCR.Motor.pedidos().find(p => p.id === id);
    if (!pedido) return;

    const body = `
      <!-- Cabecera del pedido -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);margin-bottom:var(--space-5);">
        <div>
          <div class="text-xs text-secondary" style="text-transform:uppercase;letter-spacing:.05em;">Cliente</div>
          <div class="font-semibold mt-1">${SCCR.Texto.escaparHTML(pedido.establecimiento)}</div>
          ${pedido.rif ? `<div class="text-xs text-secondary mt-1">RIF: ${SCCR.Texto.escaparHTML(pedido.rif)}</div>` : ''}
        </div>
        <div>
          <div class="text-xs text-secondary" style="text-transform:uppercase;letter-spacing:.05em;">Vendedor</div>
          <div class="flex items-center gap-2 mt-1">
            <div class="header__avatar" style="width:28px;height:28px;font-size:11px;flex-shrink:0;">
              ${SCCR.Texto.iniciales(pedido.vendedor)}
            </div>
            <span class="font-medium">${SCCR.Texto.escaparHTML(pedido.vendedor)}</span>
          </div>
        </div>
        <div>
          <div class="text-xs text-secondary" style="text-transform:uppercase;letter-spacing:.05em;">Fecha del pedido</div>
          <div class="font-medium mt-1">${SCCR.Fecha.format(pedido.fecha, 'largo')}</div>
        </div>
        <div>
          <div class="text-xs text-secondary" style="text-transform:uppercase;letter-spacing:.05em;">Tipo</div>
          <div class="mt-1">
            ${pedido.es_nuevo_cliente
              ? SCCR.UI.badge('Nuevo cliente', 'new')
              : SCCR.UI.badge('Cliente recurrente', 'active')}
          </div>
        </div>
      </div>

      <hr class="divider" />

      <!-- Tabla de productos -->
      <div class="text-xs text-secondary" style="text-transform:uppercase;letter-spacing:.05em;margin-bottom:var(--space-3);">
        Productos pedidos
      </div>
      ${pedido.productos.length > 0 ? `
        <div class="table-wrap" style="margin-bottom:var(--space-4);">
          <table class="table">
            <thead>
              <tr>
                <th>Producto</th>
                <th style="text-align:center;">Cant.</th>
                <th style="text-align:right;">Precio</th>
                <th style="text-align:right;">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${pedido.productos.map(pr => `
                <tr>
                  <td>${SCCR.Texto.escaparHTML(pr.producto)}</td>
                  <td style="text-align:center;">${pr.cantidad}</td>
                  <td style="text-align:right;">${SCCR.Numero.moneda(pr.precio)}</td>
                  <td style="text-align:right;" class="font-semibold">${SCCR.Numero.moneda(pr.subtotal)}</td>
                </tr>`).join('')}
            </tbody>
            <tfoot>
              <tr style="background:var(--color-bg);">
                <td colspan="2" class="font-semibold">Total</td>
                <td style="text-align:center;" class="text-secondary text-sm">${pedido.cantidad_items} und.</td>
                <td style="text-align:right;" class="font-semibold text-primary" style="color:var(--color-primary);">
                  ${SCCR.Numero.moneda(pedido.total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>` : `
        <div class="alert alert-info" style="margin-bottom:var(--space-4);">
          <i data-lucide="info" style="width:14px;height:14px;" class="alert__icon"></i>
          <span class="text-sm">${SCCR.Texto.escaparHTML(pedido.productos_texto || 'Sin detalle de productos disponible.')}</span>
        </div>`}

      <!-- Contactos -->
      <hr class="divider" />
      <div class="text-xs text-secondary" style="text-transform:uppercase;letter-spacing:.05em;margin-bottom:var(--space-3);">
        Información de contacto
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);">
        ${pedido.contacto_compras ? `
          <div>
            <div class="text-xs text-secondary">Contacto Compras</div>
            <div class="font-medium text-sm mt-1">${SCCR.Texto.escaparHTML(pedido.contacto_compras)}</div>
            ${pedido.telefono_compras ? `
              <a href="https://wa.me/${limpiarTelefono(pedido.telefono_compras)}" target="_blank"
                 class="flex items-center gap-1 text-sm mt-1" style="color:var(--color-primary);">
                <i data-lucide="phone" style="width:13px;height:13px;"></i>
                ${SCCR.Texto.escaparHTML(pedido.telefono_compras)}
              </a>` : ''}
          </div>` : ''}
        ${pedido.contacto_pagos ? `
          <div>
            <div class="text-xs text-secondary">Contacto Pagos</div>
            <div class="font-medium text-sm mt-1">${SCCR.Texto.escaparHTML(pedido.contacto_pagos)}</div>
            ${pedido.telefono_pagos ? `
              <a href="https://wa.me/${limpiarTelefono(pedido.telefono_pagos)}" target="_blank"
                 class="flex items-center gap-1 text-sm mt-1" style="color:var(--color-primary);">
                <i data-lucide="phone" style="width:13px;height:13px;"></i>
                ${SCCR.Texto.escaparHTML(pedido.telefono_pagos)}
              </a>` : ''}
          </div>` : ''}
      </div>

      ${pedido.rif_imagen_url ? `
        <hr class="divider" />
        <div class="text-xs text-secondary" style="text-transform:uppercase;letter-spacing:.05em;margin-bottom:var(--space-3);">
          RIF del cliente
        </div>
        <a href="${pedido.rif_imagen_url}" target="_blank">
          <img src="${pedido.rif_imagen_url}" alt="RIF"
               style="max-width:100%;border-radius:var(--radius-md);border:1px solid var(--color-border);" />
        </a>` : ''}
    `;

    const footer = `
      <a href="https://wa.me/${limpiarTelefono(pedido.telefono_compras)}" target="_blank"
         class="btn btn-secondary" ${!pedido.telefono_compras ? 'style="display:none;"' : ''}>
        <i data-lucide="message-circle" style="width:15px;height:15px;"></i>
        WhatsApp
      </a>
      <button class="btn btn-ghost" onclick="SCCR.closeModal()">Cerrar</button>
    `;

    SCCR.openModal({
      title:  `Pedido — ${SCCR.Texto.escaparHTML(pedido.establecimiento)}`,
      body,
      footer,
    });
    lucide.createIcons();
  }

  function limpiarTelefono(tel) {
    if (!tel) return '';
    let t = tel.replace(/[\s\-\(\)\.]/g, '');
    if (t.startsWith('0')) t = '58' + t.slice(1);
    if (!t.startsWith('+')) t = '+' + t;
    return t.replace('+', '');
  }


  /* ==========================================================
     8. EXPORTAR CSV
     ========================================================== */
  function exportarCSV() {
    const filas = SCCR.Motor.exportar(_filtros.periodo);
    if (filas.length === 0) {
      SCCR.toast?.('No hay datos para exportar', 'warning');
      return;
    }

    const cabeceras = Object.keys(filas[0]);
    const csv = [
      cabeceras.join(';'),
      ...filas.map(f =>
        cabeceras.map(k => {
          const v = String(f[k] ?? '').replace(/"/g, '""');
          return `"${v}"`;
        }).join(';')
      ),
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `ventas_${_filtros.periodo}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    SCCR.toast?.(`${filas.length} pedidos exportados`, 'success');
    SCCR.Log?.info('Ventas', `CSV exportado: ${filas.length} filas`);
  }


  /* ==========================================================
     9. FILTROS Y ORDENAMIENTO
     ========================================================== */
  function aplicarFiltros() {
    let base = SCCR.Motor.filtrarPorPeriodo(_filtros.periodo);
    base = SCCR.Motor.filtrarPorVendedor(base, _filtros.vendedor);
    base = SCCR.Motor.filtrarPorTipo(base, _filtros.tipo);
    base = SCCR.Motor.filtrarPorTexto(base, _filtros.busqueda);

    /* Ordenamiento */
    _pedidos = SCCR.Coleccion.ordenar(base, _filtros.orden, _filtros.dirOrden);
    _paginaActual = 1;
  }

  function refrescarTabla() {
    const wrap = document.getElementById('vent-tabla-wrap');
    if (wrap) wrap.innerHTML = renderTabla();
    renderPaginacion();
    renderKPIs();

    const contador = document.getElementById('vent-contador');
    if (contador) contador.textContent = `${_pedidos.length} pedidos`;

    bindOrdenamiento();
    lucide.createIcons();
  }


  /* ==========================================================
     10. EVENTOS
     ========================================================== */
  function bindEventos() {

    /* Búsqueda con debounce */
    const inputBusq = document.getElementById('vent-busqueda');
    if (inputBusq) {
      inputBusq.addEventListener('input', SCCR.debounce(e => {
        _filtros.busqueda = e.target.value.trim();
        aplicarFiltros();
        refrescarTabla();
      }, 300));
    }

    /* Selectores de filtro */
    const selPeriodo = document.getElementById('vent-sel-periodo');
    if (selPeriodo) {
      selPeriodo.addEventListener('change', e => {
        _filtros.periodo = e.target.value;
        aplicarFiltros();
        refrescarTabla();
        renderProductos();
      });
    }

    const selTipo = document.getElementById('vent-sel-tipo');
    if (selTipo) {
      selTipo.addEventListener('change', e => {
        _filtros.tipo = e.target.value;
        aplicarFiltros();
        refrescarTabla();
      });
    }

    const selVendedor = document.getElementById('vent-sel-vendedor');
    if (selVendedor) {
      selVendedor.value = _filtros.vendedor;
      selVendedor.addEventListener('change', e => {
        _filtros.vendedor = e.target.value;
        aplicarFiltros();
        refrescarTabla();
      });
    }

    /* Exportar CSV */
    document.getElementById('vent-btn-csv')?.addEventListener('click', exportarCSV);

    /* Nuevo pedido — abre Jotform en nueva pestaña */
    document.getElementById('vent-btn-nuevo')?.addEventListener('click', () => {
      window.open('https://form.jotform.com/222905670810655', '_blank');
    });

    /* Ordenamiento de columnas */
    bindOrdenamiento();
  }

  function bindOrdenamiento() {
    document.querySelectorAll('#vent-tabla thead [data-orden]').forEach(th => {
      th.addEventListener('click', () => {
        const campo = th.dataset.orden;
        if (_filtros.orden === campo) {
          _filtros.dirOrden = _filtros.dirOrden === 'asc' ? 'desc' : 'asc';
        } else {
          _filtros.orden    = campo;
          _filtros.dirOrden = 'desc';
        }
        aplicarFiltros();
        refrescarTabla();
      });
    });
  }


  /* ==========================================================
     HELPERS
     ========================================================== */
  function vendedoresOpciones() {
    const vendedores = [...new Set(SCCR.Motor.pedidos().map(p => p.vendedor))].sort();
    return vendedores.map(v => `
      <option value="${SCCR.Texto.escaparHTML(v)}"
        ${_filtros.vendedor === v ? 'selected' : ''}>
        ${SCCR.Texto.escaparHTML(v)}
      </option>`).join('');
  }

  function labelPeriodo() {
    return { hoy: 'Hoy', semana: 'Esta semana', mes: 'Este mes', ano: 'Este año', todo: 'Histórico' }[_filtros.periodo] || '';
  }


  /* ==========================================================
     API PÚBLICA
     ========================================================== */
  return {
    render,
    verDetalle,
    limpiarFiltros() {
      _filtros = { periodo: 'mes', vendedor: 'todos', tipo: 'todos', busqueda: '', orden: 'fecha', dirOrden: 'desc' };
      render();
    },
  };

})();

window.SCCR.ModuloVentas = ModuloVentas;
window.ModuloVentas       = ModuloVentas;   /* acceso directo desde onclick */
