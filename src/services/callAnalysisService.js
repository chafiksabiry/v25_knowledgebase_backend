const { OAuth2Client, GoogleAuth } = require('google-auth-library');
const http = require('http');
const axios = require('axios');
const path = require("path");
const { Storage } = require('@google-cloud/storage');
const { VertexAI } = require('@google-cloud/vertexai');
//const { generateCallScoringPrompt } = require('../prompts/call-scoring-prompt');
//const { generateCallPostActionsPrompt } = require('../prompts/call-action-plan');
const { generateAudioSummaryPrompt } = require('../prompts/audioSummaryPrompt');
const { parseCleanJson } = require('../parsers/parse-call-scoring-result');
const { generateAudioTranscriptionPrompt } = require('../prompts/audioTranscriptionPrompt');

// Retreive OAUTH2.0 credentials and Google Cloud variables form .env
const clientId = process.env.QAUTH2_CLIENT_ID;
const clientSecret = process.env.QAUTH2_CLIENT_SECRET;
const scope = process.env.QAUTH2_SCOPE;
const redirectUrl = process.env.REDIRECTION_URL;
const project = process.env.GOOGLE_CLOUD_PROJECT || 'harx-technologies-inc';
const location = 'us-central1';

// Construct the absolute path to the service account JSON file
const keyPath = path.join(__dirname, "../../config/vertex-ai-key.json");
const storageServicekeyPath = path.join(__dirname, "../../config/cloud-storage-service-account.json");

// Vérifier si le fichier de service account existe
const fs = require('fs');
if (!fs.existsSync(keyPath)) {
    console.warn('Warning: Service account file not found at:', keyPath);
    console.warn('Make sure to place your service account JSON file at this location');
}

// Function to upload audio to Google Cloud Storage
exports.audioUpload2 = async (fileBuffer, destinationName) => {
    const storage = new Storage({
        projectId: project,
        keyFilename: storageServicekeyPath,
    });
    const bucketName = "harx-audios-test";

    try {
        const bucket = storage.bucket(bucketName);
        const file = bucket.file(destinationName);

        // Create a write stream to upload the file from the buffer
        const stream = file.createWriteStream({
            resumable: false,
            metadata: {
                contentType: "audio/wav",
            },
        });

        return new Promise((resolve, reject) => {
            stream.on('error', (error) => {
                console.error(`Failed to upload to ${bucketName}:`, error.message);
                reject(new Error('File upload failed. Please check the file buffer and bucket permissions.'));
            });

            stream.on('finish', () => {
                console.log(`${destinationName} uploaded to ${bucketName}`);
                resolve({
                    message: `${destinationName} successfully uploaded to ${bucketName}`,
                    bucketName,
                    fileUri: `gs://${bucketName}/${destinationName}`,
                });
            });

            // Write the buffer and end the stream
            stream.end(fileBuffer);
        });
    } catch (error) {
        console.error(`Failed to upload to ${bucketName}:`, error.message);
        throw new Error('File upload failed. Please check the file buffer and bucket permissions.');
    }
};

// Function to download and upload to GCS
async function uploadToGCS(audioUrl) {
    try {
        // Download audio file
        const response = await axios({
            method: 'get',
            url: audioUrl,
            responseType: 'arraybuffer'
        });

        // Generate unique filename
        const fileName = `audio-${Date.now()}.wav`;
        
        // Upload to GCS using the new method
        const uploadResult = await exports.audioUpload2(response.data, fileName);
        console.log('Upload result:', uploadResult);

        return uploadResult.fileUri;
    } catch (error) {
        console.error('Error uploading to GCS:', error);
        throw error;
    }
}

