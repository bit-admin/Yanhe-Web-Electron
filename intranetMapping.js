// Intranet Mapping Manager for RUC Learn Electron App
class IntranetMappingManager {
    constructor() {
        // Support both single IP and load balancing configurations
        this.mappings = {
            'cbiz.yanhekt.cn': {
                type: 'loadbalance',
                ips: ['10.0.34.22', '10.0.34.21'],
                strategy: 'round_robin',
                currentIndex: 0
            },
            // Live streaming servers with load balancing
            'clive8.yanhekt.cn': {
                type: 'loadbalance',
                ips: ['10.1.233.208', '10.1.233.201', '10.1.233.210', '10.1.233.207', '10.1.233.209', '10.1.233.206'],
                strategy: 'round_robin',
                currentIndex: 0
            },
            'clive9.yanhekt.cn': {
                type: 'loadbalance',
                ips: ['10.1.233.206', '10.1.233.207', '10.1.233.210', '10.1.233.208', '10.1.233.209', '10.1.233.201'],
                strategy: 'round_robin',
                currentIndex: 0
            },
            'clive10.yanhekt.cn': {
                type: 'loadbalance',
                ips: ['10.1.233.209', '10.1.233.208', '10.1.233.210', '10.1.233.207', '10.1.233.201', '10.1.233.206'],
                strategy: 'round_robin',
                currentIndex: 0
            },
            'clive11.yanhekt.cn': {
                type: 'loadbalance',
                ips: ['10.1.233.210', '10.1.233.207', '10.1.233.208', '10.1.233.209', '10.1.233.201', '10.1.233.206'],
                strategy: 'round_robin',
                currentIndex: 0
            },
            'clive12.yanhekt.cn': {
                type: 'loadbalance',
                ips: ['10.1.233.208', '10.1.233.209', '10.1.233.201', '10.1.233.206', '10.1.233.210', '10.1.233.207'],
                strategy: 'round_robin',
                currentIndex: 0
            },
            'clive13.yanhekt.cn': {
                type: 'loadbalance',
                ips: ['10.1.233.210', '10.1.233.207', '10.1.233.209', '10.1.233.206', '10.1.233.208', '10.1.233.201'],
                strategy: 'round_robin',
                currentIndex: 0
            },
            'clive14.yanhekt.cn': {
                type: 'single',
                ip: '10.0.34.207'
            },
            'clive15.yanhekt.cn': {
                type: 'single',
                ip: '10.0.34.208'
            },
            // Recorded video server
            'cvideo.yanhekt.cn': {
                type: 'single',
                ip: '10.0.34.24'
            }
        };
        this.enabled = false;
        this.failedIPs = new Map(); // Track failed IPs for health checking
    }

    /**
     * Enable or disable intranet mode
     * @param {boolean} enabled - Whether intranet mode is enabled
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        console.log(`Intranet mode ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Check if intranet mode is enabled
     * @returns {boolean} Whether intranet mode is enabled
     */
    isEnabled() {
        return this.enabled;
    }

    /**
     * Get IP mapping for a specific domain (handles load balancing)
     * @param {string} domain - The domain to look up
     * @returns {string|null} The mapped IP address or null if not found
     */
    getMapping(domain) {
        const mapping = this.mappings[domain];
        if (!mapping) return null;

        if (mapping.type === 'single') {
            return mapping.ip;
        } else if (mapping.type === 'loadbalance') {
            return this.getLoadBalancedIP(domain, mapping);
        }

        return null;
    }

    /**
     * Get load balanced IP using the specified strategy
     * @param {string} domain - The domain name
     * @param {Object} mapping - The load balance mapping configuration
     * @returns {string} The selected IP address
     */
    getLoadBalancedIP(domain, mapping) {
        const { ips, strategy = 'round_robin' } = mapping;

        if (!ips || ips.length === 0) {
            console.warn(`No IPs available for load balancing domain: ${domain}`);
            return null;
        }

        // Filter out failed IPs
        const availableIPs = ips.filter(ip => !this.isIPFailed(ip));
        if (availableIPs.length === 0) {
            console.warn(`All IPs failed for domain: ${domain}, using original list`);
            // Reset failed IPs and use original list
            this.clearFailedIPs(domain);
            return this.selectIPByStrategy(ips, strategy, mapping);
        }

        return this.selectIPByStrategy(availableIPs, strategy, mapping);
    }

