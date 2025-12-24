import express from 'express';
import { register, login, logout, getMe } from '../controllers/authController.js';
import { registerValidator, loginValidator, validate } from '../validators/authValidator.js';
import { authenticate } from '../middlewares/auth.js';

const router = express.Router();

/**
 * @route   POST /api/auth/register
 * @desc    Registrar nuevo usuario (estudiante)
 * @access  Public
 */
router.post('/register', registerValidator, validate, register);

/**
 * @route   POST /api/auth/login
 * @desc    Iniciar sesión
 * @access  Public
 */
router.post('/login', loginValidator, validate, login);

/**
 * @route   POST /api/auth/logout
 * @desc    Cerrar sesión
 * @access  Private
 */
router.post('/logout', authenticate, logout);

/**
 * @route   GET /api/auth/me
 * @desc    Obtener usuario actual
 * @access  Private
 */
router.get('/me', authenticate, getMe);

export default router;
