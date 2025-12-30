// controllers/line-leads.controller.js
const https = require('https');
const querystring = require('querystring');
const { handleApiError } = require('../middleware/error.middleware');

// 輔助函式：從 req.app 獲取服務
const getServices = (req) => req.app.get('services');

/**
 * 驗證 LINE ID Token
 */
function verifyLineToken(idToken, channelId) {
    return new Promise((resolve) => {
        const postData = querystring.stringify({
            id_token: idToken,
            client_id: channelId
        });

        const options = {
            hostname: 'api.line.me',
            path: '/oauth2/v2.1/verify',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': postData.length
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        const parsedData = JSON.parse(data);
                        resolve(parsedData); 
                    } catch (e) {
                        console.error('LINE Verify Response Parse Error:', e);
                        resolve(null);
                    }
                } else {
                    console.warn(`LINE Token 驗證失敗 (Status: ${res.statusCode}):`, data);
                    resolve(null);
                }
            });
        });

        req.on('error', (e) => {
            console.error('LINE Verify Request Error:', e);
            resolve(null);
        });

        req.write(postData);
        req.end();
    });
}

// GET /api/line/leads
exports.getAllLeads = async (req, res) => {
    try {
        const { contactReader, systemReader } = getServices(req);

        // 1. 取得 Token
        const authHeader = req.headers['authorization'];
        const idToken = authHeader && authHeader.split(' ')[1];

        if (!idToken) {
            return res.status(401).json({ success: false, message: '未提供 LINE 登入憑證' });
        }

        let lineProfile = null;

        // ★★★ 【重點修改】本地開發 Bypass 邏輯 ★★★
        if (process.env.NODE_ENV === 'development' && idToken === 'TEST_LOCAL_TOKEN') {
            console.log('🚧 [Dev] 偵測到本地測試模式，跳過 LINE 驗證');
            lineProfile = {
                sub: process.env.TEST_LINE_USER_ID || 'TEST_LOCAL_USER', // 模擬的 UserID
                name: '測試員 (Local)',
                picture: ''
            };
        } else {
            // 正式環境：向 LINE 驗證
            const channelId = process.env.LINE_CHANNEL_ID;
            if (!channelId) {
                console.error('系統設定錯誤：缺少 LINE_CHANNEL_ID');
                return res.status(500).json({ success: false, error: '伺服器設定不完整' });
            }
            lineProfile = await verifyLineToken(idToken, channelId);
        }
        // ★★★ 修改結束 ★★★

        if (!lineProfile) {
            return res.status(403).json({ success: false, message: '無效或已過期的 LINE 憑證' });
        }

        const currentUserId = lineProfile.sub; 

        // 2. 白名單檢查
        const systemConfig = await systemReader.getSystemConfig();
        const allowedUsers = systemConfig['LINE白名單'] || []; 

        // 檢查是否在白名單 OR 是開發環境的測試帳號
        const isAllowed = allowedUsers.some(u => u.value === currentUserId) || 
                          (process.env.NODE_ENV === 'development' && currentUserId === (process.env.TEST_LINE_USER_ID || 'TEST_LOCAL_USER'));

        if (!isAllowed) {
            return res.status(403).json({ 
                success: false, 
                error: 'ACCESS_DENIED',
                message: '您的 LINE 帳號尚未被授權瀏覽此頁面。',
                yourUserId: currentUserId 
            });
        }

        // 3. 回傳資料
        const contacts = await contactReader.getContacts(5000);
        
        const simplifiedContacts = contacts.map(c => ({
            rowIndex: c.rowIndex,
            name: c.name || '(未命名)',
            company: c.company || '',
            position: c.position || '',
            mobile: c.mobile || '',
            email: c.email || '',
            driveLink: c.driveLink || '',
            lineUserId: c.lineUserId || '', 
            userNickname: c.userNickname || 'Unknown',
            createdTime: c.createdTime || ''
        }));

        simplifiedContacts.sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));

        res.json({ success: true, data: simplifiedContacts });
    } catch (error) {
        handleApiError(res, error, 'Get All Leads for LINE');
    }
};

// PUT /api/line/leads/:rowIndex
exports.updateLead = async (req, res) => {
    try {
        const { contactWriter, systemReader } = getServices(req);
        const { rowIndex } = req.params;
        const { modifier, ...updateData } = req.body; 
        
        const authHeader = req.headers['authorization'];
        const idToken = authHeader && authHeader.split(' ')[1];

        if (!idToken) return res.status(401).json({ success: false, message: '未授權' });

        let lineProfile = null;

        // ★★★ 【重點修改】本地開發 Bypass 邏輯 (同上) ★★★
        if (process.env.NODE_ENV === 'development' && idToken === 'TEST_LOCAL_TOKEN') {
            console.log('🚧 [Dev] 更新操作：跳過 LINE 驗證');
            lineProfile = {
                sub: process.env.TEST_LINE_USER_ID || 'TEST_LOCAL_USER',
                name: '測試員 (Local)'
            };
        } else {
            const channelId = process.env.LINE_CHANNEL_ID;
            lineProfile = await verifyLineToken(idToken, channelId);
        }
        // ★★★ 修改結束 ★★★

        if (!lineProfile) return res.status(403).json({ success: false, message: '憑證無效' });

        const currentUserId = lineProfile.sub;

        // 白名單檢查
        const systemConfig = await systemReader.getSystemConfig();
        const allowedUsers = systemConfig['LINE白名單'] || [];
        const isAllowed = allowedUsers.some(u => u.value === currentUserId) ||
                          (process.env.NODE_ENV === 'development' && currentUserId === (process.env.TEST_LINE_USER_ID || 'TEST_LOCAL_USER'));

        if (!isAllowed) return res.status(403).json({ success: false, message: '您沒有編輯權限' });

        await contactWriter.updateRawContact(
            parseInt(rowIndex), 
            updateData, 
            lineProfile.name || modifier || 'LINE User'
        );
        
        res.json({ success: true, message: '更新成功' });
    } catch (error) {
        handleApiError(res, error, 'Update Lead via LINE');
    }
};