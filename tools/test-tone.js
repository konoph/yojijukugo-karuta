/*
 * sub / phoneme / カッコ併記の3方式 × 異なるTONE で読み仮名指定を検証する。
 * 四字熟語のイントネーションを意識したプロンプトを試す。
 *
 * 使い方: node test-tone.js
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

async function submitJob(token, text, tone, label) {
    console.log(`\n=== ${label} ===`);
    console.log(`text: ${text}`);
    console.log(`tone: ${tone}`);
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
            tone,
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

const WORDS = [
    { kanji: '我ながら',   yomi: 'われながら' },
    { kanji: '猪突猛進',    yomi: 'ちょとつもうしん' },
    { kanji: '七転八起',    yomi: 'しちてんはっき' },
    { kanji: '百発百中',    yomi: 'ひゃっぱつひゃくちゅう' },
];

function buildText(mode) {
    const parts = WORDS.map((w) => {
        switch (mode) {
            case 'sub':
                return `<sub alias="${w.yomi}">${w.kanji}</sub>`;
            case 'phoneme-kana':
                return `<phoneme alphabet="kana" ph="${w.yomi}">${w.kanji}</phoneme>`;
            case 'paren':
                return `${w.kanji}（${w.yomi}）`;
            default:
                return w.kanji;
        }
    });
    return parts.join('。') + '。';
}

const TONES = [
    {
        label: 'A: プロナレーター（四字熟語重視）',
        value: '四字熟語のイントネーションとアクセントを正確に意識した、プロのナレーターのように読み上げてください。各四字熟語は一語として区切って発音してください。',
    },
    {
        label: 'B: 幼児向けカルタの読み手（四字熟語重視）',
        value: '幼児向け四字熟語カルタの読み手です。四字熟語のイントネーションとアクセントを正確に意識して、プロのナレーターのように読み上げてください。各四字熟語は一語として区切って発音してください。',
    },
];

const MODES = [
    { mode: 'sub',           suffix: 'sub' },
    { mode: 'phoneme-kana',  suffix: 'ph' },
    { mode: 'paren',         suffix: 'paren' },
];

async function main() {
    const token = loadAccessToken();
    const outDir = path.join(__dirname, 'test-tone-out');
    fs.mkdirSync(outDir, { recursive: true });

    for (const tone of TONES) {
        for (const m of MODES) {
            const text = buildText(m.mode);
            const file = `tone-${tone.label.charAt(0)}-${m.suffix}.mp3`;
            const label = `${tone.label} / ${m.suffix}`;
            const job = await submitJob(token, text, tone.value, label);
            if (!job) {
                console.log('skipped');
                continue;
            }
            const result = await pollJob(token, job);
            if (!result) {
                console.log('skipped (job failed)');
                continue;
            }
            await downloadAudio(result.url, path.join(outDir, file));
            await sleep(2500);
        }
    }

    console.log('\n完了。');
    console.log(`出力ディレクトリ: ${outDir}`);
    console.log('\n想定読み: われながら。ちょとつもうしん。しちてんはっき。ひゃっぱつひゃくちゅう。');
}

main().catch((err) => {
    console.error(err.message);
    process.exit(1);
});
