/* ============================================================
   SISTEMA COMERCIAL CASABE REAL
   js/app.js — Orquestador principal
   v2.0.0 — CORREGIDO
   ============================================================

   CORRECCIONES v2.0:
   ✅ onViewChanged ya NO cancela si el Motor no está listo.
      Guarda la vista pendiente y la activa en cuanto el Motor
      emite sccr:motor-listo.
   ✅ Módulos muestran skeleton de carga mientras esperan datos.
   ✅ activarModulo usa setTimeout(50ms) para garantizar que el
      DOM esté visible antes de que el módulo inyecte HTML.
   ✅ renderDashboard y poblarBienvenida verifican _motorListo
      internamente para no depender de llamadas externas.

   Depende de: utils.js, motor.js, importador.js
   ============================================================ */

'use strict';

window.SCCR   = window.SCCR || {};
window.SCCRApp = window.SCCRApp || {};

const App = (() => {

  /* ----------------------------------------------------------
     ESTADO
     ---------------------------------------------------------- */
  let _graficos        = {};
  let _intervaloSync   = null;
  let _motorListo      = false;
  let _viewPendiente   = null;   /* vista solicitada antes de que el Motor estuviera listo */
  let _viewActual      = 'bienvenida';
  const INTERVALO_SYNC = 10 * 60 * 1000; /* 10 minutos */


  /* ==========================================================
     1. INICIALIZACIÓN
     ========================================================== */
  function init() {
    SCCR.Log?.info('App', 'Inicializando SCCR v2.0.0');

    document.addEventListener('sccr:motor-listo', onMotorListo);
    document.addEventListener('sccr:view-changed', onViewChanged);
    document.addEventListener('sccr:busqueda', onBusqueda);

    iniciarAutoSync();
    SCCR.Log?.info('App', 'Listeners registrados');
  }


  /* ==========================================================
     2. MOTOR LISTO
     ========================================================== */
  function onMotorListo(e) {
    _motorListo = true;
    SCCR.Log?.info('App', `Motor listo: ${e.detail.total} pedidos`);

    /* Poblar pantalla de bienvenida con datos reales */
    poblarBienvenida();

    /* Si el usuario ya había navegado a un módulo mientras el Motor cargaba */
    if (_viewPendiente) {
      const pendiente = _viewPendiente;
      _viewPendiente  = null;
      SCCR.Log?.info('App', `Activando vista pendiente: ${pendiente}`);
      _despacharModulo(pendiente);
    } else if (_viewActual === 'dashboard') {
      renderDashboard();
    }
  }


  /* ==========================================================
     3. CAMBIO DE VISTA
     ========================================================== */
  function onViewChanged(e) {
    const { view } = e.detail;
    _viewActual = view;
    SCCR.Log?.debug('App', `Vista solicitada: ${view}`);

    if (view === 'bienvenida') {
      poblarBienvenida();
      return;
    }

    if (view === 'dashboard') {
      if (_motorListo) renderDashboard();
      /* Si el Motor no está listo, onMotorListo lo renderizará */
      return;
    }

    /* Para el resto de módulos */
    if (!_motorListo) {
      /* Guardar vista pendiente y mostrar skeleton de carga */
      _viewPendiente = view;
      _mostrarCargando(view);
      SCCR.Log?.warn('App', `Motor no listo — guardando pendiente: ${view}`);
      return;
    }

    _despacharModulo(view);
  }

  /**
   * Despacha el evento sccr:activar-{modulo} con un pequeño delay
   * para garantizar que el contenedor ya está visible en el DOM
   * antes de que el módulo intente inyectar HTML.
   */
  function _despacharModulo(nombre) {
    setTimeout(() => {
      SCCR.Log?.info('App', `Despachando sccr:activar-${nombre}`);
      document.dispatchEvent(new CustomEvent(`sccr:activar-${nombre}`, {
        detail: { motor: SCCR.Motor }
      }));
    }, 50);
  }

  /**
   * Muestra un skeleton de carga en el contenedor del módulo
   * mientras el Motor importa datos desde Jotform.
   */
  function _mostrarCargando(view) {
    const el = document.getElementById(`view-${view}`);
    if (!el) return;

    const labels = {
      ventas:'Ventas', clientes:'Clientes', vendedores:'Vendedores',
      metas:'Metas', embudo:'Embudo Comercial', reportes:'Reportes',
      inteligencia:'Inteligencia Comercial', administracion:'Administración',
    };

    el.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">${labels[view] || view}</h1>
        <p class="page-subtitle">Sincronizando datos desde Jotform…</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:var(--space-5);">
        <div class="grid grid-4">
          ${Array(4).fill(`
            <div class="kpi-card">
              <div class="skeleton skeleton--title" style="width:60%;"></div>
              <div class="skeleton skeleton--kpi" style="width:75%;margin-top:8px;"></div>
              <div class="skeleton skeleton--text" style="width:50%;margin-top:8px;"></div>
            </div>`).join('')}
        </div>
        <div class="table-wrap">
          <div style="padding:var(--space-4);">
            ${Array(6).fill(`
              <div style="display:flex;gap:var(--space-4);padding:var(--space-3) 0;border-bottom:1px solid var(--color-border);">
                ${Array(5).fill('<div class="skeleton skeleton--text" style="flex:1;height:13px;"></div>').join('')}
              </div>`).join('')}
          </div>
        </div>
      </div>`;
  }


  /* ==========================================================
     4. PANTALLA DE BIENVENIDA
     ========================================================== */
  function poblarBienvenida() {
    if (!_motorListo) return;

    const kpis = SCCR.Motor.calcularKPIs();

    _setTexto('kpi-pedidos-hoy',  kpis.pedidos_hoy);
    _setTexto('kpi-ventas-mes',   SCCR.Numero.moneda(kpis.ventas_mes));
    _setTexto('kpi-clientes',     kpis.clientes_mes);
    _setTexto('kpi-cumplimiento', kpis.meta_mes > 0
      ? `${kpis.cumplimiento_mes} %` : '—');

    const resumen = SCCR.Motor.resumenEjecutivo('dia');
    _setTexto('welcome-summary-text',
      resumen || 'Sistema listo. No hay pedidos registrados hoy todavía.');
  }


  /* ==========================================================
     5. DASHBOARD COMPLETO
     ========================================================== */
  function renderDashboard() {
    if (!_motorListo) return;
    SCCR.Log?.info('App', 'Renderizando Dashboard');

    const kpis = SCCR.Motor.calcularKPIs();

    _renderKPIs(kpis);
    _renderGraficoEvolucion('mes');
    _renderGraficoVendedores('mes');
    _renderRankingClientes();
    _renderRankingVendedores();
    _renderEmbudoMini();
    _renderPronosticoMini(kpis);
    _renderPanelIA(kpis);
    _bindFiltrosDashboard();

    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  /* ── 5.1 KPIs ── */
  function _renderKPIs(kpis) {
    const el = document.getElementById('dashboard-kpis');
    if (!el) return;

    el.innerHTML = [
      {
        label: 'Ventas del día', valor: SCCR.Numero.moneda(kpis.ventas_hoy),
        icono: 'dollar-sign', primario: true, periodo: 'Hoy',
      },
      {
        label: 'Ventas semanales', valor: SCCR.Numero.moneda(kpis.ventas_semana),
        icono: 'trending-up',
        delta: kpis.delta_ventas_semana.texto, signo: kpis.delta_ventas_semana.signo,
        periodo: 'Esta semana',
      },
      {
        label: 'Ventas del mes', valor: SCCR.Numero.moneda(kpis.ventas_mes),
        icono: 'bar-chart-2',
        delta: kpis.delta_ventas_mes.texto, signo: kpis.delta_ventas_mes.signo,
        periodo: SCCR.Fecha.mesActual(),
      },
      {
        label: 'Pedidos del mes', valor: SCCR.Numero.formato(kpis.pedidos_mes),
        icono: 'shopping-cart', periodo: `${kpis.clientes_mes} clientes`,
      },
      {
        label: 'Ticket promedio', valor: SCCR.Numero.moneda(kpis.ticket_promedio_mes),
        icono: 'receipt', periodo: 'Por pedido este mes',
      },
      {
        label: 'Cumplimiento meta',
        valor: kpis.meta_mes > 0 ? `${kpis.cumplimiento_mes} %` : '—',
        icono: 'target',
        periodo: kpis.meta_mes > 0
          ? `Meta: ${SCCR.Numero.moneda(kpis.meta_mes)}`
          : 'Sin meta configurada',
      },
    ].map(t => SCCR.UI.kpiHTML(t)).join('');
  }

  /* ── 5.2 Gráfico evolución ── */
  function _renderGraficoEvolucion(periodo) {
    const canvas = document.getElementById('chart-evolucion');
    if (!canvas) return;

    if (_graficos.evolucion) { try { _graficos.evolucion.destroy(); } catch(_){} }

    const { labels, datos } = SCCR.Motor.serieVentas(periodo);

    _graficos.evolucion = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Ventas (USD)', data: datos,
          borderColor: '#D71920', backgroundColor: 'rgba(215,25,32,0.08)',
          borderWidth: 2.5,
          pointBackgroundColor: '#D71920', pointBorderColor: '#fff',
          pointBorderWidth: 2, pointRadius: 4, pointHoverRadius: 6,
          fill: true, tension: 0.4,
        }],
      },
      options: _opcionesLinea(),
    });
  }

  /* ── 5.3 Gráfico vendedores ── */
  function _renderGraficoVendedores(periodo) {
    const canvas = document.getElementById('chart-vendedores');
    if (!canvas) return;

    if (_graficos.vendedores) { try { _graficos.vendedores.destroy(); } catch(_){} }

    const { labels, datos } = SCCR.Motor.serieVendedores(periodo);
    const PALETA = ['#D71920','#2D3436','#F1C40F','#F39C12','#7F8C8D','#B2BEC3','#636E72','#DFE6E9'];

    _graficos.vendedores = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Ventas (USD)', data: datos,
          backgroundColor: labels.map((_, i) => PALETA[i % PALETA.length]),
          borderRadius: 6, borderSkipped: false,
        }],
      },
      options: _opcionesBarras(),
    });
  }

  /* ── 5.4 Ranking clientes ── */
  function _renderRankingClientes() {
    const el = document.getElementById('ranking-clientes');
    if (!el) return;

    const top = SCCR.Motor.rankingClientes('mes').slice(0, 5);

    if (top.length === 0) {
      el.innerHTML = SCCR.UI.vacio({ titulo: 'Sin datos este mes', icono: 'users' });
      return;
    }

    el.innerHTML = `
      <table class="table" style="margin:-4px;">
        <thead>
          <tr><th>#</th><th>Cliente</th><th>Ventas</th><th>Tipo</th></tr>
        </thead>
        <tbody>
          ${top.map((c, i) => `
            <tr>
              <td>${SCCR.UI.rankNum(i + 1)}</td>
              <td>
                <div class="font-medium truncate" style="max-width:160px;">${SCCR.Texto.escaparHTML(c.nombre)}</div>
                <div class="text-xs text-secondary">${c.pedidos} pedido${c.pedidos !== 1 ? 's' : ''}</div>
              </td>
              <td class="font-semibold">${SCCR.Numero.moneda(c.ventas)}</td>
              <td>${SCCR.UI.badge(c.clasificacion, SCCR.UI.badgeCliente(c.clasificacion))}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <div class="card__footer" style="text-align:right;">
        <button class="btn btn-ghost btn-sm" onclick="SCCR.navigate('clientes')">
          Ver todos <i data-lucide="arrow-right" style="width:13px;height:13px;"></i>
        </button>
      </div>`;
  }

  /* ── 5.5 Ranking vendedores ── */
  function _renderRankingVendedores() {
    const el = document.getElementById('ranking-vendedores');
    if (!el) return;

    const ranking = SCCR.Motor.rankingVendedores('mes');

    if (ranking.length === 0) {
      el.innerHTML = SCCR.UI.vacio({ titulo: 'Sin datos este mes', icono: 'user-check' });
      return;
    }

    el.innerHTML = `
      <table class="table" style="margin:-4px;">
        <thead>
          <tr><th>#</th><th>Vendedor</th><th>Ventas</th><th>Meta</th></tr>
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
                  : '<span class="text-muted text-xs">Sin meta</span>'}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      <div class="card__footer" style="text-align:right;">
        <button class="btn btn-ghost btn-sm" onclick="SCCR.navigate('vendedores')">
          Ver detalle <i data-lucide="arrow-right" style="width:13px;height:13px;"></i>
        </button>
      </div>`;
  }

  /* ── 5.6 Embudo mini ── */
  function _renderEmbudoMini() {
    const el = document.getElementById('embudo-mini');
    if (!el) return;

    const datos = SCCR.Motor.datosEmbudo();
    const max   = Math.max(...datos.map(e => e.cantidad), 1);
    const kpis  = SCCR.Motor.calcularKPIs();

    el.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${datos.map(e => {
          const pct = Math.max((e.cantidad / max) * 100, e.cantidad > 0 ? 8 : 0);
          return `
            <div style="display:flex;align-items:center;gap:12px;">
              <div style="width:110px;font-size:12px;color:var(--color-text-secondary);text-align:right;flex-shrink:0;">
                ${SCCR.Texto.escaparHTML(e.etapa)}
              </div>
              <div style="flex:1;background:var(--color-border);border-radius:4px;height:22px;overflow:hidden;">
                <div style="width:${pct}%;height:100%;background:var(--color-primary);border-radius:4px;display:flex;align-items:center;padding-left:8px;font-size:11px;font-weight:700;color:#fff;transition:width .6s ease;">
                  ${e.cantidad > 0 ? e.cantidad : ''}
                </div>
              </div>
              <div style="width:28px;text-align:right;font-size:12px;font-weight:600;color:var(--color-text-primary);">
                ${e.cantidad}
              </div>
            </div>`;
        }).join('')}
        <div style="margin-top:var(--space-3);padding-top:var(--space-3);border-top:1px solid var(--color-border);display:flex;justify-content:space-between;font-size:12px;color:var(--color-text-secondary);">
          <span>Total pedidos mes: <strong>${kpis.pedidos_mes}</strong></span>
          <button class="btn btn-ghost btn-sm" style="font-size:11px;" onclick="SCCR.navigate('embudo')">
            Ver embudo <i data-lucide="arrow-right" style="width:12px;height:12px;"></i>
          </button>
        </div>
      </div>`;
  }

  /* ── 5.7 Pronóstico mini ── */
  function _renderPronosticoMini(kpis) {
    const el   = document.getElementById('pronostico-mini');
    if (!el) return;

    const p    = kpis.pronostico_mes;
    const meta = kpis.meta_mes;

    if (!p) {
      el.innerHTML = SCCR.UI.vacio({ titulo: 'Sin datos suficientes', icono: 'trending-up' });
      return;
    }

    const proyeccion = p.proyeccion_ponderada;
    const pctVsMeta  = meta > 0 ? SCCR.Numero.clamp((proyeccion / meta) * 100, 0, 200) : null;

    el.innerHTML = `
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
        ${meta > 0 && pctVsMeta !== null ? `
        <div>
          <div class="text-xs text-secondary mb-2">Proyección vs Meta</div>
          ${SCCR.UI.progreso(pctVsMeta, `${pctVsMeta?.toFixed(0)}% de la meta`,
              pctVsMeta >= 90 ? 'success' : pctVsMeta >= 60 ? 'warning' : 'danger')}
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

  /* ── 5.8 Panel IA ── */
  function _renderPanelIA(kpis) {
    _setTexto('ai-resumen', SCCR.Motor.resumenEjecutivo('mes'));

    const alertas  = SCCR.Motor.calcularAlertas();
    const aiAlertas = document.getElementById('ai-alertas');
    if (aiAlertas) {
      aiAlertas.innerHTML = alertas.length === 0
        ? 'No hay alertas activas. El sistema opera con normalidad.'
        : alertas.slice(0, 3).map(a =>
            `<div style="margin-bottom:6px;">${a.nivel === 'danger' ? '🔴' : a.nivel === 'warning' ? '🟡' : 'ℹ️'} ${SCCR.Texto.escaparHTML(a.mensaje)}</div>`
          ).join('');

      const badge    = document.getElementById('badge-alertas');
      const criticas = alertas.filter(a => a.nivel === 'danger').length;
      if (badge) { badge.style.display = criticas > 0 ? 'inline' : 'none'; badge.textContent = criticas; }
    }

    _setTexto('ai-recomendaciones', _generarRecomendaciones(kpis, alertas));

    const p = kpis.pronostico_mes;
    if (p) {
      _setTexto('ai-pronostico',
        `Proyección al cierre del mes: ${SCCR.Numero.moneda(p.proyeccion_ponderada)}. ` +
        `Ritmo necesario para la meta: ${kpis.meta_mes > 0
          ? SCCR.Numero.moneda(Math.max(0, kpis.meta_mes - kpis.ventas_mes) / Math.max(p.dias_restantes, 1)) + '/día'
          : 'meta no configurada'}.`);
    }

    _bindChatIA();
  }

  function _generarRecomendaciones(kpis, alertas) {
    const recos = [];
    const inact = alertas.filter(a => a.tipo === 'cliente_inactivo');
    if (inact.length > 0) recos.push(`Contactar a ${inact[0].dato.nombre} — lleva ${inact[0].dato.dias_sin_comprar} días sin comprar.`);
    if (alertas.some(a => a.tipo === 'meta_en_riesgo')) recos.push(`Acelerar ventas: faltan ${SCCR.Numero.moneda(Math.max(0, kpis.meta_mes - kpis.ventas_mes))} para la meta del mes.`);
    const nuevos = alertas.find(a => a.tipo === 'nuevos_clientes');
    if (nuevos) recos.push(`Hacer seguimiento a ${nuevos.dato.clientes.slice(0,2).join(', ')} — clientes nuevos recientes.`);
    return recos.length > 0
      ? recos.join(' ')
      : 'El sistema opera con normalidad. Revisa el módulo de Embudo para identificar oportunidades.';
  }

  /* ── 5.9 Chat IA ── */
  function _bindChatIA() {
    const input   = document.getElementById('ai-chat-input');
    const btnSend = document.getElementById('ai-chat-send');
    if (!input || !btnSend || input.dataset.bound === 'true') return;
    input.dataset.bound = 'true';

    let historial = [];

    async function enviarConsulta() {
      const query = input.value.trim();
      if (!query) return;

      input.value = ''; input.disabled = true; btnSend.disabled = true;

      const aiResumen = document.getElementById('ai-resumen');
      const backup    = aiResumen?.innerHTML;
      if (aiResumen) aiResumen.innerHTML = '<em style="opacity:.6;">Analizando…</em>';

      historial.push({ role: 'user', content: query });

      try {
        const kpis    = SCCR.Motor.calcularKPIs();
        const alertas = SCCR.Motor.calcularAlertas();
        const topCli  = SCCR.Motor.rankingClientes('mes').slice(0, 5);
        const topVend = SCCR.Motor.rankingVendedores('mes');

        const sistema = `Eres el Agente de Inteligencia Comercial del Sistema Comercial Casabe Real.
Responde SOLO con información comercial relevante, en español, de forma concisa (máx 3 oraciones).
DATOS ACTUALES:
- Ventas hoy: ${SCCR.Numero.moneda(kpis.ventas_hoy)} | Mes: ${SCCR.Numero.moneda(kpis.ventas_mes)}
- Cumplimiento meta: ${kpis.cumplimiento_mes}% | Pedidos mes: ${kpis.pedidos_mes}
- Clientes activos: ${kpis.clientes_mes} | Nuevos: ${kpis.clientes_nuevos_mes}
- Top clientes: ${topCli.map(c => `${c.nombre} (${SCCR.Numero.moneda(c.ventas)})`).join(', ')}
- Vendedores: ${topVend.map(v => `${v.vendedor} (${SCCR.Numero.moneda(v.ventas)})`).join(', ')}
- Alertas: ${alertas.length > 0 ? alertas.map(a => a.mensaje).join('; ') : 'ninguna'}
- Proyección mes: ${SCCR.Numero.moneda(kpis.pronostico_mes?.proyeccion_ponderada || 0)}`;

        const res  = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6', max_tokens: 1000,
            system: sistema,
            messages: historial.slice(-10),
          }),
        });

        const data  = await res.json();
        const texto = data.content?.[0]?.text || 'No pude generar una respuesta.';
        historial.push({ role: 'assistant', content: texto });
        if (aiResumen) aiResumen.textContent = texto;

      } catch (err) {
        SCCR.Log?.error('App', 'Error chat IA:', err);
        if (aiResumen) aiResumen.innerHTML = backup;
        SCCR.toast?.('Error al consultar la IA. Intenta de nuevo.', 'error');
        historial.pop();
      } finally {
        input.disabled = false; btnSend.disabled = false; input.focus();
      }
    }

    btnSend.addEventListener('click', enviarConsulta);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarConsulta(); }
    });
  }

  /* ── Filtros Dashboard ── */
  function _bindFiltrosDashboard() {
    const selEv = document.getElementById('filter-evolucion');
    if (selEv && !selEv.dataset.bound) {
      selEv.dataset.bound = 'true';
      selEv.addEventListener('change', e => _renderGraficoEvolucion(e.target.value));
    }
    const selVend = document.getElementById('filter-vendedores-chart');
    if (selVend && !selVend.dataset.bound) {
      selVend.dataset.bound = 'true';
      selVend.addEventListener('change', e => _renderGraficoVendedores(e.target.value));
    }
  }


  /* ==========================================================
     6. BÚSQUEDA GLOBAL
     ========================================================== */
  function onBusqueda(e) {
    const { query, resultados } = e.detail;
    if (!query || query.length < 2) return;
    SCCR.Log?.debug('App', `Búsqueda "${query}": ${resultados.pedidos.length} pedidos, ${resultados.clientes.length} clientes`);
  }


  /* ==========================================================
     7. AUTO-SINCRONIZACIÓN
     ========================================================== */
  function iniciarAutoSync() {
    if (_intervaloSync) clearInterval(_intervaloSync);
    _intervaloSync = setInterval(() => {
      SCCR.Log?.info('App', 'Auto-sync...');
      SCCR.importar?.({ soloNuevas: true }).catch(err =>
        SCCR.Log?.warn('App', 'Auto-sync falló:', err));
    }, INTERVALO_SYNC);
    SCCR.Log?.info('App', `Auto-sync cada ${INTERVALO_SYNC / 60000} min`);
  }

  function detenerAutoSync() {
    if (_intervaloSync) { clearInterval(_intervaloSync); _intervaloSync = null; }
  }


  /* ==========================================================
     8. OPCIONES CHART.JS
     ========================================================== */
  function _opcionesBase() {
    return {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#2D3436', titleColor: '#ffffff', bodyColor: '#B2BEC3',
          padding: 12, cornerRadius: 8,
          callbacks: { label: ctx => ` ${SCCR.Numero.moneda(ctx.raw)}` },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#7F8C8D', font: { family: 'Montserrat', size: 11 } } },
        y: {
          beginAtZero: true,
          grid: { color: '#F5F7FA', drawBorder: false },
          ticks: { color: '#7F8C8D', font: { family: 'Montserrat', size: 11 }, callback: v => SCCR.Numero.compacto(v) },
        },
      },
    };
  }

  function _opcionesLinea() {
    const base = _opcionesBase();
    base.interaction = { mode: 'index', intersect: false };
    return base;
  }

  function _opcionesBarras() {
    return _opcionesBase();
  }


  /* ==========================================================
     9. HELPERS
     ========================================================== */
  function _setTexto(id, texto) {
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
    estaListo: () => _motorListo,
  };

})();


/* ------------------------------------------------------------
   Registrar en namespace global
   ------------------------------------------------------------ */
window.SCCR.App = App;
window.SCCRApp  = App;

/* Inicialización automática */
document.addEventListener('DOMContentLoaded', () => {
  if (typeof App !== 'undefined' && App.init) {
    App.init();
  }
});
