require('dotenv').config();
const { vertexAIService } = require('./src/config/vertexAIConfig');
const { logger } = require('./src/utils/logger');

const testCompanyId = process.env.TEST_COMPANY_ID;

async function testCorpusStatus() {
  try {
    console.log('\n🔍 Testing Corpus Status and Content...');
    console.log('=' .repeat(50));

    // 1. Initialize Vertex AI
    console.log('\n1️⃣ Initializing Vertex AI...');
    await vertexAIService.initialize();
    console.log('✅ Vertex AI initialized successfully');

    // 2. Check Corpus Status
    console.log('\n2️⃣ Checking corpus status...');
    const corpusStatus = await vertexAIService.checkCorpusStatus(testCompanyId);
    console.log('\nCorpus Statistics:');
    console.log('- Total Documents:', corpusStatus.documentCount);
    console.log('- Call Recordings:', corpusStatus.callRecordingCount);
    console.log('- Total Items:', corpusStatus.totalCount);
    console.log('- Corpus Exists:', corpusStatus.exists);

    // 3. Get Detailed Corpus Content
    console.log('\n3️⃣ Getting detailed corpus content...');
    const corpusContent = await vertexAIService._getCorpusContent(testCompanyId);
    
    // Analyze and categorize content
    const documents = corpusContent.filter(item => !item.title.toLowerCase().includes('call') && !item.title.toLowerCase().includes('recording'));
    const callRecordings = corpusContent.filter(item => item.title.toLowerCase().includes('call') || item.title.toLowerCase().includes('recording'));

    console.log('\nDetailed Content Analysis:');
    console.log('Documents:', documents.length);
    console.log('Call Recordings:', callRecordings.length);

    // 4. Test Script Generation with Citations
    console.log('\n4️⃣ Testing script generation with citation tracking...');
    const testPrompt = `Analyze the call recordings in the knowledge base and tell me:
1. How many call recordings were used
2. List the titles of the call recordings used
3. What are the common patterns found in successful calls
4. What specific phrases or techniques are frequently used

Return the response in this JSON format:
{
  "callRecordingsAnalyzed": number,
  "recordingTitles": string[],
  "commonPatterns": string[],
  "successfulTechniques": string[]
}`;

    const response = await vertexAIService.queryKnowledgeBase(testCompanyId, testPrompt);
    
    console.log('\nScript Generation Analysis:');
    console.log('Citations Used:', response.candidates[0].citationMetadata?.citations?.length || 0);
    
    if (response.candidates[0].citationMetadata?.citations) {
      console.log('\nSources Referenced:');
      response.candidates[0].citationMetadata.citations.forEach((citation, index) => {
        console.log(`${index + 1}. ${citation.title || 'Untitled'}`);
      });
    }

    // Parse and display the analysis results
    try {
      const analysisResults = JSON.parse(response.candidates[0].content.parts[0].text);
      console.log('\nAnalysis Results:');
      console.log('Call Recordings Analyzed:', analysisResults.callRecordingsAnalyzed);
      console.log('\nRecording Titles Used:');
      analysisResults.recordingTitles.forEach((title, index) => {
        console.log(`${index + 1}. ${title}`);
      });
      
      console.log('\nCommon Patterns Found:');
      analysisResults.commonPatterns.forEach((pattern, index) => {
        console.log(`${index + 1}. ${pattern}`);
      });
    } catch (error) {
      console.log('Could not parse analysis results:', error.message);
      console.log('Raw response:', response.candidates[0].content.parts[0].text);
    }

    // 5. Verify RAG Integration
    console.log('\n5️⃣ Verifying RAG integration...');
    const ragTestPrompt = "What are the most successful opening phrases used in the call recordings?";
    const ragResponse = await vertexAIService.queryKnowledgeBase(testCompanyId, ragTestPrompt);
    
    console.log('\nRAG Response Citations:');
    if (ragResponse.candidates[0].citationMetadata?.citations) {
      ragResponse.candidates[0].citationMetadata.citations.forEach((citation, index) => {
        console.log(`${index + 1}. ${citation.title || 'Untitled'} (${citation.startIndex}-${citation.endIndex})`);
      });
    }

    console.log('\n✅ Corpus verification completed successfully!');

  } catch (error) {
    console.error('❌ Error during corpus verification:', error);
    throw error;
  }
}

// Add test company ID check
if (!testCompanyId) {
  console.error('❌ TEST_COMPANY_ID is not set in .env file');
  process.exit(1);
}

// Run the test
console.log('🚀 Starting corpus verification test...');
console.log('📅 Test date:', new Date().toISOString());
console.log('🎯 Testing for company ID:', testCompanyId);

testCorpusStatus()
  .then(() => {
    console.log('\n🎉 All tests completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Test failed:', error);
    process.exit(1);
  }); 