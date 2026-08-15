/* ============================================================
   SCCR v2.5.0 — Módulo de Autenticación y Control de Rol
   Archivo: assets/sccr-auth.js

   Importar en TODOS los módulos del sistema ANTES del
   script propio de cada página, y llamar initSCCR() en
   el DOMContentLoaded.

   ── USO MÍNIMO EN CADA MÓDULO ────────────────────────────
   <script src="assets/sccr-auth.js"></script>
   <script>
     window.addEventListener('DOMContentLoaded', () => {
       SCCR.initSCCR();          // protege, menú y header automáticos
     });
   </script>

   ── PERMISOS POR ROL ─────────────────────────────────────
   Vendedor  → inicio, clientes, meta, propuesta, pedido,
               reporte, embudo, dashboard
   Gerente   → todo lo anterior + bi_ia, cargas, historico
   Admin     → todo lo anterior + bi_ia, cargas, historico
   ============================================================ */

const SCCR = (() => {

  /* ──────────────────────────────────────────────────────────
     MAPA DE MENÚ POR ROL
     Clave  : nombre del archivo (sin .html, en minúsculas)
     Valor  : array de roles que pueden verlo
     Agregar aquí cualquier nueva página del sistema.
  ────────────────────────────────────────────────────────── */
  const MENU_PERMISOS = {
    inicio:    ['vendedor', 'gerente', 'admin'],
    clientes:  ['vendedor', 'gerente', 'admin'],
    meta:      ['vendedor', 'gerente', 'admin'],
    propuesta: ['vendedor', 'gerente', 'admin'],
    pedido:    ['vendedor', 'gerente', 'admin'],
    reporte:   ['vendedor', 'gerente', 'admin'],
    embudo:    ['vendedor', 'gerente', 'admin'],
    dashboard: ['vendedor', 'gerente', 'admin'],
    bi_ia:     ['gerente',  'admin'],
    cargas:    ['gerente',  'admin'],
    historico: ['gerente',  'admin'],
  };

  /* ──────────────────────────────────────────────────────────
     PORTAL DE DESTINO POR ROL
     A dónde redirige el login después de autenticarse.
  ────────────────────────────────────────────────────────── */
  const PORTAL_ROL = {
    vendedor: 'inicio.html',
    gerente:  'inicio.html',
    admin:    'inicio.html',
  };

  /* ── 1. LEER SESIÓN ────────────────────────────────────────
     Devuelve el objeto de sesión o null.
     Estructura:
     {
       user:        "vendedor1",
       nombre:      "Carlos Cova",
       rol:         "vendedor",       // "vendedor" | "gerente" | "admin"
       vendedor_id: "vendedor1"       // null para gerente / admin
     }
  ────────────────────────────────────────────────────────── */
  function getSesion() {
    try {
      const raw = sessionStorage.getItem('sccr');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  /* ── 2. VERIFICADORES RÁPIDOS DE ROL ───────────────────── */
  function esAdmin()     { return getSesion()?.rol === 'admin';   }
  function esGerente()   { return getSesion()?.rol === 'gerente'; }
  function esVendedor()  { return getSesion()?.rol === 'vendedor';}
  function esDirectivo() { return ['admin','gerente'].includes(getSesion()?.rol); }

  /* ── 3. PROTEGER PÁGINA ────────────────────────────────────
     Verifica sesión y rol. Si algo falla, redirige.
     rolesPermitidos = [] significa "cualquier rol autenticado".
     Devuelve el objeto de sesión si todo está ok.
  ────────────────────────────────────────────────────────── */
  function proteger(rolesPermitidos = []) {
    const sesion = getSesion();
    if (!sesion) {
      window.location.href = 'index.html';
      return null;
    }
    if (rolesPermitidos.length > 0 && !rolesPermitidos.includes(sesion.rol)) {
      window.location.href = 'acceso-denegado.html';
      return null;
    }
    return sesion;
  }

  /* ── 4. CONTROL AUTOMÁTICO DEL MENÚ ───────────────────────
     Recorre todos los <a> del nav-bar (o aside) y oculta
     los que el rol activo no tiene permiso de ver.

     Cómo funciona:
     - Lee el href de cada enlace
     - Extrae el nombre del archivo (ej: "bi_ia" de "bi_ia.html")
     - Consulta MENU_PERMISOS para saber si el rol puede verlo
     - Si no puede → oculta el <a> y también su <li> padre si existe

     El selector por defecto cubre el nav-bar horizontal de
     vendedor.html. Pásale otro selector si tu nav es distinto.
  ────────────────────────────────────────────────────────── */
  function aplicarMenuPorRol(navSelector = 'nav, .nav-bar, aside') {
    const sesion = getSesion();
    if (!sesion) return;

    const contenedores = document.querySelectorAll(navSelector);
    contenedores.forEach(nav => {
      nav.querySelectorAll('a[href]').forEach(link => {
        // Extraer nombre de archivo sin extensión y en minúsculas
        const href     = link.getAttribute('href');
        const archivo  = href.split('/').pop().replace('.html','').toLowerCase();
        const permisos = MENU_PERMISOS[archivo];

        // Si la página está en el mapa Y el rol no está permitido → ocultar
        if (permisos && !permisos.includes(sesion.rol)) {
          link.style.display = 'none';
          // Si el enlace está dentro de un <li>, ocultar también el <li>
          const li = link.closest('li');
          if (li) li.style.display = 'none';
        }
      });
    });
  }

  /* ── 5. FILTRO DE DATOS POR ROL ───────────────────────────
     Recibe un array de registros con campo vendedor_id.
     Vendedor → solo sus registros.
     Directivo → todos los registros.
  ────────────────────────────────────────────────────────── */
  function filtrarPorRol(registros = []) {
    const sesion = getSesion();
    if (!sesion) return [];
    if (esDirectivo()) return registros;
    return registros.filter(r => r.vendedor_id === sesion.vendedor_id);
  }

  /* ── 6. RENDERIZAR NOMBRE EN EL HEADER ────────────────────
     Inyecta el nombre del usuario en el selector indicado.
     Busca por defecto los IDs más comunes del sistema.
  ────────────────────────────────────────────────────────── */
  function renderizarHeader(selector = '#user-name-display, #vendor-name') {
    const sesion = getSesion();
    if (!sesion) return;
    document.querySelectorAll(selector).forEach(el => {
      el.textContent = sesion.nombre;
    });
  }

  /* ── 7. MOSTRAR/OCULTAR ELEMENTOS POR ROL ─────────────────
     Para controlar secciones de contenido dentro de una página.
     Ejemplo:
       SCCR.mostrarSi('.panel-global',  ['admin','gerente']);
       SCCR.mostrarSi('.panel-vendedor',['vendedor']);
  ────────────────────────────────────────────────────────── */
  function mostrarSi(selector, roles = []) {
    const sesion  = getSesion();
    const visible = roles.includes(sesion?.rol);
    document.querySelectorAll(selector).forEach(el => {
      el.style.display = visible ? '' : 'none';
    });
  }

  /* ── 8. CERRAR SESIÓN ──────────────────────────────────────
     Limpia sessionStorage y redirige al login.
  ────────────────────────────────────────────────────────── */
  function cerrarSesion() {
    if (confirm('¿Estás seguro de cerrar sesión?')) {
      sessionStorage.removeItem('sccr');
      window.location.href = 'index.html';
    }
  }

  /* ── 9. INIT COMPLETO (atajo recomendado) ─────────────────
     Llama a esto en el DOMContentLoaded de cada módulo.
     Ejecuta en orden:
       1. Protege la página (redirige si no hay sesión)
       2. Aplica permisos del menú automáticamente
       3. Renderiza el nombre en el header
     Devuelve el objeto de sesión para uso posterior.

     Ejemplo mínimo en cualquier módulo:
     ─────────────────────────────────────────────────────
     window.addEventListener('DOMContentLoaded', () => {
       const sesion = SCCR.initSCCR();
       if (!sesion) return;

       // Ya puedes usar sesion.nombre, sesion.rol, etc.
       // Para filtrar datos del API:
       fetch(URL).then(r => r.json()).then(data => {
         renderizarTabla( SCCR.filtrarPorRol(data) );
       });
     });
     ─────────────────────────────────────────────────────
  ────────────────────────────────────────────────────────── */
  function initSCCR(rolesPermitidos = []) {
    const sesion = proteger(rolesPermitidos);
    if (!sesion) return null;
    aplicarMenuPorRol();
    renderizarHeader();
    return sesion;
  }

  /* ── API PÚBLICA ────────────────────────────────────────── */
  return {
    PORTAL_ROL,
    getSesion,
    proteger,
    esAdmin,
    esGerente,
    esVendedor,
    esDirectivo,
    aplicarMenuPorRol,
    filtrarPorRol,
    renderizarHeader,
    mostrarSi,
    cerrarSesion,
    initSCCR,
  };

})();
