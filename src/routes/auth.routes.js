import express from 'express';
import { register, login, logout, getMe, loginGoogle } from '../controllers/authController.js';
import { registerValidator, loginValidator, validate } from '../validators/authValidator.js';
import { authenticate } from '../middlewares/auth.js';
import { forgotPassword, resetPassword } from '../controllers/passwordResetController.js';

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
 * @route   POST /api/auth/google
 * @desc    Login/Registro con Google (solo estudiante) usando Supabase access_token
 * @access  Public
 * Body: { access_token }
 */
router.post('/google', loginGoogle);

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

router.post('/forgot-password', forgotPassword);

router.post('/reset-password', resetPassword);

export default router;
