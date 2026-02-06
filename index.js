import express from 'express';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json({ limit: '50mb' }));

app.get('/', (req, res) => res.send('✅ Сервер онлайн! Жду POST запрос.'));

app.post('/create-video', async (req, res) => {
    console.log('📨 Request received');
    const { images } = req.body;
    if (!images || !Array.isArray(images)) return res.status(400).send('No images');

    const imagePaths = [];
    const timestamp = Date.now();
    const outputPath = join(__dirname, `out_${timestamp}.mp4`);

    try {
        // 1. Качаем картинки
        for (let i = 0; i < images.length; i++) {
            const response = await axios({ url: images[i], responseType: 'arraybuffer', timeout: 30000 });
            const p = join(__dirname, `img_${timestamp}_${i}.jpg`);
            fs.writeFileSync(p, response.data);
            imagePaths.push(p);
        }

        // 2. Собираем видео через concat-список (самый легкий способ для ОЗУ)
        const listPath = join(__dirname, `list_${timestamp}.txt`);
        // Создаем файл списка для FFmpeg: одна картинка = 5 секунд
        const listContent = imagePaths.map(p => `file '${p}'\nduration 5`).join('\n');
        fs.writeFileSync(listPath, listContent + `\nfile '${imagePaths[imagePaths.length-1]}'`); 

        ffmpeg()
            .input(listPath)
            .inputOptions(['-f concat', '-safe 0'])
            .outputOptions([
                '-c:v libx264',
                '-pix_fmt yuv420p',
                '-r 25',
                '-vf scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2',
                '-preset ultrafast'
            ])
            .on('error', (err) => {
                console.error('FFmpeg Error:', err.message);
                if (!res.headersSent) res.status(500).send(err.message);
            })
            .on('end', () => {
                res.download(outputPath, () => {
                    imagePaths.forEach(p => fs.unlinkSync(p));
                    fs.unlinkSync(listPath);
                    fs.unlinkSync(outputPath);
                });
            })
            .save(outputPath);

    } catch (e) {
        console.error('Error:', e.message);
        if (!res.headersSent) res.status(500).send(e.message);
        imagePaths.forEach(p => { if (fs.existsSync(p)) fs.unlinkSync(p) });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Ready on ${PORT}`));
