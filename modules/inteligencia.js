/* ============================================================
   SISTEMA COMERCIAL CASABE REAL
   modules/inteligencia.js — Centro de Inteligencia Comercial
   v1.0.0
   ============================================================

   Responsabilidades:
   1.  Resúmenes ejecutivos (diario / semanal / mensual)
   2.  Alertas comerciales con severidad y acciones
   3.  Recomendaciones automáticas basadas en datos
   4.  Pronósticos con ajuste manual
   5.  Agente IA conversacional con historial
   6.  Generación de resúmenes via Anthropic API

   Escucha: sccr:activar-inteligencia
   Depende de: utils.js, motor.js, Anthropic API
   ============================================================ */

'use strict';

window.SCCR = window.SCCR || {};

const ModuloInteligencia = (() => {

  /* ----------------------------------------------------------
     ESTADO
     ---------------------------------------------------------- */
  let _tabActiva   = 'resumen';  /* resumen | alertas | recomendaciones | pronostico | agente */
  let _historial   = [];         /* historial del chat con el agente */
  let _generando   = false;      /* evitar doble submit */
  let _ajusteManual = null;      /* ajuste manual del pronóstico */

  /* ----------------------------------------------------------
     LISTENER
     ---------------------------------------------------------- */
  document.addEventListener('sccr:activar-inteligencia', onActivar);


  /* ==========================================================
     1. ACTIVACIÓN
     ========================================================== */
  function onActivar() {
    if (!SCCR.Motor?.estaListo()) {
      document.getElementById('view-inteligencia').innerHTML =
        SCCR.UI.vacio({ titulo: 'Cargando inteligencia…', icono: 'loader' });
      return;
    }
    render();
  }


  /* ==========================================================
     2. RENDER PRINCIPAL
     ========================================================== */
  function render() {
    const view = document.getElementById('view-inteligencia');
    if (!view) return;

    SCCR.Log?.info('Inteligencia', `Tab activa: ${_tabActiva}`);

    view.innerHTML = `

      <!-- Header -->
      <div class="page-header flex items-center justify-between">
        <div>
          <h1 class="page-title">Inteligencia Comercial</h1>
          <p class="page-subtitle">Análisis, alertas y recomendaciones del sistema</p>
        </div>
        <div class="flex items-center gap-2">
          <div class="sync-indicator">
            <div class="sync-indicator__dot"></div>
            <span class="text-xs text-secondary">IA conectada</span>
          </div>
        </div>
      </div>

      <!-- Tabs de navegación -->
      <div style="display:flex;gap:4px;border-bottom:2px solid var(--color-border);
           margin-bottom:var(--space-5);overflow-x:auto;">
        ${[
          { id: 'resumen',         label: 'Resumen Ejecutivo', icono: 'file-text'     },
          { id: 'alertas',         label: 'Alertas',           icono: 'alert-triangle' },
          { id: 'recomendaciones', label: 'Recomendaciones',   icono: 'lightbulb'     },
          { id: 'pronostico',      label: 'Pronóstico',        icono: 'trending-up'   },
          { id: 'agente',          label: 'Agente IA',         icono: 'bot'           },
        ].map(t => `
          <button
            class="btn btn-ghost btn-sm"
            data-tab="${t.id}"
            id="int-tab-${t.id}"
            style="border-radius:var(--radius-md) var(--radius-md) 0 0;
              border-bottom:2px solid ${t.id === _tabActiva ? 'var(--color-primary)' : 'transparent'};
              color:${t.id === _tabActiva ? 'var(--color-primary)' : 'var(--color-text-secondary)'};
              font-weight:${t.id === _tabActiva ? '600' : '400'};
              white-space:nowrap;
              margin-bottom:-2px;
              padding:10px 16px;">
            <i data-lucide="${t.icono}" style="width:14px;height:14px;"></i>
            ${t.label}
            ${t.id === 'alertas' ? `<span id="int-badge-alertas" style="display:none;background:var(--color-primary);color:#fff;border-radius:99px;font-size:10px;font-weight:700;padding:1px 6px;margin-left:4px;"></span>` : ''}
          </button>`).join('')}
      </div>

      <!-- Contenido de tabs -->
      <div id="int-contenido"></div>

    `;

    /* Renderizar tab activa */
    renderTab(_tabActiva);
    bindTabs();
    lucide.createIcons();
  }


  /* ==========================================================
     3. NAVEGACIÓN POR TABS
     ========================================================== */
  function bindTabs() {
    document.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        _tabActiva = btn.dataset.tab;
        /* Actualizar estilos de tabs */
        document.querySelectorAll('[data-tab]').forEach(b => {
          const activo = b.dataset.tab === _tabActiva;
          b.style.borderBottomColor = activo ? 'var(--color-primary)' : 'transparent';
          b.style.color             = activo ? 'var(--color-primary)' : 'var(--color-text-secondary)';
          b.style.fontWeight        = activo ? '600' : '400';
        });
        renderTab(_tabActiva);
        lucide.createIcons();
      });
    });
  }

  function renderTab(tab) {
    switch (tab) {
      case 'resumen':         renderResumen();         break;
      case 'alertas':         renderAlertas();         break;
      case 'recomendaciones': renderRecomendaciones(); break;
      case 'pronostico':      renderPronostico();      break;
      case 'agente':          renderAgente();          break;
    }
  }


  /* ==========================================================
     4. TAB — RESUMEN EJECUTIVO
     ========================================================== */
  function renderResumen() {
    const el = document.getElementById('int-contenido');
    if (!el) return;

    const kpis = SCCR.Motor.calcularKPIs();
    const mes  = SCCR.Fecha.mesActual();

    el.innerHTML = `

      <!-- Selector de alcance -->
      <div class="filter-bar mb-5">
        <span class="filter-bar__label">Generar resumen</span>
        <button class="btn btn-sm btn-secondary" id="int-res-dia">Hoy</button>
        <button class="btn btn-sm btn-secondary" id="int-res-semana">Esta semana</button>
        <button class="btn btn-sm btn-primary"   id="int-res-mes">Este mes</button>
        <div class="filter-bar__spacer"></div>
        <button class="btn btn-sm btn-secondary" id="int-res-generar-ia">
          <i data-lucide="sparkles" style="width:13px;height:13px;"></i>
          Generar con IA
        </button>
      </div>

      <!-- KPIs resumen -->
      <div class="grid grid-4 mb-5">
        ${[
          { label: 'Ventas mes',       valor: SCCR.Numero.moneda(kpis.ventas_mes),       icono: 'dollar-sign', primario: true },
          { label: 'Pedidos mes',      valor: kpis.pedidos_mes,                           icono: 'shopping-cart' },
          { label: 'Clientes activos', valor: kpis.clientes_mes,                          icono: 'users' },
          { label: 'Cumplimiento',     valor: kpis.meta_mes > 0 ? `${kpis.cumplimiento_mes}%` : '—', icono: 'target' },
        ].map(t => SCCR.UI.kpiHTML(t)).join('')}
      </div>

      <!-- Panel del resumen -->
      <div class="ai-panel mb-5">
        <div class="ai-panel__header">
          <div class="ai-panel__icon">
            <i data-lucide="brain-circuit" style="width:20px;height:20px;color:#fff;"></i>
          </div>
          <div>
            <div class="ai-panel__title">Resumen Ejecutivo — ${mes}</div>
            <div class="ai-panel__subtitle" id="int-res-timestamp">Generado automáticamente</div>
          </div>
        </div>

        <div class="ai-panel__sections">
          <div class="ai-section">
            <div class="ai-section__label">Situación actual</div>
            <div class="ai-section__content" id="int-res-situacion">
              ${SCCR.Motor.resumenEjecutivo('mes')}
            </div>
          </div>
          <div class="ai-section">
            <div class="ai-section__label">Alertas del período</div>
            <div class="ai-section__content" id="int-res-alertas-txt">
              ${resumenAlertas()}
            </div>
          </div>
          <div class="ai-section">
            <div class="ai-section__label">Proyección al cierre</div>
            <div class="ai-section__content" id="int-res-proyeccion">
              ${resumenProyeccion(kpis)}
            </div>
          </div>
          <div class="ai-section">
            <div class="ai-section__label">Próximas acciones</div>
            <div class="ai-section__content" id="int-res-acciones">
              ${resumenAcciones()}
            </div>
          </div>
        </div>
      </div>

      <!-- Tabla de resumen de vendedores -->
      <div class="card">
        <div class="card__header">
          <span class="card__title">Desempeño del equipo — ${mes}</span>
        </div>
        <div class="card__body p-4">
          <table class="table">
            <thead>
              <tr>
                <th>Vendedor</th>
                <th style="text-align:right;">Ventas</th>
                <th style="text-align:center;">Pedidos</th>
                <th style="text-align:center;">Clientes</th>
                <th style="text-align:center;">Nuevos</th>
                <th>Meta</th>
              </tr>
            </thead>
            <tbody>
              ${SCCR.Motor.rankingVendedores('mes').map((v, i) => `
                <tr>
                  <td>
                    <div class="flex items-center gap-2">
                      ${SCCR.UI.rankNum(i + 1)}
                      <span class="font-medium" style="font-size:13px;">
                        ${SCCR.Texto.escaparHTML(v.vendedor)}
                      </span>
                    </div>
                  </td>
                  <td style="text-align:right;" class="font-semibold">${SCCR.Numero.moneda(v.ventas)}</td>
                  <td style="text-align:center;">${v.pedidos}</td>
                  <td style="text-align:center;">${v.clientes}</td>
                  <td style="text-align:center;">${v.nuevos_clientes}</td>
                  <td style="min-width:120px;">
                    ${v.cumplimiento !== null
                      ? SCCR.UI.progreso(v.cumplimiento, `${v.cumplimiento}%`,
                          v.cumplimiento >= 90 ? 'success' : v.cumplimiento >= 60 ? 'warning' : 'danger')
                      : '<span class="text-muted text-xs">Sin meta</span>'}
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>

    `;

    /* Bind botones de alcance */
    document.getElementById('int-res-dia')?.addEventListener('click', () => {
      setTexto('int-res-situacion', SCCR.Motor.resumenEjecutivo('dia'));
      setTimestamp('Resumen del día generado');
    });
    document.getElementById('int-res-semana')?.addEventListener('click', () => {
      setTexto('int-res-situacion', SCCR.Motor.resumenEjecutivo('semana'));
      setTimestamp('Resumen semanal generado');
    });
    document.getElementById('int-res-mes')?.addEventListener('click', () => {
      setTexto('int-res-situacion', SCCR.Motor.resumenEjecutivo('mes'));
      setTimestamp('Resumen mensual generado');
    });

    /* Generar con IA */
    document.getElementById('int-res-generar-ia')?.addEventListener('click',
      () => generarResumenIA());
  }

  function resumenAlertas() {
    const alertas = SCCR.Motor.calcularAlertas();
    if (alertas.length === 0) return '✅ Sin alertas activas este período.';
    return alertas.slice(0, 3).map(a => {
      const ico = a.nivel === 'danger' ? '🔴' : a.nivel === 'warning' ? '🟡' : 'ℹ️';
      return `${ico} ${a.mensaje}`;
    }).join('\n');
  }

  function resumenProyeccion(kpis) {
    const p = kpis.pronostico_mes;
    if (!p) return 'Sin datos suficientes para proyectar.';
    return `Proyección al cierre: ${SCCR.Numero.moneda(p.proyeccion_ponderada)}. ` +
           `Ritmo actual: ${SCCR.Numero.moneda(p.ritmo_diario)}/día. ` +
           `Quedan ${p.dias_restantes} días del mes.`;
  }

  function resumenAcciones() {
    const alertas = SCCR.Motor.calcularAlertas();
    const acciones = [];
    alertas.slice(0, 3).forEach(a => {
      if (a.tipo === 'cliente_inactivo')         acciones.push(`📞 Contactar a ${a.dato.nombre}`);
      if (a.tipo === 'meta_en_riesgo')           acciones.push(`🎯 Acelerar ventas — meta en riesgo`);
      if (a.tipo === 'vendedor_sin_actividad')   acciones.push(`📋 Revisar actividad de ${a.dato.vendedor}`);
      if (a.tipo === 'nuevos_clientes')          acciones.push(`🆕 Hacer seguimiento a nuevos clientes`);
    });
    return acciones.length > 0
      ? acciones.join('\n')
      : '✅ No hay acciones urgentes pendientes.';
  }


  /* ==========================================================
     5. TAB — ALERTAS
     ========================================================== */
  function renderAlertas() {
    const el = document.getElementById('int-contenido');
    if (!el) return;

    const alertas  = SCCR.Motor.calcularAlertas();
    const criticas = alertas.filter(a => a.nivel === 'danger');
    const advertencias = alertas.filter(a => a.nivel === 'warning');
    const info     = alertas.filter(a => a.nivel === 'info');

    /* Badge en la tab */
    const badge = document.getElementById('int-badge-alertas');
    if (badge) {
      badge.style.display = criticas.length > 0 ? 'inline' : 'none';
      badge.textContent   = criticas.length;
    }

    el.innerHTML = `

      <!-- Resumen de alertas -->
      <div class="grid grid-3 mb-5" style="gap:var(--space-4);">
        ${[
          { label: 'Críticas',     cnt: criticas.length,     color: 'var(--color-danger)',   bg: 'var(--color-danger-bg)',   icono: 'alert-octagon'  },
          { label: 'Advertencias', cnt: advertencias.length, color: 'var(--color-warning)',  bg: 'var(--color-warning-bg)',  icono: 'alert-triangle' },
          { label: 'Informativas', cnt: info.length,         color: 'var(--color-info)',     bg: 'var(--color-info-bg)',     icono: 'info'           },
        ].map(s => `
          <div style="background:${s.bg};border-radius:var(--radius-lg);
               padding:var(--space-4);display:flex;align-items:center;gap:var(--space-3);">
            <div style="width:40px;height:40px;border-radius:var(--radius-md);
                 background:${s.color}22;display:flex;align-items:center;
                 justify-content:center;flex-shrink:0;">
              <i data-lucide="${s.icono}" style="width:20px;height:20px;color:${s.color};"></i>
            </div>
            <div>
              <div style="font-size:28px;font-weight:700;color:${s.color};line-height:1;">${s.cnt}</div>
              <div style="font-size:12px;color:${s.color};opacity:.8;">${s.label}</div>
            </div>
          </div>`).join('')}
      </div>

      <!-- Lista de alertas -->
      ${alertas.length === 0 ? SCCR.UI.vacio({
          titulo:      '¡Sin alertas activas!',
          descripcion: 'El sistema comercial opera con normalidad.',
          icono:       'check-circle',
        }) : `
        <div style="display:flex;flex-direction:column;gap:var(--space-3);" id="int-lista-alertas">
          ${alertas.map((a, i) => tarjetaAlerta(a, i)).join('')}
        </div>`}

    `;
  }

  function tarjetaAlerta(a, i) {
    const config = {
      danger:  { color: 'var(--color-danger)',  bg: 'var(--color-danger-bg)',  icono: 'alert-octagon',  label: 'Crítica'      },
      warning: { color: 'var(--color-warning)', bg: 'var(--color-warning-bg)', icono: 'alert-triangle', label: 'Advertencia'  },
      info:    { color: 'var(--color-info)',     bg: 'var(--color-info-bg)',    icono: 'info',           label: 'Informativa'  },
    }[a.nivel] || {};

    /* Acción rápida según tipo */
    let accionBtn = '';
    if (a.tipo === 'cliente_inactivo' && a.dato?.telefono) {
      const num = a.dato.telefono.replace(/\D/g,'').replace(/^0/,'58');
      accionBtn = `<a href="https://wa.me/${num}" target="_blank"
        class="btn btn-secondary btn-sm">
        <i data-lucide="message-circle" style="width:13px;height:13px;"></i>
        WhatsApp
      </a>`;
    }
    if (a.tipo === 'meta_en_riesgo') {
      accionBtn = `<button class="btn btn-secondary btn-sm"
        onclick="SCCR.navigate('metas')">
        <i data-lucide="target" style="width:13px;height:13px;"></i>
        Ver metas
      </button>`;
    }
    if (a.tipo === 'vendedor_sin_actividad') {
      accionBtn = `<button class="btn btn-secondary btn-sm"
        onclick="SCCR.navigate('vendedores')">
        <i data-lucide="user-check" style="width:13px;height:13px;"></i>
        Ver vendedores
      </button>`;
    }
    if (a.tipo === 'nuevos_clientes') {
      accionBtn = `<button class="btn btn-secondary btn-sm"
        onclick="SCCR.navigate('clientes')">
        <i data-lucide="users" style="width:13px;height:13px;"></i>
        Ver clientes
      </button>`;
    }

    return `
      <div style="background:var(--color-surface);border-radius:var(--radius-lg);
           border:1px solid var(--color-border);overflow:hidden;">
        <div style="display:flex;align-items:center;gap:var(--space-4);padding:var(--space-4) var(--space-5);">

          <!-- Icono -->
          <div style="width:36px;height:36px;border-radius:var(--radius-md);
               background:${config.bg};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <i data-lucide="${config.icono}" style="width:18px;height:18px;color:${config.color};"></i>
          </div>

          <!-- Contenido -->
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:var(--space-2);margin-bottom:4px;">
              <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;
                color:${config.color};">${config.label}</span>
            </div>
            <div class="font-medium" style="font-size:14px;line-height:1.4;">
              ${SCCR.Texto.escaparHTML(a.mensaje)}
            </div>
          </div>

          <!-- Acción -->
          ${accionBtn ? `<div style="flex-shrink:0;">${accionBtn}</div>` : ''}

        </div>
        <!-- Acento lateral -->
        <div style="height:3px;background:${config.color};"></div>
      </div>`;
  }


  /* ==========================================================
     6. TAB — RECOMENDACIONES
     ========================================================== */
  function renderRecomendaciones() {
    const el = document.getElementById('int-contenido');
    if (!el) return;

    const kpis    = SCCR.Motor.calcularKPIs();
    const alertas = SCCR.Motor.calcularAlertas();
    const ranking = SCCR.Motor.rankingClientes('mes');
    const rankVend = SCCR.Motor.rankingVendedores('mes');

    /* Construir recomendaciones automáticas */
    const recos = [];

    /* 1. Clientes inactivos con más historial */
    const inactivos = SCCR.Motor.rankingClientes('todo')
      .filter(c => (c.dias_sin_comprar || 0) >= 14)
      .sort((a, b) => b.ventas - a.ventas)
      .slice(0, 3);

    inactivos.forEach(c => {
      recos.push({
        prioridad: c.dias_sin_comprar >= 30 ? 'alta' : 'media',
        categoria: 'Retención',
        titulo:    `Reactivar a ${c.nombre}`,
        detalle:   `Este cliente lleva ${c.dias_sin_comprar} días sin comprar. Históricamente generó ${SCCR.Numero.moneda(c.ventas)} en ventas. Contactar a ${c.contacto || 'su contacto de compras'}.`,
        accion:    `<button class="btn btn-secondary btn-sm" onclick="SCCR.navigate('clientes')">
                      <i data-lucide="eye" style="width:13px;height:13px;"></i> Ver cliente
                    </button>`,
        icono:     'user-x',
      });
    });

    /* 2. Meta en riesgo */
    if (kpis.meta_mes > 0 && kpis.cumplimiento_mes < 70) {
      const faltante   = Math.max(0, kpis.meta_mes - kpis.ventas_mes);
      const diasRest   = kpis.pronostico_mes?.dias_restantes || 1;
      const ritmoDia   = SCCR.Numero.moneda(faltante / diasRest);
      recos.push({
        prioridad: 'alta',
        categoria: 'Meta',
        titulo:    'Acelerar ritmo de ventas',
        detalle:   `Cumplimiento actual: ${kpis.cumplimiento_mes}%. Para cerrar la meta es necesario vender ${ritmoDia}/día durante los próximos ${diasRest} días.`,
        accion:    `<button class="btn btn-secondary btn-sm" onclick="SCCR.navigate('metas')">
                      <i data-lucide="target" style="width:13px;height:13px;"></i> Ver metas
                    </button>`,
        icono:     'trending-up',
      });
    }

    /* 3. Cliente A sin pedido reciente */
    const topA = ranking.filter(c => c.clasificacion === 'A' && (c.dias_sin_comprar || 0) >= 7);
    if (topA.length > 0) {
      recos.push({
        prioridad: 'alta',
        categoria: 'Cuentas Clave',
        titulo:    `Seguimiento a cliente A: ${topA[0].nombre}`,
        detalle:   `Es uno de los clientes más importantes (Categoría A) y lleva ${topA[0].dias_sin_comprar} días sin comprar. Priorizar visita o llamada esta semana.`,
        accion:    '',
        icono:     'star',
      });
    }

    /* 4. Vendedor de menor desempeño */
    if (rankVend.length >= 2) {
      const ultimo = rankVend[rankVend.length - 1];
      const primero = rankVend[0];
      const brecha  = primero.ventas > 0
        ? SCCR.Numero.redondear(((primero.ventas - ultimo.ventas) / primero.ventas) * 100, 0)
        : 0;
      if (brecha > 30) {
        recos.push({
          prioridad: 'media',
          categoria: 'Equipo',
          titulo:    `Apoyar a ${ultimo.vendedor}`,
          detalle:   `Tiene una brecha del ${brecha}% respecto al líder de ventas. Revisar cartera de clientes y acompañamiento en campo.`,
          accion:    `<button class="btn btn-secondary btn-sm" onclick="SCCR.navigate('vendedores')">
                        <i data-lucide="user-check" style="width:13px;height:13px;"></i> Ver vendedores
                      </button>`,
          icono:     'users',
        });
      }
    }

    /* 5. Nuevos clientes sin seguimiento */
    const nuevosRec = SCCR.Motor.pedidos()
      .filter(p => p.es_nuevo_cliente && SCCR.Fecha.diasDesde(p.fecha) <= 14);
    if (nuevosRec.length > 0) {
      recos.push({
        prioridad: 'media',
        categoria: 'Crecimiento',
        titulo:    `Consolidar ${nuevosRec.length} nuevo${nuevosRec.length > 1 ? 's' : ''} cliente${nuevosRec.length > 1 ? 's' : ''}`,
        detalle:   `Se registraron nuevos clientes en los últimos 14 días. Hacer seguimiento para confirmar un segundo pedido y establecer la relación comercial.`,
        accion:    `<button class="btn btn-secondary btn-sm" onclick="SCCR.navigate('clientes')">
                      <i data-lucide="user-plus" style="width:13px;height:13px;"></i> Ver clientes
                    </button>`,
        icono:     'user-plus',
      });
    }

    /* Si no hay recos urgentes */
    if (recos.length === 0) {
      recos.push({
        prioridad: 'info',
        categoria: 'General',
        titulo:    'El sistema opera con normalidad',
        detalle:   'No se detectaron situaciones que requieran atención inmediata. Continúa con el ritmo actual y revisa el embudo comercial para identificar oportunidades.',
        accion:    `<button class="btn btn-secondary btn-sm" onclick="SCCR.navigate('embudo')">
                      <i data-lucide="filter" style="width:13px;height:13px;"></i> Ver embudo
                    </button>`,
        icono:     'check-circle',
      });
    }

    /* Ordenar: alta → media → info */
    const orden = { alta: 0, media: 1, info: 2 };
    recos.sort((a, b) => (orden[a.prioridad] ?? 3) - (orden[b.prioridad] ?? 3));

    el.innerHTML = `

      <!-- Header con botón IA -->
      <div class="flex items-center justify-between mb-5">
        <div>
          <div class="font-semibold" style="font-size:15px;">
            ${recos.length} recomendación${recos.length !== 1 ? 'es' : ''} identificada${recos.length !== 1 ? 's' : ''}
          </div>
          <div class="text-xs text-secondary mt-1">Basadas en los datos actuales del sistema</div>
        </div>
        <button class="btn btn-primary btn-sm" id="int-reco-ia">
          <i data-lucide="sparkles" style="width:13px;height:13px;"></i>
          Ampliar con IA
        </button>
      </div>

      <!-- Lista de recomendaciones -->
      <div style="display:flex;flex-direction:column;gap:var(--space-4);">
        ${recos.map(r => tarjetaReco(r)).join('')}
      </div>

    `;

    document.getElementById('int-reco-ia')?.addEventListener('click',
      () => generarRecomendacionesIA(recos));
  }

  function tarjetaReco(r) {
    const colores = {
      alta:  { badge: 'badge-danger',  bg: 'var(--color-danger-bg)',  color: 'var(--color-danger)'  },
      media: { badge: 'badge-warning', bg: 'var(--color-warning-bg)', color: 'var(--color-warning)' },
      info:  { badge: 'badge-active',  bg: 'var(--color-connected-bg)', color: 'var(--color-connected)' },
    }[r.prioridad] || {};

    return `
      <div style="background:var(--color-surface);border-radius:var(--radius-lg);
           box-shadow:var(--shadow-sm);overflow:hidden;
           border-left:4px solid ${colores.color};">
        <div style="padding:var(--space-5);">
          <div class="flex items-start gap-3">
            <div style="width:36px;height:36px;border-radius:var(--radius-md);
                 background:${colores.bg};display:flex;align-items:center;
                 justify-content:center;flex-shrink:0;margin-top:2px;">
              <i data-lucide="${r.icono}" style="width:18px;height:18px;color:${colores.color};"></i>
            </div>
            <div style="flex:1;">
              <div class="flex items-center gap-2 mb-1 flex-wrap">
                <span class="badge ${colores.badge}" style="font-size:10px;">
                  ${r.prioridad.toUpperCase()}
                </span>
                <span class="text-xs text-secondary">${r.categoria}</span>
              </div>
              <div class="font-semibold mb-2" style="font-size:14px;">${r.titulo}</div>
              <div class="text-sm text-secondary" style="line-height:1.6;">${r.detalle}</div>
              ${r.accion ? `<div class="mt-3">${r.accion}</div>` : ''}
            </div>
          </div>
        </div>
      </div>`;
  }


  /* ==========================================================
     7. TAB — PRONÓSTICO
     ========================================================== */
  function renderPronostico() {
    const el   = document.getElementById('int-contenido');
    if (!el) return;

    const kpis = SCCR.Motor.calcularKPIs();
    const p    = kpis.pronostico_mes;
    const meta = kpis.meta_mes;

    const proyBase = p?.proyeccion_ponderada || 0;
    const proyAjustada = _ajusteManual !== null
      ? proyBase * (1 + _ajusteManual / 100)
      : proyBase;

    el.innerHTML = `

      <!-- Cifras principales -->
      <div class="grid grid-3 mb-5" style="gap:var(--space-5);">
        ${[
          { label: 'Ventas acumuladas',    valor: SCCR.Numero.moneda(kpis.ventas_mes), sub: `Día ${p?.dias_transcurridos || 0} de ${p?.dias_mes || 30}` },
          { label: 'Proyección al cierre', valor: SCCR.Numero.moneda(proyBase),         sub: 'Basada en últimos 7 días',  primario: true },
          { label: 'Meta mensual',         valor: meta > 0 ? SCCR.Numero.moneda(meta) : 'Sin configurar', sub: meta > 0 ? `${kpis.cumplimiento_mes}% alcanzado` : '' },
        ].map(k => `
          <div style="background:var(--color-surface);border-radius:var(--radius-lg);
               box-shadow:var(--shadow-sm);padding:var(--space-5);text-align:center;
               ${k.primario ? 'border:2px solid var(--color-primary);' : ''}">
            <div class="text-xs text-secondary" style="text-transform:uppercase;letter-spacing:.05em;margin-bottom:var(--space-2);">
              ${k.label}
            </div>
            <div style="font-size:28px;font-weight:700;color:${k.primario ? 'var(--color-primary)' : 'var(--color-text-primary)'};line-height:1;margin-bottom:4px;">
              ${k.valor}
            </div>
            ${k.sub ? `<div class="text-xs text-secondary">${k.sub}</div>` : ''}
          </div>`).join('')}
      </div>

      <!-- Barras de avance -->
      <div class="card mb-5">
        <div class="card__header"><span class="card__title">Avance del mes</span></div>
        <div class="card__body" style="display:flex;flex-direction:column;gap:var(--space-4);">
          ${SCCR.UI.progreso(p?.porcentaje_mes || 0, `${p?.porcentaje_mes || 0}% del mes transcurrido`)}
          ${meta > 0 ? SCCR.UI.progreso(
              kpis.cumplimiento_mes,
              `${kpis.cumplimiento_mes}% de la meta cumplido`,
              kpis.cumplimiento_mes >= 90 ? 'success' : kpis.cumplimiento_mes >= 60 ? 'warning' : 'danger'
            ) : ''}
          ${meta > 0 ? SCCR.UI.progreso(
              SCCR.Numero.clamp((proyBase / meta) * 100, 0, 200),
              `${SCCR.Numero.clamp((proyBase / meta) * 100, 0, 200).toFixed(0)}% — proyección vs meta`,
              (proyBase / meta) >= 1 ? 'success' : (proyBase / meta) >= 0.8 ? 'warning' : 'danger'
            ) : ''}
        </div>
      </div>

      <!-- Ajuste manual de pronóstico -->
      <div class="card mb-5">
        <div class="card__header">
          <span class="card__title">Ajuste manual de pronóstico</span>
          <span class="text-xs text-secondary">Factores externos no capturados en los datos</span>
        </div>
        <div class="card__body">
          <div style="display:flex;align-items:center;gap:var(--space-5);flex-wrap:wrap;">
            <div style="flex:1;min-width:200px;">
              <label class="form-label mb-2">Ajuste porcentual</label>
              <div class="flex items-center gap-3">
                <input type="range" id="int-pron-slider"
                  min="-30" max="50" step="5"
                  value="${_ajusteManual || 0}"
                  style="flex:1;accent-color:var(--color-primary);" />
                <span id="int-pron-slider-val" class="font-bold"
                  style="min-width:50px;text-align:center;font-size:18px;
                  color:${(_ajusteManual || 0) >= 0 ? 'var(--color-connected)' : 'var(--color-danger)'};">
                  ${_ajusteManual !== null ? (_ajusteManual >= 0 ? '+' : '') + _ajusteManual + '%' : '0%'}
                </span>
              </div>
              <div class="flex justify-between text-xs text-secondary mt-1">
                <span>-30%</span><span>0</span><span>+50%</span>
              </div>
            </div>
            <div style="text-align:center;min-width:160px;">
              <div class="text-xs text-secondary mb-1">Proyección ajustada</div>
              <div id="int-pron-ajustada" style="font-size:24px;font-weight:700;
                color:var(--color-primary);">
                ${SCCR.Numero.moneda(proyAjustada)}
              </div>
            </div>
          </div>
          <div class="flex gap-3 mt-4">
            <button class="btn btn-primary btn-sm" id="int-pron-aplicar">Aplicar ajuste</button>
            <button class="btn btn-ghost btn-sm" id="int-pron-reset">Restablecer</button>
          </div>
        </div>
      </div>

      <!-- Pronóstico por vendedor -->
      <div class="card">
        <div class="card__header">
          <span class="card__title">Proyección por vendedor</span>
        </div>
        <div class="card__body p-4">
          <table class="table">
            <thead>
              <tr>
                <th>Vendedor</th>
                <th style="text-align:right;">Ventas actuales</th>
                <th style="text-align:right;">Proyección</th>
                <th style="text-align:right;">Meta</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              ${SCCR.Motor.rankingVendedores('mes').map(v => {
                const diasT = p?.dias_transcurridos || 1;
                const diasM = p?.dias_mes || 30;
                const proyV = SCCR.Numero.redondear((v.ventas / diasT) * diasM, 2);
                const pctMeta = v.meta > 0 ? (proyV / v.meta) * 100 : null;
                return `
                  <tr>
                    <td class="font-medium" style="font-size:13px;">${SCCR.Texto.escaparHTML(v.vendedor)}</td>
                    <td style="text-align:right;">${SCCR.Numero.moneda(v.ventas)}</td>
                    <td style="text-align:right;" class="font-semibold">${SCCR.Numero.moneda(proyV)}</td>
                    <td style="text-align:right;">${v.meta > 0 ? SCCR.Numero.moneda(v.meta) : '—'}</td>
                    <td>
                      ${pctMeta !== null
                        ? SCCR.UI.badge(
                            pctMeta >= 100 ? '✓ En meta' : pctMeta >= 80 ? 'Cerca' : 'En riesgo',
                            pctMeta >= 100 ? 'active' : pctMeta >= 80 ? 'success' : 'danger'
                          )
                        : '<span class="text-muted text-xs">Sin meta</span>'}
                    </td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

    `;

    /* Slider de ajuste */
    const slider = document.getElementById('int-pron-slider');
    const valLbl = document.getElementById('int-pron-slider-val');
    const projEl = document.getElementById('int-pron-ajustada');

    slider?.addEventListener('input', () => {
      const pct = parseInt(slider.value);
      const adj = proyBase * (1 + pct / 100);
      if (valLbl) {
        valLbl.textContent = (pct >= 0 ? '+' : '') + pct + '%';
        valLbl.style.color = pct >= 0 ? 'var(--color-connected)' : 'var(--color-danger)';
      }
      if (projEl) projEl.textContent = SCCR.Numero.moneda(adj);
    });

    document.getElementById('int-pron-aplicar')?.addEventListener('click', () => {
      _ajusteManual = parseInt(slider?.value || 0);
      SCCR.toast?.('Ajuste aplicado al pronóstico', 'success');
    });

    document.getElementById('int-pron-reset')?.addEventListener('click', () => {
      _ajusteManual = null;
      if (slider)  slider.value   = '0';
      if (valLbl)  valLbl.textContent = '0%';
      if (projEl)  projEl.textContent = SCCR.Numero.moneda(proyBase);
      SCCR.toast?.('Pronóstico restablecido', 'success');
    });
  }


  /* ==========================================================
     8. TAB — AGENTE IA
     ========================================================== */
  function renderAgente() {
    const el = document.getElementById('int-contenido');
    if (!el) return;

    el.innerHTML = `
      <div style="display:flex;flex-direction:column;height:calc(100vh - 320px);min-height:500px;">

        <!-- Preguntas sugeridas -->
        <div style="margin-bottom:var(--space-4);">
          <div class="text-xs text-secondary mb-2" style="text-transform:uppercase;letter-spacing:.05em;">
            Preguntas frecuentes
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:var(--space-2);">
            ${[
              '¿Cómo voy a cerrar el mes?',
              '¿Qué clientes debo visitar esta semana?',
              '¿Quién fue el mejor vendedor este mes?',
              '¿Qué clientes dejaron de comprar?',
              '¿Cuáles son los productos más vendidos?',
              '¿Cuántos clientes nuevos tuve este mes?',
            ].map(q => `
              <button class="btn btn-secondary btn-sm int-sugerida"
                style="font-size:12px;" data-q="${SCCR.Texto.escaparHTML(q)}">
                ${SCCR.Texto.escaparHTML(q)}
              </button>`).join('')}
          </div>
        </div>

        <!-- Historial de chat -->
        <div id="int-chat-historial"
          style="flex:1;overflow-y:auto;background:var(--color-bg);
                 border-radius:var(--radius-lg);padding:var(--space-4);
                 display:flex;flex-direction:column;gap:var(--space-3);
                 min-height:200px;">
          ${_historial.length === 0
            ? mensajeSistema('¡Hola! Soy el Agente de Inteligencia Comercial de Casabe Real. Puedes preguntarme sobre ventas, clientes, vendedores, pronósticos o cualquier indicador del sistema.')
            : _historial.map(m => m.role === 'user'
                ? mensajeUsuario(m.content)
                : mensajeAgente(m.content)
              ).join('')}
        </div>

        <!-- Input de chat -->
        <div style="display:flex;gap:var(--space-3);margin-top:var(--space-4);">
          <input type="text" class="form-input w-full" id="int-chat-input"
            placeholder="Escribe tu consulta comercial…"
            autocomplete="off" />
          <button class="btn btn-primary" id="int-chat-send" style="flex-shrink:0;">
            <i data-lucide="send" style="width:16px;height:16px;"></i>
            Consultar
          </button>
          ${_historial.length > 0
            ? `<button class="btn btn-ghost btn-icon" id="int-chat-limpiar" title="Limpiar historial">
                 <i data-lucide="trash-2" style="width:16px;height:16px;"></i>
               </button>` : ''}
        </div>

      </div>`;

    /* Preguntas sugeridas */
    document.querySelectorAll('.int-sugerida').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = document.getElementById('int-chat-input');
        if (input) { input.value = btn.dataset.q; input.focus(); }
      });
    });

    /* Enviar */
    const inputChat = document.getElementById('int-chat-input');
    const btnSend   = document.getElementById('int-chat-send');

    async function enviar() {
      const query = inputChat?.value.trim();
      if (!query || _generando) return;

      inputChat.value = '';
      _historial.push({ role: 'user', content: query });
      actualizarHistorial();
      await consultarAgente(query);
    }

    btnSend?.addEventListener('click', enviar);
    inputChat?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); }
    });

    document.getElementById('int-chat-limpiar')?.addEventListener('click', () => {
      _historial = [];
      renderAgente();
    });

    /* Scroll al fondo */
    scrollChat();
  }

  async function consultarAgente(query) {
    _generando = true;
    const histDiv = document.getElementById('int-chat-historial');
    if (!histDiv) return;

    /* Mostrar spinner */
    const spinner = document.createElement('div');
    spinner.id        = 'int-spinner';
    spinner.innerHTML = mensajeSistema('Analizando…');
    histDiv.appendChild(spinner);
    scrollChat();

    try {
      const kpis    = SCCR.Motor.calcularKPIs();
      const alertas = SCCR.Motor.calcularAlertas();
      const topCli  = SCCR.Motor.rankingClientes('mes').slice(0, 8);
      const topVend = SCCR.Motor.rankingVendedores('mes');
      const inact   = SCCR.Motor.rankingClientes('todo')
        .filter(c => (c.dias_sin_comprar||0) >= 14).slice(0, 5);

      const sistema = `Eres el Agente de Inteligencia Comercial del Sistema Comercial Casabe Real.
Responde SIEMPRE en español, de forma clara, concisa y accionable.
Usa los datos reales a continuación para dar respuestas específicas con nombres, cifras y fechas.
Máximo 4 oraciones por respuesta, a menos que el usuario pida un análisis detallado.

=== DATOS DEL SISTEMA — ${new Date().toLocaleDateString('es-VE')} ===

VENTAS:
• Hoy: ${SCCR.Numero.moneda(kpis.ventas_hoy)} (${kpis.pedidos_hoy} pedidos)
• Semana: ${SCCR.Numero.moneda(kpis.ventas_semana)} (${kpis.pedidos_semana} pedidos)
• Mes: ${SCCR.Numero.moneda(kpis.ventas_mes)} (${kpis.pedidos_mes} pedidos, ${kpis.clientes_mes} clientes)
• Año: ${SCCR.Numero.moneda(kpis.ventas_ano)}
• Ticket promedio: ${SCCR.Numero.moneda(kpis.ticket_promedio_mes)}
• Nuevos clientes mes: ${kpis.clientes_nuevos_mes}

META Y PRONÓSTICO:
• Meta mensual: ${kpis.meta_mes > 0 ? SCCR.Numero.moneda(kpis.meta_mes) : 'No configurada'}
• Cumplimiento: ${kpis.cumplimiento_mes}%
• Proyección al cierre: ${SCCR.Numero.moneda(kpis.pronostico_mes?.proyeccion_ponderada || 0)}
• Ritmo diario actual: ${SCCR.Numero.moneda(kpis.pronostico_mes?.ritmo_diario || 0)}
• Días restantes del mes: ${kpis.pronostico_mes?.dias_restantes || 0}

TOP CLIENTES (${SCCR.Fecha.mesActual()}):
${topCli.map((c, i) => `${i+1}. ${c.nombre} — ${SCCR.Numero.moneda(c.ventas)} — Clasificación ${c.clasificacion} — ${c.dias_sin_comprar ?? 0}d sin comprar`).join('\n')}

CLIENTES INACTIVOS (+14 días sin comprar):
${inact.length > 0 ? inact.map(c => `• ${c.nombre} — ${c.dias_sin_comprar}d — Historial: ${SCCR.Numero.moneda(c.ventas)}`).join('\n') : 'Ninguno'}

VENDEDORES (${SCCR.Fecha.mesActual()}):
${topVend.map((v, i) => `${i+1}. ${v.vendedor} — ${SCCR.Numero.moneda(v.ventas)} — ${v.pedidos} pedidos — ${v.clientes} clientes — Meta: ${v.cumplimiento !== null ? v.cumplimiento + '%' : 'sin meta'}`).join('\n')}

ALERTAS ACTIVAS:
${alertas.length > 0 ? alertas.map(a => `• [${a.nivel.toUpperCase()}] ${a.mensaje}`).join('\n') : 'Ninguna'}`;

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model:      'claude-sonnet-4-6',
          max_tokens: 1000,
          system:     sistema,
          messages:   _historial.slice(-12),
        }),
      });

      const data  = await res.json();
      const texto = data.content?.[0]?.text || 'No pude generar una respuesta en este momento.';

      _historial.push({ role: 'assistant', content: texto });

    } catch (err) {
      SCCR.Log?.error('Inteligencia', 'Error agente IA:', err);
      _historial.push({
        role:    'assistant',
        content: 'Hubo un error al consultar la IA. Verifica tu conexión e intenta de nuevo.',
      });
    } finally {
      _generando = false;
      actualizarHistorial();
    }
  }

  function actualizarHistorial() {
    const histDiv = document.getElementById('int-chat-historial');
    if (!histDiv) return;

    histDiv.innerHTML = _historial.map(m =>
      m.role === 'user'
        ? mensajeUsuario(m.content)
        : mensajeAgente(m.content)
    ).join('');

    scrollChat();
  }

  function mensajeUsuario(texto) {
    return `
      <div style="display:flex;justify-content:flex-end;">
        <div style="background:var(--color-primary);color:#fff;
             border-radius:var(--radius-lg) var(--radius-lg) 4px var(--radius-lg);
             padding:var(--space-3) var(--space-4);max-width:75%;font-size:14px;line-height:1.5;">
          ${SCCR.Texto.escaparHTML(texto)}
        </div>
      </div>`;
  }

  function mensajeAgente(texto) {
    return `
      <div style="display:flex;gap:var(--space-3);align-items:flex-start;">
        <div style="width:30px;height:30px;border-radius:50%;background:var(--color-text-primary);
             display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px;">
          <i data-lucide="bot" style="width:15px;height:15px;color:#fff;"></i>
        </div>
        <div style="background:var(--color-surface);border:1px solid var(--color-border);
             border-radius:4px var(--radius-lg) var(--radius-lg) var(--radius-lg);
             padding:var(--space-3) var(--space-4);max-width:75%;font-size:14px;line-height:1.6;
             color:var(--color-text-primary);">
          ${SCCR.Texto.escaparHTML(texto)}
        </div>
      </div>`;
  }

  function mensajeSistema(texto) {
    return `
      <div style="text-align:center;color:var(--color-text-secondary);
           font-size:13px;padding:var(--space-3);">
        ${SCCR.Texto.escaparHTML(texto)}
      </div>`;
  }

  function scrollChat() {
    setTimeout(() => {
      const h = document.getElementById('int-chat-historial');
      if (h) h.scrollTop = h.scrollHeight;
      lucide.createIcons();
    }, 50);
  }


  /* ==========================================================
     9. GENERACIÓN DE RESUMEN CON IA
     ========================================================== */
  async function generarResumenIA() {
    const btn = document.getElementById('int-res-generar-ia');
    if (btn) { btn.disabled = true; btn.textContent = 'Generando…'; }

    try {
      const kpis    = SCCR.Motor.calcularKPIs();
      const alertas = SCCR.Motor.calcularAlertas();
      const topVend = SCCR.Motor.rankingVendedores('mes');
      const topCli  = SCCR.Motor.rankingClientes('mes').slice(0, 5);
      const mes     = SCCR.Fecha.mesActual();

      const prompt = `Genera un resumen ejecutivo comercial para Casabe Real correspondiente al mes de ${mes}.
El resumen debe tener 4 párrafos cortos: situación actual, análisis del equipo de ventas, alertas principales, y recomendaciones de cierre.
Usa un tono profesional y directo. En español. Máximo 200 palabras en total.

Datos:
- Ventas: ${SCCR.Numero.moneda(kpis.ventas_mes)} (${kpis.pedidos_mes} pedidos, ${kpis.clientes_mes} clientes)
- Meta: ${kpis.meta_mes > 0 ? SCCR.Numero.moneda(kpis.meta_mes) + ' — ' + kpis.cumplimiento_mes + '%' : 'no configurada'}
- Proyección: ${SCCR.Numero.moneda(kpis.pronostico_mes?.proyeccion_ponderada || 0)}
- Nuevos clientes: ${kpis.clientes_nuevos_mes}
- Top vendedor: ${topVend[0]?.vendedor || 'N/A'} (${SCCR.Numero.moneda(topVend[0]?.ventas || 0)})
- Top cliente: ${topCli[0]?.nombre || 'N/A'} (${SCCR.Numero.moneda(topCli[0]?.ventas || 0)})
- Alertas: ${alertas.map(a => a.mensaje).join('; ') || 'ninguna'}`;

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model:      'claude-sonnet-4-6',
          max_tokens: 1000,
          messages:   [{ role: 'user', content: prompt }],
        }),
      });

      const data  = await res.json();
      const texto = data.content?.[0]?.text || '';

      if (texto) {
        setTexto('int-res-situacion', texto);
        setTimestamp(`Resumen generado por IA — ${new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}`);
        SCCR.toast?.('Resumen generado correctamente', 'success');
      }

    } catch (err) {
      SCCR.Log?.error('Inteligencia', 'Error resumen IA:', err);
      SCCR.toast?.('Error al generar resumen con IA', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="sparkles" style="width:13px;height:13px;"></i> Generar con IA'; }
      lucide.createIcons();
    }
  }

  async function generarRecomendacionesIA(recosActuales) {
    const btn = document.getElementById('int-reco-ia');
    if (btn) { btn.disabled = true; btn.textContent = 'Analizando…'; }

    try {
      const kpis = SCCR.Motor.calcularKPIs();
      const prompt = `Basándote en los siguientes datos comerciales de Casabe Real, da 3 recomendaciones estratégicas adicionales que no haya en la lista. Sé específico y accionable. En español. Máximo 120 palabras total.
Datos: Ventas mes ${SCCR.Numero.moneda(kpis.ventas_mes)}, cumplimiento ${kpis.cumplimiento_mes}%, ${kpis.clientes_nuevos_mes} nuevos clientes, proyección ${SCCR.Numero.moneda(kpis.pronostico_mes?.proyeccion_ponderada || 0)}.
Recomendaciones ya identificadas: ${recosActuales.map(r => r.titulo).join(', ')}.`;

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model:      'claude-sonnet-4-6',
          max_tokens: 1000,
          messages:   [{ role: 'user', content: prompt }],
        }),
      });

      const data  = await res.json();
      const texto = data.content?.[0]?.text || '';

      if (texto) {
        const contenedor = document.getElementById('int-contenido');
        const extra = document.createElement('div');
        extra.className = 'card mt-5';
        extra.innerHTML = `
          <div class="card__header">
            <span class="card__title">
              <i data-lucide="sparkles" style="width:15px;height:15px;color:var(--color-primary);"></i>
              Recomendaciones adicionales — Agente IA
            </span>
          </div>
          <div class="card__body">
            <div style="font-size:14px;line-height:1.7;color:var(--color-text-primary);
                 white-space:pre-line;">
              ${SCCR.Texto.escaparHTML(texto)}
            </div>
          </div>`;
        contenedor?.appendChild(extra);
        lucide.createIcons();
        SCCR.toast?.('Recomendaciones adicionales generadas', 'success');
      }

    } catch (err) {
      SCCR.Log?.error('Inteligencia', 'Error recos IA:', err);
      SCCR.toast?.('Error al ampliar recomendaciones', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="sparkles" style="width:13px;height:13px;"></i> Ampliar con IA'; }
      lucide.createIcons();
    }
  }


  /* ==========================================================
     HELPERS
     ========================================================== */
  function setTexto(id, texto) {
    const el = document.getElementById(id);
    if (el) el.textContent = texto ?? '';
  }

  function setTimestamp(texto) {
    const el = document.getElementById('int-res-timestamp');
    if (el) el.textContent = texto;
  }


  /* ==========================================================
     API PÚBLICA
     ========================================================== */
  return { render };

})();

window.SCCR.ModuloInteligencia = ModuloInteligencia;
window.ModuloInteligencia       = ModuloInteligencia;
