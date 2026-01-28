const axios = require('axios');

const url = 'https://res.cloudinary.com/dyqg8x26j/video/upload/v1750068375/call-recordings/kjkqyjijt4sf5rd0ahio.wav';

async function testDownload() {
    console.log('Starting axios download...');
    try {
        const response = await axios({
            method: 'get',
            url: url,
            responseType: 'arraybuffer',
            onDownloadProgress: (progressEvent) => {
                const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                console.log(`Download progress: ${percentCompleted}% (${progressEvent.loaded} bytes)`);
            }
        });
        console.log('Download complete. Size:', response.data.length);
    } catch (error) {
        console.error('Download failed:', error.message);
    }
}

testDownload();