// Authenticate to Google cloud using the vertex service account
const auth = new GoogleAuth({
    keyFilename: keyPath,
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

// Create an instance of VertexAI class with explicit project configuration
const vertex_ai = new VertexAI({ 
    project: project, 
    location: location, 
    googleAuthOptions: {
        keyFilename: keyPath,
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
    }
});

// Create an instance of GenerativeModel class
const generativeVisionModel = vertex_ai.getGenerativeModel({
    model: 'gemini-1.5-flash-002',
});

// Get the summary of an audio 
exports.getAudioSummaryService = async (file_uri) => {
    try {
        // Upload to GCS first
        const gcsUri = await uploadToGCS(file_uri);
        console.log('File uploaded to GCS:', gcsUri);

        const request = {
            contents: [{
                role: 'user', parts: [
                    {
                        "file_data": {
                            "mime_type": "audio/wav",
                            "file_uri": gcsUri
                        }
                    },
                    {
                        "text": generateAudioSummaryPrompt()
                    }
                ]
            }],
        };
        const streamingResp = await generativeVisionModel.generateContentStream(request);
        let fullResponse = '';
        for await (const item of streamingResp.stream) {
            console.log('stream chunk: ', JSON.stringify(item));
            if (item.candidates && item.candidates[0].content.parts[0].text) {
                fullResponse += item.candidates[0].content.parts[0].text;
            }
        }
        console.log('Full response:', fullResponse);
        return parseCleanJson(fullResponse);

    } catch (error) {
        console.error("Error analyzing the audio:", error);
        throw new Error("Audio analysis failed");
    }
};

// Get the transcription of an audio with timeline
exports.getAudioTranscriptionService = async (file_uri) => {
    try {
        // Upload to GCS first
        const gcsUri = await uploadToGCS(file_uri);
        console.log('File uploaded to GCS:', gcsUri);

        const request = {
            contents: [{
                role: 'user', parts: [
                    {
                        "file_data": {
                            "mime_type": "audio/wav",
                            "file_uri": gcsUri
                        }
                    },
                    {
                        "text": generateAudioTranscriptionPrompt()
                    }
                ]
            }],
        };
        const streamingResp = await generativeVisionModel.generateContentStream(request);
        let fullResponse = '';
        for await (const item of streamingResp.stream) {
            console.log('stream chunk: ', JSON.stringify(item));
            if (item.candidates && item.candidates[0].content.parts[0].text) {
                fullResponse += item.candidates[0].content.parts[0].text;
            }
        }
        console.log('Full transcription response:', fullResponse);
        
        // Parse the response and ensure it's in the correct format
        const parsedResponse = parseCleanJson(fullResponse);
        
        // If the response is an array, wrap it in the proper structure
        if (Array.isArray(parsedResponse)) {
            return {
                status: 'completed',
                segments: parsedResponse,
                lastUpdated: new Date(),
                error: null
            };
        }
        
        // If the response is already in the correct format, return it
        if (parsedResponse && parsedResponse.status && parsedResponse.segments) {
            return parsedResponse;
        }
        
        // If we can't parse the response properly, return an error
        throw new Error('Invalid transcription response format');
    } catch (error) {
        console.error("Error transcribing the audio:", error);
        throw new Error("Audio transcription failed");
    }
};

// Get the scoring of a call 
/* exports.getCallScoring = async (file_uri) => {
    try {
        const request = {
            contents: [{
                role: 'user', parts: [
                    {
                        "file_data": {
                            "mime_type": "audio/wav", // we can change the mime_type after
                            "file_uri": file_uri
                        }
                    },
                    {
                        "text": generateCallScoringPrompt()
                    }
                ]
            }],
        };
        const result = await generativeVisionModel.generateContent(request);
        const response = result.response;
        console.log('Response: ', JSON.stringify(response));
        return parseCleanJson(response.candidates[0].content.parts[0].text);
    } catch (error) {
        console.error("Error analyzing the audio:", error);
        throw new Error("Audio analyzis failed");
    }
}; */

//getCallPostActions
/* exports.getCallPostActions = async (file_uri) => {
    try {
        const request = {
            contents: [{
                role: 'user', parts: [
                    {
                        "file_data": {
                            "mime_type": "audio/wav", // we can change the mime_type after
                            "file_uri": file_uri
                        }
                    },
                    {
                        "text": generateCallPostActionsPrompt()
                    }
                ]
            }],
        };
        const result = await generativeVisionModel.generateContent(request);
        const response = result.response;
        console.log('Response: ', JSON.stringify(response));
        return parseCleanJson(response.candidates[0].content.parts[0].text);
    } catch (error) {
        console.error("Service : Error during generating follow-up actions:", error);
        throw new Error("Audio analyzis failed");
    }
}; */ 