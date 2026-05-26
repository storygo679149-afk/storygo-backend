-- ============================================
-- PERFORMANCE INDEXES FOR POCKET FM
-- ============================================

-- Users indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_is_creator ON users(is_creator) WHERE is_creator = true;
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);

-- Categories indexes
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_display_order ON categories(display_order);

-- Series indexes
CREATE INDEX IF NOT EXISTS idx_series_category ON series(category_id);
CREATE INDEX IF NOT EXISTS idx_series_creator ON series(creator_id);
CREATE INDEX IF NOT EXISTS idx_series_language ON series(language);
CREATE INDEX IF NOT EXISTS idx_series_status ON series(status);
CREATE INDEX IF NOT EXISTS idx_series_play_count ON series(play_count DESC);
CREATE INDEX IF NOT EXISTS idx_series_created_at ON series(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_series_average_rating ON series(average_rating DESC);
CREATE INDEX IF NOT EXISTS idx_series_tags ON series USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_series_metadata ON series USING gin(metadata);

-- Full-text search index for series
CREATE INDEX IF NOT EXISTS idx_series_search ON series 
USING gin(to_tsvector('english', 
    COALESCE(title, '') || ' ' || 
    COALESCE(description, '') || ' ' || 
    COALESCE(author_name, '') || ' ' || 
    COALESCE(narrator_name, '')
));

-- Episodes indexes
CREATE INDEX IF NOT EXISTS idx_episodes_series ON episodes(series_id);
CREATE INDEX IF NOT EXISTS idx_episodes_series_number ON episodes(series_id, episode_number);
CREATE INDEX IF NOT EXISTS idx_episodes_publish_date ON episodes(publish_date DESC);
CREATE INDEX IF NOT EXISTS idx_episodes_play_count ON episodes(play_count DESC);
CREATE INDEX IF NOT EXISTS idx_episodes_duration ON episodes(duration_seconds);

-- User activity indexes
CREATE INDEX IF NOT EXISTS idx_user_activity_user ON user_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_series ON user_activity(series_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_episode ON user_activity(episode_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_type ON user_activity(activity_type);
CREATE INDEX IF NOT EXISTS idx_user_activity_created ON user_activity(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_activity_composite ON user_activity(user_id, activity_type, created_at DESC);

-- Listening progress indexes
CREATE INDEX IF NOT EXISTS idx_listening_progress_user ON listening_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_listening_progress_episode ON listening_progress(episode_id);
CREATE INDEX IF NOT EXISTS idx_listening_progress_composite ON listening_progress(user_id, is_completed);
CREATE INDEX IF NOT EXISTS idx_listening_progress_updated ON listening_progress(updated_at DESC);

-- Bookmarks indexes
CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_series ON bookmarks(series_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_active ON bookmarks(user_id, is_active) WHERE is_active = true;

-- User following indexes
CREATE INDEX IF NOT EXISTS idx_following_follower ON user_following(follower_id);
CREATE INDEX IF NOT EXISTS idx_following_following ON user_following(following_id);

-- Ratings indexes
CREATE INDEX IF NOT EXISTS idx_ratings_series ON ratings(series_id);
CREATE INDEX IF NOT EXISTS idx_ratings_user ON ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_ratings_rating ON ratings(rating DESC);

-- Search history indexes
CREATE INDEX IF NOT EXISTS idx_search_history_user ON search_history(user_id);
CREATE INDEX IF NOT EXISTS idx_search_history_created ON search_history(created_at DESC);

-- Trending log indexes
CREATE INDEX IF NOT EXISTS idx_trending_log_time ON trending_log(time_window DESC);
CREATE INDEX IF NOT EXISTS idx_trending_log_series ON trending_log(series_id);
CREATE INDEX IF NOT EXISTS idx_trending_log_composite ON trending_log(series_id, time_window DESC, weight DESC);
-- Create regular index instead of partial index
CREATE INDEX IF NOT EXISTS idx_trending_log_active ON trending_log(time_window);

-- Trigram indexes for fuzzy search
CREATE INDEX IF NOT EXISTS idx_series_title_trgm ON series USING gin(title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_episodes_title_trgm ON episodes USING gin(title gin_trgm_ops);