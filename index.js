import express from 'express';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import axios from 'axios';
import path from 'path';

const app = express();
app.use(express.json({ limit: '50mb' }));

app.get('/', (req, res) => res.send('SERVER IS LIVE'));

app.post('/create-video', async (req, res) => {
    console.log('--- START PROCESS ---');
    const { images } = req.body;
    const workDir = path.resolve();
    const timestamp = Date.now();
    const outputPath = path.join(workDir, `final_${timestamp}.mp4`);
    const downloadedFiles = [];

    try {
        // 1. Скачивание
        for (let i = 0; i < images.length; i++) {
            console.log(`Downloading: ${images[i]}`);
            const response = await axios({
                url: images[i],
                responseType: 'arraybuffer',
                timeout: 30000
            });
            const imgPath = path.join(workDir, `img_${timestamp}_${i}.jpg`);
            fs.writeFileSync(imgPath, response.data);
            downloadedFiles.push(imgPath);
        }

        // 2. Сборка видео через простейший фильтр
        console.log('🎬 FFmpeg building...');
        let command = ffmpeg();

        downloadedFiles.forEach(file => {
            command = command.input(file).inputOptions(['-loop 1', '-t 5']);
        });

        command
            .on('error', (err) => {
                console.error('FFmpeg Error:', err.message);
                if (!res.headersSent) res.status(500).send(err.message);
            })
            .on('end', () => {
                console.log('✅ Done! Sending file...');
                res.download(outputPath, () => {
                    // Чистка
                    downloadedFiles.forEach(f => fs.existsSync(f) && fs.unlinkSync(f));
                    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                });
            })
            .mergeToFile(outputPath, workDir);

    } catch (e) {
        console.error('Global Error:', e.message);
        if (!res.headersSent) res.status(500).send(e.message);
        downloadedFiles.forEach(f => fs.existsSync(f) && fs.unlinkSync(f));
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
