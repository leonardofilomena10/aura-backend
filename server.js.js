// AURA ANALYST - BACKEND SERVEUR
// Ce fichier doit s'appeler 'server.js'

const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config(); // Permet de lire le fichier .env caché

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
// CORS permet à ton Front-end (ton HTML) de communiquer avec ce serveur Back-end
app.use(cors());
app.use(express.json());

// ==========================================
// CONFIGURATION DES CLÉS API (Cachées dans le .env)
// ==========================================
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
// Note: TikTok et Facebook nécessitent des processus OAuth plus complexes,
// on prépare l'architecture ici pour quand tu auras tes accès développeur officiels.
const TIKTOK_ACCESS_TOKEN = process.env.TIKTOK_ACCESS_TOKEN; 
const FACEBOOK_ACCESS_TOKEN = process.env.FACEBOOK_ACCESS_TOKEN;

// ==========================================
// ROUTES DE L'API AURA
// ==========================================

// Route de test pour vérifier que le serveur tourne
app.get('/', (req, res) => {
    res.json({ message: "Serveur Aura Analyst opérationnel 🚀" });
});

// Route principale pour analyser un influenceur
// Le front-end enverra: { "username": "squeezie", "platform": "youtube" }
app.post('/api/analyze', async (req, res) => {
    const { username, platform } = req.body;

    if (!username || !platform) {
        return res.status(400).json({ error: "Veuillez fournir un username et une platform" });
    }

    try {
        let stats = null;

        if (platform === 'youtube') {
            stats = await getYouTubeStats(username);
        } else if (platform === 'tiktok') {
            // stats = await getTikTokStats(username); // À décommenter quand l'API sera prête
            stats = getSimulatedStats(username, 'tiktok'); // En attendant
        } else if (platform === 'facebook') {
            // stats = await getFacebookStats(username); // À décommenter quand l'API sera prête
            stats = getSimulatedStats(username, 'facebook'); // En attendant
        } else {
            return res.status(400).json({ error: "Plateforme non supportée" });
        }

        res.json({
            success: true,
            data: stats
        });

    } catch (error) {
        console.error(`Erreur lors de l'analyse de ${username}:`, error.message);
        res.status(500).json({ success: false, error: "Erreur lors de la récupération des données" });
    }
});

// ==========================================
// FONCTIONS DE FETCH VERS LES RÉSEAUX SOCIAUX
// ==========================================

// Fonction réelle pour YouTube Data API v3
async function getYouTubeStats(username) {
    if (!YOUTUBE_API_KEY) {
         throw new Error("Clé API YouTube manquante dans le serveur");
    }

    // 1. D'abord, on cherche l'ID de la chaine à partir du username
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${username}&key=${YOUTUBE_API_KEY}`;
    const searchResponse = await axios.get(searchUrl);
    
    if (!searchResponse.data.items || searchResponse.data.items.length === 0) {
        throw new Error("Chaîne YouTube introuvable");
    }
    
    const channelId = searchResponse.data.items[0].snippet.channelId;

    // 2. Ensuite, on récupère les vraies statistiques de cette chaîne
    const statsUrl = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}&key=${YOUTUBE_API_KEY}`;
    const statsResponse = await axios.get(statsUrl);
    const channelStats = statsResponse.data.items[0].statistics;

    // L'API YT donne les vues totales et les vidéos totales. 
    // Pour estimer les "interactions" et "vues moyennes" récentes, on fait une approximation mathématique
    // (Pour être précis à 100%, il faudrait fetcher les 10 dernières vidéos, mais cela coûte beaucoup de quota API)
    const subCount = parseInt(channelStats.subscriberCount) || 0;
    const totalViews = parseInt(channelStats.viewCount) || 0;
    const videoCount = parseInt(channelStats.videoCount) || 1;
    
    const avgViews = Math.floor(totalViews / videoCount);
    const estimatedInteractions = Math.floor(avgViews * 0.05); // Estimation: 5% d'engagement par vidéo

    return {
        name: username,
        platform: 'youtube',
        subs: subCount,
        views: avgViews,
        interactions: estimatedInteractions
    };
}

// Fonction de simulation pour TikTok / Facebook en attendant l'accès officiel
function getSimulatedStats(username, platform) {
    let baseMultiplier = (username.length * 100000) + Math.floor(Math.random() * 500000);
    let subs, views, interactions;
    
    if (platform === 'tiktok') {
        subs = baseMultiplier * 5; 
        views = subs * (Math.random() * 1.5 + 0.2); 
        interactions = views * (Math.random() * 0.08 + 0.02);
    } else { 
        subs = baseMultiplier * 1.5;
        views = subs * (Math.random() * 0.3 + 0.05);
        interactions = views * (Math.random() * 0.03 + 0.005);
    }

    return {
        name: username,
        platform: platform,
        subs: Math.floor(subs),
        views: Math.floor(views),
        interactions: Math.floor(interactions)
    };
}

// Démarrage du serveur
app.listen(PORT, () => {
    console.log(`✅ Serveur Aura Backend démarré sur le port ${PORT}`);
});