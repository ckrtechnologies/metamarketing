import { useState, useEffect } from 'react';
import PageHeader from './components/PageHeader';
import PostComposer from './components/PostComposer';
import RecentPosts from './components/RecentPosts';
import InstagramFeed from './components/InstagramFeed';
import { fetchPageInfo } from './api/facebook';
import { fetchInstagramAccount } from './api/instagram';
import './App.css';

export default function App() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [pageInfo, setPageInfo] = useState(null);
  const [igAccount, setIgAccount] = useState(null);
  const [activeFeed, setActiveFeed] = useState('fb'); // 'fb' | 'ig'

  useEffect(() => {
    fetchPageInfo().then(setPageInfo).catch(console.error);
    fetchInstagramAccount().then(setIgAccount).catch(console.error);
  }, [refreshTrigger]);

  function handlePosted() {
    setRefreshTrigger(n => n + 1);
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar__logo">
          <span className="sidebar__logo-icon">📣</span>
          <div className="sidebar__logo-text">
            <span>Matter</span>
            <strong>Marketing</strong>
          </div>
        </div>

        <nav className="sidebar__nav">
          <a className="sidebar__nav-item sidebar__nav-item--active" href="#composer">✏️ Composer</a>
          <button
            type="button"
            className={`sidebar__nav-btn ${activeFeed === 'fb' ? 'sidebar__nav-btn--active' : ''}`}
            onClick={() => setActiveFeed('fb')}
          >
            📘 Facebook Feed
          </button>
          <button
            type="button"
            className={`sidebar__nav-btn ${activeFeed === 'ig' ? 'sidebar__nav-btn--active-ig' : ''}`}
            onClick={() => setActiveFeed('ig')}
          >
            📸 Instagram Grid
          </button>
        </nav>

        <div className="sidebar__stats">
          <div className="stat-badge">
            <span className="stat-label">FB Status</span>
            <span className="stat-val stat-val--active">● Live</span>
          </div>
          <div className="stat-badge">
            <span className="stat-label">IG Status</span>
            <span className="stat-val stat-val--active-ig">● Connected</span>
          </div>
        </div>

        <div className="sidebar__footer">v2.0.0 · Dual Platform</div>
      </aside>

      <main className="main">
        <PageHeader pageInfo={pageInfo} igAccount={igAccount} />

        <div className="content-grid">
          <div id="composer">
            <PostComposer
              onPosted={handlePosted}
              pageInfo={pageInfo}
              igAccount={igAccount}
            />
          </div>

          <div id="feed" className="feed-container">
            {/* Feed Tabs Switcher */}
            <div className="feed-tabs">
              <button
                type="button"
                className={`feed-tab ${activeFeed === 'fb' ? 'feed-tab--active-fb' : ''}`}
                onClick={() => setActiveFeed('fb')}
              >
                📘 Facebook Feed ({pageInfo?.fan_count ?? 1096} fans)
              </button>
              <button
                type="button"
                className={`feed-tab ${activeFeed === 'ig' ? 'feed-tab--active-ig' : ''}`}
                onClick={() => setActiveFeed('ig')}
              >
                📸 Instagram Grid (@{igAccount?.username || 'argosmob_tech'})
              </button>
            </div>

            {activeFeed === 'fb' ? (
              <RecentPosts refreshTrigger={refreshTrigger} pageInfo={pageInfo} />
            ) : (
              <InstagramFeed refreshTrigger={refreshTrigger} igAccount={igAccount} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
