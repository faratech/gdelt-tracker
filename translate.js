/*
 * GDELT News Translation Module
 * Adds selective language translation to news articles
 */

// Configuration
const TRANSLATION_CONFIG = {
  defaultPageLanguage: 'en',
  translationSelector: '.article, .article-content, #newsFeed .article h3, #modalArticles .article-content', 
  ignoreSelector: '.no-translate, code, pre, script, style',
  detectConfidenceThreshold: 0.6,
  translationDelay: 500,
  debug: false
};

// Google Translate element initialization
function googleTranslateElementInit() {
  new google.translate.TranslateElement({
    pageLanguage: TRANSLATION_CONFIG.defaultPageLanguage,
    autoDisplay: false,
    includedLanguages: '', // Empty string means all languages
    layout: google.translate.TranslateElement.InlineLayout.SIMPLE
  }, 'google_translate_element');
  
  // After initialization, enhance the translation widget
  setTimeout(enhanceTranslateWidget, 1000);
}

// Make the init function available globally
window.googleTranslateElementInit = googleTranslateElementInit;

// Load Google Translate script
function loadGoogleTranslateScript() {
  // Create a hidden container for the Google Translate widget
  if (!document.getElementById('google_translate_element')) {
    const translateContainer = document.createElement('div');
    translateContainer.id = 'google_translate_element';
    translateContainer.style.display = 'none';
    document.body.appendChild(translateContainer);
  }
  
  // Load Google Translate script
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = '//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
  document.head.appendChild(script);
  
  logDebug('Google Translate script loading...');
}

// Debug logging helper
function logDebug(message) {
  if (TRANSLATION_CONFIG.debug) {
    console.log(`[Translate] ${message}`);
  }
}

// Inject function to expose Google Translate's language detection
function injectDetectionFunction() {
  const script = document.createElement('script');
  script.text = `
    window.gtDetectLanguage = function(element, callback) {
      try {
        // Try to access Google's translation service
        const gtService = google.translate.TranslateService ? 
          google.translate.TranslateService.getInstance() : null;
        
        if (!gtService) {
          callback({ language: '${TRANSLATION_CONFIG.defaultPageLanguage}', confidence: 0 });
          return;
        }
        
        // Detect language using Google's service
        gtService.detectLanguage(element.innerText || element.textContent, function(result) {
          callback(result);
        });
      } catch (e) {
        console.error('Language detection error:', e);
        callback({ language: '${TRANSLATION_CONFIG.defaultPageLanguage}', confidence: 0 });
      }
    };
  `;
  document.head.appendChild(script);
}

// Create language detection function using Google Translate widget
async function detectLanguage(text) {
  // Skip very short text or text with mostly numbers/symbols
  if (!text || text.length < 10 || /^[\d\s\W]+$/.test(text)) {
    return { language: TRANSLATION_CONFIG.defaultPageLanguage, confidence: 1 };
  }
  
  // Create a temporary container to detect language
  const detector = document.createElement('div');
  detector.id = 'lang-detector-' + Math.random().toString(36).substring(2, 9);
  detector.style.position = 'absolute';
  detector.style.top = '-9999px';
  detector.style.left = '-9999px';
  detector.textContent = text.substring(0, 1000); // Use first 1000 characters to detect
  document.body.appendChild(detector);
  
  return new Promise((resolve) => {
    // Give the detector a chance to be added to DOM
    setTimeout(() => {
      // Force Google Translate to detect the language
      if (typeof window.gtDetectLanguage === 'function') {
        try {
          window.gtDetectLanguage(detector, (result) => {
            const detectedLang = result && result.language ? result.language : TRANSLATION_CONFIG.defaultPageLanguage;
            logDebug(`Detected language: ${detectedLang} (${result.confidence || 'unknown'} confidence)`);
            
            // Remove the detector element
            document.body.removeChild(detector);
            
            resolve({
              language: detectedLang,
              confidence: result.confidence || 0
            });
          });
        } catch (e) {
          console.error('Error detecting language:', e);
          document.body.removeChild(detector);
          resolve({ language: TRANSLATION_CONFIG.defaultPageLanguage, confidence: 0 });
        }
      } else {
        // Fallback to simple pattern matching
        const fallbackLang = fallbackLanguageDetection(text);
        document.body.removeChild(detector);
        resolve({ language: fallbackLang, confidence: 0.7 });
      }
    }, 100);
  });
}

