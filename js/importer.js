/* ============================================================
   SISTEMA COMERCIAL CASABE REAL
   js/importador.js — Importador de datos desde Jotform
   v1.0.0
   ============================================================

   Responsabilidades:
   1. Conectarse a la API de Jotform y traer submissions
   2. Normalizar y unificar ambos formularios en un schema común
   3. Parsear el campo "Productos pedidos" → líneas de detalle
   4. Persistir los datos crudos en localStorage (caché)
   5. Disparar evento 'sccr:datos-importados' para que el Motor
      procese y el Dashboard se actualice
   6. Exponer SCCR.importar() como función pública

   Formularios:
   ┌─────────────────────────────────────────────────────┐
   │ CARGA DE PEDIDOS (recurrentes)  ID: 222905670810655 │
   │  · Vendedor                                         │
   │  · Nombre del establecimiento                       │
   │  · Productos pedidos (texto con cantidades/precios) │
   │  · Fecha del pedido                                 │
   │  · Persona contacto Compras                         │
   │  · Número de teléfono Compras                       │
   └─────────────────────────────────────────────────────┘
   ┌─────────────────────────────────────────────────────┐
   │ CARGA DE PEDIDOS NC (nuevos)    ID: 261445908854063 │
   │  · Vendedor                                         │
   │  · Nombre del establecimiento                       │
   │  · Rif de la empresa (imagen)                       │
   │  · Productos pedidos (texto con cantidades/precios) │
   │  · Fecha del pedido                                 │
   │  · Persona contacto Compras                         │
   │  · Número de teléfono Compras                       │
   │  · Persona contacto Pagos                           │
   │  · Número de teléfono Pagos                         │
   └─────────────────────────────────────────────────────┘
   ============================================================ */

'use strict';

window.SCCR = window.SCCR || {};

