/*
 * 音読さん Advanced TTS API（Beta）を使い、lambda/data/text-kanji.txt の各行から
 * 音声ファイルを事前生成する。
 *
 * text-kanji.txt は「ひらがな1文字 \t 漢字混じり読み上げ文」の形式。
 * 読み上げの元ネタは lambda/data/text.txt（ひらがな版）で、
 * text-kanji.txt は text.txt を漢字混じりに書き直した参照用テキスト。
 *
 * TTS へ送信するテキストは本文（タブ以降）のみとし、先頭の1文字（カルタの頭文字）は読み上げない。
 *
 * システムプロンプト（TONE）は「幼児向け四字熟語カルタの読み手」。
 *
 * 使い方: node lambda/generate-audio.js
 *
 * 出力: lambda/data/audio/a.mp3, i.mp3, ...（各行の1文字目をヘボン式ローマ字にしたファイル名）
 *       生成後 web/data/audio/ にも自動コピーされる（Webアプリで再生するため）
 * 生成済みのファイルはスキップされるため、途中で失敗しても再実行で再開できる。
 */

const fs = require('fs');
const path = require('path');

const TEXT_PATH = path.join(__dirname, 'data', 'text-kanji.txt');
const OUTPUT_DIR = path.join(__dirname, 'data', 'audio');
const WEB_AUDIO_DIR = path.join(__dirname, '..', 'web', 'data', 'audio');
const ENV_PATH = path.join(__dirname, '..', '.env');

const API_BASE = 'https://ondoku3.com/api/advanced-tts/';
const VOICE = 'Misa';
const MODEL = 'pro'; // 高品質（flash は高速）
const TONE = '幼児向け四字熟語カルタの読み手。入力文を追加・省略・言い換えず、一字一句そのまま読み上げてください。';
const SEED = -260350950; // 声色固定用（全音声で同じ声色に揃える）

// POST は 30回/60秒の制限があるため、余裕を持たせた間隔で送信する。
const POST_INTERVAL_MS = 2000;

// text-kanji.txt の1文字目（ひらがな）→ ファイル名用ヘボン式ローマ字
const ROMAJI = {
    'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o',
    'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
    'さ': 'sa', 'し': 'shi', 'す': 'su', 'せ': 'se', 'そ': 'so',
    'た': 'ta', 'ち': 'chi', 'つ': 'tsu', 'て': 'te', 'と': 'to',
    'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',
    'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho',
    'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
    'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
    'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',
    'わ': 'wa', 'を': 'wo', 'ん': 'n',
};

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

// text-kanji.txt の1行（「あ<TAB>あっちこっち …」）から、
// TTS 送信用の本文「あっちこっち …」（先頭の1文字を除いた部分）を取り出す。
function buildReadingLine(rawLine) {
    const parts = rawLine.split('\t');
    if (parts.length >= 2) {
        const body = parts.slice(1).join('\t').trim();
        if (body) {
            return body;
        }
    }
    // フォーマットが壊れていたらそのまま返す
    return rawLine.trim();
}

// text-kanji.txt の1行の先頭1文字（ひらがな）から、ファイル名用のローマ字を求める。
function buildFileName(rawLine) {
    const head = rawLine.split('\t')[0].trim();
    const romaji = ROMAJI[head];
    if (!romaji) {
        throw new Error(`ROMAJI マップに存在しない頭文字です: "${head}"`);
    }
    return romaji;
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
            seed: SEED,
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

    const rawLines = fs
        .readFileSync(TEXT_PATH, 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

    const lines = rawLines.map(buildReadingLine);
    const fileNames = rawLines.map(buildFileName);

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    console.log(`${lines.length}件の音声を生成します（voice: ${VOICE}, model: ${MODEL}, tone: ${TONE}, seed: ${SEED}）`);

    for (let i = 0; i < lines.length; i++) {
        const fileName = fileNames[i];
        const outputPath = path.join(OUTPUT_DIR, `${fileName}.mp3`);
        const text = lines[i];
        const progress = `${i + 1}/${lines.length} ${fileName}`;

        if (fs.existsSync(outputPath)) {
            console.log(`[${progress}] スキップ（既存）: ${text}`);
            continue;
        }

        console.log(`[${progress}] 生成中: ${text}`);

        const job = await submitJob(token, text);
        const result = await pollJob(token, job);
        await downloadAudio(result.url, outputPath);

        // web/data/audio/ にコピーして、Webアプリで即利用できるようにする
        fs.mkdirSync(WEB_AUDIO_DIR, { recursive: true });
        const webPath = path.join(WEB_AUDIO_DIR, `${fileName}.mp3`);
        fs.copyFileSync(outputPath, webPath);

        console.log(`[${progress}] 保存しました: ${outputPath} → ${webPath}`);

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
