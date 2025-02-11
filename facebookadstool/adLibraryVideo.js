// 广告库视频下载器类
class AdLibraryVideoDownloader {
  constructor() {
    console.log('AdLibraryVideoDownloader 构造函数被调用');
    // 等待全局实例初始化
    const checkDependencies = setInterval(() => {
      console.log('检查依赖...', !!window.videoDownloader, !!window.downloadManager);
      if (window.videoDownloader && window.downloadManager) {
        clearInterval(checkDependencies);
        this.downloader = window.videoDownloader;
        this.downloadManager = window.downloadManager;
        console.log('依赖加载完成，开始初始化');
        this.initialize();
      }
    }, 100);

    this.videoSelectors = [
      // 广告库视频选择器
      '[data-video-id]',
      '.video-container',
      '[data-video]',
      // 广告预览视频
      '[data-ad-preview-video]',
      '.ad-preview-video',
      // 通用视频选择器
      'video',
      '[role="article"] div[role="presentation"]',
      // 其他可能的容器
      '[data-video-player]',
      '[data-video-element]'
    ];
  }

  initialize() {
    // 检查当前页面是否为广告库页面
    console.log('当前页面URL:', window.location.href);
    if (!window.location.href.includes('facebook.com/ads/library')) {
      console.log('不在广告库页面，跳过初始化');
      return; // 不在广告库页面不初始化
    }

    console.log('初始化广告库视频下载器');
    
    try {
      // 注入UI
      this.injectUI();
      
      // 设置自动扫描
      this.setupAutoScan();
      
      // 设置页面观察器
      this.observePageChanges();
      
      // 设置消息监听
      this.setupMessageListener();
      
      // 监听URL变化
      this.observeUrlChanges();
      
      console.log('广告库视频下载器初始化完成');
    } catch (error) {
      console.error('初始化失败:', error);
    }
  }

  setupAutoScan() {
    // 立即执行一次扫描
    this.scanForVideos();
    
    // 设置定期扫描
    setInterval(() => {
      if (window.location.href.includes('facebook.com/ads/library')) {
        console.log('执行定期扫描...');
        this.scanForVideos();
      }
    }, 5000);
  }

  injectUI() {
    console.log('开始注入UI...');

    // 再次确认是否在广告库页面
    if (!window.location.href.includes('facebook.com/ads/library')) {
      return;
    }

    // 检查是否已存在UI
    if (document.querySelector('.video-download-btn')) {
      console.log('UI已存在，跳过注入');
      return;
    }

    // 注入全局样式
    const style = document.createElement('style');
    style.textContent = `
      /* 广告库视频下载悬浮窗 */
      .video-download-btn {
        position: fixed;
        right: 20px;
        top: 20px;
        padding: 12px 20px;
        background: linear-gradient(145deg, #1877f2, #166fe5);
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
        z-index: 999999;
        display: flex;
        align-items: center;
        gap: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        transition: all 0.3s ease;
      }

      .video-download-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 16px rgba(0,0,0,0.2);
      }

      .video-download-btn.scanning {
        background: linear-gradient(145deg, #42b72a, #36a420);
        pointer-events: none;
      }

      .video-download-btn .spinner {
        width: 16px;
        height: 16px;
        border: 2px solid #fff;
        border-top-color: transparent;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        display: none;
      }

      .video-download-btn.scanning .spinner {
        display: inline-block;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      /* 视频列表面板 */
      .video-list-panel {
        position: fixed;
        right: 20px;
        top: 80px;
        width: 800px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        z-index: 999998;
        display: none;
        overflow: hidden;
      }

      .video-list-panel.show {
        display: block;
      }

      .panel-header {
        padding: 16px;
        background: #f8f9fa;
        border-bottom: 1px solid #e4e6eb;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .panel-title {
        font-size: 16px;
        font-weight: 600;
        color: #1c1e21;
        margin: 0;
      }

      .panel-body {
        max-height: 500px;
        overflow-y: auto;
        padding: 16px;
      }

      .video-table {
        width: 100%;
        border-collapse: collapse;
      }

      .video-table th,
      .video-table td {
        padding: 12px;
        text-align: left;
        border-bottom: 1px solid #e4e6eb;
        font-size: 14px;
      }

      .video-table th {
        background: #f8f9fa;
        font-weight: 600;
        color: #65676b;
        position: sticky;
        top: 0;
      }

      .video-table tr:hover {
        background: #f0f2f5;
      }

      .video-table .download-btn {
        padding: 6px 12px;
        background: #1877f2;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
        transition: all 0.2s ease;
      }

      .video-table .download-btn:hover {
        background: #166fe5;
      }

      .video-table .download-btn.downloading {
        background: #42b72a;
        pointer-events: none;
      }

      .video-link {
        color: #1877f2;
        text-decoration: none;
        display: block;
        max-width: 400px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .video-link:hover {
        text-decoration: underline;
      }
    `;

    // 创建扫描按钮
    const button = document.createElement('button');
    button.className = 'video-download-btn';
    button.innerHTML = `
      <div class="spinner"></div>
      <span class="icon">🎬</span>
      <span class="text">扫描视频</span>
      <span class="count" style="display: none">(<span class="video-count">0</span>)</span>
    `;

    // 创建视频列表面板
    const panel = document.createElement('div');
    panel.className = 'video-list-panel';
    panel.innerHTML = `
      <div class="panel-header">
        <h3 class="panel-title">扫描到的视频</h3>
        <span class="video-count-label">共 <span class="video-count">0</span> 个视频</span>
      </div>
      <div class="panel-body">
        <table class="video-table">
          <thead>
            <tr>
              <th style="width: 60px">序号</th>
              <th>视频链接</th>
              <th style="width: 200px">操作</th>
            </tr>
          </thead>
          <tbody class="video-list"></tbody>
        </table>
      </div>
    `;

    // 添加到页面
    document.head.appendChild(style);
    document.body.appendChild(button);
    document.body.appendChild(panel);

    // 绑定事件
    this.bindEvents(button, panel);

    console.log('UI注入完成');
  }

