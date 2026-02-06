import express from 'express';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import axios from 'axios';
import path from 'path';

const app = express();
app.use(express.json({ limit: '50mb' }));

app.get('/', (req, res) => res.send('SERVER IS BACK ON 🚀'));

app.post('/create-video', async (req, res) => {
    const { images } = req.body;
    const timestamp = Date.now();
    const workDir = path.resolve();
    const outputPath = path.join(workDir, `out_${timestamp}.mp4`);
    const downloadedFiles = [];

    try {
        console.log('--- START ---');
        for (let i = 0; i < images.length; i++) {
            const response = await axios({
                url: images[i],
                responseType: 'arraybuffer',
                timeout: 20000
            });
            const imgPath = path.join(workDir, `img_${timestamp}_${i}.jpg`);
            fs.writeFileSync(imgPath, response.data);
            downloadedFiles.push(imgPath);
        }

        // Самый примитивный метод сборки, который давал тебе 1.53МБ
        const command = ffmpeg();
        downloadedFiles.forEach(file => {
            command.input(file).inputOptions(['-loop 1', '-t 5']);
        });

        command
            .fps(25)
            .outputOptions([
                '-c:v libx264',
                '-pix_fmt yuv420p',
                '-preset ultrafast',
                '-movflags +faststart'
            ])
            .on('error', (err) => {
                console.error(err.message);
                res.status(500).send(err.message);
            })
            .on('end', () => {
                res.download(outputPath, () => {
                    downloadedFiles.forEach(f => fs.existsSync(f) && fs.unlinkSync(f));
                    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                });
            })
            .mergeToFile(outputPath, workDir);

    } catch (e) {
        res.status(500).send(e.message);
        downloadedFiles.forEach(f => fs.existsSync(f) && fs.unlinkSync(f));
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Ready on ${PORT}`));
