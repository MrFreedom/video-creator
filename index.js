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

// Роут для проверки, что сервер вообще дышит
app.get('/', (req, res) => res.send('Server is alive! 🚀'));

app.post('/create-video', async (req, res) => {
  console.log('📨 Request received at:', new Date().toISOString());
  const { images } = req.body; // Упростили: берем только массив ссылок
  
  if (!images || !Array.isArray(images) || images.length === 0) {
    return res.status(400).send('Error: No images array provided');
  }

  const imagePaths = [];
  const outputPath = join(__dirname, `video_${Date.now()}.mp4`);

  try {
    // 1. Скачивание (максимально агрессивное, с таймаутом 30с)
    for (let i = 0; i < images.length; i++) {
      try {
        console.log(`Downloading [${i}]: ${images[i].substring(0, 50)}...`);
        const response = await axios({ 
          url: images[i], 
          responseType: 'arraybuffer', 
          timeout: 30000,
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const p = join(__dirname, `img_${i}_${Date.now()}.jpg`);
        fs.writeFileSync(p, response.data);
        imagePaths.push(p);
      } catch (err) {
        console.error(`Failed to download image ${i}:`, err.message);
      }
    }

    if (imagePaths.length === 0) {
      return res.status(400).send('Error: Failed to download any images');
    }

    // 2. Сборка видео (каждый слайд по 5 секунд, разрешение 720p)
    console.log('🎬 Starting FFmpeg for', imagePaths.length, 'images');
    const command = ffmpeg();
    
    imagePaths.forEach(path => {
      command.input(path).loop(5); 
    });

    command
      .fps(25)
      .outputOptions([
        '-c:v libx264',
        '-pix_fmt yuv420p',
        '-preset ultrafast',
        '-vf scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2'
      ])
      .on('error', (err) => {
        console.error('FFmpeg Error:', err.message);
        if (!res.headersSent) res.status(500).send('Video encoding failed: ' + err.message);
      })
      .on('end', () => {
        console.log('✅ Video created successfully');
        res.download(outputPath, () => {
          // Чистим файлы ПОСЛЕ отправки
          imagePaths.forEach(p => { if (fs.existsSync(p)) fs.unlinkSync(p) });
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        });
      })
      .mergeToFile(outputPath, __dirname);

  } catch (e) {
    console.error('Critical Error:', e.message);
    if (!res.headersSent) res.status(500).send(e.message);
    imagePaths.forEach(p => { if (fs.existsSync(p)) fs.unlinkSync(p) });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
