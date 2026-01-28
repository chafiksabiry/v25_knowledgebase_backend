const callAnalysisService = require('./src/services/callAnalysisService');

const TEST_AUDIO_URL = 'https://res.cloudinary.com/dyqg8x26j/video/upload/v1750068375/call-recordings/kjkqyjijt4sf5rd0ahio.wav';

async function testAudioAnalysis() {
    try {
        console.log('Starting audio analysis test...');

        // Test audio summary
        console.log('\n1. Testing audio summary...');
        const summary = await callAnalysisService.getAudioSummaryService(TEST_AUDIO_URL);
        console.log('Audio Summary Result:', JSON.stringify(summary, null, 2));

        /* // Test audio transcription
        console.log('\n2. Testing audio transcription...');
        const transcription = await callAnalysisService.getAudioTranscription(TEST_AUDIO_URL);
        console.log('Audio Transcription Result:', JSON.stringify(transcription, null, 2));
        
        // Test call scoring
        console.log('\n3. Testing call scoring...');
        const scoring = await callAnalysisService.getCallScoring(TEST_AUDIO_URL);
        console.log('Call Scoring Result:', JSON.stringify(scoring, null, 2));
        
        // Test call post actions
        console.log('\n4. Testing call post actions...');
        const actions = await callAnalysisService.getCallPostActions(TEST_AUDIO_URL);
        console.log('Call Post Actions Result:', JSON.stringify(actions, null, 2));
         */
        console.log('\nAudio analysis test completed successfully');
    } catch (error) {
        console.error('Error during audio analysis test:', error);
    }
}

// Run the test
testAudioAnalysis(); 