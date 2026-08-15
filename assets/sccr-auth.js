/* ============================================================
   SCCR v2.5.0 — Módulo de Autenticación y Control de Rol
   Archivo: assets/sccr-auth.js
   Importar en TODOS los módulos del sistema antes del
   script propio de cada página.

   Uso básico en cada módulo:
   ─────────────────────────────────────────────────────────
   const sesion = SCCR.proteger(['vendedor','admin','gerente']);
   SCCR.renderizarHeader('#user-name-display');
   SCCR.mostrarSi('.solo-admin', ['admin','gerente']);
   const datos = SCCR.filtrarPorRol(arrayDeRegistros);
   ============================================================ */

const SCCR = (() => {

  /* ── 1. LEER SESIÓN ──────────────────────────────────────────
     Devuelve el objeto de sesión completo o null si no existe.
     Estructura esperada:
     {
       user:        "vendedor1",
       nombre:      "Carlos Cova",
       rol:         "vendedor",      // "vendedor" | "gerente" | "admin"
       vendedor_id: "vendedor1"      // igual al campo 'user' para vendedores;
                                     // null para admin/gerente
     }
  ──────────────────────────────────────────────────────────── */
  function getSesion() {
    try {
      const raw = sessionStorage.getItem('sccr');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  /* ── 2. PROTEGER PÁGINA ──────────────────────────────────────
     Llama esto al inicio de cada módulo.
     - Si no hay sesión → redirige a login.html
     - Si el rol no está en rolesPermitidos → redirige a
       acceso-denegado.html
     - Si todo ok → devuelve el objeto de sesión
     Ejemplo: const sesion = SCCR.proteger(['vendedor','admin']);
  ──────────────────────────────────────────────────────────── */
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

  /* ── 3. VERIFICADORES RÁPIDOS DE ROL ─────────────────────── */
  function esAdmin()    { return getSesion()?.rol === 'admin';   }
  function esGerente()  { return getSesion()?.rol === 'gerente'; }
  function esVendedor() { return getSesion()?.rol === 'vendedor';}

  // Devuelve true para admin O gerente (pueden ver todo)
  function esDirectivo() {
    return ['admin', 'gerente'].includes(getSesion()?.rol);
  }

  /* ── 4. FILTRO DE DATOS POR ROL ──────────────────────────────
     Recibe un array de registros que tienen un campo vendedor_id.
     - Si el usuario es directivo → devuelve TODOS los registros.
     - Si es vendedor → devuelve solo los suyos.
     Ejemplo:
       fetch(URL).then(r => r.json()).then(data => {
         const miData = SCCR.filtrarPorRol(data);
         renderizarTabla(miData);
       });
  ──────────────────────────────────────────────────────────── */
  function filtrarPorRol(registros = []) {
    const sesion = getSesion();
    if (!sesion) return [];
    if (esDirectivo()) return registros;
    return registros.filter(r => r.vendedor_id === sesion.vendedor_id);
  }

  /* ── 5. RENDERIZAR NOMBRE EN EL HEADER ───────────────────────
     Inyecta el nombre del usuario en el elemento indicado.
     Ejemplo: SCCR.renderizarHeader('#user-name-display');
  ──────────────────────────────────────────────────────────── */
  function renderizarHeader(selector) {
    const sesion = getSesion();
    if (!sesion) return;
    const el = document.querySelector(selector);
    if (el) el.textContent = sesion.nombre;
  }

  /* ── 6. CONTROL DE VISIBILIDAD POR ROL ───────────────────────
     Muestra u oculta elementos del DOM según el rol activo.
     Ejemplo:
       SCCR.mostrarSi('.solo-admin',    ['admin', 'gerente']);
       SCCR.mostrarSi('.solo-vendedor', ['vendedor']);
       SCCR.mostrarSi('.ocultar-bi-ia', ['vendedor']); // ocultar BI+IA
  ──────────────────────────────────────────────────────────── */
  function mostrarSi(selector, roles = []) {
    const sesion = getSesion();
    const visible = roles.includes(sesion?.rol);
    document.querySelectorAll(selector).forEach(el => {
      el.style.display = visible ? '' : 'none';
    });
  }

  /* ── 7. CERRAR SESIÓN ────────────────────────────────────────
     Limpia sessionStorage y redirige al login.
     Ejemplo: SCCR.cerrarSesion();
  ──────────────────────────────────────────────────────────── */
  function cerrarSesion() {
    if (confirm('¿Estás seguro de cerrar sesión?')) {
      sessionStorage.removeItem('sccr');
      window.location.href = 'index.html';
    }
  }

  /* ── API PÚBLICA ─────────────────────────────────────────── */
  return {
    getSesion,
    proteger,
    esAdmin,
    esGerente,
    esVendedor,
    esDirectivo,
    filtrarPorRol,
    renderizarHeader,
    mostrarSi,
    cerrarSesion
  };

})();
