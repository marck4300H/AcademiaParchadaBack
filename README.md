# Backend - Plataforma de Cursos y Clases Personalizadas

Backend desarrollado con Node.js, Express y Supabase para una plataforma educativa que permite gestionar cursos, clases personalizadas y profesores.

## 🚀 Tecnologías

- **Node.js** - Entorno de ejecución
- **Express** - Framework web
- **Supabase** - Base de datos PostgreSQL
- **JWT** - Autenticación
- **Resend** - Envío de correos
- **Cloudinary** - Almacenamiento de videos y archivos
- **Bcrypt** - Encriptación de contraseñas

## 📋 Requisitos Previos

- Node.js >= 18.x
- Cuenta en Supabase
- Cuenta en Resend
- Cuenta en Cloudinary

## 🔧 Instalación

1. **Clonar el repositorio o navegar al directorio del backend**

```bash
cd backend
```

2. **Instalar dependencias**

```bash
npm install
```

3. **Configurar variables de entorno**

Copia el archivo `.env.example` a `.env` y completa las variables:

```bash
cp .env.example .env
```

Edita el archivo `.env` con tus credenciales:

- **SUPABASE_URL**: URL de tu proyecto en Supabase (Project Settings > API > Project URL)
- **SUPABASE_ANON_KEY**: Clave anónima de Supabase (Project Settings > API > anon/public key)
- **SUPABASE_SERVICE_ROLE_KEY**: Clave de servicio (Project Settings > API > service_role key)
- **JWT_SECRET**: Una cadena secreta para firmar tokens (genera una aleatoria)
- **RESEND_API_KEY**: Tu API key de Resend
- **CLOUDINARY_***: Credenciales de Cloudinary (Dashboard > Account Details)

4. **Crear la base de datos**

Ejecuta el script SQL `create_database.sql` en el SQL Editor de Supabase.

## ▶️ Ejecutar el Proyecto

### Modo desarrollo (con nodemon - reinicio automático)
```bash
npm run dev
```

### Modo producción
```bash
npm start
```

El servidor estará disponible en: `http://localhost:5000`

## 🧪 Verificar Instalación

Visita las siguientes rutas en tu navegador o con Postman:

- **`GET /`** - Mensaje de bienvenida
- **`GET /health`** - Verifica que el servidor y Supabase estén funcionando

Si ves un mensaje de éxito en `/health`, ¡todo está funcionando correctamente!

## 📁 Estructura del Proyecto

```
backend/
├── src/
│   ├── config/           # Configuraciones (Supabase, Cloudinary, Resend)
│   │   ├── supabase.js
│   │   ├── cloudinary.js
│   │   └── resend.js
│   ├── controllers/      # Lógica de negocio (próximamente)
│   ├── routes/           # Rutas de la API (próximamente)
│   ├── middlewares/      # Middlewares personalizados (próximamente)
│   ├── utils/            # Funciones auxiliares (próximamente)
│   └── server.js         # Punto de entrada de la aplicación
├── .env                  # Variables de entorno (NO subir a Git)
├── .env.example          # Ejemplo de variables de entorno
├── .gitignore           # Archivos ignorados por Git
├── package.json         # Dependencias del proyecto
└── README.md            # Este archivo
```

## 🔐 Seguridad

- Nunca subas el archivo `.env` a Git
- Usa contraseñas seguras para JWT_SECRET
- Mantén tus API keys seguras
- El archivo `.gitignore` ya está configurado para proteger información sensible

## 🚢 Deploy en Render

1. Conecta tu repositorio a Render
2. Configura las variables de entorno en el dashboard de Render
3. Render detectará automáticamente que es un proyecto Node.js
4. El comando de inicio será: `npm start`

## 📝 Próximos Pasos

- [ ] Crear rutas de autenticación
- [ ] Implementar controladores para cursos
- [ ] Agregar middleware de autenticación JWT
- [ ] Crear endpoints para clases personalizadas
- [ ] Implementar sistema de pagos
- [ ] Configurar envío de correos
- [ ] Agregar algoritmo de asignación de profesores

## 🐛 Problemas Comunes

**Error de conexión a Supabase:**
- Verifica que las URLs y keys en `.env` sean correctas
- Revisa que el proyecto de Supabase esté activo

**Puerto ya en uso:**
- Cambia el `PORT` en el archivo `.env`
- O detén el proceso que está usando el puerto 5000

## 📧 Soporte

Si tienes problemas, revisa:
1. Que todas las dependencias estén instaladas
2. Que las variables de entorno estén configuradas
3. Que la base de datos en Supabase esté creada
4. Los logs del servidor en la consola
