const { Storage } = require('@google-cloud/storage');
const path = require('path');
const fs = require('fs');

async function testUploadStreaming() {
    console.log('Starting streaming upload test (30MB)...');

    // Create dummy file
    const tempFileKey = path.join(__dirname, 'temp_large_file.dat');
    const size = 30 * 1024 * 1024;

    // Create large file efficiently
    const fh = fs.openSync(tempFileKey, 'w');
    fs.writeSync(fh, 'a', size - 1);
    fs.writeSync(fh, 'b', 1); // write at end
    fs.closeSync(fh);

    console.log('Temp file created:', tempFileKey);

    const projectId = 'harx-technologies-inc';
    const keyFilename = path.join(__dirname, 'config', 'cloud-storage-service-account.json');
    const bucketName = 'harx-audios-test';

    const storage = new Storage({
        projectId: projectId,
        keyFilename: keyFilename
    });

    const bucket = storage.bucket(bucketName);
    const fileName = `test-stream-${Date.now()}.wav`;
    const file = bucket.file(fileName);

    const readStream = fs.createReadStream(tempFileKey);

    const writeStream = file.createWriteStream({
        resumable: true,
        metadata: { contentType: 'audio/wav' }
    });

    writeStream.on('error', (err) => console.error('Upload Error:', err));
    writeStream.on('finish', () => {
        console.log('Upload Finished.');
        fs.unlinkSync(tempFileKey);
    });

    console.log('Piping stream...');
    readStream.pipe(writeStream);
    console.log('Pipe established.');
}

testUploadStreaming();
