// routes/weekly.routes.js
const express = require('express');
const router = express.Router();
const controller = require('../controllers/weekly.controller');

// GET /api/business/weekly/summary
router.get('/summary', controller.getSummaryList);

// GET /api/business/weekly/week-options
router.get('/week-options', controller.getWeekOptions);

// GET /api/business/weekly/details/:weekId
router.get('/details/:weekId', controller.getWeeklyDetails);

// POST /api/business/weekly
router.post('/', controller.createEntry);

// PUT /api/business/weekly/:recordId
router.put('/:recordId', controller.updateEntry);

// DELETE /api/business/weekly/:recordId
router.delete('/:recordId', controller.deleteEntry);

module.exports = router;