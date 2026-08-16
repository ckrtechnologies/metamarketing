import { useState, useEffect, useCallback } from 'react';
import { getShopFeeds, deleteFacebookPost, deleteInstagramMedia } from '../api/auth';
import './ShopFeeds.css';

export default function ShopFeeds({ shop, refreshTrigger }) {
  const [activeTab, setActiveTab] = useState('fb');
  const [feeds, setFeeds] = useState({ facebookPosts: [], instagramMedia: [] });
  const [loading, setLoading] = useState(true);
  const [feedError, setFeedError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [openCommentsId, setOpenCommentsId] = useState(null);

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

  // ── Delete Facebook Post ────────────────────────────────────
  async function handleDeletePost(postId) {
    if (!window.confirm(`Are you sure you want to permanently delete this post from ${shop?.shopName}'s Facebook Page?`)) {
      return;
    }

    setDeletingId(postId);
    try {
      await deleteFacebookPost(postId);
      setFeeds(prev => ({
        ...prev,
        facebookPosts: prev.facebookPosts.filter(p => p.id !== postId),
      }));
    } catch (err) {
      console.error('Delete post error:', err);
      alert('Failed to delete post: ' + (err.response?.data?.error || err.message));
    } finally {
      setDeletingId(null);
    }
  }

  // ── Delete / Manage Instagram Media ─────────────────────────
  async function handleDeleteInstagram(e, item) {
    e.preventDefault();
    e.stopPropagation();

    if (!window.confirm(`Are you sure you want to remove/delete this Instagram media?`)) {
      return;
    }

    setDeletingId(item.id);
    try {
      await deleteInstagramMedia(item.id);
      setFeeds(prev => ({
        ...prev,
        instagramMedia: prev.instagramMedia.filter(m => m.id !== item.id),
      }));
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message;
      console.warn('Instagram delete response:', errMsg);

      // Meta restriction policy handler
      const openInsta = window.confirm(
        `📌 Meta Note: ${errMsg}\n\nWould you like to open this post directly on Instagram to delete it?`
      );

      if (openInsta && item.permalink) {
        window.open(item.permalink, '_blank');
      }

      // Optimistically hide from local dashboard view
      setFeeds(prev => ({
        ...prev,
        instagramMedia: prev.instagramMedia.filter(m => m.id !== item.id),
      }));
    } finally {
      setDeletingId(null);
    }
  }

  function toggleComments(postId) {
    setOpenCommentsId(prev => (prev === postId ? null : postId));
  }

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
            feeds.facebookPosts.map(post => {
              const isCommentsOpen = openCommentsId === post.id;
              const isDeleting = deletingId === post.id;

              return (
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
                        })} · 🌐 Public
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

                  {post.story && !post.message && (
                    <p className="post-story-text">{post.story}</p>
                  )}

                  {post.full_picture && (
                    <div className="post-media-wrap">
                      <img src={post.full_picture} alt="" className="post-media-img" loading="lazy" />
                    </div>
                  )}

                  {/* Social Action & Management Bar */}
                  <div className="post-action-bar">
                    <button
                      type="button"
                      className="action-bar-btn"
                      onClick={() => window.open(post.permalink_url, '_blank')}
                      title="Like on Facebook"
                    >
                      👍 <span>Like</span>
                    </button>

                    <button
                      type="button"
                      className={`action-bar-btn ${isCommentsOpen ? 'action-bar-btn--active' : ''}`}
                      onClick={() => toggleComments(post.id)}
                      title="Comments"
                    >
                      💬 <span>Comments</span>
                    </button>

                    <button
                      type="button"
                      className="action-bar-btn"
                      onClick={() => window.open(post.permalink_url, '_blank')}
                      title="Share post"
                    >
                      🔄 <span>Share</span>
                    </button>

                    <button
                      type="button"
                      className="action-bar-btn action-bar-btn--delete"
                      onClick={() => handleDeletePost(post.id)}
                      disabled={isDeleting}
                      title="Delete this post from Facebook"
                    >
                      🗑️ <span>{isDeleting ? 'Deleting…' : 'Delete'}</span>
                    </button>
                  </div>

                  {/* Comments Drawer */}
                  {isCommentsOpen && (
                    <div className="post-comments-drawer">
                      <div className="comments-drawer-header">
                        <span className="comments-drawer-title">Comments & Engagement</span>
                        <a
                          href={post.permalink_url}
                          target="_blank"
                          rel="noreferrer"
                          className="comments-external-link"
                        >
                          Open on Facebook ↗
                        </a>
                      </div>

                      <div className="comments-drawer-input-row">
                        <img
                          src={shop?.facebook?.pictureUrl || 'https://via.placeholder.com/32'}
                          alt=""
                          className="comment-user-avatar"
                        />
                        <input
                          type="text"
                          placeholder={`Comment as ${shop?.facebook?.pageName || 'Shop'}...`}
                          className="comment-inline-input"
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              window.open(post.permalink_url, '_blank');
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="comment-inline-send"
                          onClick={() => window.open(post.permalink_url, '_blank')}
                        >
                          Send ↗
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })
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
              {feeds.instagramMedia.map(item => {
                const isDeleting = deletingId === item.id;

                return (
                  <div key={item.id} className="ig-grid-tile">
                    <img
                      src={item.thumbnail_url || item.media_url}
                      alt={item.caption || ''}
                      className="ig-grid-img"
                      loading="lazy"
                    />
                    {item.media_type === 'VIDEO' && (
                      <span className="ig-reel-badge">▶ Reel</span>
                    )}

                    {/* Interactive Hover Overlay */}
                    <div className="ig-grid-hover">
                      <div className="ig-hover-stats">
                        <span>❤️ {item.like_count || 0}</span>
                        <span>💬 {item.comments_count || 0}</span>
                      </div>

                      <div className="ig-hover-actions">
                        <a
                          href={item.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="ig-hover-btn ig-hover-btn--view"
                          title="Open on Instagram"
                        >
                          View ↗
                        </a>

                        <button
                          type="button"
                          className="ig-hover-btn ig-hover-btn--delete"
                          onClick={(e) => handleDeleteInstagram(e, item)}
                          disabled={isDeleting}
                          title="Delete / Manage post"
                        >
                          🗑️ {isDeleting ? '…' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
