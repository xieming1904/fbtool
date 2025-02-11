// 视频下载器核心类
class VideoDownloader {
  constructor() {
    this.videoCache = new Map();
  }

  async extractVideoInfo(url) {
    try {
      // 获取页面内容
      const response = await fetch(url);
      const html = await response.text();
      
      // 提取视频信息
      const videoData = this.parseVideoData(html);
      if (!videoData) {
        throw new Error('无法找到视频信息');
      }

      // 缓存视频信息
      this.videoCache.set(url, videoData);
      
      return videoData;
    } catch (error) {
      console.error('提取视频信息失败:', error);
      throw error;
    }
  }

  parseVideoData(html) {
    try {
      // 尝试不同的提取方法
      return (
        this.extractFromJsonLD(html) ||
        this.extractFromMetaTags(html) ||
        this.extractFromScripts(html)
      );
    } catch (error) {
      console.error('解析视频数据失败:', error);
      return null;
    }
  }

  extractFromJsonLD(html) {
    try {
      const jsonLdMatch = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
      if (jsonLdMatch) {
        const jsonLd = JSON.parse(jsonLdMatch[1]);
        if (jsonLd.video) {
          return {
            title: jsonLd.video.name,
            description: jsonLd.video.description,
            thumbnail: jsonLd.video.thumbnailUrl,
            duration: jsonLd.video.duration,
            sources: [{
              url: jsonLd.video.contentUrl,
              quality: 'HD',
              type: 'video/mp4'
            }]
          };
        }
      }
      return null;
    } catch (error) {
      console.error('从JSON-LD提取失败:', error);
      return null;
    }
  }

  extractFromMetaTags(html) {
    try {
      const getMetaContent = (name) => {
        const match = html.match(new RegExp(`<meta.*?property="${name}".*?content="(.*?)"`, 'i'));
        return match ? match[1] : null;
      };

      const videoUrl = getMetaContent('og:video') || getMetaContent('og:video:url');
      if (!videoUrl) return null;

      return {
        title: getMetaContent('og:title'),
        description: getMetaContent('og:description'),
        thumbnail: getMetaContent('og:image'),
        sources: [{
          url: videoUrl,
          quality: 'HD',
          type: getMetaContent('og:video:type') || 'video/mp4'
        }]
      };
    } catch (error) {
      console.error('从Meta标签提取失败:', error);
      return null;
    }
  }

  extractFromScripts(html) {
    try {
      // 查找包含视频数据的脚本
      const videoDataMatch = html.match(/videoData\s*:\s*({.*?})/s) ||
                           html.match(/video_data\s*:\s*({.*?})/s);

      if (videoDataMatch) {
        const videoData = JSON.parse(videoDataMatch[1]);
        return {
          title: videoData.name || videoData.title,
          description: videoData.description,
          thumbnail: videoData.thumbnail_url,
          sources: this.parseVideoSources(videoData)
        };
      }
      return null;
    } catch (error) {
      console.error('从脚本提取失败:', error);
      return null;
    }
  }

  parseVideoSources(data) {
    const sources = [];
    
    // 检查所有可能的视频源格式
    const sourcePatterns = [
      // 标准格式
      { key: 'hd_src', quality: 'HD' },
      { key: 'sd_src', quality: 'SD' },
      // 广告库格式
      { key: 'video_url', quality: 'HD' },
      { key: 'playbackUrl', quality: 'HD' },
      // 其他格式
      { key: 'hd_url', quality: 'HD' },
      { key: 'sd_url', quality: 'SD' }
    ];

    // 检查每个可能的源
    sourcePatterns.forEach(pattern => {
      const url = this.getNestedValue(data, pattern.key);
      if (url && typeof url === 'string' && this.isValidVideoUrl(url)) {
        sources.push({
          url: url,
          quality: pattern.quality,
          type: 'video/mp4'
        });
      }
    });

    // 检查播放列表
    if (data.playback_data) {
      try {
        const playbackData = JSON.parse(data.playback_data);
        if (playbackData.progressive) {
          playbackData.progressive.forEach(video => {
            sources.push({
              url: video.url,
              quality: video.quality || 'HD',
              type: video.mime_type || 'video/mp4'
            });
          });
        }
      } catch (error) {
        console.warn('解析播放列表失败:', error);
      }
    }

    return sources;
  }

