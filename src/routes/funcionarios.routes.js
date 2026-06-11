const express = require('express');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/roles');
const resolveMunicipio = require('../middleware/municipio');
const assertSameTenant = require('../middleware/assertSameTenant');
const { upload } = require('../config/cloudinary');
const {
  list,
  detail,
  create,
  update,
  replaceFoto,
  remove,
} = require('../controllers/funcionarios.controller');

const router = express.Router({ mergeParams: true });

router.use(resolveMunicipio);

router.get('/', list);
router.get('/:id', detail);
router.post('/', auth, requireRole('admin', 'editor'), assertSameTenant, upload.single('archivo'), create);
router.put('/:id', auth, requireRole('admin', 'editor'), assertSameTenant, update);
router.put('/:id/foto', auth, requireRole('admin', 'editor'), assertSameTenant, upload.single('archivo'), replaceFoto);
router.delete('/:id', auth, requireRole('admin', 'editor'), assertSameTenant, remove);

module.exports = router;
