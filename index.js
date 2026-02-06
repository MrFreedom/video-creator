import express from 'express';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import axios from 'axios';
import path from 'path';

const app = express();
app.use(express.json({ limit: '50mb' }));

app.get('/', (req, res) => res.send('Server is Up! ✅'));

app.post('/create-video', async (req, res) => {
    console.log('📨 Request received');
    const { images } = req.body;
    if (!images || !Array.isArray(images)) return res.status(400).send('No images');

    const timestamp = Date.now();
    const workDir = path.resolve();
    const outputPath = path.join(workDir, `final_${timestamp}.mp4`);
    const downloadedPaths = [];

    try {
        // 1. Скачивание
        for (let i = 0; i < images.length; i++) {
            console.log(`Downloading ${i}...`);
            const response = await axios({ 
                url: images[i], 
                responseType: 'arraybuffer', 
                timeout: 20000 
            });
            const p = path.join(workDir, `img_${timestamp}_${i}.jpg`);
            fs.writeFileSync(p, response.data);
            downloadedPaths.push(p);
        }

        // 2. Сборка видео
        console.log('🎬 Starting FFmpeg build...');
        const command = ffmpeg();

        // Добавляем каждый файл как отдельный вход с длительностью 5 секунд
        downloadedPaths.forEach(p => {
            command.input(p).inputOptions(['-loop 1', '-t 5']);
        });

        command
            .fps(25)
            .complexFilter([
                // Склеиваем входы (n = кол-во картинок)
                `concat=n=${downloadedPaths.length}:v=1:a=0 [v]`,
                // Принудительно задаем формат пикселей для совместимости с плеерами
                '[v]format=yuv420p[out]'
            ], 'out')
            .outputOptions([
                '-c:v libx264',
                '-preset ultrafast',
                '-movflags +faststart', // Позволяет видео начать играть до полной загрузки
                '-aspect 16:9'
            ])
            .on('error', (err) => {
                console.error('FFmpeg Error:', err.message);
                res.status(500).send(err.message);
            })
            .on('end', () => {
                console.log('✅ Video generated successfully!');
                res.download(outputPath, () => {
                    // Чистка после отправки
                    downloadedPaths.forEach(p => fs.existsSync(p) && fs.unlinkSync(p));
                    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                });
            })
            .save(outputPath);

    } catch (e) {
        console.error('Critical Error:', e.message);
        res.status(500).send(e.message);
        downloadedPaths.forEach(p => fs.existsSync(p) && fs.unlinkSync(p));
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
