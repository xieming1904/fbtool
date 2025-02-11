// 定义 AdStorage 类
class AdStorage {
  constructor() {
    this.MAX_ADS = 100;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    try {
      const { ads } = await chrome.storage.local.get('ads') || { ads: [] };
      const { adMedia } = await chrome.storage.local.get('adMedia') || { adMedia: {} };
      
      await chrome.storage.local.set({ ads: ads || [] });
      await chrome.storage.local.set({ adMedia: adMedia || {} });

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
      const { ads = [] } = await chrome.storage.local.get('ads');
      const { adMedia = {} } = await chrome.storage.local.get('adMedia');
      
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
}

// 创建 AdStorage 实例
const adStorage = new AdStorage();

// 定义 AdObserver 类
class AdObserver {
  constructor() {
    this.observedAds = new Set();
    this.isCapturing = false;
    this.isAutoScrolling = false;
    this.scrollInterval = null;
    this.initialized = false;
    this.videoRequests = new Map();
    this.currentAdId = null;
    this.pendingVideos = new Set();
    this.initializeNetworkListener();
  }

  async initialize() {
    if (this.initialized) return;

    try {
      // 初始化存储
      await adStorage.initialize();

      // 设置DOM观察器
      this.observer = new MutationObserver(this.handleDOMChanges.bind(this));
      this.startObserving();

      // 注入UI组件
      this.injectUI();
      
      // 定期检查新广告
      setInterval(() => this.checkForNewAds(), 5000);

      this.initialized = true;
      console.log('广告助手初始化完成');
    } catch (error) {
      console.error('初始化失败:', error);
    }
  }

  startObserving() {
    try {
      if (!this.observer) {
        this.observer = new MutationObserver(this.handleDOMChanges.bind(this));
      }

      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'aria-label', 'data-testid']
      });

      console.log('开始观察DOM变化');
    } catch (error) {
      console.error('启动观察器失败:', error);
    }
  }

  stopObserving() {
    this.observer.disconnect();
  }

  async handleDOMChanges(mutations) {
    if (!this.isCapturing) return;

    try {
      for (const mutation of mutations) {
        // 检查新增的节点
        if (mutation.addedNodes.length) {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const adElements = this.findAdElements(node);
              adElements.forEach(async adElement => {
                if (!this.observedAds.has(adElement)) {
                  console.log('发现新广告:', adElement);
                  await this.processAd(adElement);
                  this.observedAds.add(adElement);
                }
              });
            }
          });
        }

        // 检查属性变化
        if (mutation.type === 'attributes') {
          const target = mutation.target;
          if (this.isAdElement(target) && !this.observedAds.has(target)) {
            console.log('发现属性变化的广告:', target);
            await this.processAd(target);
            this.observedAds.add(target);
          }
        }
      }

      this.updateStats();
    } catch (error) {
      console.error('处理DOM变化时出错:', error);
    }
  }

  findAdElements(node) {
    // 改进广告元素识别
    const adSelectors = [
      '[data-testid="ad_root"]',
      '[aria-label*="赞助"]',
      '[aria-label*="Sponsored"]',
      '[data-pagelet*="FeedUnit_"]',
      '[role="article"]',
      // 添加更多选择器
      'div[data-pagelet^="FeedUnit"]',
      'div[data-pagelet*="feed_story"]',
      'div[role="article"]'
    ];
    
    const results = new Set();
    
    try {
      if (!node.querySelectorAll) return results;

      // 首先检查节点本身
      if (this.isAdElement(node)) {
        results.add(node);
      }

      // 然后检查子元素
      for (const selector of adSelectors) {
        const elements = node.querySelectorAll(selector);
        elements.forEach(element => {
          if (this.isAdElement(element)) {
            results.add(element);
          }
        });
      }
    } catch (error) {
      console.error('查找广告元素时出错:', error);
    }
    
    return Array.from(results);
  }

  isAdElement(element) {
    try {
      if (!element) return false;

      // 检查元素及其子元素的文本内容
      const text = element.textContent.toLowerCase();
      const sponsoredTexts = [
        '赞助', 'sponsored', '推广', 'спонсор', 
        'sponsorisé', 'sponsorizzato', 'patrocinado',
        'publicidad', 'gesponsert', '광고', '広告'
      ];

      // 检查是否包含赞助标记
      const hasSponsored = sponsoredTexts.some(term => text.includes(term));
      if (hasSponsored) return true;

      // 检查特定的广告属性
      const adAttributes = [
        '[data-testid="ad_root"]',
        '[aria-label*="赞助"]',
        '[aria-label*="Sponsored"]',
        'a[href*="/ads/"]',
        'a[href*="ad_type="]'
      ];

      return adAttributes.some(attr => 
        element.matches(attr) || element.querySelector(attr)
      );
    } catch (error) {
      console.error('检查广告元素时出错:', error);
      return false;
    }
  }

  async processAd(adElement) {
    try {
      if (!this.isCapturing) return;

      // 生成广告ID
      this.currentAdId = this.generateAdId(adElement);
      
      // 提取广告数据
      const adData = await this.extractAdData(adElement);
      if (!adData) return;

      // 检查是否有对应的视频
      const videoInfo = this.videoRequests.get(this.currentAdId);
      if (videoInfo) {
        adData.content.videos = [videoInfo];
      }

      // 保存广告数据
      const saved = await adStorage.saveAd(adData);
      if (!saved) {
        console.error('保存广告失败:', adData);
        return;
      }

      // 通知 popup 更新
      await chrome.runtime.sendMessage({
        type: 'AD_CAPTURED',
        data: adData
      });

      // 添加标记
      this.markAdAsCaptured(adElement);
      
      console.log('广告处理完成:', adData);
    } catch (error) {
      console.error('处理广告时出错:', error);
    } finally {
      this.currentAdId = null;
    }
  }

  highlightAd(element) {
    element.style.position = 'relative';
    const badge = document.createElement('div');
    badge.className = 'ad-capture-badge';
    badge.textContent = '已捕获';
    element.appendChild(badge);
  }

  async checkForNewAds() {
    if (!this.isCapturing) return;
    
    try {
      const allPossibleAds = document.querySelectorAll('[role="article"]');
      console.log('找到可能的广告:', allPossibleAds.length);

      for (const element of allPossibleAds) {
        if (this.isAdElement(element) && !this.observedAds.has(element)) {
          console.log('发现新广告元素');
          await this.processAd(element);
        }
      }
    } catch (error) {
      console.error('检查新广告时出错:', error);
    }
  }

  injectUI() {
    // 检查当前页面是否为广告库页面
    if (window.location.href.includes('facebook.com/ads/library')) {
      return; // 不在广告库页面显示捕获工具栏
    }

    // 注入样式
    const style = document.createElement('style');
    style.textContent = `
      .fb-ad-assistant-toolbar {
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: linear-gradient(145deg, #ffffff, #f0f2f5);
        padding: 12px;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1),
                    0 8px 16px rgba(0, 0, 0, 0.05),
                    inset 0 0 0 1px rgba(255, 255, 255, 0.5);
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 200px;
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.3);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        transform: translateZ(0);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .fb-ad-assistant-toolbar:hover {
        transform: translateZ(0) translateY(-2px);
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12),
                    0 12px 24px rgba(0, 0, 0, 0.08),
                    inset 0 0 0 1px rgba(255, 255, 255, 0.6);
      }

      .fb-ad-assistant-button {
        padding: 8px 16px;
        border: none;
        border-radius: 6px;
        background: #1877F2;
        color: white;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: all 0.3s ease;
        position: relative;
        overflow: hidden;
        text-shadow: 0 1px 1px rgba(0, 0, 0, 0.1);
      }

      .fb-ad-assistant-button::before {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(
          120deg,
          transparent,
          rgba(255, 255, 255, 0.2),
          transparent
        );
        transition: 0.5s;
      }

      .fb-ad-assistant-button:hover::before {
        left: 100%;
      }

      .fb-ad-assistant-button:hover {
        background: #166fe5;
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(24, 119, 242, 0.2);
      }

      .fb-ad-stats {
        padding: 10px;
        background: rgba(240, 242, 245, 0.6);
        border-radius: 6px;
        font-size: 13px;
        color: #1c1e21;
        border: 1px solid rgba(255, 255, 255, 0.8);
        backdrop-filter: blur(4px);
      }

      .fb-ad-stats div {
        display: flex;
        justify-content: space-between;
        margin: 6px 0;
        padding: 4px 8px;
        border-radius: 4px;
        transition: background-color 0.2s;
      }

      .fb-ad-stats div:hover {
        background: rgba(255, 255, 255, 0.6);
      }

      /* 拖动手柄 */
      .fb-ad-assistant-toolbar::before {
        content: '⋮⋮';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 20px;
        background: linear-gradient(to right, #f0f2f5, #ffffff);
        border-radius: 8px 8px 0 0;
        text-align: center;
        line-height: 20px;
        color: #65676b;
        cursor: move;
        user-select: none;
        border-bottom: 1px solid rgba(0, 0, 0, 0.05);
      }

      /* 悬浮窗可拖动 */
      .fb-ad-assistant-toolbar.dragging {
        opacity: 0.9;
        transform: scale(1.02);
        transition: none;
        cursor: grabbing;
      }

      .ad-capture-badge {
        position: absolute;
        top: 8px;
        right: 8px;
        background: #1877F2;
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        z-index: 999;
      }

      .ad-captured {
        position: relative;
        border: 2px solid #1877F2;
        border-radius: 8px;
        transition: border-color 0.3s;
      }
    `;

    document.head.appendChild(style);

    // 创建工具栏容器
    const toolbar = document.createElement('div');
    toolbar.className = 'fb-ad-assistant-toolbar';
    
    // 添加控制按钮
    const captureButton = document.createElement('button');
    captureButton.className = 'fb-ad-assistant-button';
    captureButton.textContent = '开始捕获';
    captureButton.onclick = () => this.toggleCapture();
    
    // 添加自动滚动按钮
    const autoScrollButton = document.createElement('button');
    autoScrollButton.className = 'fb-ad-assistant-button';
    autoScrollButton.textContent = '自动滚动';
    autoScrollButton.onclick = () => {
      if (this.isAutoScrolling) {
        autoScrollButton.textContent = '自动滚动';
        this.stopAutoScroll();
      } else {
        autoScrollButton.textContent = '停止滚动';
        this.startAutoScroll();
      }
    };
    
    // 添加统计信息区域
    const statsDiv = document.createElement('div');
    statsDiv.className = 'fb-ad-stats';
    statsDiv.innerHTML = `
      <div>已捕获广告: <span id="captured-count">0</span></div>
      <div>当前页面广告: <span id="current-page-ads">0</span></div>
      <div>自动滚动: <span id="auto-scroll-status">已停止</span></div>
    `;
    
    // 组装工具栏
    toolbar.appendChild(captureButton);
    toolbar.appendChild(autoScrollButton);
    toolbar.appendChild(statsDiv);
    
    // 添加到页面
    document.body.appendChild(toolbar);

    // 添加拖动功能
    this.makeDraggable(toolbar);
    
    // 更新统计信息的方法
    this.updateStats = () => {
      document.getElementById('captured-count').textContent = this.observedAds.size;
      const currentAds = document.querySelectorAll('[data-testid="ad_root"]').length;
      document.getElementById('current-page-ads').textContent = currentAds;
      document.getElementById('auto-scroll-status').textContent = 
        this.isAutoScrolling ? '进行中' : '已停止';
    };
  }

  // 添加拖动功能
  makeDraggable(element) {
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;

    element.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);

    function dragStart(e) {
      // 只允许从顶部拖动条开始拖动
      const rect = element.getBoundingClientRect();
      const isHandle = e.clientY - rect.top < 20;
      if (!isHandle) return;

      initialX = e.clientX - xOffset;
      initialY = e.clientY - yOffset;

      if (e.target === element) {
        isDragging = true;
        element.classList.add('dragging');
      }
    }

    function drag(e) {
      if (isDragging) {
        e.preventDefault();

        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;

        xOffset = currentX;
        yOffset = currentY;

        setTranslate(currentX, currentY, element);
      }
    }

    function dragEnd() {
      if (!isDragging) return;

      initialX = currentX;
      initialY = currentY;

      isDragging = false;
      element.classList.remove('dragging');
    }

    function setTranslate(xPos, yPos, el) {
      // 确保不超出屏幕边界
      const rect = el.getBoundingClientRect();
      const maxX = window.innerWidth - rect.width;
      const maxY = window.innerHeight - rect.height;

      xPos = Math.min(Math.max(0, xPos), maxX);
      yPos = Math.min(Math.max(0, yPos), maxY);

      el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
    }
  }

  async toggleCapture() {
    try {
      this.isCapturing = !this.isCapturing;
      
      // 更新UI状态
      const button = document.querySelector('.fb-ad-assistant-button');
      if (button) {
        button.textContent = this.isCapturing ? '停止捕获' : '开始捕获';
        button.style.background = this.isCapturing ? '#d32f2f' : '#1877F2';
      }

      if (this.isCapturing) {
        console.log('开始捕获广告...');
        this.startObserving();
        // 立即检查当前页面的广告
        await this.checkForNewAds();
      } else {
        console.log('停止捕获广告');
        this.stopObserving();
      }

      this.updateStats();
    } catch (error) {
      console.error('切换捕获状态失败:', error);
    }
  }

  toggleAutoScroll() {
    if (this.isAutoScrolling) {
      this.stopAutoScroll();
    } else {
      this.startAutoScroll();
    }
  }

  startAutoScroll() {
    if (!this.isCapturing) {
      alert('请先开启广告捕获');
      return;
    }

    this.isAutoScrolling = true;
    this.updateStats();

    // 自动滚动逻辑
    this.scrollInterval = setInterval(() => {
      // 检查是否到达底部
      const scrollHeight = document.documentElement.scrollHeight;
      const scrollTop = window.scrollY;
      const clientHeight = window.innerHeight;

      if (scrollTop + clientHeight >= scrollHeight) {
        // 等待新内容加载
        setTimeout(() => {
          // 如果5秒内没有新内容，停止自动滚动
          const newScrollHeight = document.documentElement.scrollHeight;
          if (newScrollHeight === scrollHeight) {
            this.stopAutoScroll();
          }
        }, 5000);
      }

      // 平滑滚动
      window.scrollBy({
        top: 300,
        behavior: 'smooth'
      });
    }, 2000); // 每2秒滚动一次
  }

  stopAutoScroll() {
    this.isAutoScrolling = false;
    if (this.scrollInterval) {
      clearInterval(this.scrollInterval);
      this.scrollInterval = null;
    }
    this.updateStats();
  }

  async extractAdData(adElement) {
    try {
      // 提取广告主信息
      const advertiserInfo = await this.extractAdvertiserInfo(adElement);
      
      // 提取互动数据
      const engagement = await this.extractEngagement(adElement);

      // 生成随机分析数据
      const analysis = this.generateAnalysis();

      // 生成唯一ID
      const id = this.generateAdId(adElement);

      // 提取广告数据
      const adData = {
        id,
        advertiser: advertiserInfo,
        content: {
          text: this.extractAdText(adElement),
          images: await this.extractAdImages(adElement),
          links: this.extractAdLinks(adElement),
          videos: await this.extractAdVideos(adElement)
        },
        engagement,
        analysis,
        timestamp: Date.now()
      };

      console.log('提取的广告数据:', adData);
      return adData;
    } catch (error) {
      console.error('提取广告数据时出错:', error);
      return null;
    }
  }

  generateAdId(element) {
    // 生成唯一广告ID
    return `ad_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  extractAdText(element) {
    // 提取广告文本内容
    const textElements = element.querySelectorAll('[data-ad-preview="message"]');
    return Array.from(textElements).map(el => el.textContent).join(' ').trim();
  }

  extractAdImages(element) {
    try {
      // 提取广告图片
      const images = element.querySelectorAll('img');
      const validImages = [];
      
      for (const img of images) {
        // 检查图片是否有效
        if (this.isValidAdImage(img)) {
          validImages.push({
            src: img.src,
            alt: img.alt || '',
            width: img.naturalWidth || img.width,
            height: img.naturalHeight || img.height
          });
        }
      }

      return validImages;
    } catch (error) {
      console.error('提取广告图片时出错:', error);
      return [];
    }
  }

  isValidAdImage(img) {
    try {
      // 检查图片链接
      if (!img.src) return false;

      // 检查是否是 Facebook CDN 图片
      const fbCdnDomains = [
        'fbcdn.net',
        'scontent',
        'scontent-nrt1-2.xx.fbcdn.net',
        'scontent-nrt1-1.xx.fbcdn.net'
      ];

      const isFbCdnImage = fbCdnDomains.some(domain => 
        img.src.toLowerCase().includes(domain)
      );

      if (!isFbCdnImage) return false;

      // 获取图片尺寸
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;

      // 排除太小的图片（可能是图标或头像）
      if (width < 100 || height < 100) {
        return false;
      }

      // 排除正方形小图（可能是用户头像）
      if (width === height && width < 150) {
        return false;
      }

      // 检查图片是否在可见区域内
      const rect = img.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return false;
      }

      // 检查图片URL是否包含广告相关关键词
      const adImageKeywords = [
        '/t45.1600-4/',  // 广告图片特定路径
        '/ads/',
        '/sponsored/',
        '/promotion/'
      ];

      const hasAdKeyword = adImageKeywords.some(keyword => 
        img.src.includes(keyword)
      );

      // 如果是大尺寸图片或包含广告关键词，则认为是有效的广告图片
      return hasAdKeyword || (width >= 300 && height >= 250);

    } catch (error) {
      console.error('检查图片有效性时出错:', error);
      return false;
    }
  }

  renderAdImages(images) {
    if (!images || images.length === 0) return '';
    
    const imageElements = images
      .filter(img => img.src.includes('fbcdn.net')) // 再次确保只显示 fbcdn.net 的图片
      .slice(0, 3) // 最多显示3张图片
      .map(img => {
        // 计算图片显示尺寸
        const aspectRatio = img.width / img.height;
        const displayWidth = 60;
        const displayHeight = Math.round(displayWidth / aspectRatio);

        return `
          <img 
            src="${this.escapeHtml(img.src)}" 
            alt="${this.escapeHtml(img.alt)}" 
            class="ad-image"
            style="width: ${displayWidth}px; height: ${displayHeight}px;"
            loading="lazy"
            onerror="this.style.display='none'"
          />
        `;
      }).join('');
        
    return imageElements ? `<div class="ad-images">${imageElements}</div>` : '';
  }

  extractAdLinks(element) {
    // 提取广告链接
    const links = element.querySelectorAll('a[href]');
    return Array.from(links).map(link => ({
      url: link.href,
      text: link.textContent.trim()
    }));
  }

  async extractAdvertiserInfo(element) {
    try {
      // 查找广告主信息容器
      const advertiserSelectors = [
        // 新增特定类名的选择器
        'span.xdj266r.x11i5rnm.xat24cr.x1mh8g0r.xexx8yu.x4uap5.x18d9i69.xkhd6sd.x1hl2dhg.x16tdsg8.x1vvkbs',
        // 新增通用的广告主名称选择器
        '[role="link"] > span.x1lliihq',
        'span[dir="auto"].x1lliihq',
        // 原有的选择器
        'a[role="link"][aria-label*="公共主页"]',
        'a[role="link"][aria-label*="Page"]',
        '[data-testid="ad-preview-advertiser"]',
        'a[role="link"][href*="/pages/"]',
        'a[role="link"][href*="/profile.php"]',
        'span[dir="auto"] > a[role="link"]'
      ];

      const info = {
        name: '',
        link: '',
        pageType: '公共主页',
        verified: false,
        followers: ''
      };

      // 尝试查找广告主名称
      const advertiserElement = advertiserSelectors
        .map(selector => element.querySelector(selector))
        .find(el => el && el.textContent.trim());

      if (advertiserElement) {
        // 提取广告主名称
        let name = advertiserElement.textContent.trim();

        // 清理名称
        name = name
          .replace(/公共主页|Page|粉絲專頁|公開社團|公共社團|Sponsored|赞助|推广/g, '')
          .replace(/\s+/g, ' ')
          .trim();

        info.name = name;

        // 尝试获取链接
        const linkElement = advertiserElement.closest('a[role="link"]') || 
                           advertiserElement.querySelector('a[role="link"]') ||
                           element.querySelector('a[role="link"][href*="/pages/"]') ||
                           element.querySelector('a[role="link"][href*="/profile.php"]');

        if (linkElement) {
          info.link = linkElement.href;
        }

        // 查找认证标记
        const verifiedSelectors = [
          '[aria-label*="已验证"]',
          '[aria-label*="verified"]',
          '[aria-label*="已驗證"]',
          'div[role="img"][aria-label*="认证"]',
          'div[role="img"][aria-label*="verified"]'
        ];

        const verifiedBadge = verifiedSelectors
          .map(selector => element.querySelector(selector))
          .find(el => el);

        info.verified = !!verifiedBadge;

        // 查找关注者信息
        const followersSelectors = [
          'span:not([class])',
          '[role="contentinfo"]',
          '[data-testid="page_likers"]',
          'span.x193iq5w',  // 新增可能包含关注者信息的类名
          'span[dir="auto"]:not(.x1lliihq)'  // 排除广告主名称的span
        ];

        const followersText = Array.from(element.querySelectorAll(followersSelectors.join(',')))
          .find(span => {
            const text = span.textContent.toLowerCase();
            return text.includes('位追蹤者') || 
                   text.includes('個讚') || 
                   text.includes('followers') || 
                   text.includes('likes') ||
                   text.includes('位关注者') ||
                   text.includes('人赞了');
          });

        if (followersText) {
          info.followers = followersText.textContent.trim();
        }

        // 尝试获取页面类别
        const categorySelectors = [
          '[data-testid="page_category"]',
          'span[dir="auto"]:not(.x1lliihq)',  // 排除广告主名称
          'a[role="link"] + span',
          'span.x193iq5w'  // 新增可能包含类别信息的类名
        ];

        const categoryElement = categorySelectors
          .map(selector => element.querySelector(selector))
          .find(el => el?.textContent.includes('·'));

        if (categoryElement) {
          const categoryText = categoryElement.textContent.split('·')[1]?.trim();
          if (categoryText) {
            info.category = categoryText;
          }
        }

        console.log('提取的广告主信息:', info);
      }

      return info;
    } catch (error) {
      console.error('提取广告主信息时出错:', error);
      return {
        name: '未知广告主',
        link: '',
        pageType: '公共主页',
        verified: false,
        followers: ''
      };
    }
  }

  async extractEngagement(element) {
    const engagement = {
      likes: 0,
      comments: 0,
      shares: 0,
      reactions: {
        like: 0,
        love: 0,
        care: 0,
        haha: 0,
        wow: 0,
        sad: 0,
        angry: 0
      }
    };

    try {
      // 提取点赞数
      const likeElement = element.querySelector('[aria-label*="赞"]');
      if (likeElement) {
        engagement.likes = this.parseNumber(likeElement.textContent);
      }

      // 提取评论数
      const commentElement = element.querySelector('[aria-label*="评论"]');
      if (commentElement) {
        engagement.comments = this.parseNumber(commentElement.textContent);
      }

      // 提取分享数
      const shareElement = element.querySelector('[aria-label*="分享"]');
      if (shareElement) {
        engagement.shares = this.parseNumber(shareElement.textContent);
      }

      // 提取详细反应数据
      const reactionsElement = element.querySelector('[aria-label*="查看谁对此作出反应"]');
      if (reactionsElement) {
        const reactionsText = reactionsElement.getAttribute('aria-label');
        engagement.reactions = this.parseReactions(reactionsText);
      }
    } catch (error) {
      console.error('提取互动数据时出错:', error);
    }

    return engagement;
  }

  parseNumber(text) {
    if (!text) return 0;
    // 处理"1.2万"这样的格式
    if (text.includes('万')) {
      return Math.floor(parseFloat(text.replace('万', '')) * 10000);
    }
    // 处理"1,234"这样的格式
    return parseInt(text.replace(/[^0-9]/g, '')) || 0;
  }

  parseReactions(text) {
    const reactions = {
      like: 0,
      love: 0,
      care: 0,
      haha: 0,
      wow: 0,
      sad: 0,
      angry: 0
    };

    if (!text) return reactions;

    // 解析类似 "小明、小红和其他 1,234 人" 的文本
    const matches = text.match(/(\d+(?:,\d+)*)/g);
    if (matches) {
      reactions.like = this.parseNumber(matches[0]);
    }

    return reactions;
  }

  generateAnalysis() {
    // 生成随机年龄分布
    const ageGroups = ['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
    const ageDistribution = {};
    let remainingPercentage = 100;
    
    ageGroups.forEach((group, index) => {
      if (index === ageGroups.length - 1) {
        // 最后一个年龄组分配剩余百分比
        ageDistribution[group] = remainingPercentage;
      } else {
        // 随机生成一个合理的百分比
        const maxPercent = Math.min(remainingPercentage * 0.7, 45); // 最大45%
        const percentage = Math.round(Math.random() * maxPercent);
        ageDistribution[group] = percentage;
        remainingPercentage -= percentage;
      }
    });

    // 生成随机性别分布
    const genderDistribution = {
      male: Math.round(Math.random() * 60 + 20), // 20-80%
      female: 0
    };
    genderDistribution.female = 100 - genderDistribution.male;

    // 生成随机兴趣分布
    const interests = [
      '购物', '科技', '娱乐', '游戏', '美食', '旅行', 
      '时尚', '运动', '教育', '商业', '音乐', '电影',
      '健康', '美容', '家居', '汽车', '宠物', '艺术'
    ];
    
    const selectedInterests = {};
    const interestCount = Math.floor(Math.random() * 5) + 3; // 3-7个兴趣
    
    for (let i = 0; i < interestCount; i++) {
      const interest = interests[Math.floor(Math.random() * interests.length)];
      selectedInterests[interest] = Math.round(Math.random() * 50 + 20); // 20-70%
    }

    // 生成内容类型分析
    const contentTypes = ['促销', '品牌推广', '产品介绍', '活动宣传', '服务推广'];
    const selectedTypes = [];
    const typeCount = Math.floor(Math.random() * 2) + 1; // 1-2个类型
    
    for (let i = 0; i < typeCount; i++) {
      const type = contentTypes[Math.floor(Math.random() * contentTypes.length)];
      if (!selectedTypes.includes(type)) {
        selectedTypes.push(type);
      }
    }

    // 生成情感分析
    const sentiments = ['positive', 'neutral', 'negative'];
    const sentimentWeights = [0.6, 0.3, 0.1]; // 更可能是积极的
    const sentiment = {
      label: this.weightedRandom(sentiments, sentimentWeights),
      score: Math.random().toFixed(2)
    };

    return {
      demographics: {
        age: ageDistribution,
        gender: genderDistribution
      },
      interests: selectedInterests,
      contentType: selectedTypes,
      sentiment: sentiment,
      engagement: {
        rate: (Math.random() * 5 + 1).toFixed(2), // 1-6%
        quality: (Math.random() * 0.5 + 0.5).toFixed(2) // 0.5-1.0
      }
    };
  }

  weightedRandom(items, weights) {
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let random = Math.random() * totalWeight;
    
    for (let i = 0; i < items.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return items[i];
      }
    }
    
    return items[items.length - 1];
  }

  initializeNetworkListener() {
    // 拦截 XHR 请求
    const originalXHR = window.XMLHttpRequest;
    window.XMLHttpRequest = function() {
      const xhr = new originalXHR();
      const originalOpen = xhr.open;
      const originalSend = xhr.send;
      const self = this;

      xhr.open = function() {
        this.requestMethod = arguments[0];
        this.requestUrl = arguments[1];
        originalOpen.apply(this, arguments);
      };

      xhr.send = function() {
        this.addEventListener('load', function() {
          try {
            // 检查响应内容是否包含视频信息
            const responseText = this.responseText;
            if (responseText && responseText.includes('video')) {
              const videoData = self.extractVideoFromResponse(responseText);
              if (videoData) {
                self.handleVideoRequest({
                  name: videoData.url,
                  type: 'video/mp4',
                  quality: videoData.quality || '720p'
                });
              }
            }
          } catch (error) {
            console.error('XHR 请求处理错误:', error);
          }
        });
        originalSend.apply(this, arguments);
      };

      return xhr;
    }.bind(this);
  }

  extractVideoFromResponse(responseText) {
    try {
      // 尝试解析 JSON 响应
      const data = JSON.parse(responseText);
      
      // 检查常见的视频数据结构
      const videoPatterns = [
        'video_data',
        'videoData',
        'video_url',
        'playbackUrl',
        'hd_src',
        'sd_src'
      ];

      for (const pattern of videoPatterns) {
        const value = this.getNestedValue(data, pattern);
        if (value && typeof value === 'string' && this.isValidVideoUrl(value)) {
          return { url: value };
        }
      }

      // 检查视频质量数组
      const qualities = ['HD', 'SD'];
      for (const quality of qualities) {
        const url = this.getNestedValue(data, `${quality.toLowerCase()}_src`);
        if (url && this.isValidVideoUrl(url)) {
          return { url, quality };
        }
      }

      return null;
    } catch (error) {
      // 如果不是 JSON，尝试使用正则表达式匹配
      const videoUrlMatches = responseText.match(
        /"(?:video_url|playbackUrl|hd_src|sd_src)"\s*:\s*"([^"]+)"/
      );
      
      if (videoUrlMatches && this.isValidVideoUrl(videoUrlMatches[1])) {
        return { url: videoUrlMatches[1].replace(/\\/g, '') };
      }

      return null;
    }
  }

  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => 
      current && current[key] !== undefined ? current[key] : undefined, obj
    );
  }

  async extractAdVideos(adElement) {
    try {
      const videos = [];

      // 1. 检查视频容器
      const videoContainers = adElement.querySelectorAll('[data-video-id], [data-video], .video-container');
      for (const container of videoContainers) {
        // 检查 data 属性
        const videoData = this.extractVideoDataFromContainer(container);
        if (videoData) {
          videos.push(videoData);
          continue;
        }

        // 检查内联 JSON 数据
        const jsonData = this.extractVideoJsonFromElement(container);
        if (jsonData) {
          videos.push(jsonData);
        }
      }

      // 2. 检查视频元素
      const videoElements = adElement.querySelectorAll('video');
      for (const video of videoElements) {
        const videoInfo = this.extractVideoInfoFromElement(video);
        if (videoInfo) {
          videos.push(videoInfo);
        }
      }

      // 3. 检查已捕获的请求
      const capturedVideo = this.videoRequests.get(this.currentAdId);
      if (capturedVideo) {
        videos.push(capturedVideo);
      }

      // 去重并保留最高质量
      return this.deduplicateVideos(videos);
    } catch (error) {
      console.error('提取视频失败:', error);
      return [];
    }
  }

  extractVideoDataFromContainer(container) {
    try {
      // 检查所有可能的数据属性
      const dataAttributes = [
        'data-video',
        'data-video-id',
        'data-video-source',
        'data-video-url',
        'data-playback-url',
        'data-hd-src',
        'data-sd-src'
      ];

      for (const attr of dataAttributes) {
        const value = container.getAttribute(attr);
        if (!value) continue;

        try {
          const data = JSON.parse(value);
          const videoUrl = this.findVideoUrlInData(data);
          if (videoUrl) {
            return {
              url: videoUrl,
              type: 'video/mp4',
              quality: this.detectVideoQualityFromData(data),
              timestamp: Date.now()
            };
          }
        } catch {
          if (this.isValidVideoUrl(value)) {
            return {
              url: value,
              type: 'video/mp4',
              quality: '720p',
              timestamp: Date.now()
            };
          }
        }
      }

      return null;
    } catch (error) {
      console.error('提取容器视频数据失败:', error);
      return null;
    }
  }

  findVideoUrlInData(data) {
    const urlKeys = [
      'video_url',
      'videoUrl',
      'url',
      'playbackUrl',
      'hd_src',
      'sd_src',
      'source'
    ];

    for (const key of urlKeys) {
      const value = this.getNestedValue(data, key);
      if (value && typeof value === 'string' && this.isValidVideoUrl(value)) {
        return value;
      }
    }

    return null;
  }

  extractVideoInfoFromElement(video) {
    try {
      // 获取视频源
      const sources = Array.from(video.querySelectorAll('source'));
      const urls = [
        video.src,
        video.currentSrc,
        ...sources.map(source => source.src)
      ].filter(Boolean);

      // 获取 data 属性中的视频信息
      const dataUrl = video.dataset.videoUrl || video.dataset.video;

      if (dataUrl) {
        urls.push(dataUrl);
      }

      // 过滤并返回有效的视频 URL
      const validUrls = urls.filter(url => this.isValidVideoUrl(url));
      if (validUrls.length > 0) {
        return {
          url: validUrls[0],
          type: 'video/mp4',
          quality: this.detectVideoQualityFromElement(video),
          timestamp: Date.now()
        };
      }

      return null;
    } catch (error) {
      console.error('提取视频元素信息失败:', error);
      return null;
    }
  }

  deduplicateVideos(videos) {
    // 按质量排序并去重
    const uniqueVideos = new Map();
    
    videos.forEach(video => {
      const quality = this.getQualityScore(video.quality);
      const existing = uniqueVideos.get(video.url);
      
      if (!existing || this.getQualityScore(existing.quality) < quality) {
        uniqueVideos.set(video.url, video);
      }
    });

    return Array.from(uniqueVideos.values());
  }

  detectVideoQualityFromElement(element) {
    const width = element.videoWidth || element.width || 0;
    if (width >= 1920) return '1080p';
    if (width >= 1280) return '720p';
    if (width >= 854) return '480p';
    return '360p';
  }

  detectVideoQualityFromData(data) {
    try {
      // 检查常见的质量指示器
      if (data.quality) return data.quality;
      if (data.hd_src) return '720p';
      if (data.sd_src) return '480p';

      // 检查分辨率
      const width = data.width || data.videoWidth || 0;
      if (width >= 1920) return '1080p';
      if (width >= 1280) return '720p';
      if (width >= 854) return '480p';
      
      // 检查其他质量指示器
      const qualityIndicators = {
        'HD': '720p',
        'high': '720p',
        'medium': '480p',
        'low': '360p'
      };

      for (const [indicator, quality] of Object.entries(qualityIndicators)) {
        if (JSON.stringify(data).toLowerCase().includes(indicator.toLowerCase())) {
          return quality;
        }
      }

      return '720p'; // 默认质量
    } catch (error) {
      console.error('检测视频质量失败:', error);
      return '720p';
    }
  }

  markAdAsCaptured(adElement) {
    try {
      // 添加标记类
      adElement.classList.add('ad-captured');
      // 添加高亮效果
      this.highlightAd(adElement);
      // 更新统计
      this.updateStats();
    } catch (error) {
      console.error('标记广告时出错:', error);
    }
  }

  isValidVideoUrl(url) {
    if (!url) return false;

    try {
      const urlObj = new URL(url);
      const validDomains = [
        'fbcdn.net',
        'facebook.com',
        'fbsbx.com',
        'fb.com',
        'fb.watch',
        'fbcdn.com'
      ];

      return validDomains.some(domain => urlObj.hostname.includes(domain));
    } catch {
      return false;
    }
  }

  getQualityScore(quality) {
    const scores = {
      '1080p': 4,
      '720p': 3,
      '480p': 2,
      '360p': 1
    };
    return scores[quality] || 0;
  }

  extractVideoJsonFromElement(element) {
    try {
      // 查找包含视频数据的脚本标签
      const scripts = element.querySelectorAll('script');
      for (const script of scripts) {
        const content = script.textContent;
        if (!content || !content.includes('video')) continue;

        // 尝试提取 JSON 数据
        const jsonMatch = content.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
          try {
            const data = JSON.parse(jsonMatch[0]);
            const videoUrl = this.findVideoUrlInData(data);
            if (videoUrl) {
              return {
                url: videoUrl,
                type: 'video/mp4',
                quality: this.detectVideoQualityFromData(data),
                timestamp: Date.now()
              };
            }
          } catch (e) {
            console.warn('解析视频 JSON 失败:', e);
          }
        }

        // 尝试直接匹配视频 URL
        const urlMatch = content.match(/"(?:video_url|playbackUrl|hd_src|sd_src)"\s*:\s*"([^"]+)"/);
        if (urlMatch && this.isValidVideoUrl(urlMatch[1])) {
          return {
            url: urlMatch[1].replace(/\\/g, ''),
            type: 'video/mp4',
            quality: '720p',
            timestamp: Date.now()
          };
        }
      }

      return null;
    } catch (error) {
      console.error('提取视频 JSON 失败:', error);
      return null;
    }
  }

  async handleVideoRequest(request) {
    try {
      if (!this.isCapturing || !this.currentAdId) return;

      const url = request.name;
      if (!this.isValidVideoUrl(url) || this.pendingVideos.has(url)) return;

      this.pendingVideos.add(url);

      // 提取视频信息
      const videoInfo = {
        url: url,
        type: 'video/mp4',
        quality: this.detectVideoQuality(request),
        timestamp: Date.now()
      };

      // 更新或添加视频信息
      const existingVideo = this.videoRequests.get(this.currentAdId);
      if (existingVideo) {
        const existingQuality = this.getQualityScore(existingVideo.quality);
        const newQuality = this.getQualityScore(videoInfo.quality);
        
        if (newQuality > existingQuality) {
          this.videoRequests.set(this.currentAdId, videoInfo);
          console.log('更新为更高质量的视频:', videoInfo);
        }
      } else {
        this.videoRequests.set(this.currentAdId, videoInfo);
        console.log('捕获新视频:', videoInfo);
      }

      this.pendingVideos.delete(url);
    } catch (error) {
      console.error('处理视频请求时出错:', error);
      this.pendingVideos.delete(request.name);
    }
  }

  detectVideoQuality(request) {
    const url = request.name.toLowerCase();
    const patterns = {
      '1080p': ['1080p', 'hd', 'high'],
      '720p': ['720p', 'hd'],
      '480p': ['480p', 'sd'],
      '360p': ['360p', 'low']
    };

    for (const [quality, keywords] of Object.entries(patterns)) {
      if (keywords.some(keyword => url.includes(keyword))) {
        return quality;
      }
    }

    return '720p'; // 默认质量
  }
}

// 立即初始化
function initializeExtension() {
  try {
    console.log('开始初始化扩展...');
    const adObserver = new AdObserver();
    adObserver.initialize().then(() => {
      console.log('扩展初始化完成');
    }).catch(error => {
      console.error('扩展初始化失败:', error);
    });
  } catch (error) {
    console.error('创建 AdObserver 实例失败:', error);
  }
}

// 确保在页面加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
  initializeExtension();
}

// 获取广告账户数据
async function getAdAccounts() {
  try {
    // 从页面中获取必要的数据
    const dtsg = document.querySelector('input[name="fb_dtsg"]')?.value;
    const userId = document.cookie.match(/c_user=(\d+)/)?.[1];
    
    if (!dtsg || !userId) {
      throw new Error('无法获取必要的认证信息');
    }

    // 发送请求获取账户数据
    const response = await fetch('https://business.facebook.com/api/graphql/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        fb_dtsg: dtsg,
        variables: JSON.stringify({
          userID: userId,
          timezone: 8,
          options: {
            include_headers: true,
            is_business_user: true,
            business_id: null
          }
        }),
        doc_id: '5624054241024591'
      }),
      credentials: 'include'
    });

    const data = await response.json();
    
    // 解析账户数据
    if (data.data?.viewer?.ad_accounts?.edges) {
      return data.data.viewer.ad_accounts.edges.map(edge => ({
        id: edge.node.id,
        name: edge.node.name,
        account_id: edge.node.account_id,
        status: edge.node.account_status,
        currency: edge.node.currency,
        balance: edge.node.balance?.formatted_amount || '0',
        spend_cap: edge.node.spend_cap?.formatted_amount || '无限制'
      }));
    }

    return [];
  } catch (error) {
    console.error('获取广告账户失败:', error);
    return [];
  }
}

// 动态加载模块
async function loadModules() {
  try {
    // 获取模块URL
    const videoDownloaderUrl = chrome.runtime.getURL('videoDownloader.js');
    const adLibraryVideoUrl = chrome.runtime.getURL('adLibraryVideo.js');
    const downloadManagerUrl = chrome.runtime.getURL('downloadManager.js');

    // 检查是否已加载
    if (document.querySelector(`script[src="${videoDownloaderUrl}"]`)) {
      return;
    }

    console.log('开始加载模块...');

    // 按顺序加载脚本
    await loadScript(downloadManagerUrl);
    await loadScript(videoDownloaderUrl);
    await loadScript(adLibraryVideoUrl);

    // 确保在广告库页面初始化视频下载器
    if (window.location.href.includes('facebook.com/ads/library')) {
      console.log('在广告库页面，初始化视频下载器');
      if (window.adLibraryVideoDownloader) {
        console.log('视频下载器已存在');
      } else {
        console.log('创建新的视频下载器实例');
        window.adLibraryVideoDownloader = new AdLibraryVideoDownloader();
      }
    }

    console.log('所有模块加载完成');
  } catch (error) {
    console.error('加载模块失败:', error);
  }
}

// 辅助函数：加载脚本
function loadScript(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.type = 'module';
    script.src = url;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// 初始化
loadModules();

// 处理从页面脚本发来的消息
window.addEventListener('message', async (event) => {
  if (event.source !== window) return;

  const { type, data } = event.data;
  
  switch (type) {
    case 'GET_DOWNLOAD_HISTORY':
      // 获取下载历史
      const result = await chrome.storage.local.get('downloadHistory');
      window.postMessage({
        type: 'DOWNLOAD_HISTORY_DATA',
        data: result.downloadHistory
      }, '*');
      break;

    case 'SAVE_DOWNLOAD_HISTORY':
      // 保存下载历史
      await chrome.storage.local.set({ downloadHistory: data });
      break;

    case 'DOWNLOAD_PROGRESS':
      // 转发下载进度消息
      chrome.runtime.sendMessage({
        type: 'DOWNLOAD_PROGRESS',
        data: data
      });
      break;
  }
});

// 监听来自 background 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'DOWNLOAD_STATE_CHANGED') {
    // 转发给页面脚本
    window.postMessage({
      type: 'DOWNLOAD_STATE_CHANGED',
      data: message.data
    }, '*');
  }
}); 