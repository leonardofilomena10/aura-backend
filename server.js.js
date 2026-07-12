require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
// Autoriser ton front-end à parler avec ce back-end
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

// ==========================================
// 1. ROUTE DE BASE (Corrige le "Cannot GET /")
// ==========================================
app.get('/', (req, res) => {
    res.json({
        status: "En ligne ✅",
        message: "Bienvenue sur l'API Aura Analyst. Le serveur est prêt à recevoir les requêtes du Front-end !",
        version: "2.5 (Sécurisée)"
    });
});

// ==========================================
// 2. OUTIL : VÉRIFICATION D'APIFY (Avec Logs)
// ==========================================
async function waitForApifyRun(runId, token, platform) {
    const checkUrl = `https://api.apify.com/v2/actor-runs/${runId}?token=${token}`;
    let attempts = 0;
    const maxAttempts = 30; // Environ 60 secondes d'attente max

    console.log(`[${platform.toUpperCase()}] Début de l'attente pour le Run ID: ${runId}`);

    while (attempts < maxAttempts) {
        try {
            const response = await axios.get(checkUrl);
            const runStatus = response.data.data.status;
            
            console.log(`[${platform.toUpperCase()}] Statut actuel : ${runStatus}`);
            
            if (runStatus === 'SUCCEEDED') return true;
            if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(runStatus)) {
                console.error(`[${platform.toUpperCase()}] Échec critique du robot Apify (${runStatus})`);
                return false;
            }
        } catch (err) {
            console.error(`[${platform.toUpperCase()}] Erreur lors du check Apify:`, err.message);
        }
        
        // Pause de 2 secondes avant de revérifier
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;
    }
    console.log(`[${platform.toUpperCase()}] Temps d'attente dépassé (Timeout interne).`);
    return false;
}

// ==========================================
// 3. CONTROLLER YOUTUBE
// ==========================================
async function getYouTubeStats(channelName) {
    const API_KEY = process.env.YOUTUBE_API_KEY;
    if (!API_KEY) throw new Error("Clé YouTube manquante sur le serveur.");

    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(channelName)}&key=${API_KEY}`;
    const searchRes = await axios.get(searchUrl);
    if (!searchRes.data.items || searchRes.data.items.length === 0) throw new Error("Chaîne YouTube introuvable.");
    
    const channelId = searchRes.data.items[0].snippet.channelId;

    const statsUrl = `https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&id=${channelId}&key=${API_KEY}`;
    const statsRes = await axios.get(statsUrl);
    const channelInfo = statsRes.data.items[0];

    const subs = parseInt(channelInfo.statistics.subscriberCount) || 0;
    const totalViews = parseInt(channelInfo.statistics.viewCount) || 0;
    const totalVideos = parseInt(channelInfo.statistics.videoCount) || 1;
    const estimatedViews = Math.round(totalViews / totalVideos);

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
// 4. CONTROLLER TIKTOK
// ==========================================
async function getTikTokStatsViaApify(username) {
    const API_TOKEN = process.env.APIFY_API_TOKEN;
    if (!API_TOKEN) throw new Error("Clé APIFY manquante sur le serveur.");

    const ACTOR_ID = "clockworks~tiktok-profile-scraper";
    const runUrl = `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${API_TOKEN}`;
    const cleanUsername = username.replace('@', '').trim();

    console.log(`[TIKTOK] Lancement du scraping pour : ${cleanUsername}`);

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
    const defaultDatasetId = runResponse.data.data.defaultDatasetId;

    const isSuccess = await waitForApifyRun(runId, API_TOKEN, 'tiktok');
    if (!isSuccess) throw new Error("Le robot TikTok a échoué ou mis trop de temps.");

    console.log(`[TIKTOK] Scraping terminé, récupération des données...`);
    const datasetUrl = `https://api.apify.com/v2/datasets/${defaultDatasetId}/items?token=${API_TOKEN}`;
    const datasetRes = await axios.get(datasetUrl);
    const items = datasetRes.data;

    if (!items || items.length === 0) throw new Error("Profil introuvable ou aucune vidéo récente.");

    let totalViews = 0;
    let totalInteractions = 0;
    
    // Sécurisation de la lecture des données pour éviter les crashs
    const authorName = items[0].authorMeta?.name || cleanUsername;
    const followers = items[0].authorMeta?.fans || items[0].authorMeta?.followers || 0;

    items.forEach(item => {
        totalViews += (Number(item.playCount) || 0);
        const interactions = (Number(item.diggCount) || 0) + (Number(item.commentCount) || 0) + (Number(item.shareCount) || 0);
        totalInteractions += interactions;
    });

    const averageViews = items.length > 0 ? Math.round(totalViews / items.length) : 0;

    console.log(`[TIKTOK] Succès pour ${authorName} : ${followers} abonnés.`);

    return {
        name: authorName,
        platform: 'tiktok',
        subs: followers,
        views: averageViews,
        interactions: totalInteractions
    };
}

