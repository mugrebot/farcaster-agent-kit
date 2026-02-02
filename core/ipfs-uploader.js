const axios = require('axios');
const FormData = require('form-data');

/**
 * IPFS uploader using web3.storage (free tier)
 */
class IPFSUploader {
    constructor() {
        // Using web3.storage as it's free and reliable
        this.apiUrl = 'https://api.web3.storage';
        // You can get a free API key from https://web3.storage
        this.apiKey = process.env.WEB3_STORAGE_API_KEY || null;
    }

    async uploadImage(imageBuffer, filename) {
        console.log('📤 Uploading to IPFS...');

        try {
            // Fallback to public IPFS gateway if no API key
            if (!this.apiKey) {
                console.log('⚠️  No Web3.Storage API key, using alternative method...');
                return await this.uploadToAlternativeIPFS(imageBuffer, filename);
            }

            const formData = new FormData();
            formData.append('file', imageBuffer, filename);

            const response = await axios.post(`${this.apiUrl}/upload`, formData, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    ...formData.getHeaders()
                }
            });

            const cid = response.data.cid;
            const ipfsUrl = `https://w3s.link/ipfs/${cid}`;

            console.log('✅ Uploaded to IPFS:', ipfsUrl);
            return ipfsUrl;

        } catch (error) {
            console.log('⚠️  Web3.Storage upload failed, trying alternative...');
            return await this.uploadToAlternativeIPFS(imageBuffer, filename);
        }
    }

    async uploadToAlternativeIPFS(imageBuffer, filename) {
        try {
            // Use Pinata as alternative (you can also use nft.storage)
            const pinataUrl = 'https://api.pinata.cloud/pinning/pinFileToIPFS';

            // For now, let's use a simple approach - save locally and provide instructions
            const fs = require('fs').promises;
            const path = require('path');

            const tempPath = path.join(process.cwd(), 'assets', 'temp-' + filename);
            await fs.writeFile(tempPath, imageBuffer);

            console.log('💡 IPFS upload requires API key. Options:');
            console.log('   1. Get free key from https://web3.storage and set WEB3_STORAGE_API_KEY');
            console.log('   2. Upload manually to https://nft.storage');
            console.log('   3. Use the local file:', tempPath);

            // Return a placeholder URL that can be manually replaced
            return 'IPFS_URL_PLACEHOLDER';

        } catch (error) {
            console.error('Failed to upload to IPFS:', error.message);
            throw error;
        }
    }

    /**
     * Create a data URL for immediate use (base64 encoded)
     */
    createDataUrl(imageBuffer, mimeType = 'image/png') {
        const base64 = imageBuffer.toString('base64');
        return `data:${mimeType};base64,${base64}`;
    }
}

module.exports = IPFSUploader;