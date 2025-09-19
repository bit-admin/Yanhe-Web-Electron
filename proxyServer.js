const http = require('http');
const https = require('https');
const url = require('url');
const axios = require('axios');

class ProxyServer {
    constructor(intranetMapping) {
        this.server = null;
        this.port = 0;
        this.intranetMapping = intranetMapping;
    }

    async start() {
        if (this.server) {
            return this.port;
        }

        return new Promise((resolve, reject) => {
            this.server = http.createServer((req, res) => {
                this.handleRequest(req, res);
            });

            this.server.listen(0, 'localhost', () => {
                this.port = this.server.address().port;
                resolve(this.port);
            });

            this.server.on('error', (error) => {
                reject(error);
            });
        });
    }

    async handleRequest(req, res) {
        try {
            // Set CORS headers
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

            // Handle CORS preflight
            if (req.method === 'OPTIONS') {
                res.writeHead(200);
                res.end();
                return;
            }

            const parsedUrl = url.parse(req.url, true);
            let targetUrl = parsedUrl.query.url;

            // Handle relative paths for HLS segments
            if (!targetUrl && req.url.startsWith('/') && !req.url.startsWith('/?')) {
                // This is likely a relative path from HLS.js
                // We need to construct the full URL based on the last known base URL
                const relativePath = req.url.substring(1); // Remove leading slash

                // Try to construct URL based on common HLS patterns
                // For now, we'll assume it's from the same server as the last m3u8 request
                if (this.lastBaseUrl) {
                    const baseUrlObj = new URL(this.lastBaseUrl);
                    // Keep the same path structure as the m3u8 file
                    const basePath = baseUrlObj.pathname.substring(0, baseUrlObj.pathname.lastIndexOf('/') + 1);
                    targetUrl = `${baseUrlObj.protocol}//${baseUrlObj.host}${basePath}${relativePath}`;
                } else {
                    res.writeHead(400, { 'Content-Type': 'text/plain' });
                    res.end('Cannot resolve relative path without base URL');
                    return;
                }
            }

            if (!targetUrl) {
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                res.end('Missing target URL parameter');
                return;
            }

            // Ensure proper URL decoding
            try {
                // If the URL is still encoded, decode it
                if (targetUrl.includes('%')) {
                    targetUrl = decodeURIComponent(targetUrl);
                }
            } catch (decodeError) {
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                res.end('Invalid URL encoding: ' + decodeError.message);
                return;
            }

            // Store base URL for relative path resolution
            if (targetUrl.endsWith('.m3u8')) {
                this.lastBaseUrl = targetUrl;
            }

            // Validate target URL
            try {
                new URL(targetUrl);
            } catch (error) {
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                res.end('Invalid target URL: ' + error.message);
                return;
            }

            // Rewrite URL for intranet mode if needed
            const rewrittenUrl = this.intranetMapping.rewriteUrl(targetUrl);
            const originalHost = this.intranetMapping.getOriginalHost(targetUrl);

            // Prepare essential headers
            const headers = {};
            if (req.headers['accept']) {
                headers['Accept'] = req.headers['accept'];
            }
            if (req.headers['user-agent']) {
                headers['User-Agent'] = req.headers['user-agent'];
            }

            // Add original host header if URL was rewritten
            if (rewrittenUrl !== targetUrl && originalHost) {
                headers['Host'] = originalHost;
            }

            // Use axios for better compatibility
            const axiosConfig = {
                method: req.method.toLowerCase(),
                url: rewrittenUrl,
                headers: headers,
                responseType: 'stream',
                timeout: 30000, // 30 seconds timeout
                validateStatus: () => true, // Accept all status codes
            };

            // Disable SSL verification for internal IPs
            if (rewrittenUrl.startsWith('https://')) {
                axiosConfig.httpsAgent = new https.Agent({
                    rejectUnauthorized: false
                });
            }

            // Handle request body for POST/PUT requests
            if (req.method === 'POST' || req.method === 'PUT') {
                const chunks = [];
                req.on('data', chunk => chunks.push(chunk));
                req.on('end', async () => {
                    if (chunks.length > 0) {
                        axiosConfig.data = Buffer.concat(chunks);
                    }
                    await this.makeAxiosRequest(axiosConfig, res, rewrittenUrl, targetUrl);
                });
            } else {
                await this.makeAxiosRequest(axiosConfig, res, rewrittenUrl, targetUrl);
            }

        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal proxy error: ' + error.message);
        }
    }

    async makeAxiosRequest(axiosConfig, res, rewrittenUrl, targetUrl) {
        try {
            const response = await axios(axiosConfig);

            // Copy response headers
            Object.keys(response.headers).forEach(key => {
                res.setHeader(key, response.headers[key]);
            });

            res.writeHead(response.status);
            response.data.pipe(res);

        } catch (error) {
            // Mark IP as failed if it's a network error
            if (rewrittenUrl !== targetUrl) {
                try {
                    const rewrittenUrlObj = new URL(rewrittenUrl);
                    const originalUrlObj = new URL(targetUrl);
                    this.intranetMapping.markIPFailed(rewrittenUrlObj.hostname, originalUrlObj.hostname);
                } catch (e) {
                    // Silently ignore marking errors
                }
            }

            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Proxy error: ' + error.message);
        }
    }

    stop() {
        if (this.server) {
            this.server.close();
            this.server = null;
            this.port = 0;
        }
    }

    getPort() {
        return this.port;
    }
}

module.exports = ProxyServer;