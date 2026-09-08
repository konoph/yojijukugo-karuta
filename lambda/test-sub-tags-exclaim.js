/*
 * 文末が撥音「ん」で終わる行で、末尾の句点「。」を感嘆符「!」に変えると
 * 発話の欠落が直るか検証する（猪突猛進・自画自賛で改善を確認済み）。
 *
 * 使い方: node lambda/test-sub-tags-exclaim.js
 * 出力: lambda/test-sub-out/{ローマ字}-exclaim.mp3
 */
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, 'test-sub-out');
const ENV_PATH = path.join(__dirname, '..', '.env');

const API_BASE = 'https://ondoku3.com/api/advanced-tts/';
const VOICE = 'Misa';
const MODEL = 'pro';
const TONE = '幼児向け四字熟語カルタの読み手。入力文を追加・省略・言い換えず、一字一句そのまま読み上げてください。';
const SEED = -260350950;

// 残りの「ん」終わり7件。末尾の「。」を「!」に変更済み。
const TARGETS = [
    { name: 'く', text: '口々に 同じことを 言う。異口同音!' },
    { name: 'け', text: '経験 豊富 抜け目が ないぞ。海千山千!' },
    { name: 'こ', text: 'こんなこと 聞いたことも ない。前代未聞!' },
    { name: 'ち', text: '調子よく トントン拍子。順風満帆!' },
    { name: 'ゆ', text: '許せない 根も葉も ないこと。事実無根!' },
    { name: 'り', text: '理屈じゃない 目と 目で 分かる。以心伝心!' },
    { name: 'れ', text: '歴史を 知れば 新しいことも 見える。<sub alias="おんこちしん">温故知新</sub>!' },
];

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
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    console.log(`${TARGETS.length}件をテスト生成します（voice: ${VOICE}, model: ${MODEL}, seed: ${SEED}）`);

    for (let i = 0; i < TARGETS.length; i++) {
        const { name, text } = TARGETS[i];
        const outputPath = path.join(OUTPUT_DIR, `${name}-exclaim.mp3`);

        console.log(`[${name}] 生成中: ${text}`);
        const job = await submitJob(token, text);
        const result = await pollJob(token, job);
        await downloadAudio(result.url, outputPath);
        console.log(`[${name}] 保存しました: ${outputPath}`);

        if (i < TARGETS.length - 1) {
            await sleep(2000);
        }
    }

    console.log('完了。');
}

main().catch((err) => {
    console.error(err.message);
    process.exit(1);
});
