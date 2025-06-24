const axios = require('axios');
const chalk = require('chalk');

const API_URL = 'http://localhost:3001';

// --- Configuration ---
// Remplacez 'your-company-id' par un ID d'entreprise valide de votre base de données.
const COMPANY_ID = 'your-company-id';
// ---------------------

async function viewCorpusRAG() {
  if (COMPANY_ID === 'your-company-id') {
    console.log(chalk.red.bold('Error: Please set the COMPANY_ID in backend/test-corpus-viewer.js before running the script.'));
    return;
  }

  console.log(chalk.bold.cyan('🔍 RAG Corpus Viewer\n'));
  console.log(chalk.yellow('Company ID:'), chalk.bold(COMPANY_ID));
  console.log('='.repeat(50));

  // Test 1: Check corpus status
  console.log(chalk.bold.blue('\n📊 Test 1: Checking corpus status...'));
  try {
    const statusResponse = await axios.get(`${API_URL}/api/rag/corpus/${COMPANY_ID}/status`);
    console.log(chalk.green('✅ Corpus Status:'), statusResponse.data);
  } catch (error) {
    console.log(chalk.red('❌ Error checking status:'), error.response?.data || error.message);
  }

  // Test 2: Get corpus statistics
  console.log(chalk.bold.blue('\n📈 Test 2: Getting corpus statistics...'));
  try {
    const statsResponse = await axios.get(`${API_URL}/api/rag/corpus/${COMPANY_ID}/stats`);
    console.log(chalk.green('✅ Corpus Statistics:'));
    console.log(JSON.stringify(statsResponse.data.stats, null, 2));
  } catch (error) {
    console.log(chalk.red('❌ Error getting stats:'), error.response?.data || error.message);
  }

  // Test 3: List all documents in corpus
  console.log(chalk.bold.blue('\n📄 Test 3: Listing documents in corpus...'));
  let documents = [];
  try {
    const documentsResponse = await axios.get(`${API_URL}/api/rag/corpus/${COMPANY_ID}/documents`);
    documents = documentsResponse.data.documents || [];
    console.log(chalk.green('✅ Documents in corpus:'));
    console.log(chalk.yellow(`Total documents: ${documents.length}`));
    
    if (documents.length > 0) {
      documents.forEach((doc, index) => {
        console.log(chalk.cyan(`\n  ${index + 1}. Document: ${doc.title}`));
        console.log(`     ID: ${doc.id}`);
        console.log(`     URL: ${doc.url}`);
        console.log(`     Words: ${doc.wordCount}, Chars: ${doc.contentLength}`);
        console.log(chalk.gray(`     Preview: ${doc.contentPreview}`));
      });
    } else {
      console.log(chalk.yellow('No documents found in corpus'));
    }
  } catch (error) {
    console.log(chalk.red('❌ Error listing documents:'), error.response?.data || error.message);
  }

  // Test 4: Get specific document content
  if (documents.length > 0) {
    console.log(chalk.bold.blue('\n📖 Test 4: Getting content of the first document...'));
    try {
      const firstDoc = documents[0];
      const contentResponse = await axios.get(`${API_URL}/api/rag/corpus/${COMPANY_ID}/documents/${firstDoc.id}/content`);
      console.log(chalk.green('✅ Document content:'));
      console.log(`   Title: ${contentResponse.data.document.title}`);
      console.log(chalk.gray(`\n   Content preview (first 500 chars):\n   ${contentResponse.data.document.content.substring(0, 500)}...`));
    } catch (error) {
      console.log(chalk.red('❌ Error getting document content:'), error.response?.data || error.message);
    }
  }

  // Test 5: Search in corpus
  console.log(chalk.bold.blue('\n🔍 Test 5: Searching in corpus...'));
  try {
    const searchTerm = 'document'; // Change this to test other terms
    console.log(chalk.yellow(`Searching for: "${searchTerm}"`));
    const searchResponse = await axios.get(`${API_URL}/api/rag/corpus/${COMPANY_ID}/search?searchTerm=${encodeURIComponent(searchTerm)}`);
    console.log(chalk.green(`Found ${searchResponse.data.count} results`));
    
    if (searchResponse.data.results && searchResponse.data.results.length > 0) {
      searchResponse.data.results.forEach((result, index) => {
        console.log(chalk.cyan(`  ${index + 1}. ${result.title} (${result.matches} matches)`));
        console.log(chalk.gray(`     Snippet: ${result.snippet}`));
      });
    }
  } catch (error) {
    console.log(chalk.red('❌ Error searching in corpus:'), error.response?.data || error.message);
  }
  
  console.log(chalk.bold.cyan('\n🎉 Corpus viewer test completed!'));
}

viewCorpusRAG(); 