require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

// ==========================================
// OUTILS ET CAPTEURS DE SÉCURITÉ APIFY
// ==========================================
async function waitForApifyRun(runId, token) {
    const checkUrl = `https://api.apify.com/v2/actor-runs/${runId}?token=${token}`;
    let attempts = 0;
    const maxAttempts = 20; // 20 essais * 2 secondes = 40 secondes max

    while (attempts < maxAttempts) {
        const response = await axios.get(checkUrl);
        const runStatus = response.data.data.status;
        
        if (runStatus === 'SUCCEEDED') return true;
        if (runStatus === 'FAILED' || runStatus === 'ABORTED' || runStatus === 'TIMED-OUT') return false;
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;
    }
    return false;
}

// ==========================================
// CONTROLLER 1 : YOUTUBE (API OFFICIELLE)
// ==========================================
async function getYouTubeStats(channelName) {
    const API_KEY = process.env.YOUTUBE_API_KEY;
    if (!API_KEY) throw new Error("Clé YouTube manquante sur Render.");

    // Étape A : Trouver le ChannelID via le nom d'usage
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(channelName)}&key=${API_KEY}`;
    const searchRes = await axios.get(searchUrl);
    if (!searchRes.data.items || searchRes.data.items.length === 0) throw new Error("Chaîne YouTube introuvable.");
    
    const channelId = searchRes.data.items[0].snippet.channelId;

    // Étape B : Extraction des statistiques globales
    const statsUrl = `https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&id=${channelId}&key=${API_KEY}`;
    const statsRes = await axios.get(statsUrl);
    const channelInfo = statsRes.data.items[0];

    const subs = parseInt(channelInfo.statistics.subscriberCount) || 0;
    const totalViews = parseInt(channelInfo.statistics.viewCount) || 0;
    const totalVideos = parseInt(channelInfo.statistics.videoCount) || 1;
    const estimatedViews = Math.round(totalViews / totalVideos);

    // Étape C : Échantillonnage des interactions récentes
    const videosUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&maxResults=5&order=date&type=video&key=${API_KEY}`;
    const videosRes = await axios.get(videosUrl);
    let totalInteractions = 0;

    if (videosRes.data.items && videosRes.data.items.length > 0) {
        const videoIds = videosRes.data.items.map(item => item.id.videoId).join(',');
        const detailUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoIds}&key=${API_KEY}`;
        const detailRes = await axios.get(detailUrl);
        
        detailRes.data.items.forEach(v => {
            const likes = parseInt(v.statistics.likeCount) || 0;
            const comments = parseInt(v.statistics.commentCount) || 0;
            totalInteractions += (likes + comments);
        });
    }

    return {
        name: channelInfo.snippet.title,
        platform: 'youtube',
        subs: subs,
        views: estimatedViews,
        interactions: totalInteractions === 0 ? Math.round(estimatedViews * 0.05) : totalInteractions
    };
}

// ==========================================
// CONTROLLER 2 : TIKTOK (APIFY OPTIMISÉ)
// ==========================================
async function getTikTokStatsViaApify(username) {
    const API_TOKEN = process.env.APIFY_API_TOKEN;
    if (!API_TOKEN) throw new Error("Clé APIFY_API_TOKEN manquante.");

    const ACTOR_ID = "clockworks~tiktok-profile-scraper";
    const runUrl = `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${API_TOKEN}`;
    const cleanUsername = username.replace('@', '').trim();

    // Lancement du robot avec le JSON optimisé
    const runResponse = await axios.post(runUrl, {
        profiles: [cleanUsername],
        commentsPerPost: 0,
        excludePinnedPosts: false,
        maxFollowersPerProfile: 0,
        maxFollowingPerProfile: 0,
        maxRepliesPerComment: 0,
        shouldDownloadAvatars: false,
        shouldDownloadCovers: false,
        shouldDownloadSlideshowImages: false,
        shouldDownloadVideos: false,
        topLevelCommentsPerPost: 0
    });

    const runId = runResponse.data.data.id;
    const isSuccess = await waitForApifyRun(runId, API_TOKEN);
    if (!isSuccess) throw new Error("Le robot TikTok n'a pas répondu à temps.");

    // Récupération du stockage
    const datasetUrl = `https://api.apify.com/v2/datasets/${runResponse.data.data.defaultDatasetId}/items?token=${API_TOKEN}`;
    const datasetRes = await axios.get(datasetUrl);
    const items = datasetRes.data;

    if (!items || items.length === 0) throw new Error("Compte inexistant ou protégé.");

    let totalViews = 0;
    let totalInteractions = 0;
    const authorName = items[0].authorMeta?.name || cleanUsername;
    const followers = items[0].authorMeta?.fans || 0;

    // Compilation des métriques des posts récents
    items.forEach(item => {
        totalViews += (item.playCount || 0);
        const interactions = (item.diggCount || 0) + (item.commentCount || 0) + (item.shareCount || 0);
        totalInteractions += interactions;
    });

    const averageViews = items.length > 0 ? Math.round(totalViews / items.length) : 0;

    return {
        name: authorName,
        platform: 'tiktok',
        subs: followers,
        views: averageViews,
        interactions: totalInteractions
    };
}

// ==========================================
// CONTROLLER 3 : FACEBOOK (APIFY SCRAPER)
// ==========================================
async function getFacebookStatsViaApify(pageName) {
    const API_TOKEN = process.env.APIFY_API_TOKEN;
    if (!API_TOKEN) throw new Error("Clé APIFY_API_TOKEN manquante.");

    const ACTOR_ID = "apify~facebook-pages-scraper";
    const runUrl = `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${API_TOKEN}`;
    const cleanName = pageName.replace('@', '').trim();

    const runResponse = await axios.post(runUrl, {
        startUrls: [{ url: `https://www.facebook.com/${cleanName}` }],
        maxPosts: 3,
        resultsLimit: 1
    });

    const runId = runResponse.data.data.id;
    const isSuccess = await waitForApifyRun(runId, API_TOKEN);
    if (!isSuccess) throw new Error("Le robot Facebook a expiré.");

    const datasetUrl = `https://api.apify.com/v2/datasets/${runResponse.data.data.defaultDatasetId}/items?token=${API_TOKEN}`;
    const datasetRes = await axios.get(datasetUrl);
    const items = datasetRes.data;

    if (!items || items.length === 0) throw new Error("Page Facebook introuvable.");

    const info = items[0];
    const likes = info.likes || info.followers || 0;

    return {
        name: info.name || cleanName,
        platform: 'facebook',
        subs: likes,
        views: Math.round(likes * 0.15), 
        interactions: parseInt(info.commentsCount || 0) + parseInt(info.likesCount || 0)
    };
}

// ==========================================
// ROUTE PRINCIPALE DE L'API
// ==========================================
app.post('/api/analyze', async (req, res) => {
    const { username, platform } = req.body;

    if (!username || !platform) {
        return res.status(400).json({ success: false, error: "Paramètres manquants." });
    }

    try {
        let metricsData;
        if (platform === 'youtube') {
            metricsData = await getYouTubeStats(username);
        } else if (platform === 'tiktok') {
            metricsData = await getTikTokStatsViaApify(username);
        } else if (platform === 'facebook') {
            metricsData = await getFacebookStatsViaApify(username);
        } else {
            return res.status(400).json({ success: false, error: "Plateforme inconnue." });
        }

        return res.json({ success: true, data: metricsData });

    } catch (error) {
        console.error(`Erreur pour ${username} sur ${platform}:`, error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Serveur Aura Backend démarré sur le port ${PORT}`);
});