// Fallback language detection based on character patterns
function fallbackLanguageDetection(text) {
  // Basic detection based on character sets
  const patterns = {
    'ru': /[\u0400-\u04FF]{4,}/,
    'zh': /[\u4E00-\u9FFF\u3400-\u4DBF]{2,}/,
    'ja': /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]{2,}/,
    'ko': /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]{2,}/,
    'ar': /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]{4,}/,
    'he': /[\u0590-\u05FF\uFB1D-\uFB4F]{4,}/,
    'th': /[\u0E00-\u0E7F]{4,}/,
    'el': /[\u0370-\u03FF\u1F00-\u1FFF]{4,}/,
  };
  
  for (const [lang, pattern] of Object.entries(patterns)) {
    if (pattern.test(text)) {
      return lang;
    }
  }
  
  // Default to page language if no specific patterns match
  return TRANSLATION_CONFIG.defaultPageLanguage;
}

// Enhance the standard Google Translate widget with additional functionality
function enhanceTranslateWidget() {
  try {
    // Inject our custom detection function
    injectDetectionFunction();
    
    // Get the Google Translate select element
    const translateSelect = document.querySelector('.goog-te-combo');
    if (!translateSelect) {
      setTimeout(enhanceTranslateWidget, 1000);
      return;
    }
    
    // Add our custom UI
    createTranslationUI();
    
    // Add event listeners to track translation changes
    translateSelect.addEventListener('change', () => {
      const selectedLanguage = translateSelect.value;
      logDebug(`Translation language changed to: ${selectedLanguage}`);
      
      if (selectedLanguage && selectedLanguage !== TRANSLATION_CONFIG.defaultPageLanguage) {
        // Store the last selected language
        localStorage.setItem('lastTranslateLanguage', selectedLanguage);
      }
    });
    
    logDebug('Translation widget enhanced');
    
    // Check if auto-translate is disabled
    const autoTranslateDisabled = localStorage.getItem('autoTranslateDisabled') === 'true';
    if (!autoTranslateDisabled) {
      // Set up auto-translation after article updates
      setupNewsTranslationObserver();
      
      // Initially scan for languages
      setTimeout(scanPageForMultiLanguageContent, 2000);
    }
    
  } catch (e) {
    console.error('Error enhancing translate widget:', e);
  }
}

// Create a custom translation UI for the news application
function createTranslationUI() {
  const uiContainer = document.createElement('div');
  uiContainer.id = 'custom-translate-ui';
  uiContainer.innerHTML = `
    <div class="translate-header">
      <span>Translation</span>
      <button id="translate-close-btn" title="Close">×</button>
    </div>
    <div class="translate-controls">
      <button id="scan-languages-btn">Detect Languages</button>
      <label>
        <input type="checkbox" id="auto-translate-toggle" ${localStorage.getItem('autoTranslateDisabled') !== 'true' ? 'checked' : ''}>
        Auto-detect
      </label>
    </div>
    <div id="language-detection-results" class="language-results">
      <div class="placeholder">No foreign language content detected yet.</div>
    </div>
  `;
  
  // Style the custom UI to match GDELT news design
  const styles = document.createElement('style');
  styles.textContent = `
    #custom-translate-ui {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: var(--card-bg, #fff);
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      width: 250px;
      z-index: 9999;
      font-family: inherit;
      transition: all 0.3s ease;
      color: var(--text-color, #333);
      border: 1px solid var(--border-color, #ddd);
    }
    
    .translate-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background: var(--primary-color, #2c3e50);
      color: #fff;
      border-radius: 8px 8px 0 0;
      font-weight: bold;
    }
    
    #translate-close-btn {
      background: none;
      border: none;
      color: white;
      font-size: 16px;
      cursor: pointer;
      padding: 0 4px;
    }
    
    .translate-controls {
      display: flex;
      align-items: center;
      padding: 10px;
      gap: 8px;
      border-bottom: 1px solid var(--border-color, #ddd);
    }
    
    .translate-controls button {
      padding: 6px 8px;
      background: var(--secondary-color, #3498db);
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }
    
    .translate-controls label {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
    }
    
    .language-results {
      max-height: 200px;
      overflow-y: auto;
      padding: 8px;
    }
    
    .language-results .placeholder {
      color: #888;
      font-style: italic;
      font-size: 12px;
      text-align: center;
      padding: 10px;
    }
    
    .detected-language {
      margin: 4px 0;
      padding: 6px 8px;
      background: var(--hover-bg, #f0f7ff);
      border-radius: 4px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
    }
    
    .detected-language button {
      background: var(--secondary-color, #3498db);
      color: white;
      border: none;
      border-radius: 3px;
      padding: 3px 6px;
      font-size: 11px;
      cursor: pointer;
    }
    
    .translating {
      outline: 2px dashed var(--secondary-color, #3498db);
      position: relative;
    }
    
    /* For dark mode compatibility */
    .dark-mode #custom-translate-ui {
      --card-bg: #1e1e30;
      --text-color: #e0e0e0;
      --border-color: #333;
      --hover-bg: #2d2d44;
    }
  `;
  
  document.head.appendChild(styles);
  document.body.appendChild(uiContainer);
  
  // Add event listeners
  document.getElementById('translate-close-btn').addEventListener('click', () => {
    uiContainer.style.display = 'none';
  });
  
  document.getElementById('scan-languages-btn').addEventListener('click', scanPageForMultiLanguageContent);
  
  document.getElementById('auto-translate-toggle').addEventListener('change', function() {
    const isDisabled = !this.checked;
    localStorage.setItem('autoTranslateDisabled', isDisabled);
    
    if (!isDisabled) {
      setupNewsTranslationObserver();
      scanPageForMultiLanguageContent();
    }
  });
}

