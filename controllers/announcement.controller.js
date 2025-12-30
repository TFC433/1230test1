// controllers/announcement.controller.js
const { handleApiError } = require('../middleware/error.middleware');

// 輔助函式：從 req.app 獲取服務
const getServices = (req) => req.app.get('services');

// GET /api/announcements
exports.getAnnouncements = async (req, res) => {
    try {
        const { announcementReader } = getServices(req);
        const data = await announcementReader.getAnnouncements();
        res.json({ success: true, data });
    } catch (error) { handleApiError(res, error, 'Get Announcements'); }
};

// POST /api/announcements
exports.createAnnouncement = async (req, res) => {
    try {
        const { announcementWriter } = getServices(req);
        const data = { ...req.body, creator: req.user.name };
        const result = await announcementWriter.createAnnouncement(data);
        res.json(result);
    } catch (error) { handleApiError(res, error, 'Create Announcement'); }
};

// PUT /api/announcements/:id
exports.updateAnnouncement = async (req, res) => {
    try {
        const { announcementWriter } = getServices(req);
        const result = await announcementWriter.updateAnnouncement(req.params.id, req.body);
        res.json(result);
    } catch (error) { handleApiError(res, error, 'Update Announcement'); }
};

// DELETE /api/announcements/:id
exports.deleteAnnouncement = async (req, res) => {
    try {
        const { announcementWriter } = getServices(req);
        const result = await announcementWriter.deleteAnnouncement(req.params.id);
        res.json(result);
    } catch (error) { handleApiError(res, error, 'Delete Announcement'); }
};