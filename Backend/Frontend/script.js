let currentAuthMode = 'login';
let currentUser = null;

const API_URL = 'http://localhost:3000/api';

const ID_KEYS = { paquete: 'id_detalle', envio: 'id_envio', historial: 'id_seguimiento', ruta: 'id_ruta', usuario: 'id_usuario'};
const registros = { paquete: {}, envio: {}, historial: {}, ruta: {} };

// ==========================================
// 0. UTILIDADES
// ==========================================

function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

// fetch autenticado con el token; cierra sesión si el token expiró (401)
async function authFetch(path, options = {}) {
    const res = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
            'Authorization': `Bearer ${localStorage.getItem('LogiSys_Token')}`
        }
    });
    if (res.status === 401) {
        logout();
        throw new Error('Sesión expirada. Inicie sesión nuevamente.');
    }
    return res;
}

// Convierte una fecha ISO (UTC) al formato local de <input type="datetime-local">
function toLocalInput(iso) {
    const d = new Date(iso);
    if (!iso || isNaN(d)) return '';
    return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

// ==========================================
// 1. CONEXIÓN AL BACKEND: REGISTRO
// ==========================================
async function handleRegister(event) {
    event.preventDefault();
    clearErrors();
    hideGlobalAlert();

    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    const confirmPassword = document.getElementById('regConfirmPassword').value;
    let isValid = true;

    if (name.length < 2) { document.getElementById('regNameError').textContent = 'Ingrese su nombre completo.'; isValid = false; }
    if (!/^\S+@\S+\.\S+$/.test(email)) { document.getElementById('regEmailError').textContent = 'Ingrese un correo válido.'; isValid = false; }
    if (password.length < 6) { document.getElementById('regPasswordError').textContent = 'Mínimo 6 caracteres.'; isValid = false; }
    if (password !== confirmPassword) { document.getElementById('regConfirmPasswordError').textContent = 'Las contraseñas no coinciden.'; isValid = false; }

    if (isValid) {
        try {
            const respuesta = await fetch(`${API_URL}/registro`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre: name, email: email, password: password, rol: 'Cliente' })
            });

            const data = await respuesta.json();

            if (!respuesta.ok) {
                throw new Error(data.mensaje || 'Error al registrar');
            }

            showGlobalAlert('¡Registro exitoso! Cuenta creada en la Base de Datos. Por favor, inicia sesión.', 'success');
            document.getElementById('registerForm').reset();

            setTimeout(() => {
                switchAuthTab('login');
            }, 2000);

        } catch (error) {
            showGlobalAlert(error.message, 'error');
        }
    }
}

