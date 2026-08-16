import { useState, useRef } from 'react';
import { publishTextPost, publishLinkPost, publishPhotoPost, publishVideoPost } from '../api/facebook';
import './PostComposer.css';

const MAX_CHARS = 63206;

const POST_TYPES = [
  { id: 'text', label: '✏️ Text' },
  { id: 'link', label: '🔗 Link' },
  { id: 'photo', label: '📷 Photo' },
  { id: 'reel', label: '🎬 Reel / Video' },
];

const QUICK_HASHTAGS = [
  '#appdevelopment',
  '#digitalmarketing',
  '#AI',
  '#businessgrowth',
  '#tech',
  '#automation',
  '#customsoftware',
];

const QUICK_EMOJIS = ['🚀', '💡', '📱', '🔥', '✨', '⚙️', '📈', '🎯'];

export default function PostComposer({ onPosted, pageInfo, igAccount }) {
  const [postType, setPostType] = useState('text');
  const [targetFb, setTargetFb] = useState(true);
  const [targetIg, setTargetIg] = useState(true);
  const [message, setMessage] = useState('');
  const [link, setLink] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const [videoPreview, setVideoPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [toast, setToast] = useState(null);
  const fileRef = useRef(null);
  const videoFileRef = useRef(null);

  const remaining = MAX_CHARS - message.length;
  const isOverLimit = remaining < 0;

  function showToast(type, text) {
    setToast({ type, text });
    setTimeout(() => setToast(null), 5000);
  }

  function handleImageChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function resetImageFile() {
    setImageFile(null);
    setImagePreview(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  function handleVideoChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setVideoFile(file);
    setVideoPreview(URL.createObjectURL(file));
  }

  function resetVideoFile() {
    setVideoFile(null);
    setVideoPreview(null);
    if (videoFileRef.current) videoFileRef.current.value = '';
  }

  function addHashtag(tag) {
    setMessage(prev => (prev ? `${prev} ${tag}` : tag));
  }

  function addEmoji(emoji) {
    setMessage(prev => `${prev}${emoji}`);
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!targetFb && !targetIg) {
      showToast('error', 'Please select at least one platform (Facebook or Instagram).');
      return;
    }

    if (!message.trim() && postType !== 'link' && postType !== 'reel') {
      showToast('error', 'Please enter a post message.');
      return;
    }

    if (postType === 'link' && !link.trim()) {
      showToast('error', 'Please enter a valid URL.');
      return;
    }

    if (postType === 'photo' && !imageFile) {
      showToast('error', 'Please select an image to upload.');
      return;
    }

    if (postType === 'reel' && !videoFile) {
      showToast('error', 'Please select a video/reel file to upload.');
      return;
    }

    if (isOverLimit) {
      showToast('error', 'Message exceeds character limit.');
      return;
    }

    setLoading(true);
    try {
      if (postType === 'photo') {
        const res = await publishPhotoPost(message, imageFile, {
          postToFb: targetFb,
          postToIg: targetIg,
        });

        if (targetIg && res?.data?.igError) {
          showToast('error', `⚠️ Facebook published, but Instagram error: ${res.data.igError}`);
          setMessage('');
          resetImageFile();
          onPosted?.();
          return;
        }
      } else if (postType === 'reel') {
        const res = await publishVideoPost(message, videoFile, {
          postToFb: targetFb,
          postToIg: targetIg,
        });

        if (targetIg && res?.data?.igError) {
          showToast('error', `⚠️ Facebook published, but Instagram Reel error: ${res.data.igError}`);
          setMessage('');
          resetVideoFile();
          onPosted?.();
          return;
        }
      } else if (postType === 'link') {
        if (targetFb) await publishLinkPost(message, link);
      } else {
        if (targetFb) await publishTextPost(message);
      }

      const platforms = [];
      if (targetFb) platforms.push('Facebook');
      if (targetIg) platforms.push('Instagram');

      showToast('success', `🎉 ${postType === 'reel' ? 'Reel' : 'Post'} published live to ${platforms.join(' & ')}!`);
      setMessage('');
      setLink('');
      resetImageFile();
      resetVideoFile();
      onPosted?.();
    } catch (err) {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.error ||
        'Failed to publish post.';
      showToast('error', `❌ ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="composer-card">
      <div className="composer-header">
        <h2 className="composer-title">Create Post & Reel</h2>
        <button
          type="button"
          className={`composer-preview-toggle ${showPreview ? 'composer-preview-toggle--active' : ''}`}
          onClick={() => setShowPreview(p => !p)}
        >
          {showPreview ? '✏️ Edit Mode' : '👁️ Live Preview'}
        </button>
      </div>

      {/* Target Platforms Selector */}
      <div className="composer-platforms">
        <label className={`platform-toggle ${targetFb ? 'platform-toggle--active-fb' : ''}`}>
          <input
            type="checkbox"
            checked={targetFb}
            onChange={e => setTargetFb(e.target.checked)}
          />
          <span className="platform-toggle__icon">📘</span>
          <span className="platform-toggle__label">Facebook (CKR Technologies)</span>
        </label>

        <label className={`platform-toggle ${targetIg ? 'platform-toggle--active-ig' : ''}`}>
          <input
            type="checkbox"
            checked={targetIg}
            onChange={e => setTargetIg(e.target.checked)}
          />
          <span className="platform-toggle__icon">📸</span>
          <span className="platform-toggle__label">Instagram (@{igAccount?.username || 'argosmob_tech'})</span>
        </label>
      </div>

      {/* Post type tabs */}
      <div className="composer-tabs" role="tablist">
        {POST_TYPES.map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={postType === t.id}
            className={`composer-tab ${postType === t.id ? 'composer-tab--active' : ''}`}
            onClick={() => setPostType(t.id)}
            type="button"
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Live Preview Mode */}
      {showPreview ? (
        <div className="fb-live-preview">
          <div className="fb-preview-header">
            {pageInfo?.picture?.data?.url && (
              <img
                src={pageInfo.picture.data.url}
                alt=""
                className="fb-preview-avatar"
              />
            )}
            <div className="fb-preview-meta">
              <span className="fb-preview-name">
                {pageInfo?.name || 'CKR Technologies'} {targetIg && <span className="preview-ig-tag">· @{igAccount?.username || 'argosmob_tech'}</span>}
              </span>
              <span className="fb-preview-sub">Just now · 🌐</span>
            </div>
          </div>

          <div className="fb-preview-text">
            {message || <em className="preview-placeholder">Your caption will appear here...</em>}
          </div>

          {postType === 'link' && link && (
            <div className="fb-preview-link-box">
              <span className="fb-preview-link-icon">🔗</span>
              <div className="fb-preview-link-content">
                <span className="fb-preview-link-host">{new URL(link.startsWith('http') ? link : `https://${link}`).hostname || link}</span>
                <span className="fb-preview-link-url">{link}</span>
              </div>
            </div>
          )}

          {postType === 'photo' && imagePreview && (
            <div className="fb-preview-media">
              <img src={imagePreview} alt="Preview" />
            </div>
          )}

          {postType === 'reel' && videoPreview && (
            <div className="fb-preview-media">
              <video src={videoPreview} controls className="composer-video-preview" />
            </div>
          )}
        </div>
      ) : (
        <form className="composer-form" onSubmit={handleSubmit}>
          {/* Quick Tools */}
          <div className="composer-quickbar">
            <div className="quick-emojis">
              {QUICK_EMOJIS.map(em => (
                <button
                  key={em}
                  type="button"
                  className="quick-emoji-btn"
                  onClick={() => addEmoji(em)}
                  title={`Add ${em}`}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>

          {/* Message textarea */}
          <div className="composer-field">
            <textarea
              id="composer-message"
              className={`composer-textarea ${isOverLimit ? 'composer-textarea--error' : ''}`}
              placeholder={
                postType === 'text'
                  ? "What's on your mind? Share an update with your followers..."
                  : postType === 'link'
                  ? 'Add a caption for your shared link...'
                  : postType === 'photo'
                  ? 'Add a caption for your photo...'
                  : 'Add a caption / hashtags for your Reel (#Reels, #Tech, etc)...'
              }
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={5}
            />
            <div className="composer-footer-bar">
              {/* Quick Hashtags */}
              <div className="quick-tags">
                {QUICK_HASHTAGS.map(tag => (
                  <button
                    key={tag}
                    type="button"
                    className="tag-chip"
                    onClick={() => addHashtag(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>

              <span
                className={`composer-counter ${
                  isOverLimit
                    ? 'composer-counter--error'
                    : remaining < 200
                    ? 'composer-counter--warn'
                    : ''
                }`}
              >
                {remaining.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Link input */}
          {postType === 'link' && (
            <div className="composer-field">
              <label className="field-label" htmlFor="composer-link">Destination URL</label>
              <input
                id="composer-link"
                type="url"
                className="composer-input"
                placeholder="https://yourwebsite.com/article"
                value={link}
                onChange={e => setLink(e.target.value)}
              />
            </div>
          )}

          {/* Image upload */}
          {postType === 'photo' && (
            <div className="composer-image-area">
              {imagePreview ? (
                <div className="composer-preview-wrap">
                  <img src={imagePreview} alt="Preview" className="composer-preview" />
                  <button
                    type="button"
                    className="composer-remove-img"
                    onClick={resetImageFile}
                    title="Remove image"
                  >
                    ✕ Remove
                  </button>
                </div>
              ) : (
                <label className="composer-upload-label" htmlFor="composer-image-input">
                  <span className="upload-icon">📸</span>
                  <span className="upload-main">Click to select photo</span>
                  <span className="composer-upload-hint">JPG, PNG, GIF, WEBP · up to 10 MB</span>
                  <input
                    id="composer-image-input"
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    ref={fileRef}
                    onChange={handleImageChange}
                    hidden
                  />
                </label>
              )}
            </div>
          )}

          {/* Video / Reel upload */}
          {postType === 'reel' && (
            <div className="composer-image-area">
              {videoPreview ? (
                <div className="composer-preview-wrap">
                  <video src={videoPreview} controls className="composer-video-preview" />
                  <button
                    type="button"
                    className="composer-remove-img"
                    onClick={resetVideoFile}
                    title="Remove video"
                  >
                    ✕ Remove Video
                  </button>
                </div>
              ) : (
                <label className="composer-upload-label" htmlFor="composer-video-input">
                  <span className="upload-icon">🎬</span>
                  <span className="upload-main">Click to select Reel / Video</span>
                  <span className="composer-upload-hint">MP4, MOV, WEBM · up to 250 MB</span>
                  <input
                    id="composer-video-input"
                    type="file"
                    accept="video/mp4,video/quicktime,video/webm"
                    ref={videoFileRef}
                    onChange={handleVideoChange}
                    hidden
                  />
                </label>
              )}
            </div>
          )}

          <button
            id="composer-submit-btn"
            type="submit"
            className="composer-btn"
            disabled={loading || isOverLimit}
          >
            {loading ? <span className="spinner" /> : null}
            {loading
              ? postType === 'reel'
                ? 'Processing & Publishing Reel (takes ~15-20s)…'
                : 'Publishing…'
              : postType === 'reel'
              ? targetFb && targetIg
                ? '🎬 Publish Reel to FB & Instagram'
                : targetIg
                ? '🎬 Publish Reel to Instagram'
                : '🎬 Publish Reel to Facebook'
              : targetFb && targetIg
              ? '🚀 Publish to Facebook & Instagram'
              : targetIg
              ? '🚀 Publish to Instagram'
              : '🚀 Publish to Facebook'}
          </button>
        </form>
      )}

      {/* Toast notification */}
      {toast && (
        <div className={`composer-toast composer-toast--${toast.type}`} role="alert">
          {toast.text}
        </div>
      )}
    </section>
  );
}
