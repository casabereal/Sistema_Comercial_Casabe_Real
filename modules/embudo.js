/* ============================================================
   SISTEMA COMERCIAL CASABE REAL
   modules/embudo.js — Módulo Embudo Comercial
   v1.0.0
   ============================================================

   Responsabilidades:
   1.  Tablero Kanban con las 6 etapas del embudo
   2.  Tarjetas de oportunidades arrastrables entre etapas
   3.  KPIs del embudo (conversión, valor, velocidad)
   4.  Gráfico de embudo (funnel)
   5.  Agregar / editar / eliminar oportunidades
   6.  Persistencia en localStorage (data/embudo.json como fallback)

   Etapas:
   prospecto → contacto → presentacion → negociacion → pedido → cliente_activo

   Escucha: sccr:activar-embudo
   Depende de: utils.js, motor.js, Chart.js
   ============================================================ */

'use strict';

window.SCCR = window.SCCR || {};

const ModuloEmbudo = (() => {

  /* ----------------------------------------------------------
     ESTADO
     ---------------------------------------------------------- */
  const ETAPAS = [
    { clave: 'prospecto',      label: 'Prospecto',      color: '#B2BEC3', icono: 'user'         },
    { clave: 'contacto',       label: 'Contacto',       color: '#7F8C8D', icono: 'phone'        },
    { clave: 'presentacion',   label: 'Presentación',   color: '#F39C12', icono: 'presentation' },
    { clave: 'negociacion',    label: 'Negociación',    color: '#F1C40F', icono: 'handshake'    },
    { clave: 'pedido',         label: 'Pedido',         color: '#D71920', icono: 'shopping-cart' },
    { clave: 'cliente_activo', label: 'Cliente Activo', color: '#27AE60', icono: 'star'         },
  ];

  let _oportunidades = [];   /* array de oportunidades */
  let _drag          = null; /* oportunidad que se está arrastrando */
  let _grafico       = null;

  /* ----------------------------------------------------------
     LISTENER
     ---------------------------------------------------------- */
  document.addEventListener('sccr:activar-embudo', onActivar);


  /* ==========================================================
     1. ACTIVACIÓN
     ========================================================== */
  function onActivar() {
    cargarOportunidades();
    render();
  }


  /* ==========================================================
     2. PERSISTENCIA
     ========================================================== */
  function cargarOportunidades() {
    const guardadas = SCCR.Store.get('embudo_oportunidades', []);
    if (guardadas.length > 0) {
      _oportunidades = guardadas;
      return;
    }

    /* Generar desde pedidos recientes como punto de partida */
    const pedidos = SCCR.Motor?.pedidos() || [];
    const recientes = pedidos
      .filter(p => SCCR.Fecha.diasDesde(p.fecha) <= 30)
      .slice(0, 10);

    _oportunidades = recientes.map((p, i) => ({
      id:            `opp_${p.id || i}`,
      nombre:        p.establecimiento,
      vendedor:      p.vendedor,
      valor:         p.total || 0,
      etapa:         'pedido',
      fecha_ingreso: p.fecha || new Date().toISOString().split('T')[0],
      fecha_update:  new Date().toISOString().split('T')[0],
      notas:         '',
      telefono:      p.telefono_compras || '',
      contacto:      p.contacto_compras || '',
      es_nuevo:      p.es_nuevo_cliente || false,
    }));

    guardarOportunidades();
  }

  function guardarOportunidades() {
    SCCR.Store.set('embudo_oportunidades', _oportunidades);
  }


  /* ==========================================================
     3. RENDER PRINCIPAL
     ========================================================== */
  function render() {
    const view = document.getElementById('view-embudo');
    if (!view) return;

    SCCR.Log?.info('Embudo', `Renderizando — ${_oportunidades.length} oportunidades`);

    view.innerHTML = `

      <!-- Header -->
      <div class="page-header flex items-center justify-between">
        <div>
          <h1 class="page-title">Embudo Comercial</h1>
          <p class="page-subtitle">Gestión de oportunidades de venta</p>
        </div>
        <div class="flex gap-3">
          <button class="btn btn-secondary" id="emb-btn-csv">
            <i data-lucide="file-spreadsheet" style="width:15px;height:15px;"></i>
            Exportar
          </button>
          <button class="btn btn-primary" id="emb-btn-nueva">
            <i data-lucide="plus" style="width:15px;height:15px;"></i>
            Nueva oportunidad
          </button>
        </div>
      </div>

      <!-- KPIs -->
      <div class="grid grid-4 mb-5" id="emb-kpis"></div>

      <!-- Filtros -->
      <div class="filter-bar mb-5">
        <div class="search-input-wrap" style="flex:1;min-width:180px;max-width:280px;">
          <i data-lucide="search" class="search-input-wrap__icon" style="width:15px;height:15px;"></i>
          <input type="search" class="form-input" id="emb-busqueda"
            placeholder="Buscar oportunidad…" autocomplete="off"/>
        </div>
        <select class="form-select" id="emb-sel-vendedor">
          <option value="todos">Todos los vendedores</option>
          ${vendedoresOpciones()}
        </select>
        <div class="filter-bar__spacer"></div>
        <span class="text-sm text-secondary" id="emb-contador">
          ${_oportunidades.length} oportunidades
        </span>
      </div>

      <!-- Kanban -->
      <div class="kanban mb-5" id="emb-kanban"></div>

      <!-- Gráfico de embudo + tabla resumen -->
      <div class="grid grid-2" style="gap:var(--space-5);">

        <div class="chart-container">
          <div class="chart-container__header">
            <span class="chart-container__title">Visualización del embudo</span>
          </div>
          <div class="chart-container__body" style="min-height:300px;">
            <canvas id="emb-chart-funnel"></canvas>
          </div>
        </div>

        <div class="card">
          <div class="card__header">
            <span class="card__title">Resumen por etapa</span>
          </div>
          <div class="card__body p-4" id="emb-resumen-etapas"></div>
        </div>

      </div>

    `;

    renderKPIs();
    renderKanban();
    renderGrafico();
    renderResumenEtapas();
    bindEventos();
    lucide.createIcons();
  }


  /* ==========================================================
     4. KPIs DEL EMBUDO
     ========================================================== */
  function renderKPIs() {
    const el = document.getElementById('emb-kpis');
    if (!el) return;

    const total      = _oportunidades.length;
    const valorTotal = _oportunidades.reduce((s, o) => s + (o.valor || 0), 0);
    const enPedido   = _oportunidades.filter(o => o.etapa === 'pedido').length;
    const activos    = _oportunidades.filter(o => o.etapa === 'cliente_activo').length;

    /* Tasa de conversión: cliente_activo / total */
    const tasaConv = total > 0
      ? SCCR.Numero.redondear((activos / total) * 100, 1)
      : 0;

    /* Velocidad promedio: días desde ingreso al embudo */
    const tiempos = _oportunidades
      .filter(o => o.etapa === 'cliente_activo' || o.etapa === 'pedido')
      .map(o => SCCR.Fecha.diasDesde(o.fecha_ingreso) || 0);
    const velocidad = tiempos.length > 0
      ? SCCR.Numero.redondear(tiempos.reduce((s, d) => s + d, 0) / tiempos.length, 0)
      : 0;

    el.innerHTML = [
      {
        label:    'Oportunidades activas',
        valor:    SCCR.Numero.formato(total),
        icono:    'filter',
        primario: true,
        periodo:  'En el embudo',
      },
      {
        label:   'Valor potencial',
        valor:   SCCR.Numero.moneda(valorTotal),
        icono:   'dollar-sign',
        periodo: 'Todas las etapas',
      },
      {
        label:   'Tasa de conversión',
        valor:   `${tasaConv} %`,
        icono:   'trending-up',
        periodo: `${activos} clientes activos`,
      },
      {
        label:   'Velocidad promedio',
        valor:   velocidad > 0 ? `${velocidad}d` : '—',
        icono:   'timer',
        periodo: 'Días hasta pedido',
      },
    ].map(t => SCCR.UI.kpiHTML(t)).join('');
  }


  /* ==========================================================
     5. KANBAN
     ========================================================== */
  function renderKanban(filtro = '', vendedor = 'todos') {
    const kanban = document.getElementById('emb-kanban');
    if (!kanban) return;

    const q = SCCR.Texto.normalizar(filtro);

    const filtradas = _oportunidades.filter(o => {
      const matchBusq = !q ||
        SCCR.Texto.normalizar(o.nombre).includes(q) ||
        SCCR.Texto.normalizar(o.vendedor).includes(q);
      const matchVend = vendedor === 'todos' ||
        SCCR.Texto.normalizar(o.vendedor) === SCCR.Texto.normalizar(vendedor);
      return matchBusq && matchVend;
    });

    kanban.innerHTML = ETAPAS.map(etapa => {
      const tarjetas = filtradas.filter(o => o.etapa === etapa.clave);
      const valorEt  = tarjetas.reduce((s, o) => s + (o.valor || 0), 0);

      return `
        <div class="kanban__column"
          data-etapa="${etapa.clave}"
          id="kanban-col-${etapa.clave}">

          <!-- Header columna -->
          <div class="kanban__col-header">
            <div class="flex items-center gap-2">
              <div style="width:10px;height:10px;border-radius:50%;
                background:${etapa.color};flex-shrink:0;"></div>
              <span class="kanban__col-title">${etapa.label}</span>
            </div>
            <span class="kanban__col-count">${tarjetas.length}</span>
          </div>

          <!-- Valor de la etapa -->
          ${valorEt > 0 ? `
            <div style="font-size:11px;color:var(--color-text-muted);
                 margin-bottom:var(--space-3);font-weight:600;">
              ${SCCR.Numero.moneda(valorEt)}
            </div>` : ''}

          <!-- Tarjetas -->
          <div class="kanban__cards" id="cards-${etapa.clave}"
            style="min-height:60px;">
            ${tarjetas.length === 0
              ? `<div style="border:2px dashed var(--color-border);border-radius:var(--radius-md);
                   height:60px;display:flex;align-items:center;justify-content:center;">
                   <span style="font-size:11px;color:var(--color-text-muted);">Arrastrar aquí</span>
                 </div>`
              : tarjetas.map(o => tarjetaHTML(o, etapa.color)).join('')}
          </div>

          <!-- Botón agregar -->
          <button class="btn btn-ghost btn-sm w-full mt-2"
            style="border:1px dashed var(--color-border);font-size:11px;color:var(--color-text-muted);"
            onclick="ModuloEmbudo.abrirModalOportunidad(null, '${etapa.clave}')">
            <i data-lucide="plus" style="width:12px;height:12px;"></i>
            Agregar
          </button>

        </div>`;
    }).join('');

    /* Activar drag & drop */
    bindDragDrop();
  }

  function tarjetaHTML(o, colorEtapa) {
    const diasEnEtapa = SCCR.Fecha.diasDesde(o.fecha_update);
    const urgente     = diasEnEtapa >= 7 && o.etapa !== 'cliente_activo';

    return `
      <div class="kanban__card ${urgente ? 'kanban__card--warning' : ''}"
        draggable="true"
        data-id="${o.id}"
        id="card-${o.id}"
        style="border-left-color:${colorEtapa};"
        ondragstart="ModuloEmbudo._dragStart(event, '${o.id}')"
        ondragend="ModuloEmbudo._dragEnd(event)">

        <!-- Nombre -->
        <div class="font-semibold" style="font-size:13px;line-height:1.3;margin-bottom:4px;">
          ${SCCR.Texto.escaparHTML(SCCR.Texto.truncar(o.nombre, 28))}
        </div>

        <!-- Vendedor -->
        <div class="flex items-center gap-1 mb-2">
          <div class="header__avatar"
            style="width:18px;height:18px;font-size:8px;flex-shrink:0;">
            ${SCCR.Texto.iniciales(o.vendedor)}
          </div>
          <span style="font-size:11px;color:var(--color-text-secondary);">
            ${SCCR.Texto.escaparHTML(o.vendedor)}
          </span>
        </div>

        <!-- Footer de la tarjeta -->
        <div class="flex items-center justify-between">
          <span style="font-size:12px;font-weight:700;color:var(--color-text-primary);">
            ${o.valor > 0 ? SCCR.Numero.moneda(o.valor) : '—'}
          </span>
          <div class="flex items-center gap-2">
            ${urgente
              ? `<span title="${diasEnEtapa} días en esta etapa"
                   style="font-size:10px;color:var(--color-warning);font-weight:700;">
                   ⏱ ${diasEnEtapa}d
                 </span>`
              : `<span style="font-size:10px;color:var(--color-text-muted);">
                   ${diasEnEtapa}d
                 </span>`}
            <button class="btn btn-ghost btn-sm"
              style="width:22px;height:22px;padding:0;"
              onclick="event.stopPropagation();ModuloEmbudo.abrirModalOportunidad('${o.id}')">
              <i data-lucide="pencil" style="width:12px;height:12px;"></i>
            </button>
          </div>
        </div>

        ${o.notas ? `
          <div style="font-size:11px;color:var(--color-text-muted);
               margin-top:6px;border-top:1px solid var(--color-border);padding-top:4px;
               white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            💬 ${SCCR.Texto.escaparHTML(SCCR.Texto.truncar(o.notas, 40))}
          </div>` : ''}

      </div>`;
  }


  /* ==========================================================
     6. DRAG & DROP
     ========================================================== */
  function bindDragDrop() {
    /* Zonas de drop: columnas */
    document.querySelectorAll('.kanban__column').forEach(col => {
      col.addEventListener('dragover', e => {
        e.preventDefault();
        col.style.background = 'rgba(215,25,32,0.04)';
      });
      col.addEventListener('dragleave', () => {
        col.style.background = '';
      });
      col.addEventListener('drop', e => {
        e.preventDefault();
        col.style.background = '';

        const id    = e.dataTransfer.getData('text/plain');
        const etapa = col.dataset.etapa;
        if (!id || !etapa) return;

        const opp = _oportunidades.find(o => o.id === id);
        if (opp && opp.etapa !== etapa) {
          opp.etapa       = etapa;
          opp.fecha_update = new Date().toISOString().split('T')[0];
          guardarOportunidades();
          renderKanban(
            document.getElementById('emb-busqueda')?.value || '',
            document.getElementById('emb-sel-vendedor')?.value || 'todos'
          );
          renderKPIs();
          renderGrafico();
          renderResumenEtapas();
          lucide.createIcons();
          SCCR.toast?.(`Movido a ${ETAPAS.find(e => e.clave === etapa)?.label}`, 'success', 2000);
        }
      });
    });
  }

  /* Exponer para uso en atributos HTML */
  function _dragStart(e, id) {
    _drag = id;
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
    const card = document.getElementById(`card-${id}`);
    if (card) card.style.opacity = '0.5';
  }

  function _dragEnd(e) {
    if (_drag) {
      const card = document.getElementById(`card-${_drag}`);
      if (card) card.style.opacity = '';
    }
    _drag = null;
  }


  /* ==========================================================
     7. GRÁFICO DE EMBUDO
     ========================================================== */
  function renderGrafico() {
    const canvas = document.getElementById('emb-chart-funnel');
    if (!canvas) return;

    if (_grafico) _grafico.destroy();

    const datos = ETAPAS.map(e => ({
      etapa:    e.label,
      cantidad: _oportunidades.filter(o => o.etapa === e.clave).length,
      valor:    _oportunidades.filter(o => o.etapa === e.clave)
                  .reduce((s, o) => s + (o.valor || 0), 0),
      color:    e.color,
    }));

    _grafico = new Chart(canvas, {
      type: 'bar',
      data: {
        labels:   datos.map(d => d.etapa),
        datasets: [{
          label:           'Oportunidades',
          data:            datos.map(d => d.cantidad),
          backgroundColor: datos.map(d => d.color + 'CC'),
          borderColor:     datos.map(d => d.color),
          borderWidth:     1.5,
          borderRadius:    6,
          borderSkipped:   false,
        }],
      },
      options: {
        indexAxis:           'y',   /* barras horizontales = embudo visual */
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
              label: ctx => {
                const d = datos[ctx.dataIndex];
                return [
                  ` ${d.cantidad} oportunidad${d.cantidad !== 1 ? 'es' : ''}`,
                  ` Valor: ${SCCR.Numero.moneda(d.valor)}`,
                ];
              },
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            grid:        { color: '#F0F2F5', drawBorder: false },
            ticks:       { color: '#7F8C8D', font: { family: 'Montserrat', size: 11 }, stepSize: 1 },
          },
          y: {
            grid:  { display: false },
            ticks: { color: '#7F8C8D', font: { family: 'Montserrat', size: 11 } },
          },
        },
      },
    });
  }


  /* ==========================================================
     8. RESUMEN POR ETAPA
     ========================================================== */
  function renderResumenEtapas() {
    const el = document.getElementById('emb-resumen-etapas');
    if (!el) return;

    const total      = _oportunidades.length;
    const valorTotal = _oportunidades.reduce((s, o) => s + (o.valor || 0), 0);

    el.innerHTML = `
      <table class="table">
        <thead>
          <tr>
            <th>Etapa</th>
            <th style="text-align:center;">Opor.</th>
            <th style="text-align:right;">Valor</th>
            <th style="text-align:center;">% total</th>
          </tr>
        </thead>
        <tbody>
          ${ETAPAS.map(etapa => {
            const opps  = _oportunidades.filter(o => o.etapa === etapa.clave);
            const valor = opps.reduce((s, o) => s + (o.valor || 0), 0);
            const pct   = total > 0
              ? SCCR.Numero.redondear((opps.length / total) * 100, 0) : 0;

            return `
              <tr>
                <td>
                  <div class="flex items-center gap-2">
                    <div style="width:10px;height:10px;border-radius:50%;
                      background:${etapa.color};flex-shrink:0;"></div>
                    <span class="font-medium" style="font-size:13px;">${etapa.label}</span>
                  </div>
                </td>
                <td style="text-align:center;" class="font-semibold">${opps.length}</td>
                <td style="text-align:right;">${SCCR.Numero.moneda(valor)}</td>
                <td style="text-align:center;">
                  <span class="text-xs text-secondary">${pct}%</span>
                </td>
              </tr>`;
          }).join('')}
        </tbody>
        <tfoot>
          <tr style="background:var(--color-bg);">
            <td class="font-semibold">Total</td>
            <td style="text-align:center;" class="font-semibold">${total}</td>
            <td style="text-align:right;" class="font-semibold">${SCCR.Numero.moneda(valorTotal)}</td>
            <td style="text-align:center;" class="text-secondary text-xs">100%</td>
          </tr>
        </tfoot>
      </table>`;
  }


  /* ==========================================================
     9. MODAL DE OPORTUNIDAD
     ========================================================== */
  function abrirModalOportunidad(id = null, etapaInicial = 'prospecto') {
    const opp = id ? _oportunidades.find(o => o.id === id) : null;
    const esNueva = !opp;
    const vendedores = [...new Set(SCCR.Motor.pedidos().map(p => p.vendedor))].sort();

    const body = `
      <div style="display:flex;flex-direction:column;gap:var(--space-4);">

        <div class="form-group">
          <label class="form-label">Nombre del cliente / establecimiento *</label>
          <input type="text" class="form-input" id="emb-f-nombre"
            value="${opp ? SCCR.Texto.escaparHTML(opp.nombre) : ''}"
            placeholder="Ej: Supermercado La Central" />
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);">

          <div class="form-group">
            <label class="form-label">Vendedor *</label>
            <select class="form-select" id="emb-f-vendedor">
              <option value="">Seleccionar…</option>
              ${vendedores.map(v => `
                <option value="${SCCR.Texto.escaparHTML(v)}"
                  ${opp?.vendedor === v ? 'selected' : ''}>
                  ${SCCR.Texto.escaparHTML(v)}
                </option>`).join('')}
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Etapa</label>
            <select class="form-select" id="emb-f-etapa">
              ${ETAPAS.map(e => `
                <option value="${e.clave}"
                  ${(opp?.etapa || etapaInicial) === e.clave ? 'selected' : ''}>
                  ${e.label}
                </option>`).join('')}
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Valor estimado (USD)</label>
            <div class="search-input-wrap">
              <span class="search-input-wrap__icon" style="left:12px;font-weight:700;
                color:var(--color-text-secondary);">$</span>
              <input type="number" class="form-input" id="emb-f-valor"
                value="${opp?.valor || ''}" placeholder="0.00" min="0" step="0.01"
                style="padding-left:28px;" />
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Fecha de ingreso</label>
            <input type="date" class="form-input" id="emb-f-fecha"
              value="${opp?.fecha_ingreso || new Date().toISOString().split('T')[0]}" />
          </div>

          <div class="form-group">
            <label class="form-label">Contacto</label>
            <input type="text" class="form-input" id="emb-f-contacto"
              value="${opp ? SCCR.Texto.escaparHTML(opp.contacto || '') : ''}"
              placeholder="Nombre del contacto" />
          </div>

          <div class="form-group">
            <label class="form-label">Teléfono</label>
            <input type="tel" class="form-input" id="emb-f-telefono"
              value="${opp ? SCCR.Texto.escaparHTML(opp.telefono || '') : ''}"
              placeholder="04XX-XXXXXXX" />
          </div>

        </div>

        <div class="form-group">
          <label class="form-label">Notas</label>
          <textarea class="form-textarea" id="emb-f-notas"
            rows="3" placeholder="Observaciones, próximos pasos…"
            style="min-height:80px;">${opp ? SCCR.Texto.escaparHTML(opp.notas || '') : ''}</textarea>
        </div>

        <div id="emb-f-error" class="form-error" style="display:none;"></div>
      </div>`;

    const footer = `
      ${opp ? `
        <button class="btn btn-danger btn-sm" id="emb-f-eliminar">
          <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
          Eliminar
        </button>` : ''}
      <button class="btn btn-ghost" onclick="SCCR.closeModal()">Cancelar</button>
      <button class="btn btn-primary" id="emb-f-guardar">
        <i data-lucide="save" style="width:15px;height:15px;"></i>
        ${esNueva ? 'Agregar' : 'Guardar'}
      </button>`;

    SCCR.openModal({
      title: esNueva ? 'Nueva oportunidad' : `Editar — ${opp.nombre}`,
      body,
      footer,
    });
    lucide.createIcons();

    /* Guardar */
    document.getElementById('emb-f-guardar')?.addEventListener('click', () => {
      const nombre   = document.getElementById('emb-f-nombre')?.value.trim();
      const vendedor = document.getElementById('emb-f-vendedor')?.value;
      const etapa    = document.getElementById('emb-f-etapa')?.value;
      const valor    = parseFloat(document.getElementById('emb-f-valor')?.value || '0') || 0;
      const fecha    = document.getElementById('emb-f-fecha')?.value;
      const contacto = document.getElementById('emb-f-contacto')?.value.trim();
      const telefono = document.getElementById('emb-f-telefono')?.value.trim();
      const notas    = document.getElementById('emb-f-notas')?.value.trim();
      const errEl    = document.getElementById('emb-f-error');

      if (!nombre) {
        if (errEl) { errEl.textContent = 'El nombre es obligatorio.'; errEl.style.display = 'block'; }
        return;
      }
      if (!vendedor) {
        if (errEl) { errEl.textContent = 'Selecciona un vendedor.'; errEl.style.display = 'block'; }
        return;
      }

      if (esNueva) {
        _oportunidades.push({
          id:            `opp_${Date.now()}`,
          nombre, vendedor, etapa, valor,
          fecha_ingreso: fecha || new Date().toISOString().split('T')[0],
          fecha_update:  new Date().toISOString().split('T')[0],
          contacto, telefono, notas,
          es_nuevo:      false,
        });
        SCCR.toast?.('Oportunidad agregada', 'success');
      } else {
        Object.assign(opp, {
          nombre, vendedor, etapa, valor, contacto, telefono, notas,
          fecha_update: new Date().toISOString().split('T')[0],
        });
        SCCR.toast?.('Oportunidad actualizada', 'success');
      }

      guardarOportunidades();
      SCCR.closeModal();
      refrescarVista();
    });

    /* Eliminar */
    document.getElementById('emb-f-eliminar')?.addEventListener('click', () => {
      _oportunidades = _oportunidades.filter(o => o.id !== id);
      guardarOportunidades();
      SCCR.closeModal();
      SCCR.toast?.('Oportunidad eliminada', 'success');
      refrescarVista();
    });
  }


  /* ==========================================================
     10. EXPORTAR CSV
     ========================================================== */
  function exportarCSV() {
    if (_oportunidades.length === 0) { SCCR.toast?.('Sin datos', 'warning'); return; }

    const cols  = ['Nombre','Vendedor','Etapa','Valor USD','Fecha Ingreso',
                   'Días en embudo','Contacto','Teléfono','Notas'];
    const filas = _oportunidades.map(o => [
      o.nombre, o.vendedor,
      ETAPAS.find(e => e.clave === o.etapa)?.label || o.etapa,
      o.valor || 0,
      SCCR.Fecha.format(o.fecha_ingreso),
      SCCR.Fecha.diasDesde(o.fecha_ingreso) ?? '',
      o.contacto || '', o.telefono || '', o.notas || '',
    ]);

    const csv = [cols, ...filas]
      .map(f => f.map(v => `"${String(v).replace(/"/g,'""')}"`).join(';'))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `embudo_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    SCCR.toast?.(`${_oportunidades.length} oportunidades exportadas`, 'success');
  }


  /* ==========================================================
     11. EVENTOS
     ========================================================== */
  function bindEventos() {
    /* Búsqueda */
    document.getElementById('emb-busqueda')?.addEventListener('input',
      SCCR.debounce(e => {
        renderKanban(e.target.value.trim(),
          document.getElementById('emb-sel-vendedor')?.value || 'todos');
        lucide.createIcons();
        const cnt = document.getElementById('emb-contador');
        if (cnt) cnt.textContent = `${_oportunidades.length} oportunidades`;
      }, 250)
    );

    /* Filtro vendedor */
    document.getElementById('emb-sel-vendedor')?.addEventListener('change', e => {
      renderKanban(
        document.getElementById('emb-busqueda')?.value || '',
        e.target.value
      );
      lucide.createIcons();
    });

    /* Botones */
    document.getElementById('emb-btn-nueva')?.addEventListener('click', () =>
      abrirModalOportunidad(null, 'prospecto'));
    document.getElementById('emb-btn-csv')?.addEventListener('click', exportarCSV);
  }


  /* ==========================================================
     HELPERS
     ========================================================== */
  function refrescarVista() {
    renderKanban(
      document.getElementById('emb-busqueda')?.value || '',
      document.getElementById('emb-sel-vendedor')?.value || 'todos'
    );
    renderKPIs();
    renderGrafico();
    renderResumenEtapas();
    lucide.createIcons();
  }

  function vendedoresOpciones() {
    const vends = [...new Set(SCCR.Motor?.pedidos()?.map(p => p.vendedor) || [])].sort();
    return vends.map(v =>
      `<option value="${SCCR.Texto.escaparHTML(v)}">${SCCR.Texto.escaparHTML(v)}</option>`
    ).join('');
  }


  /* ==========================================================
     API PÚBLICA
     ========================================================== */
  return {
    render,
    abrirModalOportunidad,
    _dragStart,
    _dragEnd,
  };

})();

window.SCCR.ModuloEmbudo = ModuloEmbudo;
window.ModuloEmbudo       = ModuloEmbudo;
