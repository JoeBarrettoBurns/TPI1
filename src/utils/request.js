export async function parseJsonSafe(response) {
    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch {
        throw text || 'Invalid server response';
    }
}

