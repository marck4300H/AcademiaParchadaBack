import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { supabase } from './config/supabase.js';
import authRoutes from './routes/auth.routes.js';
import asignaturaRoutes from './routes/asignatura.routes.js'

// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Configuración de CORS - ACTUALIZADO
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5174',
  'https://frontend-academic.vercel.app'
];

app.use(cors({
  origin: function (origin, callback) {
    // Permitir requests sin origin (como Postman, apps móviles, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('No permitido por CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ 
    message: 'API de Plataforma de Cursos - Funcionando correctamente',
    version: '1.0.0'
  });
});

// Ruta de health check
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

// Rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/asignaturas', asignaturaRoutes);

// Manejo de rutas no encontradas
app.use((req, res) => {
  res.status(404).json({ 
    message: 'Ruta no encontrada',
    path: req.path 
  });
});

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    message: err.message || 'Error interno del servidor',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en puerto ${PORT}`);
  console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`🌐 CORS habilitado para: ${allowedOrigins.join(', ')}`);
});

export default app;
