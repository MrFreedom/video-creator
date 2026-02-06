import express from 'express';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import axios from 'axios';
import path from 'path';

const app = express();
app.use(express.json({ limit: '50mb' }));

app.get('/', (req, res) => res.send('SERVER IS LIVE'));

app.post('/create-video', async (req, res) => {
    const { images } = req.body;
    const workDir = path.resolve();
    const timestamp = Date.now();
    const outputPath = path.join(workDir, `video_${timestamp}.mp4`);
    const downloadedFiles = [];

    try {
        console.log('--- START ---');
        for (let i = 0; i < images.length; i++) {
            const response = await axios({
                url: images[i],
                responseType: 'arraybuffer',
                timeout: 15000
            });
            const imgPath = path.join(workDir, `i_${i}.jpg`);
            fs.writeFileSync(imgPath, response.data);
            downloadedFiles.push(imgPath);
        }

        console.log('--- FFMPEG START ---');
        ffmpeg()
            .input(path.join(workDir, 'i_%d.jpg'))
            .inputOptions(['-framerate 1/5', '-start_number 0'])
            .outputOptions([
                '-c:v libx264',
                '-r 25',
                '-pix_fmt yuv420p',
                '-vf scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2',
                '-movflags +faststart'
            ])
            .on('error', (err) => {
                console.error(err.message);
                if (!res.headersSent) res.status(500).send(err.message);
            })
            .on('end', () => {
                console.log('--- DONE ---');
                res.download(outputPath, () => {
                    downloadedFiles.forEach(f => fs.existsSync(f) && fs.unlinkSync(f));
                    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                });
            })
            .save(outputPath);

    } catch (e) {
        console.error(e.message);
        if (!res.headersSent) res.status(500).send(e.message);
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`READY ON ${PORT}`));
