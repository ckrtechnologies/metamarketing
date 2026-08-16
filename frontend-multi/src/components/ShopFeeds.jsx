import { useState, useEffect, useCallback } from 'react';
import { getShopFeeds } from '../api/auth';
import './ShopFeeds.css';

export default function ShopFeeds({ shop, refreshTrigger }) {
  const [activeTab, setActiveTab] = useState('fb');
  const [feeds, setFeeds] = useState({ facebookPosts: [], instagramMedia: [] });
  const [loading, setLoading] = useState(true);
  const [feedError, setFeedError] = useState(null);

  const shopId = shop?.id || shop?.shopId;

  const load = useCallback(() => {
    if (!shopId) return;
    setLoading(true);
    setFeedError(null);

    getShopFeeds(shopId)
      .then(data => {
        setFeeds({
          facebookPosts: data?.facebookPosts || [],
          instagramMedia: data?.instagramMedia || [],
        });
      })
      .catch(err => {
        const errorMsg =
          err.response?.data?.error ||
          err.response?.data?.message ||
          (err.code === 'ERR_NETWORK'
            ? 'Backend server is not responding. Please check if http://localhost:5001 is running.'
            : err.message || 'Failed to fetch shop feeds from Meta.');
        console.error('Error fetching shop feeds:', err);
        setFeedError(errorMsg);
      })
      .finally(() => setLoading(false));
  }, [shopId]);

  useEffect(() => {
    load();
  }, [load, refreshTrigger]);

  return (
    <section className="shop-feeds">
      {/* Tabs */}
      <div className="shop-feed-tabs">
        <button
          type="button"
          className={`shop-feed-tab ${activeTab === 'fb' ? 'shop-feed-tab--active-fb' : ''}`}
          onClick={() => setActiveTab('fb')}
        >
          📘 Facebook Timeline ({feeds.facebookPosts.length})
        </button>

        <button
          type="button"
          className={`shop-feed-tab ${activeTab === 'ig' ? 'shop-feed-tab--active-ig' : ''} ${!shop?.instagram ? 'shop-feed-tab--disabled' : ''}`}
          onClick={() => setActiveTab('ig')}
          disabled={!shop?.instagram}
        >
          📸 Instagram Grid ({feeds.instagramMedia.length})
        </button>

        <button
          type="button"
          className={`shop-feed-refresh ${loading ? 'shop-feed-refresh--spin' : ''}`}
          onClick={load}
          title="Refresh feeds"
          disabled={loading}
        >
          🔄
        </button>
      </div>

      {loading ? (
        <div className="feeds-skeleton">
          <div className="skeleton-loading-text">
            <span className="spinner-dot" /> Loading live feeds from Meta…
          </div>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="feed-skeleton-card" />
          ))}
        </div>
      ) : feedError ? (
        /* Error State with actionable retry */
        <div className="feeds-error-card">
          <div className="feeds-error-icon">⚠️</div>
          <h3 className="feeds-error-title">Unable to Load Feeds</h3>
          <p className="feeds-error-message">{feedError}</p>
          <div className="feeds-error-actions">
            <button type="button" className="feeds-retry-btn" onClick={load}>
              🔄 Try Again
            </button>
          </div>
        </div>
      ) : activeTab === 'fb' ? (
        /* Facebook Timeline */
        <div className="fb-feed-list">
          {feeds.facebookPosts.length === 0 ? (
            <div className="feeds-empty">
              <span>📘</span>
              <p>No Facebook posts published yet for this page.</p>
              <span className="feeds-empty-sub">Use the composer on the left to publish your first post!</span>
            </div>
          ) : (
            feeds.facebookPosts.map(post => (
              <article key={post.id} className="shop-post-card">
                <div className="post-header">
                  <img
                    src={shop?.facebook?.pictureUrl || 'https://via.placeholder.com/40'}
                    alt=""
                    className="post-author-avatar"
                  />
                  <div className="post-header-info">
                    <span className="post-author-name">{shop?.facebook?.pageName}</span>
                    <span className="post-time">
                      {new Date(post.created_time).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  {post.permalink_url && (
                    <a
                      href={post.permalink_url}
                      target="_blank"
                      rel="noreferrer"
                      className="post-view-link"
                    >
                      View on FB ↗
                    </a>
                  )}
                </div>

                {post.message && (
                  <p className="post-message-text">{post.message}</p>
                )}

                {post.full_picture && (
                  <div className="post-media-wrap">
                    <img src={post.full_picture} alt="" className="post-media-img" />
                  </div>
                )}
              </article>
            ))
          )}
        </div>
      ) : (
        /* Instagram Grid */
        <div className="ig-grid-container">
          {feeds.instagramMedia.length === 0 ? (
            <div className="feeds-empty">
              <span>📸</span>
              <p>No Instagram posts or reels found.</p>
            </div>
          ) : (
            <div className="ig-tiles-grid">
              {feeds.instagramMedia.map(item => (
                <a
                  key={item.id}
                  href={item.permalink}
                  target="_blank"
                  rel="noreferrer"
                  className="ig-grid-tile"
                >
                  <img
                    src={item.thumbnail_url || item.media_url}
                    alt={item.caption || ''}
                    className="ig-grid-img"
                  />
                  {item.media_type === 'VIDEO' && (
                    <span className="ig-reel-badge">▶ Reel</span>
                  )}
                  <div className="ig-grid-hover">
                    <span>❤️ {item.like_count || 0}</span>
                    <span>💬 {item.comments_count || 0}</span>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
