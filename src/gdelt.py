import sys
import pandas as pd
from gdeltdoc import GdeltDoc, Filters
import json
from datetime import datetime
import re

# Initialize GDELT Document API client
gd = GdeltDoc()

# Get command line arguments with defaults
args = sys.argv[1:] if len(sys.argv) > 1 else []

# Parse arguments with better defaults and validation
keyword = args[0].strip() if len(args) > 0 and args[0].strip() else "earthquake"
timespan = args[1].strip() if len(args) > 1 and args[1].strip() else "24h"
country = args[2].strip() if len(args) > 2 and args[2].strip() else None

# Validate timespan (prevents injection)
valid_timespans = ['1h', '6h', '24h', '3d', '7d']
if timespan not in valid_timespans:
    timespan = '24h'  # Default to safe value if invalid

try:
    # Create the filter
    filt = Filters(
        keyword=keyword,
        timespan=timespan,
        num_records=250  # Increased from default for better coverage
    )
    
    # Add country filter if specified
    if country:
        filt.country = country
    
    # Fetch the articles
    df = gd.article_search(filt)
    
    # Debug: Print columns to stderr for debugging
    print(f"DataFrame columns: {list(df.columns)}", file=sys.stderr)
    
    # Handle empty results
    if df.empty:
        print(json.dumps([]))
        sys.exit(0)
    
    # Improve data quality
    # 1. Remove duplicates based on URL and title similarity
    if 'url' in df.columns:
        df = df.drop_duplicates(subset=['url'])
    if 'title' in df.columns:
        # Group very similar titles
        df = df.drop_duplicates(subset=['title'])
    
    # 2. Sort by seen date descending for freshness
    if 'seendate' in df.columns:
        df = df.sort_values(by='seendate', ascending=False)
    
    # 3. Clean and validate data
    # Ensure all text fields are strings
    text_cols = ['title', 'url', 'domain', 'sourcecountry', 'language', 'content', 'excerpt']
    for col in text_cols:
        if col in df.columns:
            df[col] = df[col].astype(str)
            df[col] = df[col].apply(lambda x: x if x != 'nan' else '')
    
    # 4. Add relevance score with more robust handling
    # First, ensure keyword is lowercase for consistent comparison
    keyword_lower = keyword.lower()
    # Split into individual terms for better matching
    keyword_terms = keyword_lower.split()
    
    # Define a more robust relevance scoring function
    def calculate_relevance(row):
        score = 0
        
        # Check title (highest weight)
        if 'title' in df.columns and row['title'] and not pd.isna(row['title']):
            title_lower = str(row['title']).lower()
            # Exact match in title is highest value
            if keyword_lower in title_lower:
                score += 5
            # Partial matches for multi-word keywords
            else:
                for term in keyword_terms:
                    if term in title_lower:
                        score += 2
        
        # Check content (medium weight)
        if 'content' in df.columns and row['content'] and not pd.isna(row['content']):
            content_lower = str(row['content']).lower()
            if keyword_lower in content_lower:
                score += 3
            else:
                for term in keyword_terms:
                    if term in content_lower:
                        score += 1
        
        # Check excerpt (lower weight) as fallback if content doesn't exist
        elif 'excerpt' in df.columns and row['excerpt'] and not pd.isna(row['excerpt']):
            excerpt_lower = str(row['excerpt']).lower()
            if keyword_lower in excerpt_lower:
                score += 2
            else:
                for term in keyword_terms:
                    if term in excerpt_lower:
                        score += 0.5
        
        # Normalize score to 0-10 range
        return min(score, 10)
    
    # Apply relevance scoring
    df['relevance_score'] = df.apply(calculate_relevance, axis=1)
    
    # Debug: Print a sample of relevance scores
    if len(df) > 0:
        print(f"Relevance score sample: {df['relevance_score'].head().tolist()}", file=sys.stderr)
    
    # Sort by relevance first, then date
    df = df.sort_values(by=['relevance_score', 'seendate'], ascending=[False, False])
    
    # Convert to JSON and output
    print(df.to_json(orient="records"))
    
except Exception as e:
    # Output error as JSON with more detailed information
    import traceback
    error_data = {
        "error": str(e),
        "traceback": traceback.format_exc(),
        "timestamp": datetime.now().isoformat()
    }
    print(json.dumps(error_data), file=sys.stderr)
    sys.exit(1)
