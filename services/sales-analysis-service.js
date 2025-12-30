// services/sales-analysis-service.js

/**
 * 專門負責處理成交與金額分析的業務邏輯
 */
class SalesAnalysisService {
    /**
     * @param {object} services - 包含所有已初始化服務的容器
     */
    constructor(services) {
        this.opportunityReader = services.opportunityReader;
        this.systemReader = services.systemReader;
        this.config = services.config;
        // --- !!! 重要：請確認您系統設定中「受注」階段的實際值並修改這裡 !!! ---
        this.WON_STAGE_VALUE = '受注'; 
        // --- !!! ---
    }

    /**
     * 獲取指定時間範圍內的成交分析數據
     * @param {string} startDateISO - 開始日期 (ISO 格式字串)
     * @param {string} endDateISO - 結束日期 (ISO 格式字串)
     * @returns {Promise<object>} - 包含分析結果的物件
     */
    async getSalesAnalysisData(startDateISO, endDateISO) {
        console.log(`📈 [SalesAnalysisService] 計算成交分析資料 (全歷史資料)...`);

        const allOpportunities = await this.opportunityReader.getOpportunities();
        const systemConfig = await this.systemReader.getSystemConfig();

        // 1. 準備設定資料傳給前端
        
        // (A) 銷售模式顏色對應表
        const salesModelColors = {};
        if (systemConfig['銷售模式']) {
            systemConfig['銷售模式'].forEach(item => {
                if (item.value && item.color) {
                    salesModelColors[item.value] = item.color;
                }
            });
        }

        // (B) 機會種類顏色對應表 (修正：讀取 '機會種類')
        const eventTypeColors = {};
        // 優先讀取 '機會種類'，若無則嘗試 '事件類型' (相容舊設定)
        const typeConfig = systemConfig['機會種類'] || systemConfig['事件類型'];
        
        if (typeConfig) {
            typeConfig.forEach(item => {
                if (item.value && item.color) {
                    eventTypeColors[item.value] = item.color; 
                    // 也同時對應顯示名稱 (note)，以防前端是用中文名稱來對應
                    if (item.note) eventTypeColors[item.note] = item.color;
                }
            });
        }

        // (C) 列表分頁選項 (讀取 '列表設定' 類別)
        let paginationOptions = [10, 20, 50, 100]; // 預設值
        if (systemConfig['列表設定']) {
            const pageSetting = systemConfig['列表設定'].find(item => item.value === '成交列表分頁選項');
            if (pageSetting && pageSetting.note) {
                // 將 "10,20,50" 字串轉為數字陣列
                const parsed = pageSetting.note.split(/[,，]/).map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0);
                if (parsed.length > 0) paginationOptions = parsed;
            }
        }

        // 2. 決定是否進行時間篩選 & 趨勢圖 X 軸範圍
        let startDate, endDate;
        let filterByDate = false;

        if (startDateISO && endDateISO) {
            // 使用者指定範圍：進行篩選
            endDate = new Date(endDateISO);
            startDate = new Date(startDateISO);
            filterByDate = true;
        } else {
            // 無指定範圍：不篩選 (全歷史)，但需設定趨勢圖範圍
            endDate = new Date();
            // 預設趨勢圖往前推兩年，確保有足夠跨度，實際會依據資料調整
            startDate = new Date(endDate.getTime() - 730 * 24 * 60 * 60 * 1000);
        }

        endDate.setHours(23, 59, 59, 999);
        startDate.setHours(0, 0, 0, 0);

        // 3. 篩選出所有的成交案件 (不進行日期過濾，列出歷史所有受注案件)
        const allWonOpportunities = []; 
        allOpportunities.forEach(opp => {
            if (opp.currentStage === this.WON_STAGE_VALUE) {
                allWonOpportunities.push(opp);
            }
        });

        console.log(`   - 找到 ${allWonOpportunities.length} 筆成交案件 (含所有歷史資料)`);

        // 4. 準備成交案件列表 (完整列表，並進行初始排序)
        let wonDeals = allWonOpportunities
            .map(opp => ({
                ...opp,
                numericValue: parseFloat(String(opp.opportunityValue || '0').replace(/,/g, '')) || 0,
                // 優先使用預計成交日，若無則使用最後更新日
                wonDate: opp.expectedCloseDate || opp.lastUpdateTime 
            }))
            .sort((a, b) => {
                // 安全排序
                const timeA = a.wonDate ? new Date(a.wonDate).getTime() : 0;
                const timeB = b.wonDate ? new Date(b.wonDate).getTime() : 0;
                const valA = isNaN(timeA) ? 0 : timeA;
                const valB = isNaN(timeB) ? 0 : timeB;
                return valB - valA; // 預設依日期降序
            });

        // 依據時間範圍過濾 (僅當 filterByDate 為真時)
        if (filterByDate) {
            wonDeals = wonDeals.filter(deal => {
                const dealDate = new Date(deal.wonDate);
                return dealDate >= startDate && dealDate <= endDate;
            });
        } else if (wonDeals.length > 0) {
            // 若為全歷史模式，自動調整趨勢圖的起始時間以涵蓋最早的一筆資料
            const minDate = new Date(Math.min(...wonDeals.map(d => new Date(d.wonDate).getTime())));
            if (!isNaN(minDate.getTime()) && minDate < startDate) {
                startDate = minDate;
                startDate.setHours(0, 0, 0, 0);
            }
        }

        // 5. 初始概覽 (Overview)
        const overview = this._calculateOverview(wonDeals);

