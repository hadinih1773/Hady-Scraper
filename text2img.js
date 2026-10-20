/**
 * ImageFree AI Image Generator
 * Creator: IzzXd
 * Base: https://imagefree.net
 * Saluran: https://whatsapp.com/channel/0029VbCv97v9Bb5tC5cZFl0K
 * Note: Sup all prompt jir😂
 */

const BASE_URL = 'https://imagefree.net';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function generate(prompt, options = {}) {
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        throw new Error('Prompt tidak boleh kosong');
    }

    const cleanPrompt = prompt.trim();
    const aspectRatio = typeof options === 'string' ? options : (options.aspectRatio || options.aspect_ratio || '1:1');

    const genRes = await fetch(`${BASE_URL}/api/generate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': USER_AGENT,
            'Referer': `${BASE_URL}/`,
            'Origin': BASE_URL
        },
        body: JSON.stringify({
            prompt: cleanPrompt,
            aspect_ratio: aspectRatio
        })
    });

    const genJson = await genRes.json().catch(() => ({}));
    if (genJson.error || !genJson.taskId) {
        throw new Error(genJson.error || 'Gagal memulai proses generate gambar');
    }

    const taskId = genJson.taskId;
    const maxAttempts = 30;
    const pollInterval = 3000;

    for (let i = 0; i < maxAttempts; i++) {
        await new Promise((resolve) => setTimeout(resolve, pollInterval));

        const statusRes = await fetch(`${BASE_URL}/api/generate/status?taskId=${taskId}`, {
            headers: {
                'User-Agent': USER_AGENT,
                'Referer': `${BASE_URL}/`
            }
        });

        const statusJson = await statusRes.json().catch(() => ({}));
        if (statusJson.error) {
            throw new Error(statusJson.error || 'Terjadi kesalahan saat memproses gambar');
        }

        if (statusJson.status === 'completed' && statusJson.image) {
            return {
                Creator: 'IzzXd',
                Saluran: 'https://whatsapp.com/channel/0029VbCv97v9Bb5tC5cZFl0K',
                status: true,
                prompt: cleanPrompt,
                aspect_ratio: aspectRatio,
                task_id: taskId,
                image_url: statusJson.image
            };
        }

        if (statusJson.status === 'failed') {
            throw new Error('Proses pembuatan gambar gagal di server');
        }
    }

    throw new Error('Waktu pembuatan gambar melebihi batas (timeout)');
}

if (require.main === module) {
    async function main() {
        const prompt = process.argv[2];
        const aspectRatio = process.argv[3] || '1:1';

        if (!prompt) {
            console.log('Usage:\n node imagefree.js <prompt> [aspect_ratio]');
            return;
        }

        try {
            const result = await generate(prompt, { aspectRatio });
            console.log(JSON.stringify(result, null, 2));
        } catch (err) {
            console.log(JSON.stringify({
                Creator: 'IzzXd',
                Saluran: 'https://whatsapp.com/channel/0029VbCv97v9Bb5tC5cZFl0K',
                status: false,
                error: err.message
            }, null, 2));
            process.exit(1);
        }
    }

    main();
}

module.exports = {
    generate,
    extract: generate
};
