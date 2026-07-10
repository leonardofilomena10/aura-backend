// AURA ANALYST - BACKEND SERVEUR (MODE PRODUCTION STRICT)

const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config(); 

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

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
            // Pas d'API connectée = on renvoie une vraie erreur, on ne simule plus
            return res.json({ success: false, error: "API TikTok non connectée" });
        } else if (platform === 'facebook') {
            // Pas d'API connectée = on renvoie une vraie erreur, on ne simule plus
            return res.json({ success: false, error: "API Facebook non connectée" });
        } else {
            return res.json({ success: false, error: "Plateforme non reconnue" });
        }

        res.json({ success: true, data: stats });

    } catch (error) {
        // S'il y a une erreur (ex: chaine introuvable), on renvoie l'erreur exacte au Front-end
        console.error(`Erreur pour ${username}:`, error.message);
        res.json({ success: false, error: error.message });
    }
});

async function getYouTubeStats(username) {
    if (!YOUTUBE_API_KEY) {
         throw new Error("Clé API YouTube non configurée sur le serveur");
    }

    // 1. Recherche de la chaine
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${username}&key=${YOUTUBE_API_KEY}`;
    const searchResponse = await axios.get(searchUrl);
    
    // SI LA CHAINE N'EXISTE PAS : on déclenche une vraie erreur
    if (!searchResponse.data.items || searchResponse.data.items.length === 0) {
        throw new Error("Chaîne introuvable");
    }
    
    const channelId = searchResponse.data.items[0].snippet.channelId;

    // 2. Statistiques réelles
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

app.listen(PORT, () => {
    console.log(`✅ Serveur Aura Backend démarré sur le port ${PORT}`);
});
