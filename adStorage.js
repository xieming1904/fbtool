class AdStorage {
  constructor() {
    this.MAX_ADS = 100; // 最多存储100条广告
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    try {
      // 创建广告数据存储
      const { ads } = await chrome.storage.local.get('ads');
      if (!ads) {
        await chrome.storage.local.set({ ads: [] });
      }
      
      // 创建广告媒体资源存储
      const { adMedia } = await chrome.storage.local.get('adMedia');
      if (!adMedia) {
        await chrome.storage.local.set({ adMedia: {} });
      }

      this.initialized = true;
      console.log('广告存储初始化完成');
    } catch (error) {
      console.error('初始化广告存储失败:', error);
    }
  }

  async saveAd(adData) {
    try {
      await this.initialize();
      
      // 获取现有广告
      const { ads } = await chrome.storage.local.get('ads');
      const { adMedia } = await chrome.storage.local.get('adMedia');
      
      // 检查是否已存在相同广告
      const existingAdIndex = ads.findIndex(ad => ad.id === adData.id);
      
      if (existingAdIndex !== -1) {
        // 更新现有广告
        ads[existingAdIndex] = {
          ...adData,
          updatedAt: Date.now()
        };
      } else {
        // 添加新广告
        ads.unshift({
          ...adData,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
        
        // 限制广告数量
        if (ads.length > this.MAX_ADS) {
          // 删除多余的广告及其媒体资源
          const removedAds = ads.splice(this.MAX_ADS);
          removedAds.forEach(ad => {
            if (adMedia[ad.id]) {
              delete adMedia[ad.id];
            }
          });
        }
      }

      // 保存广告媒体资源
      if (adData.content.images?.length > 0) {
        adMedia[adData.id] = {
          images: await this.saveAdImages(adData.content.images),
          updatedAt: Date.now()
        };
      }

      // 保存更新后的数据
      await Promise.all([
        chrome.storage.local.set({ ads }),
        chrome.storage.local.set({ adMedia })
      ]);

      return true;
    } catch (error) {
      console.error('保存广告数据失败:', error);
      return false;
    }
  }

  async saveAdImages(images) {
    try {
      const savedImages = [];
      
      for (const image of images) {
        if (!image.src.includes('fbcdn.net')) continue;
        
        try {
          // 下载图片
          const response = await fetch(image.src);
          const blob = await response.blob();
          
          // 转换为Base64
          const base64 = await this.blobToBase64(blob);
          
          savedImages.push({
            src: base64,
            alt: image.alt,
            width: image.width,
            height: image.height
          });
        } catch (error) {
          console.error('保存图片失败:', error);
        }
      }
      
      return savedImages;
    } catch (error) {
      console.error('保存广告图片失败:', error);
      return [];
    }
  }

  blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async getAds(options = {}) {
    try {
      await this.initialize();
      
      const { ads } = await chrome.storage.local.get('ads');
      const { adMedia } = await chrome.storage.local.get('adMedia');
      
      let filteredAds = [...ads];

      // 应用过滤器
      if (options.timeRange) {
        const now = Date.now();
        const ranges = {
          '24h': 24 * 60 * 60 * 1000,
          '7d': 7 * 24 * 60 * 60 * 1000,
          '30d': 30 * 24 * 60 * 60 * 1000
        };
        
        if (ranges[options.timeRange]) {
          filteredAds = filteredAds.filter(ad => 
            (now - ad.createdAt) <= ranges[options.timeRange]
          );
        }
      }

      // 添加媒体资源
      return filteredAds.map(ad => ({
        ...ad,
        media: adMedia[ad.id] || null
      }));
    } catch (error) {
      console.error('获取广告数据失败:', error);
      return [];
    }
  }

  async clearOldAds(days = 30) {
    try {
      await this.initialize();
      
      const { ads } = await chrome.storage.local.get('ads');
      const { adMedia } = await chrome.storage.local.get('adMedia');
      
      const now = Date.now();
      const cutoff = now - (days * 24 * 60 * 60 * 1000);
      
      // 过滤掉旧广告
      const newAds = ads.filter(ad => ad.createdAt > cutoff);
      
      // 清理相关的媒体资源
      const newAdMedia = {};
      newAds.forEach(ad => {
        if (adMedia[ad.id]) {
          newAdMedia[ad.id] = adMedia[ad.id];
        }
      });
      
      // 保存更新后的数据
      await Promise.all([
        chrome.storage.local.set({ ads: newAds }),
        chrome.storage.local.set({ adMedia: newAdMedia })
      ]);
      
      return true;
    } catch (error) {
      console.error('清理旧广告失败:', error);
      return false;
    }
  }

  async deleteAd(adId) {
    try {
      await this.initialize();
      
      const { ads } = await chrome.storage.local.get('ads');
      const { adMedia } = await chrome.storage.local.get('adMedia');
      
      // 删除广告
      const newAds = ads.filter(ad => ad.id !== adId);
      
      // 删除相关媒体资源
      if (adMedia[adId]) {
        delete adMedia[adId];
      }
      
      // 保存更新后的数据
      await Promise.all([
        chrome.storage.local.set({ ads: newAds }),
        chrome.storage.local.set({ adMedia: adMedia })
      ]);
      
      return true;
    } catch (error) {
      console.error('删除广告失败:', error);
      return false;
    }
  }
}

// 导出单例实例
const adStorage = new AdStorage();
export default adStorage;

class AdTokenStorage {
  static async getToken() {
    // 从页面中获取令牌
    const token = localStorage.getItem('_accessToken') || 
                 localStorage.getItem('act') ||
                 localStorage.getItem('fb_access_token');
    
    if (token) {
      // 发送令牌到扩展
      chrome.runtime.sendMessage({
        type: 'FB_ACCESS_TOKEN',
        token: token
      });
    }
  }

  static async init() {
    // 监听来自扩展的消息
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'GET_FB_TOKEN') {
        AdTokenStorage.getToken();
      }
    });

    // 初始化时尝试获取令牌
    AdTokenStorage.getToken();
  }
}

// 初始化存储
AdTokenStorage.init(); 