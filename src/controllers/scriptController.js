const Script = require('../models/Script');
const { logger } = require('../utils/logger');
const axios = require('axios');
const { vertexAIService } = require('../config/vertexAIConfig');

/**
 * Get all scripts for a given gigId
 * @param {Object} req - Express request object with gigId in params
 * @param {Object} res - Express response object
 */
const getScriptsForGig = async (req, res) => {
  try {
    const { gigId } = req.params;
    if (!gigId) {
      return res.status(400).json({ error: 'gigId is required' });
    }
    const scripts = await Script.find({ gigId }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: scripts });
  } catch (error) {
    logger.error('Error fetching scripts for gig:', error);
    res.status(500).json({ error: 'Failed to fetch scripts for gig', details: error.message });
  }
};

/**
 * Get all scripts for all gigs of a given company, with gig populated
 * @param {Object} req - Express request object with companyId in params
 * @param {Object} res - Express response object
 */
const getScriptsForCompany = async (req, res) => {
  try {
    const { companyId } = req.params;
    const { status } = req.query; // Optional filter: 'active', 'inactive', or undefined (all)
    
    if (!companyId) {
      return res.status(400).json({ error: 'companyId is required' });
    }
    
    // Fetch gigs for the company from the GIGS API
    const gigsApiUrl = process.env.GIGS_API_URL;
    const gigsResponse = await axios.get(`${gigsApiUrl}/gigs/company/${companyId}`);
    const gigs = Array.isArray(gigsResponse.data.data) ? gigsResponse.data.data : [];
    const gigMap = {};
    gigs.forEach(gig => { gigMap[gig._id] = gig; });
    
    // Build query filter based on status parameter
    const queryFilter = { gigId: { $in: gigs.map(g => g._id) } };
    if (status === 'active') {
      queryFilter.isActive = true;
    } else if (status === 'inactive') {
      queryFilter.isActive = false;
    }
    
    // Get all scripts for these gigs
    const scripts = await Script.find(queryFilter).sort({ createdAt: -1 }).lean();
    
    // Populate gig info in each script
    const scriptsWithGig = scripts.map(script => ({ ...script, gig: gigMap[script.gigId?.toString()] || null }));
    res.status(200).json({ success: true, data: scriptsWithGig });
  } catch (error) {
    logger.error('Error fetching scripts for company:', error);
    res.status(500).json({ error: 'Failed to fetch scripts for company', details: error.message });
  }
};

/**
 * Update script status (activate/deactivate)
 * @param {Object} req - Express request object with scriptId in params and isActive in body
 * @param {Object} res - Express response object
 */
