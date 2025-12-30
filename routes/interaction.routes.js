// routes/interaction.routes.js
const express = require('express');
const router = express.Router();
const controller = require('../controllers/interaction.controller');

// GET /api/interactions/all
router.get('/all', controller.searchAllInteractions);

// POST /api/interactions/
router.post('/', controller.createInteraction);

// PUT /api/interactions/:rowIndex
router.put('/:rowIndex', controller.updateInteraction);

// DELETE /api/interactions/:rowIndex
router.delete('/:rowIndex', controller.deleteInteraction);

module.exports = router;