<?php
// index.php: Main UI page for the GDELT Global News Tracker
header('Content-Type: text/html; charset=utf-8');
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GDELT Global News Tracker</title>
  <link rel="stylesheet" href="style.css">
  <link rel="stylesheet" href="https://unpkg.com/leaflet/dist/leaflet.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
  <link rel="icon" href="favicon.ico" type="image/x-icon">
  <meta name="description" content="Track global news events in real-time using GDELT data">
</head>
<body>
  <!-- Header with search controls -->
  <header>
    <div class="logo">
      <i class="fas fa-globe-americas"></i>
      <span>GDELT Global News Tracker</span>
    </div>
    <div class="controls">
      <form id="searchForm">
        <input type="text" id="searchInput" name="q" list="suggestions" placeholder="Search news (e.g., earthquake, climate)">
        <datalist id="suggestions">
          <option value="earthquake">
          <option value="climate change">
          <option value="election">
          <option value="pandemic">
          <option value="technology">
          <option value="economy">
          <option value="sports">
          <option value="conflict">
          <option value="politics">
        </datalist>
        <select id="timeRange">
          <option value="1h">Last Hour</option>
          <option value="6h">Last 6 Hours</option>
          <option value="24h" selected>Last 24 Hours</option>
          <option value="3d">Last 3 Days</option>
          <option value="7d">Last Week</option>
        </select>
        <button type="submit" class="btn">
          <i class="fas fa-search"></i>
          <span class="btn-text">Search</span>
        </button>
        <button type="button" id="refreshButton" class="btn" title="Refresh data">
          <i class="fas fa-sync-alt"></i>
          <span class="btn-text">Refresh</span>
        </button>
      </form>
<div class="right-controls">
  <button id="fullscreenToggle" class="icon-btn" title="Toggle fullscreen">
    <i class="fas fa-expand"></i>
  </button>
  <button id="themeToggle" class="icon-btn" title="Toggle dark/light mode">
    <i class="fas fa-moon"></i>
  </button>
  <!-- ADD THIS NEW BUTTON -->
  <button id="translation-toggle" class="icon-btn" title="Translation Options">
    <i class="fas fa-language"></i>
  </button>
