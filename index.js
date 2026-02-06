import express from 'express';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import axios from 'axios';
import path from 'path';

const app = express();
app.use(express.json({ limit: '50mb' }));

app.get('/', (req, res) => res.send('SERVER IS READY ✅'));

app.post('/create-video', async (req, res) => {
    console.log('📨 Request received');
    const { images } = req.body;
    if (!images || !Array.isArray(images)) return res.status(400).send('No images');

    const timestamp = Date.now();
    const workDir = path.resolve();
    const outputPath = path.join(workDir, `final_${timestamp}.mp4`);
    const listPath = path.join(workDir, `list_${timestamp}.txt`);
    const downloadedPaths = [];

    try {
        // 1. Скачивание (даем файлам УНИКАЛЬНЫЕ полные имена)
        for (let i = 0; i < images.length; i++) {
            console.log(`Downloading ${i}...`);
            const response = await axios({ url: images[i], responseType: 'arraybuffer', timeout: 20000 });
            const p = path.join(workDir, `file_${timestamp}_${i}.jpg`);
            fs.writeFileSync(p, response.data);
            downloadedPaths.push(p);
        }

        // 2. Создаем файл-список для FFmpeg
        // Важно: в конце каждой строки duration, а последний файл повторяется (специфика concat)
        let listContent = '';
        downloadedPaths.forEach(p => {
            listContent += `file '${p}'\nduration 5\n`;
        });
        listContent += `file '${downloadedPaths[downloadedPaths.length - 1]}'`;
        fs.writeFileSync(listPath, listContent);

        console.log('🎬 FFmpeg processing with concat demuxer...');
        
        ffmpeg()
            .input(listPath)
            .inputOptions(['-f concat', '-safe 0'])
            .outputOptions([
                '-c:v libx264',      // Кодек
                '-pix_fmt yuv420p',  // Совместимость с плеерами
                '-r 25',             // Частота кадров
                '-vf scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2',
                '-movflags +faststart' // Чтобы видео сразу открывалось
            ])
            .on('error', (err) => {
                console.error('FFmpeg Error:', err.message);
                if (!res.headersSent) res.status(500).send(err.message);
            })
            .on('end', () => {
                console.log('✅ Video Done!');
                res.download(outputPath, () => {
                    // Тщательная чистка
                    downloadedPaths.forEach(p => fs.existsSync(p) && fs.unlinkSync(p));
                    if (fs.existsSync(listPath)) fs.unlinkSync(listPath);
                    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                });
            })
            .save(outputPath);

    } catch (e) {
        console.error('General Error:', e.message);
        if (!res.headersSent) res.status(500).send(e.message);
        downloadedPaths.forEach(p => fs.existsSync(p) && fs.unlinkSync(p));
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Running on port ${PORT}`));
