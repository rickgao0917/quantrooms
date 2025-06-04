// QuantRooms Content Script
// Injected into QuantGuide.io pages
// Handles problem detection and data extraction only

class QuantRooms {
  constructor() {
    this.problemData = null;
    this.init();
  }

  init() {
    console.log('QuantRooms: Initializing on', window.location.href);
    
    // Listen for messages from popup/background
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sendResponse);
      return true; // Keep message channel open for async responses
    });
    
    // Detect if we're on a problem page
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.detectProblemPage());
    } else {
      this.detectProblemPage();
    }
    
    // Monitor for URL changes (SPA navigation)
    this.setupNavigationListener();
  }

  setupNavigationListener() {
    // Listen for URL changes in single-page application
    let lastUrl = window.location.href;
    
    const observer = new MutationObserver(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        console.log('QuantRooms: URL changed, checking for problem page');
        this.detectProblemPage();
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  detectProblemPage() {
    // Check if we're on a QuantGuide problem page
    const isProblemPage = window.location.pathname.includes('/problem') || 
                         window.location.pathname.includes('/problems/') ||
                         document.querySelector('[data-problem-id]') ||
                         document.querySelector('.problem-content') ||
                         document.querySelector('.problem-statement');
    
    if (isProblemPage) {
      console.log('QuantRooms: Problem page detected');
      this.extractProblemData();
    } else {
      this.problemData = null;
    }
  }

  extractProblemData() {
    try {
      // Extract problem information from the page
      const problemData = {
        url: window.location.href,
        title: null,
        difficulty: null,
        category: null,
        problemId: null,
        description: null
      };

      // Try to extract problem title
      const titleElement = document.querySelector('h1, h2, .problem-title, [class*="problem-title"], [class*="question-title"]');
      if (titleElement) {
        problemData.title = titleElement.textContent.trim();
      }

      // Try to extract difficulty
      const difficultyElement = document.querySelector('[class*="difficulty"], [class*="level"], .badge');
      if (difficultyElement) {
        const difficultyText = difficultyElement.textContent.toLowerCase();
        if (difficultyText.includes('easy')) problemData.difficulty = 'Easy';
        else if (difficultyText.includes('medium')) problemData.difficulty = 'Medium';
        else if (difficultyText.includes('hard')) problemData.difficulty = 'Hard';
      }

      // Try to extract problem ID from URL or data attributes
      const urlMatch = window.location.pathname.match(/problem[s]?\/([\w-]+)/i);
      if (urlMatch) {
        problemData.problemId = urlMatch[1];
      } else {
        const idElement = document.querySelector('[data-problem-id]');
        if (idElement) {
          problemData.problemId = idElement.getAttribute('data-problem-id');
        }
      }

      // Try to extract category/tags
      const categoryElements = document.querySelectorAll('[class*="tag"], [class*="category"], .chip');
      if (categoryElements.length > 0) {
        problemData.category = Array.from(categoryElements)
          .map(el => el.textContent.trim())
          .filter(text => text.length > 0)
          .join(', ');
      }

      this.problemData = problemData;
      console.log('QuantRooms: Problem data extracted:', problemData);

      // Notify background script that we're on a problem page
      chrome.runtime.sendMessage({
        type: 'PROBLEM_PAGE_DETECTED',
        problemData: problemData
      }).catch(() => {});

    } catch (error) {
      console.error('QuantRooms: Error extracting problem data:', error);
    }
  }

  handleMessage(message, sendResponse) {
    switch (message.type) {
      case 'GET_PAGE_INFO':
        const isProblemPage = window.location.pathname.includes('/problem') || 
                             document.querySelector('[data-problem-id]') ||
                             document.querySelector('.problem-content');
        
        sendResponse({
          url: window.location.href,
          isProblemPage: isProblemPage,
          problemData: this.problemData
        });
        break;
        
      case 'GET_PROBLEM_DATA':
        // Re-extract problem data if requested
        this.extractProblemData();
        sendResponse({
          problemData: this.problemData
        });
        break;
        
      case 'HIGHLIGHT_PROBLEM':
        // Highlight current problem when in a multiplayer session
        this.highlightProblem(message.highlight);
        sendResponse({ success: true });
        break;
        
      default:
        console.log('QuantRooms: Unknown message type:', message.type);
        sendResponse({ error: 'Unknown message type' });
    }
  }

  highlightProblem(shouldHighlight) {
    // Add visual indicator when in multiplayer mode
    const existingIndicator = document.getElementById('quantrooms-indicator');
    
    if (shouldHighlight) {
      if (!existingIndicator) {
        const indicator = document.createElement('div');
        indicator.id = 'quantrooms-indicator';
        indicator.textContent = 'QuantRooms Active';
        indicator.style.cssText = `
          position: fixed;
          top: 10px;
          left: 50%;
          transform: translateX(-50%);
          background: #4F46E5;
          color: white;
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 14px;
          font-weight: 500;
          z-index: 9999;
          box-shadow: 0 2px 8px rgba(79, 70, 229, 0.3);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;
        document.body.appendChild(indicator);
      }
    } else {
      if (existingIndicator) {
        existingIndicator.remove();
      }
    }
  }
}

// Initialize QuantRooms
new QuantRooms();