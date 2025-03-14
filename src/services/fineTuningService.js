const { logger } = require('../utils/logger');
const { chunkDocument } = require('../utils/textProcessing');

/**
 * Prepare training data for fine-tuning from documents
 * @param {Array} documents - Array of documents to use for training
 * @returns {Promise<Array<string>>} Array of JSONL formatted training examples
 */
async function prepareTrainingData(documents) {
  try {
    logger.info(`Preparing training data from ${documents.length} documents`);
    
    const trainingData = [];
    
    // Process each document
    for (const document of documents) {
      // Use existing chunks if available, otherwise create new ones
      const chunks = document.chunks.length > 0
        ? document.chunks.map(chunk => chunk.content)
        : chunkDocument(document.content);
      
      // Create training examples from each chunk
      for (const chunk of chunks) {
        // Create examples for document analysis
        trainingData.push(createDocumentAnalysisExample(document.name, chunk));
        
        // Create examples for content gap detection
        trainingData.push(createContentGapExample(document.name, chunk));
        
        // Create examples for recommendation generation
        trainingData.push(createRecommendationExample(document.name, chunk));
      }
      
      // Create examples for the entire document if it's not too large
      if (document.content.length < 10000) {
        trainingData.push(createDocumentSummaryExample(document.name, document.content));
      }
    }
    
    // Create examples for knowledge base analysis if we have multiple documents
    if (documents.length > 1) {
      trainingData.push(createKnowledgeBaseAnalysisExample(documents));
    }
    
    logger.info(`Generated ${trainingData.length} training examples`);
    
    return trainingData;
  } catch (error) {
    logger.error('Error preparing training data:', error);
    throw error;
  }
}

/**
 * Create a training example for document analysis
 * @param {string} documentName - Name of the document
 * @param {string} content - Document content chunk
 * @returns {string} JSONL formatted training example
 */
function createDocumentAnalysisExample(documentName, content) {
  const example = {
    messages: [
      {
        role: 'system',
        content: 'You are an expert document analyst. Analyze the provided document and provide a detailed assessment.'
      },
      {
        role: 'user',
        content: `Document: ${documentName}\n\nContent: ${content}\n\nPlease analyze this document and provide a detailed assessment including key topics, content quality, and areas for improvement.`
      },
      {
        role: 'assistant',
        content: `# Document Analysis for "${documentName}"\n\n## Key Topics\n- Topic 1\n- Topic 2\n- Topic 3\n\n## Content Quality\nThe document is well-structured and covers the main topics effectively. The language is clear and appropriate for the target audience.\n\n## Areas for Improvement\n1. Consider adding more examples to illustrate key concepts.\n2. Some technical terms could benefit from additional explanation.\n3. The introduction could be more engaging to draw readers in.\n\n## Overall Assessment\nThis is a solid document that serves its purpose well. With a few minor improvements, it could be even more effective at conveying information to readers.`
      }
    ]
  };
  
  return JSON.stringify(example);
}

/**
 * Create a training example for content gap detection
 * @param {string} documentName - Name of the document
 * @param {string} content - Document content chunk
 * @returns {string} JSONL formatted training example
 */
function createContentGapExample(documentName, content) {
  const example = {
    messages: [
      {
        role: 'system',
        content: 'You are an expert at identifying content gaps in documentation. Analyze the provided document and identify missing information or areas that need expansion.'
      },
      {
        role: 'user',
        content: `Document: ${documentName}\n\nContent: ${content}\n\nPlease identify any content gaps or missing information in this document.`
      },
      {
        role: 'assistant',
        content: `# Content Gap Analysis for "${documentName}"\n\n## Identified Gaps\n\n1. **Missing Context**: The document jumps into technical details without providing sufficient background information for new users.\n   - Severity: High\n   - Recommendation: Add an introductory section explaining the basic concepts.\n\n2. **Incomplete Procedure**: The steps for configuration are mentioned but lack detailed instructions.\n   - Severity: Medium\n   - Recommendation: Expand the configuration section with step-by-step instructions.\n\n3. **Lack of Examples**: Abstract concepts are presented without practical examples.\n   - Severity: Medium\n   - Recommendation: Include real-world examples to illustrate key points.\n\n## Suggested Additions\n\n- Add a troubleshooting section to address common issues\n- Include references to related documentation\n- Consider adding visual aids like diagrams or screenshots`
      }
    ]
  };
  
  return JSON.stringify(example);
}

/**
 * Create a training example for recommendation generation
 * @param {string} documentName - Name of the document
 * @param {string} content - Document content chunk
 * @returns {string} JSONL formatted training example
 */
