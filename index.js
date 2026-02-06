import express from 'express';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import axios from 'axios';
import path from 'path';

const app = express();
app.use(express.json({ limit: '50mb' }));

app.get('/', (req, res) => res.send('SERVER IS LIVE ✅'));

app.post('/create-video', async (req, res) => {
    console.log('--- СТАРТ НОВОЙ СБОРКИ ---');
    const { images } = req.body;
    const workDir = path.resolve();
    const timestamp = Date.now();
    const tempVideo = path.join(workDir, `temp_${timestamp}.mkv`);
    const finalVideo = path.join(workDir, `final_${timestamp}.mp4`);
    const downloadedFiles = [];

    try {
        // 1. Скачивание
        for (let i = 0; i < images.length; i++) {
            const response = await axios({
                url: images[i],
                responseType: 'arraybuffer',
                timeout: 20000
            });
            const imgPath = path.join(workDir, `img_${i}.jpg`);
            fs.writeFileSync(imgPath, response.data);
            downloadedFiles.push(imgPath);
        }

        // 2. Сборка через pipe, чтобы гарантировать запись заголовков
        console.log('🎬 Запуск FFmpeg...');
        ffmpeg()
            .input(path.join(workDir, 'img_%d.jpg'))
            .inputOptions(['-framerate 1/5', '-start_number 0'])
            .outputOptions([
                '-c:v libx264',
                '-pix_fmt yuv420p',
                '-preset ultrafast',
                '-movflags +faststart+frag_keyframe+space_size', // Максимальная фиксация структуры
                '-vf scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2'
            ])
            .on('error', (err) => {
                console.error('FFmpeg Error:', err.message);
                if (!res.headersSent) res.status(500).send(err.message);
            })
            .on('end', () => {
                console.log('✅ Видео готово!');
                res.download(finalVideo, () => {
                    // Чистка
                    downloadedFiles.forEach(f => fs.existsSync(f) && fs.unlinkSync(f));
                    if (fs.existsSync(finalVideo)) fs.unlinkSync(finalVideo);
                });
            })
            .save(finalVideo);

    } catch (e) {
        console.error('Ошибка:', e.message);
        if (!res.headersSent) res.status(500).send(e.message);
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`READY ON ${PORT}`));
