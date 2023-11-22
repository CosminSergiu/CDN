const http = require('http');
const httpProxy = require('http-proxy');
const Redis = require('ioredis');
const zlib = require('zlib');

const proxy = httpProxy.createProxyServer({});
const backendServer = 'http://192.168.1.232:6789';
const client = new Redis();

client.on('connect', function() {
    console.log('Conectat la Redis');
});

function gracefulShutdown(signal) {
  console.log(`Received ${signal}. Shutting down gracefully.`);
  client.quit().then(() => {
    console.log('Redis client disconnected');
    process.exit(0);
  }).catch((err) => {
    console.error('Error while shutting down', err);
    process.exit(1);
  });
}

// Ascultă pentru evenimentele de închidere
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  gracefulShutdown('uncaughtException');
});

const server = http.createServer((req, res) => {

  proxy.on('error',(err, req, res)=>{
    console.error(`Eroare la conectare la serverul de origine: ${err.message}`);
    if(!res.finished){
      res.writeHead(502, {'Content-Type':'text/plain'});
      res.end('Nu s-a putut stabili conexiunea cu serverul de origine.')
    }
  });
  
  // Verifica daca clientul acceptă compresia gzip
  const acceptEncoding = req.headers['accept-encoding'];
  const canGzip = acceptEncoding && acceptEncoding.includes('gzip');

  if (req.url.match(/\.(png|jpg|jpeg|mp4|css|js)$/)) {
    client.get(req.url, (error, cachedData) => {
      console.log("Iau din baza de date");
      const cacheTime = req.url.match(/\.(png|jpg|jpeg|mp4)$/) ? 86400 : 7200; // 1 zi pentru imagini si video, 2 ore pentru restul
      if (error) throw error;

      if (cachedData != null) {
        let buffer = Buffer.from(cachedData, 'base64');
        if(canGzip){

          res.writeHead(200, { 'Cache-Control': `public, max-age=${cacheTime}`, 'Content-Encoding': 'gzip'});
          
          zlib.gzip(buffer, (err, gzipData) => {
            if (err) {
              res.end(buffer); // Trimite datele ne-comprimate în caz de eroare
            } else {
              res.end(gzipData);
            }
          });
        }else {
          res.writeHead(200, { 'Cache-Control': `public, max-age=${cacheTime}` });
          res.end(buffer);
        }
        
      } else {
        proxy.web(req, res, { target: backendServer, selfHandleResponse: true });
        console.log("Iau de la so");
        proxy.once('proxyRes', function(proxyRes, req, res) {
          let body = [];
          proxyRes.on('data', function(chunk) {
            body.push(chunk);
          });
          proxyRes.on('end', function() {
            const data = Buffer.concat(body).toString('base64');
            client.set(req.url, data, 'EX', 3600); // Stocarea datelor în Redis cu expirare
            console.log("Am stocat in bd");
            if (!res.finished) {
              res.writeHead(proxyRes.statusCode, { ...proxyRes.headers, 'Cache-Control': `public, max-age=${cacheTime}` }); 
              res.end(Buffer.from(data, 'base64'));
            }
          });
        });
      }
    });
  } else {
    proxy.web(req, res, { target: backendServer });
  }
});

server.listen(6788, '192.168.1.232', () => {
  console.log('Serverul proxy rulează pe portul 6788');
});
