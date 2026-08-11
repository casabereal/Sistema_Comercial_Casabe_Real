/**
 * ============================================================================
 * SISTEMA COMERCIAL CASABE REAL (SCCR v2.5.0)
 * Archivo de Configuración Centralizada, Rutas, Roles y Utilidades API
 * Arquitectura: Frontend Unificado (Vanilla JS / ES6) + Google Apps Script API
 * ============================================================================
 */

(function (window) {
  'use strict';

  // 1. CONFIGURACIÓN GENERAL DEL SISTEMA Y ENDPOINTS
  const SCCR_CONFIG = {
    APP_NAME: 'Sistema Comercial Casabe Real',
    SHORT_NAME: 'SCCR',
    VERSION: '2.5.0',
    LOGO_PATH: 'assets/logo-casabe-real.png',
    
    // URL Principal del Web App desplegado en Google Apps Script (Code.gs)
    // Reemplaza esta constante con la URL obtenida al publicar tu Aplicación Web
    APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxL5c2i3KcZi7hu3U5dJTBES_7h_sIkNxiY9h2-VA2KnxD6NesC76mdpdXTvc_q8kFXOQ/exec',
    
    // Claves para el almacenamiento local (localStorage)
    STORAGE_KEYS: {
      USER: 'sccr_user_session',
      TOKEN: 'sccr_auth_token',
      THEME: 'sccr_theme_pref',
      CACHE: 'sccr_data_cache'
    },

    // 2. PALETA CROMÁTICA OFICIAL Y DESIGN SYSTEM
    THEME: {
      PRIMARY_RED: '#D71920',      // Rojo Casabe (Botones, Encabezados, Acentos)
      PRIMARY_DARK: '#C8181E',     // Rojo Oscuro para hover/focus
      BACKGROUND: '#F5F7FA',       // Fondo general de reducción de fatiga visual
      CARD_BG: '#FFFFFF',          // Fondo de contenedores y tarjetas
      TEXT_PRIMARY: '#2D3436',     // Texto principal y números KPI
      TEXT_SECONDARY: '#7F8C8D',   // Texto secundario, etiquetas y breadcrumbs
      BORDER_COLOR: '#E2E8F0',     // Bordes suaves e interdivisores
      
      // Semáforos y Estados de Negocio
      STATUS: {
        SUCCESS: '#2ECC71',        // Verde: >= 90% (Al día / Cumplido)
        WARNING: '#F39C12',        // Amarillo: 75% - 89% (Advertencia / Por vencer)
        DANGER: '#E74C3C',         // Rojo: < 75% (Alerta Crítica / En riesgo)
        INFO: '#3498DB'            // Azul Informativo
      },

      // Umbrales de Evaluación de Semáforo (%)
      THRESHOLDS: {
        SUCCESS_MIN: 90,
        WARNING_MIN: 75
      }
    },

    // 3. MATRIZ DE ROLES Y PERMISOS DE ACCESO (INCLUYE GERENTE Y CEO-ADMINISTRADOR)
    ROLES: {
      VENDEDOR: {
        id: 'VENDEDOR',
        name: 'Vendedor / Asesor Comercial',
        defaultPage: 'vendedor.html',
        level: 1,
        description: 'Gestión de cartera individual, pedidos, propuestas, reportes y rutero.'
      },
      GERENTE: {
        id: 'GERENTE',
        name: 'Gerente Comercial',
        defaultPage: 'gerente.html',
        level: 2,
        description: 'Supervisión regional/equipo, KPIs estratégicos, metas, embudo y BI.'
      },
      ADMINISTRADOR: {
        id: 'ADMINISTRADOR',
        name: 'CEO / Administrador General',
        defaultPage: 'administrador.html',
        level: 3,
        description: 'Control total del sistema, gestión de usuarios, carga de cuotas y base de datos.'
      }
    },

    // 4. REGISTRO OFICIAL DE MÓDULOS Y RUTAS DEL SISTEMA
    MODULES: [
      {
        id: 'login',
        title: 'Acceso al Sistema',
        file: 'login.html',
        icon: 'fas fa-sign-in-alt',
        roles: ['VENDEDOR', 'GERENTE', 'ADMINISTRADOR'],
        showInNav: false
      },
      {
        id: 'portal_vendedor',
        title: 'Portal Vendedor',
        file: 'vendedor.html',
        icon: 'fas fa-user-tie',
        roles: ['VENDEDOR', 'GERENTE', 'ADMINISTRADOR'],
        showInNav: true
      },
      {
        id: 'portal_gerente',
        title: 'Portal Gerencial',
        file: 'gerente.html',
        icon: 'fas fa-chart-line',
        roles: ['GERENTE', 'ADMINISTRADOR'],
        showInNav: true
      },
      {
        id: 'portal_administrador',
        title: 'Centro CEO / Administración',
        file: 'administrador.html',
        icon: 'fas fa-user-shield',
        roles: ['ADMINISTRADOR'],
        showInNav: true
      },
      {
        id: 'dashboard',
        title: 'Dashboard Ejecutivo (5 Filas)',
        file: 'dashboard.html',
        icon: 'fas fa-tachometer-alt',
        roles: ['GERENTE', 'ADMINISTRADOR'],
        showInNav: true
      },
      {
        id: 'clientes',
        title: 'Directorio Clientes 360°',
        file: 'clientes.html',
        icon: 'fas fa-address-book',
        roles: ['VENDEDOR', 'GERENTE', 'ADMINISTRADOR'],
        showInNav: true
      },
      {
        id: 'reportes',
        title: 'Reporte de Gestión y Bitácora',
        file: 'reportes.html',
        icon: 'fas fa-clipboard-list',
        roles: ['VENDEDOR', 'GERENTE', 'ADMINISTRADOR'],
        showInNav: true
      },
      {
        id: 'embudo',
        title: 'Embudo Comercial (5 Etapas)',
        file: 'embudo.html',
        icon: 'fas fa-filter',
        roles: ['VENDEDOR', 'GERENTE', 'ADMINISTRADOR'],
        showInNav: true
      },
      {
        id: 'propuesta',
        title: 'Simulador y Propuestas',
        file: 'propuesta.html',
        icon: 'fas fa-file-invoice-dollar',
        roles: ['VENDEDOR', 'GERENTE', 'ADMINISTRADOR'],
        showInNav: true
      },
      {
        id: 'pedidos',
        title: 'Gestión de Pedidos',
        file: 'pedidos.html',
        icon: 'fas fa-shopping-cart',
        roles: ['VENDEDOR', 'GERENTE', 'ADMINISTRADOR'],
        showInNav: true
      },
      {
        id: 'metas',
        title: 'Metas, Proyección y GAP',
        file: 'metas.html',
        icon: 'fas fa-bullseye',
        roles: ['GERENTE', 'ADMINISTRADOR'],
        showInNav: true
      },
      {
        id: 'bi_ia',
        title: 'Inteligencia BI & Centro IA',
        file: 'bi_ia.html',
        icon: 'fas fa-brain',
        roles: ['GERENTE', 'ADMINISTRADOR'],
        showInNav: true
      }
    ],

    // 5. MAPEO DE ACCIONES API (BACKEND GOOGLE APPS SCRIPT / Code.gs)
    API_ACTIONS: {
      AUTH: {
        LOGIN: 'loginUser',
        LOGOUT: 'logoutUser',
        REQUEST_ACCESS: 'requestAccess'
      },
      CLIENTES: {
        GET_ALL: 'getClientes',
        SAVE: 'saveCliente',
        DELETE: 'deleteCliente'
      },
      METAS: {
        GET_ALL: 'getMetas',
        SAVE_CUOTA: 'saveCuota',
        IMPORT_SHEET: 'importMetasSheet'
      },
      REPORTES: {
        GET_ALL: 'getReportes',
        SAVE: 'saveReporte'
      },
      EMBUDO: {
        GET_DATA: 'getEmbudoData',
        UPDATE_STAGE: 'updateEmbudoStage'
      },
      PROPUESTAS: {
        GET_ALL: 'getPropuestas',
        SAVE: 'savePropuesta'
      },
      PEDIDOS: {
        GET_ALL: 'getPedidos',
        SAVE: 'savePedido'
      },
      BI_IA: {
        GET_KPIS: 'getBiKpis',
        INGEST_MEMORY: 'saveIaContext'
      },
      ADMIN: {
        GET_USERS: 'getUsers',
        UPDATE_USER_STATUS: 'updateUserStatus',
        SYNC_DATABASE: 'syncFullDatabase'
      }
    }
  };

  // ============================================================================
  // UTILIDADES GLOBALES Y FUNCIONES AUXILIARES (EXPORTE A WINDOW)
  // ============================================================================

  // Exposición de constantes globales para retrocompatibilidad
  window.SCCR_CONFIG = SCCR_CONFIG;
  window.APPS_SCRIPT_URL = SCCR_CONFIG.APPS_SCRIPT_URL;

  /**
   * Envía peticiones HTTP centralizadas a la API de Google Apps Script
   * @param {string} action - Nombre de la acción de backend
   * @param {Object} payload - Datos del cuerpo de la petición
   * @returns {Promise<Object>} Respuesta JSON decodificada
   */
  window.sendSccrRequest = async function (action, payload = {}) {
    const user = window.getSccrUser();
    const bodyData = {
      action: action,
      user_id: user ? user.username : null,
      role: user ? user.role : null,
      data: payload,
      timestamp: new Date().toISOString()
    };

    try {
      // Se utiliza text/plain en el fetch POST para evitar bloqueos CORS/Preflight en Apps Script
      const response = await fetch(SCCR_CONFIG.APPS_SCRIPT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(bodyData)
      });

      const result = await response.json();
      return result;
    } catch (error) {
      console.error(`[SCCR Error] Fallo al ejecutar acción [${action}]:`, error);
      return {
        success: false,
        message: 'Error de comunicación con el servidor SCCR: ' + error.message
      };
    }
  };

  /**
   * Obtiene los datos del usuario autenticado en la sesión actual
   */
  window.getSccrUser = function () {
    try {
      const stored = localStorage.getItem(SCCR_CONFIG.STORAGE_KEYS.USER);
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      console.error('[SCCR] Error al leer la sesión local:', e);
      return null;
    }
  };

  /**
   * Guarda los datos del usuario en la sesión local
   */
  window.setSccrUser = function (userData) {
    try {
      localStorage.setItem(SCCR_CONFIG.STORAGE_KEYS.USER, JSON.stringify(userData));
    } catch (e) {
      console.error('[SCCR] Error al guardar la sesión local:', e);
    }
  };

  /**
   * Cierra la sesión activa y redirige al inicio de sesión (login.html)
   */
  window.logoutSccrUser = function () {
    localStorage.removeItem(SCCR_CONFIG.STORAGE_KEYS.USER);
    localStorage.removeItem(SCCR_CONFIG.STORAGE_KEYS.TOKEN);
    window.location.href = 'login.html';
  };

  /**
   * Protege las páginas HTML verificando autenticación y roles de acceso
   * @param {Array<string>} allowedRoles - Roles que tienen acceso a la página actual
   * @returns {boolean} True si tiene acceso, False en caso contrario
   */
  window.protectPage = function (allowedRoles = []) {
    const user = window.getSccrUser();

    // 1. Si no existe sesión activa, redirigir a Login
    if (!user) {
      window.location.href = 'login.html';
      return false;
    }

    // 2. Si se especifican roles y el rol del usuario no está autorizado
    if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
      alert(`Acceso Denegado: Su rol [${user.role}] no posee permisos para acceder a esta sección.`);
      window.redirectSccrByRole(user.role);
      return false;
    }

    return true;
  };

  /**
   * Redirige al usuario a la página principal predeterminada para su Rol
   * @param {string} role - Rol del usuario (VENDEDOR, GERENTE, ADMINISTRADOR)
   */
  window.redirectSccrByRole = function (role) {
    const roleConfig = SCCR_CONFIG.ROLES[role];
    if (roleConfig && roleConfig.defaultPage) {
      window.location.href = roleConfig.defaultPage;
    } else {
      window.location.href = 'vendedor.html';
    }
  };

  /**
   * Determina el color y la etiqueta del semáforo comercial según el porcentaje de cumplimiento
   * @param {number} percentage - Porcentaje de avance o meta
   * @returns {Object} Objeto con color hex, etiqueta y clase CSS
   */
  window.getSccrTrafficLight = function (percentage) {
    const val = parseFloat(percentage) || 0;
    if (val >= SCCR_CONFIG.THEME.THRESHOLDS.SUCCESS_MIN) {
      return {
        color: SCCR_CONFIG.THEME.STATUS.SUCCESS,
        label: 'Excelente / Al día',
        class: 'status-success'
      };
    } else if (val >= SCCR_CONFIG.THEME.THRESHOLDS.WARNING_MIN) {
      return {
        color: SCCR_CONFIG.THEME.STATUS.WARNING,
        label: 'Advertencia / Por vencer',
        class: 'status-warning'
      };
    } else {
      return {
        color: SCCR_CONFIG.THEME.STATUS.DANGER,
        label: 'Alerta Crítica / En riesgo',
        class: 'status-danger'
      };
    }
  };

  /**
   * Formatea un valor numérico a moneda ($ USD)
   */
  window.formatSccrCurrency = function (amount) {
    const num = parseFloat(amount) || 0;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(num);
  };

  /**
   * Formatea un número entero (Volumen de Cajas / Unidades)
   */
  window.formatSccrNumber = function (val) {
    const num = parseFloat(val) || 0;
    return new Intl.NumberFormat('es-VE', {
      maximumFractionDigits: 0
    }).format(num);
  };

  // Notificación de inicialización en consola
  console.log(`[SCCR] ${SCCR_CONFIG.APP_NAME} v${SCCR_CONFIG.VERSION} - Configuración centralizada cargada.`);

})(window);
