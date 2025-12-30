// controllers/external.controller.js
const { handleApiError } = require('../middleware/error.middleware');
const https = require('https'); // 為了 performGoogleSearch

// --- Gemini AI 相關設定 (從 app.js 搬移) ---
const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const MODEL_CONFIG = {
    primary: "gemini-2.5-flash",
    fallbacks: [
        "gemini-2.5-flash-lite", 
        "gemini-2.0-flash",
        "gemini-2.0-flash-lite"
    ]
};

function initializeGeminiModel(modelName) {
    try {
        return genAI.getGenerativeModel({ model: modelName });
    } catch (error) {
        console.warn(`模型 ${modelName} 初始化失敗:`, error.message);
        return null;
    }
}

async function generateWithFallback(prompt) {
    const modelsToTry = [MODEL_CONFIG.primary, ...MODEL_CONFIG.fallbacks];
    for (const modelName of modelsToTry) {
        try {
            console.log(`🤖 嘗試使用模型: ${modelName}`);
            const model = initializeGeminiModel(modelName);
            if (!model) continue;
            const result = await model.generateContent(prompt);
            const responseText = await result.response.text();
            console.log(`✅ 模型 ${modelName} 成功回應`);
            return { success: true, data: responseText, model: modelName };
        } catch (error) {
            console.warn(`❌ 模型 ${modelName} 失败: ${error.message}`);
            if (error.message.includes('404') || error.message.includes('not found')) {
                console.warn(`⚠️ 模型 ${modelName} 可能已退役，跳過`);
                continue;
            }
            continue;
        }
    }
    throw new Error('所有模型都無法使用');
}
// --- Gemini AI 相關設定結束 ---