    /**
     * Select IP based on load balancing strategy
     * @param {Array} ips - Available IP addresses
     * @param {string} strategy - Load balancing strategy
     * @param {Object} mapping - The mapping configuration
     * @returns {string} Selected IP address
     */
    selectIPByStrategy(ips, strategy, mapping) {
        switch (strategy) {
            case 'round_robin':
                const ip = ips[mapping.currentIndex % ips.length];
                mapping.currentIndex = (mapping.currentIndex + 1) % ips.length;
                return ip;

            case 'random':
                return ips[Math.floor(Math.random() * ips.length)];

            case 'first_available':
                return ips[0];

            default:
                console.warn(`Unknown load balancing strategy: ${strategy}, using round_robin`);
                return this.selectIPByStrategy(ips, 'round_robin', mapping);
        }
    }

    /**
     * Validate IP address format
     * @param {string} ip - IP address to validate
     * @returns {boolean} Whether the IP address is valid
     */
    isValidIP(ip) {
        const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        return ipRegex.test(ip);
    }

    /**
     * Mark an IP as failed for health checking
     * @param {string} ip - The IP address that failed
     * @param {string} domain - The domain it belongs to
     */
    markIPFailed(ip, domain) {
        const key = `${domain}:${ip}`;
        this.failedIPs.set(key, {
            failedAt: Date.now(),
            domain: domain,
            ip: ip
        });
        console.warn(`Marked IP as failed: ${ip} for domain: ${domain}`);
    }

    /**
     * Check if an IP is marked as failed
     * @param {string} ip - The IP address to check
     * @returns {boolean} Whether the IP is failed
     */
    isIPFailed(ip) {
        for (const [key, failInfo] of this.failedIPs.entries()) {
            if (failInfo.ip === ip) {
                // Auto-recover after 5 minutes
                if (Date.now() - failInfo.failedAt > 5 * 60 * 1000) {
                    this.failedIPs.delete(key);
                    console.log(`Auto-recovered failed IP: ${ip}`);
                    return false;
                }
                return true;
            }
        }
        return false;
    }

    /**
     * Clear failed IPs for a specific domain
     * @param {string} domain - The domain to clear failed IPs for
     */
    clearFailedIPs(domain) {
        for (const [key, failInfo] of this.failedIPs.entries()) {
            if (failInfo.domain === domain) {
                this.failedIPs.delete(key);
            }
        }
        console.log(`Cleared failed IPs for domain: ${domain}`);
    }

    /**
     * Rewrite URL for intranet mode if enabled
     * @param {string} url - Original URL
     * @returns {string} Rewritten URL or original URL if not mapped
     */
    rewriteUrl(url) {
        if (!this.enabled) {
            return url;
        }

        try {
            const urlObj = new URL(url);
            const mappedIP = this.getMapping(urlObj.hostname);

            if (mappedIP) {
                console.log(`Rewriting URL: ${urlObj.hostname} -> ${mappedIP}`);
                urlObj.hostname = mappedIP;
                return urlObj.toString();
            }
        } catch (error) {
            console.error('Error rewriting URL:', error);
        }

        return url;
    }

    /**
     * Get the original host header for a URL
     * @param {string} originalUrl - The original URL before rewriting
     * @returns {string|null} The original hostname or null
     */
    getOriginalHost(originalUrl) {
        try {
            const urlObj = new URL(originalUrl);
            return urlObj.hostname;
        } catch (error) {
            console.error('Error parsing original URL:', error);
            return null;
        }
    }

    /**
     * Get network status information
     * @returns {Object} Network status with mode and description
     */
    getNetworkStatus() {
        return {
            mode: this.enabled ? 'intranet' : 'internet',
            enabled: this.enabled,
            mappingCount: Object.keys(this.mappings).length,
            mappings: this.mappings
        };
    }
}

module.exports = IntranetMappingManager;