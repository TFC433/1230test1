// app.js (重構後 - 最終完整版)
const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

// --- 服務初始化 ---
const config = require('./config');
// 【路徑修正】從 ./services/ 載入
const initializeCoreServices = require('./services/service-container'); 
const initializeBusinessServices = require('./services');

// --- 引入中介軟體和路由 ---
const { globalErrorHandler } = require('./middleware/error.middleware');
const allApiRoutes = require('./routes'); // <-- 引入唯一的總路由

const app = express();

// --- 中介軟體設定 ---
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// 【重要】將靜態資源目錄指向 'public'
app.use(express.static(path.join(__dirname, 'public')));

// ==================== 伺服器啟動函式 ====================
async function startServer() {
    try {
        // 1. 初始化所有服務 (Reader, Writer, Services)
        const coreServices = await initializeCoreServices();
        const services = initializeBusinessServices(coreServices);

        // 2. 【重要】將所有服務注入到 app 中，讓 controllers 可以透過 req.app.get('services') 取得
        app.set('services', services);
        console.log('✅ 所有服務已成功注入');

        // 3. 設定 API 路由
        
        // 公開路由：健康檢查 (不需 Token)
        app.get('/health', async (req, res) => {
            const { authService } = req.app.get('services');
            const healthStatus = await authService.checkAuthStatus();
            res.json({ status: 'ok', timestamp: new Date().toISOString(), services: healthStatus });
        });

        // 掛載所有 API 路由到 /api 路徑下
        // (這會處理 /api/auth/login, /api/config, /api/opportunities/* 等所有請求)
        app.use('/api', allApiRoutes);
        
        console.log('✅ API 路由準備就緒...');

        // 4. 設定前端頁面路由
        // 根目錄導向登入頁面
        app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));

        // 5. 處理前端路由 (SPA Fallback)
        // 讓所有非 API、非檔案的請求都回傳 dashboard.html，由前端路由 (main.js) 處理
        // 這能確保您在儀表板頁面按 F5 重新整理時不會 404
        app.get('*', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
        });

        // 6. 全局錯誤處理 (必須放在所有路由之後)
        app.use(globalErrorHandler);

        // ==================== 伺服器啟動 ====================
        app.listen(config.PORT, () => {
            console.log(`🚀 CRM 系統已在 http://localhost:${config.PORT} 啟動`);
        });

    } catch (error) {
        console.error('⚠ 系統啟動失敗:', error.message);
        process.exit(1); // 啟動失敗時退出
    }
}

// 啟動伺服器
startServer();