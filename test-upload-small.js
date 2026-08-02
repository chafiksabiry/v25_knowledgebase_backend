const { Storage } = require('@google-cloud/storage');
const path = require('path');

async function testUpload() {
    console.log('Starting small upload test...');

    const projectId = 'harx-technologies-inc';
    const keyFilename = path.join(__dirname, 'config', 'cloud-storage-service-account.json');
    const bucketName = 'harx-audios-test';

    console.log('Project:', projectId);
    console.log('KeyFile:', keyFilename);

    const storage = new Storage({
        projectId: projectId,
        keyFilename: keyFilename
    });

    const bucket = storage.bucket(bucketName);
    const fileName = `test-small-${Date.now()}.txt`;
    const file = bucket.file(fileName);

    const stream = file.createWriteStream({
        resumable: false,
        metadata: { contentType: 'text/plain' }
    });

    stream.on('error', (err) => console.error('Stream Error:', err));
    stream.on('finish', () => console.log('Stream Finished. Upload complete.'));

    console.log('Writing to stream...');
    stream.end('Hello GCS');
    console.log('Stream ended.');
}

testUpload();
