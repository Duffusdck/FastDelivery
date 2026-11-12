const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const bcrypt = require('bcryptjs'); 
const jwt = require('jsonwebtoken'); 

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'llave_secreta_firma_jwt_fastdelivery';
if (!process.env.JWT_SECRET) console.warn('Aviso: usando JWT_SECRET por defecto. Defina JWT_SECRET en producción.');

// conexión a SQL Server
const dbConfig = {
    user: process.env.DB_USER || 'AdminFD_2',
    password: process.env.DB_PASSWORD || '123456',
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_NAME || 'FastDelivery',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

const ID_ROL_ADMIN = 101;
const ID_ROL_CLIENTE = 102;
const ID_ROL_OPERADOR = 103;
const ID_ESTADO_ACTIVO = 1;
const ID_ESTADO_INACTIVO = 2; // Estado de baja lógica en Estado_Registro
const ROLES_ADMIN = ['Administrador', 'Admin'];
const ROLES_GESTION = [...ROLES_ADMIN, 'Operador'];

// Crear un pool de conexiones global (Mejora de rendimiento)
// Si la conexión falla se detiene el servidor, en lugar de quedar activo sin base de datos
const poolPromise = new sql.ConnectionPool(dbConfig)
    .connect()
    .then(pool => {
        console.log('Conexión establecida exitosamente con SQL Server');
        return pool;
    })
    .catch(err => {
        console.error('Error de conexión a la BD: ', err);
        process.exit(1);
    });

// ==========================================
// UTILIDADES
// ==========================================

function decodificarToken(req) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return null;
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (err) {
        return null;
    }
}

function errorServidor(res, error, contexto, mensaje) {
    console.error(`Error en ${contexto}:`, error);
    if (error.number === 547) { 
        return res.status(409).json({ mensaje: 'Referencia inválida o el registro tiene datos relacionados.' });
    }
    res.status(500).json({ mensaje });
}

// ==========================================
// MIDDLEWARE: VERIFICAR TOKEN JWT Y ROL
// ==========================================

function verificarToken(req, res, next) {
    if (!req.headers['authorization']) {
        return res.status(401).json({ mensaje: 'Token no proporcionado.' });
    }

    const decoded = decodificarToken(req);
    if (!decoded) {
        // 401 (y no 403) para que el frontend cierre la sesión al expirar el token
        return res.status(401).json({ mensaje: 'Token inválido o expirado.' });
    }

    req.user = decoded; 
    next();
}

// ==========================================
// RASTREO DE GUÍAS
// ==========================================
app.get('/api/rastreo/:guia', async (req, res) => {
    try {
        const pool = await poolPromise;

        const result = await pool.request()
            .input('num_guia', sql.VarChar(50), req.params.guia)
            .query(`
                SELECT TOP 1
                    E.numero_guia,
                    EO.nombre_estado AS estado,
                    H.ubicacion_actual,
                    H.fecha_hora,
                    S.direccion + ', ' + S.ciudad + ', Colombia' AS direccion_origen,
                    E.direccion_destino + ', Colombia' AS direccion_destino
                FROM Envio E
                INNER JOIN Historial_Seguimiento H ON E.id_envio = H.id_envio
                INNER JOIN Estado_Operativo EO ON H.id_estado_operativo = EO.id_estado_operativo
                INNER JOIN Sucursal S ON E.id_sucursal = S.id_sucursal
                WHERE E.numero_guia = @num_guia
                  AND E.id_estado_registro = 1
                ORDER BY H.fecha_hora DESC
            `);

        if (result.recordset.length > 0) {
            res.json(result.recordset[0]);
        } else {
            res.status(404).json({ mensaje: 'No hay información de rastreo para esta guía o fue anulada.' });
        }
    } catch (error) {
        errorServidor(res, error, '/api/rastreo', 'Error interno del servidor.');
    }
});

