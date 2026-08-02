const { Storage } = require('@google-cloud/storage');
const path = require('path');

async function testUploadLarge() {
    console.log('Starting large upload test (30MB)...');

    // Create 30MB buffer
    const size = 30 * 1024 * 1024;
    const buffer = Buffer.alloc(size, 'a');
    console.log('Buffer created. Size:', buffer.length);

    const projectId = 'harx-technologies-inc';
    const keyFilename = path.join(__dirname, 'config', 'cloud-storage-service-account.json');
    const bucketName = 'harx-audios-test';

    const storage = new Storage({
        projectId: projectId,
        keyFilename: keyFilename
    });

    const bucket = storage.bucket(bucketName);
    const fileName = `test-large-${Date.now()}.wav`;
    const file = bucket.file(fileName);

    console.log('Starting save...');
    try {
        await file.save(buffer, {
            resumable: true,
            metadata: { contentType: 'audio/wav' }
        });
        console.log('Stream Finished. Upload complete.');
    } catch (err) {
        console.error('Save Error:', err);
    }
}

testUploadLarge();
