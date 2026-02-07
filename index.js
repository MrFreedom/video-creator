import express from 'express';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import axios from 'axios';
import path from 'path';

const app = express();
app.use(express.json({ limit: '50mb' }));

app.get('/', (req, res) => res.send('READY TO WORK ✅'));

app.post('/create-video', async (req, res) => {
    console.log('--- НОВЫЙ ЗАПУСК ---');
    const { images } = req.body;
    const timestamp = Date.now();
    const workDir = path.resolve();
    const finalVideo = path.join(workDir, `final_${timestamp}.mp4`);
    const downloadedFiles = [];

    try {
        // 1. Скачивание с жестким лимитом
        for (let i = 0; i < images.length; i++) {
            console.log(`Скачиваю: ${i}`);
            const response = await axios({
                url: images[i],
                responseType: 'arraybuffer',
                timeout: 10000
            });
            const imgPath = path.join(workDir, `img_${i}.jpg`);
            fs.writeFileSync(imgPath, response.data);
            downloadedFiles.push(imgPath);
        }

        // 2. Сборка БЕЗ сложных фильтров (самый легкий путь для CPU)
        console.log('🎬 Начинаю рендер...');
        ffmpeg()
            .input(path.join(workDir, 'img_%d.jpg'))
            .inputOptions(['-framerate 1/5', '-start_number 0'])
            .outputOptions([
                '-c:v libx264',
                '-pix_fmt yuv420p',
                '-preset superfast', // Чуть медленнее чем ultrafast, но надежнее для заголовков
                '-movflags +faststart', // Фиксит ошибку 0xc00d36e5
                '-r 25'
            ])
            .on('error', (err) => {
                console.error('FFmpeg Error:', err.message);
                if (!res.headersSent) res.status(500).send(err.message);
            })
            .on('end', () => {
                console.log('✅ Видео готово!');
                res.download(finalVideo, (err) => {
                    // Чистка ПОСЛЕ отправки
                    downloadedFiles.forEach(f => fs.existsSync(f) && fs.unlinkSync(f));
                    if (fs.existsSync(finalVideo)) fs.unlinkSync(finalVideo);
                });
            })
            .save(finalVideo);

    } catch (e) {
        console.error('Критический сбой:', e.message);
        if (!res.headersSent) res.status(500).send(e.message);
        downloadedFiles.forEach(f => fs.existsSync(f) && fs.unlinkSync(f));
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
