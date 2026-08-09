// importing necessary modules
const router = require("express").Router();
const fetch = require("node-fetch");
const https = require("https");
const os = require('os');

// bypass ssl
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// Simple in-memory cache
const responseCache = new Map();

// Cache expiration time (1 hour in milliseconds)
const CACHE_EXPIRATION = 60 * 60 * 1000;

// Function to check system memory usage
const checkMemoryUsage = () => {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemoryPercentage = ((totalMemory - freeMemory) / totalMemory) * 100;
    
    console.log(`Memory usage: ${usedMemoryPercentage.toFixed(2)}%`);
    
    // If memory usage exceeds 80%, clear all cache
    if (usedMemoryPercentage > 80) {
        console.log('Memory usage exceeds 80%, clearing all cache...');
        responseCache.clear();
    }
    
    return usedMemoryPercentage;
};

// Function to clean expired cache entries
const cleanExpiredCache = () => {
    // Then clean expired entries if we still have cache
    const now = Date.now();
    for (const [key, entry] of responseCache.entries()) {
        if (now > entry.expiry) {
            responseCache.delete(key);
        }
    }
};

// Run cache cleanup every 5 minutes
setInterval(cleanExpiredCache, 5 * 60 * 1000);

const blacklist = ["samurai_lps.xml","golem_of_lago.xml","mario_smh.xml","hta_weapon.xml","alucard.xml","buster_ic.xml","sonic_ic.xml","cat_ic.xml"];

// setting the route
router.get("/:ip/cache/*", async (req, res, next) => {
    // check if ip is an ip
    if (!req.params.ip.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
        return next();
    }

    try {
        const originalUrl = req.originalUrl;
        const isBlacklisted = blacklist.some(item => originalUrl.includes(item));
        
        if (isBlacklisted) {
            console.log(`Blocked blacklisted URL: ${originalUrl}`);
            return res.status(404).send('Access Denied');
        }
        // Check memory usage before processing
        checkMemoryUsage();

        // Create cache key from request URL and method
        const cacheKey = `${req.method}:${req.originalUrl}`;
        
        // Check if we have a cached response
        if (responseCache.has(cacheKey)) {
            const cachedResponse = responseCache.get(cacheKey);
            const now = Date.now();
            
            // If cache is still valid
            if (now < cachedResponse.expiry) {
                console.log(`Cache hit for: ${cacheKey}`);
                
                // Set status and headers from cached response
                res.status(cachedResponse.status);
                for (const [key, value] of Object.entries(cachedResponse.headers)) {
                    res.setHeader(key, value);
                }
                
                // Send cached body
                res.send(cachedResponse.body);
                return;
            } else {
                // Remove expired cache entry
                responseCache.delete(cacheKey);
            }
        }

        delete req.headers['content-length'];
        delete req.headers['transfer-encoding'];
        req.headers.host = 'www.growtopia1.com';

        const agent = new https.Agent({
            rejectUnauthorized: false,
        });

        const options = {
            method: req.method,
            headers: req.headers,
            agent: agent,
        };

        if (req.method === 'POST' || req.method === 'PUT') {
            let bodyData = '';
            req.on('data', chunk => {
                bodyData += chunk.toString();
            });
            
            await new Promise(resolve => {
                req.on('end', () => {
                    if (bodyData) {
                        options.body = bodyData;
                    }
                    resolve();
                });
            });
        }

        const response = await fetch('https:/' + req.originalUrl, options);
        
        // Prepare response headers
        const responseHeaders = {};
        for (const [key, value] of response.headers) {
            // Skip problematic headers
            if (key.toLowerCase() !== 'content-length' && 
                key.toLowerCase() !== 'transfer-encoding') {
                responseHeaders[key] = value;
                res.setHeader(key, value);
            }
        }
        
        res.status(response.status);
        
        // Get response body as buffer for caching
        const responseBody = await response.buffer();
        
        // Store in cache with expiration time
        if (response.status === 200) {
            responseCache.set(cacheKey, {
                status: response.status,
                headers: responseHeaders,
                body: responseBody,
                expiry: Date.now() + CACHE_EXPIRATION
            }); 
        }
        
        // Send response to client
        res.send(responseBody);
        
    } catch (error) {
        console.error('Error:', error);
        res.status(200).send('Internal Server Error');
    }
});

// exporting the router
module.exports = router;
