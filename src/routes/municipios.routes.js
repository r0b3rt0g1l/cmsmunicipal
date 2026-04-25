const express = require('express');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/roles');
const { list, detail, create, update } = require('../controllers/municipios.controller');

const router = express.Router();

router.get('/', list);
router.get('/:slug', detail);
router.post('/', auth, requireRole('admin'), create);
router.put('/:slug', auth, requireRole('admin'), update);

module.exports = router;
