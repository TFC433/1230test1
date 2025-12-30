// routes/index.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');

// --- 引入 Controllers ---
// 我們直接引入 controller 來精細控制，而不是整包引入 externalRoutes
const externalController = require('../controllers/external.controller');
const contactController = require('../controllers/contact.controller'); 

// --- 引入其他路由模組 ---
const authRoutes = require('./auth.routes');
const opportunityRoutes = require('./opportunity.routes');
const systemRoutes = require('./system.routes');
const announcementRoutes = require('./announcement.routes');
const contactRoutes = require('./contact.routes');
const companyRoutes = require('./company.routes');
const interactionRoutes = require('./interaction.routes');
const weeklyRoutes = require('./weekly.routes');
const salesRoutes = require('./sales.routes');
const eventRoutes = require('./event.routes');         
const calendarRoutes = require('./calendar.routes');   
const lineLeadsRoutes = require('./line-leads.routes'); 

// ==========================================
// 1. 【公開區域】危險性低或必須公開的 API
// ==========================================

// 登入
router.use('/auth', authRoutes);

// LINE LIFF 相關 (由 Controller 內部檢查 Token，所以這裡路由本身是公開的)
router.use('/line', lineLeadsRoutes); 

// ★ 修正重點：只開放「縮圖預覽」給外部 (例如讓 LINE 裡看得到圖片)
// 這樣做不會消耗大量資源，也沒有敏感資料
router.get('/drive/thumbnail', externalController.getDriveThumbnail);


// ==========================================
// 2. 【保護區域】必須登入才能使用的 API (Token 驗證閘門)
// ==========================================
router.use(authMiddleware.verifyToken); // <--- 驗證閘門

// ★ 修正重點：將「AI 生成公司簡介」移到保護區
// 這樣只有登入的員工才能觸發 Gemini 和 Google Search，防止費用暴增
router.post('/companies/:companyName/generate-profile', externalController.generateCompanyProfile);

// 掛載其他業務模組
router.use('/opportunities', opportunityRoutes);
router.use('/', systemRoutes);
router.use('/announcements', announcementRoutes);
router.use('/contacts', contactRoutes);
router.use('/companies', companyRoutes);
router.use('/interactions', interactionRoutes);
router.use('/business/weekly', weeklyRoutes);
router.use('/sales-analysis', salesRoutes);
router.use('/events', eventRoutes);         
router.use('/calendar', calendarRoutes);   

// 特例處理 (搜尋聯絡人)
router.get('/contact-list', contactController.searchContactList);

// 404 處理
router.use('*', (req, res) => {
    res.status(404).json({ success: false, error: 'API 端點不存在' });
});

module.exports = router;