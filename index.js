import express from 'express';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import axios from 'axios';
import path from 'path';

const app = express();
app.use(express.json({ limit: '50mb' }));

app.get('/', (req, res) => res.send('COMPRESSION MODE ACTIVE 🛠️'));

app.post('/create-video', async (req, res) => {
    console.log('📨 Request received. Processing light images...');
    const { images } = req.body;
    const timestamp = Date.now();
    const workDir = path.resolve();
    const finalVideo = path.join(workDir, `out_${timestamp}.mp4`);
    const downloadedFiles = [];

    try {
        // 1. Скачивание (теперь летят легкие файлы)
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

        console.log('🎬 Starting light build...');
        
        ffmpeg(path.join(workDir, 'f_%d.jpg'))
            .inputOptions(['-framerate 1/5', '-start_number 0'])
            .outputOptions([
                '-c:v libx264',
                '-pix_fmt yuv420p',
                '-preset ultrafast', // Самый щадящий режим для RAM
                '-movflags +faststart'
            ])
            .on('error', (err) => {
                console.error('FFmpeg Error:', err.message);
                if (!res.headersSent) res.status(500).send(err.message);
            })
            .on('end', () => {
                console.log('✅ Success! Video sent.');
                res.download(finalVideo, () => {
                    // Чистка
                    downloadedFiles.forEach(f => fs.existsSync(f) && fs.unlinkSync(f));
                    if (fs.existsSync(finalVideo)) fs.unlinkSync(finalVideo);
                });
            })
            .save(finalVideo);

    } catch (e) {
        console.error('Global Error:', e.message);
        if (!res.headersSent) res.status(500).send(e.message);
        downloadedFiles.forEach(f => fs.existsSync(f) && fs.unlinkSync(f));
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Ready for light files on ${PORT}`));
