import express from 'express';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import axios from 'axios';
import path from 'path';

const app = express();
app.use(express.json({ limit: '50mb' }));

app.get('/', (req, res) => res.send('MINIMAL SERVER UP ✅'));

app.post('/create-video', async (req, res) => {
    console.log('📨 Request received');
    const { images } = req.body;
    const timestamp = Date.now();
    const workDir = path.resolve();
    const finalVideo = path.join(workDir, `out_${timestamp}.mp4`);
    const downloadedFiles = [];

    try {
        // 1. Скачивание (без изменений)
        for (let i = 0; i < images.length; i++) {
            const response = await axios({ 
                url: images[i], 
                responseType: 'arraybuffer', 
                timeout: 10000 
            });
            const imgPath = path.join(workDir, `f_${i}.jpg`);
            fs.writeFileSync(imgPath, response.data);
            downloadedFiles.push(imgPath);
        }

        // 2. Ультра-минималистичный FFmpeg
        console.log('🎬 Starting minimal build...');
        
        let command = ffmpeg();

        // Добавляем входы по одному, это стабильнее для RAM
        downloadedFiles.forEach(file => {
            command.input(file).inputOptions(['-loop 1', '-t 5']);
        });

        command
            .outputOptions([
                '-c:v libx264',
                '-pix_fmt yuv420p',
                '-preset ultrafast', // Самый быстрый и легкий для RAM
                '-tune stillimage',  // Оптимизация под слайдшоу
                '-movflags +faststart'
            ])
            .on('start', (cmd) => console.log('FFmpeg command line:', cmd))
            .on('error', (err) => {
                console.error('FFmpeg Error:', err.message);
                if (!res.headersSent) res.status(500).send(err.message);
            })
            .on('end', () => {
                console.log('✅ Success!');
                res.download(finalVideo, () => {
                    downloadedFiles.forEach(f => fs.existsSync(f) && fs.unlinkSync(f));
                    if (fs.existsSync(finalVideo)) fs.unlinkSync(finalVideo);
                });
            })
            .mergeToFile(finalVideo, workDir); // Используем merge, так как он лучше распределяет память

    } catch (e) {
        console.error('Global Error:', e.message);
        if (!res.headersSent) res.status(500).send(e.message);
        downloadedFiles.forEach(f => fs.existsSync(f) && fs.unlinkSync(f));
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Live on ${PORT}`));
