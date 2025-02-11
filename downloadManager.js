class DownloadManager {
  constructor() {
    this.downloadQueue = [];
    this.currentDownload = null;
    this.downloadHistory = [];
    this.maxConcurrent = 1;
    this.maxHistory = 100;
    this.initialize();
  }

  async initialize() {
    try {
      // 通过 window.postMessage 获取下载历史
      window.postMessage({ type: 'GET_DOWNLOAD_HISTORY' }, '*');
      
      // 监听来自 content script 的消息
      window.addEventListener('message', this.handleMessage.bind(this));
      
      console.log('下载管理器初始化成功');
    } catch (error) {
      console.error('初始化下载管理器失败:', error);
    }
  }

  handleMessage(event) {
    if (event.source !== window) return;

    const { type, data } = event.data;
    if (type === 'DOWNLOAD_HISTORY_DATA') {
      this.downloadHistory = data || [];
    } else if (type === 'DOWNLOAD_STATE_CHANGED') {
      this.handleDownloadChange(data);
    }
  }

  async addToQueue(downloadTask) {
    try {
      // 添加到队列
      this.downloadQueue.push({
        ...downloadTask,
        status: 'pending',
        progress: 0,
        startTime: Date.now()
      });

      // 尝试开始下载
      this.processQueue();

      return true;
    } catch (error) {
      console.error('添加下载任务失败:', error);
      return false;
    }
  }

  async processQueue() {
    if (this.currentDownload || this.downloadQueue.length === 0) {
      return;
    }

    try {
      // 获取下一个任务
      this.currentDownload = this.downloadQueue.shift();
      const task = this.currentDownload;

      // 更新状态
      task.status = 'downloading';
      this.notifyProgress(task);

      // 开始下载
      const response = await fetch(task.url);
      const reader = response.body.getReader();
      const contentLength = +response.headers.get('Content-Length');

      let receivedLength = 0;
      const chunks = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        receivedLength += value.length;

        // 更新进度
        task.progress = (receivedLength / contentLength) * 100;
        this.notifyProgress(task);
      }

      // 创建 Blob 并下载
      const blob = new Blob(chunks, { type: task.type || 'video/mp4' });
      const url = URL.createObjectURL(blob);

      const downloadId = await new Promise((resolve, reject) => {
        chrome.downloads.download({
          url: url,
          filename: task.filename,
          saveAs: task.saveAs
        }, (id) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(id);
          }
        });
      });

      // 添加到历史记录
      this.addToHistory({
        ...task,
        downloadId,
        completedAt: Date.now(),
        status: 'completed'
      });

      // 清理
      URL.revokeObjectURL(url);
      this.currentDownload = null;

      // 处理下一个任务
      this.processQueue();

    } catch (error) {
      console.error('处理下载任务失败:', error);
      if (this.currentDownload) {
        this.currentDownload.status = 'failed';
        this.currentDownload.error = error.message;
        this.notifyProgress(this.currentDownload);
        this.addToHistory(this.currentDownload);
      }
      this.currentDownload = null;
      this.processQueue();
    }
  }

  notifyProgress(task) {
    // 通过 window.postMessage 发送进度更新
    window.postMessage({
      type: 'DOWNLOAD_PROGRESS',
      data: {
        taskId: task.id,
        status: task.status,
        progress: task.progress,
        error: task.error
      }
    }, '*');
  }

  async addToHistory(task) {
    try {
      this.downloadHistory.unshift(task);
      
      if (this.downloadHistory.length > this.maxHistory) {
        this.downloadHistory = this.downloadHistory.slice(0, this.maxHistory);
      }

      // 通过 window.postMessage 保存历史记录
      window.postMessage({
        type: 'SAVE_DOWNLOAD_HISTORY',
        data: this.downloadHistory
      }, '*');

    } catch (error) {
      console.error('保存下载历史失败:', error);
    }
  }

  handleDownloadChange(delta) {
    if (delta.state && delta.state.current === 'complete') {
      const historyItem = this.downloadHistory.find(
        item => item.downloadId === delta.id
      );
      if (historyItem) {
        historyItem.status = 'completed';
        this.saveHistory();
      }
    }
  }

  async getHistory() {
    return this.downloadHistory;
  }

  async clearHistory() {
    this.downloadHistory = [];
    await this.saveToStorage({ downloadHistory: [] });
  }

  async pauseDownload(taskId) {
    const task = this.downloadQueue.find(t => t.id === taskId);
    if (task) {
      task.status = 'paused';
      this.notifyProgress(task);
    }
  }

  async resumeDownload(taskId) {
    const task = this.downloadQueue.find(t => t.id === taskId);
    if (task && task.status === 'paused') {
      task.status = 'pending';
      this.notifyProgress(task);
      this.processQueue();
    }
  }

  async cancelDownload(taskId) {
    // 从队列中移除
    this.downloadQueue = this.downloadQueue.filter(t => t.id !== taskId);
    
    // 如果是当前下载，则取消
    if (this.currentDownload && this.currentDownload.id === taskId) {
      this.currentDownload.status = 'cancelled';
      this.notifyProgress(this.currentDownload);
      this.addToHistory(this.currentDownload);
      this.currentDownload = null;
      this.processQueue();
    }
  }

  generateTaskId() {
    return `download_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // 从存储中获取数据
  async getFromStorage(key) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: 'STORAGE_GET',
        key: key
      }, resolve);
    });
  }

  // 保存数据到存储
  async saveToStorage(data) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: 'STORAGE_SET',
        data: data
      }, resolve);
    });
  }
}

// 创建全局实例
if (!window.downloadManager) {
  window.downloadManager = new DownloadManager();
} 