// routes/auth.routes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { verifyToken } = require('../middleware/auth.middleware');

// 登入 (公開)
router.post('/login', authController.login);

// ★ 新增：檢查 Token 有效性 (需登入) - 用於前端自動登入
router.get('/verify', verifyToken, authController.verifySession);

// ★ 新增：驗證舊密碼 (需登入) - 用於前端即時檢查
router.post('/verify-password', verifyToken, authController.verifyPassword);

// 修改密碼 (需登入)
router.post('/change-password', verifyToken, authController.changePassword);

module.exports = router;