// Set up observer to detect new news articles
function setupNewsTranslationObserver() {
  // Watch both the newsFeed and modalArticles containers for updates
  const feedObserver = new MutationObserver(function(mutations) {
    // Check if news articles were added
    let hasNewContent = false;
    mutations.forEach(mutation => {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        hasNewContent = true;
      }
    });
    
    // If new content was added, rescan after a delay
    if (hasNewContent) {
      logDebug('News content changed, rescanning for languages...');
      clearTimeout(window.rescanTimeout);
      window.rescanTimeout = setTimeout(scanPageForMultiLanguageContent, 1000);
    }
  });
  
  // Start observing news feed
  const newsFeed = document.getElementById('newsFeed');
  if (newsFeed) {
    feedObserver.observe(newsFeed, { childList: true, subtree: true });
  }
  
  // Start observing modal articles
  const modalArticles = document.getElementById('modalArticles');
  if (modalArticles) {
    feedObserver.observe(modalArticles, { childList: true, subtree: true });
  }
}

// Set translation language in Google Translate widget
function setTranslateLanguage(languageCode) {
  const translateSelect = document.querySelector('.goog-te-combo');
  if (translateSelect) {
    translateSelect.value = languageCode;
    translateSelect.dispatchEvent(new Event('change'));
    logDebug(`Setting translation language to: ${languageCode}`);
    return true;
  }
  logDebug('Translation widget not found');
  return false;
}

// Scan page for content in multiple languages
async function scanPageForMultiLanguageContent() {
  logDebug('Scanning news articles for multi-language content...');
  
  // Reset detection results
  const resultsContainer = document.getElementById('language-detection-results');
  if (resultsContainer) {
    resultsContainer.innerHTML = '<div class="placeholder">Scanning content...</div>';
  }
  
  // Get all content elements that might contain text
  const contentElements = document.querySelectorAll(TRANSLATION_CONFIG.translationSelector);
  
  // Skip if no elements found
  if (!contentElements || contentElements.length === 0) {
    if (resultsContainer) {
      resultsContainer.innerHTML = '<div class="placeholder">No content to scan. Try loading some news first.</div>';
    }
    return {};
  }
  
  // Filter out elements to ignore
  const ignoreElements = document.querySelectorAll(TRANSLATION_CONFIG.ignoreSelector);
  const ignoreSet = new Set(Array.from(ignoreElements));
  
  // Group elements by their text content to avoid redundant detections
  const textGroups = new Map();
  
  contentElements.forEach(element => {
    // Skip elements in the ignore list
    if (ignoreSet.has(element) || Array.from(ignoreElements).some(ignore => element.contains(ignore) || ignore.contains(element))) {
      return;
    }
    
    // Get text content
    const text = element.innerText || element.textContent;
    if (!text || text.trim().length < 20) {
      return; // Skip elements with very little text
    }
    
    // Create a hash of the content (first 100 chars for efficiency)
    const contentHash = text.substring(0, 100);
    
    if (!textGroups.has(contentHash)) {
      textGroups.set(contentHash, []);
    }
    textGroups.get(contentHash).push(element);
  });
  
  logDebug(`Found ${textGroups.size} unique content groups to analyze`);
  
  // Store detected languages and their elements
  const languageGroups = {};
  
  // Detect language for each unique content group
  let index = 0;
  for (const [contentHash, elements] of textGroups.entries()) {
    const sampleElement = elements[0];
    const text = sampleElement.innerText || sampleElement.textContent;
    
    try {
      const { language, confidence } = await detectLanguage(text);
      
      if (confidence >= TRANSLATION_CONFIG.detectConfidenceThreshold && 
          language !== TRANSLATION_CONFIG.defaultPageLanguage) {
        
        if (!languageGroups[language]) {
          languageGroups[language] = [];
        }
        
        // Add all elements with this content to the language group
        elements.forEach(el => {
          // Mark the element for tracking
          el.setAttribute('data-detected-language', language);
          el.setAttribute('data-lang-confidence', confidence.toFixed(2));
          languageGroups[language].push(el);
        });
      }
    } catch (e) {
      console.error('Error detecting language:', e);
    }
    
    // Avoid overwhelming the browser
    await new Promise(resolve => setTimeout(resolve, 80));
  }
  
  // Display results
  displayLanguageDetectionResults(languageGroups);
  
  // Auto-translate if enabled and languages detected
  const autoTranslateDisabled = localStorage.getItem('autoTranslateDisabled') === 'true';
  if (!autoTranslateDisabled && Object.keys(languageGroups).length > 0) {
    // Automatically translate the first detected language
    const firstLanguage = Object.keys(languageGroups)[0];
    translateDetectedLanguage(firstLanguage, languageGroups[firstLanguage]);
  }
  
  return languageGroups;
}

