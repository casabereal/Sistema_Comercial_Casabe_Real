/* ============================================================
   SISTEMA COMERCIAL CASABE REAL
   js/utils.js — Utilidades globales del sistema
   v1.0.0

   Este archivo se carga PRIMERO antes que cualquier módulo.
   No depende de ningún otro archivo del sistema.
   ============================================================ */

'use strict';

/* ------------------------------------------------------------
   NAMESPACE GLOBAL
   ------------------------------------------------------------ */
window.SCCR = window.SCCR || {};

const Utils = (() => {

  /* ==========================================================
     1. FORMATO DE NÚMEROS Y MONEDA
     ========================================================== */

  /**
   * Formatea un número como moneda venezolana (USD por defecto).
   * Ej: 125450.5 → "$125.450,50"
   */
  function formatCurrency(value, decimals = 2, symbol = '$') {
    if (value === null || value === undefined || isNaN(value)) return `${symbol}0,00`;
    const num = parseFloat(value);
    const parts = num.toFixed(decimals).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${symbol}${parts[0]},${parts[1] ?? '00'}`;
  }

  /**
   * Formatea un número grande con sufijos (K, M).
   * Ej: 1250000 → "1,25M" | 48500 → "48,5K"
   */
  function formatShort(value) {
    if (value === null || value === undefined || isNaN(value)) return '0';
    const num = parseFloat(value);
    if (Math.abs(num) >= 1_000_000) return (num / 1_000_000).toFixed(2).replace('.', ',') + 'M';
    if (Math.abs(num) >= 1_000)     return (num / 1_000).toFixed(1).replace('.', ',') + 'K';
    return num.toLocaleString('es-VE');
  }

  /**
   * Formatea un número entero con separadores de miles.
   * Ej: 1250 → "1.250"
   */
  function formatNumber(value) {
    if (value === null || value === undefined || isNaN(value)) return '0';
    return parseInt(value).toLocaleString('es-VE');
  }

  /**
   * Formatea un porcentaje.
   * Ej: 0.6842 → "68,4%" | 104 → "104,0%"
   */
  function formatPercent(value, decimals = 1) {
    if (value === null || value === undefined || isNaN(value)) return '0,0%';
    const num = parseFloat(value);
    // Si viene como fracción (0-1) lo convierte a porcentaje
    const pct = num <= 1 && num >= 0 && !Number.isInteger(num) ? num * 100 : num;
    return pct.toFixed(decimals).replace('.', ',') + '%';
  }

  /**
   * Parsea un string de moneda a número.
   * Ej: "$1.250,50" → 1250.50
   */
  function parseCurrency(str) {
    if (typeof str === 'number') return str;
    if (!str) return 0;
    return parseFloat(
      String(str)
        .replace(/[^0-9,.-]/g, '')
        .replace(/\./g, '')
        .replace(',', '.')
    ) || 0;
  }

  /**
   * Parsea un número que puede venir con puntos o comas.
   * Ej: "1.250,50" → 1250.5 | "1,250.50" → 1250.5
   */
  function parseNumber(str) {
    if (typeof str === 'number') return str;
    if (!str) return 0;
    const s = String(str).trim();
    // Detectar si el punto es separador de miles o decimal
    const hasDotComma  = /\.\d{3},/.test(s);  // 1.250,50 → estilo venezolano
    const hasCommaDot  = /,\d{3}\./.test(s);  // 1,250.50 → estilo anglosajón
    if (hasDotComma)  return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
    if (hasCommaDot)  return parseFloat(s.replace(/,/g, '')) || 0;
    // Fallback: reemplazar coma decimal
    return parseFloat(s.replace(',', '.')) || 0;
  }


  /* ==========================================================
     2. FECHAS
     ========================================================== */

  /**
   * Formatea una fecha para mostrar al usuario.
   * Ej: "2025-07-15" → "15/07/2025"
   */
  function formatDate(dateInput, options = {}) {
    if (!dateInput) return '—';
    try {
      const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
      if (isNaN(date.getTime())) return '—';
      const defaults = { day: '2-digit', month: '2-digit', year: 'numeric' };
      return date.toLocaleDateString('es-VE', { ...defaults, ...options });
    } catch {
      return '—';
    }
  }

  /**
   * Formatea fecha en formato largo.
   * Ej: "15 de julio de 2025"
   */
  function formatDateLong(dateInput) {
    return formatDate(dateInput, { day: 'numeric', month: 'long', year: 'numeric' });
  }

  /**
   * Formatea fecha corta.
   * Ej: "15 jul."
   */
  function formatDateShort(dateInput) {
    return formatDate(dateInput, { day: 'numeric', month: 'short' });
  }

  /**
   * Devuelve la diferencia en días entre dos fechas.
   * Un resultado positivo = la segunda fecha es más reciente.
   */
  function diffDays(dateA, dateB = new Date()) {
    try {
      const a = dateA instanceof Date ? dateA : new Date(dateA);
      const b = dateB instanceof Date ? dateB : new Date(dateB);
      return Math.round((b - a) / (1000 * 60 * 60 * 24));
    } catch {
      return 0;
    }
  }

  /**
   * Devuelve la fecha de hoy como string ISO (YYYY-MM-DD).
   */
  function todayISO() {
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Devuelve el primer día del mes actual como string ISO.
   */
  function firstDayOfMonth(date = new Date()) {
    return new Date(date.getFullYear(), date.getMonth(), 1)
      .toISOString().split('T')[0];
  }

  /**
   * Devuelve el último día del mes actual como string ISO.
   */
  function lastDayOfMonth(date = new Date()) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0)
      .toISOString().split('T')[0];
  }

  /**
   * Devuelve el primer día de la semana actual (lunes).
   */
  function firstDayOfWeek(date = new Date()) {
    const d = new Date(date);
    const day = d.getDay(); // 0=dom, 1=lun…
    const diff = (day === 0 ? -6 : 1 - day);
    d.setDate(d.getDate() + diff);
    return d.toISOString().split('T')[0];
  }

  /**
   * Verifica si una fecha cae dentro de un rango.
   */
  function inRange(dateInput, from, to) {
    const d   = new Date(dateInput);
    const ini = new Date(from);
    const fin = new Date(to);
    fin.setHours(23, 59, 59, 999); // incluir todo el día final
    return d >= ini && d <= fin;
  }

  /**
   * Etiqueta amigable de tiempo relativo.
   * Ej: "hace 2 días" | "hace 1 hora"
   */
  function timeAgo(dateInput) {
    if (!dateInput) return '—';
    try {
      const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
      const diff = Math.floor((Date.now() - date.getTime()) / 1000);
      if (diff < 60)       return 'hace un momento';
      if (diff < 3600)     return `hace ${Math.floor(diff / 60)} min`;
      if (diff < 86400)    return `hace ${Math.floor(diff / 3600)} h`;
      if (diff < 2592000)  return `hace ${Math.floor(diff / 86400)} días`;
      if (diff < 31536000) return `hace ${Math.floor(diff / 2592000)} meses`;
      return `hace ${Math.floor(diff / 31536000)} años`;
    } catch {
      return '—';
    }
  }

  /**
   * Devuelve los últimos N meses como array de etiquetas.
   * Ej: getLastMonths(3) → ["May", "Jun", "Jul"]
   */
  function getLastMonths(n = 6) {
    const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const result = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      result.push(`${months[d.getMonth()]} ${d.getFullYear()}`);
    }
    return result;
  }


  /* ==========================================================
     3. STRINGS
     ========================================================== */

  /**
   * Normaliza un string para comparación: sin tildes, minúsculas, sin espacios extra.
   * Ej: "Café con Leche" → "cafe con leche"
   */
  function normalize(str) {
    if (!str) return '';
    return String(str)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  /**
   * Verifica si un string contiene otro (sin importar tildes ni mayúsculas).
   */
  function includes(haystack, needle) {
    return normalize(haystack).includes(normalize(needle));
  }

  /**
   * Capitaliza la primera letra de cada palabra.
   * Ej: "JUAN PÉREZ" → "Juan Pérez"
   */
  function titleCase(str) {
    if (!str) return '';
    return String(str)
      .toLowerCase()
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  /**
   * Genera las iniciales de un nombre (máx 2 letras).
   * Ej: "Carlos Cova" → "CC" | "Migas Artesanales" → "MA"
   */
  function initials(name) {
    if (!name) return '?';
    const words = String(name).trim().split(/\s+/);
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }

  /**
   * Trunca un string con elipsis.
   * Ej: truncate("Distribuidora Central del Norte", 20) → "Distribuidora Centr…"
   */
  function truncate(str, maxLen = 30) {
    if (!str) return '';
    const s = String(str);
    return s.length > maxLen ? s.slice(0, maxLen - 1) + '…' : s;
  }

  /**
   * Limpia y estandariza un número de teléfono venezolano.
   * Ej: "0414-123.45.67" → "0414-1234567"
   */
  function formatPhone(phone) {
    if (!phone) return '—';
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length === 11) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
    if (digits.length === 10) return `0${digits.slice(0, 3)}-${digits.slice(3)}`;
    return phone;
  }

  /**
   * Limpia un RIF venezolano.
   * Ej: "J-12345678-9" → "J-12345678-9" (normalizado)
   */
  function formatRIF(rif) {
    if (!rif) return '—';
    return String(rif).toUpperCase().trim();
  }


  /* ==========================================================
     4. ARRAYS Y OBJETOS
     ========================================================== */

  /**
   * Agrupa un array de objetos por una clave.
   * Ej: groupBy(ventas, 'vendedor') → { "Carlos": [...], "Ana": [...] }
   */
  function groupBy(array, key) {
    if (!Array.isArray(array)) return {};
    return array.reduce((acc, item) => {
      const group = item[key] ?? 'Sin definir';
      if (!acc[group]) acc[group] = [];
      acc[group].push(item);
      return acc;
    }, {});
  }

  /**
   * Suma los valores de una clave en un array.
   * Ej: sumBy(ventas, 'monto') → 125450.50
   */
  function sumBy(array, key) {
    if (!Array.isArray(array)) return 0;
    return array.reduce((acc, item) => acc + (parseNumber(item[key]) || 0), 0);
  }

  /**
   * Ordena un array de objetos por una clave (ascendente o descendente).
   */
  function sortBy(array, key, dir = 'desc') {
    if (!Array.isArray(array)) return [];
    return [...array].sort((a, b) => {
      const va = parseNumber(a[key]) || normalize(String(a[key] ?? ''));
      const vb = parseNumber(b[key]) || normalize(String(b[key] ?? ''));
      if (va < vb) return dir === 'asc' ? -1 : 1;
      if (va > vb) return dir === 'asc' ? 1 : -1;
      return 0;
    });
  }

  /**
   * Filtra un array de objetos que coincidan con un query en múltiples campos.
   * Ej: search(clientes, 'migas', ['nombre','vendedor'])
   */
  function search(array, query, fields) {
    if (!query || !query.trim()) return array;
    const q = normalize(query);
    return array.filter(item =>
      fields.some(field => includes(String(item[field] ?? ''), q))
    );
  }

  /**
   * Elimina duplicados de un array de objetos por una clave.
   */
  function uniqueBy(array, key) {
    if (!Array.isArray(array)) return [];
    const seen = new Set();
    return array.filter(item => {
      const k = item[key];
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  /**
   * Toma los primeros N elementos de un array.
   */
  function top(array, n = 5) {
    return Array.isArray(array) ? array.slice(0, n) : [];
  }

  /**
   * Calcula la variación porcentual entre dos valores.
   * Ej: variation(120, 100) → 20 (%)
   */
  function variation(current, previous) {
    if (!previous || previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / Math.abs(previous)) * 100;
  }


  /* ==========================================================
     5. DOM
     ========================================================== */

  /**
   * Selector seguro con fallback null.
   */
  function $(selector, parent = document) {
    return parent.querySelector(selector);
  }

  function $$(selector, parent = document) {
    return Array.from(parent.querySelectorAll(selector));
  }

  /**
   * Crea un elemento HTML con atributos y contenido.
   * Ej: el('div', { class: 'card', id: 'main' }, 'Hola')
   */
  function el(tag, attrs = {}, ...children) {
    const element = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'style' && typeof v === 'object') {
        Object.assign(element.style, v);
      } else if (k.startsWith('on') && typeof v === 'function') {
        element.addEventListener(k.slice(2).toLowerCase(), v);
      } else {
        element.setAttribute(k, v);
      }
    });
    children.forEach(child => {
      if (child === null || child === undefined) return;
      element.appendChild(
        typeof child === 'string' ? document.createTextNode(child) : child
      );
    });
    return element;
  }

  /**
   * Vacía el contenido de un elemento.
   */
  function empty(element) {
    if (!element) return;
    while (element.firstChild) element.removeChild(element.firstChild);
  }

  /**
   * Muestra u oculta un elemento.
   */
  function show(element) { if (element) element.style.display = ''; }
  function hide(element) { if (element) element.style.display = 'none'; }
  function toggle(element, condition) {
    if (!element) return;
    element.style.display = condition ? '' : 'none';
  }

  /**
   * Renderiza skeletons de carga en un contenedor.
   */
  function renderSkeletons(container, count = 3, type = 'text') {
    if (!container) return;
    empty(container);
    for (let i = 0; i < count; i++) {
      const sk = document.createElement('div');
      sk.className = `skeleton skeleton--${type} w-full`;
      sk.style.marginBottom = '12px';
      container.appendChild(sk);
    }
  }

  /**
   * Inyecta íconos Lucide en los elementos recién creados.
   * Se debe llamar después de inyectar HTML con íconos.
   */
  function refreshIcons(container = document) {
    if (typeof lucide !== 'undefined') {
      lucide.createIcons({ nodes: container === document ? undefined : [container] });
    }
  }


  /* ==========================================================
     6. CLASIFICACIÓN ABC DE CLIENTES
     ========================================================== */

  /**
   * Clasifica clientes por el principio de Pareto (80/20).
   * A = top 80% del volumen, B = siguiente 15%, C = restante 5%
   * Devuelve el mismo array con la propiedad `clasificacion` añadida.
   */
  function clasificarABC(clientes, campoValor = 'totalCompras') {
    if (!Array.isArray(clientes) || clientes.length === 0) return [];
    const sorted = sortBy([...clientes], campoValor, 'desc');
    const total  = sumBy(sorted, campoValor);
    let acum     = 0;

    return sorted.map(c => {
      acum += parseNumber(c[campoValor]);
      const pct = total > 0 ? (acum / total) * 100 : 100;
      const clasificacion = pct <= 80 ? 'A' : pct <= 95 ? 'B' : 'C';
      return { ...c, clasificacion };
    });
  }

  /**
   * Devuelve el color CSS de un badge ABC.
   */
  function badgeABC(clase) {
    const map = { A: 'badge-active', B: 'badge-success', C: 'badge-warning' };
    return map[clase] || 'badge-inactive';
  }


  /* ==========================================================
     7. CÁLCULOS COMERCIALES
     ========================================================== */

  /**
   * Calcula el porcentaje de cumplimiento de una meta.
   */
  function cumplimiento(real, meta) {
    if (!meta || meta === 0) return 0;
    return Math.min((real / meta) * 100, 999); // techo en 999%
  }

  /**
   * Determina el color del estado de cumplimiento.
   */
  function colorCumplimiento(pct) {
    if (pct >= 100) return 'var(--color-connected)';
    if (pct >= 75)  return 'var(--color-success)';
    if (pct >= 50)  return 'var(--color-warning)';
    return 'var(--color-danger)';
  }

  /**
   * Pronostica el cierre del mes basándose en el avance actual.
   * Usa regresión lineal simple (días transcurridos vs ventas).
   */
  function pronosticarMes(ventasAcumuladas, diaActual = new Date().getDate()) {
    const diasMes = new Date(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      0
    ).getDate();
    if (diaActual <= 0) return 0;
    return (ventasAcumuladas / diaActual) * diasMes;
  }

  /**
   * Calcula el ticket promedio.
   */
  function ticketPromedio(totalVentas, cantidadPedidos) {
    if (!cantidadPedidos || cantidadPedidos === 0) return 0;
    return totalVentas / cantidadPedidos;
  }

  /**
   * Devuelve la clase CSS del delta (↑ sube / ↓ baja).
   */
  function deltaClass(value) {
    if (value > 0)  return 'kpi-card__delta--up';
    if (value < 0)  return 'kpi-card__delta--down';
    return 'kpi-card__delta--neutral';
  }

  /**
   * Devuelve el ícono del delta.
   */
  function deltaIcon(value) {
    if (value > 0) return '↑';
    if (value < 0) return '↓';
    return '→';
  }


  /* ==========================================================
     8. LOCAL STORAGE (caché de datos)
     ========================================================== */

  const CACHE_PREFIX = 'sccr_';

  function cacheSet(key, data, ttlMinutes = 60) {
    try {
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({
        data,
        expires: Date.now() + ttlMinutes * 60 * 1000
      }));
    } catch (e) {
      console.warn('SCCR cache write error:', e);
    }
  }

  function cacheGet(key) {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;
      const { data, expires } = JSON.parse(raw);
      if (Date.now() > expires) {
        localStorage.removeItem(CACHE_PREFIX + key);
        return null;
      }
      return data;
    } catch {
      return null;
    }
  }

  function cacheClear(key) {
    if (key) {
      localStorage.removeItem(CACHE_PREFIX + key);
    } else {
      Object.keys(localStorage)
        .filter(k => k.startsWith(CACHE_PREFIX))
        .forEach(k => localStorage.removeItem(k));
    }
  }


  /* ==========================================================
     9. VALIDACIONES
     ========================================================== */

  function isValidDate(str) {
    if (!str) return false;
    const d = new Date(str);
    return !isNaN(d.getTime());
  }

  function isValidPhone(str) {
    if (!str) return false;
    return /^(0|\+58)\d{10}$/.test(String(str).replace(/[\s\-\.]/g, ''));
  }

  function isValidRIF(str) {
    if (!str) return false;
    return /^[JGECVP]-?\d{8}-?\d$/.test(String(str).toUpperCase().trim());
  }

  function isEmpty(value) {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
  }


  /* ==========================================================
     10. CHART.JS — CONFIGURACIÓN GLOBAL
     ========================================================== */

  /**
   * Opciones base compartidas por todos los gráficos del sistema.
   * Se aplica como defaults de Chart.js.
   */
  function setupChartDefaults() {
    if (typeof Chart === 'undefined') return;

    Chart.defaults.font.family     = "'Montserrat', sans-serif";
    Chart.defaults.font.size       = 12;
    Chart.defaults.color           = '#7F8C8D';
    Chart.defaults.plugins.legend.position = 'bottom';
    Chart.defaults.plugins.legend.labels.boxWidth = 10;
    Chart.defaults.plugins.legend.labels.padding  = 16;
    Chart.defaults.plugins.tooltip.backgroundColor = '#2D3436';
    Chart.defaults.plugins.tooltip.titleColor      = '#FFFFFF';
    Chart.defaults.plugins.tooltip.bodyColor       = '#B2BEC3';
    Chart.defaults.plugins.tooltip.padding         = 12;
    Chart.defaults.plugins.tooltip.cornerRadius    = 8;
    Chart.defaults.plugins.tooltip.displayColors   = true;
    Chart.defaults.plugins.tooltip.callbacks = {
      ...Chart.defaults.plugins.tooltip.callbacks,
    };
    Chart.defaults.scale.grid.color      = '#E8ECEF';
    Chart.defaults.scale.grid.drawBorder = false;
    Chart.defaults.scale.ticks.padding   = 8;
    Chart.defaults.animation.duration    = 400;
    Chart.defaults.responsive            = true;
    Chart.defaults.maintainAspectRatio   = false;
  }

  /**
   * Paleta de colores del sistema para usar en gráficos.
   */
  const CHART_COLORS = {
    primary:   '#D71920',
    dark:      '#2D3436',
    yellow:    '#F1C40F',
    orange:    '#F39C12',
    gray:      '#7F8C8D',
    lightGray: '#B2BEC3',
    green:     '#27AE60',
  };

  const CHART_PALETTE = [
    CHART_COLORS.primary,
    CHART_COLORS.dark,
    CHART_COLORS.yellow,
    CHART_COLORS.orange,
    CHART_COLORS.gray,
    CHART_COLORS.lightGray,
    CHART_COLORS.green,
  ];

  /**
   * Destruye un gráfico existente si ya fue instanciado.
   * Evita el error "Canvas already in use".
   */
  function destroyChart(chartInstance) {
    if (chartInstance && typeof chartInstance.destroy === 'function') {
      chartInstance.destroy();
    }
    return null;
  }


  /* ==========================================================
     11. DEBOUNCE / THROTTLE
     ========================================================== */

  function debounce(fn, delay = 300) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function throttle(fn, limit = 200) {
    let lastCall = 0;
    return function (...args) {
      const now = Date.now();
      if (now - lastCall >= limit) {
        lastCall = now;
        fn.apply(this, args);
      }
    };
  }


  /* ==========================================================
     12. EXPORTACIÓN (helpers para módulo de Reportes)
     ========================================================== */

  /**
   * Descarga un objeto JSON como archivo.
   */
  function downloadJSON(data, filename = 'export.json') {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    _downloadBlob(blob, filename);
  }

  /**
   * Convierte un array de objetos a CSV y lo descarga.
   */
  function downloadCSV(data, filename = 'export.csv') {
    if (!Array.isArray(data) || data.length === 0) return;
    const headers = Object.keys(data[0]);
    const rows    = data.map(row =>
      headers.map(h => {
        const v = row[h] ?? '';
        // Escapar comas y comillas
        return typeof v === 'string' && (v.includes(',') || v.includes('"'))
          ? `"${v.replace(/"/g, '""')}"`
          : v;
      }).join(',')
    );
    const csv  = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    _downloadBlob(blob, filename);
  }

  function _downloadBlob(blob, filename) {
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href     = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }


  /* ==========================================================
     13. LOG / DEBUG
     ========================================================== */

  const DEBUG = false; // Cambiar a true para ver logs en consola

  function log(...args) {
    if (DEBUG) console.log('[SCCR]', ...args);
  }

  function warn(...args) {
    console.warn('[SCCR]', ...args);
  }

  function error(...args) {
    console.error('[SCCR]', ...args);
  }


  /* ==========================================================
     EXPORTAR API PÚBLICA
     ========================================================== */
  return {
    // Formato
    formatCurrency,
    formatShort,
    formatNumber,
    formatPercent,
    parseCurrency,
    parseNumber,

    // Fechas
    formatDate,
    formatDateLong,
    formatDateShort,
    diffDays,
    todayISO,
    firstDayOfMonth,
    lastDayOfMonth,
    firstDayOfWeek,
    inRange,
    timeAgo,
    getLastMonths,

    // Strings
    normalize,
    includes,
    titleCase,
    initials,
    truncate,
    formatPhone,
    formatRIF,

    // Arrays
    groupBy,
    sumBy,
    sortBy,
    search,
    uniqueBy,
    top,
    variation,

    // DOM
    $,
    $$,
    el,
    empty,
    show,
    hide,
    toggle,
    renderSkeletons,
    refreshIcons,

    // Comercial
    clasificarABC,
    badgeABC,
    cumplimiento,
    colorCumplimiento,
    pronosticarMes,
    ticketPromedio,
    deltaClass,
    deltaIcon,

    // Caché
    cacheSet,
    cacheGet,
    cacheClear,

    // Validaciones
    isValidDate,
    isValidPhone,
    isValidRIF,
    isEmpty,

    // Charts
    setupChartDefaults,
    CHART_COLORS,
    CHART_PALETTE,
    destroyChart,

    // Performance
    debounce,
    throttle,

    // Exportación
    downloadJSON,
    downloadCSV,

    // Log
    log,
    warn,
    error,
  };

})();

/* ------------------------------------------------------------
   Exponer en el namespace global
   ------------------------------------------------------------ */
window.SCCR.Utils = Utils;

/* Inicializar Chart.js defaults apenas cargue el script */
document.addEventListener('DOMContentLoaded', () => {
  Utils.setupChartDefaults();
  Utils.log('utils.js cargado ✓');
});
