// routes/company.routes.js
const express = require('express');
const router = express.Router();
const companyController = require('../controllers/company.controller');
const externalController = require('../controllers/external.controller');

// GET /api/companies/ (獲取列表)
router.get('/', companyController.getCompanies);

// 【快速新增】處理 POST /api/companies 的請求
router.post('/', companyController.createCompany);

// --- AI 路由 ---
// POST /api/companies/:companyName/generate-profile
router.post('/:companyName/generate-profile', externalController.generateCompanyProfile);

// --- 公司路由 ---
// GET /api/companies/:companyName/details
router.get('/:companyName/details', companyController.getCompanyDetails);

// PUT /api/companies/:companyName
router.put('/:companyName', companyController.updateCompany);

// DELETE /api/companies/:companyName
router.delete('/:companyName', companyController.deleteCompany);

module.exports = router;