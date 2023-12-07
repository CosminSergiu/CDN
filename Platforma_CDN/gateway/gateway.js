const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const requestIp = require('request-ip');
const axios = require('axios');


const app = express();

const edgeServers = [
    { url: 'http://192.168.1.232:6788', latitude: 53.339688, longitude: -6.236688 }
];
const originServers = [
    {url: 'http://192.168.1.232:6789' , latitude: 53.339688, longitude: -6.236688}
]

function calculateDistance(lat1, lon1, lat2, lon2) {
    const earthRadius = 6371; // Raza Pamantului km

    // Convertim gradele în radiani
    const radiansLat1 = (lat1 * Math.PI) / 180;
    const radiansLon1 = (lon1 * Math.PI) / 180;
    const radiansLat2 = (lat2 * Math.PI) / 180;
    const radiansLon2 = (lon2 * Math.PI) / 180;

    // Dif dintre latitudini si longitudini
    const dLat = radiansLat2 - radiansLat1;
    const dLon = radiansLon2 - radiansLon1;

    // Formula Haversine
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(radiansLat1) * Math.cos(radiansLat2) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    // Calculam dist
    const distance = earthRadius * c;

    return distance;
}


async function selectEdgeServer(clientIP) {
    console.log(clientIP);
    const geoServiceUrl = `https://ipinfo.io/${clientIP}/geo`;
    const response = await axios.get(geoServiceUrl);
    const { loc } = response.data;
    let [clientLatitude ,clientLongitude] = loc.split(',');
    console.log(clientLatitude);
   
    let server = edgeServers[0];
    let minDistance = Infinity;

    for( let s of edgeServers){
        const distance = calculateDistance(clientLatitude, clientLongitude, s.latitude, s.longitude);
        if(distance<minDistance){
            minDistance = distance;
            server = s;
        }
    }
    if(server != null)
        return server.url;
    else{
        const err = new Error('Server err');
        err.statusCode = 500;
        throw err;
    }
}

// redirectionam cererea catre serverul edge 
app.use(async (req, res, next) => {
    const edgeServerUrl = await selectEdgeServer(req.connection.remoteAddress);
    if (!edgeServerUrl) {
            throw new Error('Server edge nu a fost găsit');
        }
    const proxy = createProxyMiddleware({
        target: edgeServerUrl,
        changeOrigin: true,
        pathRewrite: {
            '^/': '', // rescrie calea dacă este necesar
        },
        onProxyRes: function (proxyRes, req, res) {
          
        }
    });
    proxy(req, res, next);
});

const PORT = 6787;

app.listen(PORT, '192.168.1.232', () => console.log('Gateway ruleaza pe 192.168.1.232:6787'));