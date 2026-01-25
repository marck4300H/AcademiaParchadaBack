// src/routes/categoria.routes.js
import express from 'express';
import { listCategorias } from '../controllers/categoriaController.js';


const router = express.Router();

// Solo lectura
router.get('/', listCategorias);

export default router;
