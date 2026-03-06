const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

async function callAISummarize(transcriptSegments, agendaItems) {
    try {
        const resp = await fetch(`${AI_SERVICE_URL}/summarize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ segments: transcriptSegments, agenda_items: agendaItems }),
        });
        if (!resp.ok) throw new Error(`AI service returned ${resp.status}`);
        const data = await resp.json();
        return data.summaries || {};
    } catch (error) {
        console.error('AI summarize call failed:', error.message);
        throw error;
    }
}

async function callAIExtractActions(transcriptText) {
    try {
        const resp = await fetch(`${AI_SERVICE_URL}/extract-actions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: transcriptText }),
        });
        if (!resp.ok) throw new Error(`AI service returned ${resp.status}`);
        const data = await resp.json();
        return data.actions || [];
    } catch (error) {
        console.error('AI extract-actions call failed:', error.message);
        throw error;
    }
}

async function callAISentiment(text) {
    try {
        const resp = await fetch(`${AI_SERVICE_URL}/sentiment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
        });
        if (!resp.ok) throw new Error(`AI service returned ${resp.status}`);
        return await resp.json();
    } catch (error) {
        console.error('AI sentiment call failed:', error.message);
        throw error;
    }
}

module.exports = { callAISummarize, callAIExtractActions, callAISentiment };
