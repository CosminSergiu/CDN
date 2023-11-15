const http = require('http');
const httpProxy = require('http-proxy');
const flatCache = require('flat-cache');

const proxy = httpProxy.createProxyServer({});
const cache = flatCache.load('siteCache', './cache');
const backendServer = 'http://192.168.1.232:6789';

const server = http.createServer((req, res) => {
  if (req.url.match(/\.(png|jpg|jpeg|mp4|css|js)$/)) {
    const cachedData = cache.getKey(req.url);
    if (cachedData) {
      res.writeHead(200, { 'Cache-Control': 'public, max-age=3600' });
      res.end(Buffer.from(cachedData, 'base64'));
    } else {
      proxy.web(req, res, { target: backendServer, selfHandleResponse: true });

      proxy.once('proxyRes', function(proxyRes, req, res) {
        let body = [];
        proxyRes.on('data', function(chunk) {
          body.push(chunk);
        });
        proxyRes.on('end', function() {
          const data = Buffer.concat(body).toString('base64');
          cache.setKey(req.url, data);
          cache.save(true);
          if (!res.finished) {
            res.writeHead(proxyRes.statusCode, { ...proxyRes.headers, 'Cache-Control': 'public, max-age=3600' }); 
            res.end(Buffer.from(data, 'base64'));
          }
        });
      });
    }
  } else {
    proxy.web(req, res, { target: backendServer });
  }
});

server.listen(6788, '192.168.1.232', () => {
  console.log('Serverul proxy rulează pe portul 6788');
});