  bindEvents(button, videoListCard) {
    button.addEventListener('click', async () => {
      if (button.classList.contains('scanning')) return;
      
      // 开始扫描
      button.classList.add('scanning');
      button.querySelector('.text').textContent = '扫描中...';
      videoListCard.classList.remove('show');
      
      await this.scanForVideos();
      
      // 扫描完成
      button.classList.remove('scanning');
      button.querySelector('.text').textContent = '扫描视频';
      
      const count = document.querySelector('.video-count');
      if (count && parseInt(count.textContent) > 0) {
        button.querySelector('.count').style.display = 'inline';
        videoListCard.classList.add('show');
      }
    });

    // 点击其他地方关闭列表
    document.addEventListener('click', (e) => {
      if (!button.contains(e.target) && !videoListCard.contains(e.target)) {
        videoListCard.classList.remove('show');
      }
    });

    // 添加视频列表的点击事件委托
    videoListCard.addEventListener('click', (e) => {
      const videoItem = e.target.closest('.video-item');
      if (videoItem) {
        const url = videoItem.dataset.url;
        this.downloadVideo(url);
        // 添加下载状态指示
        videoItem.classList.add('downloading');
        videoItem.querySelector('.download-icon').textContent = '⌛';
      }
    });
  }

  scanForVideos() {
    // 确认是否在广告库页面
    if (!window.location.href.includes('facebook.com/ads/library')) {
      return;
    }

    console.log('开始扫描视频...');

    // 显示检测状态
    this.showStatusTip(true);

    // 检查网络请求中的视频
    const videoUrls = this.findVideoUrlsInNetwork();
    console.log('找到视频URL:', videoUrls.length);

    if (videoUrls.length > 0) {
      this.showStatusTip(false);
      this.updateVideoList(videoUrls);
      console.log(`检测到 ${videoUrls.length} 个视频`);
      this.showToast(`已找到 ${videoUrls.length} 个视频`);
      return;
    }

    this.showToast('未检测到视频', true);
  }

  isValidVideoContainer(container) {
    // 检查是否包含视频元素或视频数据
    return (
      container.querySelector('video') ||
      container.getAttribute('data-video-id') ||
      container.querySelector('[data-video-id]') ||
      container.querySelector('[role="article"] video')
    );
  }