// --- Google Search 相關設定 (從 app.js 搬移) ---
async function performGoogleSearch(companyName) {
    const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
    const searchEngineId = process.env.SEARCH_ENGINE_ID;
    if (!apiKey || !searchEngineId) {
        console.log('⚠ Google Search API 設定不完整');
        return [];
    }
    const baseCompanyName = companyName.replace(/股份有限公司$/, '').replace(/有限公司$/, '').replace(/公司$/, '').trim();
    const queries = [
        `"${baseCompanyName}" site:104.com.tw 公司簡介`,
        `"${baseCompanyName}" site:1111.com.tw 公司資料`,
        `"${baseCompanyName}" 台灣 電話 地址 聯絡`,
        `"${baseCompanyName}" 公司 官網`,
        `${baseCompanyName} 台灣 公司 產業`,
        `"${companyName}" 台灣`
    ];
    const allResults = [];
    for (let i = 0; i < queries.length; i++) {
        try {
            const query = encodeURIComponent(queries[i]);
            const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${searchEngineId}&q=${query}&num=3`;
            console.log(`🔍 執行搜索 ${i + 1}/${queries.length}: ${queries[i]}`);
            const response = await new Promise((resolve, reject) => {
                https.get(url, (res) => {
                    let data = '';
                    res.on('data', (chunk) => data += chunk);
                    res.on('end', () => {
                        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
                    });
                }).on('error', reject);
            });
            if (response.items) {
                allResults.push(...response.items.map(item => ({
                    title: item.title,
                    snippet: item.snippet,
                    link: item.link
                })));
            }
            if (allResults.length >= 10) break;
        } catch (error) {
            console.log(`⚠ 搜索 ${i + 1} 失敗:`, error.message);
        }
    }
    return allResults;
}
// --- Google Search 相關設定結束 ---


// 輔助函式：從 req.app 獲取服務
const getServices = (req) => req.app.get('services');

// POST /api/companies/:companyName/generate-profile
exports.generateCompanyProfile = async (req, res) => {
    try {
        const { companyName } = req.params;
        const { userKeywords } = req.body;
        console.log('🚀 開始生成公司簡介:', decodeURIComponent(companyName));
        const searchResults = await performGoogleSearch(decodeURIComponent(companyName));
        if (searchResults.length === 0) {
            return res.json({
                success: false,
                error: '搜索不到相關資訊',
                message: '無法在網路上找到該公司的詳細資訊，請確認公司名稱是否正確。'
            });
        }
        const searchContext = searchResults.map((item, index) =>
            `【資料來源 ${index + 1}】\n標題: ${item.title}\n內容: ${item.snippet}\n網址: ${item.link}\n---`
        ).join('\n');
        
        const finalPrompt = `
你是一位專業的商業分析師，請根據以下搜索到的資料，為 "${decodeURIComponent(companyName)}" 整理出結構化的公司檔案。
【搜索到的資料】：
${searchContext}
【用戶提供的額外線索】：
${userKeywords || '無'}
【整理指令】：
1.  仔細分析上述所有資料，提取最可靠和精華的資訊。
2.  如果某項資訊找不到，請在對應欄位填入 "資料不足"。
3.  電話和地址請使用台灣的慣用格式。
4.  縣市必須從以下標準選項中選擇其一：臺北市, 新北市, 桃園市, 臺中市, 臺南市, 高雄市, 基隆市, 新竹市, 嘉義市, 新竹縣, 苗栗縣, 彰化縣, 南投縣, 雲林縣, 嘉義縣, 屏東縣, 宜蘭縣, 花蓮縣, 臺東縣。若無法判斷則填 "資料不足"。
5.  保持客觀中性的商業語氣。
6.  **請將公司簡介、產業、產品服務、特色等資訊，整合成一個完整的文字段落，並嚴格遵守以下排版格式**：

【業務簡介】
(請在此撰寫公司業務簡介)

【主要產業】
(請在此說明所屬產業)

【核心產品/服務】
(請在此條列主要產品或服務)

【公司特色】
(請在此說明公司特色或優勢)

請嚴格按照以下 JSON 格式輸出，不要有任何多餘的文字或解釋：
{
  "formatted_introduction": "請填入上述格式化後的完整文字內容(字串中請保留換行符號 \\n)",
  "contact_info": {
    "phone": "公司的主要聯絡電話。",
    "address": "公司的主要營業地址。",
    "county": "公司所在地的台灣縣市(必須使用標準選項)。"
  }
}`;
        
        const aiResult = await generateWithFallback(finalPrompt);
        if (!aiResult.success) throw new Error('AI 生成失敗');
        const jsonMatch = aiResult.data.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('AI 未能生成有效的 JSON 格式');
        
        const jsonText = jsonMatch[0];
        const parsedData = JSON.parse(jsonText);
        
        // 【修改】將格式化後的文字放入 introduction 欄位回傳
        const flatData = {
            introduction: parsedData.formatted_introduction,
            phone: parsedData.contact_info?.phone,
            address: parsedData.contact_info?.address,
            county: parsedData.contact_info?.county
        };
        console.log('✅ 公司簡介生成並轉換成功');
        res.json({ success: true, data: flatData });
    } catch (error) {
        handleApiError(res, error, 'AI Profile Generation');
    }
};


// GET /api/drive/thumbnail
exports.getDriveThumbnail = async (req, res) => {
    const { fileId, link } = req.query;
    let targetFileId = fileId;

    if (!targetFileId && link) {
        try {
            const match = link.match(/\/d\/([a-zA-Z0-9_-]{25,})\//) || link.match(/id=([a-zA-Z0-9_-]{25,})/);
            if (match && match[1]) targetFileId = match[1];
        } catch (e) { console.warn(`[Drive API] 無法從連結解析 File ID: ${link}`, e); }
    }
    if (!targetFileId) {
        return res.status(400).json({ success: false, error: '缺少有效的 fileId 或無法從 link 解析' });
    }

    try {
        const { drive } = getServices(req); // 從服務容器獲取 drive client
        const response = await drive.files.get({
            fileId: targetFileId,
            fields: 'id, name, thumbnailLink',
            supportsAllDrives: true
        });
        if (response.data && response.data.thumbnailLink) {
            res.json({ success: true, thumbnailUrl: response.data.thumbnailLink });
        } else {
            res.status(404).json({ success: false, error: '找不到縮圖連結' });
        }
    } catch (error) {
        if (error.code === 404) {
             handleApiError(res, new Error(`找不到指定的 Google Drive 檔案 (ID: ${targetFileId})`), 'Drive Thumbnail (Not Found)');
        } else {
             handleApiError(res, error, 'Drive Thumbnail');
        }
    }
};