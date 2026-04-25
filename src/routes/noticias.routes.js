const express = require('express');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/roles');
const resolveMunicipio = require('../middleware/municipio');
const { list, detail, create, update, remove } = require('../controllers/noticias.controller');

const router = express.Router({ mergeParams: true });

router.use(resolveMunicipio);

router.get('/', list);
router.get('/:slug', detail);
router.post('/', auth, requireRole('admin', 'editor'), create);
router.put('/:id', auth, requireRole('admin', 'editor'), update);
router.delete('/:id', auth, requireRole('admin', 'editor'), remove);

module.exports = router;
