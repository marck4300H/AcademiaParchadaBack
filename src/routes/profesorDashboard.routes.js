// src/routes/profesorDashboard.routes.js
import express from 'express';
import { authenticate, authorize } from '../middlewares/auth.js';

import { getMisClasesProfesor, getMisCursosProfesor } from '../controllers/profesorDashboardController.js';
import { getInscritosCursoProfesor, getDetalleSesionProfesor } from '../controllers/profesorExtraController.js';

import profesorHorariosRoutes from './profesorHorarios.routes.js';
import profesorAsignaturasRoutes from './profesorAsignaturas.routes.js';
import profesorPerfilRoutes from './profesorPerfil.routes.js';

const router = express.Router();

// Gate global: todo /api/profesor requiere profesor
router.use(authenticate, authorize('profesor'));

// CU-040 / CU-042 (sesiones)
router.get('/clases', getMisClasesProfesor);
router.get('/clases/:sesionId', getDetalleSesionProfesor);

// CU-041 / CU-042 (cursos)
router.get('/cursos', getMisCursosProfesor);
router.get('/cursos/:cursoId/inscritos', getInscritosCursoProfesor);

// CU-043 (horarios propios)
router.use('/horarios', profesorHorariosRoutes);

// CU-044 (asignaturas que imparto)
router.use('/asignaturas', profesorAsignaturasRoutes);

// CU-045 (perfil profesor)
router.use('/perfil', profesorPerfilRoutes);

export default router;
