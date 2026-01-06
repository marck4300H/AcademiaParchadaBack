import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { supabase } from './config/supabase.js';
import authRoutes from './routes/auth.routes.js';
import asignaturaRoutes from './routes/asignatura.routes.js';
import profesorRoutes from './routes/profesor.routes.js'
import franjaHorariaRoutes from './routes/franjaHoraria.routes.js'  
import clasePersonalizadaRoutes from './routes/clasePersonalizadaRoutes.js'
import cursoRoutes from './routes/cursoRoutes.js'
import compraRoutes from './routes/compra.routes.js'
import paqueteHorasRoutes from './routes/paqueteHoras.routes.js'
import pagosRoutes from './routes/pagos.routes.js'
import estudianteRoutes from './routes/estudiante.routes.js';

// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================
// CONFIGURACIÓN DE CORS - CORREGIDA
// ============================================
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'https://frontend-academic.vercel.app'
];

const corsOptions = {
  origin: function (origin, callback) {
    // Permitir requests sin origin (Postman, apps móviles)
    if (!origin) {
      return callback(null, true);
    }
    
    // Verificar si el origin está en la lista permitida
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // Rechazar otros origins
    return callback(new Error('No permitido por CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  exposedHeaders: ['Content-Length', 'X-Request-Id'],
  maxAge: 86400, // 24 horas
  optionsSuccessStatus: 200 // Para navegadores legacy
};

// Aplicar CORS ANTES de cualquier otra cosa
app.use(cors(corsOptions));

// Manejar preflight requests explícitamente
app.options('*', cors(corsOptions));

// ============================================
// MIDDLEWARES
// ============================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================
// RUTAS DE PRUEBA
// ============================================
app.get('/', (req, res) => {
  res.json({ 
    message: 'API de Plataforma de Cursos - Funcionando correctamente',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('usuario')
      .select('count')
      .limit(1);

    if (error) throw error;

    res.json({ 
      status: 'OK',
      message: 'Servidor y base de datos funcionando correctamente',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'ERROR',
      message: 'Error al conectar con la base de datos',
      error: error.message 
    });
  }
});

// ============================================
// RUTAS DE LA API
// ============================================
app.use('/api/auth', authRoutes);
app.use('/api/asignaturas', asignaturaRoutes);
app.use('/api/profesores', profesorRoutes);
app.use('/api/franjas-horarias', franjaHorariaRoutes);
app.use('/api/clases-personalizadas', clasePersonalizadaRoutes);
app.use('/api/cursos', cursoRoutes);
app.use('/api/compras', compraRoutes);
app.use('/api/paquetes-horas', paqueteHorasRoutes);
app.use('/api/pagos', pagosRoutes);
app.use('/api/estudiante', estudianteRoutes);


// ============================================
// MANEJO DE RUTAS NO ENCONTRADAS
// ============================================
app.use((req, res) => {
  res.status(404).json({ 
    message: 'Ruta no encontrada',
    path: req.path 
  });
});

// ============================================
// MANEJO DE ERRORES GLOBAL
// ============================================
app.use((err, req, res, next) => {
  // Error de CORS
  if (err.message === 'No permitido por CORS') {
    return res.status(403).json({
      success: false,
      message: 'Origen no permitido por política CORS',
      origin: req.headers.origin
    });
  }

  console.error('Error:', err);
  res.status(err.status || 500).json({
    message: err.message || 'Error interno del servidor',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ============================================
// INICIAR SERVIDOR
// ============================================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Servidor corriendo en puerto ${PORT}`);
  console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`🌐 CORS habilitado para:`);
  allowedOrigins.forEach(origin => console.log(`   - ${origin}`));
});

export default app;