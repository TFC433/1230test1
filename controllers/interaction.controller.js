// controllers/interaction.controller.js
const { handleApiError } = require('../middleware/error.middleware');

// 輔助函式：從 req.app 獲取服務
const getServices = (req) => req.app.get('services');

// GET /api/interactions/all
exports.searchAllInteractions = async (req, res) => {
    try {
        const { interactionReader } = getServices(req);
        res.json(await interactionReader.searchAllInteractions(
            req.query.q, 
            parseInt(req.query.page || 1), 
            req.query.fetchAll === 'true'
        ));
    } catch (error) { handleApiError(res, error, 'Search All Interactions'); }
};

// POST /api/interactions
exports.createInteraction = async (req, res) => {
    try {
        const { interactionWriter } = getServices(req);
        // 【安全】確保 recorder 是登入的使用者，而不是 POST 來的
        const interactionData = { ...req.body, recorder: req.user.name };
        res.json(await interactionWriter.createInteraction(interactionData));
    } catch (error) { handleApiError(res, error, 'Create Interaction'); }
};

// PUT /api/interactions/:rowIndex
exports.updateInteraction = async (req, res) => {
    try {
        const { interactionWriter } = getServices(req);
        res.json(await interactionWriter.updateInteraction(
            parseInt(req.params.rowIndex), 
            req.body, 
            req.user.name
        ));
    } catch (error) { handleApiError(res, error, 'Update Interaction'); }
};

// DELETE /api/interactions/:rowIndex
exports.deleteInteraction = async (req, res) => {
    try {
        const { interactionWriter } = getServices(req);
        res.json(await interactionWriter.deleteInteraction(parseInt(req.params.rowIndex)));
    } catch (error) {
        handleApiError(res, error, 'Delete Interaction');
    }
};