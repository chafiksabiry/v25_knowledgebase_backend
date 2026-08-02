function parseCleanJson(responseText) {
    try {
        if (!responseText) return null;

        // Find the start of the JSON structure
        const firstOpenBracket = responseText.indexOf('[');
        const firstOpenBrace = responseText.indexOf('{');
        let startIndex = -1;

        if (firstOpenBracket !== -1 && firstOpenBrace !== -1) {
            startIndex = Math.min(firstOpenBracket, firstOpenBrace);
        } else if (firstOpenBracket !== -1) {
            startIndex = firstOpenBracket;
        } else if (firstOpenBrace !== -1) {
            startIndex = firstOpenBrace;
        }

        // Find the end of the JSON structure
        const lastCloseBracket = responseText.lastIndexOf(']');
        const lastCloseBrace = responseText.lastIndexOf('}');
        let endIndex = -1;

        if (lastCloseBracket !== -1 && lastCloseBrace !== -1) {
            endIndex = Math.max(lastCloseBracket, lastCloseBrace);
        } else if (lastCloseBracket !== -1) {
            endIndex = lastCloseBracket;
        } else if (lastCloseBrace !== -1) {
            endIndex = lastCloseBrace;
        }

        if (startIndex === -1 || endIndex === -1 || startIndex > endIndex) {
            console.error("Could not find valid JSON boundaries in response");
            // Fallback to original cleanup if structure search fails (though likely won't help if boundaries missing)
            const cleanJson = responseText.replace(/```json\n|```|\n/g, '');
            return JSON.parse(cleanJson);
        }

        const jsonSubstring = responseText.substring(startIndex, endIndex + 1);

        try {
            return JSON.parse(jsonSubstring);
        } catch (initialError) {
            // Attempt to repair truncated array if it starts with '[' but doesn't end with ']'
            if (jsonSubstring.trim().startsWith('[') && !jsonSubstring.trim().endsWith(']')) {
                try {
                    console.warn("Attempting to repair truncated JSON response...");
                    return JSON.parse(jsonSubstring + ']');
                } catch (repairError) {
                    console.error("Failed to repair truncated JSON:", repairError);
                }
            }
            throw initialError;
        }

    } catch (error) {
        console.error("Error parsing JSON:", error);
        console.error("Response snippet start:", responseText ? responseText.substring(0, 100) : 'empty');
        console.error("Response snippet end:", responseText ? responseText.substring(responseText.length - 100) : 'empty');
        return null;
    }
}

module.exports = {
    parseCleanJson
};