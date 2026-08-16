import './PageHeader.css';

export default function PageHeader({ pageInfo, igAccount }) {
  return (
    <header className="page-header">
      {/* Facebook Profile Card */}
      <div className="platform-profile">
        <div className="platform-profile__avatar-wrap">
          {pageInfo?.picture?.data?.url ? (
            <img
              src={pageInfo.picture.data.url}
              alt={pageInfo.name}
              className="platform-profile__avatar"
            />
          ) : (
            <div className="platform-profile__avatar platform-profile__avatar--loading" />
          )}
          <span className="platform-badge platform-badge--fb">
            <svg viewBox="0 0 24 24" fill="#1877F2" width="14" height="14">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
          </span>
        </div>
        <div className="platform-profile__info">
          <div className="platform-profile__name-row">
            <h1 className="platform-profile__name">{pageInfo?.name || 'CKR Technologies'}</h1>
            <span className="platform-tag platform-tag--fb">Facebook</span>
          </div>
          <p className="platform-profile__followers">
            <strong>{pageInfo?.fan_count?.toLocaleString() ?? '1,096'}</strong> followers
          </p>
        </div>
      </div>

      <div className="header-divider" />

      {/* Instagram Profile Card */}
      <div className="platform-profile">
        <div className="platform-profile__avatar-wrap">
          {igAccount?.profile_picture_url ? (
            <img
              src={igAccount.profile_picture_url}
              alt={igAccount.username}
              className="platform-profile__avatar platform-profile__avatar--ig"
            />
          ) : (
            <div className="platform-profile__avatar platform-profile__avatar--ig">
              📸
            </div>
          )}
          <span className="platform-badge platform-badge--ig">
            <span className="ig-dot" />
          </span>
        </div>
        <div className="platform-profile__info">
          <div className="platform-profile__name-row">
            <h2 className="platform-profile__name">@{igAccount?.username || 'argosmob_tech'}</h2>
            <span className="platform-tag platform-tag--ig">Instagram</span>
          </div>
          <p className="platform-profile__followers">
            <strong>{igAccount?.followers_count?.toLocaleString() ?? '476'}</strong> followers · {igAccount?.media_count ?? '5'} media
          </p>
        </div>
      </div>

      <div className="page-header__status">
        <span className="status-dot" /> Both Live & Connected
      </div>
    </header>
  );
}
