/* ============================================================
   SISTEMA COMERCIAL CASABE REAL
   modules/administracion.js — Módulo de Administración
   v1.0.0
   ============================================================

   Responsabilidades:
   1.  Gestión de usuarios y roles
   2.  Configuración general del sistema
   3.  Conexión y estado de Jotform
   4.  Administración de la API key de IA
   5.  Auditoría de sincronizaciones
   6.  Herramientas de mantenimiento del sistema

   Escucha: sccr:activar-administracion
   Depende de: utils.js, importador.js
   ============================================================ */

'use strict';

window.SCCR = window.SCCR || {};

const ModuloAdministracion = (() => {

  /* ----------------------------------------------------------
     ESTADO
     ---------------------------------------------------------- */
  let _tabActiva = 'general';
  let _config    = {};
  let _usuarios  = [];

  /* ----------------------------------------------------------
     LISTENER
     ---------------------------------------------------------- */
  document.addEventListener('sccr:activar-administracion', onActivar);


  /* ==========================================================
     1. ACTIVACIÓN
     ========================================================== */
  async function onActivar() {
    await cargarConfig();
    await cargarUsuarios();
    render();
  }


  /* ==========================================================
     2. CARGA DE DATOS
     ========================================================== */
  async function cargarConfig() {
    /* Prioridad: localStorage → data/config.json */
    const stored = SCCR.Store.get('config_override');
    if (stored) { _config = { ..._config, ...stored }; }

    try {
      const res = await fetch('data/config.json');
      if (res.ok) {
        const data = await res.json();
        _config = { ...data, ..._config };
      }
    } catch (_) {}

    /* Defaults */
    _config = {
      nombre_empresa:     'Casabe Real',
      moneda:             'USD',
      meta_mensual_usd:   0,
      dias_inactividad:   14,
      jotform_api_key:    '',
      form_recurrentes:   '222905670810655',
      form_nuevos:        '261445908854063',
      version:            '1.0.0',
      ..._config,
    };
  }

  async function cargarUsuarios() {
    const stored = SCCR.Store.get('usuarios', []);
    if (stored.length > 0) { _usuarios = stored; return; }

    try {
      const res = await fetch('data/usuarios.json');
      if (res.ok) {
        const data = await res.json();
        _usuarios = Array.isArray(data) ? data : [];
      }
    } catch (_) {}

    if (_usuarios.length === 0) {
      _usuarios = [
        {
          id:      1,
          nombre:  'Administrador',
          email:   '',
          rol:     'administrador',
          activo:  true,
          creado:  new Date().toISOString().split('T')[0],
        },
      ];
    }
  }

  function guardarConfig() {
    SCCR.Store.set('config_override', _config);
    SCCR.Log?.info('Admin', 'Configuración guardada en localStorage');
  }

  function guardarUsuarios() {
    SCCR.Store.set('usuarios', _usuarios);
  }


  /* ==========================================================
     3. RENDER PRINCIPAL
     ========================================================== */
  function render() {
    const view = document.getElementById('view-administracion');
    if (!view) return;

    SCCR.Log?.info('Admin', `Tab activa: ${_tabActiva}`);

    view.innerHTML = `

      <!-- Header -->
      <div class="page-header flex items-center justify-between">
        <div>
          <h1 class="page-title">Administración</h1>
          <p class="page-subtitle">Configuración y gestión del sistema</p>
        </div>
        <div class="flex items-center gap-2">
          ${SCCR.UI.badge('v' + (_config.version || '1.0.0'), 'inactive')}
        </div>
      </div>

      <!-- Tabs -->
      <div style="display:flex;gap:4px;border-bottom:2px solid var(--color-border);
           margin-bottom:var(--space-5);overflow-x:auto;">
        ${[
          { id: 'general',      label: 'General',        icono: 'settings'     },
          { id: 'jotform',      label: 'Jotform',        icono: 'plug'         },
          { id: 'usuarios',     label: 'Usuarios',       icono: 'users'        },
          { id: 'datos',        label: 'Datos',          icono: 'database'     },
          { id: 'sistema',      label: 'Sistema',        icono: 'monitor'      },
        ].map(t => `
          <button class="btn btn-ghost btn-sm" data-tab="${t.id}" id="adm-tab-${t.id}"
            style="border-radius:var(--radius-md) var(--radius-md) 0 0;
              border-bottom:2px solid ${t.id === _tabActiva ? 'var(--color-primary)' : 'transparent'};
              color:${t.id === _tabActiva ? 'var(--color-primary)' : 'var(--color-text-secondary)'};
              font-weight:${t.id === _tabActiva ? '600' : '400'};
              white-space:nowrap;margin-bottom:-2px;padding:10px 16px;">
            <i data-lucide="${t.icono}" style="width:14px;height:14px;"></i>
            ${t.label}
          </button>`).join('')}
      </div>

      <!-- Contenido -->
      <div id="adm-contenido"></div>

    `;

    renderTab(_tabActiva);
    bindTabs();
    lucide.createIcons();
  }

  function bindTabs() {
    document.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        _tabActiva = btn.dataset.tab;
        document.querySelectorAll('[data-tab]').forEach(b => {
          const a = b.dataset.tab === _tabActiva;
          b.style.borderBottomColor = a ? 'var(--color-primary)' : 'transparent';
          b.style.color             = a ? 'var(--color-primary)' : 'var(--color-text-secondary)';
          b.style.fontWeight        = a ? '600' : '400';
        });
        renderTab(_tabActiva);
        lucide.createIcons();
      });
    });
  }

  function renderTab(tab) {
    switch (tab) {
      case 'general':  renderGeneral();  break;
      case 'jotform':  renderJotform();  break;
      case 'usuarios': renderUsuarios(); break;
      case 'datos':    renderDatos();    break;
      case 'sistema':  renderSistema();  break;
    }
  }


  /* ==========================================================
     4. TAB — CONFIGURACIÓN GENERAL
     ========================================================== */
  function renderGeneral() {
    const el = document.getElementById('adm-contenido');
    if (!el) return;

    el.innerHTML = `
      <div style="max-width:640px;display:flex;flex-direction:column;gap:var(--space-5);">

        <!-- Datos de la empresa -->
        <div class="card">
          <div class="card__header">
            <span class="card__title">Datos de la empresa</span>
          </div>
          <div class="card__body" style="display:flex;flex-direction:column;gap:var(--space-4);">

            <div class="form-group">
              <label class="form-label">Nombre de la empresa</label>
              <input type="text" class="form-input" id="adm-nombre-empresa"
                value="${SCCR.Texto.escaparHTML(_config.nombre_empresa || '')}" />
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);">

              <div class="form-group">
                <label class="form-label">Moneda principal</label>
                <select class="form-select" id="adm-moneda">
                  <option value="USD" ${_config.moneda==='USD'?'selected':''}>USD — Dólar</option>
                  <option value="VES" ${_config.moneda==='VES'?'selected':''}>VES — Bolívar</option>
                </select>
              </div>

              <div class="form-group">
                <label class="form-label">Meta mensual global (USD)</label>
                <div class="search-input-wrap">
                  <span class="search-input-wrap__icon" style="left:12px;font-weight:700;
                    color:var(--color-text-secondary);">$</span>
                  <input type="number" class="form-input" id="adm-meta-global"
                    value="${_config.meta_mensual_usd || 0}"
                    min="0" step="0.01" style="padding-left:28px;" />
                </div>
                <span class="form-hint">Puedes ajustar metas individuales en el módulo Metas.</span>
              </div>

              <div class="form-group">
                <label class="form-label">Días para cliente inactivo</label>
                <input type="number" class="form-input" id="adm-dias-inactividad"
                  value="${_config.dias_inactividad || 14}" min="1" max="90" />
                <span class="form-hint">Días sin comprar para marcar como inactivo.</span>
              </div>

            </div>

          </div>
          <div class="card__footer" style="justify-content:flex-end;">
            <button class="btn btn-primary" id="adm-guardar-general">
              <i data-lucide="save" style="width:15px;height:15px;"></i>
              Guardar cambios
            </button>
          </div>
        </div>

        <!-- Información del sistema -->
        <div class="card">
          <div class="card__header">
            <span class="card__title">Información del sistema</span>
          </div>
          <div class="card__body">
            <table class="table">
              <tbody>
                ${[
                  { label: 'Versión',               valor: _config.version || '1.0.0'   },
                  { label: 'Total de pedidos',       valor: SCCR.Numero.formato(SCCR.Motor?.totalPedidos() || 0) },
                  { label: 'Última sincronización',  valor: SCCR.Motor ? (SCCR.Importador?.estado()?.ultima_sync
                      ? SCCR.Fecha.relativo(SCCR.Importador.estado().ultima_sync)
                      : 'Nunca') : '—' },
                  { label: 'Formulario recurrentes', valor: _config.form_recurrentes || '—' },
                  { label: 'Formulario nuevos',      valor: _config.form_nuevos || '—'      },
                  { label: 'Navegador',              valor: navigator.userAgent.split(' ').slice(-1)[0] },
                ].map(r => `
                  <tr>
                    <td class="text-secondary" style="font-size:13px;width:220px;">${r.label}</td>
                    <td class="font-medium" style="font-size:13px;">${SCCR.Texto.escaparHTML(String(r.valor))}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>

      </div>`;

    /* Guardar config general */
    document.getElementById('adm-guardar-general')?.addEventListener('click', () => {
      _config.nombre_empresa   = document.getElementById('adm-nombre-empresa')?.value.trim() || 'Casabe Real';
      _config.moneda           = document.getElementById('adm-moneda')?.value || 'USD';
      _config.meta_mensual_usd = parseFloat(document.getElementById('adm-meta-global')?.value || 0);
      _config.dias_inactividad = parseInt(document.getElementById('adm-dias-inactividad')?.value || 14);
      guardarConfig();
      SCCR.toast?.('Configuración guardada', 'success');
    });
  }


  /* ==========================================================
     5. TAB — JOTFORM
     ========================================================== */
  function renderJotform() {
    const el = document.getElementById('adm-contenido');
    if (!el) return;

    const estado    = SCCR.Importador?.estado() || {};
    const tieneKey  = !!(_config.jotform_api_key || estado.tiene_api_key);
    const totalCache = estado.total_en_cache || 0;
    const ultimaSync = estado.ultima_sync
      ? SCCR.Fecha.relativo(estado.ultima_sync)
      : 'Nunca sincronizado';

    el.innerHTML = `
      <div style="max-width:640px;display:flex;flex-direction:column;gap:var(--space-5);">

        <!-- Estado de conexión -->
        <div class="card">
          <div class="card__header">
            <span class="card__title">Estado de conexión</span>
          </div>
          <div class="card__body">

            <!-- Indicador de estado -->
            <div style="display:flex;align-items:center;gap:var(--space-4);
                 padding:var(--space-4);background:var(--color-bg);
                 border-radius:var(--radius-md);margin-bottom:var(--space-4);">
              <div style="width:48px;height:48px;border-radius:50%;
                   background:${tieneKey ? 'var(--color-connected-bg)' : 'var(--color-warning-bg)'};
                   display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <i data-lucide="${tieneKey ? 'check-circle' : 'alert-circle'}"
                  style="width:24px;height:24px;color:${tieneKey ? 'var(--color-connected)' : 'var(--color-warning)'};"></i>
              </div>
              <div>
                <div class="font-semibold" style="font-size:15px;">
                  ${tieneKey ? '✅ Conectado a Jotform' : '⚠️ Sin API key configurada'}
                </div>
                <div class="text-xs text-secondary mt-1">
                  ${tieneKey
                    ? `Última sync: ${ultimaSync} · ${totalCache} pedidos en caché`
                    : 'Ingresa tu API key para sincronizar datos'}
                </div>
              </div>
              ${tieneKey ? `
                <div style="margin-left:auto;">
                  <button class="btn btn-primary btn-sm" id="adm-jot-sync-now">
                    <i data-lucide="refresh-cw" style="width:13px;height:13px;"></i>
                    Sincronizar ahora
                  </button>
                </div>` : ''}
            </div>

            <!-- Formularios conectados -->
            <div class="text-xs text-secondary mb-3"
              style="text-transform:uppercase;letter-spacing:.05em;">
              Formularios configurados
            </div>
            <div style="display:flex;flex-direction:column;gap:var(--space-3);">
              ${[
                { label: 'Carga de Pedidos (recurrentes)', id: _config.form_recurrentes, url: `https://form.jotform.com/${_config.form_recurrentes}` },
                { label: 'Carga de Pedidos NC (nuevos)',   id: _config.form_nuevos,      url: `https://form.jotform.com/${_config.form_nuevos}` },
              ].map(f => `
                <div style="display:flex;align-items:center;justify-content:space-between;
                     padding:var(--space-3) var(--space-4);background:var(--color-bg);
                     border-radius:var(--radius-md);">
                  <div>
                    <div class="font-medium" style="font-size:13px;">${f.label}</div>
                    <div class="text-xs text-secondary">ID: ${f.id}</div>
                  </div>
                  <div class="flex gap-2">
                    <a href="${f.url}" target="_blank" class="btn btn-ghost btn-sm">
                      <i data-lucide="external-link" style="width:13px;height:13px;"></i>
                      Abrir
                    </a>
                  </div>
                </div>`).join('')}
            </div>

          </div>
        </div>

        <!-- API Key -->
        <div class="card">
          <div class="card__header">
            <span class="card__title">API Key de Jotform</span>
          </div>
          <div class="card__body" style="display:flex;flex-direction:column;gap:var(--space-4);">

            <div class="alert alert-warning" style="font-size:12px;">
              <i data-lucide="shield-alert" style="width:14px;height:14px;" class="alert__icon"></i>
              <span>Mantén tu API key confidencial. No la compartas ni la publiques en repositorios públicos.</span>
            </div>

            <div class="form-group">
              <label class="form-label">API Key</label>
              <div style="display:flex;gap:var(--space-3);">
                <input type="password" class="form-input w-full" id="adm-jot-apikey"
                  value="${_config.jotform_api_key ? '••••••••••••••••••••••••••••••••' : ''}"
                  placeholder="Pega tu API key de Jotform aquí"
                  autocomplete="off" />
                <button class="btn btn-ghost btn-icon" id="adm-jot-toggle-key"
                  title="Mostrar/ocultar">
                  <i data-lucide="eye" style="width:16px;height:16px;"></i>
                </button>
              </div>
              <span class="form-hint">
                Encuéntrala en Jotform → Mi cuenta → API
                <a href="https://www.jotform.com/myaccount/api" target="_blank"
                  style="color:var(--color-primary);margin-left:4px;">
                  Abrir →
                </a>
              </span>
            </div>

            <div style="display:flex;gap:var(--space-3);">
              <button class="btn btn-primary" id="adm-jot-guardar-key">
                <i data-lucide="key" style="width:15px;height:15px;"></i>
                Guardar API key
              </button>
              ${tieneKey ? `
                <button class="btn btn-danger" id="adm-jot-eliminar-key">
                  <i data-lucide="trash-2" style="width:15px;height:15px;"></i>
                  Eliminar key
                </button>` : ''}
            </div>

          </div>
        </div>

        <!-- Configuración de sincronización -->
        <div class="card">
          <div class="card__header">
            <span class="card__title">Sincronización</span>
          </div>
          <div class="card__body" style="display:flex;flex-direction:column;gap:var(--space-4);">

            <div style="display:flex;align-items:center;justify-content:space-between;">
              <div>
                <div class="font-medium" style="font-size:13px;">Sincronización automática</div>
                <div class="text-xs text-secondary mt-1">Cada 10 minutos mientras el sistema esté abierto</div>
              </div>
              ${SCCR.UI.badge('Activa', 'active')}
            </div>

            <hr class="divider" style="margin:0;">

            <div class="flex gap-3 flex-wrap">
              <button class="btn btn-secondary" id="adm-jot-sync-completo">
                <i data-lucide="download-cloud" style="width:15px;height:15px;"></i>
                Sincronización completa
              </button>
              <button class="btn btn-ghost btn-sm" id="adm-jot-limpiar-cache"
                style="color:var(--color-danger);">
                <i data-lucide="trash-2" style="width:13px;height:13px;"></i>
                Limpiar caché
              </button>
            </div>

            <div class="alert alert-info" style="font-size:12px;">
              <i data-lucide="info" style="width:13px;height:13px;" class="alert__icon"></i>
              <span>La sincronización completa trae todos los pedidos desde el inicio. Úsala si hay discrepancias en los datos.</span>
            </div>

          </div>
        </div>

      </div>`;

    /* Bind botones Jotform */
    document.getElementById('adm-jot-sync-now')?.addEventListener('click', async () => {
      SCCR.toast?.('Sincronizando…', 'success', 2000);
      await SCCR.importar?.({ soloNuevas: true });
    });

    document.getElementById('adm-jot-sync-completo')?.addEventListener('click', async () => {
      SCCR.toast?.('Sincronización completa iniciada…', 'success', 2000);
      await SCCR.importar?.({ forzar: true });
      renderJotform();
    });

    document.getElementById('adm-jot-limpiar-cache')?.addEventListener('click', () => {
      SCCR.Importador?.limpiarCache();
      SCCR.toast?.('Caché limpiado. Se descargará en la próxima sync.', 'success');
      renderJotform();
    });

    /* Toggle visibility de API key */
    let keyVisible = false;
    document.getElementById('adm-jot-toggle-key')?.addEventListener('click', () => {
      const input = document.getElementById('adm-jot-apikey');
      if (!input) return;
      keyVisible = !keyVisible;
      input.type = keyVisible ? 'text' : 'password';
      if (keyVisible && _config.jotform_api_key) {
        input.value = _config.jotform_api_key;
      }
    });

    /* Guardar API key */
    document.getElementById('adm-jot-guardar-key')?.addEventListener('click', () => {
      const input = document.getElementById('adm-jot-apikey');
      const key   = input?.value.trim();
      if (!key || key.includes('•')) {
        SCCR.toast?.('Ingresa una API key válida', 'warning');
        return;
      }
      _config.jotform_api_key = key;
      guardarConfig();
      SCCR.Importador?.guardarApiKey(key);
      SCCR.toast?.('API key guardada. Sincronizando…', 'success');
      setTimeout(() => SCCR.importar?.({ forzar: true }), 500);
      renderJotform();
    });

    /* Eliminar API key */
    document.getElementById('adm-jot-eliminar-key')?.addEventListener('click', () => {
      _config.jotform_api_key = '';
      guardarConfig();
      SCCR.Store.remove('jotform_api_key');
      SCCR.toast?.('API key eliminada', 'success');
      renderJotform();
    });
  }


  /* ==========================================================
     6. TAB — USUARIOS
     ========================================================== */
  function renderUsuarios() {
    const el = document.getElementById('adm-contenido');
    if (!el) return;

    el.innerHTML = `

      <div class="flex items-center justify-between mb-5">
        <div>
          <div class="font-semibold" style="font-size:15px;">${_usuarios.length} usuario${_usuarios.length!==1?'s':''} registrado${_usuarios.length!==1?'s':''}</div>
          <div class="text-xs text-secondary mt-1">Gestiona el acceso al sistema</div>
        </div>
        <button class="btn btn-primary" id="adm-usr-nuevo">
          <i data-lucide="user-plus" style="width:15px;height:15px;"></i>
          Nuevo usuario
        </button>
      </div>

      <!-- Descripción de roles -->
      <div class="grid grid-3 mb-5" style="gap:var(--space-4);">
        ${[
          { rol: 'administrador', label: 'Administrador', desc: 'Acceso total al sistema, configuración y usuarios.', icono: 'shield' },
          { rol: 'supervisor',    label: 'Supervisor',    desc: 'Acceso a toda la información comercial y reportes.', icono: 'eye'    },
          { rol: 'vendedor',      label: 'Vendedor',      desc: 'Solo accede a su propia cartera e indicadores.', icono: 'user'   },
        ].map(r => `
          <div style="background:var(--color-bg);border-radius:var(--radius-md);
               padding:var(--space-4);border-left:3px solid var(--color-primary);">
            <div class="flex items-center gap-2 mb-2">
              <i data-lucide="${r.icono}" style="width:16px;height:16px;color:var(--color-primary);"></i>
              <span class="font-semibold" style="font-size:13px;">${r.label}</span>
            </div>
            <p class="text-xs text-secondary">${r.desc}</p>
          </div>`).join('')}
      </div>

      <!-- Tabla de usuarios -->
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Rol</th>
              <th style="text-align:center;">Estado</th>
              <th>Creado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${_usuarios.map(u => `
              <tr>
                <td>
                  <div class="flex items-center gap-3">
                    <div class="header__avatar" style="width:34px;height:34px;font-size:12px;flex-shrink:0;">
                      ${SCCR.Texto.iniciales(u.nombre)}
                    </div>
                    <div>
                      <div class="font-medium" style="font-size:13px;">${SCCR.Texto.escaparHTML(u.nombre)}</div>
                      <div class="text-xs text-secondary">${SCCR.Texto.escaparHTML(u.email || '')}</div>
                    </div>
                  </div>
                </td>
                <td>${SCCR.UI.badge(labelRol(u.rol), badgeRol(u.rol))}</td>
                <td style="text-align:center;">
                  ${u.activo
                    ? SCCR.UI.badge('Activo', 'active')
                    : SCCR.UI.badge('Inactivo', 'inactive')}
                </td>
                <td class="text-secondary" style="font-size:13px;">${SCCR.Fecha.format(u.creado)}</td>
                <td>
                  <div class="table__actions">
                    <button class="btn btn-ghost btn-icon btn-sm"
                      onclick="ModuloAdministracion.editarUsuario(${u.id})">
                      <i data-lucide="pencil" style="width:14px;height:14px;"></i>
                    </button>
                    ${u.id !== 1 ? `
                      <button class="btn btn-ghost btn-icon btn-sm"
                        style="color:var(--color-danger);"
                        onclick="ModuloAdministracion.eliminarUsuario(${u.id})">
                        <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
                      </button>` : ''}
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

    document.getElementById('adm-usr-nuevo')?.addEventListener('click',
      () => abrirModalUsuario(null));
  }

  function labelRol(rol) {
    return { administrador: 'Administrador', supervisor: 'Supervisor', vendedor: 'Vendedor' }[rol] || rol;
  }

  function badgeRol(rol) {
    return { administrador: 'danger', supervisor: 'warning', vendedor: 'active' }[rol] || 'inactive';
  }

  function abrirModalUsuario(id) {
    const usr  = id ? _usuarios.find(u => u.id === id) : null;
    const nuevo = !usr;

    const body = `
      <div style="display:flex;flex-direction:column;gap:var(--space-4);">

        <div class="form-group">
          <label class="form-label">Nombre completo *</label>
          <input type="text" class="form-input" id="usr-f-nombre"
            value="${usr ? SCCR.Texto.escaparHTML(usr.nombre) : ''}"
            placeholder="Ej: María González" />
        </div>

        <div class="form-group">
          <label class="form-label">Correo electrónico</label>
          <input type="email" class="form-input" id="usr-f-email"
            value="${usr ? SCCR.Texto.escaparHTML(usr.email || '') : ''}"
            placeholder="correo@empresa.com" />
        </div>

        <div class="form-group">
          <label class="form-label">Rol *</label>
          <select class="form-select" id="usr-f-rol">
            ${['administrador','supervisor','vendedor'].map(r => `
              <option value="${r}" ${usr?.rol === r ? 'selected' : ''}>
                ${labelRol(r)}
              </option>`).join('')}
          </select>
        </div>

        <div class="form-group">
          <label class="form-label" style="display:flex;align-items:center;gap:var(--space-2);cursor:pointer;">
            <input type="checkbox" id="usr-f-activo"
              ${(usr?.activo !== false) ? 'checked' : ''}
              style="accent-color:var(--color-primary);width:16px;height:16px;" />
            Usuario activo
          </label>
        </div>

        <div id="usr-f-error" class="form-error" style="display:none;"></div>
      </div>`;

    const footer = `
      <button class="btn btn-ghost" onclick="SCCR.closeModal()">Cancelar</button>
      <button class="btn btn-primary" id="usr-f-guardar">
        <i data-lucide="save" style="width:15px;height:15px;"></i>
        ${nuevo ? 'Agregar' : 'Guardar'}
      </button>`;

    SCCR.openModal({
      title: nuevo ? 'Nuevo usuario' : `Editar — ${usr.nombre}`,
      body,
      footer,
    });
    lucide.createIcons();

    document.getElementById('usr-f-guardar')?.addEventListener('click', () => {
      const nombre  = document.getElementById('usr-f-nombre')?.value.trim();
      const email   = document.getElementById('usr-f-email')?.value.trim();
      const rol     = document.getElementById('usr-f-rol')?.value;
      const activo  = document.getElementById('usr-f-activo')?.checked ?? true;
      const errEl   = document.getElementById('usr-f-error');

      if (!nombre) {
        if (errEl) { errEl.textContent = 'El nombre es obligatorio.'; errEl.style.display = 'block'; }
        return;
      }

      if (nuevo) {
        _usuarios.push({
          id:     Date.now(),
          nombre, email, rol, activo,
          creado: new Date().toISOString().split('T')[0],
        });
        SCCR.toast?.('Usuario agregado', 'success');
      } else {
        Object.assign(usr, { nombre, email, rol, activo });
        SCCR.toast?.('Usuario actualizado', 'success');
      }

      guardarUsuarios();
      SCCR.closeModal();
      renderUsuarios();
      lucide.createIcons();
    });
  }

  function eliminarUsuario(id) {
    if (id === 1) { SCCR.toast?.('No puedes eliminar el administrador principal', 'warning'); return; }
    const usr = _usuarios.find(u => u.id === id);
    if (!usr) return;

    SCCR.openModal({
      title: 'Confirmar eliminación',
      body:  `<p class="text-body">¿Eliminar al usuario <strong>${SCCR.Texto.escaparHTML(usr.nombre)}</strong>? Esta acción no se puede deshacer.</p>`,
      footer: `
        <button class="btn btn-ghost" onclick="SCCR.closeModal()">Cancelar</button>
        <button class="btn btn-danger" id="usr-confirmar-eliminar">
          <i data-lucide="trash-2" style="width:15px;height:15px;"></i>
          Eliminar
        </button>`,
    });
    lucide.createIcons();

    document.getElementById('usr-confirmar-eliminar')?.addEventListener('click', () => {
      _usuarios = _usuarios.filter(u => u.id !== id);
      guardarUsuarios();
      SCCR.closeModal();
      SCCR.toast?.('Usuario eliminado', 'success');
      renderUsuarios();
      lucide.createIcons();
    });
  }

  function editarUsuario(id) {
    abrirModalUsuario(id);
  }


  /* ==========================================================
     7. TAB — DATOS
     ========================================================== */
  function renderDatos() {
    const el = document.getElementById('adm-contenido');
    if (!el) return;

    const pedidos   = SCCR.Motor?.pedidos() || [];
    const kpis      = SCCR.Motor?.calcularKPIs();
    const cacheInfo = SCCR.Importador?.estado() || {};

    el.innerHTML = `
      <div style="max-width:640px;display:flex;flex-direction:column;gap:var(--space-5);">

        <!-- Resumen de datos -->
        <div class="card">
          <div class="card__header">
            <span class="card__title">Resumen de datos</span>
          </div>
          <div class="card__body">
            <table class="table">
              <tbody>
                ${[
                  { label: 'Total pedidos importados',   valor: SCCR.Numero.formato(pedidos.length) },
                  { label: 'Pedidos recurrentes',         valor: SCCR.Numero.formato(pedidos.filter(p=>!p.es_nuevo_cliente).length) },
                  { label: 'Pedidos nuevos clientes',     valor: SCCR.Numero.formato(pedidos.filter(p=>p.es_nuevo_cliente).length) },
                  { label: 'Clientes únicos',             valor: SCCR.Numero.formato(kpis?.total_clientes || 0) },
                  { label: 'Vendedores registrados',      valor: SCCR.Numero.formato([...new Set(pedidos.map(p=>p.vendedor))].length) },
                  { label: 'Caché vigente',               valor: cacheInfo.cache_vigente ? 'Sí' : 'No' },
                  { label: 'Última sincronización',       valor: cacheInfo.ultima_sync ? SCCR.Fecha.relativo(cacheInfo.ultima_sync) : 'Nunca' },
                ].map(r => `
                  <tr>
                    <td class="text-secondary" style="font-size:13px;width:240px;">${r.label}</td>
                    <td class="font-medium" style="font-size:13px;">${r.valor}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Exportar datos -->
        <div class="card">
          <div class="card__header">
            <span class="card__title">Exportar datos completos</span>
          </div>
          <div class="card__body" style="display:flex;flex-direction:column;gap:var(--space-3);">
            <p class="text-sm text-secondary">Descarga todos los datos del sistema en formato CSV.</p>
            <div class="flex gap-3 flex-wrap">
              <button class="btn btn-secondary" id="adm-exp-pedidos">
                <i data-lucide="shopping-cart" style="width:14px;height:14px;"></i>
                Todos los pedidos
              </button>
              <button class="btn btn-secondary" id="adm-exp-clientes">
                <i data-lucide="users" style="width:14px;height:14px;"></i>
                Cartera de clientes
              </button>
              <button class="btn btn-secondary" id="adm-exp-vendedores">
                <i data-lucide="user-check" style="width:14px;height:14px;"></i>
                Vendedores
              </button>
            </div>
          </div>
        </div>

        <!-- Importar / Resetear -->
        <div class="card">
          <div class="card__header">
            <span class="card__title">Mantenimiento de datos</span>
          </div>
          <div class="card__body" style="display:flex;flex-direction:column;gap:var(--space-4);">

            <div style="display:flex;align-items:center;justify-content:space-between;
                 padding:var(--space-3) var(--space-4);background:var(--color-bg);border-radius:var(--radius-md);">
              <div>
                <div class="font-medium" style="font-size:13px;">Limpiar caché de pedidos</div>
                <div class="text-xs text-secondary mt-1">Fuerza una nueva descarga desde Jotform.</div>
              </div>
              <button class="btn btn-secondary btn-sm" id="adm-dat-limpiar-cache">
                <i data-lucide="refresh-cw" style="width:13px;height:13px;"></i>
                Limpiar
              </button>
            </div>

            <div style="display:flex;align-items:center;justify-content:space-between;
                 padding:var(--space-3) var(--space-4);background:var(--color-bg);border-radius:var(--radius-md);">
              <div>
                <div class="font-medium" style="font-size:13px;">Limpiar metas guardadas</div>
                <div class="text-xs text-secondary mt-1">Borra todas las metas configuradas localmente.</div>
              </div>
              <button class="btn btn-secondary btn-sm" id="adm-dat-limpiar-metas">
                <i data-lucide="trash-2" style="width:13px;height:13px;"></i>
                Limpiar
              </button>
            </div>

            <div style="display:flex;align-items:center;justify-content:space-between;
                 padding:var(--space-3) var(--space-4);background:var(--color-danger-bg);
                 border-radius:var(--radius-md);border:1px solid var(--color-danger);">
              <div>
                <div class="font-semibold" style="font-size:13px;color:var(--color-danger);">
                  Resetear toda la configuración local
                </div>
                <div class="text-xs text-secondary mt-1">
                  Elimina todo lo guardado en localStorage (metas, config, caché, embudo).
                </div>
              </div>
              <button class="btn btn-danger btn-sm" id="adm-dat-reset-todo">
                <i data-lucide="alert-triangle" style="width:13px;height:13px;"></i>
                Resetear
              </button>
            </div>

          </div>
        </div>

      </div>`;

    /* Exportar */
    document.getElementById('adm-exp-pedidos')?.addEventListener('click',  () => exportarCSV('pedidos'));
    document.getElementById('adm-exp-clientes')?.addEventListener('click', () => exportarCSV('clientes'));
    document.getElementById('adm-exp-vendedores')?.addEventListener('click',() => exportarCSV('vendedores'));

    /* Mantenimiento */
    document.getElementById('adm-dat-limpiar-cache')?.addEventListener('click', () => {
      SCCR.Importador?.limpiarCache();
      SCCR.toast?.('Caché limpiado', 'success');
      renderDatos();
    });

    document.getElementById('adm-dat-limpiar-metas')?.addEventListener('click', () => {
      SCCR.Store.remove('metas_override');
      SCCR.toast?.('Metas limpiadas', 'success');
    });

    document.getElementById('adm-dat-reset-todo')?.addEventListener('click', () => {
      SCCR.openModal({
        title: '⚠️ Confirmar reset total',
        body: `<p class="text-body">¿Seguro que deseas eliminar <strong>toda</strong> la configuración local?
               <br><br>Se borrarán: metas, configuración, caché, embudo y usuarios guardados.
               <br><strong>Esta acción no se puede deshacer.</strong></p>`,
        footer: `
          <button class="btn btn-ghost" onclick="SCCR.closeModal()">Cancelar</button>
          <button class="btn btn-danger" id="adm-confirmar-reset">
            <i data-lucide="alert-triangle" style="width:15px;height:15px;"></i>
            Sí, resetear todo
          </button>`,
      });
      lucide.createIcons();

      document.getElementById('adm-confirmar-reset')?.addEventListener('click', () => {
        SCCR.Store.clear();
        SCCR.closeModal();
        SCCR.toast?.('Sistema reseteado. Recarga la página.', 'success', 5000);
        setTimeout(() => location.reload(), 2000);
      });
    });
  }


  /* ==========================================================
     8. TAB — SISTEMA
     ========================================================== */
  function renderSistema() {
    const el = document.getElementById('adm-contenido');
    if (!el) return;

    const ahora = new Date();

    el.innerHTML = `
      <div style="max-width:640px;display:flex;flex-direction:column;gap:var(--space-5);">

        <!-- Estado del sistema -->
        <div class="card">
          <div class="card__header">
            <span class="card__title">Estado del sistema</span>
            <span class="text-xs text-secondary">${ahora.toLocaleTimeString('es-VE')}</span>
          </div>
          <div class="card__body">
            <div style="display:flex;flex-direction:column;gap:var(--space-3);">
              ${[
                { label: 'Motor de datos',       ok: SCCR.Motor?.estaListo(),       desc: SCCR.Motor?.estaListo() ? `${SCCR.Motor.totalPedidos()} pedidos cargados` : 'No inicializado' },
                { label: 'Importador Jotform',   ok: !!SCCR.Importador,              desc: SCCR.Importador ? 'Módulo cargado' : 'No disponible' },
                { label: 'API de IA',            ok: true,                           desc: 'Claude Sonnet 4.6 — claude.ai' },
                { label: 'Chart.js',             ok: typeof Chart !== 'undefined',   desc: typeof Chart !== 'undefined' ? `v${Chart.version}` : 'No cargado' },
                { label: 'Lucide Icons',         ok: typeof lucide !== 'undefined',  desc: 'Íconos SVG cargados' },
                { label: 'Almacenamiento local', ok: storageDisponible(),            desc: storageDisponible() ? 'Disponible' : 'No disponible' },
              ].map(s => `
                <div style="display:flex;align-items:center;gap:var(--space-3);
                     padding:var(--space-3) var(--space-4);background:var(--color-bg);
                     border-radius:var(--radius-md);">
                  <div style="width:10px;height:10px;border-radius:50%;flex-shrink:0;
                    background:${s.ok ? 'var(--color-connected)' : 'var(--color-danger)'};"></div>
                  <span class="font-medium" style="font-size:13px;flex:1;">${s.label}</span>
                  <span class="text-xs text-secondary">${s.desc}</span>
                </div>`).join('')}
            </div>
          </div>
        </div>

        <!-- Auditoría de sincronizaciones -->
        <div class="card">
          <div class="card__header">
            <span class="card__title">Registro de actividad</span>
          </div>
          <div class="card__body">
            ${renderLogActividad()}
          </div>
        </div>

        <!-- Acerca del sistema -->
        <div class="card">
          <div class="card__header">
            <span class="card__title">Acerca del sistema</span>
          </div>
          <div class="card__body">
            <div style="text-align:center;padding:var(--space-4) 0;">
              <div style="font-size:28px;font-weight:700;color:var(--color-primary);margin-bottom:var(--space-2);">
                SCCR
              </div>
              <div class="font-semibold mb-1">Sistema Comercial Casabe Real</div>
              <div class="text-sm text-secondary mb-4">Versión ${_config.version || '1.0.0'}</div>
              <div class="text-xs text-secondary" style="line-height:1.8;">
                Plataforma integral de gestión comercial, inteligencia de negocios e inteligencia artificial.<br>
                Desarrollada para <strong>Casabe Real</strong>.<br>
                Datos sincronizados desde <strong>Jotform</strong> · IA por <strong>Anthropic Claude</strong>.
              </div>
            </div>
          </div>
        </div>

      </div>`;
  }

  function renderLogActividad() {
    const log = SCCR.Store.get('log_actividad', []);

    if (log.length === 0) {
      return `<p class="text-secondary text-sm text-center" style="padding:var(--space-4);">
        Sin registros de actividad todavía.
      </p>`;
    }

    return `
      <div style="display:flex;flex-direction:column;gap:var(--space-2);">
        ${log.slice(0, 10).map(entry => `
          <div style="display:flex;gap:var(--space-3);font-size:12px;">
            <span class="text-muted" style="white-space:nowrap;min-width:80px;">
              ${SCCR.Fecha.format(entry.fecha, 'hora')}
            </span>
            <span class="text-secondary">${SCCR.Texto.escaparHTML(entry.mensaje)}</span>
          </div>`).join('')}
      </div>`;
  }

  function storageDisponible() {
    try {
      localStorage.setItem('_test', '1');
      localStorage.removeItem('_test');
      return true;
    } catch (_) { return false; }
  }


  /* ==========================================================
     9. EXPORTAR CSV (desde admin)
     ========================================================== */
  function exportarCSV(tipo) {
    let filas, nombre;

    if (tipo === 'pedidos') {
      filas  = SCCR.Motor.exportar('todo');
      nombre = 'todos_los_pedidos';
    } else if (tipo === 'clientes') {
      const todos = SCCR.Motor.rankingClientes('todo');
      filas = todos.map(c => ({
        'Cliente':           c.nombre,
        'RIF':               c.rif || '',
        'Clasificación':     c.clasificacion,
        'Ventas USD':        c.ventas,
        'Pedidos':           c.pedidos,
        'Ticket Promedio':   c.ticket_promedio,
        'Último Pedido':     SCCR.Fecha.format(c.ultimo_pedido),
        'Días Sin Comprar':  c.dias_sin_comprar ?? '',
        'Vendedor':          c.vendedor_principal || '',
      }));
      nombre = 'cartera_clientes';
    } else {
      const todos = SCCR.Motor.rankingVendedores('todo');
      filas = todos.map(v => ({
        'Vendedor':          v.vendedor,
        'Ventas USD':        v.ventas,
        'Pedidos':           v.pedidos,
        'Clientes':          v.clientes,
        'Nuevos':            v.nuevos_clientes,
        'Ticket Promedio':   v.ticket_promedio,
        'Meta USD':          v.meta || 0,
        'Cumplimiento %':    v.cumplimiento ?? '',
      }));
      nombre = 'vendedores';
    }

    if (!filas || filas.length === 0) {
      SCCR.toast?.('Sin datos para exportar', 'warning');
      return;
    }

    const cols = Object.keys(filas[0]);
    const csv  = [cols, ...filas.map(f =>
      cols.map(k => `"${String(f[k] ?? '').replace(/"/g,'""')}"`).join(';')
    )].join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${nombre}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    SCCR.toast?.(`${filas.length} registros exportados`, 'success');
  }


  /* ==========================================================
     API PÚBLICA
     ========================================================== */
  return {
    render,
    editarUsuario,
    eliminarUsuario,
  };

})();

window.SCCR.ModuloAdministracion = ModuloAdministracion;
window.ModuloAdministracion       = ModuloAdministracion;
