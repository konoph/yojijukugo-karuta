/*
 * text-kanji.txt に追加した <sub alias="よみ">漢字</sub> タグが、
 * 本番と同じ設定（voice / model / tone / seed）で正しく読まれるか確認する。
 *
 * 対象は text-kanji.txt の一部の行のみ（全件生成前の抜き取りテスト）。
 *
 * 使い方: node tools/test-sub-tags.js
 * 出力: tools/test-sub-out/{ローマ字}.mp3
 */
const fs = require('fs');
const path = require('path');

const TEXT_PATH = path.join(__dirname, 'data', 'text-kanji.txt');
const OUTPUT_DIR = path.join(__dirname, 'test-sub-out');
const ENV_PATH = path.join(__dirname, '..', '.env');

const API_BASE = 'https://ondoku3.com/api/advanced-tts/';
const VOICE = 'Misa';
const MODEL = 'pro';
const TONE = '幼児向け四字熟語カルタの読み手。入力文を追加・省略・言い換えず、一字一句そのまま読み上げてください。';
const SEED = -260350950;

// 検証したい頭文字のみ抜き取る
// れ=温故知新, ろ=無芸大食 (sub alias→phonemeタグに変更してリトライ)
const TARGET_HEADS = ['れ', 'ろ'];

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

function buildReadingLine(rawLine) {
    const parts = rawLine.split('\t');
    return parts.slice(1).join('\t').trim();
}

async function submitJob(token, text) {
    const res = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', token },
        body: JSON.stringify({ text, voice: VOICE, model: MODEL, tone: TONE, seed: SEED }),
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
        if (body.status === 'succeeded') return body;
        if (body.status === 'failed') {
            throw new Error(`音声生成に失敗しました: ${JSON.stringify(body)}`);
        }
        await sleep(body.poll_after_ms || 3000);
    }
}

async function downloadAudio(url, outputPath) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`ダウンロードに失敗しました (${res.status})`);
    fs.writeFileSync(outputPath, Buffer.from(await res.arrayBuffer()));
}

async function main() {
    const token = loadAccessToken();

    const rawLines = fs
        .readFileSync(TEXT_PATH, 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

    const targets = rawLines.filter((line) => TARGET_HEADS.includes(line.split('\t')[0].trim()));

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`${targets.length}件をテスト生成します（voice: ${VOICE}, model: ${MODEL}, seed: ${SEED}）`);

    for (let i = 0; i < targets.length; i++) {
        const head = targets[i].split('\t')[0].trim();
        const text = buildReadingLine(targets[i]);
        const outputPath = path.join(OUTPUT_DIR, `${head}.mp3`);

        console.log(`[${head}] 生成中: ${text}`);
        const job = await submitJob(token, text);
        const result = await pollJob(token, job);
        await downloadAudio(result.url, outputPath);
        console.log(`[${head}] 保存しました: ${outputPath}`);

        if (i < targets.length - 1) {
            await sleep(2000);
        }
    }

    console.log('完了。tools/test-sub-out/ の音声を聞いてルビが正しく反映されているか確認してください。');
}

main().catch((err) => {
    console.error(err.message);
    process.exit(1);
});
