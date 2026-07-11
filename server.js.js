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
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
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
        // Log simplifié pour la lisibilité sur Render
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
// 2. FONCTION TIKTOK (Apify)
// ==========================================
async function getTikTokStatsViaApify(username) {
    if (!APIFY_API_TOKEN) {
         throw new Error("Token Apify manquant (Nécessaire pour TikTok)");
    }

    // CRITIQUE : Utilisation du Tilde (~) et non du Slash (/) pour l'API
    const ACTOR_ID = "clockworks~tiktok-profile-scraper"; 
    const runUrl = `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${APIFY_API_TOKEN}`;
    
    // On enlève le @ s'il y en a un
    const cleanUsername = username.replace('@', '');

    try {
        const runResponse = await axios.post(runUrl, {
            profiles: [cleanUsername]
        });

        const runId = runResponse.data.data.id;
        const datasetId = runResponse.data.data.defaultDatasetId;

        // Attente de la fin du robot (Max 40 secondes)
        await waitForApifyRun(runId, APIFY_API_TOKEN);

        const datasetUrl = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_API_TOKEN}`;
        const datasetResponse = await axios.get(datasetUrl);
        
        if (!datasetResponse.data || datasetResponse.data.length === 0) {
            throw new Error("Profil TikTok introuvable (Ou bloqué par captcha)");
        }

        const data = datasetResponse.data[0];

        return {
            name: username,
            platform: 'tiktok',
            subs: parseInt(data.followers) || 0,
            views: parseInt(data.likes) * 10 || 0, // Approximation
            interactions: parseInt(data.likes) || 0
        };

    } catch (err) {
        // En cas de crash technique Apify, on log la vraie raison
        if (err.response && err.response.data) {
             console.error("Crash APIFY (TikTok):", err.response.data);
        }
        throw new Error(err.message.includes("Profil TikTok") ? err.message : "Échec du scraping TikTok via Apify");
    }
}

// ==========================================
// 3. FONCTION FACEBOOK (Apify)
// ==========================================
async function getFacebookStatsViaApify(username) {
    if (!APIFY_API_TOKEN) {
         throw new Error("Token Apify manquant (Nécessaire pour Facebook)");
    }

    // CRITIQUE : Utilisation du Tilde (~) 
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
            console.error("Crash APIFY (FB):", err.response.data);
       }
        throw new Error(err.message.includes("Page Facebook") ? err.message : "Échec du scraping Facebook via Apify");
    }
}

// ==========================================
// OUTIL : Attendre qu'Apify termine son travail
// ==========================================
async function waitForApifyRun(runId, token) {
    const checkUrl = `https://api.apify.com/v2/acts/runs/${runId}?token=${token}`;
    let isFinished = false;
    let attempts = 0;

    // Le front-end a un timeout de 60s, ici on arrête d'attendre au bout de ~45s (15 * 3s)
    while (!isFinished && attempts < 15) { 
        await new Promise(resolve => setTimeout(resolve, 3000)); 
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
        throw new Error("Apify a pris trop de temps (Timeout)");
    }
}

app.listen(PORT, () => {
    console.log(`✅ Serveur Aura Backend démarré sur le port ${PORT}`);
});
