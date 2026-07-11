// AURA ANALYST - BACKEND SERVEUR (MODE PRODUCTION AVANCÉ AVEC SCRAPING)

const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config(); 

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ==========================================
// CONFIGURATION DES CLÉS (Variables d'environnement)
// ==========================================
// Clé YouTube officielle
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
// Clé Apify (Pour scraper TikTok, Facebook, Insta...)
const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN;

app.get('/', (req, res) => {
    res.json({ message: "Serveur Aura Analyst opérationnel 🚀 (Mode Scraping Avancé)" });
});

app.post('/api/analyze', async (req, res) => {
    const { username, platform } = req.body;

    if (!username || !platform) {
        return res.json({ success: false, error: "Username et platform requis" });
    }

    try {
        let stats = null;

        if (platform === 'youtube') {
            stats = await getYouTubeStats(username);
        } else if (platform === 'tiktok') {
            stats = await getTikTokStatsViaApify(username);
        } else if (platform === 'facebook') {
            stats = await getFacebookStatsViaApify(username);
        } else {
            return res.json({ success: false, error: "Plateforme non reconnue" });
        }

        res.json({ success: true, data: stats });

    } catch (error) {
        console.error(`Erreur pour ${username} sur ${platform}:`, error.message);
        res.json({ success: false, error: error.message });
    }
});

// ==========================================
// 1. FONCTION YOUTUBE (API Officielle v3)
// ==========================================
async function getYouTubeStats(username) {
    if (!YOUTUBE_API_KEY) {
         throw new Error("Clé API YouTube manquante");
    }

    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${username}&key=${YOUTUBE_API_KEY}`;
    const searchResponse = await axios.get(searchUrl);
    
    if (!searchResponse.data.items || searchResponse.data.items.length === 0) {
        throw new Error("Chaîne YouTube introuvable");
    }
    
    const channelId = searchResponse.data.items[0].snippet.channelId;

    const statsUrl = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}&key=${YOUTUBE_API_KEY}`;
    const statsResponse = await axios.get(statsUrl);
    const channelStats = statsResponse.data.items[0].statistics;

    const subCount = parseInt(channelStats.subscriberCount) || 0;
    const totalViews = parseInt(channelStats.viewCount) || 0;
    const videoCount = parseInt(channelStats.videoCount) || 1;
    
    const avgViews = Math.floor(totalViews / videoCount);
    const estimatedInteractions = Math.floor(avgViews * 0.05); 

    return {
        name: username,
        platform: 'youtube',
        subs: subCount,
        views: avgViews,
        interactions: estimatedInteractions
    };
}

