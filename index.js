import express from 'express';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json());

app.get('/', (req, res) => res.send('SERVER IS READY'));

app.post('/create-video', async (req, res) => {
    const { images } = req.body;
    if (!images || !Array.isArray(images)) return res.status(400).send('No images');

    const timestamp = Date.now();
    const tempImage = join(__dirname, `temp_${timestamp}.jpg`);
    const outputPath = join(__dirname, `out_${timestamp}.mp4`);

    try {
        // Берем ТОЛЬКО ПЕРВУЮ картинку для теста стабильности
        console.log('Downloading image...');
        const response = await axios({ url: images[0], responseType: 'arraybuffer', timeout: 20000 });
        fs.writeFileSync(tempImage, response.data);

        console.log('Starting FFmpeg...');
        ffmpeg(tempImage)
            .inputOptions(['-loop 1', '-t 5']) // Зациклить на 5 секунд
            .outputOptions([
                '-c:v libx264',
                '-pix_fmt yuv420p',
                '-vf scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2'
            ])
            .on('error', (err) => {
                console.error(err.message);
                res.status(500).send(err.message);
            })
            .on('end', () => {
                res.download(outputPath, () => {
                    if (fs.existsSync(tempImage)) fs.unlinkSync(tempImage);
                    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                });
            })
            .save(outputPath);

    } catch (e) {
        res.status(500).send(e.message);
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Running on ${PORT}`));