  // 辅助方法：获取嵌套对象的值
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => 
      current && current[key] !== undefined ? current[key] : undefined, obj
    );
  }

  // 辅助方法：验证视频URL
  isValidVideoUrl(url) {
    try {
      const urlObj = new URL(url);
      return /\.(mp4|m3u8)($|\?)/.test(urlObj.pathname) || 
             urlObj.hostname.includes('fbcdn.net');
    } catch {
      return false;
    }
  }

  async downloadVideo(url, quality = 'HD') {
    try {
      let videoData = this.videoCache.get(url);
      if (!videoData) {
        videoData = await this.extractVideoInfo(url);
      }

      // 选择指定质量的视频源
      const source = videoData.sources.find(s => s.quality === quality) || videoData.sources[0];
      if (!source) {
        throw new Error('未找到可下载的视频源');
      }

      // 开始下载
      const response = await fetch(source.url);
      const blob = await response.blob();
      
      // 创建下载链接
      const downloadUrl = URL.createObjectURL(blob);
      const filename = `${videoData.title || 'facebook_video'}.mp4`;

      return {
        url: downloadUrl,
        filename: filename,
        type: source.type
      };
    } catch (error) {
      console.error('下载视频失败:', error);
      throw error;
    }
  }

  // 清理缓存的视频信息
  clearCache() {
    this.videoCache.clear();
  }

  // 添加广告库特定的视频提取方法
  async extractAdLibraryVideo(container) {
    try {
      // 1. 尝试从视频元素获取
      const videoElement = container.querySelector('video');
      if (videoElement?.src) {
        return {
          title: '广告视频',
          sources: [{
            url: videoElement.src,
            quality: 'HD',
            type: 'video/mp4'
          }]
        };
      }

      // 2. 尝试从数据属性获取
      const dataVideo = container.getAttribute('data-video') || 
                       container.getAttribute('data-video-id');
      if (dataVideo) {
        try {
          const videoData = JSON.parse(dataVideo);
          return {
            title: videoData.title || '广告视频',
            sources: this.parseVideoSources(videoData)
          };
        } catch {
          // 如果不是JSON，可能是视频ID
          const videoId = dataVideo;
          return await this.fetchVideoById(videoId);
        }
      }

      // 3. 尝试从内联脚本获取
      const scripts = container.querySelectorAll('script');
      for (const script of scripts) {
        const content = script.textContent;
        if (content.includes('video') || content.includes('videoData')) {
          const videoData = this.extractVideoDataFromScript(content);
          if (videoData) {
            return videoData;
          }
        }
      }

      throw new Error('无法找到视频数据');
    } catch (error) {
      console.error('提取广告库视频失败:', error);
      throw error;
    }
  }

  async fetchVideoById(videoId) {
    try {
      const response = await fetch(`https://www.facebook.com/video/tahoe/async/${videoId}/?chain=true`, {
        credentials: 'include'
      });
      const text = await response.text();
      
      // 解析视频数据
      const dataMatch = text.match(/videoData\s*:\s*({.*?})/s);
      if (!dataMatch) {
        throw new Error('无法解析视频数据');
      }

      const videoData = JSON.parse(dataMatch[1]);
      return {
        title: videoData.video_title || '广告视频',
        sources: this.parseVideoSources(videoData)
      };
    } catch (error) {
      console.error('获取视频数据失败:', error);
      throw error;
    }
  }

  extractVideoDataFromScript(content) {
    try {
      // 尝试匹配不同格式的视频数据
      const patterns = [
        /videoData\s*:\s*({.*?})/s,
        /video_data\s*:\s*({.*?})/s,
        /\{"video":\s*({.*?})\}/s,
        /\{"videoData":\s*({.*?})\}/s
      ];

      for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match) {
          const data = JSON.parse(match[1]);
          return {
            title: data.title || data.name || '广告视频',
            sources: this.parseVideoSources(data)
          };
        }
      }

      return null;
    } catch (error) {
      console.error('从脚本提取视频数据失败:', error);
      return null;
    }
  }

  async extractVideoFromAjax(videoId) {
    try {
      // 尝试不同的API端点
      const endpoints = [
        `https://www.facebook.com/video/tahoe/async/${videoId}/?chain=true`,
        `https://www.facebook.com/api/graphql/${videoId}`,
        `https://www.facebook.com/video.php?v=${videoId}`
      ];

      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, {
            credentials: 'include',
            headers: {
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
            }
          });

          const text = await response.text();
          const videoData = this.extractVideoDataFromResponse(text);
          if (videoData) {
            return videoData;
          }
        } catch (error) {
          console.warn(`从端点 ${endpoint} 获取视频失败:`, error);
        }
      }

      throw new Error('无法从任何端点获取视频数据');
    } catch (error) {
      console.error('获取视频数据失败:', error);
      throw error;
    }
  }

  extractVideoDataFromResponse(text) {
    try {
      // 尝试所有可能的数据格式
      const patterns = [
        /"videoData":\s*({[^}]+})/,
        /"video_data":\s*({[^}]+})/,
        /"video":\s*({[^}]+})/,
        /videoData\s*=\s*({[^}]+})/,
        /"dash_manifest":\s*"([^"]+)"/
      ];

      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
          if (pattern.toString().includes('dash_manifest')) {
            // 处理DASH格式
            return this.parseDashManifest(match[1]);
          } else {
            // 处理JSON格式
            const data = JSON.parse(match[1].replace(/\\/g, ''));
            return {
              title: data.title || data.name || '广告视频',
              sources: this.parseVideoSources(data)
            };
          }
        }
      }

      return null;
    } catch (error) {
      console.error('解析视频数据响应失败:', error);
      return null;
    }
  }

  parseDashManifest(manifestString) {
    try {
      const decoded = decodeURIComponent(manifestString);
      const manifest = JSON.parse(decoded);
      
      const sources = manifest.video_representations.map(video => ({
        url: video.base_url,
        quality: this.getQualityLabel(video.height),
        type: 'video/mp4'
      }));

      return {
        title: '广告视频',
        sources: sources
      };
    } catch (error) {
      console.error('解析DASH清单失败:', error);
      return null;
    }
  }

  getQualityLabel(height) {
    if (height >= 720) return 'HD';
    if (height >= 480) return 'SD';
    return '低质量';
  }
}

// 创建全局实例
window.videoDownloader = new VideoDownloader(); 