// ==========================================
// 2. FONCTION TIKTOK (Apify - clockworks)
// ==========================================
async function getTikTokStatsViaApify(username) {
    if (!APIFY_API_TOKEN) {
         throw new Error("Token Apify manquant (Nécessaire pour TikTok)");
    }

    // Le fameux robot avec le "s" et le tilde "~" !
    const ACTOR_ID = "clockworks~tiktok-profile-scraper"; 
    const runUrl = `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${APIFY_API_TOKEN}`;
    
    // On enlève le @ s'il y en a un pour éviter de perturber le robot
    const cleanUsername = username.replace('@', '');

    try {
        const runResponse = await axios.post(runUrl, {
            profiles: [cleanUsername],
            // Tes réglages JSON d'optimisation
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
        const datasetId = runResponse.data.data.defaultDatasetId;

        // Attendre que le robot finisse son travail
        await waitForApifyRun(runId, APIFY_API_TOKEN);

        const datasetUrl = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_API_TOKEN}`;
        const datasetResponse = await axios.get(datasetUrl);
        
        if (!datasetResponse.data || datasetResponse.data.length === 0) {
            throw new Error("Profil TikTok introuvable ou bloqué");
        }

        // Le robot renvoie un tableau avec les dernières vidéos
        const posts = datasetResponse.data;
        const firstPost = posts[0];
        const author = firstPost.authorMeta || {};

        // Extraction des abonnés
        const followersCount = author.fans || author.followers || 0;

        // Calcul de la VRAIE moyenne d'engagement
        let totalViews = 0;
        let totalInteractions = 0;

        posts.forEach(post => {
            totalViews += post.playCount || 0;
            // On additionne Likes (digg) + Commentaires + Partages
            totalInteractions += (post.diggCount || 0) + (post.commentCount || 0) + (post.shareCount || 0);
        });

        const avgViews = posts.length > 0 ? Math.floor(totalViews / posts.length) : 0;
        const avgInteractions = posts.length > 0 ? Math.floor(totalInteractions / posts.length) : 0;

        return {
            name: username,
            platform: 'tiktok',
            subs: parseInt(followersCount) || 0,
            views: avgViews || 0,
            interactions: avgInteractions || 0
        };

    } catch (err) {
        if (err.response && err.response.data) {
            console.error("Détail erreur Apify (TikTok):", err.response.data);
        }
        throw new Error(err.message.includes("introuvable") ? err.message : "Échec du scraping TikTok via Apify");
    }
}

// ==========================================
// 3. FONCTION FACEBOOK (Apify - facebook-pages-scraper)
// ==========================================
async function getFacebookStatsViaApify(username) {
    if (!APIFY_API_TOKEN) {
         throw new Error("Token Apify manquant (Nécessaire pour Facebook)");
    }

    // Utilisation du tilde "~" ici aussi
    const ACTOR_ID = "apify~facebook-pages-scraper"; 
    const runUrl = `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${APIFY_API_TOKEN}`;
    
    const profileUrl = `https://www.facebook.com/${username}`;

    try {
        const runResponse = await axios.post(runUrl, {
            startUrls: [{ url: profileUrl }]
        });

        const runId = runResponse.data.data.id;
        const datasetId = runResponse.data.data.defaultDatasetId;

        await waitForApifyRun(runId, APIFY_API_TOKEN);

        const datasetUrl = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_API_TOKEN}`;
        const datasetResponse = await axios.get(datasetUrl);
        
        if (!datasetResponse.data || datasetResponse.data.length === 0) {
            throw new Error("Page Facebook introuvable");
        }

        const data = datasetResponse.data[0];

        return {
            name: username,
            platform: 'facebook',
            subs: parseInt(data.followers) || parseInt(data.likes) || 0,
            views: Math.floor((parseInt(data.followers) || 0) * 0.2), 
            interactions: Math.floor((parseInt(data.followers) || 0) * 0.02)
        };

    } catch (err) {
        if (err.response && err.response.data) {
            console.error("Détail erreur Apify (FB):", err.response.data);
        }
        throw new Error(err.message.includes("Page Facebook") ? err.message : "Échec du scraping Facebook via Apify");
    }
}

// ==========================================
// OUTIL : Attendre qu'Apify termine son travail
// ==========================================
async function waitForApifyRun(runId, token) {
    // URL corrigée "actor-runs"
    const checkUrl = `https://api.apify.com/v2/actor-runs/${runId}?token=${token}`;
    let isFinished = false;
    let attempts = 0;

    // Attente maximum de ~45/50 secondes
    while (!isFinished && attempts < 16) { 
        await new Promise(resolve => setTimeout(resolve, 3000)); // Pause de 3 secondes
        const response = await axios.get(checkUrl);
        const status = response.data.data.status;
        
        if (status === 'SUCCEEDED') {
            isFinished = true;
        } else if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
            throw new Error("Le robot Apify a échoué en cours de route");
        }
        attempts++;
    }
    
    if (!isFinished) {
        throw new Error("Délai d'attente dépassé pour Apify");
    }
}

app.listen(PORT, () => {
    console.log(`✅ Serveur Aura Backend démarré sur le port ${PORT}`);
});
