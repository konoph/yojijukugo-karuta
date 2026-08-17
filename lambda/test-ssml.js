/*
 * SSML読み仮名タグがAdvanced TTS APIで機能するか検証する。
 * 読み間違いが発生しやすい4語を各方式で試す。
 *
 * テスト語:
 *   我ながら      → われながら
 *   猪突猛進      → ちょとつもうしん
 *   七転八起      → しちてんはっき
 *   百発百中      → ひゃっぱつひゃくちゅう
 *
 * 各方式:
 *   1. ベースライン（SSMLなし、漢字のみ）
 *   2. <sub alias="よみ">漢字</sub>
 *   3. <phoneme alphabet="kana" ph="よみ">漢字</phoneme>
 *   4. <ruby>漢字<rt>よみ</rt></ruby>
 *   5. カッコ併記 漢字（よみ）
 *
 * 使い方: node test-ssml.js
 */
const fs = require('fs');
const path = require('path');

const ENV_PATH = path.join(__dirname, '..', '.env');

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
    throw new Error('access token not found');
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function submitJob(token, text, label) {
    console.log(`\n=== ${label} ===`);
    console.log(`text: ${text}`);
    const res = await fetch('https://ondoku3.com/api/advanced-tts/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            token,
        },
        body: JSON.stringify({
            text,
            voice: 'Misa',
            model: 'pro',
            tone: '落ち着いて、正確に読んでください。',
        }),
    });
    const body = await res.json();
    if (!res.ok) {
        console.log(`HTTP ${res.status}: ${JSON.stringify(body)}`);
        return null;
    }
    console.log(`job submitted: ${body.job_id}`);
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
            console.log(`FAILED: ${JSON.stringify(body)}`);
            return null;
        }
        await sleep(body.poll_after_ms || 3000);
    }
}

async function downloadAudio(url, outputPath) {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`download failed: ${res.status}`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(outputPath, buffer);
    console.log(`saved: ${outputPath} (${buffer.length} bytes)`);
}

// 4語とその読み
const WORDS = [
    { kanji: '我ながら',   yomi: 'われながら' },
    { kanji: '猪突猛進',    yomi: 'ちょとつもうしん' },
    { kanji: '七転八起',    yomi: 'しちてんはっき' },
    { kanji: '百発百中',    yomi: 'ひゃっぱつひゃくちゅう' },
];

function buildText(mode) {
    const parts = WORDS.map((w) => {
        switch (mode) {
            case 'base':
                return w.kanji;
            case 'sub':
                return `<sub alias="${w.yomi}">${w.kanji}</sub>`;
            case 'phoneme-kana':
                return `<phoneme alphabet="kana" ph="${w.yomi}">${w.kanji}</phoneme>`;
            case 'ruby':
                return `<ruby>${w.kanji}<rt>${w.yomi}</rt></ruby>`;
            case 'paren':
                return `${w.kanji}（${w.yomi}）`;
            default:
                return w.kanji;
        }
    });
    // 各語を句点で区切り、全体を1文に
    return parts.join('。') + '。';
}

const TESTS = [
    { label: '1. ベースライン（漢字のみ）',           mode: 'base',           file: 'test-01-base.mp3' },
    { label: '2. sub タグ',                              mode: 'sub',            file: 'test-02-sub.mp3' },
    { label: '3. phoneme タグ（kana）',                  mode: 'phoneme-kana',   file: 'test-03-phoneme-kana.mp3' },
    { label: '4. ruby ルビ',                             mode: 'ruby',           file: 'test-04-ruby.mp3' },
    { label: '5. カッコ併記 漢字（よみ）',                mode: 'paren',          file: 'test-05-paren.mp3' },
];

async function main() {
    const token = loadAccessToken();
    const outDir = path.join(__dirname, 'test-ssml-out');
    fs.mkdirSync(outDir, { recursive: true });

    for (const t of TESTS) {
        const text = buildText(t.mode);
        const job = await submitJob(token, text, t.label);
        if (!job) {
            console.log('skipped (job submission failed)');
            continue;
        }
        const result = await pollJob(token, job);
        if (!result) {
            console.log('skipped (job failed)');
            continue;
        }
        await downloadAudio(result.url, path.join(outDir, t.file));
        await sleep(2000);
    }

    console.log('\n完了。各音声を聞き比べて、読み仮名が反映されているか確認してください。');
    console.log(`出力ディレクトリ: ${outDir}`);
    console.log('\n想定読み: われながら。ちょとつもうしん。しちてんはっき。ひゃっぱつひゃくちゅう。');
}

main().catch((err) => {
    console.error(err.message);
    process.exit(1);
});
