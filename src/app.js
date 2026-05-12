require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const { AppError } = require('./utils/errors');
const authRoutes = require('./routes/auth.routes');
const municipiosRoutes = require('./routes/municipios.routes');
const noticiasRoutes = require('./routes/noticias.routes');
const imagenesRoutes = require('./routes/imagenes.routes');
const documentosRoutes = require('./routes/documentos.routes');
const heroRoutes = require('./routes/hero.routes');

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

app.get('/', (req, res) => {
  res.json({ name: 'CMS Municipal API', version: '1.0.0', status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/municipios', municipiosRoutes);
app.use('/api/municipios/:municipio/noticias', noticiasRoutes);
app.use('/api/municipios/:municipio/imagenes', imagenesRoutes);
app.use('/api/municipios/:municipio/documentos', documentosRoutes);
app.use('/api/municipios/:municipio/hero', heroRoutes);

app.use((req, res, next) => {
  res.status(404).json({ error: 'Ruta no encontrada', path: req.originalUrl });
});

app.use((err, req, res, next) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message, code: err.code });
  }

  if (err && err.code && typeof err.code === 'string' && err.code.startsWith('P')) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Violacion de restriccion unica', code: err.code, meta: err.meta });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Registro no encontrado', code: err.code });
    }
  }

  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`CMS Municipal API escuchando en http://localhost:${PORT}`);
  });
}

module.exports = app;
