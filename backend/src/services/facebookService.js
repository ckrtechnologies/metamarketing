const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const ig = require('./instagramService');

const GRAPH_BASE = 'https://graph.facebook.com/v19.0';
const getPageId = () => process.env.FB_PAGE_ID;
const getAccessToken = () => process.env.FB_PAGE_ACCESS_TOKEN;

// ── Helper ────────────────────────────────────────────────────
function graphUrl(path) {
  return `${GRAPH_BASE}${path}`;
}

// ── Page Info ─────────────────────────────────────────────────
async function getPageInfo() {
  const { data } = await axios.get(graphUrl(`/${getPageId()}`), {
    params: {
      fields: 'name,fan_count,picture.type(large),about,website',
      access_token: getAccessToken(),
    },
  });
  return data;
}

// ── Publish Text Post ─────────────────────────────────────────
async function publishTextPost(message) {
  const { data } = await axios.post(graphUrl(`/${getPageId()}/feed`), null, {
    params: {
      message,
      access_token: getAccessToken(),
    },
  });
  return data; // { id: "PAGE_ID_POST_ID" }
}

// ── Publish Link Post ─────────────────────────────────────────
async function publishLinkPost(message, link) {
  const { data } = await axios.post(graphUrl(`/${getPageId()}/feed`), null, {
    params: {
      message,
      link,
      access_token: getAccessToken(),
    },
  });
  return data;
}

// ── Publish Photo Post (Supports Facebook + Instagram cross-post) ──
async function publishPhotoPost(message, imagePath, options = {}) {
  const { postToFb = true, postToIg = true } = options;
  const results = {};

  try {
    // 1. Upload photo to Facebook Page
    const form = new FormData();
    form.append('message', message || '');
    form.append('source', fs.createReadStream(imagePath));
    form.append('access_token', getAccessToken());
    // If not posting to FB feed, publish as unlisted photo to get the CDN URL for Instagram
    if (!postToFb) {
      form.append('published', 'false');
    }

    const { data: fbData } = await axios.post(graphUrl(`/${getPageId()}/photos`), form, {
      headers: form.getHeaders(),
    });

    results.fb = fbData;

    // 2. Cross-post to Instagram if selected
    if (postToIg && fbData.id) {
      try {
        // Fetch the high-res CDN image URL created by Meta
        const photoDetails = await axios.get(graphUrl(`/${fbData.id}`), {
          params: {
            fields: 'images',
            access_token: getAccessToken(),
          },
        });

        const cdnImageUrl = photoDetails.data?.images?.[0]?.source;
        if (cdnImageUrl) {
          console.log('📸 Publishing to Instagram with CDN URL:', cdnImageUrl.substring(0, 45) + '...');
          results.ig = await ig.publishPhoto(message, cdnImageUrl);
          console.log('✅ Instagram Publish Success:', results.ig);
        }
      } catch (igErr) {
        console.error('❌ Instagram publish error:', igErr.response?.data || igErr.message);
        results.igError = igErr.response?.data?.error?.message || igErr.message;
      }
    }
  } finally {
    // Clean up local temp file
    fs.unlink(imagePath, () => {});
  }

  return results;
}

// ── Poll Facebook Video Status ────────────────────────────────
async function waitForFbVideo(videoId, maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    const { data } = await axios.get(graphUrl(`/${videoId}`), {
      params: {
        fields: 'status,source',
        access_token: getAccessToken(),
      },
    });
    console.log(`Facebook video ${videoId} status:`, data.status?.video_status);
    if (data.status?.video_status === 'ready' && data.source) {
      return data.source;
    }
    await new Promise(r => setTimeout(r, 3000));
  }
  // Fallback: try to fetch source one more time
  const { data } = await axios.get(graphUrl(`/${videoId}`), {
    params: { fields: 'source', access_token: getAccessToken() },
  });
  return data.source;
}

// ── Publish Video / Reel Post (Facebook + Instagram) ─────────
async function publishVideoPost(description, videoPath, options = {}) {
  const { postToFb = true, postToIg = true } = options;
  const results = {};

  try {
    // 1. Upload video to Facebook Page
    const form = new FormData();
    form.append('description', description || '');
    form.append('source', fs.createReadStream(videoPath));
    form.append('access_token', getAccessToken());
    if (!postToFb) {
      form.append('published', 'false');
    }

    console.log('🎬 Uploading video to Facebook Graph API...');
    const { data: fbData } = await axios.post(graphUrl(`/${getPageId()}/videos`), form, {
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    results.fb = fbData;
    console.log('✅ Facebook Video uploaded. ID:', fbData.id);

    // 2. Direct Resumable Cross-post to Instagram Reels
    if (postToIg) {
      try {
        console.log('🎬 Uploading Reel directly to Instagram via Resumable Protocol...');
        results.ig = await ig.publishReelFromFile(description, videoPath);
        console.log('✅ Instagram Reel Publish Success:', results.ig);
      } catch (igErr) {
        console.error('❌ Instagram Reel error:', igErr.response?.data || igErr.message);
        results.igError = igErr.response?.data?.error?.message || igErr.message;
      }
    }
  } finally {
    fs.unlink(videoPath, () => {});
  }

  return results;
}

// ── Get Recent Posts ──────────────────────────────────────────
async function getRecentPosts(limit = 10) {
  const { data } = await axios.get(graphUrl(`/${getPageId()}/published_posts`), {
    params: {
      fields: 'id,message,story,full_picture,permalink_url,created_time,shares',
      limit,
      access_token: getAccessToken(),
    },
  });
  return data;
}

// ── Delete Post ───────────────────────────────────────────────
async function deletePost(postId) {
  const { data } = await axios.delete(graphUrl(`/${postId}`), {
    params: { access_token: getAccessToken() },
  });
  return data;
}

module.exports = {
  getPageInfo,
  publishTextPost,
  publishLinkPost,
  publishPhotoPost,
  publishVideoPost,
  getRecentPosts,
  deletePost,
};

