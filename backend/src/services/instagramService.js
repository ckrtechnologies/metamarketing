const axios = require('axios');
const fs = require('fs');

const GRAPH_BASE = 'https://graph.facebook.com/v19.0';
const getAccessToken = () => process.env.FB_PAGE_ACCESS_TOKEN;
const getIgUserId = () => process.env.IG_USER_ID;

function graphUrl(path) {
  return `${GRAPH_BASE}${path}`;
}

// ── Instagram Account Info ────────────────────────────────────
async function getAccountInfo() {
  const igId = getIgUserId();
  if (!igId) throw new Error('Instagram User ID (IG_USER_ID) not configured.');

  const { data } = await axios.get(graphUrl(`/${igId}`), {
    params: {
      fields: 'id,username,name,profile_picture_url,followers_count,follows_count,media_count,biography,website',
      access_token: getAccessToken(),
    },
  });
  return data;
}

// ── Instagram Media Feed (Photos, Reels, Carousels) ───────────
async function getMedia(limit = 12) {
  const igId = getIgUserId();
  if (!igId) throw new Error('Instagram User ID (IG_USER_ID) not configured.');

  const { data } = await axios.get(graphUrl(`/${igId}/media`), {
    params: {
      fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count',
      limit,
      access_token: getAccessToken(),
    },
  });
  return data;
}

// ── Poll Container Status ─────────────────────────────────────
async function waitForMediaContainer(creationId, maxAttempts = 35) {
  for (let i = 0; i < maxAttempts; i++) {
    const { data } = await axios.get(graphUrl(`/${creationId}`), {
      params: {
        fields: 'status_code,status',
        access_token: getAccessToken(),
      },
    });
    console.log(`Instagram container ${creationId} poll #${i + 1} status:`, data.status_code);
    if (data.status_code === 'FINISHED') return true;
    if (data.status_code === 'ERROR') {
      throw new Error(`Instagram media processing failed: ${data.status || 'Aspect ratio / encoding error'}`);
    }
    await new Promise(r => setTimeout(r, 2500));
  }
  return true;
}

// ── Publish Photo to Instagram ────────────────────────────────
async function publishPhoto(caption, imageUrl) {
  const igId = getIgUserId();
  if (!igId) throw new Error('Instagram User ID (IG_USER_ID) not configured.');

  // Step 1: Create Media Container
  const containerRes = await axios.post(graphUrl(`/${igId}/media`), null, {
    params: {
      image_url: imageUrl,
      caption: caption || '',
      access_token: getAccessToken(),
    },
  });

  const creationId = containerRes.data.id;

  // Wait for container readiness
  await waitForMediaContainer(creationId);

  // Step 2: Publish Container
  const publishRes = await axios.post(graphUrl(`/${igId}/media_publish`), null, {
    params: {
      creation_id: creationId,
      access_token: getAccessToken(),
    },
  });

  return publishRes.data;
}

// ── Publish Reel directly from local video file buffer (Official Resumable Protocol) ──
async function publishReelFromFile(caption, filePath) {
  const igId = getIgUserId();
  if (!igId) throw new Error('Instagram User ID (IG_USER_ID) not configured.');

  const fileBuffer = fs.readFileSync(filePath);
  const fileSize = fileBuffer.length;

  console.log(`🎬 Initiating Meta Resumable Upload for Reel (${fileSize} bytes)...`);

  // Step 1: Create Resumable Media Container
  const containerRes = await axios.post(graphUrl(`/${igId}/media`), null, {
    params: {
      media_type: 'REELS',
      upload_type: 'resumable',
      caption: caption || '',
      access_token: getAccessToken(),
    },
  });

  const containerId = containerRes.data.id;
  const uploadUri = containerRes.data.uri;

  console.log('   Container created:', containerId, '| Upload URI obtained.');

  // Step 2: Stream binary file directly to Meta server
  await axios.post(uploadUri, fileBuffer, {
    headers: {
      'Authorization': `OAuth ${getAccessToken()}`,
      'offset': '0',
      'file_size': String(fileSize),
      'Content-Type': 'application/octet-stream',
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  console.log('   Direct binary stream complete. Waiting for Instagram processing...');

  // Step 3: Wait for Meta encoding to finish
  await waitForMediaContainer(containerId, 40);

  // Step 4: Publish Reel
  const publishRes = await axios.post(graphUrl(`/${igId}/media_publish`), null, {
    params: {
      creation_id: containerId,
      access_token: getAccessToken(),
    },
  });

  return publishRes.data;
}

// ── Publish Reel from public URL ──────────────────────────────
async function publishReel(caption, videoUrl) {
  const igId = getIgUserId();
  if (!igId) throw new Error('Instagram User ID (IG_USER_ID) not configured.');

  const containerRes = await axios.post(graphUrl(`/${igId}/media`), null, {
    params: {
      media_type: 'REELS',
      video_url: videoUrl,
      caption: caption || '',
      access_token: getAccessToken(),
    },
  });

  const creationId = containerRes.data.id;
  await waitForMediaContainer(creationId, 40);

  const publishRes = await axios.post(graphUrl(`/${igId}/media_publish`), null, {
    params: {
      creation_id: creationId,
      access_token: getAccessToken(),
    },
  });

  return publishRes.data;
}

module.exports = {
  getAccountInfo,
  getMedia,
  publishPhoto,
  publishReel,
  publishReelFromFile,
};
