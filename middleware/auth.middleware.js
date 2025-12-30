// middleware/auth.middleware.js
const jwt = require('jsonwebtoken');
const config = require('../config');

exports.verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        // 403 Forbidden 更適合未提供 token
        return res.status(403).json({ success: false, message: '未提供Token' }); 
    }

    jwt.verify(token, config.AUTH.JWT_SECRET, (err, user) => {
        if (err) {
            console.warn('Token 驗證失敗:', err.message);
            // 401 Unauthorized
            return res.status(401).json({ success: false, message: 'Token無效或已過期' }); 
        }
        req.user = user; // 將解碼後的用戶資訊附加到 req 物件
        next();
    });
};