# RAG Integration Changes

## Overview
This document describes the changes made to automatically integrate documents and call recordings with the RAG (Retrieval-Augmented Generation) corpus upon upload.

## Changes Made

### 1. Document Controller (`src/controllers/documentController.js`)

#### Added Imports
```javascript
const { vertexAIService } = require('../config/vertexAIConfig');
```

#### Modified `uploadDocument` Function
- **Added automatic RAG corpus integration** after document save
- **Initializes Vertex AI** if not already initialized
- **Creates/ensures corpus exists** for the company
- **Imports document to corpus** using `vertexAIService.importDocumentsToCorpus()`
- **Error handling** - RAG failures don't prevent document upload

#### Modified `deleteDocument` Function
- **Added automatic RAG corpus cleanup** before document deletion
- **Removes document from in-memory corpus** using `documentStore`
- **Error handling** - RAG failures don't prevent document deletion

### 2. Call Recording Controller (`src/controllers/callRecordingController.js`)

#### Added Imports
```javascript
const { vertexAIService } = require('../config/vertexAIConfig');
```

#### Modified `uploadCallRecording` Function
- **Added automatic transcription generation** for RAG integration
- **Uses `getAudioTranscriptionService()`** to transcribe audio
- **Creates document-like object** from transcription
- **Imports transcription to RAG corpus** automatically
- **Error handling** - Transcription/RAG failures don't prevent upload

#### Modified `deleteCallRecording` Function
- **Added automatic RAG corpus cleanup** before call recording deletion
- **Removes transcription from in-memory corpus** using `documentStore`
- **Error handling** - RAG failures don't prevent call recording deletion

## How It Works

### Document Upload Flow
1. User uploads document
2. Document is processed and saved to database
3. **NEW**: Document is automatically added to RAG corpus
4. User can immediately query knowledge base with new content

### Call Recording Upload Flow
1. User uploads call recording
2. Recording is saved to database
3. **NEW**: Audio is automatically transcribed
4. **NEW**: Transcription is added to RAG corpus
5. User can immediately query knowledge base with call content

### Deletion Flow
1. User deletes document/call recording
2. **NEW**: Content is removed from RAG corpus
3. Document/recording is deleted from database
4. File is deleted from Cloudinary

## Benefits

1. **Immediate Availability**: New content is available for queries immediately after upload
2. **No Manual Sync**: No need to manually sync documents to RAG corpus
3. **Automatic Transcription**: Call recordings are automatically transcribed and made searchable
4. **Consistent State**: RAG corpus stays in sync with database content
5. **Robust Error Handling**: RAG failures don't break upload/delete operations

## Error Handling

- **RAG Initialization Failures**: Logged but don't prevent upload
- **Corpus Creation Failures**: Logged but don't prevent upload
- **Document Import Failures**: Logged but don't prevent upload
- **Transcription Failures**: Logged but don't prevent upload
- **Deletion Failures**: Logged but don't prevent deletion

## Testing

Use the provided test script to verify integration:
```bash
node test-rag-integration.js
```

## Configuration

The integration uses the same Vertex AI configuration as the existing RAG system:
- Model: Gemini 2.0 Flash Lite
- Project: From environment variables
- Location: From environment variables
- Credentials: From environment variables

## Logging

All RAG operations are logged with appropriate levels:
- `info`: Successful operations
- `warn`: Non-critical failures (transcription, etc.)
- `error`: Critical failures

## Performance Considerations

- **Memory Usage**: Documents are stored in memory for fast access
- **Upload Time**: Slight increase due to RAG processing
- **Transcription Time**: Call recordings take longer due to audio processing
- **Error Recovery**: System continues to work even if RAG fails 