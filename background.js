// 处理广告数据的后台服务
class AdDataService {
  constructor() {
    this.cache = new Map();
    this.isAnalyzing = false;
    this.isCapturing = false;
  }

  async initialize() {
    // 初始化消息监听器
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      try {
        console.log('收到消息:', message.type);

        switch (message.type) {
          case 'AD_CAPTURED':
            // 广播消息到所有标签页
            chrome.runtime.sendMessage({
              type: 'UPDATE_ADS',
              data: message.data
            }).catch(error => {
              console.log('发送消息到popup失败:', error);
            });
            sendResponse({ success: true });
            break;

          case 'GET_CAPTURE_STATUS':
            sendResponse({ 
              success: true, 
              isCapturing: this.isCapturing 
            });
            break;

          case 'TOGGLE_CAPTURE':
            this.isCapturing = !this.isCapturing;
            sendResponse({ 
              success: true, 
              isCapturing: this.isCapturing 
            });
            break;

          case 'EXPORT_DATA':
            this.exportData(message.format)
              .then(data => sendResponse({ success: true, data }))
              .catch(error => sendResponse({ 
                success: false, 
                error: error.message 
              }));
            return true; // 保持消息通道开启，等待异步响应

          case 'ANALYZE_DATA':
            this.analyzeData(message.filters)
              .then(results => sendResponse({ 
                success: true, 
                data: results 
              }))
              .catch(error => sendResponse({ 
                success: false, 
                error: error.message 
              }));
            return true;

          case 'START_CAPTURE':
            this.isCapturing = true;
            console.log('开始捕获广告');
            break;

          case 'STOP_CAPTURE':
            this.isCapturing = false;
            console.log('停止捕获广告');
            break;

          case 'STORAGE_GET':
            chrome.storage.local.get(message.key, (result) => {
              sendResponse(result);
            });
            return true;

          case 'STORAGE_SET':
            chrome.storage.local.set(message.data, () => {
              sendResponse({ success: true });
            });
            return true;

          default:
            console.warn('未知的消息类型:', message.type);
            sendResponse({ 
              success: false, 
              error: '未知的消息类型' 
            });
        }
      } catch (error) {
        console.error('处理消息时出错:', error);
        sendResponse({ 
          success: false, 
          error: error.message 
        });
      }
      return true; // 保持消息通道开启
    });

    // 初始化分析配置
    this.analysisConfig = {
      timeRanges: ['24h', '7d', '30d', 'all'],
      metrics: ['impressions', 'engagement', 'sentiment']
    };

    // 初始化存储
    const { ads } = await chrome.storage.local.get('ads');
    if (!ads) {
      await chrome.storage.local.set({ ads: [] });
    }

    console.log('AdDataService 初始化完成');
  }

  async analyzeData(filters = {}) {
    try {
      const { ads } = await chrome.storage.local.get('ads');
      if (!ads || !ads.length) {
        return {
          success: false,
          error: '没有可分析的数据'
        };
      }

      // 根据过滤条件处理数据
      const filteredAds = this.filterAds(ads, filters);
      
      // 执行分析
      const results = {
        trends: this.analyzeTrends(filteredAds),
        demographics: this.analyzeDemographics(filteredAds),
        engagement: this.analyzeEngagement(filteredAds),
        content: this.analyzeContent(filteredAds)
      };

      return {
        success: true,
        data: results
      };
    } catch (error) {
      console.error('分析数据时出错:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async exportData(format = 'json') {
    try {
      const { ads } = await chrome.storage.local.get('ads');
      if (!ads || !ads.length) {
        throw new Error('没有可导出的数据');
      }

      if (format === 'json') {
        return JSON.stringify(ads, null, 2);
      } else if (format === 'csv') {
        return this.convertToCSV(ads);
      } else {
        throw new Error('不支持的导出格式');
      }
    } catch (error) {
      console.error('导出数据时出错:', error);
      throw error;
    }
  }

  // 辅助方法
  filterAds(ads, filters) {
    return ads.filter(ad => {
      // 实现过滤逻辑
      return true;
    });
  }

  // 其他分析方法...
}

// 监听网络请求
chrome.webRequest.onCompleted.addListener(
  async (details) => {
    if (!this.isCapturing) return;

    try {
      if (details.url.includes('ads/manager/account_settings/')) {
        // 处理广告数据
        const response = await fetch(details.url);
        const data = await response.json();
        
        // 发送捕获成功消息
        chrome.tabs.sendMessage(details.tabId, {
          type: 'AD_CAPTURED',
          data: data
        });
      }
    } catch (error) {
      console.error('处理广告数据失败:', error);
      chrome.tabs.sendMessage(details.tabId, {
        type: 'CAPTURE_ERROR',
        error: error.message
      });
    }
  },
  {
    urls: [
      "*://*.facebook.com/*",
      "*://business.facebook.com/*"
    ]
  }
);

// 处理下载相关的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_DOWNLOAD') {
    chrome.downloads.download(message.options, (downloadId) => {
      sendResponse({ downloadId });
    });
    return true;
  }
});

// 初始化服务
const adService = new AdDataService();
adService.initialize().catch(error => {
  console.error('初始化 AdDataService 失败:', error);
}); 