import express from 'express';
import { spawn } from 'child_process';
import fs from 'fs';
import axios from 'axios';
import path from 'path';

const app = express();
app.use(express.json({ limit: '50mb' }));

app.get('/', (req, res) => res.send('LOW_RAM_MODE ✅'));

app.post('/create-video', async (req, res) => {
    const { images } = req.body;
    const workDir = path.resolve();
    const timestamp = Date.now();
    const finalVideo = path.join(workDir, `min_${timestamp}.mp4`);
    const downloadedFiles = [];

    try {
        console.log('--- LOW RAM START ---');
        for (let i = 0; i < images.length; i++) {
            const response = await axios({ url: images[i], responseType: 'arraybuffer' });
            const imgPath = path.join(workDir, `f_${i}.jpg`);
            fs.writeFileSync(imgPath, response.data);
            downloadedFiles.push(imgPath);
        }

        // Прямой вызов FFmpeg через spawn (минус 50-100МБ потребления RAM)
        const ffmpegArgs = [
            '-y',
            '-framerate', '1/5',
            '-i', path.join(workDir, 'f_%d.jpg'),
            '-c:v', 'libx264',
            '-r', '25',
            '-pix_fmt', 'yuv420p',
            '-preset', 'ultrafast',
            '-movflags', '+faststart',
            finalVideo
        ];

        const process = spawn('ffmpeg', ffmpegArgs);

        process.stderr.on('data', (data) => console.log(`FFmpeg: ${data}`));

        process.on('close', (code) => {
            if (code === 0) {
                console.log('✅ Video Created!');
                res.download(finalVideo, () => {
                    downloadedFiles.forEach(f => fs.existsSync(f) && fs.unlinkSync(f));
                    if (fs.existsSync(finalVideo)) fs.unlinkSync(finalVideo);
                });
            } else {
                res.status(500).send(`FFmpeg exited with code ${code}`);
            }
        });

    } catch (e) {
        console.error(e.message);
        res.status(500).send(e.message);
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Low RAM mode on ${PORT}`));
