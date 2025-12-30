// routes/opportunity.routes.js
const express = require('express');
const router = express.Router();
const controller = require('../controllers/opportunity.controller');

// GET /api/opportunities/dashboard
router.get('/dashboard', controller.getDashboardData);

// GET /api/opportunities/by-county
router.get('/by-county', controller.getOpportunitiesByCounty);

// GET /api/opportunities/
router.get('/', controller.searchOpportunities);

// GET /api/opportunities/:opportunityId/details
router.get('/:opportunityId/details', controller.getOpportunityDetails);

// POST /api/opportunities/
router.post('/', controller.createOpportunity);

// PUT /api/opportunities/batch
router.put('/batch', controller.batchUpdateOpportunities);

// PUT /api/opportunities/:rowIndex
router.put('/:rowIndex', controller.updateOpportunity);

// DELETE /api/opportunities/:rowIndex
router.delete('/:rowIndex', controller.deleteOpportunity);

// POST /api/opportunities/:opportunityId/contacts
router.post('/:opportunityId/contacts', controller.addContactToOpportunity);

// DELETE /api/opportunities/:opportunityId/contacts/:contactId
router.delete('/:opportunityId/contacts/:contactId', controller.deleteContactLink);

module.exports = router;