function parseCleanJson(responseText) {
    try {
        // Remove markdown formatting (```json and ```\n at the end)
        const cleanJson = responseText.replace(/```json\n|```|\n/g, ''); // Remove backticks and newlines

        // Parse JSON string into an object
        const parsedData = JSON.parse(cleanJson);

        return parsedData;
    } catch (error) {
        console.error("Error parsing JSON:", error);
        return null;
    }
}

module.exports = {
    parseCleanJson
};