/* ============================================================
   SISTEMA COMERCIAL CASABE REAL
   js/app.js — Orquestador principal
   v1.0.0
   ============================================================

   Responsabilidades:
   1.  Inicializar el sistema y verificar dependencias
   2.  Escuchar sccr:motor-listo y poblar la pantalla de bienvenida
   3.  Escuchar sccr:view-changed y activar cada módulo
   4.  Inicializar los gráficos del Dashboard
   5.  Actualizar KPIs, rankings y panel de IA
   6.  Gestionar el buscador global
   7.  Configurar auto-sincronización cada N minutos
   8.  Exponer SCCRApp como punto de entrada

   Depende de: utils.js, motor.js, importador.js
   ============================================================ */

'use strict';

window.SCCR   = window.SCCR || {};
window.SCCRApp = window.SCCRApp || {};

const App = (() => {

  /* ----------------------------------------------------------
     ESTADO
     ---------------------------------------------------------- */
  let _graficos         = {};   /* instancias Chart.js activas */
  let _intervaloSync    = null; /* timer de auto-sync */
  let _modulosActivos   = new Set();
  const INTERVALO_SYNC  = 10 * 60 * 1000; /* 10 minutos */


  /* ==========================================================
     1. INICIALIZACIÓN
     ========================================================== */
  function init() {
    SCCR.Log?.info('App', 'Inicializando SCCR v1.0.0');

    /* Escuchar cuando el motor tenga los datos listos */
    document.addEventListener('sccr:motor-listo', onMotorListo);

    /* Escuchar cambios de vista */
    document.addEventListener('sccr:view-changed', onViewChanged);

    /* Buscador global */
    document.addEventListener('sccr:busqueda', onBusqueda);

    /* Auto-sync periódico */
    iniciarAutoSync();

    SCCR.Log?.info('App', 'Listeners registrados');
  }


  /* ==========================================================
     2. MOTOR LISTO → poblar pantalla de bienvenida
     ========================================================== */
  function onMotorListo(e) {
    SCCR.Log?.info('App', `Motor listo: ${e.detail.total} pedidos`);

    poblarBienvenida();

    /* Si el usuario ya estaba en el dashboard, actualizarlo */
    const viewActual = obtenerViewActual();
    if (viewActual === 'dashboard') {
      renderDashboard();
    }
  }


  /* ==========================================================
     3. CAMBIO DE VISTA
     ========================================================== */
  function onViewChanged(e) {
    const { view } = e.detail;
    SCCR.Log?.debug('App', `Vista activa: ${view}`);

    if (!SCCR.Motor?.estaListo()) return;

    switch (view) {
      case 'dashboard':     renderDashboard();     break;
      case 'ventas':        activarModulo('ventas');        break;
      case 'clientes':      activarModulo('clientes');      break;
      case 'vendedores':    activarModulo('vendedores');    break;
      case 'metas':         activarModulo('metas');         break;
      case 'embudo':        activarModulo('embudo');        break;
      case 'reportes':      activarModulo('reportes');      break;
      case 'inteligencia':  activarModulo('inteligencia');  break;
      case 'administracion':activarModulo('administracion');break;
    }
  }

  function activarModulo(nombre) {
    const evento = `sccr:activar-${nombre}`;
    document.dispatchEvent(new CustomEvent(evento, {
      detail: { motor: SCCR.Motor }
    }));
  }

  function obtenerViewActual() {
    const activo = document.querySelector('.nav-item.active');
    return activo?.dataset?.module || 'bienvenida';
  }


  /* ==========================================================
     4. PANTALLA DE BIENVENIDA
     ========================================================== */
  function poblarBienvenida() {
    if (!SCCR.Motor?.estaListo()) return;

    const kpis = SCCR.Motor.calcularKPIs();

    /* KPIs rápidos */
    setTexto('kpi-pedidos-hoy',  kpis.pedidos_hoy);
    setTexto('kpi-ventas-mes',   SCCR.Numero.moneda(kpis.ventas_mes));
    setTexto('kpi-clientes',     kpis.clientes_mes);
    setTexto('kpi-cumplimiento', kpis.meta_mes > 0
      ? `${kpis.cumplimiento_mes} %`
      : '—'
    );

    /* Resumen del día */
    const resumen = SCCR.Motor.resumenEjecutivo('dia');
    setTexto('welcome-summary-text', resumen || 'Sistema listo. No hay datos para hoy todavía.');
  }


  /* ==========================================================
     5. DASHBOARD
     ========================================================== */
  function renderDashboard() {
    if (!SCCR.Motor?.estaListo()) return;
    SCCR.Log?.info('App', 'Renderizando Dashboard');

    const kpis = SCCR.Motor.calcularKPIs();

    /* ── 5.1 KPIs ── */
    renderKPIs(kpis);

    /* ── 5.2 Gráfico evolución de ventas ── */
    renderGraficoEvolucion('mes');

    /* ── 5.3 Gráfico vendedores ── */
    renderGraficoVendedores('mes');

    /* ── 5.4 Rankings ── */
    renderRankingClientes();
    renderRankingVendedores();

    /* ── 5.5 Embudo mini ── */
    renderEmbudoMini();

    /* ── 5.6 Pronóstico mini ── */
    renderPronosticoMini(kpis);

    /* ── 5.7 Panel de IA ── */
    renderPanelIA(kpis);

    /* ── 5.8 Listeners de filtros ── */
    bindFiltrosDashboard();

    /* Refrescar íconos Lucide */
    lucide.createIcons();
  }


  /* ==========================================================
     5.1 KPIs — Fila de 6 tarjetas
     ========================================================== */
  function renderKPIs(kpis) {
    const contenedor = document.getElementById('dashboard-kpis');
    if (!contenedor) return;

    const tarjetas = [
      {
        label:    'Ventas del día',
        valor:    SCCR.Numero.moneda(kpis.ventas_hoy),
        icono:    'dollar-sign',
        primario: true,
        periodo:  'Hoy',
      },
      {
        label:   'Ventas semanales',
        valor:   SCCR.Numero.moneda(kpis.ventas_semana),
        icono:   'trending-up',
        delta:   kpis.delta_ventas_semana.texto,
        signo:   kpis.delta_ventas_semana.signo,
        periodo: 'Esta semana',
      },
      {
        label:   'Ventas del mes',
        valor:   SCCR.Numero.moneda(kpis.ventas_mes),
        icono:   'bar-chart-2',
        delta:   kpis.delta_ventas_mes.texto,
        signo:   kpis.delta_ventas_mes.signo,
        periodo: SCCR.Fecha.mesActual(),
      },
      {
        label:   'Pedidos del mes',
        valor:   SCCR.Numero.formato(kpis.pedidos_mes),
        icono:   'shopping-cart',
        periodo: `${kpis.clientes_mes} clientes`,
      },
      {
        label:   'Ticket promedio',
        valor:   SCCR.Numero.moneda(kpis.ticket_promedio_mes),
        icono:   'receipt',
        periodo: 'Por pedido este mes',
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
     5.2 Gráfico — Evolución de ventas
     ========================================================== */
  function renderGraficoEvolucion(periodo) {
    const canvas = document.getElementById('chart-evolucion');
    if (!canvas) return;

    const { labels, datos } = SCCR.Motor.serieVentas(periodo);

    /* Destruir instancia anterior */
    if (_graficos.evolucion) {
      _graficos.evolucion.destroy();
    }

    _graficos.evolucion = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label:           'Ventas (USD)',
          data:            datos,
          borderColor:     '#D71920',
          backgroundColor: 'rgba(215, 25, 32, 0.08)',
          borderWidth:     2.5,
          pointBackgroundColor: '#D71920',
          pointRadius:     4,
          pointHoverRadius: 6,
          fill:            true,
          tension:         0.4,
        }]
      },
      options: opcionesLineChart('Ventas (USD)'),
    });
  }


  /* ==========================================================
     5.3 Gráfico — Ventas por vendedor
     ========================================================== */
  function renderGraficoVendedores(periodo) {
    const canvas = document.getElementById('chart-vendedores');
    if (!canvas) return;

    const { labels, datos } = SCCR.Motor.serieVendedores(periodo);

    if (_graficos.vendedores) {
      _graficos.vendedores.destroy();
    }

    const colores = [
      '#D71920', '#2D3436', '#F1C40F', '#F39C12',
      '#7F8C8D', '#B2BEC3', '#636E72', '#DFE6E9',
    ];

    _graficos.vendedores = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label:           'Ventas (USD)',
          data:            datos,
          backgroundColor: labels.map((_, i) => colores[i % colores.length]),
          borderRadius:    6,
          borderSkipped:   false,
        }]
      },
      options: opcionesBarChart('Ventas (USD)'),
    });
  }


  /* ==========================================================
     5.4 Rankings
     ========================================================== */
  function renderRankingClientes() {
    const contenedor = document.getElementById('ranking-clientes');
    if (!contenedor) return;

    const top5 = SCCR.Motor.rankingClientes('mes').slice(0, 5);

    if (top5.length === 0) {
      contenedor.innerHTML = SCCR.UI.vacio({
        titulo: 'Sin datos este mes',
        icono:  'users',
      });
      return;
    }

    contenedor.innerHTML = `
      <table class="table" style="margin:-4px;">
        <thead>
          <tr>
            <th>#</th>
            <th>Cliente</th>
            <th>Ventas</th>
            <th>Tipo</th>
          </tr>
        </thead>
        <tbody>
          ${top5.map((c, i) => `
            <tr>
              <td>${SCCR.UI.rankNum(i + 1)}</td>
              <td>
                <div class="font-medium truncate" style="max-width:160px;">${SCCR.Texto.escaparHTML(c.nombre)}</div>
                <div class="text-xs text-secondary">${c.pedidos} pedido${c.pedidos !== 1 ? 's' : ''}</div>
              </td>
              <td class="font-semibold">${SCCR.Numero.moneda(c.ventas)}</td>
              <td>${SCCR.UI.badge(c.clasificacion, SCCR.UI.badgeCliente(c.clasificacion))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
  }

  function renderRankingVendedores() {
    const contenedor = document.getElementById('ranking-vendedores');
    if (!contenedor) return;

    const ranking = SCCR.Motor.rankingVendedores('mes');

    if (ranking.length === 0) {
      contenedor.innerHTML = SCCR.UI.vacio({
        titulo: 'Sin datos este mes',
        icono:  'user-check',
      });
      return;
    }

    contenedor.innerHTML = `
      <table class="table" style="margin:-4px;">
        <thead>
          <tr>
            <th>#</th>
            <th>Vendedor</th>
            <th>Ventas</th>
            <th>Meta</th>
          </tr>
        </thead>
        <tbody>
          ${ranking.map((v, i) => `
            <tr>
              <td>${SCCR.UI.rankNum(i + 1)}</td>
              <td>
                <div class="flex items-center gap-2">
                  <div style="width:28px;height:28px;background:var(--color-primary-light);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--color-primary);flex-shrink:0;">
                    ${SCCR.Texto.iniciales(v.vendedor)}
                  </div>
                  <div>
                    <div class="font-medium" style="font-size:13px;">${SCCR.Texto.escaparHTML(v.vendedor)}</div>
                    <div class="text-xs text-secondary">${v.pedidos} pedidos</div>
                  </div>
                </div>
              </td>
              <td class="font-semibold">${SCCR.Numero.moneda(v.ventas)}</td>
              <td>
                ${v.cumplimiento !== null
                  ? SCCR.UI.progreso(v.cumplimiento, `${v.cumplimiento}%`)
                  : '<span class="text-muted text-xs">Sin meta</span>'
                }
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
  }


  /* ==========================================================
     5.5 Embudo mini
     ========================================================== */
  function renderEmbudoMini() {
    const contenedor = document.getElementById('embudo-mini');
    if (!contenedor) return;

    const datos = SCCR.Motor.datosEmbudo();
    const max   = Math.max(...datos.map(e => e.cantidad), 1);

    contenedor.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${datos.map(e => {
          const pct = Math.max((e.cantidad / max) * 100, e.cantidad > 0 ? 8 : 0);
          return `
            <div style="display:flex;align-items:center;gap:12px;">
              <div style="width:110px;font-size:12px;color:var(--color-text-secondary);text-align:right;flex-shrink:0;">
                ${SCCR.Texto.escaparHTML(e.etapa)}
              </div>
              <div style="flex:1;background:var(--color-border);border-radius:4px;height:22px;overflow:hidden;">
                <div style="width:${pct}%;height:100%;background:var(--color-primary);border-radius:4px;
                     display:flex;align-items:center;padding-left:8px;
                     font-size:11px;font-weight:700;color:#fff;transition:width 0.6s ease;">
                  ${e.cantidad > 0 ? e.cantidad : ''}
                </div>
              </div>
              <div style="width:28px;text-align:right;font-size:12px;font-weight:600;color:var(--color-text-primary);">
                ${e.cantidad}
              </div>
            </div>`;
        }).join('')}
      </div>`;
  }


  /* ==========================================================
     5.6 Pronóstico mini
     ========================================================== */
  function renderPronosticoMini(kpis) {
    const contenedor = document.getElementById('pronostico-mini');
    if (!contenedor) return;

    const p    = kpis.pronostico_mes;
    const meta = kpis.meta_mes;

    if (!p) {
      contenedor.innerHTML = SCCR.UI.vacio({ titulo: 'Sin datos suficientes', icono: 'trending-up' });
      return;
    }

    const proyeccion = p.proyeccion_ponderada;
    const pctVsMeta  = meta > 0
      ? SCCR.Numero.clamp((proyeccion / meta) * 100, 0, 200)
      : null;

    contenedor.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:var(--space-4);">

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);">
          <div>
            <div class="text-xs text-secondary" style="text-transform:uppercase;letter-spacing:.05em;">Proyección al cierre</div>
            <div style="font-size:22px;font-weight:700;color:var(--color-text-primary);margin-top:4px;">
              ${SCCR.Numero.moneda(proyeccion)}
            </div>
          </div>
          <div>
            <div class="text-xs text-secondary" style="text-transform:uppercase;letter-spacing:.05em;">Ritmo diario</div>
            <div style="font-size:22px;font-weight:700;color:var(--color-text-primary);margin-top:4px;">
              ${SCCR.Numero.moneda(p.ritmo_diario)}
            </div>
          </div>
        </div>

        <div>
          <div class="text-xs text-secondary mb-2">Avance del mes — día ${p.dias_transcurridos} de ${p.dias_mes}</div>
          ${SCCR.UI.progreso(p.porcentaje_mes, 'Mes transcurrido', '')}
        </div>

        ${meta > 0 ? `
        <div>
          <div class="text-xs text-secondary mb-2">Proyección vs Meta</div>
          ${SCCR.UI.progreso(pctVsMeta, `${pctVsMeta?.toFixed(0)}% de la meta`, pctVsMeta >= 90 ? 'success' : pctVsMeta >= 60 ? 'warning' : 'danger')}
        </div>` : `
        <div class="alert alert-info" style="font-size:12px;">
          <i data-lucide="info" style="width:14px;height:14px;" class="alert__icon"></i>
          Configura metas en el módulo de Metas para ver la proyección vs. objetivo.
        </div>`}

        <div style="display:flex;gap:var(--space-3);font-size:12px;color:var(--color-text-secondary);">
          <span>📅 ${p.dias_restantes} días restantes</span>
          <span>·</span>
          <span>📦 ${SCCR.Numero.formato(kpis.cajas_mes)} unidades este mes</span>
        </div>

      </div>`;
  }


  /* ==========================================================
     5.7 Panel de Inteligencia Artificial
     ========================================================== */
  function renderPanelIA(kpis) {
    /* Resumen */
    setTexto('ai-resumen', SCCR.Motor.resumenEjecutivo('mes'));

    /* Alertas */
    const alertas  = SCCR.Motor.calcularAlertas();
    const aiAlertas = document.getElementById('ai-alertas');
    if (aiAlertas) {
      if (alertas.length === 0) {
        aiAlertas.textContent = 'No hay alertas activas. El sistema opera con normalidad.';
      } else {
        aiAlertas.innerHTML = alertas.slice(0, 3).map(a =>
          `<div style="margin-bottom:6px;">
            ${a.nivel === 'danger' ? '🔴' : a.nivel === 'warning' ? '🟡' : 'ℹ️'}
            ${SCCR.Texto.escaparHTML(a.mensaje)}
          </div>`
        ).join('');
      }

      /* Badge en el nav */
      const badge = document.getElementById('badge-alertas');
      if (badge) {
        const criticas = alertas.filter(a => a.nivel === 'danger').length;
        badge.style.display = criticas > 0 ? 'inline' : 'none';
        badge.textContent   = criticas;
      }
    }

    /* Recomendaciones */
    setTexto('ai-recomendaciones', generarRecomendaciones(kpis, alertas));

    /* Pronóstico */
    const p = kpis.pronostico_mes;
    if (p) {
      setTexto('ai-pronostico',
        `Proyección al cierre del mes: ${SCCR.Numero.moneda(p.proyeccion_ponderada)}. ` +
        `Ritmo necesario para la meta: ${kpis.meta_mes > 0
          ? SCCR.Numero.moneda(Math.max(0, kpis.meta_mes - kpis.ventas_mes) / Math.max(p.dias_restantes, 1)) + '/día'
          : 'meta no configurada'}.`
      );
    }

    /* Chat IA */
    bindChatIA();
  }

  function generarRecomendaciones(kpis, alertas) {
    const recos = [];

    /* Cliente inactivo con más ventas históricas */
    const inactivos = alertas.filter(a => a.tipo === 'cliente_inactivo');
    if (inactivos.length > 0) {
      const top = inactivos[0].dato;
      recos.push(`Contactar a ${top.nombre} — lleva ${top.dias_sin_comprar} días sin comprar.`);
    }

    /* Meta en riesgo */
    if (alertas.some(a => a.tipo === 'meta_en_riesgo')) {
      const falta = Math.max(0, kpis.meta_mes - kpis.ventas_mes);
      recos.push(`Acelerar ventas: faltan ${SCCR.Numero.moneda(falta)} para la meta del mes.`);
    }

    /* Nuevos clientes pendientes */
    const nuevos = alertas.find(a => a.tipo === 'nuevos_clientes');
    if (nuevos) {
      recos.push(`Hacer seguimiento a ${nuevos.dato.clientes.slice(0,2).join(', ')} — clientes nuevos recientes.`);
    }

    /* Default */
    if (recos.length === 0) {
      recos.push('El sistema está operando con normalidad. Revisa el módulo de Embudo para identificar oportunidades.');
    }

    return recos.join(' ');
  }


  /* ==========================================================
     5.8 Chat con IA (Anthropic API)
     ========================================================== */
  function bindChatIA() {
    const input  = document.getElementById('ai-chat-input');
    const btnSend = document.getElementById('ai-chat-send');
    if (!input || !btnSend) return;

    /* Evitar doble binding */
    if (input.dataset.bound === 'true') return;
    input.dataset.bound = 'true';

    async function enviarConsulta() {
      const query = input.value.trim();
      if (!query) return;

      input.value      = '';
      input.disabled   = true;
      btnSend.disabled = true;

      /* Mostrar thinking */
      const aiResumen = document.getElementById('ai-resumen');
      const original  = aiResumen?.innerHTML;
      if (aiResumen) aiResumen.innerHTML = '<em style="opacity:0.6;">Analizando…</em>';

      try {
        const kpis    = SCCR.Motor.calcularKPIs();
        const alertas = SCCR.Motor.calcularAlertas();
        const topCli  = SCCR.Motor.rankingClientes('mes').slice(0, 5);
        const topVend = SCCR.Motor.rankingVendedores('mes');

        const contexto = `
Eres el Agente de Inteligencia Comercial del Sistema Comercial Casabe Real.
Responde SOLO con información comercial relevante, en español, de forma concisa (máx 3 oraciones).

DATOS ACTUALES:
- Ventas hoy: ${SCCR.Numero.moneda(kpis.ventas_hoy)}
- Ventas mes: ${SCCR.Numero.moneda(kpis.ventas_mes)}
- Cumplimiento meta: ${kpis.cumplimiento_mes}%
- Pedidos mes: ${kpis.pedidos_mes}
- Clientes activos: ${kpis.clientes_mes}
- Top clientes: ${topCli.map(c => `${c.nombre} (${SCCR.Numero.moneda(c.ventas)})`).join(', ')}
- Vendedores: ${topVend.map(v => `${v.vendedor} (${SCCR.Numero.moneda(v.ventas)})`).join(', ')}
- Alertas activas: ${alertas.length > 0 ? alertas.map(a => a.mensaje).join('; ') : 'ninguna'}
- Proyección mes: ${SCCR.Numero.moneda(kpis.pronostico_mes?.proyeccion_ponderada || 0)}
`.trim();

        const respuesta = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model:      'claude-sonnet-4-6',
            max_tokens: 1000,
            system:     contexto,
            messages:   [{ role: 'user', content: query }],
          }),
        });

        const data = await respuesta.json();
        const texto = data.content?.[0]?.text || 'No pude generar una respuesta.';

        if (aiResumen) aiResumen.textContent = texto;

      } catch (err) {
        SCCR.Log?.error('App', 'Error chat IA:', err);
        if (aiResumen) aiResumen.innerHTML = original;
        SCCR.toast?.('Error al consultar la IA. Intenta de nuevo.', 'error');
      } finally {
        input.disabled   = false;
        btnSend.disabled = false;
        input.focus();
      }
    }

    btnSend.addEventListener('click', enviarConsulta);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        enviarConsulta();
      }
    });
  }


  /* ==========================================================
     6. FILTROS DEL DASHBOARD
     ========================================================== */
  function bindFiltrosDashboard() {
    /* Filtro evolución */
    const filtroEvolucion = document.getElementById('filter-evolucion');
    if (filtroEvolucion && !filtroEvolucion.dataset.bound) {
      filtroEvolucion.dataset.bound = 'true';
      filtroEvolucion.addEventListener('change', (e) => {
        renderGraficoEvolucion(e.target.value);
      });
    }

    /* Filtro vendedores */
    const filtroVendedores = document.getElementById('filter-vendedores-chart');
    if (filtroVendedores && !filtroVendedores.dataset.bound) {
      filtroVendedores.dataset.bound = 'true';
      filtroVendedores.addEventListener('change', (e) => {
        renderGraficoVendedores(e.target.value);
      });
    }
  }


  /* ==========================================================
     7. BUSCADOR GLOBAL
     ========================================================== */
  function onBusqueda(e) {
    const { query, resultados } = e.detail;
    if (!query || query.length < 2) return;

    /* Por ahora solo log — se expandirá con dropdown de resultados */
    SCCR.Log?.debug('App', `Búsqueda "${query}":`,
      `${resultados.pedidos.length} pedidos,`,
      `${resultados.clientes.length} clientes,`,
      `${resultados.vendedores.length} vendedores`
    );
  }


  /* ==========================================================
     8. AUTO-SINCRONIZACIÓN
     ========================================================== */
  function iniciarAutoSync() {
    if (_intervaloSync) clearInterval(_intervaloSync);

    _intervaloSync = setInterval(() => {
      SCCR.Log?.info('App', 'Auto-sync...');
      SCCR.importar?.({ soloNuevas: true }).catch(err => {
        SCCR.Log?.warn('App', 'Auto-sync falló:', err);
      });
    }, INTERVALO_SYNC);

    SCCR.Log?.info('App', `Auto-sync cada ${INTERVALO_SYNC / 60000} min`);
  }

  function detenerAutoSync() {
    if (_intervaloSync) {
      clearInterval(_intervaloSync);
      _intervaloSync = null;
    }
  }


  /* ==========================================================
     9. OPCIONES DE CHART.JS
     ========================================================== */
  function opcionesBase() {
    return {
      responsive:          true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#2D3436',
          titleColor:      '#ffffff',
          bodyColor:       '#B2BEC3',
          padding:         12,
          cornerRadius:    8,
          callbacks: {
            label: (ctx) => ` ${SCCR.Numero.moneda(ctx.raw)}`,
          },
        },
      },
      scales: {
        x: {
          grid:  { display: false },
          ticks: { color: '#7F8C8D', font: { family: 'Montserrat', size: 11 } },
        },
        y: {
          grid:  { color: '#F5F7FA', drawBorder: false },
          ticks: {
            color:    '#7F8C8D',
            font:     { family: 'Montserrat', size: 11 },
            callback: (v) => SCCR.Numero.compacto(v),
          },
        },
      },
    };
  }

  function opcionesLineChart() {
    const base = opcionesBase();
    base.interaction = { mode: 'index', intersect: false };
    return base;
  }

  function opcionesBarChart() {
    const base = opcionesBase();
    base.scales.x.grid = { display: false };
    return base;
  }


  /* ==========================================================
     10. HELPERS
     ========================================================== */
  function setTexto(id, texto) {
    const el = document.getElementById(id);
    if (el) el.textContent = texto ?? '—';
  }


  /* ==========================================================
     API PÚBLICA
     ========================================================== */
  return {
    init,
    renderDashboard,
    poblarBienvenida,
    detenerAutoSync,
  };

})();


/* ------------------------------------------------------------
   Registrar y exponer como punto de entrada
   ------------------------------------------------------------ */
window.SCCR.App   = App;
window.SCCRApp     = App;

/* Inicialización automática (llamada desde index.html si los
   módulos ya cargaron, o directamente aquí como fallback) */
document.addEventListener('DOMContentLoaded', () => {
  if (typeof App !== 'undefined' && App.init) {
    App.init();
  }
});