// ==========================================
// REGISTRO DE USUARIOS
// ==========================================
app.post('/api/registro', async (req, res) => {
    const { nombre, email, password, rol } = req.body;

    if (!nombre || !email || !password) {
        return res.status(400).json({ mensaje: 'Todos los campos son obligatorios.' });
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json({ mensaje: 'Correo electrónico inválido.' });
    }
    if (password.length < 6) {
        return res.status(400).json({ mensaje: 'La contraseña debe tener mínimo 6 caracteres.' });
    }

    const solicitante = decodificarToken(req);
    const esAdmin = solicitante && ROLES_ADMIN.includes(solicitante.rol);

    let idRol = ID_ROL_CLIENTE;
    if (esAdmin) {
        if (rol === 'Administrador' || rol === 'Admin') idRol = ID_ROL_ADMIN;
        else if (rol === 'Operador') idRol = ID_ROL_OPERADOR;
    }

    let tx;
    try {
        const pool = await poolPromise;
        const emailNormalizado = email.trim().toLowerCase();

        // Encriptar contraseña
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // La validación del correo y el cálculo del ID van en una transacción
        // para evitar duplicados si dos registros llegan al mismo tiempo
        tx = new sql.Transaction(pool);
        await tx.begin();

        const checkUser = await new sql.Request(tx)
            .input('email', sql.VarChar, emailNormalizado)
            .query('SELECT id_usuario FROM Usuario WITH (UPDLOCK, HOLDLOCK) WHERE email = @email');

        if (checkUser.recordset.length > 0) {
            await tx.rollback();
            return res.status(409).json({ mensaje: 'El correo electrónico ya está registrado.' });
        }

        const nextIdQuery = await new sql.Request(tx)
            .query('SELECT ISNULL(MAX(id_usuario), 0) + 1 AS NextID FROM Usuario WITH (UPDLOCK, HOLDLOCK)');
        const nextId = nextIdQuery.recordset[0].NextID;

        await new sql.Request(tx)
            .input('id_usuario', sql.Int, nextId)
            .input('id_rol', sql.Int, idRol)
            .input('nombre_usuario', sql.VarChar, nombre.trim())
            .input('email', sql.VarChar, emailNormalizado)
            .input('password_hash', sql.VarChar, hashedPassword)
            .input('id_estado_registro', sql.Int, ID_ESTADO_ACTIVO)
            .query(`
                INSERT INTO Usuario (id_usuario, id_rol, nombre_usuario, email, password_hash, id_estado_registro, fecha_registro)
                VALUES (@id_usuario, @id_rol, @nombre_usuario, @email, @password_hash, @id_estado_registro, GETDATE())
            `);

        await tx.commit();
        res.status(201).json({ mensaje: 'Usuario registrado correctamente.' });
    } catch (error) {
        if (tx) await tx.rollback().catch(() => {});
        errorServidor(res, error, '/api/registro', 'Error interno del servidor al registrar.');
    }
});

// ==========================================
// INICIO DE SESIÓN (LOGIN)
// ==========================================
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ mensaje: 'Correo y contraseña requeridos.' });
    }

    try {
        const pool = await poolPromise;

        // Buscar usuario cruzando con tu tabla de Roles
        const result = await pool.request()
            .input('email', sql.VarChar, email.trim().toLowerCase())
            .query(`
                SELECT U.id_usuario, U.nombre_usuario, U.email, U.password_hash, R.nombre_rol
                FROM Usuario U
                INNER JOIN Rol R ON U.id_rol = R.id_rol
                WHERE U.email = @email AND U.id_estado_registro = 1
            `);

        if (result.recordset.length === 0) {
            return res.status(401).json({ mensaje: 'Credenciales inválidas.' });
        }

        const usuario = result.recordset[0];

        // Verificar la contraseña desencriptando el Hash
        const passwordMatch = await bcrypt.compare(password, usuario.password_hash);

        if (!passwordMatch) {
            return res.status(401).json({ mensaje: 'Credenciales inválidas.' });
        }

        // Generar Token JWT
        const token = jwt.sign(
            { id: usuario.id_usuario, rol: usuario.nombre_rol },
            JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.status(200).json({
            mensaje: 'Autenticación exitosa.',
            token: token,
            usuario: {
                id: usuario.id_usuario,
                nombre: usuario.nombre_usuario,
                email: usuario.email,
                rol: usuario.nombre_rol
            }
        });
    } catch (error) {
        errorServidor(res, error, '/api/login', 'Error interno del servidor.');
    }
});

