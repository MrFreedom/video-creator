import express from 'express';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json({ limit: '50mb' }));

app.get('/', (req, res) => res.send('Video Maker is Online ✅'));

app.post('/create-video', async (req, res) => {
    console.log('📨 Запрос получен');
    const { images } = req.body;
    if (!images || !Array.isArray(images)) return res.status(400).send('No images array');

    const timestamp = Date.now();
    const outputPath = join(__dirname, `video_${timestamp}.mp4`);
    const downloadedPaths = [];

    try {
        // 1. Скачивание
        for (let i = 0; i < images.length; i++) {
            console.log(`Downloading image ${i}...`);
            const response = await axios({ 
                url: images[i], 
                responseType: 'arraybuffer', 
                timeout: 30000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            const p = join(__dirname, `img_${timestamp}_${i}.jpg`);
            fs.writeFileSync(p, response.data);
            downloadedPaths.push(p);
        }

        if (downloadedPaths.length === 0) throw new Error('No images downloaded');

        // 2. Сборка видео через concat (самый надежный способ для длительности)
        const listPath = join(__dirname, `list_${timestamp}.txt`);
        const listContent = downloadedPaths.map(p => `file '${p}'\nduration 5`).join('\n');
        // По правилам concat нужно повторить последний файл
        fs.writeFileSync(listPath, listContent + `\nfile '${downloadedPaths[downloadedPaths.length-1]}'`);

        console.log('Starting FFmpeg processing...');
        ffmpeg()
            .input(listPath)
            .inputOptions(['-f concat', '-safe 0'])
            .outputOptions([
                '-c:v libx264',
                '-pix_fmt yuv420p',
                '-r 25',
                '-vf scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2',
                '-preset ultrafast',
                '-movflags +faststart'
            ])
            .on('error', (err) => {
                console.error('FFmpeg Error:', err.message);
                if (!res.headersSent) res.status(500).send(err.message);
            })
            .on('end', () => {
                console.log('✅ Video created!');
                res.download(outputPath, () => {
                    downloadedPaths.forEach(p => fs.existsSync(p) && fs.unlinkSync(p));
                    fs.existsSync(listPath) && fs.unlinkSync(listPath);
                    fs.existsSync(outputPath) && fs.unlinkSync(outputPath);
                });
            })
            .save(outputPath);

    } catch (e) {
        console.error('Critical Error:', e.message);
        if (!res.headersSent) res.status(500).send(e.message);
        downloadedPaths.forEach(p => fs.existsSync(p) && fs.unlinkSync(p));
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Port ${PORT}`));
