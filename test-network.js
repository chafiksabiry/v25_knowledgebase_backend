const https = require('https');

const url = 'https://res.cloudinary.com/dyqg8x26j/video/upload/v1750068375/call-recordings/kjkqyjijt4sf5rd0ahio.wav';

console.log('Testing connectivity to:', url);

https.get(url, (res) => {
    console.log('statusCode:', res.statusCode);
    console.log('headers:', res.headers);
    res.on('data', (d) => {
        // process.stdout.write(d);
    });
}).on('error', (e) => {
    console.error('Error:', e);
});
