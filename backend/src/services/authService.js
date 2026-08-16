const axios = require('axios');
const shopRepo = require('../repositories/shopRepository');

const GRAPH_BASE = 'https://graph.facebook.com/v19.0';
const getAppId = () => process.env.FB_APP_ID;
const getAppSecret = () => process.env.FB_APP_SECRET;

const OAUTH_SCOPES = [
  'pages_show_list',
  'pages_manage_posts',
  'pages_read_engagement',
  'instagram_basic',
  'instagram_content_publish',
  'business_management',
];

/**
 * Generate official Meta OAuth Login URL for shopkeeper onboarding
 */
function getFacebookAuthUrl(redirectUri, state = 'default') {
  const appId = getAppId();
  if (!appId) throw new Error('FB_APP_ID is not configured in backend .env');

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state: state,
    scope: OAUTH_SCOPES.join(','),
    response_type: 'code',
    auth_type: 'rerequest',
  });

  return `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`;
}

/**
 * Step 1: Exchange OAuth authorization code for long-lived user access token
 */
async function exchangeCodeForLongLivedToken(code, redirectUri) {
  const appId = getAppId();
  const appSecret = getAppSecret();

  // Exchange code for short-lived token
  const shortLivedRes = await axios.get(`${GRAPH_BASE}/oauth/access_token`, {
    params: {
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    },
  });

  const shortLivedToken = shortLivedRes.data.access_token;

  // Exchange short-lived for 60-day long-lived token
  const longLivedRes = await axios.get(`${GRAPH_BASE}/oauth/access_token`, {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortLivedToken,
    },
  });

  return longLivedRes.data.access_token;
}

/**
 * Step 2: Query /me and /me/accounts to retrieve all Facebook Pages & linked Instagram accounts
 */
async function fetchEligiblePagesAndInstagram(userAccessToken) {
  // Fetch basic user profile
  const userRes = await axios.get(`${GRAPH_BASE}/me`, {
    params: {
      fields: 'id,name,email',
      access_token: userAccessToken,
    },
  });

  // Fetch all managed Facebook Pages with permanent page tokens & connected IG accounts
  const pagesRes = await axios.get(`${GRAPH_BASE}/me/accounts`, {
    params: {
      fields: 'id,name,category,fan_count,picture.type(large),access_token,instagram_business_account{id,username,name,profile_picture_url,followers_count,media_count}',
      access_token: userAccessToken,
      limit: 100,
    },
  });

  const pages = pagesRes.data.data.map(page => ({
    pageId: page.id,
    pageName: page.name,
    category: page.category,
    fanCount: page.fan_count || 0,
    pictureUrl: page.picture?.data?.url || '',
    pageAccessToken: page.access_token,
    instagram: page.instagram_business_account ? {
      igUserId: page.instagram_business_account.id,
      username: page.instagram_business_account.username,
      name: page.instagram_business_account.name,
      profilePictureUrl: page.instagram_business_account.profile_picture_url,
      followersCount: page.instagram_business_account.followers_count || 0,
      mediaCount: page.instagram_business_account.media_count || 0,
    } : null,
  }));

  return {
    user: userRes.data,
    pages,
  };
}

/**
 * Step 3: Connect and register the shopkeeper with the selected Page & IG account
 */
function registerOrUpdateShop(user, selectedPage, customShopName = null) {
  const shopData = {
    id: `shop_${selectedPage.pageId}`,
    shopName: customShopName || selectedPage.pageName,
    ownerName: user.name,
    ownerEmail: user.email || '',
    ownerMetaUserId: user.id,
    facebook: {
      pageId: selectedPage.pageId,
      pageName: selectedPage.pageName,
      pageAccessToken: selectedPage.pageAccessToken,
      fanCount: selectedPage.fanCount,
      pictureUrl: selectedPage.pictureUrl,
    },
    instagram: selectedPage.instagram || null,
    status: 'active',
  };

  return shopRepo.upsertShop(shopData);
}

module.exports = {
  getFacebookAuthUrl,
  exchangeCodeForLongLivedToken,
  fetchEligiblePagesAndInstagram,
  registerOrUpdateShop,
};
