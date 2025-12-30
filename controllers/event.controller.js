// controllers/event.controller.js
const { handleApiError } = require('../middleware/error.middleware');
// 【新增】引入 config 以獲取時區設定
const config = require('../config');

// 輔助函式：從 req.app 獲取服務
const getServices = (req) => req.app.get('services');

// ==========================================
// Part 1: 事件紀錄 (Event Log) 相關功能
// ==========================================

// POST /api/events
exports.createEventLog = async (req, res) => {
    try {
        const { eventLogService } = getServices(req);
        // 【修正】將 req.user.name (操作者) 傳入 Service，確保建立者正確
        res.json(await eventLogService.createEventLog(req.body, req.user.name));
    } catch (error) { handleApiError(res, error, 'Create Event Log'); }
};

// GET /api/events/:eventId
exports.getEventLogById = async (req, res) => {
    try {
        const { eventLogReader } = getServices(req);
        const data = await eventLogReader.getEventLogById(req.params.eventId);
        res.json({ success: !!data, data });
    } catch (error) { handleApiError(res, error, 'Get Event Log By Id'); }
};

// PUT /api/events/:eventId
exports.updateEventLog = async (req, res) => {
    try {
        const { eventLogService } = getServices(req);
        res.json(await eventLogService.updateEventLog(req.params.eventId, req.body, req.user.name));
    } catch (error) { handleApiError(res, error, 'Update Event Log'); }
};

// DELETE /api/events/:eventId
exports.deleteEventLog = async (req, res) => {
    try {
        const { eventLogService } = getServices(req);
        res.json(await eventLogService.deleteEventLog(req.params.eventId, req.user.name));
    } catch (error) {
        handleApiError(res, error, 'Delete Event Log');
    }
};


// ==========================================
// Part 2: 日曆 (Calendar) 與 自動同步功能
// ==========================================

// POST /api/calendar/events
exports.createCalendarEvent = async (req, res) => {
    try {
        // 取得所有需要的服務
        const { 
            calendarService, 
            interactionWriter, 
            weeklyBusinessWriter, 
            opportunityService,
            dateHelpers 
        } = getServices(req);
        
        const { 
            title, startTime, duration, location, description, 
            opportunityId, participants, createInteraction, showTimeInTitle
        } = req.body;

        // 1. 獲取機會詳細資料
        let opportunityInfo = null;
        let category = 'DT'; 
        let customerName = '客戶';

        if (opportunityId) {
            try {
                const oppResult = await opportunityService.getOpportunityDetails(opportunityId);
                opportunityInfo = oppResult.opportunityInfo;
                
                const type = (opportunityInfo.opportunityType || '').toLowerCase();
                if (type.includes('iot') || type.includes('智慧') || type.includes('連網')) {
                    category = 'IoT';
                } else {
                    category = 'DT';
                }
                customerName = opportunityInfo.customerCompany || '未知客戶';
            } catch (e) {
                console.warn('無法獲取機會詳細資料，將使用預設值:', e.message);
            }
        }

        // 2. 準備資料 payload (修正時區問題)
        const start = new Date(startTime);
        
        // 【核心修正】強制使用設定檔中的時區 (Asia/Taipei) 來格式化時間與日期
        // 格式化時間 HH:MM
        const timeString = start.toLocaleTimeString('zh-TW', { 
            timeZone: config.TIMEZONE, 
            hour: '2-digit', 
            minute: '2-digit', 
            hour12: false 
        });
        
        // 格式化日期 YYYY-MM-DD (使用 en-CA 格式最穩定)
        const dateString = start.toLocaleDateString('en-CA', { 
            timeZone: config.TIMEZONE 
        });

        // 組合 Google Calendar 標題
        let calendarTitle = title;
        if (showTimeInTitle) {
             calendarTitle = `${title} (${timeString})`;
        }
        
        const companyNote = `關聯公司: ${customerName}`;

        // 組合 Google Calendar 描述
        const fullDescription = `
【會議詳情】
時間: ${dateString} ${timeString}
地點: ${location || '未指定'}
參與: ${participants || '無'}

【備註內容】
${description || '無'}

【關聯資訊】
${companyNote}
        `.trim();

        // 準備三個寫入動作的 Promise
        const actions = [];

        // Action A: 寫入 Google Calendar (全天事件)
        actions.push(calendarService.createCalendarEvent({
            title: calendarTitle,
            description: fullDescription,
            location: location,
            startTime: startTime, // 傳遞原始時間給 Service，讓它去處理格式
            isAllDay: true 
        }));

        // Action B: 寫入互動紀錄 (如果勾選)
        if (createInteraction && opportunityId) {
            const interactionData = {
                opportunityId: opportunityId,
                interactionTime: startTime, 
                eventType: '會議討論',
                eventTitle: title, 
                contentSummary: `[參與人員]: ${participants || '無'}\n[地點]: ${location || '無'}\n\n${description || ''}\n(${companyNote})`,
                recorder: req.user.name,
                participants: participants
            };
            actions.push(interactionWriter.createInteraction(interactionData));
        }

        // Action C: 寫入週間業務 (如果勾選)
        if (createInteraction && opportunityId) {
            // 使用 dateHelpers 計算 WeekID
            const weekId = dateHelpers.getWeekId(start);
            
            const weeklyData = {
                date: dateString, // 使用修正時區後的日期
                weekId: weekId, 
                category: category, 
                topic: title, 
                participants: participants,
                summary: `${description || '(預排行程)'}\n\n(${companyNote})`, 
                actionItems: '',
                creator: req.user.name
            };
            
            actions.push(weeklyBusinessWriter.createWeeklyBusinessEntry(weeklyData));
        }

        // 3. 並行執行所有寫入
        const results = await Promise.allSettled(actions);
        
        // 檢查 Calendar 結果
        const calendarResult = results[0].status === 'fulfilled' ? results[0].value : null;
        const calendarError = results[0].status === 'rejected' ? results[0].reason : null;

        if (calendarResult && calendarResult.success) {
            res.json(calendarResult);
        } else {
            throw calendarError || new Error('建立 Google Calendar 事件失敗');
        }

    } catch (error) { 
        handleApiError(res, error, 'Create Calendar Event & Sync'); 
    }
};

// GET /api/calendar/week
exports.getThisWeekEvents = async (req, res) => {
    try {
        const { calendarService } = getServices(req);
        res.json(await calendarService.getThisWeekEvents());
    } catch (error) { handleApiError(res, error, 'Get Week Events'); }
};