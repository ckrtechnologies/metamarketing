const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const shopRepo = require('../repositories/shopRepository');

const GRAPH_BASE = 'https://graph.facebook.com/v19.0';

function graphUrl(path) {
  return `${GRAPH_BASE}${path}`;
}

// ── Helper: Get Shop & Token ──────────────────────────────────
function getShopOrThrow(shopId) {
  const shop = shopRepo.findShopById(shopId);
  if (!shop) {
    throw new Error(`Shop with ID '${shopId}' not found.`);
  }
  if (!shop.facebook?.pageAccessToken) {
    throw new Error(`Shop '${shop.shopName}' does not have a valid Facebook Page access token.`);
  }
  return shop;
}

// ── Get Live Shop Profile ─────────────────────────────────────
async function getLiveShopProfile(shopId) {
  const shop = getShopOrThrow(shopId);
  const token = shop.facebook.pageAccessToken;
  const pageId = shop.facebook.pageId;

  // 1. Fetch live Facebook Page Info
  const pageRes = await axios.get(graphUrl(`/${pageId}`), {
    params: {
      fields: 'name,fan_count,picture.type(large),about,website',
      access_token: token,
    },
  });

  let igData = null;
  if (shop.instagram?.igUserId) {
    try {
      const igRes = await axios.get(graphUrl(`/${shop.instagram.igUserId}`), {
        params: {
          fields: 'id,username,name,profile_picture_url,followers_count,follows_count,media_count,biography,website',
          access_token: token,
        },
      });
      igData = igRes.data;
    } catch (e) {
      console.warn(`Could not refresh Instagram data for shop ${shopId}:`, e.message);
    }
  }

  // Update repository cache
  shopRepo.upsertShop({
    ...shop,
    facebook: {
      ...shop.facebook,
      fanCount: pageRes.data.fan_count,
      pictureUrl: pageRes.data.picture?.data?.url || shop.facebook.pictureUrl,
    },
    instagram: igData ? {
      ...shop.instagram,
      followersCount: igData.followers_count,
      profilePictureUrl: igData.profile_picture_url,
      mediaCount: igData.media_count,
    } : shop.instagram,
  });

  return {
    id: shop.id,
    shopId: shop.id,
    shopName: shop.shopName,
    ownerName: shop.ownerName,
    facebook: {
      pageId: shop.facebook.pageId,
      pageName: pageRes.data.name || shop.facebook.pageName,
      fanCount: pageRes.data.fan_count ?? shop.facebook.fanCount ?? 0,
      pictureUrl: pageRes.data.picture?.data?.url || shop.facebook.pictureUrl,
    },
    instagram: igData ? {
      igUserId: igData.id,
      username: igData.username,
      name: igData.name,
      profilePictureUrl: igData.profile_picture_url || shop.instagram?.profilePictureUrl,
      followersCount: igData.followers_count ?? shop.instagram?.followersCount ?? 0,
      mediaCount: igData.media_count ?? shop.instagram?.mediaCount ?? 0,
    } : shop.instagram,
  };
}

// ── Get Shop Feeds (Facebook Posts + Instagram Grid) ──────────
async function getShopFeeds(shopId, limit = 12) {
  const shop = getShopOrThrow(shopId);
  const token = shop.facebook.pageAccessToken;

  const result = {
    facebookPosts: [],
    instagramMedia: [],
  };

  // 1. Fetch Facebook Posts
  try {
    const fbRes = await axios.get(graphUrl(`/${shop.facebook.pageId}/published_posts`), {
      params: {
        fields: 'id,message,story,full_picture,permalink_url,created_time,shares',
        limit,
        access_token: token,
      },
    });
    result.facebookPosts = fbRes.data?.data || [];
  } catch (err) {
    console.error('FB Feed fetch error:', err.message);
  }

  // 2. Fetch Instagram Media
  if (shop.instagram?.igUserId) {
    try {
      const igRes = await axios.get(graphUrl(`/${shop.instagram.igUserId}/media`), {
        params: {
          fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count',
          limit,
          access_token: token,
        },
      });
      result.instagramMedia = igRes.data?.data || [];
    } catch (err) {
      console.error('IG Media fetch error:', err.message);
    }
  }

  return result;
}

// ── Publish Text Post ─────────────────────────────────────────
async function publishTextPost(shopId, message) {
  const shop = getShopOrThrow(shopId);
  const { data } = await axios.post(graphUrl(`/${shop.facebook.pageId}/feed`), null, {
    params: {
      message,
      access_token: shop.facebook.pageAccessToken,
    },
  });
  return { fb: data };
}

// ── Publish Link Post ─────────────────────────────────────────
async function publishLinkPost(shopId, message, link) {
  const shop = getShopOrThrow(shopId);
  const { data } = await axios.post(graphUrl(`/${shop.facebook.pageId}/feed`), null, {
    params: {
      message,
      link,
      access_token: shop.facebook.pageAccessToken,
    },
  });
  return { fb: data };
}

