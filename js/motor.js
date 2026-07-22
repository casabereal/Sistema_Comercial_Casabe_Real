/* ============================================================
   SISTEMA COMERCIAL CASABE REAL
   js/motor.js — Motor de Datos
   v1.0.0
   ============================================================

   Responsabilidades:
   1.  Recibir los pedidos del Importador (evento sccr:datos-importados)
   2.  Calcular todos los KPIs del Dashboard
   3.  Construir rankings de clientes y vendedores
   4.  Calcular cumplimiento de metas
   5.  Generar datos para gráficos (Chart.js)
   6.  Calcular pronósticos del mes
   7.  Detectar alertas comerciales
   8.  Exponer SCCR.Motor con todos los métodos para los módulos

   Depende de: utils.js, importador.js
   ============================================================ */

'use strict';

window.SCCR = window.SCCR || {};

const Motor = (() => {

  /* ----------------------------------------------------------
     ESTADO INTERNO
     ---------------------------------------------------------- */
  let _pedidos   = [];   /* Todos los pedidos normalizados */
  let _metas     = {};   /* Metas por vendedor cargadas desde data/metas.json */
  let _config    = {};   /* Configuración general */
  let _listo     = false;

  /* ----------------------------------------------------------
     ESCUCHAR AL IMPORTADOR
     ---------------------------------------------------------- */
  document.addEventListener('sccr:datos-importados', (e) => {
    _pedidos = e.detail.pedidos || [];
    _listo   = true;
    SCCR.Log?.info('Motor', `Procesando ${_pedidos.length} pedidos`);

    /* Cargar metas y config, luego emitir datos listos */
    Promise.all([cargarMetas(), cargarConfig()]).then(() => {
      document.dispatchEvent(new CustomEvent('sccr:motor-listo', {
        detail: { total: _pedidos.length, timestamp: new Date().toISOString() }
      }));
    });
  });


  /* ==========================================================
     1. CARGA DE ARCHIVOS DE SOPORTE
     ========================================================== */

  async function cargarMetas() {
    try {
      const res = await fetch('data/metas.json');
      if (res.ok) {
        const data = await res.json();
        _metas = Array.isArray(data) ? indexarPor(data, 'vendedor') : data;
      }
    } catch (_) {
      _metas = {};
    }
  }

  async function cargarConfig() {
    try {
      const res = await fetch('data/config.json');
      if (res.ok) _config = await res.json();
    } catch (_) {
      _config = {};
    }
  }

  /* Indexa un array de objetos por una clave → { valor: objeto } */
  function indexarPor(arr, clave) {
    return arr.reduce((acc, item) => {
      acc[item[clave]] = item;
      return acc;
    }, {});
  }


  /* ==========================================================
     2. FILTROS BASE
     ========================================================== */

  /**
   * Filtra pedidos por período.
   * @param {'hoy'|'semana'|'mes'|'ano'|'todo'} periodo
   */
  function filtrarPorPeriodo(periodo) {
    if (periodo === 'todo') return [..._pedidos];
    const { desde, hasta } = SCCR.Fecha.rango(periodo);
    return _pedidos.filter(p => {
      const fecha = new Date(p.fecha + 'T00:00:00');
      return fecha >= desde && fecha <= hasta;
    });
  }

  /** Filtra por vendedor (nombre exacto o 'todos') */
  function filtrarPorVendedor(pedidos, vendedor) {
    if (!vendedor || vendedor === 'todos') return pedidos;
    return pedidos.filter(p =>
      SCCR.Texto.normalizar(p.vendedor) === SCCR.Texto.normalizar(vendedor)
    );
  }

  /** Filtra por tipo: 'recurrente' | 'nuevo' | 'todos' */
  function filtrarPorTipo(pedidos, tipo) {
    if (!tipo || tipo === 'todos') return pedidos;
    return pedidos.filter(p => p.tipo === tipo);
  }

  /** Filtra pedidos que coinciden con una búsqueda de texto */
  function filtrarPorTexto(pedidos, texto) {
    if (!texto) return pedidos;
    const q = SCCR.Texto.normalizar(texto);
    return pedidos.filter(p =>
      SCCR.Texto.normalizar(p.establecimiento).includes(q) ||
      SCCR.Texto.normalizar(p.vendedor).includes(q) ||
      p.productos.some(prod => SCCR.Texto.normalizar(prod.producto).includes(q))
    );
  }


  /* ==========================================================
     3. KPIs PRINCIPALES
     ========================================================== */

  /**
   * Calcula todos los KPIs para el Dashboard.
   * @returns {Object} objeto con todos los indicadores
   */
  function calcularKPIs() {
    const hoy    = filtrarPorPeriodo('hoy');
    const semana = filtrarPorPeriodo('semana');
    const mes    = filtrarPorPeriodo('mes');
    const ano    = filtrarPorPeriodo('ano');

    /* ── Ventas (monto total) ───────────────────────────── */
    const ventasHoy    = sumarTotal(hoy);
    const ventasSemana = sumarTotal(semana);
    const ventasMes    = sumarTotal(mes);
    const ventasAno    = sumarTotal(ano);

    /* ── Pedidos (cantidad de órdenes) ─────────────────── */
    const pedidosHoy    = hoy.length;
    const pedidosSemana = semana.length;
    const pedidosMes    = mes.length;

    /* ── Cajas / unidades vendidas ──────────────────────── */
    const cajasHoy    = sumarCajas(hoy);
    const cajasSemana = sumarCajas(semana);
    const cajasMes    = sumarCajas(mes);

    /* ── Clientes únicos ────────────────────────────────── */
    const clientesHoy  = clientesUnicos(hoy);
    const clientesMes  = clientesUnicos(mes);
    const clientesAno  = clientesUnicos(ano);
    const clientesNuevosMes = mes.filter(p => p.es_nuevo_cliente).length;

    /* ── Ticket promedio ────────────────────────────────── */
    const ticketPromedioMes = pedidosMes > 0
      ? SCCR.Numero.redondear(ventasMes / pedidosMes, 2)
      : 0;

    /* ── Variaciones vs semana/mes anterior ─────────────── */
    const mesPasado       = pedidosEntreFechas(inicioMesAnterior(), finMesAnterior());
    const ventasMesPasado = sumarTotal(mesPasado);
    const deltaVentasMes  = SCCR.Numero.variacion(ventasMesPasado, ventasMes);

    const semanaPasada       = pedidosEntreFechas(inicioSemanaPasada(), finSemanaPasada());
    const ventasSemanaPasada = sumarTotal(semanaPasada);
    const deltaVentasSemana  = SCCR.Numero.variacion(ventasSemanaPasada, ventasSemana);

    /* ── Meta del mes ───────────────────────────────────── */
    const metaMes         = _config.meta_mensual_usd || obtenerMetaGlobal();
    const cumplimientoMes = metaMes > 0
      ? SCCR.Numero.clamp((ventasMes / metaMes) * 100, 0, 999)
      : 0;

    /* ── Pronóstico ─────────────────────────────────────── */
    const pronostico = calcularPronosticoMes(ventasMes);

    return {
      /* Ventas */
      ventas_hoy:    ventasHoy,
      ventas_semana: ventasSemana,
      ventas_mes:    ventasMes,
      ventas_ano:    ventasAno,

      /* Pedidos */
      pedidos_hoy:    pedidosHoy,
      pedidos_semana: pedidosSemana,
      pedidos_mes:    pedidosMes,

      /* Cajas */
      cajas_hoy:    cajasHoy,
      cajas_semana: cajasSemana,
      cajas_mes:    cajasMes,

      /* Clientes */
      clientes_hoy:        clientesHoy,
      clientes_mes:        clientesMes,
      clientes_ano:        clientesAno,
      clientes_nuevos_mes: clientesNuevosMes,

      /* Ticket promedio */
      ticket_promedio_mes: ticketPromedioMes,

      /* Variaciones */
      delta_ventas_mes:    deltaVentasMes,
      delta_ventas_semana: deltaVentasSemana,

      /* Meta y cumplimiento */
      meta_mes:         metaMes,
      cumplimiento_mes: SCCR.Numero.redondear(cumplimientoMes, 1),

      /* Pronóstico */
      pronostico_mes: pronostico,

      /* Totales generales */
      total_pedidos: _pedidos.length,
      total_clientes: clientesUnicos(_pedidos),
    };
  }


  /* ==========================================================
     4. HELPERS DE CÁLCULO
     ========================================================== */

  function sumarTotal(pedidos) {
    return SCCR.Numero.redondear(
      pedidos.reduce((s, p) => s + (p.total || 0), 0), 2
    );
  }

  function sumarCajas(pedidos) {
    return pedidos.reduce((s, p) => s + (p.cantidad_items || 0), 0);
  }

  function clientesUnicos(pedidos) {
    return new Set(
      pedidos.map(p => SCCR.Texto.normalizar(p.establecimiento))
    ).size;
  }

  function pedidosEntreFechas(desde, hasta) {
    return _pedidos.filter(p => {
      const f = new Date(p.fecha + 'T00:00:00');
      return f >= desde && f <= hasta;
    });
  }

  /* Fechas del mes anterior */
  function inicioMesAnterior() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() - 1, 1);
  }
  function finMesAnterior() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 0, 23, 59, 59, 999);
  }

  /* Fechas de la semana pasada */
  function inicioSemanaPasada() {
    const d = new Date();
    const dia = d.getDay() === 0 ? 6 : d.getDay() - 1;
    const lunes = new Date(d);
    lunes.setDate(d.getDate() - dia - 7);
    lunes.setHours(0, 0, 0, 0);
    return lunes;
  }
  function finSemanaPasada() {
    const inicio = inicioSemanaPasada();
    const fin = new Date(inicio);
    fin.setDate(inicio.getDate() + 6);
    fin.setHours(23, 59, 59, 999);
    return fin;
  }

  /* Meta global: promedio de metas individuales o valor por defecto */
  function obtenerMetaGlobal() {
    const metas = Object.values(_metas);
    if (metas.length === 0) return 0;
    return metas.reduce((s, m) => s + (m.meta_mensual || 0), 0);
  }


  /* ==========================================================
     5. PRONÓSTICO DEL MES
     ========================================================== */

  /**
   * Proyecta las ventas al cierre del mes basado en el ritmo actual.
   */
  function calcularPronosticoMes(ventasMesActual) {
    const hoy    = new Date();
    const diaHoy = hoy.getDate();
    const diasMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
    const diasRestantes = diasMes - diaHoy;

    if (diaHoy === 0) return ventasMesActual;

    /* Ritmo diario promedio × días del mes */
    const ritmoDiario     = ventasMesActual / diaHoy;
    const proyeccionLineal = SCCR.Numero.redondear(ritmoDiario * diasMes, 2);

    /* Ajuste: ponderar últimos 7 días (más representativo) */
    const ultimos7 = filtrarPorPeriodo('semana');
    const ventasUlt7 = sumarTotal(ultimos7);
    const diasConDatos = Math.min(diaHoy, 7);
    const ritmoReciente = diasConDatos > 0 ? ventasUlt7 / diasConDatos : ritmoDiario;
    const proyeccionPonderada = SCCR.Numero.redondear(
      ventasMesActual + (ritmoReciente * diasRestantes), 2
    );

    return {
      proyeccion_lineal:    proyeccionLineal,
      proyeccion_ponderada: proyeccionPonderada,
      ritmo_diario:         SCCR.Numero.redondear(ritmoDiario, 2),
      dias_transcurridos:   diaHoy,
      dias_restantes:       diasRestantes,
      dias_mes:             diasMes,
      porcentaje_mes:       SCCR.Numero.redondear((diaHoy / diasMes) * 100, 1),
    };
  }


  /* ==========================================================
     6. RANKING DE VENDEDORES
     ========================================================== */

  /**
   * Genera el ranking de vendedores con KPIs individuales.
   * @param {'mes'|'semana'|'ano'|'todo'} periodo
   * @returns {Array}
   */
  function rankingVendedores(periodo = 'mes') {
    const pedidos = filtrarPorPeriodo(periodo);
    const grupos  = SCCR.Coleccion.groupBy(pedidos, 'vendedor');

    const ranking = Object.entries(grupos).map(([vendedor, peds]) => {
      const ventas     = sumarTotal(peds);
      const cajas      = sumarCajas(peds);
      const clientes   = clientesUnicos(peds);
      const pedidosCnt = peds.length;
      const ticket     = pedidosCnt > 0
        ? SCCR.Numero.redondear(ventas / pedidosCnt, 2)
        : 0;
      const nuevos     = peds.filter(p => p.es_nuevo_cliente).length;

      /* Meta del vendedor */
      const metaVend    = _metas[vendedor]?.meta_mensual || 0;
      const cumplimiento = metaVend > 0
        ? SCCR.Numero.clamp((ventas / metaVend) * 100, 0, 999)
        : null;

      return {
        vendedor,
        ventas,
        cajas,
        clientes,
        pedidos: pedidosCnt,
        ticket_promedio: ticket,
        nuevos_clientes: nuevos,
        meta: metaVend,
        cumplimiento: cumplimiento !== null
          ? SCCR.Numero.redondear(cumplimiento, 1)
          : null,
      };
    });

    return SCCR.Coleccion.ordenar(ranking, 'ventas', 'desc');
  }


  /* ==========================================================
     7. RANKING DE CLIENTES
     ========================================================== */

  /**
   * Genera el ranking de clientes con clasificación ABC.
   * @param {'mes'|'semana'|'ano'|'todo'} periodo
   * @returns {Array}
   */
  function rankingClientes(periodo = 'mes') {
    const pedidos = filtrarPorPeriodo(periodo);
    const grupos  = SCCR.Coleccion.groupBy(pedidos, 'establecimiento');

    const clientes = Object.entries(grupos).map(([nombre, peds]) => {
      const ventas       = sumarTotal(peds);
      const pedidosCnt   = peds.length;
      const cajas        = sumarCajas(peds);
      const ticket       = pedidosCnt > 0
        ? SCCR.Numero.redondear(ventas / pedidosCnt, 2)
        : 0;
      const ultimoPedido = peds.reduce((max, p) =>
        p.fecha > max ? p.fecha : max, ''
      );
      const diasSinComprar = ultimoPedido
        ? SCCR.Fecha.diasDesde(ultimoPedido)
        : null;
      const esNuevo = peds.some(p => p.es_nuevo_cliente);
      const rif     = peds.find(p => p.rif)?.rif || '';
      const telefono = peds[0]?.telefono_compras || '';
      const contacto = peds[0]?.contacto_compras || '';

      return {
        nombre,
        ventas,
        pedidos: pedidosCnt,
        cajas,
        ticket_promedio: ticket,
        ultimo_pedido:   ultimoPedido,
        dias_sin_comprar: diasSinComprar,
        es_nuevo:        esNuevo,
        rif,
        telefono,
        contacto,
        vendedor_principal: vendedorPrincipal(peds),
      };
    });

    /* Ordenar por ventas para calcular ABC */
    const ordenados = SCCR.Coleccion.ordenar(clientes, 'ventas', 'desc');
    return asignarClasificacionABC(ordenados);
  }

  /** Vendedor que más pedidos tiene con este cliente */
  function vendedorPrincipal(peds) {
    const conteo = SCCR.Coleccion.contarPorGrupo(peds, 'vendedor');
    return Object.entries(conteo).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  }

  /**
   * Clasificación ABC:
   * A → top 20% de clientes que generan el 80% de ventas (Pareto)
   * B → siguiente 30%
   * C → restante 50%
   */
  function asignarClasificacionABC(clientesOrdenados) {
    const totalVentas = clientesOrdenados.reduce((s, c) => s + c.ventas, 0);
    let acumulado = 0;

    return clientesOrdenados.map(cliente => {
      acumulado += cliente.ventas;
      const pct = totalVentas > 0 ? (acumulado / totalVentas) * 100 : 0;
      const clasificacion = pct <= 80 ? 'A' : pct <= 95 ? 'B' : 'C';
      return { ...cliente, clasificacion };
    });
  }


  /* ==========================================================
     8. DATOS PARA GRÁFICOS
     ========================================================== */

  /**
   * Serie temporal de ventas para el gráfico de evolución.
   * @param {'semana'|'mes'|'ano'} periodo
   * @returns {{ labels, datos }}
   */
  function serieVentas(periodo = 'mes') {
    if (periodo === 'semana') {
      return serieUltimosDias(7);
    } else if (periodo === 'mes') {
      return seriePorSemanasDelMes();
    } else {
      return seriePorMesesDelAno();
    }
  }

  function serieUltimosDias(n) {
    const hoy    = new Date();
    const labels = [];
    const datos  = [];

    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(hoy);
      d.setDate(hoy.getDate() - i);
      const isoFecha = d.toISOString().split('T')[0];

      labels.push(d.toLocaleDateString('es-VE', { day: 'numeric', month: 'short' }));

      const ventasDia = _pedidos
        .filter(p => p.fecha === isoFecha)
        .reduce((s, p) => s + p.total, 0);

      datos.push(SCCR.Numero.redondear(ventasDia, 2));
    }

    return { labels, datos };
  }

  function seriePorSemanasDelMes() {
    const hoy   = new Date();
    const anio  = hoy.getFullYear();
    const mes   = hoy.getMonth();
    const labels = [];
    const datos  = [];

    let semana = 1;
    let inicio = new Date(anio, mes, 1);

    while (inicio.getMonth() === mes) {
      const fin = new Date(inicio);
      fin.setDate(inicio.getDate() + 6);
      if (fin.getMonth() !== mes) fin.setDate(
        new Date(anio, mes + 1, 0).getDate()
      );

      labels.push(`Sem ${semana}`);

      const ventasSem = _pedidos
        .filter(p => {
          const f = new Date(p.fecha + 'T00:00:00');
          return f >= inicio && f <= fin;
        })
        .reduce((s, p) => s + p.total, 0);

      datos.push(SCCR.Numero.redondear(ventasSem, 2));

      inicio = new Date(fin);
      inicio.setDate(fin.getDate() + 1);
      semana++;
    }

    return { labels, datos };
  }

  function seriePorMesesDelAno() {
    const anio   = new Date().getFullYear();
    const meses  = SCCR.Fecha.mesesDelAno();
    const labels = meses;
    const datos  = meses.map((_, i) => {
      const ventasMes = _pedidos
        .filter(p => {
          const f = new Date(p.fecha + 'T00:00:00');
          return f.getFullYear() === anio && f.getMonth() === i;
        })
        .reduce((s, p) => s + p.total, 0);
      return SCCR.Numero.redondear(ventasMes, 2);
    });
    return { labels, datos };
  }

  /**
   * Ventas por vendedor para gráfico de barras.
   * @param {'mes'|'ano'} periodo
   * @returns {{ labels, datos }}
   */
  function serieVendedores(periodo = 'mes') {
    const ranking = rankingVendedores(periodo);
    return {
      labels: ranking.map(v => v.vendedor),
      datos:  ranking.map(v => v.ventas),
    };
  }

  /**
   * Distribución de ventas por producto (para gráfico de dona).
   * @param {'mes'|'ano'|'todo'} periodo
   * @returns {{ labels, datos }}
   */
  function serieProductos(periodo = 'mes') {
    const pedidos = filtrarPorPeriodo(periodo);
    const conteo  = {};

    pedidos.forEach(p => {
      p.productos.forEach(prod => {
        const nombre = prod.producto || 'Otros';
        if (!conteo[nombre]) conteo[nombre] = 0;
        conteo[nombre] += prod.subtotal || 0;
      });
    });

    const ordenado = Object.entries(conteo)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8); /* Top 8 productos */

    return {
      labels: ordenado.map(([k]) => k),
      datos:  ordenado.map(([, v]) => SCCR.Numero.redondear(v, 2)),
    };
  }

  /**
   * Datos para el mini-embudo del Dashboard.
   * Cuenta pedidos por estado.
   */
  function datosEmbudo() {
    const etapas = [
      { etapa: 'Prospecto',    clave: 'prospecto' },
      { etapa: 'Contacto',     clave: 'contacto' },
      { etapa: 'Presentación', clave: 'presentacion' },
      { etapa: 'Negociación',  clave: 'negociacion' },
      { etapa: 'Pedido',       clave: 'pedido' },
      { etapa: 'Cliente Activo', clave: 'cliente_activo' },
    ];

    /* Por ahora, los pedidos confirmados van a "Pedido" o "Cliente Activo" */
    const mesPedidos = filtrarPorPeriodo('mes');
    const total      = mesPedidos.length;

    return etapas.map((e, i) => ({
      ...e,
      cantidad: i === 4 ? total : i === 5
        ? clientesUnicos(filtrarPorPeriodo('mes'))
        : 0,
    }));
  }


  /* ==========================================================
     9. ALERTAS COMERCIALES
     ========================================================== */

  /**
   * Detecta situaciones que requieren atención.
   * @returns {Array<{tipo, mensaje, nivel, dato}>}
   */
  function calcularAlertas() {
    const alertas = [];
    const hoy     = new Date();

    /* ── 1. Clientes inactivos (no compran en N días) ─────── */
    const DIAS_INACTIVIDAD = _config.dias_inactividad || 14;
    const clientesMes      = rankingClientes('mes');
    const clientesTodo      = rankingClientes('todo');

    clientesTodo.forEach(c => {
      if ((c.dias_sin_comprar || 0) >= DIAS_INACTIVIDAD) {
        alertas.push({
          tipo:    'cliente_inactivo',
          nivel:   c.dias_sin_comprar >= 30 ? 'danger' : 'warning',
          mensaje: `${c.nombre} lleva ${c.dias_sin_comprar} días sin comprar`,
          dato:    c,
        });
      }
    });

    /* ── 2. Ventas por debajo del ritmo esperado ──────────── */
    const kpis = calcularKPIs();
    const ritmoDiario = kpis.pronostico_mes?.ritmo_diario || 0;
    const ventasHoy   = kpis.ventas_hoy;

    if (ritmoDiario > 0 && ventasHoy < ritmoDiario * 0.5 && hoy.getDay() !== 0) {
      alertas.push({
        tipo:    'ventas_bajas_hoy',
        nivel:   'warning',
        mensaje: `Ventas de hoy (${SCCR.Numero.moneda(ventasHoy)}) están muy por debajo del ritmo diario esperado`,
        dato:    { ventas_hoy: ventasHoy, ritmo: ritmoDiario },
      });
    }

    /* ── 3. Cumplimiento de meta en riesgo ────────────────── */
    const cumplimiento = kpis.cumplimiento_mes;
    const pctMesTranscurrido = kpis.pronostico_mes?.porcentaje_mes || 0;

    if (kpis.meta_mes > 0 && cumplimiento < pctMesTranscurrido - 15) {
      alertas.push({
        tipo:    'meta_en_riesgo',
        nivel:   'danger',
        mensaje: `Cumplimiento ${cumplimiento}% con ${pctMesTranscurrido}% del mes transcurrido — Meta en riesgo`,
        dato:    { cumplimiento, pct_mes: pctMesTranscurrido },
      });
    }

    /* ── 4. Vendedor sin actividad hoy ────────────────────── */
    const todosVendedores   = [...new Set(_pedidos.map(p => p.vendedor))];
    const vendedoresHoy     = new Set(filtrarPorPeriodo('hoy').map(p => p.vendedor));
    const sinActividadHoy   = todosVendedores.filter(v => !vendedoresHoy.has(v));

    if (sinActividadHoy.length > 0 && hoy.getDay() !== 0 && hoy.getDay() !== 6) {
      sinActividadHoy.forEach(v => {
        alertas.push({
          tipo:    'vendedor_sin_actividad',
          nivel:   'warning',
          mensaje: `${v} no ha registrado pedidos hoy`,
          dato:    { vendedor: v },
        });
      });
    }

    /* ── 5. Nuevos clientes sin seguimiento ───────────────── */
    const nuevosRecientes = _pedidos.filter(p =>
      p.es_nuevo_cliente &&
      SCCR.Fecha.diasDesde(p.fecha) <= 7
    );
    if (nuevosRecientes.length > 0) {
      alertas.push({
        tipo:    'nuevos_clientes',
        nivel:   'info',
        mensaje: `${nuevosRecientes.length} nuevo${nuevosRecientes.length > 1 ? 's' : ''} cliente${nuevosRecientes.length > 1 ? 's' : ''} registrado${nuevosRecientes.length > 1 ? 's' : ''} en los últimos 7 días`,
        dato:    { clientes: nuevosRecientes.map(p => p.establecimiento) },
      });
    }

    /* Ordenar por nivel de prioridad */
    const prioridad = { danger: 0, warning: 1, info: 2 };
    return alertas.sort((a, b) =>
      (prioridad[a.nivel] ?? 3) - (prioridad[b.nivel] ?? 3)
    );
  }


  /* ==========================================================
     10. RESUMEN EJECUTIVO (texto para panel de IA)
     ========================================================== */

  /**
   * Genera un resumen ejecutivo en texto para el panel de IA
   * y la pantalla de bienvenida, usando los datos del motor.
   * @param {'dia'|'semana'|'mes'} alcance
   * @returns {string}
   */
  function resumenEjecutivo(alcance = 'dia') {
    const kpis    = calcularKPIs();
    const alertas = calcularAlertas();
    const mes     = SCCR.Fecha.mesActual();

    const partes = [];

    if (alcance === 'dia') {
      if (kpis.pedidos_hoy === 0) {
        partes.push(`Aún no se han registrado pedidos hoy.`);
      } else {
        partes.push(
          `Hoy se registraron ${kpis.pedidos_hoy} pedido${kpis.pedidos_hoy > 1 ? 's' : ''} ` +
          `por un total de ${SCCR.Numero.moneda(kpis.ventas_hoy)}.`
        );
      }
      partes.push(
        `En el mes de ${mes} llevamos ${SCCR.Numero.moneda(kpis.ventas_mes)} ` +
        `en ${kpis.pedidos_mes} pedidos — ` +
        `${kpis.cumplimiento_mes}% de la meta mensual.`
      );
    }

    if (alcance === 'semana') {
      partes.push(
        `Esta semana: ${SCCR.Numero.moneda(kpis.ventas_semana)} ` +
        `en ${kpis.pedidos_semana} pedidos con ` +
        `${kpis.clientes_mes} clientes activos.`
      );
      const { texto, signo } = kpis.delta_ventas_semana;
      partes.push(`Comparado con la semana anterior: ${texto}.`);
    }

    if (alcance === 'mes') {
      partes.push(
        `${mes.charAt(0).toUpperCase() + mes.slice(1)}: ` +
        `${SCCR.Numero.moneda(kpis.ventas_mes)} acumulados — ` +
        `${kpis.cumplimiento_mes}% de la meta.`
      );
      const pron = kpis.pronostico_mes;
      if (pron) {
        partes.push(
          `Proyección al cierre del mes: ${SCCR.Numero.moneda(pron.proyeccion_ponderada)}.`
        );
      }
    }

    /* Alertas prioritarias */
    const alertasCriticas = alertas.filter(a => a.nivel === 'danger');
    if (alertasCriticas.length > 0) {
      partes.push(`⚠️ ${alertasCriticas[0].mensaje}.`);
    }

    return partes.join(' ');
  }


  /* ==========================================================
     11. METAS POR VENDEDOR
     ========================================================== */

  /**
   * Cumplimiento de meta por cada vendedor en el mes actual.
   * @returns {Array}
   */
  function cumplimientoPorVendedor() {
    const ranking = rankingVendedores('mes');

    return ranking.map(v => {
      const meta = _metas[v.vendedor]?.meta_mensual || 0;
      const pct  = meta > 0
        ? SCCR.Numero.clamp((v.ventas / meta) * 100, 0, 999)
        : null;

      return {
        ...v,
        meta,
        cumplimiento_pct: pct !== null ? SCCR.Numero.redondear(pct, 1) : null,
        faltante:         meta > 0 ? Math.max(0, meta - v.ventas) : 0,
      };
    });
  }

  /**
   * Guarda o actualiza una meta de vendedor en localStorage.
   * (Se persiste en data/metas.json en producción vía API)
   */
  function guardarMeta(vendedor, metaMensual) {
    _metas[vendedor] = { vendedor, meta_mensual: metaMensual };
    SCCR.Store.set('metas_override', _metas);
    SCCR.Log?.info('Motor', `Meta de ${vendedor} actualizada: ${metaMensual}`);
  }


  /* ==========================================================
     12. HISTORIAL DE UN CLIENTE
     ========================================================== */

  /**
   * Retorna todos los pedidos de un cliente específico
   * con indicadores calculados.
   */
  function historialCliente(nombre) {
    const pedidos = _pedidos.filter(p =>
      SCCR.Texto.normalizar(p.establecimiento) ===
      SCCR.Texto.normalizar(nombre)
    );

    const ordenados = SCCR.Coleccion.ordenar(pedidos, 'fecha', 'desc');
    const ventas    = sumarTotal(pedidos);
    const cajas     = sumarCajas(pedidos);
    const ticket    = pedidos.length > 0
      ? SCCR.Numero.redondear(ventas / pedidos.length, 2)
      : 0;
    const primero   = ordenados[ordenados.length - 1]?.fecha || '';
    const ultimo    = ordenados[0]?.fecha || '';
    const frecuencia = pedidos.length > 1 && primero && ultimo
      ? SCCR.Numero.redondear(
          SCCR.Fecha.diasEntre(primero, ultimo) / (pedidos.length - 1), 1
        )
      : null;

    return {
      nombre,
      pedidos: ordenados,
      total_pedidos:   pedidos.length,
      ventas_totales:  ventas,
      cajas_totales:   cajas,
      ticket_promedio: ticket,
      primer_pedido:   primero,
      ultimo_pedido:   ultimo,
      frecuencia_dias: frecuencia,
      clasificacion:   rankingClientes('todo').find(
        c => SCCR.Texto.normalizar(c.nombre) === SCCR.Texto.normalizar(nombre)
      )?.clasificacion || '—',
    };
  }


  /* ==========================================================
     13. BÚSQUEDA GLOBAL
     ========================================================== */

  /**
   * Busca en pedidos, clientes y vendedores.
   * @param {string} query
   * @returns {{ pedidos, clientes, vendedores }}
   */
  function buscar(query) {
    if (!query || query.length < 2) return { pedidos: [], clientes: [], vendedores: [] };

    const q = SCCR.Texto.normalizar(query);

    const pedidosFiltrados = _pedidos.filter(p =>
      SCCR.Texto.normalizar(p.establecimiento).includes(q) ||
      SCCR.Texto.normalizar(p.vendedor).includes(q) ||
      p.productos.some(pr => SCCR.Texto.normalizar(pr.producto).includes(q))
    ).slice(0, 10);

    const clientesFiltrados = rankingClientes('todo')
      .filter(c => SCCR.Texto.normalizar(c.nombre).includes(q))
      .slice(0, 5);

    const vendedoresFiltrados = rankingVendedores('todo')
      .filter(v => SCCR.Texto.normalizar(v.vendedor).includes(q))
      .slice(0, 5);

    return {
      pedidos:    pedidosFiltrados,
      clientes:   clientesFiltrados,
      vendedores: vendedoresFiltrados,
    };
  }


  /* ==========================================================
     14. EXPORTACIÓN DE DATOS
     ========================================================== */

  /**
   * Prepara los datos del período para exportar a Excel/PDF.
   * @param {'mes'|'semana'|'ano'|'todo'} periodo
   * @returns {Array<Object>} filas planas listas para exportar
   */
  function exportar(periodo = 'mes') {
    const pedidos = filtrarPorPeriodo(periodo);

    return pedidos.map(p => ({
      'Fecha':              SCCR.Fecha.format(p.fecha),
      'Tipo':               p.es_nuevo_cliente ? 'Nuevo Cliente' : 'Recurrente',
      'Vendedor':           p.vendedor,
      'Cliente':            p.establecimiento,
      'RIF':                p.rif || '',
      'Contacto Compras':   p.contacto_compras,
      'Teléfono Compras':   p.telefono_compras,
      'Contacto Pagos':     p.contacto_pagos || '',
      'Teléfono Pagos':     p.telefono_pagos || '',
      'Productos':          p.productos_texto || p.productos.map(pr =>
        `${pr.producto} x${pr.cantidad}`).join('; '),
      'Unidades':           p.cantidad_items,
      'Total USD':          p.total,
      'Estado':             p.estado || '',
    }));
  }


  /* ==========================================================
     API PÚBLICA
     ========================================================== */
  return {

    /* Estado */
    estaListo:    () => _listo,
    pedidos:      () => [..._pedidos],
    totalPedidos: () => _pedidos.length,

    /* KPIs */
    calcularKPIs,
    calcularPronosticoMes,
    calcularAlertas,
    resumenEjecutivo,

    /* Rankings */
    rankingVendedores,
    rankingClientes,
    cumplimientoPorVendedor,

    /* Gráficos */
    serieVentas,
    serieVendedores,
    serieProductos,
    datosEmbudo,

    /* Clientes */
    historialCliente,

    /* Búsqueda */
    buscar,

    /* Filtros */
    filtrarPorPeriodo,
    filtrarPorVendedor,
    filtrarPorTipo,
    filtrarPorTexto,

    /* Metas */
    guardarMeta,

    /* Exportación */
    exportar,

    /* Internos (para testing) */
    _config: () => _config,
    _metas:  () => ({ ..._metas }),
  };

})();


/* ------------------------------------------------------------
   Registrar en el namespace global
   ------------------------------------------------------------ */
window.SCCR.Motor = Motor;


/* ------------------------------------------------------------
   Conectar búsqueda global del header
   ------------------------------------------------------------ */
document.addEventListener('DOMContentLoaded', () => {
  const inputBusqueda = document.getElementById('global-search');
  if (!inputBusqueda) return;

  const buscarConDebounce = SCCR.debounce((query) => {
    if (!Motor.estaListo()) return;
    if (query.length < 2) return;
    const resultados = Motor.buscar(query);
    SCCR.Log?.debug('Motor', 'Búsqueda:', query, resultados);
    document.dispatchEvent(new CustomEvent('sccr:busqueda', {
      detail: { query, resultados }
    }));
  }, 350);

  inputBusqueda.addEventListener('input', (e) => {
    buscarConDebounce(e.target.value.trim());
  });
});
