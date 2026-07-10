// AURA ANALYST - BACKEND SERVEUR (MODE PRODUCTION STRICT)

const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config(); 

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Récupération de toutes les clés API depuis l'environnement (Render ou fichier .env local)
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const TIKTOK_ACCESS_TOKEN = process.env.TIKTOK_ACCESS_TOKEN;
const FACEBOOK_ACCESS_TOKEN = process.env.FACEBOOK_ACCESS_TOKEN;

app.get('/', (req, res) => {
    res.json({ message: "Serveur Aura Analyst opérationnel 🚀 (Production)" });
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
            stats = await getTikTokStats(username);
        } else if (platform === 'facebook') {
            stats = await getFacebookStats(username);
        } else {
            return res.json({ success: false, error: "Plateforme non reconnue" });
        }

        res.json({ success: true, data: stats });

    } catch (error) {
        // S'il y a une erreur (ex: chaine introuvable), on renvoie l'erreur exacte au Front-end
        console.error(`Erreur pour ${username} sur ${platform}:`, error.message);
        res.json({ success: false, error: error.message });
    }
});

// ==========================================
// 1. FONCTION YOUTUBE (Data API v3)
// ==========================================
async function getYouTubeStats(username) {
    if (!YOUTUBE_API_KEY) {
         throw new Error("Clé API YouTube non configurée sur le serveur");
    }

    // Recherche de la chaine
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${username}&key=${YOUTUBE_API_KEY}`;
    const searchResponse = await axios.get(searchUrl);
    
    // SI LA CHAINE N'EXISTE PAS : on déclenche une vraie erreur
    if (!searchResponse.data.items || searchResponse.data.items.length === 0) {
        throw new Error("Chaîne YouTube introuvable");
    }
    
    const channelId = searchResponse.data.items[0].snippet.channelId;

    // Statistiques réelles
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
// 2. FONCTION TIKTOK (Graph API v2)
// ==========================================
async function getTikTokStats(username) {
    if (!TIKTOK_ACCESS_TOKEN) {
         throw new Error("Token API TikTok non configuré sur le serveur");
    }

    try {
        // L'API officielle de TikTok nécessite des autorisations OAuth strictes
        // Voici la structure d'un appel standard pour récupérer les infos publiques
        const url = `https://open.tiktokapis.com/v2/user/info/?fields=follower_count,likes_count,video_count`;
        const response = await axios.get(url, {
            headers: { 
                'Authorization': `Bearer ${TIKTOK_ACCESS_TOKEN}`
            }
        });

        const data = response.data.data.user;

        return {
            name: username,
            platform: 'tiktok',
            subs: data.follower_count || 0,
            views: (data.likes_count || 0) * 10, // Approximation du volume global
            interactions: data.likes_count || 0
        };
    } catch (err) {
        throw new Error("Compte TikTok introuvable ou Token d'accès invalide");
    }
}

// ==========================================
// 3. FONCTION FACEBOOK (Graph API v19.0)
// ==========================================
async function getFacebookStats(username) {
    if (!FACEBOOK_ACCESS_TOKEN) {
         throw new Error("Token API Facebook non configuré sur le serveur");
    }

    try {
        // L'API Facebook Graph pour récupérer les statistiques d'une page publique
        const url = `https://graph.facebook.com/v19.0/${username}?fields=followers_count,fan_count,engagement&access_token=${FACEBOOK_ACCESS_TOKEN}`;
        const response = await axios.get(url);

        const data = response.data;

        return {
            name: username,
            platform: 'facebook',
            subs: data.followers_count || data.fan_count || 0,
            views: Math.floor((data.followers_count || 0) * 0.2), // Estimation de la portée organique (~20%)
            interactions: data.engagement ? data.engagement.count : Math.floor((data.followers_count || 0) * 0.02)
        };
    } catch (err) {
        throw new Error("Page Facebook introuvable ou Token d'accès invalide");
    }
}

app.listen(PORT, () => {
    console.log(`✅ Serveur Aura Backend démarré sur le port ${PORT}`);
});
