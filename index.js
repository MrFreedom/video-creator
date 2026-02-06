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

app.post('/create-video', async (req, res) => {
  const { images } = req.body;
  if (!images || !Array.isArray(images)) return res.status(400).send('No images');

  const imagePaths = [];
  const timestamp = Date.now();
  const outputPath = join(__dirname, `out_${timestamp}.mp4`);

  try {
    // 1. Скачивание
    for (let i = 0; i < images.length; i++) {
      const response = await axios({ url: images[i], responseType: 'arraybuffer', timeout: 30000 });
      const p = join(__dirname, `img_${timestamp}_${i}.jpg`);
      fs.writeFileSync(p, response.data);
      imagePaths.push(p);
    }

    // 2. Сборка видео (Новая логика длительности)
    const command = ffmpeg();

    imagePaths.forEach(path => {
      // ПРИНУДИТЕЛЬНО: Каждая картинка зацикливается на 5 секунд
      command.input(path).loop(5); 
    });

    command
      .fps(25)
      .outputOptions([
        '-c:v libx264',
        '-pix_fmt yuv420p',
        '-preset ultrafast',
        '-shortest' // Остановить поток, когда картинки кончатся
      ])
      .on('error', (err) => res.status(500).send(err.message))
      .on('end', () => {
        res.download(outputPath, () => {
          imagePaths.forEach(p => fs.unlinkSync(p));
          fs.unlinkSync(outputPath);
        });
      })
      .mergeToFile(outputPath, __dirname); // Склеиваем входы в один файл

  } catch (e) {
    res.status(500).send(e.message);
    imagePaths.forEach(p => { if(fs.existsSync(p)) fs.unlinkSync(p) });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
