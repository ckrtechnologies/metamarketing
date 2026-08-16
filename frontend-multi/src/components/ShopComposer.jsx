import { useState, useRef } from 'react';
import { publishTextPost, publishLinkPost, publishPhotoPost, publishReelPost } from '../api/auth';
import './ShopComposer.css';

const MAX_CHARS = 63206;

const POST_TYPES = [
  { id: 'text', label: '✏️ Text Post' },
  { id: 'link', label: '🔗 Product Link' },
  { id: 'photo', label: '📷 Product Photo' },
  { id: 'reel', label: '🎬 Video / Reel' },
];

const SHOP_HASHTAGS = [
  '#ShopLocal',
  '#SpecialOffer',
  '#NewArrivals',
  '#Deals',
  '#Retail',
  '#BestPrice',
  '#Trending',
];

const SHOP_EMOJIS = ['🛍️', '🔥', '✨', '🏷️', '📦', '💯', '🚀', '👇'];

export default function ShopComposer({ shop, onPosted }) {
  const [postType, setPostType] = useState('text');
  const [targetFb, setTargetFb] = useState(true);
  const [targetIg, setTargetIg] = useState(Boolean(shop?.instagram));
  const [message, setMessage] = useState('');
  const [link, setLink] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const [videoPreview, setVideoPreview] = useState(null);
  const [loading, setLoading] = useState(false);
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
      showToast('error', 'Please select at least one platform.');
      return;
    }

    if (!message.trim() && postType !== 'link') {
      showToast('error', 'Please enter a caption or message.');
      return;
    }

    if (postType === 'link' && !link.trim()) {
      showToast('error', 'Please enter a valid link.');
      return;
    }

    if (postType === 'photo' && !imageFile) {
      showToast('error', 'Please select an image file.');
      return;
    }

    if (postType === 'reel' && !videoFile) {
      showToast('error', 'Please select a video file.');
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
          showToast('error', `⚠️ Facebook posted, but Instagram error: ${res.data.igError}`);
          setMessage('');
          resetImageFile();
          onPosted?.();
          return;
        }
      } else if (postType === 'reel') {
        const res = await publishReelPost(message, videoFile, {
          postToFb: targetFb,
          postToIg: targetIg,
        });
        if (targetIg && res?.data?.igError) {
          showToast('error', `⚠️ Facebook posted, but Instagram Reel error: ${res.data.igError}`);
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

      showToast('success', `🎉 Published live for ${shop?.shopName} to ${platforms.join(' & ')}!`);
      setMessage('');
      setLink('');
      resetImageFile();
      resetVideoFile();
      onPosted?.();
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.response?.data?.error || err.message || 'Failed to publish';
      showToast('error', `❌ ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="shop-composer">
      <div className="shop-composer__header">
        <h2 className="shop-composer__title">Publish to Shop Channels</h2>
      </div>

      {/* Target Platforms */}
      <div className="composer-platforms">
        <label className={`platform-toggle ${targetFb ? 'platform-toggle--active-fb' : ''}`}>
          <input
            type="checkbox"
            checked={targetFb}
            onChange={e => setTargetFb(e.target.checked)}
          />
          <span className="platform-toggle__icon">📘</span>
          <span className="platform-toggle__label">{shop?.facebook?.pageName || 'Facebook Page'}</span>
        </label>

        <label className={`platform-toggle ${targetIg ? 'platform-toggle--active-ig' : ''} ${!shop?.instagram ? 'platform-toggle--disabled' : ''}`}>
          <input
            type="checkbox"
            checked={targetIg}
            onChange={e => setTargetIg(e.target.checked)}
            disabled={!shop?.instagram}
          />
          <span className="platform-toggle__icon">📸</span>
          <span className="platform-toggle__label">
            {shop?.instagram ? `@${shop.instagram.username}` : 'Instagram (Not Linked)'}
          </span>
        </label>
      </div>

      {/* Post Type Tabs */}
      <div className="composer-tabs">
        {POST_TYPES.map(t => (
          <button
            key={t.id}
            type="button"
            className={`composer-tab ${postType === t.id ? 'composer-tab--active' : ''}`}
            onClick={() => setPostType(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <form className="composer-form" onSubmit={handleSubmit}>
        {/* Quick Emoji Bar */}
        <div className="quick-emojis-bar">
          {SHOP_EMOJIS.map(em => (
            <button
              key={em}
              type="button"
              className="quick-emoji-btn"
              onClick={() => addEmoji(em)}
            >
              {em}
            </button>
          ))}
        </div>

        {/* Caption Textarea */}
        <div className="composer-field">
          <textarea
            className="composer-textarea"
            placeholder={
              postType === 'text'
                ? 'Announce an offer, product discount, or shop update...'
                : postType === 'link'
                ? 'Add a caption for your product URL...'
                : postType === 'photo'
                ? 'Add product details, price, and ordering info...'
                : 'Write a catchy caption & hashtags for your Reel...'
            }
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={5}
          />

          <div className="composer-textarea-footer">
            <div className="quick-tags">
              {SHOP_HASHTAGS.map(tag => (
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
            <span className={`char-counter ${isOverLimit ? 'char-counter--error' : ''}`}>
              {remaining.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Link Input */}
        {postType === 'link' && (
          <div className="composer-field">
            <label className="field-label" htmlFor="shop-link">Product / Website URL</label>
            <input
              id="shop-link"
              type="url"
              className="text-input"
              placeholder="https://myshop.com/products/summer-sale"
              value={link}
              onChange={e => setLink(e.target.value)}
            />
          </div>
        )}

        {/* Photo Upload */}
        {postType === 'photo' && (
          <div className="upload-box">
            {imagePreview ? (
              <div className="preview-container">
                <img src={imagePreview} alt="Preview" className="media-preview" />
                <button type="button" className="remove-media-btn" onClick={resetImageFile}>
                  ✕ Remove
                </button>
              </div>
            ) : (
              <label className="upload-trigger" htmlFor="photo-file-input">
                <span className="upload-icon">📷</span>
                <span className="upload-main-text">Upload Product Photo</span>
                <span className="upload-sub-text">PNG, JPG, WEBP up to 25 MB</span>
                <input
                  id="photo-file-input"
                  type="file"
                  accept="image/*"
                  ref={fileRef}
                  onChange={handleImageChange}
                  hidden
                />
              </label>
            )}
          </div>
        )}

        {/* Video / Reel Upload */}
        {postType === 'reel' && (
          <div className="upload-box">
            {videoPreview ? (
              <div className="preview-container">
                <video src={videoPreview} controls className="media-preview media-preview--video" />
                <button type="button" className="remove-media-btn" onClick={resetVideoFile}>
                  ✕ Remove Video
                </button>
              </div>
            ) : (
              <label className="upload-trigger" htmlFor="reel-file-input">
                <span className="upload-icon">🎬</span>
                <span className="upload-main-text">Upload Reel / Video</span>
                <span className="upload-sub-text">MP4, MOV, WEBM up to 250 MB</span>
                <input
                  id="reel-file-input"
                  type="file"
                  accept="video/*"
                  ref={videoFileRef}
                  onChange={handleVideoChange}
                  hidden
                />
              </label>
            )}
          </div>
        )}

        {/* Submit CTA */}
        <button
          type="submit"
          className="submit-post-btn"
          disabled={loading || isOverLimit}
        >
          {loading ? <span className="btn-spinner" /> : '🚀'}
          {loading
            ? postType === 'reel'
              ? 'Publishing Reel to Meta…'
              : 'Publishing…'
            : targetFb && targetIg
            ? 'Publish to Facebook & Instagram'
            : targetIg
            ? 'Publish to Instagram'
            : 'Publish to Facebook'}
        </button>
      </form>

      {/* Toast */}
      {toast && (
        <div className={`composer-toast composer-toast--${toast.type}`}>
          {toast.text}
        </div>
      )}
    </section>
  );
}
