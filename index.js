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

app.get('/', (req, res) => res.send('Server is alive! 🚀'));

app.post('/create-video', async (req, res) => {
  console.log('📨 Request received');
  const { images } = req.body;
  
  if (!images || !Array.isArray(images)) return res.status(400).send('No images');

  const imagePaths = [];
  const timestamp = Date.now();
  const outputPath = join(__dirname, `out_${timestamp}.mp4`);

  try {
    // 1. Скачивание
    for (let i = 0; i < images.length; i++) {
      try {
        const response = await axios({ url: images[i], responseType: 'arraybuffer', timeout: 30000 });
        const p = join(__dirname, `img_${timestamp}_${i}.jpg`);
        fs.writeFileSync(p, response.data);
        imagePaths.push(p);
      } catch (err) {
        console.error(`Download failed for image ${i}`);
      }
    }

    if (imagePaths.length === 0) return res.status(400).send('No images downloaded');

    // 2. Сборка через конкатенацию (самый стабильный метод)
    const command = ffmpeg();

    imagePaths.forEach(path => {
      command.input(path).loop(5); // 5 секунд на слайд
    });

    command
      .fps(25)
      .outputOptions([
        '-c:v libx264',
        '-pix_fmt yuv420p',
        '-preset ultrafast',
        '-shortest', // Важно для предотвращения бесконечного цикла
        '-vf scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2'
      ])
      .on('start', (cmd) => console.log('FFmpeg started:', cmd))
      .on('error', (err) => {
        console.error('FFmpeg Error:', err.message);
        if (!res.headersSent) res.status(500).send(err.message);
      })
      .on('end', () => {
        console.log('✅ Success!');
        res.download(outputPath, () => {
          imagePaths.forEach(p => { if (fs.existsSync(p)) fs.unlinkSync(p) });
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        });
      })
      .save(outputPath); // Используем .save() вместо .mergeToFile()

  } catch (e) {
    console.error('General Error:', e.message);
    if (!res.headersSent) res.status(500).send(e.message);
    imagePaths.forEach(p => { if (fs.existsSync(p)) fs.unlinkSync(p) });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Port ${PORT}`));