function createRecommendationExample(documentName, content) {
  const example = {
    messages: [
      {
        role: 'system',
        content: 'You are an expert at providing recommendations for improving documentation. Analyze the provided document and suggest specific improvements.'
      },
      {
        role: 'user',
        content: `Document: ${documentName}\n\nContent: ${content}\n\nPlease provide specific recommendations for improving this document.`
      },
      {
        role: 'assistant',
        content: `# Improvement Recommendations for "${documentName}"\n\n## Structure Improvements\n\n1. **Reorganize Content Flow**: The current structure jumps between topics. Consider reorganizing to follow a more logical progression.\n   - Priority: High\n   - Impact: Improved readability and comprehension\n\n2. **Add Section Headers**: Break up long sections with clear headers to improve navigation.\n   - Priority: Medium\n   - Impact: Better document scanability\n\n## Content Enhancements\n\n1. **Expand Technical Explanations**: Some technical concepts need more thorough explanation.\n   - Priority: High\n   - Impact: Increased understanding for readers with varied expertise levels\n\n2. **Add Practical Examples**: Include code samples or case studies to illustrate abstract concepts.\n   - Priority: Medium\n   - Impact: Better practical application of information\n\n## Presentation Suggestions\n\n1. **Include Visual Aids**: Add diagrams, flowcharts, or screenshots where appropriate.\n   - Priority: Medium\n   - Impact: Enhanced comprehension of complex topics\n\n2. **Create a Quick Reference Section**: Add a summary or cheat sheet for key information.\n   - Priority: Low\n   - Impact: Improved usability for experienced users`
      }
    ]
  };
  
  return JSON.stringify(example);
}

/**
 * Create a training example for document summary
 * @param {string} documentName - Name of the document
 * @param {string} content - Full document content
 * @returns {string} JSONL formatted training example
 */
function createDocumentSummaryExample(documentName, content) {
  const example = {
    messages: [
      {
        role: 'system',
        content: 'You are an expert at summarizing technical documentation. Provide concise yet comprehensive summaries that capture the key points.'
      },
      {
        role: 'user',
        content: `Document: ${documentName}\n\nContent: ${content}\n\nPlease provide a concise summary of this document.`
      },
      {
        role: 'assistant',
        content: `# Summary of "${documentName}"\n\n## Overview\nThis document provides a comprehensive guide to [main topic], covering [key aspects] and [important procedures]. It serves as a reference for [target audience] who need to [primary use case].\n\n## Key Points\n- The document explains [important concept 1] and its relationship to [related concept]\n- It outlines the process for [key procedure], including important considerations and potential pitfalls\n- Technical specifications and requirements are detailed, with emphasis on [critical requirements]\n- The document addresses common issues through [troubleshooting approach]\n\n## Primary Sections\n1. Introduction to [main topic]\n2. Configuration and setup procedures\n3. Advanced usage scenarios\n4. Troubleshooting and maintenance\n\nThis document effectively serves its purpose of [primary goal] while providing sufficient detail for both new and experienced users.`
      }
    ]
  };
  
  return JSON.stringify(example);
}

/**
 * Create a training example for knowledge base analysis
 * @param {Array} documents - Array of documents in the knowledge base
 * @returns {string} JSONL formatted training example
 */
function createKnowledgeBaseAnalysisExample(documents) {
  // Create a summary of the knowledge base
  const kbSummary = documents.map(doc => {
    return `Document: ${doc.name}\nDescription: ${doc.description || 'No description'}\nTags: ${doc.tags.join(', ') || 'No tags'}\n---`;
  }).join('\n\n');
  
  const example = {
    messages: [
      {
        role: 'system',
        content: 'You are an expert knowledge base analyst. Analyze the provided knowledge base summary and provide a comprehensive assessment of coverage, gaps, and recommendations.'
      },
      {
        role: 'user',
        content: `Knowledge Base Summary:\n\n${kbSummary}\n\nPlease analyze this knowledge base and provide an assessment of its coverage, identify any gaps, and suggest improvements.`
      },
      {
        role: 'assistant',
        content: `# Knowledge Base Analysis\n\n## Overall Assessment\nThe knowledge base contains ${documents.length} documents covering topics related to [main topics]. The coverage is [comprehensive/adequate/limited] in the areas of [key areas], but shows gaps in [missing areas].\n\n## Content Coverage\n- Strong coverage of [well-covered topic 1]\n- Adequate information on [well-covered topic 2]\n- Limited documentation for [under-covered topic]\n\n## Identified Gaps\n1. **Missing Documentation**: There appears to be no content covering [missing topic 1].\n   - Impact: Users will struggle to understand [related process/concept]\n   - Recommendation: Create new documentation focused on this topic\n\n2. **Insufficient Depth**: The coverage of [shallow topic] lacks necessary detail.\n   - Impact: Users may not be able to implement advanced features\n   - Recommendation: Expand existing documentation with more technical details\n\n3. **Outdated Information**: Content related to [outdated topic] may need updating.\n   - Impact: Users might follow obsolete procedures\n   - Recommendation: Review and update this content to reflect current best practices\n\n## Organizational Improvements\n1. Create a more structured categorization system\n2. Implement cross-referencing between related documents\n3. Develop a glossary of key terms used across the knowledge base\n\n## Recommended New Content\n1. [Suggested document 1] - To address the gap in [missing topic]\n2. [Suggested document 2] - To provide more practical examples\n3. [Suggested document 3] - To create a quick-start guide for new users`
      }
    ]
  };
  
  return JSON.stringify(example);
}

module.exports = {
  prepareTrainingData
}; 