// ==========================================
// 2. CONEXIÓN AL BACKEND: INICIO DE SESIÓN
// ==========================================
async function handleLogin(event) {
    event.preventDefault();
    clearErrors();
    hideGlobalAlert();

    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    let isValid = true;

    if (!/^\S+@\S+\.\S+$/.test(email)) { document.getElementById('loginEmailError').textContent = 'Ingrese un correo válido.'; isValid = false; }
    if (password.length === 0) { document.getElementById('loginPasswordError').textContent = 'Ingrese su contraseña.'; isValid = false; }

    if (isValid) {
        try {
            const respuesta = await fetch(`${API_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email, password: password })
            });

            const data = await respuesta.json();

            if (!respuesta.ok) {
                throw new Error(data.mensaje || 'Error al iniciar sesión');
            }

            localStorage.setItem('LogiSys_Token', data.token);
            localStorage.setItem('LogiSys_User', JSON.stringify(data.usuario));

            showGlobalAlert('¡Inicio de sesión exitoso! Verificando credenciales...', 'success');

            // La redirección va dentro del timeout para que el mensaje alcance a mostrarse
            setTimeout(() => {
                window.location.href = 'admin.html';
            }, 1200);

        } catch (error) {
            showGlobalAlert(error.message, 'error');
        }
    }
}

// ==========================================
// 3. FUNCIONES DE INTERFAZ Y DASHBOARD
// ==========================================

function loginUserSession(usuarioDB) {
    currentUser = usuarioDB;

    document.getElementById('headerStatus').textContent = 'Estado: Autenticado (SSL Activo)';
    document.getElementById('userProfileArea').classList.remove('hidden');
    document.getElementById('userNameDisplay').textContent = currentUser.nombre;
    document.getElementById('welcomeUserName').textContent = currentUser.nombre;

    const statCards = document.querySelectorAll('.stat-card p');
    if (statCards.length >= 2) {
        statCards[1].textContent = currentUser.rol;
    }

    const navDash = document.getElementById('navDashboard');
    if (navDash) {
        navDash.style.opacity = '1';
        navDash.style.pointerEvents = 'auto';
    }

    switchView('dashboard');
}

function switchAuthTab(mode) {
    currentAuthMode = mode;
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const tabs = document.querySelectorAll('.auth-tab');

    tabs.forEach(t => t.classList.remove('active'));
    hideGlobalAlert();
    clearErrors();

    if (mode === 'login') {
        tabs[0].classList.add('active');
        loginForm.classList.remove('hidden');
        registerForm.classList.add('hidden');
    } else {
        tabs[1].classList.add('active');
        registerForm.classList.remove('hidden');
        loginForm.classList.add('hidden');
    }
}

function clearErrors() {
    document.querySelectorAll('.error-message').forEach(el => el.textContent = '');
}

function hideGlobalAlert() {
    const alertBox = document.getElementById('globalAlert');
    if (!alertBox) return;
    alertBox.style.display = 'none';
    alertBox.className = 'alert-msg';
}

function showGlobalAlert(message, type = 'success') {
    const alertBox = document.getElementById('globalAlert');
    if (!alertBox) return;
    alertBox.textContent = message;
    alertBox.className = `alert-msg alert-${type}`;
    alertBox.style.display = 'block';
}

function logout() {
    currentUser = null;
    localStorage.removeItem('LogiSys_Token');
    localStorage.removeItem('LogiSys_User');
    window.location.href = 'registro.html';
}

// Alterna entre las vistas: auth, dashboard y admin
function switchView(viewName) {
    const authView = document.getElementById('authView');
    const dashboardView = document.getElementById('dashboardView');
    const adminView = document.getElementById('adminView');
    const menuLinks = document.querySelectorAll('#sideMenu a');

    menuLinks.forEach(link => link.classList.remove('active'));
    authView?.classList.add('hidden');
    dashboardView?.classList.add('hidden');
    adminView?.classList.add('hidden');

    if (viewName === 'auth') {
        authView?.classList.remove('hidden');
        menuLinks[0]?.classList.add('active');
    } else if (viewName === 'dashboard') {
        dashboardView?.classList.remove('hidden');
        document.getElementById('navDashboard')?.classList.add('active');
    } else if (viewName === 'admin') {
        adminView?.classList.remove('hidden');
        loadUsers();
    }
}

function showInfoBox() {
    alert('LogiSys Portal v1.0. Sistema conectado a SQL Server.');
}

// ==========================================
// CONTROL DE PESTAÑAS DEL PANEL DE ADMIN
// ==========================================
function switchAdminTab(evt, tabId) {
    const contents = document.querySelectorAll('.tab-content');
    contents.forEach(content => content.classList.remove('active'));

    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => btn.classList.remove('active'));

    document.getElementById(tabId).classList.add('active');
    evt.currentTarget.classList.add('active');

    if (tabId === 'tabUsuarios') loadUsers();
    if (tabId === 'tabPaquetes') loadPackages();
    if (tabId === 'tabEnvios') loadShipments();
    if (tabId === 'tabHistorial') loadHistory();
    if (tabId === 'tabRutas') loadRoutes();
}

// ==========================================
// 1. USUARIOS
// ==========================================
async function loadUsers() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Cargando usuarios...</td></tr>';

    try {
        const res = await authFetch('/usuarios');
        if (!res.ok) throw new Error('Respuesta no válida del servidor');

        const data = await res.json();
        tbody.innerHTML = '';

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No hay usuarios registrados.</td></tr>';
            return;
        }

        registros.usuario = Object.fromEntries(data.map(i => [i.id_usuario, i]));

        data.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${esc(item.id_usuario)}</td>
                <td>${esc(item.id_rol)}</td>
                <td>${esc(item.nombre_usuario)}</td>
                <td>${esc(item.email)}</td>
                <td>${esc(item.telefono)}</td>
                <td>${esc(item.id_estado_registro)}</td>
                    <button class="btn-mapa" onclick="editRecord('usuario', ${Number(item.id_usuario)})">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn-delete" onclick="deleteRecord('usuarios', ${Number(item.id_usuario)}, loadUsers)">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch (error) {
        console.error('Error al cargar usuarios:', error);
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:red;">Error al cargar los usuarios.</td></tr>';
    }
}

// ==========================================
// 2. DETALLE PAQUETES 
// ==========================================
async function loadPackages() {
    const tbody = document.getElementById('packagesTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Cargando detalle de paquetes...</td></tr>';

    try {
        const res = await authFetch('/detalle-paquetes');
        if (!res.ok) throw new Error('Respuesta no válida del servidor');
        const data = await res.json();
        tbody.innerHTML = '';

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No hay paquetes registrados.</td></tr>';
            return;
        }

        registros.paquete = Object.fromEntries(data.map(i => [i.id_detalle, i]));

        data.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${esc(item.id_detalle)}</td>
                <td>${esc(item.id_envio)}</td>
                <td>${esc(item.descripcion)}</td>
                <td>${esc(item.peso_kg)} kg</td>
                <td>${esc(item.alto_cm)} x ${esc(item.ancho_cm)} x ${esc(item.largo_cm)} cm</td>
                <td>${esc(item.id_estado_registro)}</td>
                <td>
                    <button class="btn-mapa" onclick="editRecord('paquete', ${Number(item.id_detalle)})"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-delete" onclick="deleteRecord('detalle-paquetes', ${Number(item.id_detalle)}, loadPackages)"><i class="fa-solid fa-trash"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:red;">Error al cargar los paquetes.</td></tr>';
    }
}

// ==========================================
// 3. ENVÍOS 
// ==========================================
async function loadShipments() {
    const tbody = document.getElementById('shipmentsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Cargando envíos...</td></tr>';

    try {
        const res = await authFetch('/envios');
        if (!res.ok) throw new Error('Respuesta no válida del servidor');
        const data = await res.json();
        tbody.innerHTML = '';

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No hay envíos registrados.</td></tr>';
            return;
        }

        registros.envio = Object.fromEntries(data.map(i => [i.id_envio, i]));

        data.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${esc(item.id_envio)}</td>
                <td>${esc(item.id_usuario)}</td>
                <td>${esc(item.id_sucursal)}</td>
                <td><b>${esc(item.numero_guia)}</b></td>
                <td>${esc(item.direccion_destino)}</td>
                <td>$${Number(item.precio_total).toFixed(2)}</td>
                <td><span class="badge-role">${esc(item.id_estado_operativo)}</span></td>
                <td>
                    <button class="btn-mapa" onclick="editRecord('envio', ${Number(item.id_envio)})"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-delete" onclick="deleteRecord('envios', ${Number(item.id_envio)}, loadShipments)"><i class="fa-solid fa-trash"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:red;">Error al cargar los envíos.</td></tr>';
    }
}

// ==========================================
// 4. HISTORIAL DE SEGUIMIENTO 
// ==========================================
async function loadHistory() {
    const tbody = document.getElementById('historyTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Cargando historial...</td></tr>';

    try {
        const res = await authFetch('/historial-seguimiento');
        if (!res.ok) throw new Error('Respuesta no válida del servidor');
        const data = await res.json();
        tbody.innerHTML = '';

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No hay registros en el historial.</td></tr>';
            return;
        }

        registros.historial = Object.fromEntries(data.map(i => [i.id_seguimiento, i]));

        data.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${esc(item.id_seguimiento)}</td>
                <td>${esc(item.id_envio)}</td>
                <td>${esc(item.id_estado_operativo)}</td>
                <td>${esc(item.ubicacion_actual)}</td>
                <td>${item.fecha_hora ? new Date(item.fecha_hora).toLocaleString() : '-'}</td>
                <td>
                    <button class="btn-mapa" onclick="editRecord('historial', ${Number(item.id_seguimiento)})"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-delete" onclick="deleteRecord('historial-seguimiento', ${Number(item.id_seguimiento)}, loadHistory)"><i class="fa-solid fa-trash"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:red;">Error al cargar el historial.</td></tr>';
    }
}

// ==========================================
// 5. RUTAS ASIGNADAS 
// ==========================================
async function loadRoutes() {
    const tbody = document.getElementById('routesTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Cargando rutas...</td></tr>';

    try {
        const res = await authFetch('/rutas-asignadas');
        if (!res.ok) throw new Error('Respuesta no válida del servidor');
        const data = await res.json();
        tbody.innerHTML = '';

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No hay rutas asignadas.</td></tr>';
            return;
        }

        registros.ruta = Object.fromEntries(data.map(i => [i.id_ruta, i]));

        data.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${esc(item.id_ruta)}</td>
                <td>${esc(item.id_envio)}</td>
                <td>${esc(item.id_vehiculo)}</td>
                <td>${esc(item.id_rol)}</td>
                <td>${item.fecha_salida ? new Date(item.fecha_salida).toLocaleString() : '-'}</td>
                <td>${item.fecha_estimada ? new Date(item.fecha_estimada).toLocaleString() : '-'}</td>
                <td>
                    <button class="btn-mapa" onclick="editRecord('ruta', ${Number(item.id_ruta)})"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-delete" onclick="deleteRecord('rutas-asignadas', ${Number(item.id_ruta)}, loadRoutes)"><i class="fa-solid fa-trash"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:red;">Error al cargar las rutas.</td></tr>';
    }
}

// ==========================================
// GESTIÓN DE MODALES (CREAR / EDITAR)
// ==========================================

// Abre el modal de edición con el registro cacheado
function editRecord(entity, id) {
    const titles = { paquete: 'Editar Paquete', envio: 'Editar Envío', historial: 'Editar Historial', ruta: 'Editar Ruta', usuario: 'Editar Usuario' };
    openModal(titles[entity], entity, registros[entity][id] || {});
}

function openModal(title, entity, data = {}) {
    document.getElementById('modalTitle').innerText = title;
    document.getElementById('modalEntity').value = entity;
    // Cada entidad usa su propia clave primaria (antes se tomaba id_envio por error en historial y rutas)
    document.getElementById('modalId').value = data[ID_KEYS[entity]] ?? '';

    const container = document.getElementById('modalFields');
    let fieldsConfig = [];

    if (entity === 'paquete') {
        fieldsConfig = [
            { name: 'id_envio', label: 'ID Envío', type: 'number', val: data.id_envio ?? '' },
            { name: 'descripcion', label: 'Descripción', type: 'text', val: data.descripcion ?? '' },
            { name: 'peso_kg', label: 'Peso (kg)', type: 'number', step: '0.01', val: data.peso_kg ?? '' },
            { name: 'alto_cm', label: 'Alto (cm)', type: 'number', val: data.alto_cm ?? '' },
            { name: 'ancho_cm', label: 'Ancho (cm)', type: 'number', val: data.ancho_cm ?? '' },
            { name: 'largo_cm', label: 'Largo (cm)', type: 'number', val: data.largo_cm ?? '' },
            { name: 'id_estado_registro', label: 'Estado Registro', type: 'number', val: data.id_estado_registro ?? 1 }
        ];
    } else if (entity === 'envio') {
        fieldsConfig = [
            { name: 'id_usuario', label: 'ID Usuario', type: 'number', val: data.id_usuario ?? '' },
            { name: 'id_sucursal', label: 'ID Sucursal', type: 'number', val: data.id_sucursal ?? '' },
            { name: 'numero_guia', label: 'N° Guía', type: 'text', val: data.numero_guia ?? '' },
            { name: 'direccion_destino', label: 'Dirección Destino', type: 'text', val: data.direccion_destino ?? '' },
            { name: 'precio_total', label: 'Precio Total', type: 'number', step: '0.01', val: data.precio_total ?? '' },
            { name: 'id_estado_operativo', label: 'Estado Operativo', type: 'number', val: data.id_estado_operativo ?? 1 }
        ];
    } else if (entity === 'historial') {
        fieldsConfig = [
            { name: 'id_envio', label: 'ID Envío', type: 'number', val: data.id_envio ?? '' },
            { name: 'id_estado_operativo', label: 'Estado Operativo', type: 'number', val: data.id_estado_operativo ?? '' },
            { name: 'ubicacion_actual', label: 'Ubicación Actual', type: 'text', val: data.ubicacion_actual ?? '' }
        ];
    } else if (entity === 'ruta') {
        fieldsConfig = [
            { name: 'id_envio', label: 'ID Envío', type: 'number', val: data.id_envio ?? '' },
            { name: 'id_vehiculo', label: 'ID Vehículo', type: 'number', val: data.id_vehiculo ?? '' },
            { name: 'id_rol', label: 'ID Rol', type: 'number', val: data.id_rol ?? '' },
            { name: 'fecha_salida', label: 'Fecha Salida', type: 'datetime-local', val: toLocalInput(data.fecha_salida) },
            { name: 'fecha_estimada', label: 'Fecha Estimada', type: 'datetime-local', val: toLocalInput(data.fecha_estimada) }
        ];
    } else if (entity === 'usuario') {
        fieldsConfig = [
            { name: 'id_rol', label: 'ID Rol', type: 'number', val: data.id_rol ?? '' },
            { name: 'nombre_usuario', label: 'Nombre de Usuario', type: 'text', val: data.nombre_usuario ?? '' },
            { name: 'email', label: 'Correo Electrónico', type: 'email', val: data.email ?? '' },
            { name: 'telefono', label: 'Teléfono', type: 'text', val: data.telefono ?? '' },
            { name: 'id_estado_registro', label: 'Estado', type: 'number', val: data.id_estado_registro ?? '' }
    ];
}

    container.innerHTML = fieldsConfig.map(f => `
        <div class="form-group">
            <label>${esc(f.label)}</label>
            <input type="${f.type}" name="${f.name}" step="${f.step || 'any'}" value="${esc(f.val)}" class="search-box" style="width:100%; padding:8px;" required>
        </div>
    `).join('');

    document.getElementById('genericModal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('genericModal').style.display = 'none';
}

async function handleFormSubmit(event) {
    event.preventDefault();
    const entity = document.getElementById('modalEntity').value;
    const id = document.getElementById('modalId').value;

    const form = document.getElementById('genericForm');
    const data = {};
    // Los campos numéricos se envían como número, no como texto
    new FormData(form).forEach((value, key) => {
        data[key] = form.elements[key].type === 'number' ? Number(value) : value;
    });

    const endpoints = {
        'paquete': '/detalle-paquetes',
        'envio': '/envios',
        'historial': '/historial-seguimiento',
        'ruta': '/rutas-asignadas',
        'usuario': '/usuarios'
    };

    const path = endpoints[entity];
    const method = id ? 'PUT' : 'POST';
    const url = id ? `${path}/${id}` : path;

    try {
        const response = await authFetch(url, { method: method, body: JSON.stringify(data) });

        const resData = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(resData.mensaje || 'Error al guardar');

        alert('Operación exitosa');
        closeModal();

        if (entity === 'paquete') loadPackages();
        if (entity === 'envio') loadShipments();
        if (entity === 'historial') loadHistory();
        if (entity === 'ruta') loadRoutes();
        if (entity === 'usuario') loadUsers();
        
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

// Función genérica de borrado
async function deleteRecord(endpoint, id, reloadCallback) {
    if (!confirm('¿Está seguro de eliminar este registro?')) return;
    try {
        const res = await authFetch(`/${endpoint}/${id}`, { method: 'DELETE' });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.mensaje || 'No se pudo eliminar');
        }
        alert('Eliminado correctamente');
        reloadCallback();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

// Accesos directos para botones "Nuevo"
function openPackageModal() { openModal("Registrar Paquete", "paquete"); }
function openShipmentModal() { openModal("Registrar Envío", "envio"); }
function openHistoryModal() { openModal("Registrar Historial", "historial"); }
function openRouteModal() { openModal("Asignar Ruta", "ruta"); }