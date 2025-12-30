// services/service-container.js

const { google } = require('googleapis');
const AuthService = require('./auth-service');
const WorkflowService = require('./workflow-service');
const CalendarService = require('./calendar-service');

// 從 data/index.js 一次性引入所有資料層模組
const {
    OpportunityReader, ContactReader, CompanyReader, InteractionReader,
    EventLogReader, SystemReader, WeeklyBusinessReader, AnnouncementReader,
    CompanyWriter, ContactWriter, OpportunityWriter, InteractionWriter,
    EventLogWriter, WeeklyBusinessWriter, AnnouncementWriter,
    
    // ★★★ 1. 新增引入 SystemWriter ★★★
    SystemWriter 
} = require('../data');

const services = {};

async function initializeServices() {
    if (services.isInitialized) {
        return services;
    }

    console.log('🔧 [Service Container] 正在初始化所有服務...');

    // 1. 認證服務
    const authService = new AuthService();
    const authClient = await authService.getOAuthClient();

    // 2. Google API 實例
    const sheets = google.sheets({ version: 'v4', auth: authClient });
    const calendar = google.calendar({ version: 'v3', auth: authClient });
    const drive = google.drive({ version: 'v3', auth: authClient });

    // 3. Readers
    const opportunityReader = new OpportunityReader(sheets);
    const contactReader = new ContactReader(sheets);
    const companyReader = new CompanyReader(sheets);
    const interactionReader = new InteractionReader(sheets);
    const eventLogReader = new EventLogReader(sheets);
    const systemReader = new SystemReader(sheets);
    const weeklyBusinessReader = new WeeklyBusinessReader(sheets);
    const announcementReader = new AnnouncementReader(sheets);

    const readers = {
        opportunityReader, contactReader, companyReader, interactionReader,
        eventLogReader, systemReader, weeklyBusinessReader, announcementReader
    };

    // 4. Writers
    const companyWriter = new CompanyWriter(sheets, companyReader);
    const contactWriter = new ContactWriter(sheets, contactReader);
    const opportunityWriter = new OpportunityWriter(sheets, opportunityReader, contactReader);
    const interactionWriter = new InteractionWriter(sheets, interactionReader, opportunityReader);
    const eventLogWriter = new EventLogWriter(sheets, eventLogReader, opportunityReader);
    const weeklyBusinessWriter = new WeeklyBusinessWriter(sheets, weeklyBusinessReader);
    const announcementWriter = new AnnouncementWriter(sheets, announcementReader);
    
    // ★★★ 2. 初始化 SystemWriter (放入 sheets) ★★★
    const systemWriter = new SystemWriter(sheets);

    const writers = {
        companyWriter, contactWriter, opportunityWriter, interactionWriter,
        eventLogWriter, weeklyBusinessWriter, announcementWriter,
        
        // ★★★ 3. 加入 writers 物件中 ★★★
        systemWriter 
    };

    // 5. Services
    const workflowService = new WorkflowService(writers, readers, sheets);
    const calendarService = new CalendarService(authClient);

    // 6. 儲存到容器
    Object.assign(services, {
        authService,
        sheets,
        calendar,
        drive,
        ...readers,
        ...writers, // 這裡會自動包含 systemWriter
        workflowService,
        calendarService,
        isInitialized: true
    });

    console.log('✅ [Service Container] 所有服務初始化完成！');
    return services;
}

module.exports = initializeServices;