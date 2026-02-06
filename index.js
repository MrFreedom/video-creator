import express from 'express';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import axios from 'axios';
import path from 'path';

const app = express();
app.use(express.json({ limit: '50mb' }));

app.get('/', (req, res) => res.send('SERVER IS LIVE ✅'));

app.post('/create-video', async (req, res) => {
    console.log('📨 Request started...');
    const { images } = req.body;
    if (!images || !Array.isArray(images)) return res.status(400).send('No images');

    const timestamp = Date.now();
    const workDir = path.resolve();
    const outputPath = path.join(workDir, `final_${timestamp}.mp4`);
    const downloadedPaths = [];

    try {
        // 1. Скачивание
        for (let i = 0; i < images.length; i++) {
            console.log(`Downloading image ${i}...`);
            const response = await axios({ 
                url: images[i], 
                responseType: 'arraybuffer', 
                timeout: 15000 
            });
            const p = path.join(workDir, `img_${i}.jpg`); // Имена img_0.jpg, img_1.jpg...
            fs.writeFileSync(p, response.data);
            downloadedPaths.push(p);
        }

        // 2. Сборка видео (Метод "одной строки")
        console.log('🎬 FFmpeg processing...');
        
        // Магия тут: -framerate 1/5 значит 1 кадр в 5 секунд
        ffmpeg(path.join(workDir, 'img_%d.jpg'))
            .inputOptions(['-framerate 1/5', '-start_number 0'])
            .outputOptions([
                '-c:v libx264',
                '-r 25',
                '-pix_fmt yuv420p',
                '-vf scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2',
                '-movflags +faststart'
            ])
            .on('error', (err) => {
                console.error('FFmpeg Error:', err.message);
                res.status(500).send(err.message);
            })
            .on('end', () => {
                console.log('✅ Video Done!');
                res.download(outputPath, () => {
                    // Чистка
                    downloadedPaths.forEach(p => fs.existsSync(p) && fs.unlinkSync(p));
                    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                });
            })
            .save(outputPath);

    } catch (e) {
        console.error('Error:', e.message);
        res.status(500).send(e.message);
        downloadedPaths.forEach(p => fs.existsSync(p) && fs.unlinkSync(p));
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Ready on port ${PORT}`));
