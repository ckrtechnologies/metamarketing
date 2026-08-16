import { useEffect, useState, useCallback } from 'react';
import { fetchInstagramMedia } from '../api/instagram';
import './InstagramFeed.css';

export default function InstagramFeed({ refreshTrigger, igAccount }) {
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetchInstagramMedia(12)
      .then(data => setMedia(data.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load, refreshTrigger]);

  return (
    <section className="ig-feed">
      <div className="ig-feed__header">
        <div className="ig-feed__header-left">
          <span className="ig-badge-icon">📸</span>
          <div>
            <h2 className="ig-feed__title">@{igAccount?.username || 'argosmob_tech'}</h2>
            <span className="ig-feed__sub">{igAccount?.followers_count ?? '476'} followers · {media.length} recent posts</span>
          </div>
        </div>
        <button
          className={`ig-feed__refresh ${loading ? 'ig-feed__refresh--spin' : ''}`}
          onClick={load}
          type="button"
          title="Refresh Instagram Grid"
        >
          🔄 Refresh
        </button>
      </div>

      {loading && (
        <div className="ig-grid ig-grid--skeleton">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="ig-skeleton-tile" />
          ))}
        </div>
      )}

      {!loading && media.length === 0 && (
        <div className="ig-feed__empty">
          <span>📷</span>
          <p>No Instagram posts found yet.</p>
        </div>
      )}

      {!loading && media.length > 0 && (
        <div className="ig-grid">
          {media.map(item => {
            const isVideo = item.media_type === 'VIDEO';
            const imgUrl = item.thumbnail_url || item.media_url;

            return (
              <a
                key={item.id}
                href={item.permalink}
                target="_blank"
                rel="noreferrer"
                className="ig-tile"
                title={item.caption || 'Instagram Post'}
              >
                {imgUrl ? (
                  <img
                    src={imgUrl}
                    alt={item.caption || ''}
                    className="ig-tile__img"
                    loading="lazy"
                  />
                ) : (
                  <div className="ig-tile__placeholder">
                    {isVideo ? '🎬 Reel' : '📸 Photo'}
                  </div>
                )}

                {isVideo && <span className="ig-tile__type-badge">▶ Reel</span>}

                {/* Hover overlay with likes and comments */}
                <div className="ig-tile__overlay">
                  <div className="ig-tile__stats">
                    <span>❤️ {item.like_count || 0}</span>
                    <span>💬 {item.comments_count || 0}</span>
                  </div>
                  {item.caption && (
                    <p className="ig-tile__caption">{item.caption}</p>
                  )}
                </div>
              </a>
            );
          })}
        </div>
      )}
    </section>
  );
}
