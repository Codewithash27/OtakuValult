const apiUrl = import.meta.env.VITE_API_URL;
if (!apiUrl) {
    throw new Error('Missing VITE_API_URL environment variable');
}
export async function apiFetch(endpoint, options) {
    const url = `${apiUrl}${endpoint}`;
    const response = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options?.headers,
        },
    });
    if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
    }
    return response.json();
}
