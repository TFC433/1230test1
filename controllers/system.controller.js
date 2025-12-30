// controllers/system.controller.js
const { handleApiError } = require('../middleware/error.middleware');

// 輔助函式：從 req.app 獲取服務
const getServices = (req) => req.app.get('services');

// 處理 GET /api/config
exports.getSystemConfig = async (req, res) => {
    try {
        const { systemReader } = getServices(req);
        res.json(await systemReader.getSystemConfig());
    } catch (error) { handleApiError(res, error, 'Get Config'); }
};

// 處理 POST /api/cache/invalidate
exports.invalidateCache = async (req, res) => {
    try {
        const { systemReader } = getServices(req);
        systemReader.invalidateCache(null); // 'null' 會清除所有快取
        res.json({ success: true, message: '後端所有快取已清除' });
    } catch (error) { handleApiError(res, error, 'Invalidate Cache'); }
};

// 處理 GET /api/dashboard
exports.getDashboardData = async (req, res) => {
    try {
        const { dashboardService } = getServices(req);
        res.json({ success: true, data: await dashboardService.getDashboardData() });
    } catch (error) { handleApiError(res, error, 'Get Dashboard'); }
};

// 處理 GET /api/contacts/dashboard
exports.getContactsDashboardData = async (req, res) => {
    try {
        const { dashboardService } = getServices(req);
        res.json({ success: true, data: await dashboardService.getContactsDashboardData() });
    } catch (error) { handleApiError(res, error, 'Get Contacts Dashboard'); }
};

// 處理 GET /api/events/dashboard
exports.getEventsDashboardData = async (req, res) => {
    try {
        const { dashboardService } = getServices(req);
        res.json({ success: true, data: await dashboardService.getEventsDashboardData() });
    } catch (error) { handleApiError(res, error, 'Get Events Dashboard'); }
};

// 處理 GET /api/companies/dashboard
exports.getCompaniesDashboardData = async (req, res) => {
    try {
        const { dashboardService } = getServices(req);
        res.json({ success: true, data: await dashboardService.getCompaniesDashboardData() });
    } catch (error) { handleApiError(res, error, 'Get Companies Dashboard'); }
};

// --- 【*** 新增：系統狀態輪詢API ***】 ---
// 處理 GET /api/system/status
exports.getSystemStatus = async (req, res) => {
    try {
        const { systemReader } = getServices(req);
        // 從 base-reader.js 的共享 cache 中讀取我們儲存的時間戳
        const lastWrite = systemReader.cache._globalLastWrite.data;
        res.json({ success: true, lastWriteTimestamp: lastWrite });
    } catch (error) {
        // 這個請求理論上不應該失敗
        handleApiError(res, error, 'Get System Status');
    }
};
// --- 【*** 新增結束 ***】 ---