// ==========================================
// CRUD DE PAQUETES, ENVÍOS, HISTORIAL Y RUTAS
// ==========================================

const TIPOS = {
    int: sql.Int,
    decimal: sql.Decimal(12, 2),
    texto: sql.VarChar,
    fecha: sql.DateTime
};

// Cada entidad define su tabla, clave primaria y columnas editables (lista blanca).
// bajaLogica: usa id_estado_registro en lugar de borrar la fila.
// extraInsert: columnas que se llenan con una expresión SQL al insertar.
const entidades = [
    {
        ruta: 'detalle-paquetes', tabla: 'Detalle_Paquete', pk: 'id_detalle', bajaLogica: true,
        campos: { id_envio: 'int', descripcion: 'texto', peso_kg: 'decimal', alto_cm: 'decimal',
                  ancho_cm: 'decimal', largo_cm: 'decimal', id_estado_registro: 'int' }
    },
    {
        ruta: 'envios', tabla: 'Envio', pk: 'id_envio', bajaLogica: true,
        campos: { id_usuario: 'int', id_sucursal: 'int', numero_guia: 'texto', direccion_destino: 'texto',
                  precio_total: 'decimal', id_estado_operativo: 'int' }
    },
    {
        ruta: 'historial-seguimiento', tabla: 'Historial_Seguimiento', pk: 'id_seguimiento', bajaLogica: false,
        campos: { id_envio: 'int', id_estado_operativo: 'int', ubicacion_actual: 'texto' },
        extraInsert: { fecha_hora: 'GETDATE()' }
    },
    {
        ruta: 'rutas-asignadas', tabla: 'Ruta_Asignada', pk: 'id_ruta', bajaLogica: false,
        campos: { id_envio: 'int', id_vehiculo: 'int', id_rol: 'int', fecha_salida: 'fecha', fecha_estimada: 'fecha' }
    },
    {
    ruta: 'usuarios',tabla: 'Usuario',pk: 'id_usuario',bajaLogica: true,
    campos: {id_rol: 'int', nombre_usuario: 'texto', email: 'texto', telefono: 'texto', id_estado_registro: 'int' }
    }
];

function leerCampos(def, body) {
    const valores = {};
    for (const [campo, tipo] of Object.entries(def.campos)) {
        let v = body[campo];
        if ((v === undefined || v === null || v === '') && campo === 'id_estado_registro') v = ID_ESTADO_ACTIVO;
        if (v === undefined || v === null || v === '') return { error: `El campo ${campo} es obligatorio.` };

        if (tipo === 'int' || tipo === 'decimal') {
            v = Number(v);
            if (!Number.isFinite(v)) return { error: `El campo ${campo} debe ser numérico.` };
        } else if (tipo === 'fecha') {
            v = new Date(v);
            if (isNaN(v)) return { error: `El campo ${campo} no es una fecha válida.` };
        } else {
            v = String(v).trim();
        }
        valores[campo] = v;
    }
    return { valores };
}

