import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { supabase } from './config/supabase.js';

// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ 
    message: 'API de Plataforma de Cursos - Funcionando correctamente',
    version: '1.0.0'
  });
});

// Ruta de health check y prueba de conexión a Supabase
app.get('/health', async (req, res) => {
  try {
    // Intentar hacer una query simple a Supabase
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

// TODO: Importar y usar rutas aquí
// import authRoutes from './routes/auth.routes.js';
// import cursoRoutes from './routes/curso.routes.js';
// app.use('/api/auth', authRoutes);
// app.use('/api/cursos', cursoRoutes);

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
});

export default app;