  addDownloadButton(container) {
    // 检查容器是否有效
    if (!container || container.querySelector('.video-download-btn')) {
      return;
    }

    console.log('正在添加下载按钮到容器:', container);

    // 创建下载按钮
    const button = document.createElement('button');
    button.className = 'video-download-btn';
    button.innerHTML = `
      <span class="icon">🎬</span>
      <span class="text">下载视频</span>
    `;

    // 创建进度条
    const progressBar = document.createElement('div');
    progressBar.className = 'download-progress';
    progressBar.innerHTML = '<div class="download-progress-bar"></div>';

    // 创建状态显示
    const statusDisplay = document.createElement('div');
    statusDisplay.className = 'download-status';

    // 创建质量选择器
    const qualitySelector = document.createElement('div');
    qualitySelector.className = 'video-quality-selector';
    qualitySelector.innerHTML = `
      <div class="quality-option" data-quality="HD">高清 (HD)</div>
      <div class="quality-option" data-quality="SD">标清 (SD)</div>
    `;

    // 添加到 body
    document.body.appendChild(button);
    document.body.appendChild(qualitySelector);
    document.body.appendChild(progressBar);
    document.body.appendChild(statusDisplay);

    // 添加事件监听
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      qualitySelector.classList.toggle('show');
    });

    qualitySelector.addEventListener('click', async (e) => {
      const option = e.target.closest('.quality-option');
      if (!option) return;

      e.stopPropagation();
      qualitySelector.classList.remove('show');
      const quality = option.dataset.quality;
      await this.handleDownload(container, quality);
    });

    // 点击其他地方关闭质量选择器
    document.addEventListener('click', () => {
      qualitySelector.classList.remove('show');
    });
  }

  showToast(message, isError = false) {
    const toast = document.createElement('div');
    toast.className = `download-toast${isError ? ' error' : ''}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3000);
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'SCAN_VIDEOS') {
        this.scanForVideos();
        sendResponse({ success: true });
      }
    });
  }

  observePageChanges() {
    // 确认是否在广告库页面
    if (!window.location.href.includes('facebook.com/ads/library')) {
      return;
    }

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.addedNodes.length) {
          this.processNewNodes(mutation.addedNodes);
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  processNewNodes(nodes) {
    nodes.forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        // 查找广告库中的视频
        const videoContainers = node.querySelectorAll([
          '[data-testid="ad_creative"] video',
          '[role="article"] video',
          '[data-testid="ad_creative"] [data-video-id]',
          '[role="article"] [data-video-id]'
        ].join(','));

        videoContainers.forEach(container => {
          // 获取广告容器
          const adContainer = container.closest('[role="article"]') || 
                            container.closest('[data-testid="ad_creative"]');
          if (adContainer && !adContainer.querySelector('.video-download-btn')) {
            this.addDownloadButton(adContainer);
          }
        });
      }
    });
  }

  async handleDownload(container, quality) {
    try {
      this.showStatusTip(true, '正在提取视频链接...');
      
      // 获取视频数据
      const videoUrl = this.extractVideoUrl(container);
      if (!videoUrl) {
        throw new Error('无法获取视频链接');
      }

      // 如果是直接的 MP4 链接，创建简单的视频数据
      if (videoUrl.includes('fbcdn.net') && videoUrl.endsWith('.mp4')) {
        const videoData = {
          title: '广告视频',
          sources: [{
            url: videoUrl,
            quality: 'HD',
            type: 'video/mp4'
          }]
        };
        
        // 创建下载任务
        const taskId = this.downloadManager.generateTaskId();
        const filename = this.generateFilename(videoData, 'HD');

        // 添加到下载队列
        await this.downloadManager.addToQueue({
          id: taskId,
          url: videoUrl,
          filename: filename,
          type: 'video/mp4',
          title: videoData.title,
          quality: 'HD',
          saveAs: true,
          container: container
        });

        this.showStatusTip(false);
        this.showToast('已添加到下载队列');
        return;
      }

      // 提取视频信息
      const videoData = await this.downloader.extractVideoInfo(videoUrl);
      if (!videoData || !videoData.sources.length) {
        throw new Error('无法获取视频数据');
      }

      // 选择视频源
      const source = this.selectVideoSource(videoData.sources, quality);
      if (!source) {
        throw new Error(`未找到${quality}质量的视频源`);
      }

      // 创建下载任务
      const taskId = this.downloadManager.generateTaskId();
      const filename = this.generateFilename(videoData, quality);

      // 添加到下载队列
      await this.downloadManager.addToQueue({
        id: taskId,
        url: source.url,
        filename: filename,
        type: source.type || 'video/mp4',
        title: videoData.title,
        quality: quality,
        saveAs: true,
        container: container
      });

      this.showStatusTip(false);
      this.showToast('已添加到下载队列');

    } catch (error) {
      console.error('下载失败:', error);
      this.showStatusTip(true, error.message);
      setTimeout(() => this.showStatusTip(false), 3000);
    }
  }

  selectVideoSource(sources, targetQuality) {
    // 首先尝试找到指定质量的视频源
    const exactMatch = sources.find(s => s.quality === targetQuality);
    if (exactMatch) return exactMatch;

    // 如果找不到指定质量，选择最接近的更高质量
    const qualityScores = { 'HD': 3, 'SD': 2, '低质量': 1 };
    const targetScore = qualityScores[targetQuality];

    return sources.reduce((best, current) => {
      const currentScore = qualityScores[current.quality] || 0;
      const bestScore = best ? qualityScores[best.quality] || 0 : 0;

      if (!best) return current;
      if (currentScore >= targetScore && currentScore < bestScore) return current;
      if (currentScore >= targetScore && !best) return current;
      return best;
    }, null) || sources[0];
  }

  generateFilename(videoData, quality) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const title = (videoData.title || 'facebook_ad')
      .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')
      .substring(0, 50);
    
    return `${title}_${quality}_${timestamp}.mp4`;
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }

  extractVideoUrl(container) {
    // 检查网络请求中的视频链接
    const videoUrls = this.findVideoUrlsInNetwork();
    if (videoUrls.length > 0) {
      return videoUrls[0];
    }

    // 尝试从不同位置获取视频URL
    const videoElement = container.querySelector('video');
    if (videoElement && videoElement.src) {
      return videoElement.src;
    }

    // 尝试从data属性获取
    const videoId = container.dataset.videoId;
    if (videoId) {
      return `https://www.facebook.com/video/video.php?v=${videoId}`;
    }

    // 尝试从链接获取
    const videoLink = container.querySelector('a[href*="video"]');
    if (videoLink) {
      return videoLink.href;
    }

    return null;
  }

  findVideoUrlsInNetwork() {
    const videoUrls = new Set();
    
    // 使用 Performance API 获取网络请求
    const entries = performance.getEntriesByType('resource');
    
    console.log('正在扫描网络请求...');
    
    entries.forEach(entry => {
      // 检查是否为媒体类型的请求
      if (entry.initiatorType === 'media') {
        const url = entry.name;
        console.log('找到媒体请求:', url);
        videoUrls.add(url);
      }
    });

    console.log(`共找到 ${videoUrls.size} 个视频链接`);
    return Array.from(videoUrls);
  }

  injectDownloadButtons() {
    // 查找现有的视频容器
    const videoContainers = document.querySelectorAll('[data-video-id], .video-container');
    videoContainers.forEach(container => {
      this.addDownloadButton(container);
    });
  }

  showStatusTip(show, message = '正在检测视频...') {
    const tip = document.querySelector('.video-status-tip');
    if (!tip) return;

    if (show) {
      tip.classList.add('show');
      tip.querySelector('span').textContent = message;
    } else {
      tip.classList.remove('show');
    }
  }

  observeUrlChanges() {
    // 监听 URL 变化
    let lastUrl = window.location.href;
    setInterval(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        if (window.location.href.includes('facebook.com/ads/library')) {
          console.log('URL changed to ads library, reinitializing...');
          this.injectUI();
        }
      }
    }, 1000);
  }

  updateVideoList(videoUrls) {
    const videoList = document.querySelector('.video-list');
    const videoCount = document.querySelector('.video-count');
    
    if (videoList && videoCount) {
      videoCount.textContent = videoUrls.length;
      
      videoList.innerHTML = videoUrls.map((url, index) => `
        <tr class="video-item" data-url="${url}">
          <td>${index + 1}</td>
          <td style="max-width: 400px; overflow: hidden; text-overflow: ellipsis;">
            <a href="${url}" target="_blank" title="${url}" style="color: #1877f2; text-decoration: none;">
              ${url}
            </a>
          </td>
          <td>
            <div style="display: flex; gap: 8px;">
              <button class="download-btn" data-url="${url}">
                下载视频
              </button>
              <a href="${url}" download="facebook_ad_${Date.now()}.mp4" 
                 class="download-btn" style="text-decoration: none;">
                直接下载
              </a>
            </div>
          </td>
        </tr>
      `).join('');

      // 添加下载事件
      videoList.querySelectorAll('.download-btn').forEach(button => {
        if (!button.hasAttribute('href')) {  // 只为非直接下载按钮添加事件
          button.addEventListener('click', async (e) => {
            e.stopPropagation();
            const url = button.dataset.url;
            button.classList.add('downloading');
            button.textContent = '下载中...';
            this.downloadVideo(url);
          });
        }
      });
    }
  }

  async downloadVideo(url) {
    try {
      // 从 URL 中提取文件名
      const urlParts = url.split('/');
      const filename = urlParts[urlParts.length - 1].split('?')[0];
      
      await this.downloadManager.addToQueue({
        id: this.downloadManager.generateTaskId(),
        url: url,
        filename: filename,
        type: 'video/mp4',
        title: '广告视频',
        quality: 'HD',
        saveAs: true
      });

      this.showToast('已添加到下载队列');
      // 重置下载按钮状态
      const button = document.querySelector(`.download-btn[data-url="${url}"]`);
      if (button) {
        button.classList.remove('downloading');
        button.textContent = '下载视频';
      }
    } catch (error) {
      console.error('下载失败:', error);
      this.showToast('下载失败: ' + error.message, true);
      // 重置下载按钮状态
      const button = document.querySelector(`.download-btn[data-url="${url}"]`);
      if (button) {
        button.classList.remove('downloading');
        button.textContent = '下载失败';
      }
    }
  }
}

// 确保在页面加载完成后初始化
function initializeAdLibraryVideo() {
  console.log('开始初始化广告库视频下载器...');
  if (!window.adLibraryVideoDownloader) {
    window.adLibraryVideoDownloader = new AdLibraryVideoDownloader();
  }
}

// 在页面加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeAdLibraryVideo);
} else {
  initializeAdLibraryVideo();
}

// 导出类以供其他模块使用
export default AdLibraryVideoDownloader; 