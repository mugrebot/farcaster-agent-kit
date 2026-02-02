#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function pinImageToIPFS() {
    console.log('📌 Pinning CLANKIT image to IPFS');
    console.log('================================');

    const imagePath = path.join(process.cwd(), 'assets', 'clankit-logo.png');

    // Check if image exists
    if (!fs.existsSync(imagePath)) {
        console.error('❌ Image not found at:', imagePath);
        console.log('   Put your CLANKIT logo at: assets/clankit-logo.png');
        process.exit(1);
    }

    // Check if IPFS is installed
    try {
        execSync('ipfs --version', { stdio: 'ignore' });
    } catch (e) {
        console.error('❌ IPFS not installed');
        console.log('   Install IPFS: https://docs.ipfs.tech/install/');
        console.log('   Or use IPFS Desktop: https://github.com/ipfs/ipfs-desktop');
        process.exit(1);
    }

    // Check if IPFS daemon is running
    try {
        execSync('ipfs id', { stdio: 'ignore' });
    } catch (e) {
        console.error('❌ IPFS daemon not running');
        console.log('   Start IPFS daemon: ipfs daemon');
        console.log('   Or open IPFS Desktop');
        process.exit(1);
    }

    try {
        console.log('📤 Adding image to IPFS...');

        // Add image to IPFS
        const addResult = execSync(`ipfs add "${imagePath}"`, { encoding: 'utf8' });
        const hash = addResult.trim().split(' ')[1]; // Extract hash from "added QmXXX filename"

        console.log(`✅ Image added to IPFS: ${hash}`);

        // Pin the image
        console.log('📌 Pinning image...');
        execSync(`ipfs pin add ${hash}`, { stdio: 'ignore' });
        console.log('✅ Image pinned successfully');

        // Create IPFS URL
        const ipfsUrl = `ipfs://${hash}`;
        console.log(`🔗 IPFS URL: ${ipfsUrl}`);

        // Save to config file
        const config = {
            imageHash: hash,
            ipfsUrl: ipfsUrl,
            pinnedAt: new Date().toISOString(),
            filename: 'clankit-logo.png'
        };

        const configPath = path.join(process.cwd(), 'data', 'ipfs_config.json');

        // Ensure data directory exists
        const dataDir = path.dirname(configPath);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log('💾 Config saved to:', configPath);

        console.log('\n🌐 Public IPFS Gateways:');
        console.log(`   https://ipfs.io/ipfs/${hash}`);
        console.log(`   https://gateway.pinata.cloud/ipfs/${hash}`);
        console.log(`   https://cloudflare-ipfs.com/ipfs/${hash}`);

        console.log('\n✅ Image ready for token launch!');
        console.log('   Run: npm run launch-network-token');

        return { hash, ipfsUrl };

    } catch (error) {
        console.error('❌ Failed to pin image:', error.message);
        process.exit(1);
    }
}

// Handle CLI usage
if (require.main === module) {
    pinImageToIPFS().catch(console.error);
}

module.exports = pinImageToIPFS;