const Importador = (() => {

  /* ----------------------------------------------------------
     CONFIGURACIÓN
     ---------------------------------------------------------- */
  const CONFIG = {
    /* IDs de los formularios en Jotform */
    FORM_RECURRENTES: '222905670810655',
    FORM_NUEVOS:      '261445908854063',

    /* Clave de API — se carga desde data/config.json o localStorage */
    API_KEY: null,

    /* Base URL de la API de Jotform */
    API_BASE: 'https://api.jotform.com',

    /* Cuántas submissions traer por solicitud (máx. Jotform: 1000) */
    LIMIT: 1000,

    /* Tiempo de vida del caché en milisegundos (15 minutos) */
    CACHE_TTL: 15 * 60 * 1000,

    /* Claves de caché en localStorage */
    CACHE_KEY_RECURRENTES: 'cache_recurrentes',
    CACHE_KEY_NUEVOS:      'cache_nuevos',
    CACHE_KEY_ULTIMA_SYNC: 'ultima_sincronizacion',
  };

  /* ----------------------------------------------------------
     MAPEO DE CAMPOS
     Jotform devuelve answers con claves numéricas (q1, q2…).
     Normalizamos por el texto del label del campo.
     ---------------------------------------------------------- */
  const LABELS = {
    RECURRENTES: {
      vendedor:          ['vendedor', 'nombre del vendedor', 'nombre del vendedor(a)'],
      establecimiento:   ['nombre del establecimiento', 'establecimiento', 'cliente'],
      productos:         ['productos pedidos', 'productos', 'pedido'],
      fecha:             ['fecha del pedido', 'fecha'],
      contacto_compras:  ['persona contacto compras', 'contacto compras'],
      telefono_compras:  ['número de teléfono compras', 'telefono compras', 'teléfono compras'],
    },
    NUEVOS: {
      vendedor:          ['vendedor', 'nombre del vendedor', 'nombre del vendedor(a)'],
      establecimiento:   ['nombre del establecimiento', 'establecimiento', 'cliente'],
      rif:               ['rif de la empresa', 'rif', 'rif empresa'],
      productos:         ['productos pedidos', 'productos', 'pedido'],
      fecha:             ['fecha del pedido', 'fecha'],
      contacto_compras:  ['persona contacto compras', 'contacto compras'],
      telefono_compras:  ['número de teléfono compras', 'telefono compras', 'teléfono compras'],
      contacto_pagos:    ['persona contacto pagos', 'contacto pagos'],
      telefono_pagos:    ['número de teléfono pagos', 'telefono pagos', 'teléfono pagos'],
    },
  };


  /* ==========================================================
     1. CARGA DE API KEY
     ========================================================== */
  async function cargarApiKey() {
    /* 1️⃣ Ya cargada en memoria */
    if (CONFIG.API_KEY) return CONFIG.API_KEY;

    /* 2️⃣ Desde localStorage (el usuario la guardó antes) */
    const stored = SCCR.Store?.get('jotform_api_key');
    if (stored) { CONFIG.API_KEY = stored; return stored; }

    /* 3️⃣ Desde data/config.json */
    try {
      const res = await fetch('data/config.json');
      if (res.ok) {
        const cfg = await res.json();
        if (cfg.jotform_api_key) {
          CONFIG.API_KEY = cfg.jotform_api_key;
          return cfg.jotform_api_key;
        }
      }
    } catch (_) { /* archivo no existe aún */ }

    return null;
  }


  /* ==========================================================
     2. LLAMADA A LA API DE JOTFORM
     ========================================================== */

  /**
   * Trae todas las submissions de un formulario.
   * Maneja paginación automáticamente.
   *
   * @param {string} formId
   * @param {string} apiKey
   * @param {string} [desde] — fecha ISO para traer sólo nuevas (opcional)
   * @returns {Promise<Array>} Array de submissions crudas
   */
  async function fetchSubmissions(formId, apiKey, desde = null) {
    const todas = [];
    let offset  = 0;
    let hayMas  = true;

    while (hayMas) {
      const params = new URLSearchParams({
        apiKey,
        limit:     CONFIG.LIMIT,
        offset,
        orderby:   'created_at',
        direction: 'ASC',
      });

      if (desde) {
        params.set('filter', JSON.stringify({ created_at: { gt: desde } }));
      }

      const url = `${CONFIG.API_BASE}/form/${formId}/submissions?${params}`;

      SCCR.Log?.debug('Importador', `GET ${url}`);

      const res = await fetch(url);

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Jotform API ${res.status}: ${err}`);
      }

      const json = await res.json();

      if (json.responseCode !== 200) {
        throw new Error(`Jotform error ${json.responseCode}: ${json.message}`);
      }

      const submissions = json.content || [];
      todas.push(...submissions);

      /* ¿Hay más páginas? */
      hayMas = submissions.length === CONFIG.LIMIT;
      offset += submissions.length;
    }

    SCCR.Log?.info('Importador', `Formulario ${formId}: ${todas.length} submissions`);
    return todas;
  }


  /* ==========================================================
     3. EXTRACCIÓN DE CAMPOS
     ========================================================== */

  /**
   * Busca el valor de un campo en las answers de Jotform
   * comparando el label (texto) contra variantes conocidas.
   *
   * @param {Object} answers — objeto answers de una submission
   * @param {string[]} variantes — posibles textos del label
   * @returns {string}
   */
  function extraer(answers, variantes) {
    for (const key of Object.keys(answers)) {
      const answer = answers[key];
      const label  = SCCR.Texto?.normalizar(answer.text || answer.name || '')
                  || '';

      const coincide = variantes.some(v =>
        label.includes(SCCR.Texto?.normalizar(v) || v.toLowerCase())
      );

      if (coincide) {
        /* Jotform puede devolver el valor en diferentes propiedades */
        return limpiarValor(
          answer.answer
          ?? answer.prettyFormat
          ?? answer.value
          ?? ''
        );
      }
    }
    return '';
  }

  /**
   * Limpia un valor de Jotform:
   * — objetos → string concatenado
   * — arrays  → string unido por comas
   */
  function limpiarValor(val) {
    if (val === null || val === undefined) return '';
    if (typeof val === 'string') return val.trim();
    if (Array.isArray(val)) return val.filter(Boolean).join(', ').trim();
    if (typeof val === 'object') {
      /* Algunos campos compuestos (ej. dirección) vienen como objeto */
      return Object.values(val).filter(Boolean).join(' ').trim();
    }
    return String(val).trim();
  }


  /* ==========================================================
     4. PARSER DE "PRODUCTOS PEDIDOS"
     ========================================================== */

  /**
   * Convierte el texto libre del campo "Productos pedidos"
   * en un array de objetos estructurados.
   *
   * El campo puede venir en varios formatos según cómo
   * el vendedor lo escriba. Manejamos los más comunes:
   *
   * Formato A (tabla Jotform):
   *   "Producto | Cantidad | Precio"
   *
   * Formato B (líneas libres):
   *   "Casabe Natural x5 - $10\nCasabe Integral x3 - $6"
   *
   * Formato C (lista simple):
   *   "5 Casabe Natural $10, 3 Casabe Integral $6"
   *
   * @param {string} texto
   * @returns {Array<{producto, cantidad, precio, subtotal}>}
   */
  function parsearProductos(texto) {
    if (!texto || typeof texto !== 'string') return [];

    const lineas = texto
      .split(/[\n\r,;|]+/)
      .map(l => l.trim())
      .filter(Boolean);

    const items = [];

    for (const linea of lineas) {
      /* Ignorar encabezados de tabla */
      if (/^(producto|item|descripci[oó]n|cantidad|precio|total)/i.test(linea)) {
        continue;
      }

      const item = parsearLinea(linea);
      if (item) items.push(item);
    }

    return items;
  }

  /**
   * Parsea una línea individual de producto.
   * Retorna null si no puede extraer información útil.
   */
  function parsearLinea(linea) {
    /* Eliminar caracteres innecesarios */
    const l = linea.replace(/[\t]+/g, ' ').trim();
    if (!l || l.length < 2) return null;

    let producto  = '';
    let cantidad  = 1;
    let precio    = 0;

    /* --- Intentar extraer precio --- */
    /* Patrones: $10.50 | 10.50$ | USD 10.50 | Bs 10.50 | 10,50 */
    const regexPrecio = /(?:USD?|Bs\.?|\$)?\s*([\d]+(?:[.,]\d{1,2})?)\s*(?:USD?|Bs\.?|\$)?/gi;
    const precios = [];
    let match;
    while ((match = regexPrecio.exec(l)) !== null) {
      const val = parseFloat(match[1].replace(',', '.'));
      if (!isNaN(val) && val > 0) precios.push({ val, index: match.index });
    }

    /* --- Intentar extraer cantidad --- */
    /* Patrones: "x5" | "5x" | "5 unid" | "5 cajas" | número inicial */
    const regexCant = /(?:^|[\s\-x×*])(\d+)\s*(?:x|und?s?|unid|caja|kg|gr|lt?s?)?(?:\s|$)/gi;
    const cantidades = [];
    while ((match = regexCant.exec(l)) !== null) {
      const val = parseInt(match[1], 10);
      if (!isNaN(val) && val > 0 && val < 10000) {
        cantidades.push({ val, index: match.index });
      }
    }

    /* --- Asignar valores --- */
    if (precios.length > 0) {
      /* El último número con símbolo de moneda es el precio */
      precio = precios[precios.length - 1].val;
    }

    if (cantidades.length > 0) {
      cantidad = cantidades[0].val;
    }

    /* --- Extraer nombre del producto --- */
    /* Remover números, precios y palabras clave para quedarnos con el nombre */
    producto = l
      .replace(/(?:USD?|Bs\.?|\$)\s*[\d,\.]+/gi, '')  /* precios con símbolo */
      .replace(/[\d,\.]+\s*(?:USD?|Bs\.?|\$)/gi, '')  /* precios con símbolo al final */
      .replace(/\b\d+\s*(?:x|und?s?|unid|cajas?|kg|gr|lts?)\b/gi, '')  /* cantidades */
      .replace(/^[\d\s\-x×*\.]+/, '')  /* números al inicio */
      .replace(/[\-\|]/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    /* Si no pudimos extraer un nombre útil, usar la línea completa */
    if (!producto || producto.length < 2) {
      producto = l.replace(/[\d\$\.\,]/g, '').trim() || l;
    }

    /* Capitalizar */
    producto = SCCR.Texto?.titular(producto) || producto;

    return {
      producto,
      cantidad,
      precio,
      subtotal: SCCR.Numero?.redondear(cantidad * precio, 2) || cantidad * precio,
    };
  }


  /* ==========================================================
     5. NORMALIZACIÓN DE SUBMISSIONS
     ========================================================== */

  /**
   * Convierte una submission cruda de CARGA DE PEDIDOS
   * al schema unificado del sistema.
   */
  function normalizarRecurrente(sub) {
    const a = sub.answers || {};

    const productosTexto = extraer(a, LABELS.RECURRENTES.productos);
    const productos      = parsearProductos(productosTexto);
    const total          = productos.reduce((s, p) => s + p.subtotal, 0);

    return {
      /* Identificadores */
      id:              sub.id,
      tipo:            'recurrente',
      formulario:      CONFIG.FORM_RECURRENTES,

      /* Datos del pedido */
      fecha:           normalizarFecha(extraer(a, LABELS.RECURRENTES.fecha)) || sub.created_at?.split(' ')[0],
      fecha_registro:  sub.created_at || '',

      /* Partes */
      vendedor:        SCCR.Texto?.titular(extraer(a, LABELS.RECURRENTES.vendedor)) || 'Sin asignar',
      establecimiento: SCCR.Texto?.titular(extraer(a, LABELS.RECURRENTES.establecimiento)) || 'Sin nombre',

      /* Contacto */
      contacto_compras:  extraer(a, LABELS.RECURRENTES.contacto_compras),
      telefono_compras:  extraer(a, LABELS.RECURRENTES.telefono_compras),

      /* Es NC: no */
      es_nuevo_cliente:  false,
      rif:               '',
      contacto_pagos:    '',
      telefono_pagos:    '',

      /* Productos */
      productos_texto: productosTexto,
      productos,
      total:           SCCR.Numero?.redondear(total, 2) || total,
      cantidad_items:  productos.reduce((s, p) => s + p.cantidad, 0),

      /* Estado inicial */
      estado:  'pendiente',
    };
  }

  /**
   * Convierte una submission cruda de CARGA DE PEDIDOS NC
   * al schema unificado del sistema.
   */
  function normalizarNuevo(sub) {
    const a = sub.answers || {};

    const productosTexto = extraer(a, LABELS.NUEVOS.productos);
    const productos      = parsearProductos(productosTexto);
    const total          = productos.reduce((s, p) => s + p.subtotal, 0);

    /* El RIF puede venir como texto o como URL de imagen */
    const rifRaw = extraer(a, LABELS.NUEVOS.rif);
    const rifUrl = rifRaw.startsWith('http') ? rifRaw : '';
    const rifTexto = rifRaw.startsWith('http') ? '' : rifRaw;

    return {
      /* Identificadores */
      id:              sub.id,
      tipo:            'nuevo',
      formulario:      CONFIG.FORM_NUEVOS,

      /* Datos del pedido */
      fecha:           normalizarFecha(extraer(a, LABELS.NUEVOS.fecha)) || sub.created_at?.split(' ')[0],
      fecha_registro:  sub.created_at || '',

      /* Partes */
      vendedor:        SCCR.Texto?.titular(extraer(a, LABELS.NUEVOS.vendedor)) || 'Sin asignar',
      establecimiento: SCCR.Texto?.titular(extraer(a, LABELS.NUEVOS.establecimiento)) || 'Sin nombre',

      /* Contacto Compras */
      contacto_compras: extraer(a, LABELS.NUEVOS.contacto_compras),
      telefono_compras: extraer(a, LABELS.NUEVOS.telefono_compras),

      /* Datos exclusivos NC */
      es_nuevo_cliente: true,
      rif:              rifTexto,
      rif_imagen_url:   rifUrl,
      contacto_pagos:   extraer(a, LABELS.NUEVOS.contacto_pagos),
      telefono_pagos:   extraer(a, LABELS.NUEVOS.telefono_pagos),

      /* Productos */
      productos_texto: productosTexto,
      productos,
      total:           SCCR.Numero?.redondear(total, 2) || total,
      cantidad_items:  productos.reduce((s, p) => s + p.cantidad, 0),

      /* Estado inicial */
      estado: 'pendiente',
    };
  }

  /**
   * Convierte fechas de Jotform a formato ISO yyyy-mm-dd.
   * Jotform puede enviar: "2025-07-15", "07/15/2025", "15/07/2025"
   */
  function normalizarFecha(str) {
    if (!str) return '';
    /* Ya está en formato ISO */
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    /* mm/dd/yyyy (formato US de Jotform) */
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
      const [m, d, y] = str.split('/');
      return `${y}-${m}-${d}`;
    }
    /* dd/mm/yyyy */
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
      const [d, m, y] = str.split('/');
      return `${y}-${m}-${d}`;
    }
    /* Intentar con Date nativo */
    const d = new Date(str);
    if (!isNaN(d)) return d.toISOString().split('T')[0];
    return str;
  }


  /* ==========================================================
     6. DEDUPLICACIÓN Y MERGE
     ========================================================== */

  /**
   * Combina pedidos recurrentes y nuevos clientes en un solo
   * array ordenado por fecha descendente, sin duplicados por ID.
   */
  function unificar(recurrentes, nuevos) {
    const mapa = new Map();

    for (const p of [...recurrentes, ...nuevos]) {
      if (!mapa.has(p.id)) {
        mapa.set(p.id, p);
      }
    }

    return Array.from(mapa.values()).sort((a, b) => {
      const da = new Date(a.fecha_registro || a.fecha || 0);
      const db = new Date(b.fecha_registro || b.fecha || 0);
      return db - da;  /* más reciente primero */
    });
  }


  /* ==========================================================
     7. PERSISTENCIA EN LOCALSTORAGE
     ========================================================== */

  function guardarEnCache(pedidos) {
    SCCR.Store?.set(CONFIG.CACHE_KEY_RECURRENTES,
      pedidos.filter(p => p.tipo === 'recurrente'));
    SCCR.Store?.set(CONFIG.CACHE_KEY_NUEVOS,
      pedidos.filter(p => p.tipo === 'nuevo'));
    SCCR.Store?.set(CONFIG.CACHE_KEY_ULTIMA_SYNC, new Date().toISOString());
  }

  function cargarDesdeCache() {
    const recurrentes = SCCR.Store?.get(CONFIG.CACHE_KEY_RECURRENTES, []) || [];
    const nuevos      = SCCR.Store?.get(CONFIG.CACHE_KEY_NUEVOS, []) || [];
    return unificar(recurrentes, nuevos);
  }

  function ultimaSincronizacion() {
    return SCCR.Store?.get(CONFIG.CACHE_KEY_ULTIMA_SYNC, null);
  }

  function cacheTieneVigencia() {
    const ultima = ultimaSincronizacion();
    if (!ultima) return false;
    return (Date.now() - new Date(ultima).getTime()) < CONFIG.CACHE_TTL;
  }


  /* ==========================================================
     8. ACTUALIZACIÓN DE UI DURANTE LA IMPORTACIÓN
     ========================================================== */

  function uiIniciando() {
    SCCR.setSyncStatus?.('syncing');
    const dot = document.getElementById('sync-dot');
    const lbl = document.getElementById('sync-label');
    if (lbl) lbl.textContent = 'Sincronizando…';
    if (dot) dot.classList.add('sync-indicator__dot--syncing');
    SCCR.Log?.info('Importador', 'Inicio de importación');
  }

  function uiExito(total) {
    SCCR.setSyncStatus?.('ok');
    const lbl = document.getElementById('sync-label');
    if (lbl) {
      const hora = new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
      lbl.textContent = `Sync ${hora}`;
    }
    SCCR.toast?.(`${total} pedido${total !== 1 ? 's' : ''} importado${total !== 1 ? 's' : ''}`, 'success');
    SCCR.Log?.info('Importador', `Importación exitosa: ${total} pedidos`);
  }

  function uiError(err) {
    SCCR.setSyncStatus?.('error');
    SCCR.toast?.(`Error al importar: ${err.message || err}`, 'error', 6000);
    SCCR.Log?.error('Importador', err);
  }


  /* ==========================================================
     9. MODO DEMO (sin API key)
     ========================================================== */

  /**
   * Genera datos de demostración cuando no hay API key.
   * Permite visualizar el sistema completo sin conexión.
   */
  function generarDemoData() {
    SCCR.Log?.info('Importador', 'Modo demo activado');

    const vendedores = ['Carlos Méndez', 'María Rodríguez', 'José Pérez', 'Ana González', 'Luis Martínez'];
    const establecimientos = [
      'Supermercado El Éxito', 'Bodegón La Esquina', 'Panadería San José',
      'Restaurante El Fogón', 'Tienda La Central', 'Mini Market Bolívar',
      'Distribuidora Norte', 'Abasto El Palmar', 'Cafetería El Centro',
      'Supermercado Bicentenario',
    ];
    const productosDemo = [
      { producto: 'Casabe Natural', precio: 8.50 },
      { producto: 'Casabe Integral', precio: 9.00 },
      { producto: 'Casabe con Ajonjolí', precio: 9.50 },
      { producto: 'Casabe Grande', precio: 12.00 },
      { producto: 'Casabe Pequeño', precio: 6.00 },
      { producto: 'Pack Surtido x6', precio: 45.00 },
    ];

    const pedidos = [];
    const hoy = new Date();

    /* Generar 60 pedidos en los últimos 30 días */
    for (let i = 0; i < 60; i++) {
      const diasAtras = Math.floor(Math.random() * 30);
      const fecha = new Date(hoy);
      fecha.setDate(hoy.getDate() - diasAtras);

      const vendedor    = vendedores[Math.floor(Math.random() * vendedores.length)];
      const estab       = establecimientos[Math.floor(Math.random() * establecimientos.length)];
      const esNuevo     = Math.random() < 0.2; /* 20% nuevos clientes */

      /* Generar entre 1 y 4 productos */
      const numProds    = Math.floor(Math.random() * 4) + 1;
      const productos   = [];
      const usados      = new Set();

      for (let j = 0; j < numProds; j++) {
        let idx;
        do { idx = Math.floor(Math.random() * productosDemo.length); }
        while (usados.has(idx));
        usados.add(idx);

        const prod     = productosDemo[idx];
        const cantidad = Math.floor(Math.random() * 10) + 1;
        productos.push({
          producto: prod.producto,
          cantidad,
          precio:   prod.precio,
          subtotal: SCCR.Numero?.redondear(cantidad * prod.precio, 2) || cantidad * prod.precio,
        });
      }

      const total = productos.reduce((s, p) => s + p.subtotal, 0);

      pedidos.push({
        id:               `demo_${i + 1}`,
        tipo:             esNuevo ? 'nuevo' : 'recurrente',
        formulario:       esNuevo ? CONFIG.FORM_NUEVOS : CONFIG.FORM_RECURRENTES,
        fecha:            fecha.toISOString().split('T')[0],
        fecha_registro:   fecha.toISOString(),
        vendedor,
        establecimiento:  estab,
        contacto_compras: `Compras ${estab.split(' ')[0]}`,
        telefono_compras: `04${Math.floor(Math.random() * 3) === 0 ? '12' : Math.floor(Math.random() * 3) === 1 ? '14' : '16'}-${Math.floor(Math.random() * 9000000 + 1000000)}`,
        es_nuevo_cliente: esNuevo,
        rif:              esNuevo ? `J-${Math.floor(Math.random() * 90000000 + 10000000)}-0` : '',
        rif_imagen_url:   '',
        contacto_pagos:   esNuevo ? `Pagos ${estab.split(' ')[0]}` : '',
        telefono_pagos:   esNuevo ? `04${Math.floor(Math.random() * 3) === 0 ? '12' : '14'}-${Math.floor(Math.random() * 9000000 + 1000000)}` : '',
        productos_texto:  productos.map(p => `${p.producto} x${p.cantidad} $${p.precio}`).join('\n'),
        productos,
        total:            SCCR.Numero?.redondear(total, 2) || total,
        cantidad_items:   productos.reduce((s, p) => s + p.cantidad, 0),
        estado:           'confirmado',
      });
    }

    return pedidos.sort((a, b) => new Date(b.fecha_registro) - new Date(a.fecha_registro));
  }


  /* ==========================================================
     10. FUNCIÓN PRINCIPAL DE IMPORTACIÓN
     ========================================================== */

  /**
   * Importa submissions de ambos formularios Jotform,
   * las normaliza y las persiste.
   *
   * @param {Object} opciones
   * @param {boolean} opciones.forzar — ignorar caché y traer todo de nuevo
   * @param {boolean} opciones.soloNuevas — traer sólo desde la última sync
   * @returns {Promise<Array>} Array de pedidos normalizados
   */
  async function importar({ forzar = false, soloNuevas = false } = {}) {

    uiIniciando();

    try {
      /* ── Caché válido y no forzado ─────────────────────────── */
      if (!forzar && cacheTieneVigencia()) {
        const cache = cargarDesdeCache();
        SCCR.Log?.info('Importador', `Usando caché: ${cache.length} pedidos`);
        SCCR.setSyncStatus?.('ok');
        emitirEvento(cache);
        return cache;
      }

      /* ── Cargar API key ────────────────────────────────────── */
      const apiKey = await cargarApiKey();

      if (!apiKey) {
        /* Sin API key → modo demo */
        SCCR.Log?.warn('Importador', 'Sin API key — activando modo demo');
        const demo = generarDemoData();
        guardarEnCache(demo);
        uiExito(demo.length);
        emitirEvento(demo, true);
        return demo;
      }

      /* ── Determinar fecha desde cuándo traer datos ─────────── */
      let desde = null;
      if (soloNuevas && !forzar) {
        const ultima = ultimaSincronizacion();
        if (ultima) desde = ultima;
      }

      /* ── Fetch en paralelo de ambos formularios ────────────── */
      const [rawRecurrentes, rawNuevos] = await Promise.all([
        fetchSubmissions(CONFIG.FORM_RECURRENTES, apiKey, desde),
        fetchSubmissions(CONFIG.FORM_NUEVOS,      apiKey, desde),
      ]);

      /* ── Normalizar ────────────────────────────────────────── */
      const recurrentes = rawRecurrentes.map(s => {
        try { return normalizarRecurrente(s); }
        catch (e) {
          SCCR.Log?.warn('Importador', `Error normalizando recurrente ${s.id}:`, e);
          return null;
        }
      }).filter(Boolean);

      const nuevos = rawNuevos.map(s => {
        try { return normalizarNuevo(s); }
        catch (e) {
          SCCR.Log?.warn('Importador', `Error normalizando nuevo ${s.id}:`, e);
          return null;
        }
      }).filter(Boolean);

      /* ── Si es sync incremental, mezclar con caché ─────────── */
      let pedidosFinal;
      if (soloNuevas && !forzar) {
        const cache = cargarDesdeCache();
        pedidosFinal = unificar([...cache, ...recurrentes, ...nuevos]);
      } else {
        pedidosFinal = unificar(recurrentes, nuevos);
      }

      /* ── Persistir ─────────────────────────────────────────── */
      guardarEnCache(pedidosFinal);

      /* ── UI y evento ───────────────────────────────────────── */
      uiExito(pedidosFinal.length);
      emitirEvento(pedidosFinal);

      return pedidosFinal;

    } catch (err) {
      uiError(err);

      /* Intentar usar caché aunque sea expirado */
      const cache = cargarDesdeCache();
      if (cache.length > 0) {
        SCCR.Log?.warn('Importador', 'Error en API, usando caché expirado');
        emitirEvento(cache);
        return cache;
      }

      /* Último recurso: modo demo */
      SCCR.Log?.warn('Importador', 'Usando datos de demo por error en API');
      const demo = generarDemoData();
      emitirEvento(demo, true);
      return demo;
    }
  }


  /* ==========================================================
     11. EVENTO PERSONALIZADO
     ========================================================== */

  /**
   * Emite el evento 'sccr:datos-importados' que escucha
   * el Motor de Datos para procesar los indicadores.
   */
  function emitirEvento(pedidos, esDemo = false) {
    document.dispatchEvent(new CustomEvent('sccr:datos-importados', {
      detail: {
        pedidos,
        esDemo,
        total:       pedidos.length,
        recurrentes: pedidos.filter(p => p.tipo === 'recurrente').length,
        nuevos:      pedidos.filter(p => p.tipo === 'nuevo').length,
        timestamp:   new Date().toISOString(),
      }
    }));
  }


  /* ==========================================================
     12. UTILIDADES PÚBLICAS
     ========================================================== */

  /** Guarda la API key de Jotform en localStorage */
  function guardarApiKey(key) {
    CONFIG.API_KEY = key;
    SCCR.Store?.set('jotform_api_key', key);
    SCCR.Log?.info('Importador', 'API key guardada');
  }

  /** Limpia el caché forzando re-importación en la próxima llamada */
  function limpiarCache() {
    SCCR.Store?.remove(CONFIG.CACHE_KEY_RECURRENTES);
    SCCR.Store?.remove(CONFIG.CACHE_KEY_NUEVOS);
    SCCR.Store?.remove(CONFIG.CACHE_KEY_ULTIMA_SYNC);
    SCCR.Log?.info('Importador', 'Caché limpiado');
  }

  /** Retorna los pedidos actuales desde el caché sin hacer fetch */
  function pedidosActuales() {
    return cargarDesdeCache();
  }

  /** Información de estado del importador */
  function estado() {
    return {
      ultima_sync:      ultimaSincronizacion(),
      cache_vigente:    cacheTieneVigencia(),
      tiene_api_key:    !!CONFIG.API_KEY,
      total_en_cache:   cargarDesdeCache().length,
      form_recurrentes: CONFIG.FORM_RECURRENTES,
      form_nuevos:      CONFIG.FORM_NUEVOS,
    };
  }


  /* ==========================================================
     API PÚBLICA
     ========================================================== */
  return {
    importar,
    guardarApiKey,
    limpiarCache,
    pedidosActuales,
    estado,
    /* Exponer parsers para testing */
    _parsearProductos: parsearProductos,
    _parsearLinea:     parsearLinea,
    _normalizarFecha:  normalizarFecha,
  };

})();


/* ------------------------------------------------------------
   Registrar en el namespace global y exponer función principal
   ------------------------------------------------------------ */
window.SCCR.Importador = Importador;
window.SCCR.importar   = (opts) => Importador.importar(opts);


/* ------------------------------------------------------------
   Auto-importar al cargar la página
   (con caché si está vigente, sin bloquear el render)
   ------------------------------------------------------------ */
document.addEventListener('DOMContentLoaded', () => {
  /* Pequeño delay para que el DOM esté completamente listo */
  setTimeout(() => {
    SCCR.importar({ forzar: false }).catch(err => {
      SCCR.Log?.error('Importador', 'Auto-importación falló:', err);
    });
  }, 500);
});
