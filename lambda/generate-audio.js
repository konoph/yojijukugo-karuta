/*
 * 音読さん Advanced TTS API（Beta）を使い、lambda/data/text.txt の各行から
 * 音声ファイルを事前生成する。
 *
 * 使い方: node lambda/generate-audio.js
 *
 * 出力: lambda/data/audio/01.mp3, 02.mp3, ...（text.txt の行順）
 * 生成済みのファイルはスキップされるため、途中で失敗しても再実行で再開できる。
 */

const fs = require('fs');
const path = require('path');

const TEXT_PATH = path.join(__dirname, 'data', 'text.txt');
const OUTPUT_DIR = path.join(__dirname, 'data', 'audio');
const ENV_PATH = path.join(__dirname, '..', '.env');

const API_BASE = 'https://ondoku3.com/api/advanced-tts/';
const VOICE = 'Misa';
const MODEL = 'pro'; // 高品質（flash は高速）
const TONE = '明るく元気に読み上げてください';

// POST は 30回/60秒の制限があるため、余裕を持たせた間隔で送信する。
const POST_INTERVAL_MS = 2000;

function loadAccessToken() {
    const content = fs.readFileSync(ENV_PATH, 'utf8');
    for (const rawLine of content.split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const idx = line.indexOf('=');
        if (idx === -1) continue;
        const key = line.slice(0, idx).trim();
        if (key === 'ondoku3_access_token') {
            return line.slice(idx + 1).trim();
        }
    }
    throw new Error(`${ENV_PATH} に ondoku3_access_token が見つかりません`);
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function submitJob(token, text) {
    const res = await fetch(API_BASE, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            token,
        },
        body: JSON.stringify({
            text,
            voice: VOICE,
            model: MODEL,
            tone: TONE,
        }),
    });
    const body = await res.json();

    if (res.status === 429 && body.code === 'rate_limited') {
        const waitMs = (body.retry_after || 60) * 1000;
        console.log(`  レート制限に達しました。${Math.ceil(waitMs / 1000)}秒待機して再試行します。`);
        await sleep(waitMs);
        return submitJob(token, text);
    }

    if (!res.ok) {
        throw new Error(`ジョブ投入に失敗しました (${res.status}): ${JSON.stringify(body)}`);
    }

    return body;
}

async function pollJob(token, job) {
    await sleep(job.min_poll_after_ms || 3000);

    for (;;) {
        const res = await fetch(`https://ondoku3.com${job.poll_url}`, {
            headers: { 'X-Job-Token': job.job_token },
        });
        const body = await res.json();

        if (res.status === 429) {
            await sleep((body.retry_after || 5) * 1000);
            continue;
        }

        if (body.status === 'succeeded') {
            return body;
        }
        if (body.status === 'failed') {
            throw new Error(`音声生成に失敗しました: ${JSON.stringify(body)}`);
        }

        await sleep(body.poll_after_ms || 3000);
    }
}

async function downloadAudio(url, outputPath) {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`音声ファイルのダウンロードに失敗しました (${res.status})`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(outputPath, buffer);
}

async function main() {
    const token = loadAccessToken();

    const lines = fs
        .readFileSync(TEXT_PATH, 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    console.log(`${lines.length}件の音声を生成します（voice: ${VOICE}, model: ${MODEL}）`);

    for (let i = 0; i < lines.length; i++) {
        const number = String(i + 1).padStart(2, '0');
        const outputPath = path.join(OUTPUT_DIR, `${number}.mp3`);
        const text = lines[i];

        if (fs.existsSync(outputPath)) {
            console.log(`[${number}/${lines.length}] スキップ（既存）: ${text}`);
            continue;
        }

        console.log(`[${number}/${lines.length}] 生成中: ${text}`);

        const job = await submitJob(token, text);
        const result = await pollJob(token, job);
        await downloadAudio(result.url, outputPath);

        console.log(`[${number}/${lines.length}] 保存しました: ${outputPath}`);

        if (i < lines.length - 1) {
            await sleep(POST_INTERVAL_MS);
        }
    }

    console.log('すべての音声生成が完了しました。');
}

main().catch((err) => {
    console.error(err.message);
    process.exit(1);
});
