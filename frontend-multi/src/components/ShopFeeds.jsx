import { useState, useEffect, useCallback } from 'react';
import { getShopFeeds } from '../api/auth';
import './ShopFeeds.css';

export default function ShopFeeds({ shop, refreshTrigger }) {
  const [activeTab, setActiveTab] = useState('fb');
  const [feeds, setFeeds] = useState({ facebookPosts: [], instagramMedia: [] });
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!shop?.id) return;
    setLoading(true);
    getShopFeeds(shop.id)
      .then(setFeeds)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [shop?.id]);

  useEffect(load, [load, refreshTrigger]);

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
        >
          🔄
        </button>
      </div>

      {loading ? (
        <div className="feeds-skeleton">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="feed-skeleton-card" />
          ))}
        </div>
      ) : activeTab === 'fb' ? (
        /* Facebook Timeline */
        <div className="fb-feed-list">
          {feeds.facebookPosts.length === 0 ? (
            <div className="feeds-empty">
              <span>📘</span>
              <p>No Facebook posts published yet.</p>
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
