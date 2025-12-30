// controllers/weekly.controller.js
const { handleApiError } = require('../middleware/error.middleware');

// 輔助函式：從 req.app 獲取服務
const getServices = (req) => req.app.get('services');

// GET /api/business/weekly/summary
exports.getSummaryList = async (req, res) => {
    try {
        const { weeklyBusinessService } = getServices(req);
        res.json({ success: true, data: await weeklyBusinessService.getWeeklyBusinessSummaryList() });
    } catch (error) { handleApiError(res, error, 'Get Weekly Summary'); }
};

// GET /api/business/weekly/week-options
exports.getWeekOptions = async (req, res) => {
    try {
        const { weeklyBusinessService } = getServices(req);
        res.json({ success: true, data: await weeklyBusinessService.getWeekOptions() });
    } catch (error) { handleApiError(res, error, 'Get Week Options'); }
};

// GET /api/business/weekly/details/:weekId
exports.getWeeklyDetails = async (req, res) => {
    try {
        const { weeklyBusinessService } = getServices(req);
        res.json({ success: true, data: await weeklyBusinessService.getWeeklyDetails(req.params.weekId) });
    } catch (error) { handleApiError(res, error, 'Get Weekly Details'); }
};

// POST /api/business/weekly
exports.createEntry = async (req, res) => {
    try {
        const { weeklyBusinessService } = getServices(req);
        const data = { ...req.body, creator: req.user.name };
        res.json(await weeklyBusinessService.createWeeklyBusinessEntry(data));
    } catch (error) { handleApiError(res, error, 'Create Weekly Entry'); }
};

// PUT /api/business/weekly/:recordId
exports.updateEntry = async (req, res) => {
    try {
        const { weeklyBusinessService } = getServices(req);
        const data = { ...req.body, creator: req.user.name };
        res.json(await weeklyBusinessService.updateWeeklyBusinessEntry(req.params.recordId, data));
    } catch (error) { handleApiError(res, error, 'Update Weekly Entry'); }
};

// DELETE /api/business/weekly/:recordId
exports.deleteEntry = async (req, res) => {
    try {
        const { weeklyBusinessWriter } = getServices(req);
        res.json(await weeklyBusinessWriter.deleteWeeklyBusinessEntry(req.params.recordId, req.body.rowIndex));
    } catch (error) { handleApiError(res, error, 'Delete Weekly Entry'); }
};