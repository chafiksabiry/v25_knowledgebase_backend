const { vertexAIService, VERTEX_CONFIG } = require('../config/vertexAIConfig');
const { generateAudioSummaryPrompt } = require('../prompts/audioSummaryPrompt');
const { generateCallScoringPrompt } = require('../prompts/callScoringPrompt');
const { logger } = require('../utils/logger');
const { parseCleanJson } = require('../parsers/parse-call-scoring-result');
const { Storage } = require('@google-cloud/storage');
const axios = require('axios');
const path = require('path');

// Initialiser Vertex AI (sera fait de manière asynchrone au premier appel)
let initialized = false;

async function ensureInitialized() {
    if (!initialized) {
        await vertexAIService.initialize();
        initialized = true;
    }
}

// Initialiser Google Cloud Storage
const getStorage = () => {
    return new Storage({
        projectId: VERTEX_CONFIG.project,
        keyFilename: VERTEX_CONFIG.getCredentialsPath()
    });
};

const getBucket = () => getStorage().bucket(process.env.GOOGLE_CLOUD_STORAGE_BUCKET);

// Fonction pour télécharger et stocker l'audio dans GCS
async function uploadToGCS(audioUrl) {
    try {
        // Télécharger l'audio
        const response = await axios({
            method: 'get',
            url: audioUrl,
            responseType: 'arraybuffer'
        });

        // Générer un nom de fichier unique
        const fileName = `audio-${Date.now()}.wav`;
        const bucket = getBucket();
        const file = bucket.file(fileName);

        // Upload vers GCS
        await file.save(response.data, {
            metadata: {
                contentType: 'audio/wav'
            }
        });

        // Générer l'URL GCS
        return `gs://${process.env.GOOGLE_CLOUD_STORAGE_BUCKET}/${fileName}`;
    } catch (error) {
        logger.error('Error uploading to GCS:', error);
        throw error;
    }
}

// Fonction pour obtenir le résumé audio
const getAudioSummary = async (recording) => {
    try {
        // Ensure Vertex AI is initialized
        await ensureInitialized();

        // Upload vers GCS
        const gcsUri = await uploadToGCS(recording.recordingUrl);

        const request = {
            contents: [{
                role: 'user', parts: [
                    {
                        "text": generateAudioSummaryPrompt()
                    },
                    {
                        "file_data": {
                            "mime_type": "audio/wav",
                            "file_uri": gcsUri
                        }
                    }
                ]
            }],
        };

        const streamingResp = await vertexAIService.generativeModel.generateContentStream(request);
        for await (const item of streamingResp.stream) {
            console.log('stream chunk: ', JSON.stringify(item));
        }
        const aggregatedResponse = await streamingResp.response;
        console.log(aggregatedResponse.candidates[0].content);
        return parseCleanJson(aggregatedResponse.candidates[0].content.parts[0].text);

    } catch (error) {
        logger.error('Error in getAudioSummary:', error);
        throw error;
    }
};

// Fonction pour obtenir le scoring de l'appel
const getCallScoring = async (recording) => {
    try {
        // Ensure Vertex AI is initialized
        await ensureInitialized();

        // Upload vers GCS
        const gcsUri = await uploadToGCS(recording.recordingUrl);

        const request = {
            contents: [{
                role: 'user', parts: [
                    {
                        "text": generateCallScoringPrompt()
                    },
                    {
                        "file_data": {
                            "mime_type": "audio/wav",
                            "file_uri": gcsUri
                        }
                    }
                ]
            }],
        };

        const streamingResp = await vertexAIService.generativeModel.generateContentStream(request);
        for await (const item of streamingResp.stream) {
            console.log('stream chunk: ', JSON.stringify(item));
        }
        const aggregatedResponse = await streamingResp.response;
        console.log(aggregatedResponse.candidates[0].content);
        return parseCleanJson(aggregatedResponse.candidates[0].content.parts[0].text);

    } catch (error) {
        logger.error('Error in getCallScoring:', error);
        throw error;
    }
};

module.exports = {
    getAudioSummary,
    getCallScoring
};