const updateScriptStatus = async (req, res) => {
  try {
    const { scriptId } = req.params;
    const { isActive } = req.body;
    
    if (!scriptId) {
      return res.status(400).json({ error: 'scriptId is required' });
    }
    
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive must be a boolean value' });
    }

    const script = await Script.findById(scriptId);
    if (!script) {
      return res.status(404).json({ error: 'Script not found' });
    }

    script.isActive = isActive;
    await script.save();
    
    logger.info(`Script status updated successfully: ${scriptId} - isActive: ${isActive}`);
    
    res.status(200).json({ 
      success: true, 
      message: `Script ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: script
    });
  } catch (error) {
    logger.error('Error updating script status:', error);
    res.status(500).json({ 
      error: 'Failed to update script status', 
      details: error.message 
    });
  }
};

/**
 * Delete a script by its ID
 * @param {Object} req - Express request object with scriptId in params
 * @param {Object} res - Express response object
 */
const deleteScript = async (req, res) => {
  try {
    const { scriptId } = req.params;
    if (!scriptId) {
      return res.status(400).json({ error: 'scriptId is required' });
    }

    const script = await Script.findById(scriptId);
    if (!script) {
      return res.status(404).json({ error: 'Script not found' });
    }

    await Script.findByIdAndDelete(scriptId);
    logger.info(`Script deleted successfully: ${scriptId}`);
    
    res.status(200).json({ 
      success: true, 
      message: 'Script deleted successfully',
      data: { deletedScriptId: scriptId }
    });
  } catch (error) {
    logger.error('Error deleting script:', error);
    res.status(500).json({ 
      error: 'Failed to delete script', 
      details: error.message 
    });
  }
};

/**
 * Regenerate an entire script using the same parameters
 * @param {Object} req - Express request object with scriptId in params
 * @param {Object} res - Express response object
 */
const regenerateScript = async (req, res) => {
  try {
    const { scriptId } = req.params;
    const companyId = req.headers['x-company-id'];
    
    if (!scriptId) {
      return res.status(400).json({ error: 'scriptId is required' });
    }

    if (!companyId) {
      return res.status(400).json({ error: 'Company ID not found in request headers' });
    }

    // Get the original script
    const originalScript = await Script.findById(scriptId).lean();
    if (!originalScript) {
      return res.status(404).json({ error: 'Script not found' });
    }

    // Fetch gig info from GIGS API
    const gigsApiUrl = process.env.GIGS_API_URL;
    const gigResponse = await axios.get(`${gigsApiUrl}/gigs/${originalScript.gigId}`);
    const gig = gigResponse.data.data;

    // Initialize Vertex AI if needed
    if (!vertexAIService.vertexAI) {
      await vertexAIService.initialize();
    }

    // Get corpus status
    const corpusStatus = await vertexAIService.checkCorpusStatus(companyId);
    
    // Generate new script content
    const response = await vertexAIService.queryKnowledgeBase(
      companyId,
      `You are an expert in creating sales call scripts following the REPS methodology. You have access to a knowledge base containing ${corpusStatus.documentCount} documents and ${corpusStatus.callRecordingCount} call recordings for this company.

      CRITICAL INSTRUCTION FOR CORPUS ANALYSIS:
      1. First, analyze all call recordings in the knowledge base
      2. Identify the most successful and representative call that follows best practices
      3. Use this exemplary call as a primary model for script structure and flow
      4. Complement this with insights from other calls and documentation
      5. Ensure compliance with company policies found in documentation

      Original script parameters:
      - Target Client (DISC Profile): ${originalScript.targetClient}
      - Language & Tone: ${originalScript.language}
      - Context: ${originalScript.details || 'not specified'}

      Generate a completely new version while maintaining:
      1. The same REPS methodology structure
      2. The same target client approach
      3. The same language and tone style
      4. Natural dialogue flow based on successful calls

      Return only the JSON array of script steps, where each step has:
      {
        "actor": "agent" or "lead",
        "replica": "The actual dialogue text",
        "phase": "The exact phase name"
      }

      MANDATORY REPS PHASES (ALL 8 phases are REQUIRED):
      1. "Context & Preparation"
      2. "SBAM & Opening"
      3. "Legal & Compliance"
      4. "Need Discovery"
      5. "Value Proposition"
      6. "Documents/Quote"
      7. "Objection Handling"
      8. "Confirmation & Closing"

      Return ONLY the JSON array, no additional text.`
    );

    // Extract and parse the script content
    let scriptContent;
    if (response.candidates && response.candidates[0]) {
      if (response.candidates[0].content && response.candidates[0].content.parts) {
        scriptContent = response.candidates[0].content.parts[0].text;
      } else if (response.candidates[0].text) {
        scriptContent = response.candidates[0].text;
      } else {
        scriptContent = response.candidates[0];
      }
    } else if (response.text) {
      scriptContent = response.text;
    } else if (typeof response === 'string') {
      scriptContent = response;
    } else {
      throw new Error('Unexpected response structure from Vertex AI');
    }

    // Clean up the response
    if (typeof scriptContent === 'string') {
      // Remove any markdown code block syntax
      scriptContent = scriptContent.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
      
      // Remove any potential comments
      scriptContent = scriptContent.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
      
      // Ensure we have valid JSON array brackets
      if (!scriptContent.startsWith('[')) {
        const arrayStart = scriptContent.indexOf('[');
        if (arrayStart !== -1) {
          scriptContent = scriptContent.slice(arrayStart);
        }
      }
      if (!scriptContent.endsWith(']')) {
        const arrayEnd = scriptContent.lastIndexOf(']');
        if (arrayEnd !== -1) {
          scriptContent = scriptContent.slice(0, arrayEnd + 1);
        }
      }
    }

    // Parse the script content with detailed error handling
    let newScriptContent;
    try {
      // First attempt: direct parsing
      try {
        newScriptContent = JSON.parse(scriptContent);
      } catch (initialError) {
        // Log the problematic content
        logger.error('Initial parsing failed. Content:', {
          scriptContent: scriptContent,
          error: initialError.message
        });

        // Second attempt: try to fix common JSON issues
        let cleanedContent = scriptContent
          // Fix potential single quotes
          .replace(/'/g, '"')
          // Fix unquoted property names
          .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3')
          // Remove trailing commas
          .replace(/,(\s*[}\]])/g, '$1')
          // Ensure proper spacing around colons
          .replace(/"\s*:\s*/g, '": ')
          // Remove any BOM or special characters
          .replace(/^\uFEFF/, '');

        try {
          newScriptContent = JSON.parse(cleanedContent);
        } catch (secondError) {
          // If still failing, try to extract JSON array using regex
          const jsonArrayMatch = cleanedContent.match(/\[[\s\S]*\]/);
          if (jsonArrayMatch) {
            newScriptContent = JSON.parse(jsonArrayMatch[0]);
          } else {
            throw new Error(`Failed to parse after cleanup: ${secondError.message}`);
          }
        }
      }

      // Validate the structure
      if (!Array.isArray(newScriptContent)) {
        throw new Error('Generated content is not an array');
      }

      // Validate and clean each step
      newScriptContent = newScriptContent.map((step, idx) => {
        if (!step.actor || !step.replica || !step.phase) {
          throw new Error(`Invalid step structure at index ${idx}`);
        }

        // Ensure proper string values and trim whitespace
        return {
          actor: String(step.actor).trim(),
          replica: String(step.replica).trim(),
          phase: String(step.phase).trim()
        };
      });

    } catch (error) {
      logger.error('Script parsing error:', {
        error: error.message,
        originalContent: scriptContent,
        attemptedCleanup: true
      });
      throw new Error(`Failed to parse generated script content: ${error.message}`);
    }

    // Update the script with new content and include gig info
    const updatedScript = await Script.findByIdAndUpdate(
      scriptId,
      { script: newScriptContent },
      { new: true }
    ).lean();

    // Add gig info to the response
    const scriptWithGig = { ...updatedScript, gig };

    res.status(200).json({
      success: true,
      message: 'Script regenerated successfully',
      data: scriptWithGig
    });

  } catch (error) {
    logger.error('Error regenerating script:', error);
    res.status(500).json({
      error: 'Failed to regenerate script',
      details: error.message
    });
  }
};

/**
 * Refine a specific part of the script using a prompt
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const refineScriptPart = async (req, res) => {
  try {
    const { scriptId } = req.params;
    const { stepIndex, refinementPrompt } = req.body;
    const companyId = req.headers['x-company-id'];
    
    if (!scriptId || typeof stepIndex !== 'number' || !refinementPrompt) {
      return res.status(400).json({ error: 'scriptId, stepIndex, and refinementPrompt are required' });
    }

    if (!companyId) {
      return res.status(400).json({ error: 'Company ID not found in request headers' });
    }

    const script = await Script.findById(scriptId).lean();
    if (!script) {
      return res.status(404).json({ error: 'Script not found' });
    }

    // Fetch gig info from GIGS API
    const gigsApiUrl = process.env.GIGS_API_URL;
    const gigResponse = await axios.get(`${gigsApiUrl}/gigs/${script.gigId}`);
    const gig = gigResponse.data.data;

    if (stepIndex < 0 || stepIndex >= script.script.length) {
      return res.status(400).json({ error: 'Invalid step index' });
    }

    // Initialize Vertex AI if needed
    if (!vertexAIService.vertexAI) {
      await vertexAIService.initialize();
    }

    // Get the current step and context
    const currentStep = script.script[stepIndex];
    const previousStep = stepIndex > 0 ? script.script[stepIndex - 1] : null;
    const nextStep = stepIndex < script.script.length - 1 ? script.script[stepIndex + 1] : null;

    // Generate refined content
    const response = await vertexAIService.queryKnowledgeBase(
      companyId,
      `You are refining a specific part of a sales call script.

      Current context:
      ${previousStep ? `Previous line (${previousStep.actor}): ${previousStep.replica}` : 'This is the start of the conversation'}
      Current line (${currentStep.actor}): ${currentStep.replica}
      ${nextStep ? `Next line (${nextStep.actor}): ${nextStep.replica}` : 'This is the end of the conversation'}
      
      Phase: ${currentStep.phase}
      Refinement request: ${refinementPrompt}
      
      Generate a new version of ONLY the current line that:
      1. Maintains the same phase
      2. Keeps the same actor
      3. Addresses the refinement request
      4. Fits naturally with the previous and next lines
      
      Return only the new replica text.`
    );

    // Update the script with the refined content
    const refinedText = response.candidates[0].content.parts[0].text.trim();
    script.script[stepIndex].replica = refinedText;
    await script.save();

    // Update the script and get the new version
    const updatedScript = await Script.findByIdAndUpdate(
      scriptId,
      { 'script': script.script },
      { new: true }
    ).lean();

    // Add gig info to the response
    const scriptWithGig = { ...updatedScript, gig };

    res.status(200).json({
      success: true,
      message: 'Script part refined successfully',
      data: {
        updatedStep: scriptWithGig.script[stepIndex],
        fullScript: scriptWithGig
      }
    });

  } catch (error) {
    logger.error('Error refining script part:', error);
    res.status(500).json({
      error: 'Failed to refine script part',
      details: error.message
    });
  }
};

/**
 * Update script content directly
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const updateScriptContent = async (req, res) => {
  try {
    const { scriptId } = req.params;
    const { stepIndex, newContent } = req.body;
    
    if (!scriptId || typeof stepIndex !== 'number' || !newContent || !newContent.replica) {
      return res.status(400).json({ error: 'scriptId, stepIndex, and newContent.replica are required' });
    }

    const script = await Script.findById(scriptId).lean();
    if (!script) {
      return res.status(404).json({ error: 'Script not found' });
    }

    // Fetch gig info from GIGS API
    const gigsApiUrl = process.env.GIGS_API_URL;
    const gigResponse = await axios.get(`${gigsApiUrl}/gigs/${script.gigId}`);
    const gig = gigResponse.data.data;

    if (stepIndex < 0 || stepIndex >= script.script.length) {
      return res.status(400).json({ error: 'Invalid step index' });
    }

    // Update only the replica text, maintain other properties
    script.script[stepIndex].replica = newContent.replica;

    // Save the updated script
    const updatedScript = await Script.findByIdAndUpdate(
      scriptId,
      { script: script.script },
      { new: true }
    ).lean();

    // Add gig info to the response
    const scriptWithGig = { ...updatedScript, gig };

    res.status(200).json({
      success: true,
      message: 'Script content updated successfully',
      data: {
        updatedStep: scriptWithGig.script[stepIndex],
        fullScript: scriptWithGig
      }
    });

  } catch (error) {
    logger.error('Error updating script content:', error);
    res.status(500).json({
      error: 'Failed to update script content',
      details: error.message
    });
  }
};

module.exports = {
  getScriptsForGig,
  getScriptsForCompany,
  updateScriptStatus,
  deleteScript,
  regenerateScript,
  refineScriptPart,
  updateScriptContent
}; 