/**
 * GDELT Global News Tracker - Main JavaScript
 * Enhanced with better data handling, visualization, and user experience
 */

document.addEventListener('DOMContentLoaded', function() {
  // Global state variables
  let state = {
    capitals: {},
    articlesByCountry: {},
    allArticles: [],
    mapInstance: null,
    markersLayer: null,
    clusterLayer: null,
    heatmapLayer: null,
    originalView: { center: [20, 0], zoom: 2 },
    visualization: 'markers', // 'markers', 'clusters', or 'heatmap'
    currentPage: 1,
    articlesPerPage: 10,
    isFeedCollapsed: false,
    isLoading: false,
    currentQuery: {
      keyword: "earthquake",
      timespan: "24h",
      country: "",
      sortBy: "time"
    },
    lastUpdated: null,
    isDarkMode: localStorage.getItem('darkMode') === 'true',
    modalData: {
      country: null,
      articles: [],
      currentPage: 1
    }
  };

  // DOM Elements
  const elements = {
    map: document.getElementById('map'),
    newsFeed: document.getElementById('newsFeed'),
    searchForm: document.getElementById('searchForm'),
    searchInput: document.getElementById('searchInput'),
    timeRange: document.getElementById('timeRange'),
    refreshButton: document.getElementById('refreshButton'),
    themeToggle: document.getElementById('themeToggle'),
    toggleFeed: document.getElementById('toggleFeed'),
    lastUpdated: document.getElementById('lastUpdated'),
    loaderEl: document.getElementById('loader'),
    loaderMessage: document.getElementById('loaderMessage'),
    feedContainer: document.getElementById('newsFeedContainer'),
    mapContainer: document.getElementById('mapContainer'),
    feedPagination: document.getElementById('feedPagination'),
    modalCountry: document.getElementById('modalCountry'),
    modalArticles: document.getElementById('modalArticles'),
    modalPagination: document.getElementById('modalPagination'),
    articlesModal: document.getElementById('articlesModal'),
    modalClose: document.getElementById('modalClose'),
    modalShare: document.getElementById('modalShare'),
    sortOptions: document.getElementById('sortOptions'),
    clusterToggle: document.getElementById('clusterToggle'),
    heatmapToggle: document.getElementById('heatmapToggle'),
    fullscreenToggle: document.getElementById('fullscreenToggle'),
    errorToast: document.getElementById('errorToast'),
    welcomeModal: document.getElementById('welcomeModal'),
    welcomeClose: document.getElementById('welcomeClose'),
    startExploring: document.getElementById('startExploring'),
    dontShowAgain: document.getElementById('dontShowAgain'),
    shareModal: document.getElementById('shareModal'),
    shareClose: document.getElementById('shareClose'),
    shareLink: document.getElementById('shareLink'),
    copyLink: document.getElementById('copyLink'),
    exportCSV: document.getElementById('exportCSV'),
    exportJSON: document.getElementById('exportJSON')
  };

  // Initialize the application
  init();

  /**
   * Initialize the application
   */
  function init() {
    // Apply dark mode if saved
    if (state.isDarkMode) {
      document.body.classList.add('dark-mode');
      elements.themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
    }

    // Load capitals data
    fetchCapitals()
      .then(() => {
        initMap();
        initEventListeners();
        
        // Check for URL parameters
        processUrlParams();
        
        // Fetch initial news
        fetchNewsAndUpdate();
        
        // Show welcome modal for first-time users
        if (!localStorage.getItem('welcomeDismissed')) {
          showWelcomeModal();
        }
      })
      .catch(error => {
        showError('Failed to initialize application. Please refresh the page.', error);
      });
  }

  /**
   * Fetch capitals.json data
   */
  async function fetchCapitals() {
    try {
      const response = await fetch('capitals.json');
      if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
      state.capitals = await response.json();
      console.log('Capitals data loaded successfully');
    } catch (error) {
      console.error('Error loading capitals data:', error);
      throw error;
    }
  }

  /**
   * Process URL parameters for sharing
   */
  function processUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const keyword = urlParams.get('q');
    const timespan = urlParams.get('timespan');
    const country = urlParams.get('country');
    
    if (keyword) elements.searchInput.value = keyword;
    if (timespan && ['1h', '6h', '24h', '3d', '7d'].includes(timespan)) elements.timeRange.value = timespan;
    
    if (keyword || timespan || country) {
      state.currentQuery.keyword = keyword || state.currentQuery.keyword;
      state.currentQuery.timespan = timespan || state.currentQuery.timespan;
      state.currentQuery.country = country || state.currentQuery.country;
    }
  }

  /**
   * Update URL parameters based on current state
   */
  function updateUrlParams() {
    const url = new URL(window.location);
    url.searchParams.set('q', state.currentQuery.keyword);
    url.searchParams.set('timespan', state.currentQuery.timespan);
    
    if (state.currentQuery.country) {
      url.searchParams.set('country', state.currentQuery.country);
    } else {
      url.searchParams.delete('country');
    }
    
    window.history.replaceState({}, '', url);
  }

  /**
   * Initialize the map
   */
  function initMap() {
    state.mapInstance = L.map('map', {
      zoomControl: false,
      attributionControl: false,
      minZoom: 2,
      maxBoundsViscosity: 1.0
    }).setView(state.originalView.center, state.originalView.zoom);
    
    // Set max bounds to prevent excessive panning
    const southWest = L.latLng(-89.98155760646617, -180);
    const northEast = L.latLng(89.99346179538875, 180);
    const bounds = L.latLngBounds(southWest, northEast);
    state.mapInstance.setMaxBounds(bounds);
    
    // Add zoom control in top right
    L.control.zoom({
      position: 'topright'
    }).addTo(state.mapInstance);
    
    // Add attribution control in bottom right
    L.control.attribution({
      position: 'bottomright',
      prefix: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | <a href="https://www.gdeltproject.org/">GDELT Project</a>'
    }).addTo(state.mapInstance);
    
    // Add appropriate tile layer based on theme
    updateMapStyleForDarkMode();
    
    // Initialize markers layer
    state.markersLayer = L.layerGroup().addTo(state.mapInstance);
    
    // Add reset view control
    addResetViewControl();
    
    console.log('Map initialized successfully');
  }

  /**
   * Add custom reset view control
   */
  function addResetViewControl() {
    const resetControl = L.Control.extend({
      options: {
        position: 'topright'
      },
      
      onAdd: function() {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        const button = L.DomUtil.create('a', '', container);
        button.innerHTML = '<i class="fas fa-home" style="line-height: 26px;"></i>';
        button.title = 'Reset view';
        button.href = '#';
        button.style.width = '26px';
        button.style.height = '26px';
        button.style.textAlign = 'center';
        button.style.fontWeight = 'bold';
        
        L.DomEvent.on(button, 'click', function(e) {
          L.DomEvent.stopPropagation(e);
          L.DomEvent.preventDefault(e);
          state.mapInstance.flyTo(state.originalView.center, state.originalView.zoom, {
            duration: 1.5,
            easeLinearity: 0.25
          });
        });
        
        return container;
      }
    });
    
    state.mapInstance.addControl(new resetControl());
  }

  /**
   * Initialize event listeners
   */
  function initEventListeners() {
    // Search form submission
    elements.searchForm.addEventListener('submit', function(e) {
      e.preventDefault();
      state.currentQuery.keyword = elements.searchInput.value.trim();
      state.currentQuery.timespan = elements.timeRange.value;
      state.currentPage = 1;
      fetchNewsAndUpdate();
      updateUrlParams();
    });
    
    // Refresh button
    elements.refreshButton.addEventListener('click', function() {
      fetchNewsAndUpdate();
    });
    
    // Time range change
    elements.timeRange.addEventListener('change', function() {
      state.currentQuery.timespan = elements.timeRange.value;
      state.currentPage = 1;
      fetchNewsAndUpdate();
      updateUrlParams();
    });
    
    // Sort options change
    elements.sortOptions.addEventListener('change', function() {
      state.currentQuery.sortBy = elements.sortOptions.value;
      sortAndRenderArticles();
    });
    
    // Theme toggle
    elements.themeToggle.addEventListener('click', toggleDarkMode);
    
    // Feed toggle
    elements.toggleFeed.addEventListener('click', toggleNewsFeed);
    
    // Map visualization toggles
    elements.clusterToggle.addEventListener('click', function() {
      toggleVisualization('clusters');
    });
    
    elements.heatmapToggle.addEventListener('click', function() {
      toggleVisualization('heatmap');
    });
    
    // Fullscreen toggle
    elements.fullscreenToggle.addEventListener('click', toggleFullscreen);
    
    // Modal close buttons
    elements.modalClose.addEventListener('click', function() {
      elements.articlesModal.classList.remove('show');
    });
    
    elements.welcomeClose.addEventListener('click', closeWelcomeModal);
    elements.startExploring.addEventListener('click', closeWelcomeModal);
    
    elements.shareClose.addEventListener('click', function() {
      elements.shareModal.classList.remove('show');
    });
    
    // Share button in modal
    elements.modalShare.addEventListener('click', function() {
      openShareModal(state.modalData.country);
    });
    
    // Copy link button
    elements.copyLink.addEventListener('click', function() {
      copyToClipboard(elements.shareLink.value);
      showToast('Link copied to clipboard!', 'success');
    });
    
    // Export buttons
    elements.exportCSV.addEventListener('click', function() {
      exportData('csv');
    });
    
    elements.exportJSON.addEventListener('click', function() {
      exportData('json');
    });
    
    // Close modal on outside click
    window.addEventListener('click', function(event) {
      if (event.target === elements.articlesModal) {
        elements.articlesModal.classList.remove('show');
      }
      if (event.target === elements.welcomeModal) {
        closeWelcomeModal();
      }
      if (event.target === elements.shareModal) {
        elements.shareModal.classList.remove('show');
      }
    });
    
    // Error toast close button
    document.querySelector('.toast-close').addEventListener('click', function() {
      elements.errorToast.classList.remove('show');
    });
    
    // Don't show again checkbox
    elements.dontShowAgain.addEventListener('change', function() {
      if (this.checked) {
        localStorage.setItem('welcomeDismissed', 'true');
      } else {
        localStorage.removeItem('welcomeDismissed');
      }
    });
    
    // Make showModal available globally for popup clicks
    window.showModal = showModal;
  }

  /**
   * Show welcome guide modal
   */
  function showWelcomeModal() {
    elements.welcomeModal.classList.add('show');
  }

  /**
   * Close welcome modal and save preference
   */
  function closeWelcomeModal() {
    elements.welcomeModal.classList.remove('show');
    if (elements.dontShowAgain.checked) {
      localStorage.setItem('welcomeDismissed', 'true');
    }
  }

  /**
   * Toggle dark mode
   */
  function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    state.isDarkMode = document.body.classList.contains('dark-mode');
    
    // Update button icon
    elements.themeToggle.innerHTML = state.isDarkMode
      ? '<i class="fas fa-sun"></i>'
      : '<i class="fas fa-moon"></i>';
    
    // Save preference
    localStorage.setItem('darkMode', state.isDarkMode);
    
    // Update map if needed
    if (state.mapInstance) {
      updateMapStyleForDarkMode();
    }
  }

  /**
   * Update map tile layer based on dark mode
   */
  function updateMapStyleForDarkMode() {
    // Remove current tile layer
    state.mapInstance.eachLayer(function(layer) {
      if (layer instanceof L.TileLayer) {
        state.mapInstance.removeLayer(layer);
      }
    });
    
    // Add appropriate tile layer
    if (state.isDarkMode) {
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd'
      }).addTo(state.mapInstance);
    } else {
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd'
      }).addTo(state.mapInstance);
    }
  }

  /**
   * Toggle news feed visibility
   */
  function toggleNewsFeed() {
    state.isFeedCollapsed = !state.isFeedCollapsed;
    elements.feedContainer.classList.toggle('feed-collapsed', state.isFeedCollapsed);
    elements.mapContainer.classList.toggle('map-expanded', state.isFeedCollapsed);
    
    // Update toggle button icon
    elements.toggleFeed.innerHTML = state.isFeedCollapsed
      ? '<i class="fas fa-chevron-right"></i>'
      : '<i class="fas fa-chevron-left"></i>';
    
    // Adjust map to handle resize
    if (state.mapInstance) {
      setTimeout(() => {
        state.mapInstance.invalidateSize();
      }, 300);
    }
  }

  /**
   * Toggle fullscreen mode
   */
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        showError('Error attempting to enable full-screen mode', err);
      });
      elements.fullscreenToggle.innerHTML = '<i class="fas fa-compress"></i>';
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        elements.fullscreenToggle.innerHTML = '<i class="fas fa-expand"></i>';
      }
    }
  }

  /**
   * Toggle between visualization modes (markers, clusters, heatmap)
   */
  function toggleVisualization(mode) {
    if (state.visualization === mode) {
      // If clicking the active mode, switch back to markers
      mode = 'markers';
    }
    
    state.visualization = mode;
    
    // Update UI
    elements.clusterToggle.classList.toggle('active', mode === 'clusters');
    elements.heatmapToggle.classList.toggle('active', mode === 'heatmap');
    
    // Apply visualization
    refreshMapVisualization();
  }

  /**
   * Apply the current visualization mode to the map
   */
  function refreshMapVisualization() {
    // Clear all layers first
    if (state.markersLayer) state.mapInstance.removeLayer(state.markersLayer);
    if (state.clusterLayer) state.mapInstance.removeLayer(state.clusterLayer);
    if (state.heatmapLayer) state.mapInstance.removeLayer(state.heatmapLayer);
    
    const articlesData = state.allArticles;
    
    if (articlesData.length === 0) {
      // If no data, just show empty markers layer
      state.markersLayer = L.layerGroup().addTo(state.mapInstance);
      return;
    }
    
    switch (state.visualization) {
      case 'clusters':
        createClusterVisualization(articlesData);
        break;
      case 'heatmap':
        createHeatmapVisualization(articlesData);
        break;
      default:
        createMarkerVisualization(articlesData);
    }
  }

  /**
   * Create standard markers visualization
   */
  function createMarkerVisualization(articles) {
    state.markersLayer = L.layerGroup().addTo(state.mapInstance);
    
    // Group articles by country for markers
    const groupsByCountry = groupArticlesByCountry(articles);
    addMarkers(groupsByCountry);
  }

  /**
   * Create marker cluster visualization
   */
  function createClusterVisualization(articles) {
    // Create a marker cluster group
    state.clusterLayer = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 50,
      iconCreateFunction: function(cluster) {
        const count = cluster.getChildCount();
        let size, className;
        
        if (count < 10) {
          size = 'small';
          className = 'marker-cluster-small';
        } else if (count < 50) {
          size = 'medium';
          className = 'marker-cluster-medium';
        } else {
          size = 'large';
          className = 'marker-cluster-large';
        }
        
        return L.divIcon({
          html: '<div><span>' + count + '</span></div>',
          className: 'marker-cluster ' + className,
          iconSize: L.point(40, 40)
        });
      }
    }).addTo(state.mapInstance);
    
    // Add individual markers to the cluster
    articles.forEach(article => {
      if (!article.sourcecountry || !state.capitals[article.sourcecountry]) return;
      
      const marker = L.marker(state.capitals[article.sourcecountry], {
        title: article.title || 'No title'
      });
      
      marker.bindPopup(`
        <div style="width:220px;">
          <h4 style="margin:0 0 8px;font-size:14px;">${article.title || 'No title'}</h4>
          <p style="margin:0 0 5px;font-size:12px;">${article.sourcecountry} &middot; ${formatTimestamp(article.seendate)}</p>
          <p style="margin:0;font-size:12px;">${article.domain || 'Unknown source'}</p>
          <button 
            style="width:100%;margin-top:8px;padding:5px;background:#3498db;color:white;border:none;border-radius:3px;cursor:pointer;"
            onclick="window.open('${article.url}', '_blank')"
          >
            Read Article
          </button>
        </div>
      `);
      
      state.clusterLayer.addLayer(marker);
    });
  }

  /**
   * Create heatmap visualization
   */
  function createHeatmapVisualization(articles) {
    // First, create a standard markers layer as fallback
    state.markersLayer = L.layerGroup().addTo(state.mapInstance);
    
    // Show message that heatmap is not available
    showToast('Heatmap visualization requires the Leaflet.heat plugin which is not currently loaded.', 'warning');
    
    // Create markers anyway
    const groupsByCountry = groupArticlesByCountry(articles);
    addMarkers(groupsByCountry);
  }

  /**
   * Format timestamps for display
   */
  function formatTimestamp(timestamp) {
    if (!timestamp) return "Unknown date";
    try {
      const year = timestamp.substr(0, 4);
      const month = timestamp.substr(4, 2) - 1;
      const day = timestamp.substr(6, 2);
      const hour = timestamp.substr(9, 2);
      const minute = timestamp.substr(11, 2);
      const second = timestamp.substr(13, 2);
      const dateObj = new Date(Date.UTC(year, month, day, hour, minute, second));
      
      const now = new Date();
      const diffMs = now - dateObj;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);
      
      // Use relative time for recent articles
      if (diffMins < 60) {
        return `${diffMins} ${diffMins === 1 ? 'minute' : 'minutes'} ago`;
      } else if (diffHours < 24) {
        return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
      } else if (diffDays < 7) {
        return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
      } else {
        return dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString();
      }
    } catch (e) {
      console.error("Error formatting timestamp", e);
      return "Unknown date";
    }
  }

  /**
   * Group articles by country
   */
  function groupArticlesByCountry(articles) {
    const groups = {};
    articles.forEach(article => {
      if (!article.sourcecountry) return;
      
      const country = article.sourcecountry;
      if (!groups[country]) {
        groups[country] = [];
      }
      groups[country].push(article);
    });
    return groups;
  }

  /**
   * Add markers to the map based on grouped country data
   */
  function addMarkers(groups) {
    // Clear existing markers
    if (state.markersLayer) {
      state.markersLayer.clearLayers();
    } else {
      state.markersLayer = L.layerGroup().addTo(state.mapInstance);
    }
    
    // Reset country->articles mapping
    state.articlesByCountry = {};

    // Calculate marker sizes based on article counts
    const counts = Object.values(groups).map(arr => arr.length);
    const maxCount = Math.max(...counts, 1);
    
    // Logarithmic scaling for better visualization
    const getRadius = count => {
      const minRadius = 5;
      const maxRadius = 25;
      // Use log scale to prevent huge markers
      const normalized = Math.log(count + 1) / Math.log(maxCount + 1);
      return minRadius + normalized * (maxRadius - minRadius);
    };
    
    // Color scale based on recency
    const getColor = articles => {
      // Check if articles have recent timestamps
      const now = new Date();
      const mostRecent = articles.reduce((latest, article) => {
        if (!article.seendate) return latest;
        
        try {
          const year = article.seendate.substr(0, 4);
          const month = article.seendate.substr(4, 2) - 1;
          const day = article.seendate.substr(6, 2);
          const hour = article.seendate.substr(9, 2);
          const minute = article.seendate.substr(11, 2);
          const second = article.seendate.substr(13, 2);
          
          const date = new Date(Date.UTC(year, month, day, hour, minute, second));
          return date > latest ? date : latest;
        } catch (e) {
          return latest;
        }
      }, new Date(0));
      
      const hoursDiff = (now - mostRecent) / (1000 * 60 * 60);
      
      // Color from red (newest) to orange (older)
      if (hoursDiff < 1) return '#e74c3c'; // Very recent (< 1 hour)
      if (hoursDiff < 6) return '#e67e22'; // Recent (< 6 hours)
      return '#f39c12'; // Older
    };

    // Create and add markers for each country
    Object.entries(groups).forEach(([country, articles]) => {
      if (state.capitals[country]) {
        const count = articles.length;
        const radius = getRadius(count);
        const color = getColor(articles);
        
        // Create pulsating marker for more visibility
        const marker = L.circleMarker(state.capitals[country], {
          radius: radius,
          fillColor: color,
          color: '#fff',
          weight: 2,
          opacity: 0.8,
          fillOpacity: 0.7,
          className: count > 10 ? 'pulse-marker' : ''
        });
        
        // Popup with preview and button to view all articles
        const popupContent = `
          <div style="width:220px;">
            <strong style="font-size:14px;">${country}</strong>
            <span style="float:right;background:${color};color:white;padding:2px 6px;border-radius:10px;font-size:12px;">${count}</span>
            <hr style="margin:8px 0;border:0;border-top:1px solid #eee;">
            <p style="font-size:12px;margin:0 0 5px;">Top headlines:</p>
            <ul style="padding-left:15px;margin:0;font-size:12px;">
              ${articles.slice(0, 3).map(a => `<li style="margin-bottom:3px;">${a.title || 'Untitled article'}</li>`).join('')}
              ${count > 3 ? `<li style="font-style:italic;">And ${count - 3} more articles...</li>` : ''}
            </ul>
            <button 
              style="width:100%;margin-top:8px;padding:5px;background:#3498db;color:white;border:none;border-radius:3px;cursor:pointer;"
              onclick="showModal('${country}')"
            >
              View All Articles
            </button>
          </div>
        `;

        marker.bindPopup(popupContent);
        
        // Add click event to show modal
        marker.on('click', () => {
          state.mapInstance.flyTo(state.capitals[country], 5, { duration: 1 });
          showModal(country);
        });
        
        state.markersLayer.addLayer(marker);
        
        // Store articles by country for later retrieval
        state.articlesByCountry[country] = articles;
      }
    });
  }

  /**
   * Show modal with country articles
   */
  function showModal(country) {
    const articles = state.articlesByCountry[country];
    if (!articles || articles.length === 0) {
      showToast('No articles available for this region.', 'warning');
      return;
    }
    
    // Update modal data
    state.modalData.country = country;
    state.modalData.articles = articles;
    state.modalData.currentPage = 1;
    
    // Update modal title
    elements.modalCountry.textContent = `${country} (${articles.length} articles)`;
    
    // Render articles
    renderModalArticles(articles, 1);
    
    // Show modal
    elements.articlesModal.classList.add('show');
  }

  /**
   * Render articles in the modal with pagination
   */
  function renderModalArticles(articles, page = 1) {
    const perPage = 5;
    const start = (page - 1) * perPage;
    const end = start + perPage;
    const paginatedArticles = articles.slice(start, end);
    
    elements.modalArticles.innerHTML = '';
    
    if (paginatedArticles.length === 0) {
      elements.modalArticles.innerHTML = '<div class="no-results"><p>No articles available.</p></div>';
      return;
    }
    
    // Create article elements
    paginatedArticles.forEach(article => {
      const articleDiv = document.createElement('div');
      articleDiv.classList.add('article');
      
      const content = article.content || article.excerpt || 'No additional content available.';
      
      articleDiv.innerHTML = `
        <div class="article-header">
          ${article.socialimage ? 
            `<img src="${article.socialimage}" alt="Article image" class="article-image">` : 
            '<div class="article-image"></div>'
          }
          <div class="article-title">
            <h3>${article.title || 'No title'}</h3>
          </div>
        </div>
        <div class="article-meta">
          <span>${formatTimestamp(article.seendate)}</span>
          <div class="article-source">
            <i class="fas fa-link"></i>
            <span>${article.domain || 'Unknown source'}</span>
          </div>
        </div>
        <div class="article-content">
          <p>${content}</p>
        </div>
        <div class="article-actions">
          <a href="${article.url}" target="_blank" class="article-btn">
            <i class="fas fa-external-link-alt"></i>
            Read Full Article
          </a>
        </div>
      `;
      
      elements.modalArticles.appendChild(articleDiv);
    });
    
    // Update pagination
    renderModalPagination(articles, page);
  }

  /**
   * Render pagination for modal
   */
  function renderModalPagination(articles, currentPage) {
    const perPage = 5;
    const totalPages = Math.ceil(articles.length / perPage);
    
    elements.modalPagination.innerHTML = '';
    
    if (totalPages <= 1) return;
    
    // Previous button
    if (currentPage > 1) {
      const prevBtn = document.createElement('button');
      prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
      prevBtn.onclick = () => renderModalArticles(articles, currentPage - 1);
      elements.modalPagination.appendChild(prevBtn);
    }
    
    // Page buttons
    for (let i = 1; i <= totalPages; i++) {
      // Show limited page numbers with ellipsis for large page counts
      if (
        i === 1 || 
        i === totalPages || 
        (i >= currentPage - 1 && i <= currentPage + 1)
      ) {
        const btn = document.createElement('button');
        btn.textContent = i;
        btn.className = i === currentPage ? 'active' : '';
        btn.onclick = () => renderModalArticles(articles, i);
        elements.modalPagination.appendChild(btn);
      } else if (
        (i === currentPage - 2 && currentPage > 3) || 
        (i === currentPage + 2 && currentPage < totalPages - 2)
      ) {
        const ellipsis = document.createElement('span');
        ellipsis.textContent = '...';
        ellipsis.style.margin = '0 5px';
        elements.modalPagination.appendChild(ellipsis);
      }
    }
    
    // Next button
    if (currentPage < totalPages) {
      const nextBtn = document.createElement('button');
      nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
      nextBtn.onclick = () => renderModalArticles(articles, currentPage + 1);
      elements.modalPagination.appendChild(nextBtn);
    }
  }

  /**
   * Open share modal
   */
  function openShareModal(country) {
    // Create share link
    const url = new URL(window.location);
    url.searchParams.set('q', state.currentQuery.keyword);
    url.searchParams.set('timespan', state.currentQuery.timespan);
    
    if (country) {
      url.searchParams.set('country', country);
    }
    
    elements.shareLink.value = url.toString();
    
    // Show modal
    elements.shareModal.classList.add('show');
  }

  /**
   * Copy text to clipboard
   */
  function copyToClipboard(text) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text)
        .catch(err => {
          console.error('Could not copy text: ', err);
        });
    } else {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
  }

  /**
   * Export data to CSV or JSON format
   */
  function exportData(format) {
    let data;
    const filename = `gdelt-news-${state.currentQuery.keyword}-${state.currentQuery.timespan}`;
    
    if (state.modalData.country) {
      // If modal is open, export only those articles
      data = state.modalData.articles;
    } else {
      // Otherwise export all articles
      data = state.allArticles;
    }
    
    if (!data || data.length === 0) {
      showToast('No data available to export.', 'warning');
      return;
    }
    
    if (format === 'csv') {
      exportCSVFile(data, filename);
    } else {
      exportJSONFile(data, filename);
    }
  }

  /**
   * Export data as CSV file
   */
  function exportCSVFile(data, filename) {
    // Extract column headers from first item
    const firstItem = data[0];
    const headers = Object.keys(firstItem);
    
    // Create CSV content
    let csvContent = headers.join(',') + '\n';
    
    // Add each row
    data.forEach(item => {
      const row = headers.map(header => {
        // Ensure values are properly quoted
        let value = item[header];
        if (value === null || value === undefined) {
          value = '';
        } else {
          value = String(value);
          // Escape quotes and wrap in quotes if contains comma or quote
          if (value.includes('"') || value.includes(',')) {
            value = '"' + value.replace(/"/g, '""') + '"';
          }
        }
        return value;
      });
      csvContent += row.join(',') + '\n';
    });
    
    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('CSV file downloaded.', 'success');
  }

  /**
   * Export data as JSON file
   */
  function exportJSONFile(data, filename) {
    const jsonContent = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}.json`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('JSON file downloaded.', 'success');
  }

  /**
   * Fetch news data and update the UI
   */
  async function fetchNewsAndUpdate() {
    // Prevent multiple simultaneous requests
    if (state.isLoading) return;
    
    state.isLoading = true;
    showLoader('Loading news data...');
    
    try {
      const keyword = state.currentQuery.keyword;
      const timespan = state.currentQuery.timespan;
      const country = state.currentQuery.country;
      
      // Build URL with parameters
      let url = `get_news.php?action=get_news&timespan=${encodeURIComponent(timespan)}`;
      if (keyword) url += `&q=${encodeURIComponent(keyword)}`;
      if (country) url += `&country=${encodeURIComponent(country)}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Server responded with status: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Handle API error
      if (data.status === 'error') {
        throw new Error(data.error || 'Unknown error occurred');
      }
      
      // Handle empty results
      if (data.status === 'empty' || !data.data || data.data.length === 0) {
        elements.newsFeed.innerHTML = `
          <div class="no-results">
            <i class="fas fa-search"></i>
            <p>No results found for "${keyword}". Try different search terms or time range.</p>
          </div>
        `;
        state.markersLayer.clearLayers();
        state.allArticles = [];
        hideLoader();
        state.isLoading = false;
        return;
      }
      
      // Store articles and update UI
      state.allArticles = data.data;
      state.lastUpdated = new Date();
      
      // Update last updated timestamp
      elements.lastUpdated.textContent = `Last updated: ${state.lastUpdated.toLocaleTimeString()}`;
      
      // Apply current visualization mode
      refreshMapVisualization();
      
      // Update news feed
      sortAndRenderArticles();
      
      console.log(`Loaded ${data.data.length} articles successfully`);
    } catch (error) {
      console.error('Error fetching news:', error);
      showError(`Failed to load news data: ${error.message}`);
      
      elements.newsFeed.innerHTML = `
        <div class="no-results">
          <i class="fas fa-exclamation-triangle"></i>
          <p>Error loading data. Please try again later.</p>
          <button id="retryButton" class="btn">
            <i class="fas fa-redo"></i> Retry
          </button>
        </div>
      `;
      
      // Add retry button functionality
      document.getElementById('retryButton').addEventListener('click', fetchNewsAndUpdate);
    } finally {
      hideLoader();
      state.isLoading = false;
    }
  }

  /**
   * Sort and render articles in the feed
   */
  function sortAndRenderArticles() {
    const articles = [...state.allArticles]; // Create a copy to avoid modifying original
    const sortBy = state.currentQuery.sortBy;
    
    // Sort based on selected option
    switch (sortBy) {
      case 'time':
        articles.sort((a, b) => {
          // Default to empty string if seendate doesn't exist
          const dateA = a.seendate || '';
          const dateB = b.seendate || '';
          return dateB.localeCompare(dateA); // Descending order (newest first)
        });
        break;
      
      case 'relevance':
        articles.sort((a, b) => {
          // Use relevance_score if available, or fall back to seendate
          const scoreA = a.relevance_score !== undefined ? a.relevance_score : 0;
          const scoreB = b.relevance_score !== undefined ? b.relevance_score : 0;
          
          if (scoreA === scoreB) {
            // If scores are equal, sort by date
            const dateA = a.seendate || '';
            const dateB = b.seendate || '';
            return dateB.localeCompare(dateA);
          }
          
          return scoreB - scoreA; // Descending order (highest score first)
        });
        break;
      
      case 'country':
        articles.sort((a, b) => {
          // Sort by country name, then by date
          const countryA = a.sourcecountry || '';
          const countryB = b.sourcecountry || '';
          
          if (countryA === countryB) {
            const dateA = a.seendate || '';
            const dateB = b.seendate || '';
            return dateB.localeCompare(dateA);
          }
          
          return countryA.localeCompare(countryB);
        });
        break;
    }
    
    // Render articles with pagination
    renderFeedArticles(articles, state.currentPage);
  }

  /**
   * Render articles in the news feed
   */
  function renderFeedArticles(articles, page = 1) {
    const perPage = state.articlesPerPage;
    const start = (page - 1) * perPage;
    const end = start + perPage;
    const paginatedArticles = articles.slice(start, end);
    
    elements.newsFeed.innerHTML = '';
    
    if (paginatedArticles.length === 0) {
      elements.newsFeed.innerHTML = `
        <div class="no-results">
          <i class="fas fa-search"></i>
          <p>No results found for "${state.currentQuery.keyword}". Try different search terms or time range.</p>
        </div>
      `;
      elements.feedPagination.innerHTML = '';
      return;
    }
    
    // Create article elements
    paginatedArticles.forEach(article => {
      const articleDiv = document.createElement('div');
      articleDiv.classList.add('article');
      
      // Add country tag
      if (article.sourcecountry) {
        const countryTag = document.createElement('div');
        countryTag.classList.add('article-country-tag');
        countryTag.textContent = article.sourcecountry;
        articleDiv.appendChild(countryTag);
      }
      
      articleDiv.innerHTML += `
        <div class="article-header">
          ${article.socialimage ? 
            `<img src="${article.socialimage}" alt="Article image" class="article-image">` : 
            '<div class="article-image"></div>'
          }
          <div class="article-title">
            <h3>${article.title || 'No title'}</h3>
          </div>
        </div>
        <div class="article-meta">
          <span>${formatTimestamp(article.seendate)}</span>
          <div class="article-source">
            <i class="fas fa-link"></i>
            <span>${article.domain || 'Unknown source'}</span>
          </div>
        </div>
        <div class="article-actions">
          <a href="${article.url}" target="_blank" class="article-btn">
            <i class="fas fa-external-link-alt"></i>
            Read Article
          </a>
          <button class="article-btn" data-country="${article.sourcecountry}">
            <i class="fas fa-map-marker-alt"></i>
            View on Map
          </button>
        </div>
      `;
      
      // Add hover to focus map
      articleDiv.addEventListener('mouseover', () => {
        const country = article.sourcecountry;
        if (state.capitals[country]) {
          state.mapInstance.flyTo(state.capitals[country], 5, { duration: 0.5 });
        }
      });
      
      articleDiv.addEventListener('mouseout', () => {
        state.mapInstance.flyTo(state.originalView.center, state.originalView.zoom, { duration: 0.5 });
      });
      
      // Add event listener to "View on Map" button
      articleDiv.querySelector('[data-country]').addEventListener('click', function() {
        const country = this.getAttribute('data-country');
        if (state.capitals[country]) {
          state.mapInstance.flyTo(state.capitals[country], 5, { duration: 1 });
          showModal(country);
        } else {
          showToast(`No map location available for ${country}`, 'warning');
        }
      });
      
      elements.newsFeed.appendChild(articleDiv);
    });
    
    // Render pagination
    renderFeedPagination(articles, page);
  }

  /**
   * Render pagination for feed
   */
  function renderFeedPagination(articles, currentPage) {
    const perPage = state.articlesPerPage;
    const totalPages = Math.ceil(articles.length / perPage);
    
    elements.feedPagination.innerHTML = '';
    
    if (totalPages <= 1) return;
    
    // Previous button
    if (currentPage > 1) {
      const prevBtn = document.createElement('button');
      prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
      prevBtn.onclick = () => {
        state.currentPage = currentPage - 1;
        renderFeedArticles(articles, state.currentPage);
      };
      elements.feedPagination.appendChild(prevBtn);
    }
    
    // Page buttons
    for (let i = 1; i <= totalPages; i++) {
      // Show limited page numbers with ellipsis for large page counts
      if (
        i === 1 || 
        i === totalPages || 
        (i >= currentPage - 1 && i <= currentPage + 1)
      ) {
        const btn = document.createElement('button');
        btn.textContent = i;
        btn.className = i === currentPage ? 'active' : '';
        btn.onclick = () => {
          state.currentPage = i;
          renderFeedArticles(articles, state.currentPage);
        };
        elements.feedPagination.appendChild(btn);
      } else if (
        (i === currentPage - 2 && currentPage > 3) || 
        (i === currentPage + 2 && currentPage < totalPages - 2)
      ) {
        const ellipsis = document.createElement('span');
        ellipsis.textContent = '...';
        ellipsis.style.margin = '0 5px';
        elements.feedPagination.appendChild(ellipsis);
      }
    }
    
    // Next button
    if (currentPage < totalPages) {
      const nextBtn = document.createElement('button');
      nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
      nextBtn.onclick = () => {
        state.currentPage = currentPage + 1;
        renderFeedArticles(articles, state.currentPage);
      };
      elements.feedPagination.appendChild(nextBtn);
    }
  }

  /**
   * Show loader with custom message
   */
  function showLoader(message = 'Loading...') {
    elements.loaderMessage.textContent = message;
    elements.loaderEl.style.display = 'flex';
  }

  /**
   * Hide loader
   */
  function hideLoader() {
    elements.loaderEl.style.display = 'none';
  }

  /**
   * Show toast notification
   */
  function showToast(message, type = 'error') {
    const toast = elements.errorToast;
    const toastMessage = toast.querySelector('.toast-message');
    const toastIcon = toast.querySelector('.toast-icon i');
    
    toastMessage.textContent = message;

    // Set icon based on type
    switch (type) {
      case 'success':
        toastIcon.className = 'fas fa-check-circle';
        toastIcon.style.color = 'var(--success-color)';
        break;
      case 'warning':
        toastIcon.className = 'fas fa-exclamation-triangle';
        toastIcon.style.color = 'var(--warning-color)';
        break;
      default:
        toastIcon.className = 'fas fa-exclamation-circle';
        toastIcon.style.color = 'var(--accent-color)';
    }
    
    // Show toast
    toast.classList.add('show');
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
      toast.classList.remove('show');
    }, 5000);
  }

  /**
   * Show error toast and log to console
   */
  function showError(message, error) {
    console.error(message, error);
    showToast(message);
  }
});
// Translation toggle button
document.getElementById('translation-toggle').addEventListener('click', function() {
  const translateUI = document.getElementById('custom-translate-ui');
  if (translateUI) {
    if (translateUI.style.display === 'none') {
      translateUI.style.display = 'block';
    } else {
      translateUI.style.display = 'none';
    }
  }
});
