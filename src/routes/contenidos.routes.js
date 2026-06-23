const express = require('express');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/roles');
const resolveMunicipio = require('../middleware/municipio');
const assertSameTenant = require('../middleware/assertSameTenant');
const { upload } = require('../config/cloudinary');
const {
  list,
  getByClave,
  upsertByClave,
  remove,
} = require('../controllers/contenidos.controller');

const router = express.Router({ mergeParams: true });

router.use(resolveMunicipio);

router.get('/', list);
router.get('/:clave', getByClave);
router.put(
  '/:clave',
  auth,
  requireRole('admin', 'editor'),
  assertSameTenant,
  upload.single('archivo'),
  upsertByClave,
);
router.delete('/:clave', auth, requireRole('admin', 'editor'), assertSameTenant, remove);

module.exports = router;
