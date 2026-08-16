import { useEffect, useState, useCallback } from 'react';
import { fetchRecentPosts, deletePost } from '../api/facebook';
import './RecentPosts.css';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function RecentPosts({ refreshTrigger, pageInfo }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [openCommentsId, setOpenCommentsId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    fetchRecentPosts(15)
      .then(data => setPosts(data.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load, refreshTrigger]);

  async function handleDelete(postId) {
    if (!window.confirm('Are you sure you want to delete this post from your Facebook Page?')) return;
    setDeletingId(postId);
    try {
      await deletePost(postId);
      setPosts(prev => prev.filter(p => p.id !== postId));
    } catch (err) {
      alert('Failed to delete post.');
    } finally {
      setDeletingId(null);
    }
  }

  function toggleComments(postId) {
    setOpenCommentsId(prev => (prev === postId ? null : postId));
  }

  return (
    <section className="recent-posts">
      <div className="recent-posts__header">
        <div className="recent-posts__header-left">
          <h2 className="recent-posts__title">Published Feed</h2>
          <span className="recent-posts__count">{posts.length} posts</span>
        </div>
        <button
          className={`recent-posts__refresh ${loading ? 'recent-posts__refresh--spin' : ''}`}
          onClick={load}
          title="Refresh Feed"
          type="button"
        >
          🔄 Refresh
        </button>
      </div>

      {loading && (
        <div className="posts-list">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="post-card post-card--skeleton">
              <div className="skeleton-post-head">
                <div className="skeleton skeleton-avatar-sm" />
                <div className="skeleton-post-meta">
                  <div className="skeleton skeleton-line-sm" />
                  <div className="skeleton skeleton-line-xs" />
                </div>
              </div>
              <div className="skeleton skeleton-post-banner" />
            </div>
          ))}
        </div>
      )}

      {!loading && posts.length === 0 && (
        <div className="recent-posts__empty">
          <span className="empty-icon">📭</span>
          <p className="empty-title">No published posts yet</p>
          <span className="empty-sub">Compose and publish your first post on the left!</span>
        </div>
      )}

      {!loading && posts.length > 0 && (
        <div className="posts-list">
          {posts.map(post => {
            const hasText = Boolean(post.message);
            const hasMedia = Boolean(post.full_picture);
            const hasStory = Boolean(post.story);
            const isCommentsOpen = openCommentsId === post.id;

            return (
              <article key={post.id} className="post-card">
                {/* Author Header */}
                <div className="post-card__header">
                  {pageInfo?.picture?.data?.url ? (
                    <img
                      src={pageInfo.picture.data.url}
                      alt={pageInfo.name}
                      className="post-card__author-avatar"
                    />
                  ) : (
                    <div className="post-card__author-avatar post-card__author-avatar--placeholder">
                      🏢
                    </div>
                  )}
                  <div className="post-card__author-info">
                    <div className="post-card__author-name-row">
                      <span className="post-card__author-name">
                        {pageInfo?.name || 'CKR Technologies'}
                      </span>
                      <span className="post-card__author-badge">✓</span>
                    </div>
                    <span className="post-card__date">
                      {formatDate(post.created_time)} · 🌐 Public
                    </span>
                  </div>

                  <a
                    href={post.permalink_url}
                    target="_blank"
                    rel="noreferrer"
                    className="post-card__fb-link"
                    title="View live post on Facebook"
                  >
                    View on FB ↗
                  </a>
                </div>

                {/* Message Body */}
                {hasText && (
                  <div className="post-card__body">
                    <p className="post-card__text">{post.message}</p>
                  </div>
                )}

                {/* Story / Fallback for media without message */}
                {!hasText && hasStory && (
                  <div className="post-card__body">
                    <p className="post-card__story">{post.story}</p>
                  </div>
                )}

                {!hasText && !hasStory && (
                  <div className="post-card__body">
                    <span className="post-card__media-badge">
                      {hasMedia ? '📸 Media update' : '📝 Status update'}
                    </span>
                  </div>
                )}

                {/* Post Media Banner */}
                {hasMedia && (
                  <div className="post-card__media-wrap">
                    <img
                      src={post.full_picture}
                      alt="Post visual"
                      className="post-card__media"
                      loading="lazy"
                    />
                  </div>
                )}

                {/* Social Interaction Bar */}
                <div className="post-card__social-bar">
                  <button
                    type="button"
                    className="social-bar-btn"
                    onClick={() => window.open(post.permalink_url, '_blank')}
                    title="Like on Facebook"
                  >
                    👍 <span>Like</span>
                  </button>

                  <button
                    type="button"
                    className={`social-bar-btn ${isCommentsOpen ? 'social-bar-btn--active' : ''}`}
                    onClick={() => toggleComments(post.id)}
                    title="Comments"
                  >
                    💬 <span>Comments</span>
                  </button>

                  <button
                    type="button"
                    className="social-bar-btn"
                    onClick={() => window.open(post.permalink_url, '_blank')}
                    title="Share post"
                  >
                    🔄 <span>Share</span>
                  </button>

                  <button
                    type="button"
                    className="social-bar-btn social-bar-btn--delete"
                    onClick={() => handleDelete(post.id)}
                    disabled={deletingId === post.id}
                    title="Delete this post"
                  >
                    🗑️ <span>{deletingId === post.id ? 'Deleting…' : 'Delete'}</span>
                  </button>
                </div>

                {/* Comments Section Drawer */}
                {isCommentsOpen && (
                  <div className="post-card__comments-section">
                    <div className="comments-header">
                      <span className="comments-title">Comments & Engagement</span>
                      <a
                        href={post.permalink_url}
                        target="_blank"
                        rel="noreferrer"
                        className="comments-fb-link"
                      >
                        Open on Facebook ↗
                      </a>
                    </div>

                    <div className="comments-quick-reply">
                      {pageInfo?.picture?.data?.url && (
                        <img
                          src={pageInfo.picture.data.url}
                          alt=""
                          className="comment-avatar"
                        />
                      )}
                      <div className="comment-input-box">
                        <input
                          type="text"
                          placeholder="Comment as CKR Technologies on Facebook..."
                          className="comment-input"
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              window.open(post.permalink_url, '_blank');
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="comment-send-btn"
                          onClick={() => window.open(post.permalink_url, '_blank')}
                        >
                          Send ↗
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