// ==========================================
// 5. CONTROLLER FACEBOOK
// ==========================================
async function getFacebookStatsViaApify(pageName) {
    const API_TOKEN = process.env.APIFY_API_TOKEN;
    if (!API_TOKEN) throw new Error("Clé APIFY manquante sur le serveur.");

    const ACTOR_ID = "apify~facebook-pages-scraper";
    const runUrl = `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${API_TOKEN}`;
    const cleanName = pageName.replace('@', '').trim();

    console.log(`[FACEBOOK] Lancement du scraping pour : ${cleanName}`);

    const runResponse = await axios.post(runUrl, {
        startUrls: [{ url: `https://www.facebook.com/${cleanName}` }],
        maxPosts: 3,
        resultsLimit: 1
    });

    const runId = runResponse.data.data.id;
    const defaultDatasetId = runResponse.data.data.defaultDatasetId;

    const isSuccess = await waitForApifyRun(runId, API_TOKEN, 'facebook');
    if (!isSuccess) throw new Error("Le robot Facebook a échoué ou mis trop de temps.");

    console.log(`[FACEBOOK] Scraping terminé, récupération des données...`);
    const datasetUrl = `https://api.apify.com/v2/datasets/${defaultDatasetId}/items?token=${API_TOKEN}`;
    const datasetRes = await axios.get(datasetUrl);
    const items = datasetRes.data;

    if (!items || items.length === 0) throw new Error("Page Facebook introuvable.");

    const info = items[0];
    const likes = Number(info.likes) || Number(info.followers) || 0;

    console.log(`[FACEBOOK] Succès pour ${info.name || cleanName}.`);

    return {
        name: info.name || cleanName,
        platform: 'facebook',
        subs: likes,
        views: Math.round(likes * 0.15), 
        interactions: (Number(info.commentsCount) || 0) + (Number(info.likesCount) || 0)
    };
}

// ==========================================
// 6. ROUTE PRINCIPALE DE L'API (/api/analyze)
// ==========================================
app.post('/api/analyze', async (req, res) => {
    const { username, platform } = req.body;

    if (!username || !platform) {
        return res.status(400).json({ success: false, error: "Paramètres 'username' ou 'platform' manquants." });
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
            return res.json({ success: false, error: "Plateforme inconnue." });
        }

        // On renvoie un statut 200 OK avec les données
        return res.status(200).json({ success: true, data: metricsData });

    } catch (error) {
        // En cas d'erreur (compte introuvable, plantage), on ne fait PAS crasher le serveur.
        // On renvoie proprement au Front-end que la mission a échouée pour ce profil.
        console.error(`[ERREUR GLOBALE] pour ${username} sur ${platform} :`, error.message);
        return res.status(200).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Serveur Aura Backend démarré sur le port ${PORT}`);
    console.log(`🌍 Prêt à recevoir les requêtes...`);
});