</div>
    </div>
  </header>

  <!-- Main content area with map and news feed -->
  <div class="content-container">
    <!-- Map container with overlay -->
    <div id="mapContainer">
      <div id="map"></div>
      <div class="map-overlay">
        <div id="lastUpdated">Last updated: Loading...</div>
        <div id="mapLegend">
          <div class="legend-item">
            <div class="legend-marker" style="background:#e74c3c;"></div>
            <span>Recent (1h)</span>
          </div>
          <div class="legend-item">
            <div class="legend-marker" style="background:#e67e22;"></div>
            <span>Recent (6h)</span>
          </div>
          <div class="legend-item">
            <div class="legend-marker" style="background:#f39c12;"></div>
            <span>Older</span>
          </div>
        </div>
      </div>
      <div class="map-controls">
        <button id="clusterToggle" class="map-control-btn" title="Toggle clustering">
          <i class="fas fa-layer-group"></i>
        </button>
        <button id="heatmapToggle" class="map-control-btn" title="Toggle heatmap">
          <i class="fas fa-fire"></i>
        </button>
      </div>
    </div>

    <!-- News feed container -->
    <div id="newsFeedContainer">
      <div class="feed-header">
        <h2>Global News Feed</h2>
        <div class="feed-controls">
          <select id="sortOptions" title="Sort articles">
            <option value="time">Most Recent</option>
            <option value="relevance">Relevance</option>
            <option value="country">Country</option>
          </select>
          <button id="toggleFeed" title="Toggle news feed">
            <i class="fas fa-chevron-left"></i>
          </button>
        </div>
      </div>
      <div id="newsFeed">
        <div class="no-results">
          <i class="fas fa-newspaper"></i>
          <p>Loading news articles...</p>
        </div>
      </div>
      <div id="feedPagination" class="pagination"></div>
    </div>
  </div>

  <!-- Modal for country news -->
  <div id="articlesModal" class="modal">
    <div class="modal-content">
      <div class="modal-header">
        <h3 id="modalCountry">Country News</h3>
        <div class="modal-header-controls">
          <button id="modalShare" class="icon-btn" title="Share these results">
            <i class="fas fa-share-alt"></i>
          </button>
          <button id="modalClose" class="modal-close">
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>
      <div class="modal-body">
        <div id="modalArticles"></div>
        <div id="modalPagination" class="pagination"></div>
      </div>
    </div>
  </div>

  <!-- Welcome guide modal -->
  <div id="welcomeModal" class="modal">
    <div class="modal-content">
      <div class="modal-header">
        <h3>Welcome to GDELT Global News Tracker</h3>
        <button class="modal-close" id="welcomeClose">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="modal-body">
        <div class="welcome-content">
          <p>This application visualizes news events from around the world using GDELT data.</p>
          
          <h4><i class="fas fa-map-marker-alt"></i> Interactive Map</h4>
          <p>The map displays news hotspots worldwide. Larger circles indicate more news activity.</p>
          <ul>
            <li>Click on any marker to see news from that country</li>
            <li>Hover over articles in the feed to focus the map</li>
            <li>Use map controls to toggle visualization modes</li>
          </ul>
          
          <h4><i class="fas fa-search"></i> Search & Filter</h4>
          <p>Use the search bar to find specific news topics and adjust the time range.</p>
          
          <h4><i class="fas fa-newspaper"></i> News Feed</h4>
          <p>Browse news articles in the right panel. Articles can be sorted by recency, relevance, or country.</p>
          
          <div class="welcome-footer">
            <label>
              <input type="checkbox" id="dontShowAgain"> Don't show this again
            </label>
            <button id="startExploring" class="btn">Start Exploring</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Share/Export modal -->
  <div id="shareModal" class="modal">
    <div class="modal-content">
      <div class="modal-header">
        <h3>Share Current View</h3>
        <button class="modal-close" id="shareClose">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="modal-body">
        <div class="share-options">
          <div class="share-option">
            <h4>Link to Current View</h4>
            <div class="share-input-group">
              <input type="text" id="shareLink" readonly>
              <button id="copyLink" class="btn"><i class="fas fa-copy"></i></button>
            </div>
          </div>
          
          <div class="share-option">
            <h4>Export Data</h4>
            <div class="export-buttons">
              <button id="exportCSV" class="btn"><i class="fas fa-file-csv"></i> CSV</button>
              <button id="exportJSON" class="btn"><i class="fas fa-file-code"></i> JSON</button>
            </div>
          </div>
          
          <div class="share-option">
            <h4>Share to Social Media</h4>
            <div class="social-buttons">
              <button class="social-btn twitter-btn"><i class="fab fa-twitter"></i></button>
              <button class="social-btn facebook-btn"><i class="fab fa-facebook-f"></i></button>
              <button class="social-btn linkedin-btn"><i class="fab fa-linkedin-in"></i></button>
              <button class="social-btn email-btn"><i class="fas fa-envelope"></i></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Loading indicator -->
  <div id="loader">
    <div class="spinner"></div>
    <p id="loaderMessage">Loading news data...</p>
  </div>

  <!-- Error toast notification -->
  <div id="errorToast" class="toast">
    <div class="toast-icon"><i class="fas fa-exclamation-circle"></i></div>
    <div class="toast-message">Error message goes here</div>
    <button class="toast-close"><i class="fas fa-times"></i></button>
  </div>

  <!-- Scripts -->
  <script src="https://unpkg.com/leaflet/dist/leaflet.js"></script>
  <script src="https://unpkg.com/leaflet.markercluster/dist/leaflet.markercluster.js"></script>
<script src="script.js"></script>
</body>
</html>