entidades.forEach(def => {
    const base = `/api/${def.ruta}`;

    // Listar
    app.get(base, async (req, res) => {
        try {
            const pool = await poolPromise;
            const filtro = def.bajaLogica ? ` WHERE id_estado_registro = ${ID_ESTADO_ACTIVO}` : '';
            const resultado = await pool.request().query(`SELECT * FROM ${def.tabla}${filtro}`);
            res.json(resultado.recordset);
        } catch (error) {
            errorServidor(res, error, `GET ${base}`, 'Error al obtener los registros.');
        }
    });

    // Crear (el ID se calcula dentro de una transacción para evitar duplicados)
    // Si la columna es IDENTITY en la BD, quitar la columna pk del INSERT y el cálculo de nextId
    app.post(base, async (req, res) => {
        const { valores, error } = leerCampos(def, req.body);
        if (error) return res.status(400).json({ mensaje: error });

        let tx;
        try {
            const pool = await poolPromise;
            tx = new sql.Transaction(pool);
            await tx.begin();

            const next = await new sql.Request(tx)
                .query(`SELECT ISNULL(MAX(${def.pk}), 0) + 1 AS NextID FROM ${def.tabla} WITH (UPDLOCK, HOLDLOCK)`);

            const request = new sql.Request(tx).input(def.pk, sql.Int, next.recordset[0].NextID);
            for (const [campo, tipo] of Object.entries(def.campos)) {
                request.input(campo, TIPOS[tipo], valores[campo]);
            }

            const extra = def.extraInsert || {};
            const columnas = [def.pk, ...Object.keys(def.campos), ...Object.keys(extra)];
            const parametros = [`@${def.pk}`, ...Object.keys(def.campos).map(c => `@${c}`), ...Object.values(extra)];

            await request.query(`INSERT INTO ${def.tabla} (${columnas.join(', ')}) VALUES (${parametros.join(', ')})`);
            await tx.commit();
            res.status(201).json({ mensaje: 'Registro creado correctamente.' });
        } catch (err) {
            if (tx) await tx.rollback().catch(() => {});
            errorServidor(res, err, `POST ${base}`, 'Error al crear el registro.');
        }
    });

    // Actualizar
    app.put(`${base}/:id`, async (req, res) => {
        const id = Number.parseInt(req.params.id, 10);
        if (!Number.isInteger(id)) return res.status(400).json({ mensaje: 'ID inválido.' });

        const { valores, error } = leerCampos(def, req.body);
        if (error) return res.status(400).json({ mensaje: error });

        try {
            const pool = await poolPromise;
            const request = pool.request().input('id', sql.Int, id);
            for (const [campo, tipo] of Object.entries(def.campos)) {
                request.input(campo, TIPOS[tipo], valores[campo]);
            }

            const asignaciones = Object.keys(def.campos).map(c => `${c} = @${c}`).join(', ');
            const resultado = await request.query(`UPDATE ${def.tabla} SET ${asignaciones} WHERE ${def.pk} = @id`);

            if (resultado.rowsAffected[0] === 0) {
                return res.status(404).json({ mensaje: 'Registro no encontrado.' });
            }
            res.json({ mensaje: 'Registro actualizado correctamente.' });
        } catch (err) {
            errorServidor(res, err, `PUT ${base}`, 'Error al actualizar el registro.');
        }
    });

    // Eliminar (baja lógica si la tabla tiene id_estado_registro; borrado físico en el resto)
    app.delete(`${base}/:id`, async (req, res) => {
        const id = Number.parseInt(req.params.id, 10);
        if (!Number.isInteger(id)) return res.status(400).json({ mensaje: 'ID inválido.' });

        try {
            const pool = await poolPromise;
            const request = pool.request().input('id', sql.Int, id);
            let consulta;
            if (def.bajaLogica) {
                request.input('id_estado_inactivo', sql.Int, ID_ESTADO_INACTIVO);
                consulta = `UPDATE ${def.tabla} SET id_estado_registro = @id_estado_inactivo WHERE ${def.pk} = @id`;
            } else {
                consulta = `DELETE FROM ${def.tabla} WHERE ${def.pk} = @id`;
            }

            const resultado = await request.query(consulta);
            if (resultado.rowsAffected[0] === 0) {
                return res.status(404).json({ mensaje: 'Registro no encontrado.' });
            }
            res.json({ mensaje: 'Registro eliminado correctamente.' });
        } catch (err) {
            errorServidor(res, err, `DELETE ${base}`, 'Error al eliminar el registro.');
        }
    });
});

// ==========================================
// ARRANQUE DEL SERVIDOR
// ==========================================
const PUERTO = 3000;
app.listen(PUERTO, () => {
    console.log(`Backend de FastDelivery corriendo en http://localhost:${PUERTO}`);
});