        // 6. 初始 KPI 分析
        const kpiAnalysis = {
            directCustomerCount: this._analyzeCustomerCountByModel(wonDeals, ['直販', '直接販售', 'Direct']),
            siCustomerCount: this._analyzeCustomerCountByModel(wonDeals, ['SI', '系統整合', 'System Integrator']),
            mtbCustomerCount: this._analyzeCustomerCountByModel(wonDeals, ['MTB', '工具機', 'Machine Tool'])
        };

        // 7. 初始趨勢資料 (Trends)
        const trendChartData = this._calculateTrendData(wonDeals, startDate, endDate);
        
        // 8. 初始分組資料 (Charts)
        const sourceAnalysis = this._analyzeByGroup(wonDeals, 'opportunitySource', '機會來源', systemConfig);
        const typeAnalysis = this._analyzeByGroup(wonDeals, 'opportunityType', '機會種類', systemConfig);
        const salesModelAnalysis = this._analyzeByGroup(wonDeals, 'salesModel', '銷售模式', systemConfig);
        
        // 9. 進階分析
        const channelAnalysis = this._analyzeChannels(wonDeals);
        const productAnalysis = this._analyzeProducts(wonDeals);

        return {
            overview,
            kpiAnalysis,
            trendChartData,
            sourceAnalysis, 
            typeAnalysis,   
            salesModelAnalysis, 
            channelAnalysis, 
            productAnalysis, 
            wonDeals, 
            
            // 設定資料
            salesModelColors, 
            eventTypeColors,
            paginationOptions
        };
    }

    // --- 內部運算邏輯 ---

    _calculateOverview(deals) {
        let totalWonValue = 0;
        let totalSalesCycleDays = 0;
        let validSalesCycleCount = 0;

        deals.forEach(deal => {
            totalWonValue += deal.numericValue;

            if (deal.createdTime && deal.wonDate) {
                try {
                    const created = new Date(deal.createdTime);
                    const won = new Date(deal.wonDate);
                    if (!isNaN(created.getTime()) && !isNaN(won.getTime())) {
                        const diffDays = Math.ceil(Math.abs(won - created) / (1000 * 60 * 60 * 24));
                        totalSalesCycleDays += diffDays;
                        validSalesCycleCount++;
                    }
                } catch (e) {}
            }
        });

        const count = deals.length;
        return {
            totalWonValue: totalWonValue,
            totalWonDeals: count,
            averageDealValue: count > 0 ? totalWonValue / count : 0,
            averageSalesCycleInDays: validSalesCycleCount > 0 ? Math.round(totalSalesCycleDays / validSalesCycleCount) : 0,
        };
    }

    _analyzeCustomerCountByModel(deals, modelKeywords) {
        const uniqueCustomers = new Set();
        deals.forEach(deal => {
            const model = (deal.salesModel || '').trim();
            const isMatch = modelKeywords.some(keyword => model.includes(keyword));
            if (isMatch && deal.customerCompany) {
                uniqueCustomers.add(deal.customerCompany.trim());
            }
        });
        return uniqueCustomers.size;
    }

    _calculateTrendData(deals, startDate, endDate) {
        const trendData = {}; 
        deals.forEach(deal => {
            if (!deal.wonDate) return;
            const date = new Date(deal.wonDate);
            if (isNaN(date.getTime())) return;

            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            if (!trendData[monthKey]) trendData[monthKey] = { value: 0 };
            trendData[monthKey].value += deal.numericValue;
        });

        const result = [];
        let current = new Date(startDate);
        current.setDate(1); 
        while (current <= endDate) {
            const k = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
            const d = trendData[k];
            result.push({ month: k, value: d?.value || 0 });
            current.setMonth(current.getMonth() + 1);
        }
        return result;
    }

    _analyzeByGroup(deals, keyField, configKey, systemConfig) {
        const groupData = {}; 
        const nameMap = new Map((systemConfig[configKey] || []).map(item => [item.value, item.note]));

        deals.forEach(deal => {
            const key = deal[keyField] || '未分類';
            const name = nameMap.get(key) || key;
            if (!groupData[name]) groupData[name] = { value: 0, count: 0 };
            groupData[name].value += deal.numericValue;
            groupData[name].count += 1;
        });

        const chartDataValue = Object.entries(groupData).map(([n, d]) => ({ name: n, y: d.value })).sort((a,b) => b.y - a.y);
        const chartDataCount = Object.entries(groupData).map(([n, d]) => ({ name: n, y: d.count })).sort((a,b) => b.y - a.y);
        return { chartDataValue, chartDataCount };
    }

    _analyzeChannels(deals) {
        const stats = {};
        deals.forEach(deal => {
            let channelName = deal.channelDetails || deal.salesChannel;
            if (!channelName || channelName === '無' || channelName === '-') {
                channelName = '直接販售'; 
            }
            if (!stats[channelName]) stats[channelName] = 0;
            stats[channelName] += deal.numericValue;
        });
        return Object.entries(stats).map(([name, val]) => ({ name, y: val })).sort((a, b) => b.y - a.y);
    }

    _analyzeProducts(deals) {
        const productCounts = {};
        deals.forEach(deal => {
            try {
                if (deal.potentialSpecification) {
                    const specs = JSON.parse(deal.potentialSpecification);
                    if (typeof specs === 'object') {
                        Object.entries(specs).forEach(([prodName, qty]) => {
                            const q = parseInt(qty) || 0;
                            if (q > 0) {
                                if (!productCounts[prodName]) productCounts[prodName] = 0;
                                productCounts[prodName] += q;
                            }
                        });
                    }
                }
            } catch (e) {}
        });
        return Object.entries(productCounts).map(([name, count]) => ({ name, y: count })).sort((a, b) => b.y - a.y);
    }
}

module.exports = SalesAnalysisService;