// Display language detection results in the UI
function displayLanguageDetectionResults(languageGroups) {
  const resultsContainer = document.getElementById('language-detection-results');
  if (!resultsContainer) return;
  
  if (Object.keys(languageGroups).length === 0) {
    resultsContainer.innerHTML = '<div class="placeholder">No foreign language content detected</div>';
    return;
  }
  
  let resultsHtml = '';
  
  for (const [language, elements] of Object.entries(languageGroups)) {
    const languageName = getLanguageName(language);
    resultsHtml += `
      <div class="detected-language">
        <span>${languageName} (${elements.length} items)</span>
        <button data-translate-lang="${language}">Translate</button>
      </div>
    `;
  }
  
  resultsContainer.innerHTML = resultsHtml;
  
  // Add event listeners to translate buttons
  resultsContainer.querySelectorAll('[data-translate-lang]').forEach(button => {
    button.addEventListener('click', () => {
      const lang = button.getAttribute('data-translate-lang');
      translateDetectedLanguage(lang, languageGroups[lang]);
    });
  });
}

// Translate elements in a specific detected language
async function translateDetectedLanguage(language, elements) {
  if (!elements || elements.length === 0) return;
  
  logDebug(`Translating ${elements.length} elements in ${language}...`);
  
  // Mark elements as being translated
  elements.forEach(el => el.classList.add('translating'));
  
  // Set the Google Translate widget to the target language
  setTranslateLanguage(language);
  
  // Wait for the translation to apply
  await new Promise(resolve => setTimeout(resolve, TRANSLATION_CONFIG.translationDelay));
  
  // Reset to original language to stop further translations
  setTranslateLanguage(TRANSLATION_CONFIG.defaultPageLanguage);
  
  // Remove the translating indicator
  elements.forEach(el => el.classList.remove('translating'));
  
  logDebug(`Completed translation of ${language} content`);
}

// Get human-readable language name from language code
function getLanguageName(languageCode) {
  const languageNames = {
    'af': 'Afrikaans', 'ar': 'Arabic', 'bg': 'Bulgarian',
    'zh': 'Chinese', 'cs': 'Czech', 'da': 'Danish', 'nl': 'Dutch',
    'en': 'English', 'et': 'Estonian', 'fi': 'Finnish', 'fr': 'French',
    'de': 'German', 'el': 'Greek', 'he': 'Hebrew', 'hi': 'Hindi',
    'hu': 'Hungarian', 'id': 'Indonesian', 'it': 'Italian', 'ja': 'Japanese',
    'ko': 'Korean', 'lv': 'Latvian', 'lt': 'Lithuanian', 'no': 'Norwegian',
    'pl': 'Polish', 'pt': 'Portuguese', 'ro': 'Romanian', 'ru': 'Russian',
    'sk': 'Slovak', 'sl': 'Slovenian', 'es': 'Spanish', 'sv': 'Swedish',
    'th': 'Thai', 'tr': 'Turkish', 'uk': 'Ukrainian', 'vi': 'Vietnamese'
  };
  
  return languageNames[languageCode] || languageCode;
}

// Initialize translation when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  loadGoogleTranslateScript();
});
