import express from 'express';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import axios from 'axios';
import path from 'path';

const app = express();
app.use(express.json({ limit: '50mb' }));

app.post('/create-video', async (req, res) => {
    const { images } = req.body;
    const workDir = path.resolve();
    const timestamp = Date.now();
    const videoPath = path.join(workDir, `video_${timestamp}.mp4`);
    const listPath = path.join(workDir, `list_${timestamp}.txt`);
    const downloadedFiles = [];

    try {
        console.log('--- START PROCESS ---');
        // 1. Скачивание с проверкой
        for (let i = 0; i < images.length; i++) {
            const response = await axios({
                url: images[i],
                responseType: 'arraybuffer',
                timeout: 15000,
                headers: { 'Accept': 'image/*' }
            });
            const imgPath = path.join(workDir, `img_${timestamp}_${i}.jpg`);
            fs.writeFileSync(imgPath, response.data);
            downloadedFiles.push(imgPath);
            console.log(`Image ${i} saved`);
        }

        // 2. Создание файла-списка для FFmpeg (гарантия длительности)
        let listData = '';
        downloadedFiles.forEach(file => {
            listData += `file '${file}'\nduration 5\n`;
        });
        // FFmpeg требует повторения последнего файла без duration
        listData += `file '${downloadedFiles[downloadedFiles.length - 1]}'`;
        fs.writeFileSync(listPath, listData);

        // 3. Команда FFmpeg
        ffmpeg()
            .input(listPath)
            .inputOptions(['-f concat', '-safe 0'])
            .outputOptions([
                '-c:v libx264',
                '-pix_fmt yuv420p',
                '-preset superfast',
                '-vf scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2'
            ])
            .on('error', (err) => {
                console.error('FFmpeg error:', err.message);
                res.status(500).send(err.message);
            })
            .on('end', () => {
                console.log('Video ready!');
                res.download(videoPath, () => {
                    // Удаляем мусор
                    downloadedFiles.forEach(f => fs.existsSync(f) && fs.unlinkSync(f));
                    if (fs.existsSync(listPath)) fs.unlinkSync(listPath);
                    if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
                });
            })
            .save(videoPath);

    } catch (e) {
        console.error('General error:', e.message);
        res.status(500).send(e.message);
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server live on ${PORT}`));
