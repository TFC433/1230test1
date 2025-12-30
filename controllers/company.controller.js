// controllers/company.controller.js
const { handleApiError } = require('../middleware/error.middleware');

// 輔助函式：從 req.app 獲取服務
const getServices = (req) => req.app.get('services');

// GET /api/companies
exports.getCompanies = async (req, res) => {
    try {
        const { companyService } = getServices(req);
        const sortedCompanies = await companyService.getCompanyListWithActivity();
        res.json({ success: true, data: sortedCompanies });
    } catch (error) {
        handleApiError(res, error, 'Get Companies');
    }
};

// 【快速新增】建立公司
exports.createCompany = async (req, res) => {
    try {
        const { companyService } = getServices(req);
        const { companyName } = req.body;
        
        if (!companyName) {
            return res.status(400).json({ success: false, error: 'Company name is required' });
        }
        
        // 呼叫 Service 進行建立
        const result = await companyService.createCompany(companyName, req.user.name);
        
        // 直接回傳 Service 的結果
        res.json(result);
    } catch (error) {
        handleApiError(res, error, 'Create Company');
    }
};

// GET /api/companies/:companyName/details
exports.getCompanyDetails = async (req, res) => {
    try {
        const { companyService } = getServices(req);
        res.json({ success: true, data: await companyService.getCompanyDetails(decodeURIComponent(req.params.companyName)) });
    } catch (error) {
        handleApiError(res, error, 'Get Company Details');
    }
};

// PUT /api/companies/:companyName
exports.updateCompany = async (req, res) => {
    try {
        const { companyService } = getServices(req);
        res.json(await companyService.updateCompany(decodeURIComponent(req.params.companyName), req.body, req.user.name));
    } catch (error) {
        handleApiError(res, error, 'Update Company');
    }
};

// DELETE /api/companies/:companyName
exports.deleteCompany = async (req, res) => {
    try {
        const { companyService } = getServices(req);
        const companyName = decodeURIComponent(req.params.companyName);
        const result = await companyService.deleteCompany(companyName, req.user.name);
        res.json(result);
    } catch (error) {
        if (error.message.startsWith('無法刪除：')) {
            console.warn(`[Delete Company] Business logic error: ${error.message}`);
            res.status(400).json({ success: false, error: error.message, details: error.message });
        } else {
            handleApiError(res, error, 'Delete Company');
        }
    }
};