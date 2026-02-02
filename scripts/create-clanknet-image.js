#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const IPFSUploader = require('../core/ipfs-uploader');

/**
 * Generate CLANKNET network token image
 */
async function createClanknetImage() {
    console.log('🎨 Creating CLANKNET logo...');

    const size = 400;
    const svg = `
        <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="networkGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#ff6b6b;stop-opacity:1" />
                    <stop offset="50%" style="stop-color:#4ecdc4;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#45b7d1;stop-opacity:1" />
                </linearGradient>
                <filter id="glow">
                    <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
                    <feMerge>
                        <feMergeNode in="coloredBlur"/>
                        <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                </filter>
            </defs>

            <!-- Background circle -->
            <circle cx="200" cy="200" r="190" fill="url(#networkGrad)" stroke="white" stroke-width="4"/>

            <!-- Network nodes (representing connected agents) -->
            <circle cx="120" cy="120" r="15" fill="white" opacity="0.9"/>
            <circle cx="280" cy="120" r="15" fill="white" opacity="0.9"/>
            <circle cx="200" cy="80" r="15" fill="white" opacity="0.9"/>
            <circle cx="320" cy="200" r="15" fill="white" opacity="0.9"/>
            <circle cx="280" cy="280" r="15" fill="white" opacity="0.9"/>
            <circle cx="120" cy="280" r="15" fill="white" opacity="0.9"/>
            <circle cx="80" cy="200" r="15" fill="white" opacity="0.9"/>

            <!-- Connection lines -->
            <line x1="120" y1="120" x2="200" y2="80" stroke="white" stroke-width="2" opacity="0.7"/>
            <line x1="200" y1="80" x2="280" y2="120" stroke="white" stroke-width="2" opacity="0.7"/>
            <line x1="280" y1="120" x2="320" y2="200" stroke="white" stroke-width="2" opacity="0.7"/>
            <line x1="320" y1="200" x2="280" y2="280" stroke="white" stroke-width="2" opacity="0.7"/>
            <line x1="280" y1="280" x2="120" y2="280" stroke="white" stroke-width="2" opacity="0.7"/>
            <line x1="120" y1="280" x2="80" y2="200" stroke="white" stroke-width="2" opacity="0.7"/>
            <line x1="80" y1="200" x2="120" y2="120" stroke="white" stroke-width="2" opacity="0.7"/>

            <!-- Center hub -->
            <circle cx="200" cy="200" r="25" fill="white" filter="url(#glow)"/>

            <!-- CLANKNET text -->
            <text x="200" y="175" font-family="monospace, sans-serif" font-size="32" font-weight="bold"
                  fill="#2c3e50" text-anchor="middle">CLANKNET</text>
            <text x="200" y="205" font-family="monospace, sans-serif" font-size="14"
                  fill="#2c3e50" text-anchor="middle">AGENT NETWORK</text>
            <text x="200" y="225" font-family="monospace, sans-serif" font-size="12"
                  fill="#2c3e50" text-anchor="middle">POWERED BY CLANKER</text>
        </svg>
    `;

    try {
        // Convert SVG to PNG
        const buffer = await sharp(Buffer.from(svg))
            .png()
            .toBuffer();

        // Save locally
        const imagePath = path.join(process.cwd(), 'assets', 'clanknet-logo.png');
        await fs.mkdir(path.dirname(imagePath), { recursive: true });
        await fs.writeFile(imagePath, buffer);

        console.log('✅ Logo saved locally:', imagePath);

        // Upload to IPFS
        const uploader = new IPFSUploader();
        const ipfsUrl = await uploader.uploadImage(buffer, 'clanknet-logo.png');

        console.log('🌍 IPFS URL:', ipfsUrl);

        // Save IPFS URL for easy access
        const urlFile = path.join(process.cwd(), 'assets', 'clanknet-ipfs-url.txt');
        await fs.writeFile(urlFile, ipfsUrl);

        console.log('📌 IPFS URL saved to:', urlFile);

        return {
            localPath: imagePath,
            ipfsUrl: ipfsUrl
        };

    } catch (error) {
        console.error('❌ Failed to create image:', error.message);
        throw error;
    }
}

// Run if called directly
if (require.main === module) {
    createClanknetImage()
        .then(result => {
            console.log('🎉 CLANKNET logo created successfully!');
            console.log('Use this IPFS URL in your @clanker post:', result.ipfsUrl);
        })
        .catch(console.error);
}

module.exports = createClanknetImage;