// ── Publish Photo Post (Dual Platform) ────────────────────────
async function publishPhotoPost(shopId, message, imagePath, options = {}) {
  const { postToFb = true, postToIg = true } = options;
  const shop = getShopOrThrow(shopId);
  const token = shop.facebook.pageAccessToken;
  const results = {};

  try {
    // 1. Upload to Facebook Page
    const form = new FormData();
    form.append('message', message || '');
    form.append('source', fs.createReadStream(imagePath));
    form.append('access_token', token);
    if (!postToFb) form.append('published', 'false');

    const { data: fbData } = await axios.post(graphUrl(`/${shop.facebook.pageId}/photos`), form, {
      headers: form.getHeaders(),
    });
    results.fb = fbData;

    // 2. Cross-post to Instagram
    if (postToIg && shop.instagram?.igUserId && fbData.id) {
      try {
        const photoDetails = await axios.get(graphUrl(`/${fbData.id}`), {
          params: { fields: 'images', access_token: token },
        });
        const cdnUrl = photoDetails.data?.images?.[0]?.source;

        if (cdnUrl) {
          // Create container
          const contRes = await axios.post(graphUrl(`/${shop.instagram.igUserId}/media`), null, {
            params: { image_url: cdnUrl, caption: message || '', access_token: token },
          });

          // Wait for container
          await waitForContainer(contRes.data.id, token);

          // Publish container
          const pubRes = await axios.post(graphUrl(`/${shop.instagram.igUserId}/media_publish`), null, {
            params: { creation_id: contRes.data.id, access_token: token },
          });
          results.ig = pubRes.data;
        }
      } catch (igErr) {
        console.error('IG publish error:', igErr.response?.data || igErr.message);
        results.igError = igErr.response?.data?.error?.message || igErr.message;
      }
    }
  } finally {
    fs.unlink(imagePath, () => {});
  }

  return results;
}

// ── Publish Reel Post (Direct Resumable Upload) ───────────────
async function publishReelPost(shopId, message, videoPath, options = {}) {
  const { postToFb = true, postToIg = true } = options;
  const shop = getShopOrThrow(shopId);
  const token = shop.facebook.pageAccessToken;
  const results = {};

  try {
    // 1. Upload to Facebook Videos
    if (postToFb) {
      const form = new FormData();
      form.append('description', message || '');
      form.append('source', fs.createReadStream(videoPath));
      form.append('access_token', token);

      const { data: fbData } = await axios.post(graphUrl(`/${shop.facebook.pageId}/videos`), form, {
        headers: form.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });
      results.fb = fbData;
    }

    // 2. Direct Resumable Upload to Instagram Reels
    if (postToIg && shop.instagram?.igUserId) {
      try {
        const fileBuffer = fs.readFileSync(videoPath);
        const fileSize = fileBuffer.length;

        const contRes = await axios.post(graphUrl(`/${shop.instagram.igUserId}/media`), null, {
          params: {
            media_type: 'REELS',
            upload_type: 'resumable',
            caption: message || '',
            access_token: token,
          },
        });

        const containerId = contRes.data.id;
        const uploadUri = contRes.data.uri;

        // Stream binary
        await axios.post(uploadUri, fileBuffer, {
          headers: {
            'Authorization': `OAuth ${token}`,
            'offset': '0',
            'file_size': String(fileSize),
            'Content-Type': 'application/octet-stream',
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        });

        // Wait for encoding
        await waitForContainer(containerId, token, 35);

        // Publish
        const pubRes = await axios.post(graphUrl(`/${shop.instagram.igUserId}/media_publish`), null, {
          params: { creation_id: containerId, access_token: token },
        });
        results.ig = pubRes.data;
      } catch (igErr) {
        console.error('IG Reel error:', igErr.response?.data || igErr.message);
        results.igError = igErr.response?.data?.error?.message || igErr.message;
      }
    }
  } finally {
    fs.unlink(videoPath, () => {});
  }

  return results;
}

// ── Poll Container Helper ─────────────────────────────────────
async function waitForContainer(containerId, token, maxAttempts = 25) {
  for (let i = 0; i < maxAttempts; i++) {
    const { data } = await axios.get(graphUrl(`/${containerId}`), {
      params: { fields: 'status_code,status', access_token: token },
    });
    if (data.status_code === 'FINISHED') return true;
    if (data.status_code === 'ERROR') {
      throw new Error(`Instagram container failed: ${data.status || 'Encoding error'}`);
    }
    await new Promise(r => setTimeout(r, 2500));
  }
  return true;
}

// ── Delete Facebook Post ──────────────────────────────────────
async function deleteFacebookPost(shopId, postId) {
  const shop = getShopOrThrow(shopId);
  const token = shop.facebook.pageAccessToken;

  const { data } = await axios.delete(graphUrl(`/${postId}`), {
    params: { access_token: token },
  });
  return data;
}

module.exports = {
  getLiveShopProfile,
  getShopFeeds,
  publishTextPost,
  publishLinkPost,
  publishPhotoPost,
  publishReelPost,
  deleteFacebookPost,
};
