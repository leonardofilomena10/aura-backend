// AURA ANALYST - BACKEND SERVEUR (MODE PRODUCTION AVANCÉ AVEC SCRAPING APIFY)

const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config(); 

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware pour autoriser ton Front-end à communiquer avec ce serveur
app.use(cors());
app.use(express.json());

// ==========================================
// CONFIGURATION DES CLÉS (Variables d'environnement)
// ==========================================
// Clé YouTube officielle (Google Cloud)
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

// Clé Apify (Pour scraper TikTok, Facebook, Insta...)
const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN;

// Route de vérification de santé du serveur
app.get('/', (req, res) => {
    res.json({ message: "Serveur Aura Analyst opérationnel 🚀 (Mode Scraping Apify Actif)" });
});

// Route principale appelée par le Front-end
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
// 1. FONCTION YOUTUBE (Garde l'API Officielle v3)
// ==========================================
async function getYouTubeStats(username) {
    if (!YOUTUBE_API_KEY) {
         throw new Error("Clé API YouTube manquante sur le serveur");
    }

    // Recherche de l'identifiant de la chaîne
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${username}&key=${YOUTUBE_API_KEY}`;
    const searchResponse = await axios.get(searchUrl);
    
    if (!searchResponse.data.items || searchResponse.data.items.length === 0) {
        throw new Error("Chaîne YouTube introuvable");
    }
    
    const channelId = searchResponse.data.items[0].snippet.channelId;

    // Récupération des statistiques réelles
    const statsUrl = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}&key=${YOUTUBE_API_KEY}`;
    const statsResponse = await axios.get(statsUrl);
    const channelStats = statsResponse.data.items[0].statistics;

    const subCount = parseInt(channelStats.subscriberCount) || 0;
    const totalViews = parseInt(channelStats.viewCount) || 0;
    const videoCount = parseInt(channelStats.videoCount) || 1;
    
    const avgViews = Math.floor(totalViews / videoCount);
    // Approximation de l'engagement global
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
// 2. FONCTION TIKTOK (Via le robot Apify)
// ==========================================
async function getTikTokStatsViaApify(username) {
    if (!APIFY_API_TOKEN) {
         throw new Error("Token Apify manquant (Nécessaire pour TikTok)");
    }

    // Identifiant de l'Actor Apify spécialisé dans TikTok
    const ACTOR_ID = "clockwork/tiktok-profile-scraper"; 
    
    const runUrl = `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${APIFY_API_TOKEN}`;
    
    // Nettoyage du pseudo (retire le @ s'il y en a un)
    const cleanUsername = username.replace('@', '');
    const profileUrl = `https://www.tiktok.com/@${cleanUsername}`;

    try {
        // 1. Démarrer le scraping
        const runResponse = await axios.post(runUrl, {
            profiles: [profileUrl]
        });

        const runId = runResponse.data.data.id;
        const datasetId = runResponse.data.data.defaultDatasetId;

        // 2. Attendre que le robot termine
        await waitForApifyRun(runId, APIFY_API_TOKEN);

        // 3. Récupérer les données
        const datasetUrl = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_API_TOKEN}`;
        const datasetResponse = await axios.get(datasetUrl);
        
        if (!datasetResponse.data || datasetResponse.data.length === 0) {
            throw new Error("Profil TikTok introuvable ou bloqué");
        }

        const data = datasetResponse.data[0];

        return {
            name: username,
            platform: 'tiktok',
            subs: parseInt(data.followers) || 0,
            // Estimation des vues totales basée sur les likes
            views: parseInt(data.likes) * 10 || 0, 
            interactions: parseInt(data.likes) || 0
        };

    } catch (err) {
        throw new Error("Échec du scraping TikTok via Apify");
    }
}

// ==========================================
// 3. FONCTION FACEBOOK (Via le robot Apify)
// ==========================================
async function getFacebookStatsViaApify(username) {
    if (!APIFY_API_TOKEN) {
         throw new Error("Token Apify manquant (Nécessaire pour Facebook)");
    }

    // Identifiant de l'Actor Apify spécialisé dans Facebook
    const ACTOR_ID = "apify/facebook-pages-scraper"; 
    const runUrl = `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${APIFY_API_TOKEN}`;
    
    const profileUrl = `https://www.facebook.com/${username}`;

    try {
        // 1. Démarrer le scraping
        const runResponse = await axios.post(runUrl, {
            startUrls: [{ url: profileUrl }]
        });

        const runId = runResponse.data.data.id;
        const datasetId = runResponse.data.data.defaultDatasetId;

        // 2. Attendre que le robot termine
        await waitForApifyRun(runId, APIFY_API_TOKEN);

        // 3. Récupérer les données
        const datasetUrl = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_API_TOKEN}`;
        const datasetResponse = await axios.get(datasetUrl);
        
        if (!datasetResponse.data || datasetResponse.data.length === 0) {
            throw new Error("Page Facebook introuvable ou inaccessible");
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
        throw new Error("Échec du scraping Facebook via Apify");
    }
}

// ==========================================
// OUTIL : Polling pour attendre la fin d'Apify
// ==========================================
async function waitForApifyRun(runId, token) {
    const checkUrl = `https://api.apify.com/v2/acts/runs/${runId}?token=${token}`;
    let isFinished = false;
    let attempts = 0;

    // Max 25 tentatives de 2 secondes = 50 secondes max d'attente (pour ne pas dépasser le timeout du front)
    while (!isFinished && attempts < 25) { 
        await new Promise(resolve => setTimeout(resolve, 2000)); 
        const response = await axios.get(checkUrl);
        const status = response.data.data.status;
        
        if (status === 'SUCCEEDED') {
            isFinished = true;
        } else if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
            throw new Error("Le robot Apify a échoué ou été bloqué");
        }
        attempts++;
    }
    
    if(!isFinished) {
        throw new Error("Temps d'attente du robot dépassé (Timeout)");
    }
}

// Démarrage du serveur
app.listen(PORT, () => {
    console.log(`✅ Serveur Aura Backend démarré sur le port ${PORT}`);
});
